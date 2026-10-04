from __future__ import annotations

import argparse
import json
from pathlib import Path

from .metrics import benchmark_metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate measured AER-Core predictions with AER-Bench.")
    parser.add_argument("--dataset", required=True)
    parser.add_argument("--predictions", required=True)
    parser.add_argument("--report", required=True)
    args = parser.parse_args()

    predictions = []
    with Path(args.predictions).open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            line = line.strip()
            if not line:
                continue
            try:
                predictions.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError("invalid prediction JSON on line " + str(line_no)) from exc

    report = benchmark_metrics(predictions)
    report["dataset"] = args.dataset
    report["predictionFile"] = args.predictions
    report["benchmarkVersion"] = "aer-bench-v1"

    destination = Path(args.report)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps(report, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
