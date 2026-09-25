"""Regression tests for Floor 01 v2 architecture."""

from floors.floor01_strategy.app.core.novelty import hybrid_similarity
from floors.floor01_strategy.app.core.research_gate import ResearchEvidenceGate
from floors.floor01_strategy.app.domain.handoff import (
    Floor01Input,
    HandoffStatus,
    ResearchContext,
    ResearchEvidenceRef,
)
from floors.floor01_strategy.app.infrastructure.llm_provider import LLMStrategyAdapter
from floors.floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floors.floor01_strategy.app.pipeline import Floor01Pipeline


def verified_research() -> ResearchContext:
    return ResearchContext(
        passport_id="pass_test_01",
        mission_id="mission_test_01",
        integrity_verified=True,
        confidence=0.9,
        source_count=3,
        verified_claim_count=3,
        unresolved_issue_count=0,
        key_findings=["Observed evidence-backed hook opportunity."],
        recommended_hook="Most people misunderstand this concept.",
        hook_archetype="CURIOSITY_GAP",
        evidence=[
            ResearchEvidenceRef(
                evidence_id="clm_1",
                claim_id="clm_1",
                statement="Observed source-backed fact.",
                verification_status="VERIFIED",
                confidence=0.92,
                supporting_source_ids=["src_1", "src_2"],
                source_quality=["TIER_1_PRIMARY"],
            )
        ],
        provenance=["ResearchRuntime.verifyResearchPassport", "floor00_analyst"],
    )


def test_hybrid_similarity_catches_wording_closeness():
    score, details = hybrid_similarity(
        "How Python decorators work",
        "Python decorator tutorial",
    )
    assert score > 0.35
    assert details["token_jaccard"] >= 0.0


def test_strict_research_gate_rejects_missing_context():
    result = ResearchEvidenceGate().evaluate(
        Floor01Input(topic_query="Python decorators"),
        strict=True,
    )
    assert result.passed is False
    assert result.blockers


def test_pipeline_degrades_without_upstream_research(tmp_path):
    store = StrategyMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor01Pipeline(memory_store=store, llm_adapter=LLMStrategyAdapter(api_key=None))

    payload, report = pipeline.execute_with_report(
        Floor01Input(
            request_id="req_no_research",
            topic_query="Python decorators",
        )
    )
    assert payload.floor_id == "floor01_strategy"
    assert payload.floor_version == "2.0.0"
    assert payload.handoff_status == HandoffStatus.DEGRADED
    assert report.component_gates["research_evidence_gate"] is False


def test_pipeline_validates_with_verified_research(tmp_path):
    store = StrategyMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor01Pipeline(memory_store=store, llm_adapter=LLMStrategyAdapter(api_key=None))

    payload, report = pipeline.execute_with_report(
        Floor01Input(
            request_id="req_verified_research",
            topic_query="Python decorators",
            target_audience="beginner_programmers",
            research_context=verified_research(),
        )
    )
    assert payload.handoff_status == HandoffStatus.VALIDATED
    assert payload.selected_candidate_id
    assert payload.evaluation is not None
    assert payload.evaluation.accepted is True
    assert report.component_gates["candidate_evaluation_gate"] is True


def test_model_key_without_endpoint_never_claims_model_execution():
    adapter = LLMStrategyAdapter(api_key="configured-but-no-endpoint", base_url=None)
    assert adapter.enabled is False
    _, provenance = adapter.generate_strategy_insight(
        "Python decorators",
        "computer_science",
        "beginner_programmers",
        "youtube_shorts",
    )
    assert provenance.evidence_type.value == "FALLBACK"
    assert provenance.raw_data["configured"] is True



def test_service_api_key_is_enforced(monkeypatch):
    import asyncio
    import pytest
    from floors.floor01_strategy.app.core import security
    from floors.floor01_strategy.app.core.config import Floor01Settings

    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: Floor01Settings(service_api_key="test-service-secret"),
    )

    assert asyncio.run(security.verify_api_key("test-service-secret")) == "test-service-secret"
    with pytest.raises(Exception) as exc_info:
        asyncio.run(security.verify_api_key("wrong-secret"))
    assert getattr(exc_info.value, "status_code", None) == 401


def test_production_auth_fails_closed_without_service_key(monkeypatch):
    import asyncio
    from floors.floor01_strategy.app.core import security
    from floors.floor01_strategy.app.core.config import Floor01Settings

    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: Floor01Settings(environment="production", service_api_key=None),
    )

    with __import__("pytest").raises(Exception) as exc_info:
        asyncio.run(security.verify_api_key(None))
    assert getattr(exc_info.value, "status_code", None) == 503


def test_verified_research_is_required_by_default():
    from floors.floor01_strategy.app.core.config import Floor01Settings
    settings = Floor01Settings()
    assert settings.require_verified_research is True
