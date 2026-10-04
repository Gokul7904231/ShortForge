from __future__ import annotations

import hashlib
import json
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, Iterable, List, Mapping, Sequence

from .schema import TrainingRecord


def read_jsonl(path: str | Path) -> List[Mapping[str, Any]]:
    rows: List[Mapping[str, Any]] = []
    with Path(path).open("r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            text = line.strip()
            if not text:
                continue
            try:
                value = json.loads(text)
            except json.JSONDecodeError as exc:
                raise ValueError("invalid JSON on line " + str(line_no)) from exc
            if not isinstance(value, Mapping):
                raise ValueError("JSONL row must be an object on line " + str(line_no))
            rows.append(value)
    return rows


def canonical_fingerprint(value: Any) -> str:
    encoded = json.dumps(
        value, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def split_group_key(record: TrainingRecord) -> str:
    provenance = record.provenance
    return str(
        provenance.get("trajectoryId")
        or provenance.get("missionId")
        or record.source_batch_id
    )


def deterministic_split(
    records: Sequence[TrainingRecord],
    train_ratio: float = 0.8,
    validation_ratio: float = 0.1,
) -> Dict[str, List[TrainingRecord]]:
    if not 0 < train_ratio < 1 or not 0 <= validation_ratio < 1:
        raise ValueError("invalid split ratios")
    if train_ratio + validation_ratio >= 1:
        raise ValueError("train + validation ratio must be < 1")

    groups: Dict[str, List[TrainingRecord]] = {}
    for record in records:
        groups.setdefault(split_group_key(record), []).append(record)

    partitions: Dict[str, List[TrainingRecord]] = {
        "train": [],
        "validation": [],
        "test": [],
    }
    for group_key, group in sorted(groups.items()):
        bucket = (
            int(hashlib.sha256(group_key.encode("utf-8")).hexdigest()[:8], 16)
            / 0xFFFFFFFF
        )
        if bucket < train_ratio:
            name = "train"
        elif bucket < train_ratio + validation_ratio:
            name = "validation"
        else:
            name = "test"
        partitions[name].extend(group)

    return partitions


def assert_no_group_leakage(
    partitions: Mapping[str, Sequence[TrainingRecord]],
) -> None:
    owners: Dict[str, str] = {}
    for split_name, records in partitions.items():
        for record in records:
            group_key = split_group_key(record)
            prior = owners.get(group_key)
            if prior and prior != split_name:
                raise AssertionError(
                    "group leakage: " + group_key + " appears in " + prior + " and " + split_name
                )
            owners[group_key] = split_name


def write_jsonl(records: Iterable[Mapping[str, Any]], path: str | Path) -> None:
    destination = Path(path)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(
                json.dumps(record, sort_keys=True, ensure_ascii=False) + "\n"
            )


def training_dict(record: TrainingRecord) -> Dict[str, Any]:
    value = asdict(record)
    return {
        "exampleId": value["example_id"],
        "datasetVersion": value["dataset_version"],
        "sourceBatchId": value["source_batch_id"],
        "input": value["input"],
        "goldAnswers": value["gold_answers"],
        "evidenceRefs": list(value["evidence_refs"]),
        "outcomeRefs": list(value["outcome_refs"]),
        "policyRefs": list(value["policy_refs"]),
        "verificationStatus": value["verification_status"],
        "labelSource": value["label_source"],
        "humanReviewed": value["human_reviewed"],
        "synthetic": value["synthetic"],
        "fallbackApplied": value["fallback_applied"],
        "trainingEligible": value["training_eligible"],
        "provenance": value["provenance"],
    }


def build_manifest(
    partitions: Mapping[str, Sequence[TrainingRecord]],
) -> Dict[str, Any]:
    assert_no_group_leakage(partitions)
    return {
        "schemaVersion": "aer-core-dataset-v1",
        "splitPolicy": "sha256(groupKey)",
        "counts": {name: len(rows) for name, rows in partitions.items()},
        "exampleFingerprints": {
            name: [canonical_fingerprint(training_dict(row)) for row in rows]
            for name, rows in partitions.items()
        },
        "groupFingerprints": {
            name: sorted(
                {canonical_fingerprint(split_group_key(row)) for row in rows}
            )
            for name, rows in partitions.items()
        },
    }
