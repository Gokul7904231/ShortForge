"""Contract tests for Floor 03 handoff payloads, Overseer reports, and mandatory provenance."""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

from floors.floor01_strategy.app.domain.handoff import (
    ContentPlanResult,
    CurriculumMapResult,
    Floor01HandoffPayload,
    StrategyResult,
    TopicIntelligenceResult,
)
from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload, Floor02Input, ProvenanceEntry as F02ProvenanceEntry, EvidenceType as F02EvidenceType
from floors.floor02_scripting.app.pipeline import Floor02Pipeline
from floors.floor03_asset_realization.app.core.exceptions import Floor03ValidationError
from floors.floor03_asset_realization.app.domain.asset_models import VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload, Floor03Input, FloorExecutionReport
from floors.floor03_asset_realization.app.infrastructure.memory_store import AssetMemoryStore
from floors.floor03_asset_realization.app.pipeline import Floor03Pipeline


def build_mock_floor02_payload(platform: str = "youtube_shorts") -> Floor02HandoffPayload:
    f01_payload = Floor01HandoffPayload(
        request_id="req-f01-f03-test",
        topic=TopicIntelligenceResult(
            selected_topic="Python Decorators",
            normalized_topic="python_decorators",
            selection_reason="High educational demand",
        ),
        strategy=StrategyResult(
            target_audience="intermediate_developers",
            platform=platform,
            content_angle="practical_mental_model",
            target_duration_seconds=60,
        ),
        content_plan=ContentPlanResult(
            core_objective="Explain wrapper functions and decorator syntax",
            key_takeaways=["Functions are first-class objects"],
            hook_direction="Did you know Python functions are secretly objects?",
            cta_direction="Follow for Python mental models",
            structural_outline=["Hook", "Concept Breakdown", "CTA"],
        ),
        curriculum=CurriculumMapResult(learning_objectives=["Understand higher-order functions"]),
        decision_quality_score=0.92,
    )
    f02_pipeline = Floor02Pipeline()
    f02_payload = f02_pipeline.execute(Floor02Input(floor01_payload=f01_payload, request_id="req-f02-f03-test"))

    f02_payload.provenance.append(
        F02ProvenanceEntry(
            evidence_type=F02EvidenceType.UPSTREAM_HANDOFF,
            source_type="floor01_strategy",
            source_identifier="StrategyResult",
            method="propagate_strategy_platform",
            summary=f"Propagated target platform {platform} from Floor 01 Strategy.",
            raw_data={"platform": platform},
        )
    )
    return f02_payload


def test_floor02_handoff_ingestion_and_asset_planning(tmp_path):
    f02_payload = build_mock_floor02_payload(platform="youtube_shorts")
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-f03-plan-1")

    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    payload = pipeline.execute(inp)

    assert payload.request_id == "req-f03-plan-1"
    assert payload.script_id == f02_payload.script_id
    assert payload.resolved_platform == "youtube_shorts"
    assert payload.floor_id == "floor03_asset_realization"
    assert payload.floor_version == "2.1.0"
    assert payload.asset_plan_ir is not None
    assert payload.asset_plan_ir.script_id == f02_payload.script_id
    assert payload.asset_plan_ir.platform == payload.resolved_platform
    assert len(payload.asset_plan_ir.nodes) == len(payload.visual_asset_requirements)
    assert len(payload.visual_asset_requirements) >= 3
    assert len(payload.audio_asset_requirements) >= 3
    assert payload.manifest.total_visual_assets == len(payload.visual_asset_requirements)


def test_execution_report_generation_and_artifact_persistence(tmp_path):
    f02_payload = build_mock_floor02_payload()
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-f03-report-1")

    report_dir = tmp_path / "reports"
    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store, artifact_report_dir=str(report_dir))
    payload, report = pipeline.execute_with_report(inp)

    assert isinstance(payload, Floor03HandoffPayload)
    assert isinstance(report, FloorExecutionReport)
    assert report.floor_id == "floor03_asset_realization"
    assert report.floor_version == "2.1.0"
    assert report.request_id == "req-f03-report-1"

    report_file = report_dir / f"floor03_execution_{report.execution_id}.json"
    assert report_file.exists()

    with open(report_file, "r", encoding="utf-8") as f:
        data = json.load(f)

    loaded_report = FloorExecutionReport.model_validate(data)
    assert loaded_report.execution_id == report.execution_id


