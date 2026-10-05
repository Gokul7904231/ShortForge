from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any, Dict, Mapping, Protocol, Sequence

from .schema import TrainingRecord
from .metrics import benchmark_metrics


class AERCorePredictor(Protocol):
    def predict(
        self,
        record: TrainingRecord,
    ) -> Sequence[Mapping[str, Any]]:
        """Return one measured prediction row per question."""


def run_benchmark(
    predictor: AERCorePredictor,
    records: Sequence[TrainingRecord],
    output_path: str | Path | None = None,
) -> Dict[str, Any]:
    rows = []
    started = time.perf_counter()
    for record in records:
        predictions = list(predictor.predict(record))
        for row in predictions:
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
                    "benchmark prediction missing fields: "
                    + ",".join(sorted(missing))
                )
            rows.append(dict(row))

    report = benchmark_metrics(rows)
    report["benchmarkWallClockMs"] = (
        time.perf_counter() - started
    ) * 1000.0

    if output_path is not None:
        destination = Path(output_path)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(
            json.dumps(report, indent=2, sort_keys=True),
            encoding="utf-8",
        )
    return report
