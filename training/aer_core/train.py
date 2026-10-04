from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import List

import torch
from torch.nn import functional as F
from transformers import get_linear_schedule_with_warmup

from .dataset import deterministic_split, read_jsonl, training_dict
from .model import (
    AERCoreModel,
    answer_candidates,
    build_candidate_text,
    load_tokenizer,
)
from .schema import validate_records


def seed_everything(seed: int) -> None:
    random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def train(args: argparse.Namespace) -> None:
    seed_everything(args.seed)

    records = validate_records(read_jsonl(args.dataset))
    partitions = deterministic_split(records)
    if not partitions["train"] or not partitions["validation"] or not partitions["test"]:
        raise RuntimeError(
            "train/validation/test partitions must all be non-empty; "
            "use a larger verified dataset"
        )

    tokenizer = load_tokenizer(args.base_model)
    if tokenizer.pad_token is None:
        if tokenizer.eos_token is None:
            raise RuntimeError("tokenizer requires pad_token or eos_token")
        tokenizer.pad_token = tokenizer.eos_token

    model = AERCoreModel(args.base_model)
    model.encoder.config.pad_token_id = tokenizer.pad_token_id

    optimizer = torch.optim.AdamW(
        model.parameters(),
        lr=args.learning_rate,
        weight_decay=args.weight_decay,
    )
    total_steps = max(1, len(partitions["train"]) * args.epochs)
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=max(1, total_steps // 10),
        num_training_steps=total_steps,
    )

    model.train()
    history: List[dict] = []

    for epoch in range(args.epochs):
        total_loss = 0.0

        # One forward pass covers all candidates from all questions in a record.
        for record in partitions["train"]:
            raw = training_dict(record)
            texts: List[str] = []
            group_sizes: List[int] = []
            targets: List[int] = []

            for question, gold in zip(
                raw["input"]["questions"],
                raw["goldAnswers"],
            ):
                group = answer_candidates(question, gold)
                group_sizes.append(len(group.candidates))
                targets.append(group.target_index)
                texts.extend(
                    build_candidate_text(raw, question, candidate)
                    for candidate in group.candidates
                )

            encoded = tokenizer(
                texts,
                padding=True,
                truncation=True,
                max_length=args.max_length,
                return_tensors="pt",
            )

            optimizer.zero_grad(set_to_none=True)
            logits_groups = model(
                encoded["input_ids"],
                encoded["attention_mask"],
                group_sizes,
            )

            losses = [
                F.cross_entropy(
                    logits.unsqueeze(0),
                    torch.tensor([target], dtype=torch.long),
                )
                for logits, target in zip(logits_groups, targets)
            ]
            loss = torch.stack(losses).mean()
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            scheduler.step()
            total_loss += float(loss.detach())

        epoch_report = {
            "epoch": epoch + 1,
            "meanLoss": total_loss / max(1, len(partitions["train"])),
        }
        history.append(epoch_report)
        print(json.dumps(epoch_report))

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    model.encoder.save_pretrained(output_dir, safe_serialization=True)
    tokenizer.save_pretrained(output_dir)
    torch.save(
        model.scorer.state_dict(),
        output_dir / "aer_core_scorer.pt",
    )

    manifest = {
        "schemaVersion": "aer-core-checkpoint-v1",
        "baseModel": args.base_model,
        "seed": args.seed,
        "epochs": args.epochs,
        "learningRate": args.learning_rate,
        "weightDecay": args.weight_decay,
        "maxLength": args.max_length,
        "datasetVersion": records[0].dataset_version,
        "trainCount": len(partitions["train"]),
        "validationCount": len(partitions["validation"]),
        "testCount": len(partitions["test"]),
        "history": history,
        "calibrationStatus": "NOT_FITTED",
        "productionAuthority": False,
        "shadowOnly": True,
    }
    (output_dir / "checkpoint_manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True),
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train the ShortForge AER Decision Core.",
    )
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--base-model", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--learning-rate", type=float, default=2e-5)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--max-length", type=int, default=512)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


if __name__ == "__main__":
    train(parse_args())
