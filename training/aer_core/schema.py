from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable, List, Mapping, Sequence


ALLOWED_LABEL_SOURCES = {
    "VERIFIED_OUTCOME",
    "AUTHORITATIVE_SYSTEM",
    "HUMAN_REVIEW",
    "DETERMINISTIC_RULE",
}


@dataclass(frozen=True)
class TrainingRecord:
    example_id: str
    dataset_version: str
    source_batch_id: str
    input: Mapping[str, Any]
    gold_answers: Sequence[Mapping[str, Any]]
    evidence_refs: Sequence[str]
    outcome_refs: Sequence[str]
    policy_refs: Sequence[str]
    verification_status: str
    label_source: str
    human_reviewed: bool
    synthetic: bool
    fallback_applied: bool
    training_eligible: bool
    provenance: Mapping[str, Any]


class ValidationError(ValueError):
    pass


def _required(obj: Mapping[str, Any], key: str) -> Any:
    if key not in obj:
        raise ValidationError("missing required field: " + key)
    return obj[key]


def validate_record(raw: Mapping[str, Any]) -> TrainingRecord:
    example_id = str(_required(raw, "exampleId"))
    dataset_version = str(_required(raw, "datasetVersion"))
    source_batch_id = str(_required(raw, "sourceBatchId"))
    input_obj = _required(raw, "input")
    gold_answers = _required(raw, "goldAnswers")
    evidence_refs = raw.get("evidenceRefs", [])
    outcome_refs = raw.get("outcomeRefs", [])
    policy_refs = raw.get("policyRefs", [])
    verification_status = str(_required(raw, "verificationStatus"))
    label_source = str(_required(raw, "labelSource"))
    human_reviewed = bool(raw.get("humanReviewed", False))
    synthetic = bool(raw.get("synthetic", False))
    fallback_applied = bool(raw.get("fallbackApplied", False))
    training_eligible = bool(_required(raw, "trainingEligible"))
    provenance = raw.get("provenance", {})

    if not example_id or not dataset_version or not source_batch_id:
        raise ValidationError("exampleId, datasetVersion, sourceBatchId must be non-empty")
    if not isinstance(input_obj, Mapping):
        raise ValidationError("input must be an object")
    questions = input_obj.get("questions")
    if not isinstance(questions, list) or not questions:
        raise ValidationError("input.questions must be a non-empty list")
    if not isinstance(gold_answers, list) or not gold_answers:
        raise ValidationError("goldAnswers must be a non-empty list")
    if not all(isinstance(x, str) and x for x in evidence_refs):
        raise ValidationError("evidenceRefs must contain non-empty strings")
    if not all(isinstance(x, str) and x for x in outcome_refs):
        raise ValidationError("outcomeRefs must contain non-empty strings")
    if verification_status != "VERIFIED":
        raise ValidationError("training examples require VERIFIED verificationStatus")
    if label_source not in ALLOWED_LABEL_SOURCES:
        raise ValidationError("label source is not training eligible")
    if synthetic:
        raise ValidationError("synthetic examples are not eligible for the production training set")
    if fallback_applied:
        raise ValidationError("fallback-generated examples are not eligible")
    if not evidence_refs and not outcome_refs:
        raise ValidationError("training examples require evidenceRefs or outcomeRefs")
    if not training_eligible:
        raise ValidationError("record is not trainingEligible")

    return TrainingRecord(
        example_id=example_id,
        dataset_version=dataset_version,
        source_batch_id=source_batch_id,
        input=input_obj,
        gold_answers=gold_answers,
        evidence_refs=evidence_refs,
        outcome_refs=outcome_refs,
        policy_refs=policy_refs,
        verification_status=verification_status,
        label_source=label_source,
        human_reviewed=human_reviewed,
        synthetic=synthetic,
        fallback_applied=fallback_applied,
        training_eligible=training_eligible,
        provenance=provenance,
    )


def validate_records(records: Iterable[Mapping[str, Any]]) -> List[TrainingRecord]:
    validated: List[TrainingRecord] = []
    seen = set()
    for raw in records:
        item = validate_record(raw)
        if item.example_id in seen:
            raise ValidationError("duplicate exampleId: " + item.example_id)
        seen.add(item.example_id)
        validated.append(item)
    if not validated:
        raise ValidationError("no eligible AER-Core training records found")
    return validated
