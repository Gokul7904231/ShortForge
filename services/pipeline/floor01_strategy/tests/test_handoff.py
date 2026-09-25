"""Unit tests for Floor 01 domain contracts and Floor01HandoffPayload validation."""

import pytest
from pydantic import ValidationError

from floor01_strategy.app.domain.handoff import (
    BloomLevel,
    ContentPlanResult,
    CurriculumMapResult,
    EvidenceType,
    ExecutionMode,
    Floor01HandoffPayload,
    Floor01Input,
    HandoffStatus,
    ProvenanceEntry,
    StrategyResult,
    TopicIntelligenceResult,
    UniquenessVerdict,
)


def test_floor01_input_defaults():
    inp = Floor01Input(topic_query="Python Decorators")
    assert inp.topic_query == "Python Decorators"
    assert inp.platform == "youtube_shorts"
    assert inp.target_audience == "general_learners"
    assert inp.learning_level == "beginner"
    assert len(inp.request_id) > 0


def test_provenance_entry_creation():
    entry = ProvenanceEntry(
        evidence_type=EvidenceType.MEMORY_LOOKUP,
        source_type="jaccard_similarity",
        source_identifier="topic_memory_pool",
        confidence_score=0.95,
        summary="Jaccard keyword similarity 0.12 indicates topic is unseen in memory.",
        raw_data={"jaccard_score": 0.12},
    )
    assert entry.confidence_score == 0.95
    assert entry.evidence_type == EvidenceType.MEMORY_LOOKUP
    assert entry.source_type == "jaccard_similarity"
    assert entry.raw_data["jaccard_score"] == 0.12


def test_floor01_handoff_payload_valid():
    prov = ProvenanceEntry(
        evidence_type=EvidenceType.DETERMINISTIC_RULE,
        source_type="heuristic",
        source_identifier="rule_engine",
        confidence_score=0.9,
        summary="Verified clean topic",
    )
    topic = TopicIntelligenceResult(
        selected_topic="Python Decorators Explained",
        normalized_topic="python decorators explained",
        category="programming",
        niche="python",
        selection_reason="High educational demand",
        similarity_risk_score=0.05,
        uniqueness_verdict=UniquenessVerdict.MEMORY_UNSEEN,
        provenance=[prov],
    )
    strat = StrategyResult(
        target_audience="intermediate_python_devs",
        platform="youtube_shorts",
        content_angle="practical_mental_model",
        tone="engaging_educational",
        format="educational_short",
        target_duration_seconds=60,
        provenance=[prov],
    )
    plan = ContentPlanResult(
        core_objective="Explain wrapper function concept",
        key_takeaways=["Decorators wrap functions", "Use @ syntax"],
        hook_direction="Did you know Python functions are objects?",
        cta_direction="Subscribe for daily Python tips",
        structural_outline=["Hook", "Wrapper Concept", "Syntax Example", "CTA"],
        provenance=[prov],
    )
    curriculum = CurriculumMapResult(
        difficulty_level="intermediate",
        prerequisites=["Functions", "Scope"],
        learning_objectives=["Understand higher-order functions", "Write basic decorator"],
        bloom_taxonomy_level=BloomLevel.APPLY,
        suggested_sequence_order=5,
        provenance=[prov],
    )

    payload = Floor01HandoffPayload(
        request_id="req-12345",
        execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
        topic=topic,
        strategy=strat,
        content_plan=plan,
        curriculum=curriculum,
        decision_quality_score=0.925,
        handoff_status=HandoffStatus.VALIDATED,
    )

    assert payload.request_id == "req-12345"
    assert payload.decision_quality_score == 0.925
    assert payload.execution_mode == ExecutionMode.DETERMINISTIC_FALLBACK
    assert payload.handoff_status == HandoffStatus.VALIDATED
    assert payload.topic.selected_topic == "Python Decorators Explained"
    assert payload.topic.uniqueness_verdict == UniquenessVerdict.MEMORY_UNSEEN
    assert payload.curriculum.bloom_taxonomy_level == BloomLevel.APPLY


def test_floor01_handoff_payload_invalid_quality_score():
    prov = ProvenanceEntry(
        evidence_type=EvidenceType.DETERMINISTIC_RULE,
        source_type="heuristic",
        source_identifier="rule_engine",
        confidence_score=0.9,
        summary="Test",
    )
    topic = TopicIntelligenceResult(
        selected_topic="Topic",
        normalized_topic="topic",
        selection_reason="Reason",
        provenance=[prov],
    )
    strat = StrategyResult(
        target_audience="Audience",
        platform="Platform",
        content_angle="Angle",
        provenance=[prov],
    )
    plan = ContentPlanResult(
        core_objective="Objective",
        key_takeaways=["Takeaway"],
        hook_direction="Hook Direction",
        cta_direction="CTA",
        structural_outline=["Hook", "Body"],
        provenance=[prov],
    )
    curriculum = CurriculumMapResult(
        learning_objectives=["Obj"],
        provenance=[prov],
    )

    with pytest.raises(ValidationError):
        Floor01HandoffPayload(
            request_id="req-1",
            topic=topic,
            strategy=strat,
            content_plan=plan,
            curriculum=curriculum,
            decision_quality_score=1.5,  # Out of 0.0-1.0 range
            handoff_status=HandoffStatus.VALIDATED,
        )
