from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Dict, List

import torch

from .calibration import fit_temperature
from .dataset import read_jsonl
from .model import AERCoreModel, answer_candidates, build_candidate_text, load_tokenizer
from .schema import validate_records


def main() -> None:
    parser = argparse.ArgumentParser(description="Fit validation-only AER-Core temperature calibration.")
    parser.add_argument("--dataset", required=True, help="Validation JSONL only.")
    parser.add_argument("--checkpoint-dir", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    records = validate_records(read_jsonl(args.dataset))
    model = AERCoreModel(args.checkpoint_dir)
    model.scorer.load_state_dict(
        torch.load(Path(args.checkpoint_dir) / "aer_core_scorer.pt", map_location="cpu")
    )
    model.eval()
    tokenizer = load_tokenizer(args.checkpoint_dir)

    logits_by_mode: Dict[str, List[torch.Tensor]] = defaultdict(list)
    targets_by_mode: Dict[str, List[int]] = defaultdict(list)

    for record in records:
        raw = {"input": record.input}
        for question, gold in zip(record.input["questions"], record.gold_answers):
            group = answer_candidates(question, gold)
            texts = [
                build_candidate_text(raw, question, candidate)
                for candidate in group.candidates
            ]
            encoded = tokenizer(
                texts,
                padding=True,
                truncation=True,
                return_tensors="pt",
            )
            with torch.no_grad():
                logits = model(
                    encoded["input_ids"],
                    encoded["attention_mask"],
                    [len(texts)],
                )[0]
            logits_by_mode[group.mode].append(logits.cpu())
            targets_by_mode[group.mode].append(group.target_index)

    temperatures = {}
    for mode, groups in logits_by_mode.items():
        temperatures[mode] = fit_temperature(
            groups,
            targets_by_mode[mode],
        )

    result = {
        "schemaVersion": "aer-core-calibration-v1",
        "fitSplit": "validation",
        "checkpointDir": str(args.checkpoint_dir),
        "temperatures": temperatures,
    }
    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(result, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
