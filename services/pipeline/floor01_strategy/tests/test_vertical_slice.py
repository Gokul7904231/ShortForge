"""Integration and Contract tests for Floor 01 vertical slice."""

import pytest
from pydantic import ValidationError

from floors.floor01_strategy.app.domain.handoff import Floor01Input, HandoffStatus, ResearchContext, ResearchEvidenceRef, UniquenessVerdict
from floors.floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floors.floor01_strategy.app.service import Floor01Service


def verified_research_context() -> ResearchContext:
    return ResearchContext(
        passport_id="pass_vertical_01",
        mission_id="mission_vertical_01",
        integrity_verified=True,
        confidence=0.95,
        source_count=2,
        verified_claim_count=2,
        unresolved_issue_count=0,
        key_findings=["Verified evidence for the vertical-slice strategy."],
        recommended_hook="Here is the important thing most people miss.",
        hook_archetype="CURIOSITY_GAP",
        evidence=[
            ResearchEvidenceRef(
                evidence_id="clm_vertical_01",
                claim_id="clm_vertical_01",
                statement="Verified source-backed fact.",
                verification_status="VERIFIED",
                confidence=0.95,
                supporting_source_ids=["src_vertical_01"],
                source_quality=["TIER_1_PRIMARY"],
            )
        ],
        provenance=["ResearchRuntime.verifyResearchPassport", "floor00_analyst"],
    )


def test_floor01_vertical_slice_success():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    service = Floor01Service(memory_store=mem_store)
    inp = Floor01Input(
        topic_query="Python Decorators & Wrapper Functions",
        target_audience="intermediate_developers",
        platform="youtube_shorts",
        content_format="educational_short",
        learning_level="intermediate",
        research_context=verified_research_context(),
    )

    payload = service.plan_strategy(inp)

    # Contract assertions
    assert payload.request_id == inp.request_id
    assert payload.handoff_status == HandoffStatus.VALIDATED
    assert payload.decision_quality_score > 0.70
    assert len(payload.plan_id) > 0

    # Sub-schema assertions
    assert payload.topic.selected_topic == "Python Decorators & Wrapper Functions"
    assert payload.topic.category == "computer_science"
    assert payload.topic.uniqueness_verdict == UniquenessVerdict.MEMORY_UNSEEN

    assert payload.strategy.platform == "youtube_shorts"
    assert payload.strategy.target_audience == "intermediate_developers"

    assert len(payload.content_plan.key_takeaways) >= 2
    assert len(payload.content_plan.structural_outline) >= 3

    assert payload.curriculum.difficulty_level == "intermediate"
    assert len(payload.curriculum.learning_objectives) >= 2
    assert len(payload.curriculum.knowledge_gap_hypothesis) >= 1

    # Provenance assertions
    assert len(payload.topic.provenance) >= 1
    assert len(payload.strategy.provenance) >= 1
    assert len(payload.content_plan.provenance) >= 1
    assert len(payload.curriculum.provenance) >= 1


def test_floor01_vertical_slice_duplicate_rejection():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    mem_store.add_record("Python Decorators & Wrapper Functions", "plan-1")

    service = Floor01Service(memory_store=mem_store)

    inp = Floor01Input(
        topic_query="Python Decorators & Wrapper Functions",
        target_audience="developers",
    )

    payload = service.plan_strategy(inp)

    assert payload.handoff_status == HandoffStatus.REJECTED
    assert payload.topic.uniqueness_verdict == UniquenessVerdict.DUPLICATE_IN_MEMORY
    assert payload.topic.similarity_risk_score >= 0.75


def test_floor01_vertical_slice_idempotency():
    mem_store = StrategyMemoryStore()
    mem_store.clear()
    service = Floor01Service(memory_store=mem_store)
    inp = Floor01Input(
        request_id="req-fixed-idempotent-123",
        topic_query="Idempotent Test Topic",
    )

    payload1 = service.plan_strategy(inp)
    payload2 = service.plan_strategy(inp)

    assert payload1.plan_id == payload2.plan_id
    assert payload1.request_id == payload2.request_id


def test_floor01_vertical_slice_invalid_input_validation():
    with pytest.raises(ValidationError):
        Floor01Input(topic_query="x")  # min_length=2 required
