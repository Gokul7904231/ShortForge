"""Regression tests for Floor 01 v2 architecture."""

from floor01_strategy.app.core.novelty import hybrid_similarity
from floor01_strategy.app.core.research_gate import ResearchEvidenceGate
from floor01_strategy.app.domain.handoff import (
    Floor01Input,
    HandoffStatus,
    ResearchContext,
    ResearchEvidenceRef,
)
from floor01_strategy.app.infrastructure.llm_provider import LLMStrategyAdapter
from floor01_strategy.app.infrastructure.memory_store import StrategyMemoryStore
from floor01_strategy.app.pipeline import Floor01Pipeline


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


class _FallbackButEnabledAdapter:
    enabled = True
    provider_name = "test-provider"
    model_name = "test-model"

    def generate_strategy_insight(self, *args, **kwargs):
        from floors.floor01_strategy.app.domain.handoff import EvidenceType, ProvenanceEntry

        return (
            {
                "strategic_reasoning": "fallback",
                "recommended_angle": "unsafe_to_treat_as_model",
                "confidence": 0.55,
            },
            ProvenanceEntry(
                evidence_type=EvidenceType.FALLBACK,
                source_type="test",
                source_identifier="fallback-adapter",
                method="test",
                confidence_score=0.55,
                summary="fallback",
            ),
        )


def test_fallback_provenance_cannot_create_model_candidate(tmp_path):
    store = StrategyMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor01Pipeline(
        memory_store=store,
        llm_adapter=_FallbackButEnabledAdapter(),
    )

    payload = pipeline.execute(
        Floor01Input(
            request_id="req_truthful_fallback",
            topic_query="Python descriptors",
            research_context=verified_research(),
        )
    )

    assert payload.handoff_status == HandoffStatus.VALIDATED
    assert payload.strategy.execution_mode.value == "DETERMINISTIC_FALLBACK"


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
    from floor01_strategy.app.core import security
    from floor01_strategy.app.core.config import Floor01Settings

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
    from floor01_strategy.app.core import security
    from floor01_strategy.app.core.config import Floor01Settings

    monkeypatch.setattr(
        security,
        "get_settings",
        lambda: Floor01Settings(environment="production", service_api_key=None),
    )

    with __import__("pytest").raises(Exception) as exc_info:
        asyncio.run(security.verify_api_key(None))
    assert getattr(exc_info.value, "status_code", None) == 503


def test_verified_research_is_required_by_default():
    from floor01_strategy.app.core.config import Floor01Settings
    settings = Floor01Settings()
    assert settings.require_verified_research is True


def test_candidate_selection_is_deterministic_on_score_ties():
    from floor01_strategy.app.intelligence.strategy_candidates import StrategyCandidateEvaluator
    from floor01_strategy.app.domain.handoff import (
        StrategyCandidate,
        StrategyResult,
        StrategyEvaluation,
        QualityDimensions,
    )

    strategy_a = StrategyResult(
        target_audience="general_learners",
        platform="youtube_shorts",
        content_angle="alpha_angle",
    )
    strategy_b = StrategyResult(
        target_audience="general_learners",
        platform="youtube_shorts",
        content_angle="beta_angle",
    )
    candidate_a = StrategyCandidate(candidate_id="cand_random_1", strategy=strategy_a)
    candidate_b = StrategyCandidate(candidate_id="cand_random_2", strategy=strategy_b)
    dimensions = QualityDimensions(
        evidence_adequacy=0.9,
        novelty=0.9,
        audience_fit=0.9,
        platform_fit=0.9,
        curriculum_coherence=0.9,
        downstream_feasibility=0.9,
        constraint_compliance=0.9,
    )
    evaluations = [
        StrategyEvaluation(candidate_id=candidate_a.candidate_id, dimensions=dimensions, overall_score=0.9, accepted=True),
        StrategyEvaluation(candidate_id=candidate_b.candidate_id, dimensions=dimensions, overall_score=0.9, accepted=True),
    ]

    selected, _, _ = StrategyCandidateEvaluator().select(
        [candidate_b, candidate_a],
        evaluations=[evaluations[1], evaluations[0]],
        complexity_mode="FAST",
    )
    assert selected.strategy.content_angle == "beta_angle"


def test_staging_without_service_key_fails_closed():
    import asyncio
    from floors.floor01_strategy.app.core import security
    from floors.floor01_strategy.app.core.config import Floor01Settings

    original = security.get_settings
    try:
        security.get_settings = lambda: Floor01Settings(
            environment="staging",
            allow_anonymous_dev=True,
            service_api_key=None,
        )
        with __import__("pytest").raises(Exception) as exc_info:
            asyncio.run(security.verify_api_key(None))
        assert getattr(exc_info.value, "status_code", None) == 503
    finally:
        security.get_settings = original


def test_llm_endpoint_rejects_non_http_scheme(monkeypatch):
    from floor01_strategy.app.infrastructure.llm_provider import LLMStrategyAdapter

    monkeypatch.setenv("FLOOR01_ENVIRONMENT", "production")
    adapter = LLMStrategyAdapter(
        api_key="test-key",
        model_name="test-model",
        base_url="file:///tmp/llm",
    )
    insight, provenance = adapter.generate_strategy_insight(
        topic="Python decorators",
        category="computer_science",
        audience="general_learners",
        platform="youtube_shorts",
    )
    assert insight["confidence"] == 0.55
    assert provenance.method == "endpoint_scheme_gate"
