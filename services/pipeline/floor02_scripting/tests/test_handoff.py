"""Contract tests for Floor 02 handoff payloads and Overseer execution reports."""

import json
from pathlib import Path
import pytest

from floors.floor01_strategy.app.domain.handoff import (
    ContentPlanResult,
    CurriculumMapResult,
    EvidenceType,
    Floor01HandoffPayload,
    ProvenanceEntry,
    StrategyResult,
    TopicIntelligenceResult,
)
from floors.floor02_scripting.app.core.exceptions import Floor02ValidationError
from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload, Floor02Input, FloorExecutionReport
from floors.floor02_scripting.app.domain.script_ir import BeatType
from floors.floor02_scripting.app.infrastructure.memory_store import ScriptMemoryStore
from floors.floor02_scripting.app.pipeline import Floor02Pipeline


def build_mock_floor01_payload() -> Floor01HandoffPayload:
    return Floor01HandoffPayload(
        request_id="req-floor01-test-123",
        topic=TopicIntelligenceResult(
            selected_topic="Python Decorators",
            normalized_topic="python_decorators",
            selection_reason="High educational demand",
            provenance=[ProvenanceEntry(
                evidence_type=EvidenceType.DETERMINISTIC_RULE,
                source_type="f01_test_fixture",
                source_identifier="f01_fixture_v2",
                method="fixture_provenance",
                confidence_score=1.0,
                summary="Deterministic test fixture provenance for F02 production grounding.",
            )],
        ),
        strategy=StrategyResult(
            target_audience="intermediate_developers",
            platform="youtube_shorts",
            content_angle="practical_mental_model",
            target_duration_seconds=60,
            provenance=[ProvenanceEntry(
                evidence_type=EvidenceType.DETERMINISTIC_RULE,
                source_type="f01_test_fixture",
                source_identifier="f01_fixture_v2",
                method="fixture_provenance",
                confidence_score=1.0,
                summary="Deterministic test fixture provenance for F02 production grounding.",
            )],
        ),
        content_plan=ContentPlanResult(
            core_objective="Explain wrapper functions and decorator syntax",
            key_takeaways=["Functions are first-class objects", "@decorator is syntactic sugar"],
            hook_direction="Did you know Python functions are secretly objects?",
            cta_direction="Follow for Python mental models",
            structural_outline=["Hook", "Concept Breakdown", "Example", "CTA"],
            provenance=[ProvenanceEntry(
                evidence_type=EvidenceType.DETERMINISTIC_RULE,
                source_type="f01_test_fixture",
                source_identifier="f01_fixture_v2",
                method="fixture_provenance",
                confidence_score=1.0,
                summary="Deterministic test fixture provenance for F02 production grounding.",
            )],
        ),
        curriculum=CurriculumMapResult(
            learning_objectives=["Understand higher-order functions"],
            provenance=[ProvenanceEntry(
                evidence_type=EvidenceType.DETERMINISTIC_RULE,
                source_type="f01_test_fixture",
                source_identifier="f01_fixture_v2",
                method="fixture_provenance",
                confidence_score=1.0,
                summary="Deterministic test fixture provenance for F02 production grounding.",
            )],
        ),
        decision_quality_score=0.92,
    )


def test_floor01_handoff_ingestion():
    f01_payload = build_mock_floor01_payload()
    inp = Floor02Input(floor01_payload=f01_payload, request_id="req-f02-ingest-1")

    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    f02_payload = pipeline.execute(inp)

    assert f02_payload.request_id == "req-f02-ingest-1"
    assert f02_payload.plan_id == f01_payload.plan_id
    assert "Python Decorators" in f02_payload.title
    assert len(f02_payload.scenes) >= 3
    assert f02_payload.script_version == 1
    assert f02_payload.floor_id == "floor02_scripting"
    assert f02_payload.script_ir is not None
    assert f02_payload.quality_report is not None
    assert f02_payload.quality_report.accepted is True
    assert f02_payload.successor_handoffs.keys() >= {"floor03_asset_realization", "floor04_media_synthesis"}
    assert any(b.beat_type == BeatType.HOOK for b in f02_payload.script_ir.beats)
    assert any(b.beat_type == BeatType.PAYOFF for b in f02_payload.script_ir.beats)


def test_execution_report_generation():
    f01_payload = build_mock_floor01_payload()
    inp = Floor02Input(floor01_payload=f01_payload, request_id="req-f02-report-1")

    pipeline = Floor02Pipeline()
    payload, report = pipeline.execute_with_report(inp)

    assert isinstance(payload, Floor02HandoffPayload)
    assert isinstance(report, FloorExecutionReport)
    assert report.floor_id == "floor02_scripting"
    assert report.request_id == "req-f02-report-1"
    assert report.plan_id == f01_payload.plan_id
    assert report.execution_mode.executed is False
    assert len(report.worker_results) == 1
    assert report.quality_gates


def test_execution_report_artifact_persistence(tmp_path):
    """Verify that execution report JSON artifact is physically written to disk and schema-valid."""
    report_dir = tmp_path / "reports"
    f01_payload = build_mock_floor01_payload()
    inp = Floor02Input(floor01_payload=f01_payload, request_id="req-f02-artifact-1")

    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None), artifact_report_dir=str(report_dir))
    payload, report = pipeline.execute_with_report(inp)

    report_path = report_dir / f"floor02_execution_{report.execution_id}.json"
    assert report_path.exists()

    with open(report_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    loaded_report = FloorExecutionReport.model_validate(data)
    assert loaded_report.execution_id == report.execution_id
    assert loaded_report.request_id == "req-f02-artifact-1"


def test_provenance_correctness():
    """Verify that every decision in payload contains hardened, valid provenance entries."""
    f01_payload = build_mock_floor01_payload()
    inp = Floor02Input(floor01_payload=f01_payload, request_id="req-f02-prov-1")

    pipeline = Floor02Pipeline()
    payload = pipeline.execute(inp)

    assert len(payload.provenance) >= 4
    for prov in payload.provenance:
        assert prov.evidence_type in ["UPSTREAM_HANDOFF", "DETERMINISTIC_RULE", "MODEL_INFERENCE"]
        assert len(prov.source_type) > 0
        assert len(prov.source_identifier) > 0
        assert len(prov.method) > 0
        assert len(prov.summary) > 0


def test_idempotency_payload_mismatch_rejection():
    """Verify same request_id with conflicting topic query is rejected."""
    pipeline = Floor02Pipeline(memory_store=ScriptMemoryStore(storage_path=None))
    inp1 = Floor02Input(request_id="req-conflict-999", topic_query="Topic Alpha", strict_upstream=False)
    pipeline.execute(inp1, strict_rejection=False)

    inp2 = Floor02Input(request_id="req-conflict-999", topic_query="Topic Beta", strict_upstream=False)
    with pytest.raises(Floor02ValidationError) as exc_info:
        pipeline.execute(inp2)

    assert "Idempotency conflict" in str(exc_info.value)
