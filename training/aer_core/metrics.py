from __future__ import annotations

import math
from collections import defaultdict
from typing import Any, Dict, List, Mapping, Sequence


def brier_score(probabilities: Sequence[float], truths: Sequence[int]) -> float:
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


def top_k_accuracy(rows: Sequence[Mapping[str, Any]], k: int) -> float:
    if not rows:
        return 0.0
    hits = 0
    for row in rows:
        ordered = sorted(
            row["probabilities"].items(),
            key=lambda item: float(item[1]),
            reverse=True,
        )
        if str(row["gold"]) in [str(name) for name, _ in ordered[:k]]:
            hits += 1
    return hits / len(rows)


def selective_accuracy(
    rows: Sequence[Mapping[str, Any]],
    threshold: float,
) -> Dict[str, float]:
    selected = [
        row for row in rows
        if not bool(row.get("abstained", False))
        and float(row["confidence"]) >= threshold
    ]
    if not rows:
        return {"coverage": 0.0, "accuracy": 0.0}
    if not selected:
        return {"coverage": 0.0, "accuracy": 0.0}
    accuracy = sum(bool(row["correct"]) for row in selected) / len(selected)
    return {
        "coverage": len(selected) / len(rows),
        "accuracy": accuracy,
    }


def roc_auc_binary(
    probabilities: Sequence[float],
    truths: Sequence[int],
) -> float:
    positives = sum(1 for y in truths if int(y) == 1)
    negatives = sum(1 for y in truths if int(y) == 0)
    if positives == 0 or negatives == 0:
        return 0.0
    pairs = sorted(zip(probabilities, truths), key=lambda item: float(item[0]))
    rank_sum = 0.0
    for rank, (_, truth) in enumerate(pairs, 1):
        if int(truth) == 1:
            rank_sum += rank
    return (rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)


def quadratic_weighted_kappa(
    predicted: Sequence[int],
    gold: Sequence[int],
) -> float:
    if not predicted or len(predicted) != len(gold):
        return 0.0
    categories = sorted(set(int(x) for x in predicted) | set(int(x) for x in gold))
    index = {value: idx for idx, value in enumerate(categories)}
    n = len(categories)
    observed = [[0.0] * n for _ in range(n)]
    expected = [[0.0] * n for _ in range(n)]

    for p, g in zip(predicted, gold):
        observed[index[int(g)]][index[int(p)]] += 1.0

    hist_pred = [0.0] * n
    hist_gold = [0.0] * n
    for p, g in zip(predicted, gold):
        hist_pred[index[int(p)]] += 1.0
        hist_gold[index[int(g)]] += 1.0

    total = float(len(predicted))
    for i in range(n):
        for j in range(n):
            expected[i][j] = hist_gold[i] * hist_pred[j] / total

    def weight(i: int, j: int) -> float:
        denominator = float(max(1, n - 1))
        return ((i - j) ** 2) / (denominator ** 2)

    observed_cost = 0.0
    expected_cost = 0.0
    for i in range(n):
        for j in range(n):
            observed_cost += weight(i, j) * observed[i][j]
            expected_cost += weight(i, j) * expected[i][j]

    if expected_cost == 0:
        return 1.0 if observed_cost == 0 else 0.0
    return 1.0 - observed_cost / expected_cost


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


def benchmark_metrics(rows: Sequence[Mapping[str, Any]]) -> Dict[str, Any]:
    by_mode: Dict[str, List[Mapping[str, Any]]] = defaultdict(list)
    for row in rows:
        by_mode[str(row["mode"])].append(row)

    report: Dict[str, Any] = {"totalQuestions": len(rows), "modes": {}}
    for mode, mode_rows in by_mode.items():
        correct = [bool(row["correct"]) for row in mode_rows]
        confidences = [float(row["confidence"]) for row in mode_rows]
        mode_report: Dict[str, Any] = {
            "count": len(mode_rows),
            "accuracy": sum(correct) / len(correct),
            "ece": expected_calibration_error(confidences, correct),
            "selectiveAt080": selective_accuracy(mode_rows, 0.80),
            "abstentionRate": sum(
                bool(row.get("abstained", False)) for row in mode_rows
            ) / len(mode_rows),
            "malformedRate": sum(
                bool(row.get("malformed", False)) for row in mode_rows
            ) / len(mode_rows),
            "p50LatencyMs": percentile(
                [float(row["latencyMs"]) for row in mode_rows], 50
            ),
            "p95LatencyMs": percentile(
                [float(row["latencyMs"]) for row in mode_rows], 95
            ),
        }
        if mode == "CHOICE":
            mode_report["top2Accuracy"] = top_k_accuracy(mode_rows, 2)
        if mode == "NOUL":
            probabilities = [
                float(row["probabilityTrue"]) for row in mode_rows
            ]
            truths = [
                1 if bool(row["gold"]) else 0 for row in mode_rows
            ]
            mode_report["brier"] = brier_score(probabilities, truths)
            mode_report["auroc"] = roc_auc_binary(probabilities, truths)
        if mode == "SCORE":
            mode_report["mae"] = mean_absolute_error(
                [float(row["predictedLevel"]) for row in mode_rows],
                [float(row["gold"]) for row in mode_rows],
            )
            mode_report["qwk"] = quadratic_weighted_kappa(
                [int(row["predictedLevel"]) for row in mode_rows],
                [int(row["gold"]) for row in mode_rows],
            )
        report["modes"][mode] = mode_report

    report["overallMalformedRate"] = (
        sum(bool(row.get("malformed", False)) for row in rows) / len(rows)
        if rows else 0.0
    )
    return report