def test_mandatory_non_empty_provenance(tmp_path):
    """Verify provenance list is non-empty for payload and execution report."""
    f02_payload = build_mock_floor02_payload()
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-f03-prov-1")

    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    payload, report = pipeline.execute_with_report(inp)

    assert len(payload.provenance) >= 4
    assert len(report.provenance_audit) >= 4

    for prov in payload.provenance:
        assert len(prov.evidence_type.value) > 0
        assert len(prov.source_type) > 0
        assert len(prov.source_identifier) > 0
        assert len(prov.method) > 0
        assert len(prov.summary) > 0


def test_strict_schema_extra_forbid():
    """Verify domain models reject extra unauthorized fields."""
    with pytest.raises(ValidationError):
        VisualAssetRequirement(
            asset_id="test-id",
            scene_id="sc-1",
            sequence_index=1,
            prompt_text="Prompt",
            aspect_ratio="9:16",
            resolution="1080x1920",
            target_duration_seconds=5.0,
            unauthorized_extra_field="invalid",
        )


def test_idempotency_conflict_rejection(tmp_path):
    f02_payload_a = build_mock_floor02_payload(platform="youtube_shorts")
    f02_payload_b = build_mock_floor02_payload(platform="tiktok")

    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    inp_a = Floor03Input(floor02_payload=f02_payload_a, request_id="req-conflict-888")
    pipeline.execute(inp_a)

    inp_b = Floor03Input(floor02_payload=f02_payload_b, request_id="req-conflict-888")
    with pytest.raises(Floor03ValidationError) as exc_info:
        pipeline.execute(inp_b)

    assert "Idempotency conflict" in str(exc_info.value)


def test_asset_plan_fingerprint_is_semantic_and_request_independent(tmp_path):
    f02_payload_a = build_mock_floor02_payload()
    f02_payload_b = build_mock_floor02_payload()

    pipeline_a = Floor03Pipeline(
        memory_store=AssetMemoryStore(storage_path=str(tmp_path / "memory-a.json"))
    )
    pipeline_b = Floor03Pipeline(
        memory_store=AssetMemoryStore(storage_path=str(tmp_path / "memory-b.json"))
    )

    payload_a = pipeline_a.execute(
        Floor03Input(floor02_payload=f02_payload_a, request_id="req-fingerprint-a")
    )
    payload_b = pipeline_b.execute(
        Floor03Input(floor02_payload=f02_payload_b, request_id="req-fingerprint-b")
    )

    assert payload_a.asset_plan_ir is not None
    assert payload_b.asset_plan_ir is not None
    assert payload_a.asset_plan_ir.plan_id != payload_b.asset_plan_ir.plan_id
    assert payload_a.asset_plan_ir.plan_fingerprint == payload_b.asset_plan_ir.plan_fingerprint
    assert len(payload_a.asset_plan_ir.plan_fingerprint) == 64


def test_idempotency_cache_returns_same_typed_payload(tmp_path):
    f02_payload = build_mock_floor02_payload()
    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-idempotency-cache-1")

    first = pipeline.execute(inp)
    second = pipeline.execute(inp)

    assert second.asset_plan_id == first.asset_plan_id
    assert second.asset_plan_version == first.asset_plan_version
    assert second.asset_plan_ir is not None
    assert second.asset_plan_ir.plan_fingerprint == first.asset_plan_ir.plan_fingerprint


def test_regeneration_updates_scene_plan_prompt(tmp_path):
    f02_payload = build_mock_floor02_payload()
    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-scene-plan-prompt-1")

    initial = pipeline.execute(inp)
    target_scene_id = initial.visual_asset_requirements[0].scene_id

    updated = pipeline.regenerate_scene_assets(
        current_payload=initial,
        target_scene_id=target_scene_id,
        new_prompt_instruction="make the product screen glow softly",
    )

    target_req = next(
        req for req in updated.visual_asset_requirements if req.scene_id == target_scene_id
    )
    assert target_req.scene_plan is not None
    assert "make the product screen glow softly" in target_req.scene_plan.prompt_text
