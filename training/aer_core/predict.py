from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any, Dict, List

import torch

from .dataset import read_jsonl
from .model import AERCoreModel, answer_candidates, build_candidate_text, load_tokenizer
from .schema import validate_records


def load_temperatures(path: str | None) -> Dict[str, float]:
    if path is None:
        return {}
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    return {str(k): float(v) for k, v in value.get("temperatures", {}).items()}


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Run AER-Core inference and emit benchmark predictions."
    )
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--checkpoint-dir", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--temperatures")
    parser.add_argument("--device", default=None)
    args = parser.parse_args()

    records = validate_records(read_jsonl(args.dataset))
    device = torch.device(
        args.device or ("cuda" if torch.cuda.is_available() else "cpu")
    )

    model = AERCoreModel(args.checkpoint_dir).to(device)
    scorer_path = Path(args.checkpoint_dir) / "aer_core_scorer.pt"
    model.scorer.load_state_dict(
        torch.load(
            scorer_path,
            map_location=device,
            weights_only=True,
        )
    )
    model.eval()

    tokenizer = load_tokenizer(args.checkpoint_dir)
    if tokenizer.pad_token is None:
        if tokenizer.eos_token is None:
            raise RuntimeError("tokenizer requires pad_token or eos_token")
        tokenizer.pad_token = tokenizer.eos_token

    temperatures = load_temperatures(args.temperatures)
    rows: List[Dict[str, Any]] = []

    for record in records:
        raw = {
            "input": record.input,
            "goldAnswers": list(record.gold_answers),
        }
        for question, gold in zip(
            record.input["questions"],
            record.gold_answers,
        ):
            group = answer_candidates(question, gold)
            texts = [
                build_candidate_text(raw, question, candidate)
                for candidate in group.candidates
            ]

            started = time.perf_counter()
            encoded = tokenizer(
                texts,
                padding=True,
                truncation=True,
                return_tensors="pt",
            )
            encoded = {
                key: value.to(device)
                for key, value in encoded.items()
            }
            with torch.no_grad():
                logits = model(
                    encoded["input_ids"],
                    encoded["attention_mask"],
                    [len(texts)],
                )[0]
            latency_ms = (time.perf_counter() - started) * 1000.0

            temperature = max(
                temperatures.get(group.mode, 1.0),
                0.05,
            )
            probabilities = torch.softmax(
                logits / temperature,
                dim=-1,
            ).detach().cpu().tolist()
            selected_index = max(
                range(len(probabilities)),
                key=lambda index: probabilities[index],
            )
            confidence = float(probabilities[selected_index])

            if group.mode == "NOUL":
                value = selected_index == 0
                row = {
                    "exampleId": record.example_id,
                    "questionId": group.question_id,
                    "mode": group.mode,
                    "gold": bool(gold["value"]),
                    "predicted": value,
                    "probabilityTrue": float(probabilities[0]),
                    "probabilities": {
                        "true": float(probabilities[0]),
                        "false": float(probabilities[1]),
                    },
                    "confidence": confidence,
                    "correct": value == bool(gold["value"]),
                    "latencyMs": latency_ms,
                    "malformed": False,
                    "abstained": False,
                }
            elif group.mode == "CHOICE":
                selected = group.candidates[selected_index]
                row = {
                    "exampleId": record.example_id,
                    "questionId": group.question_id,
                    "mode": group.mode,
                    "gold": str(gold["selected"]),
                    "predicted": selected,
                    "probabilities": {
                        str(candidate): float(probabilities[index])
                        for index, candidate in enumerate(group.candidates)
                    },
                    "confidence": confidence,
                    "correct": selected == str(gold["selected"]),
                    "latencyMs": latency_ms,
                    "malformed": False,
                    "abstained": False,
                }
            else:
                selected_level = int(
                    question["rubric"][selected_index]["level"]
                )
                row = {
                    "exampleId": record.example_id,
                    "questionId": group.question_id,
                    "mode": group.mode,
                    "gold": int(gold["selectedLevel"]),
                    "predictedLevel": selected_level,
                    "probabilities": {
                        str(question["rubric"][index]["level"]): float(
                            probabilities[index]
                        )
                        for index in range(len(question["rubric"]))
                    },
                    "confidence": confidence,
                    "correct": selected_level == int(gold["selectedLevel"]),
                    "latencyMs": latency_ms,
                    "malformed": False,
                    "abstained": False,
                }

            rows.append(row)

    destination = Path(args.output)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
