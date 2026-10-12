from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any, Dict, List, Mapping, Tuple

from .dataset import read_jsonl
from .metrics import benchmark_metrics
from .schema import validate_records


def prediction_key(row: Mapping[str, Any]) -> Tuple[str, str]:
    return str(row.get("exampleId", "")), str(row.get("questionId", ""))


def expected_prediction_keys(records) -> set[Tuple[str, str]]:
    keys: set[Tuple[str, str]] = set()
    for record in records:
        for question in record.input["questions"]:
            keys.add((record.example_id, str(question["id"])))
    return keys


def validate_predictions(
    predictions: List[Mapping[str, Any]],
    records,
) -> None:
    expected = expected_prediction_keys(records)
    seen: set[Tuple[str, str]] = set()

    for index, row in enumerate(predictions, 1):
        required = {
            "exampleId",
            "questionId",
            "mode",
            "confidence",
            "latencyMs",
        }
        missing = required - set(row)
        if missing:
            raise ValueError(
                f"prediction line {index} missing fields: "
                + ",".join(sorted(missing))
            )

        key = prediction_key(row)
        if key in seen:
            raise ValueError(f"duplicate prediction key: {key}")
        seen.add(key)

        if key not in expected:
            raise ValueError(f"prediction has no matching dataset question: {key}")

        if not isinstance(row["confidence"], (int, float)):
            raise ValueError(f"confidence is not numeric for {key}")
        if not isinstance(row["latencyMs"], (int, float)):
            raise ValueError(f"latencyMs is not numeric for {key}")

    missing_keys = expected - seen
    extra_keys = seen - expected
    if missing_keys:
        raise ValueError(
            "prediction file is incomplete; missing keys: "
            + ", ".join(sorted(missing_keys))
        )
    if extra_keys:
        raise ValueError(
            "prediction file contains unexpected keys: "
            + ", ".join(sorted(extra_keys))
        )

    question_modes = {
        (record.example_id, str(question["id"])): str(question["type"])
        for record in records
        for question in record.input["questions"]
    }
    for row in predictions:
        key = prediction_key(row)
        if str(row["mode"]) != question_modes[key]:
            raise ValueError(
                f"prediction mode mismatch for {key}: "
                f"{row['mode']} != {question_modes[key]}"
            )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate measured AER-Core predictions with AER-Bench."
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Held-out JSONL dataset used to validate prediction coverage.",
    )
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    records = validate_records(read_jsonl(args.dataset))

    predictions: List[Dict[str, Any]] = []
    with Path(args.predictions).open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                value = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(
                    f"invalid prediction JSON on line {line_no}"
                ) from exc
            if not isinstance(value, dict):
                raise ValueError(
                    f"prediction line {line_no} must be a JSON object"
                )
            predictions.append(value)

    validate_predictions(predictions, records)

    report = benchmark_metrics(predictions)
    report["dataset"] = args.dataset
    report["predictionFile"] = args.predictions
    report["benchmarkVersion"] = "aer-bench-v1"
    report["predictionCount"] = len(predictions)
    wall_clock_ms = sum(
        float(row["latencyMs"]) for row in predictions
    )
    report["measuredPredictionLatencySumMs"] = wall_clock_ms
    report["measuredThroughputQuestionsPerSecond"] = (
        len(predictions) / (wall_clock_ms / 1000.0)
        if wall_clock_ms > 0
        else 0.0
    )

    destination = Path(args.report)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
