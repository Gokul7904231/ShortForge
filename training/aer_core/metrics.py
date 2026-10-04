from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Dict, List, Mapping, Sequence


def brier_score(
    probabilities: Sequence[float],
    truths: Sequence[int],
) -> float:
    if not probabilities:
        return 0.0
    return sum(
        (float(p) - int(y)) ** 2
        for p, y in zip(probabilities, truths)
    ) / len(probabilities)


def expected_calibration_error(
    confidences: Sequence[float],
    correct: Sequence[bool],
    bins: int = 10,
) -> float:
    if not confidences:
        return 0.0
    total = len(confidences)
    error = 0.0
    for idx in range(bins):
        lower = idx / bins
        upper = (idx + 1) / bins
        bucket = [
            (float(c), bool(ok))
            for c, ok in zip(confidences, correct)
            if (lower <= c < upper)
            or (idx == bins - 1 and c == upper)
        ]
        if not bucket:
            continue
        accuracy = sum(ok for _, ok in bucket) / len(bucket)
        confidence = sum(c for c, _ in bucket) / len(bucket)
        error += (len(bucket) / total) * abs(accuracy - confidence)
    return error


def mean_absolute_error(
    values: Sequence[float],
    truths: Sequence[float],
) -> float:
    if not values:
        return 0.0
    return sum(
        abs(float(a) - float(b))
        for a, b in zip(values, truths)
    ) / len(values)


def top_k_accuracy(
    rows: Sequence[Mapping[str, Any]],
    k: int,
) -> float:
    if not rows:
        return 0.0
    hits = 0
    for row in rows:
        ordered = sorted(
            row["probabilities"].items(),
            key=lambda item: float(item[1]),
            reverse=True,
        )
        if str(row["gold"]) in [
            str(name) for name, _ in ordered[:k]
        ]:
            hits += 1
    return hits / len(rows)


def selective_accuracy(
    rows: Sequence[Mapping[str, Any]],
    threshold: float,
) -> Dict[str, float]:
    selected = [
        row for row in rows
        if float(row["confidence"]) >= threshold
    ]
    if not selected:
        return {"coverage": 0.0, "accuracy": 0.0}
    accuracy = sum(
        bool(row["correct"]) for row in selected
    ) / len(selected)
    return {
        "coverage": len(selected) / len(rows),
        "accuracy": accuracy,
    }


def percentile(values: Sequence[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = (len(ordered) - 1) * (p / 100.0)
    lower = math.floor(index)
    upper = math.ceil(index)
    if lower == upper:
        return ordered[lower]
    weight = index - lower
    return ordered[lower] * (1 - weight) + ordered[upper] * weight


def benchmark_metrics(
    rows: Sequence[Mapping[str, Any]],
) -> Dict[str, Any]:
    by_mode: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        by_mode[str(row["mode"])].append(row)

    report: Dict[str, Any] = {
        "totalQuestions": len(rows),
        "modes": {},
    }
    for mode, mode_rows in by_mode.items():
        correct = [bool(row["correct"]) for row in mode_rows]
        confidences = [float(row["confidence"]) for row in mode_rows]
        mode_report: Dict[str, Any] = {
            "count": len(mode_rows),
            "accuracy": sum(correct) / len(correct),
            "ece": expected_calibration_error(
                confidences, correct
            ),
            "selectiveAt080": selective_accuracy(
                mode_rows, 0.80
            ),
            "malformedRate": sum(
                bool(row.get("malformed", False))
                for row in mode_rows
            ) / len(mode_rows),
            "p50LatencyMs": percentile(
                [float(row["latencyMs"]) for row in mode_rows],
                50,
            ),
            "p95LatencyMs": percentile(
                [float(row["latencyMs"]) for row in mode_rows],
                95,
            ),
        }
        if mode == "CHOICE":
            mode_report["top2Accuracy"] = top_k_accuracy(
                mode_rows, 2
            )
        if mode == "NOUL":
            probabilities = [
                float(row["probabilityTrue"])
                for row in mode_rows
            ]
            truths = [
                1 if bool(row["gold"]) else 0
                for row in mode_rows
            ]
            mode_report["brier"] = brier_score(
                probabilities, truths
            )
        if mode == "SCORE":
            mode_report["mae"] = mean_absolute_error(
                [float(row["predictedLevel"]) for row in mode_rows],
                [float(row["gold"]) for row in mode_rows],
            )
        report["modes"][mode] = mode_report

    report["overallMalformedRate"] = (
        sum(
            bool(row.get("malformed", False))
            for row in rows
        ) / len(rows)
        if rows
        else 0.0
    )
    return report
