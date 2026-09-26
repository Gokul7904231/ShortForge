"""Contract tests for Floor 03 handoff payloads, Overseer reports, and mandatory provenance."""

import json
from pathlib import Path
import pytest
from pydantic import ValidationError

from floors.floor02_scripting.app.domain.handoff import (
    EvidenceType as F02EvidenceType,
    ExecutionMode as F02ExecutionMode,
    Floor02HandoffPayload,
    HandoffStatus as F02HandoffStatus,
    ProvenanceEntry as F02ProvenanceEntry,
)
from floors.floor02_scripting.app.domain.script_models import (
    CharacterProfile,
    SceneSpecification,
)
from floors.floor03_asset_realization.app.core.exceptions import Floor03ValidationError
from floors.floor03_asset_realization.app.domain.asset_models import VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload, Floor03Input, FloorExecutionReport
from floors.floor03_asset_realization.app.infrastructure.memory_store import AssetMemoryStore
from floors.floor03_asset_realization.app.pipeline import Floor03Pipeline


def build_mock_floor02_payload(platform: str = "youtube_shorts") -> Floor02HandoffPayload:
    """Create a self-contained trusted F02 handoff without executing F02.

    F03 tests should exercise the F02->F03 contract directly; they should not
    become coupled to F02 model credentials or its revision/quality policy.
    """
    character = CharacterProfile(
        character_id="guide-1",
        name="Guide",
        role="protagonist",
        appearance="Young software educator, dark hair, blue shirt",
        speaking_style="clear and engaging",
        constraints={"wardrobe": "blue shirt", "style": "clean educational"},
    )
    scenes = [
        SceneSpecification(
            scene_id="scene-1",
            sequence_index=1,
            section_type="Hook",
            beat_id="beat-1",
            scene_goal="Establish the Python function concept.",
            narration_text="A Python function is a reusable block of code.",
            on_screen_text="Reusable function",
            visual_intent="Establish a clean educational coding desk with Python code visible.",
            target_duration_seconds=10,
            word_count=9,
            estimated_speech_duration_seconds=4.5,
            character_references=["guide-1"],
            continuity_rules={"lighting": "soft studio light"},
            evidence_refs=["evidence-python-functions"],
            visual_intent_structured={
                "shot_type": "ESTABLISHING",
                "coverage_role": "establish",
                "camera": {
                    "framing": "medium",
                    "camera_angle": "eye_level",
                    "camera_height": "tripod",
                    "lens_profile": "natural",
                },
                "lighting": "soft studio light",
            },
        ),
        SceneSpecification(
            scene_id="scene-2",
            sequence_index=2,
            section_type="Core Narrative",
            beat_id="beat-2",
            scene_goal="Show how a function call works.",
            narration_text="Calling the function runs the reusable instructions.",
            on_screen_text="Call the function",
            visual_intent="Show the guide demonstrating a Python function call on screen.",
            target_duration_seconds=10,
            word_count=8,
            estimated_speech_duration_seconds=4.0,
            character_references=["guide-1"],
            continuity_rules={
                "continuity_mode": "chain_from_previous",
                "chain_from_previous": True,
                "locked_attributes": ["blue shirt", "same desk"],
            },
            depends_on_scene_ids=["scene-1"],
            evidence_refs=["evidence-python-functions"],
            visual_intent_structured={
                "shot_type": "CHARACTER",
                "coverage_role": "action",
                "continuity_mode": "chain_from_previous",
                "chain_from_previous": True,
                "subject_constraints": ["blue shirt", "same desk"],
                "negative_constraints": ["extra fingers", "warped text"],
                "video_references": [
                    {
                        "source_id": "scene:scene-1:last-frame",
                        "usage": "last_frame",
                        "required": False,
                    }
                ],
            },
        ),
        SceneSpecification(
            scene_id="scene-3",
            sequence_index=3,
            section_type="CTA",
            beat_id="beat-3",
            scene_goal="Close the explanation with a clear takeaway.",
            narration_text="Use functions to keep repeated Python logic organized.",
            on_screen_text="Keep code organized",
            visual_intent="Close on the guide and a clean Python code summary.",
            target_duration_seconds=10,
            word_count=9,
            estimated_speech_duration_seconds=4.5,
            character_references=["guide-1"],
            continuity_rules={"continuity_mode": "scene_end", "chain_from_previous": True},
            depends_on_scene_ids=["scene-2"],
            evidence_refs=["evidence-python-functions"],
            visual_intent_structured={
                "shot_type": "CLOSEUP",
                "coverage_role": "payoff",
                "continuity_mode": "scene_end",
                "chain_from_previous": True,
                "time_beats": [
                    {"start_seconds": 0, "end_seconds": 4, "instruction": "hold on the final code summary"}
                ],
            },
        ),
    ]

    return Floor02HandoffPayload(
        script_id="script-f03-contract-test",
        script_version=1,
        plan_id="plan-f03-contract-test",
        request_id="req-f02-f03-test",
        floor_id="floor02_scripting",
        floor_version="2.0.0",
        execution_mode=F02ExecutionMode.DETERMINISTIC,
        title="Python Functions",
        logline="A concise explanation of reusable Python functions.",
        target_duration_seconds=30,
        estimated_total_duration_seconds=13.0,
        estimated_speech_duration_seconds=13.0,
        estimated_pause_transition_duration_seconds=0.0,
        scenes=scenes,
        character_profiles=[character],
        educational_beats={
            "scene-1": "Establish the concept",
            "scene-2": "Demonstrate a call",
            "scene-3": "Close with the takeaway",
        },
        decision_quality_score=0.95,
        handoff_status=F02HandoffStatus.VALIDATED,
        provenance=[
            F02ProvenanceEntry(
                evidence_type=F02EvidenceType.UPSTREAM_HANDOFF,
                source_type="floor01_strategy",
                source_identifier="strategy-test-fixture",
                method="trusted_test_fixture",
                summary=f"Trusted F02 test fixture for platform {platform}.",
                raw_data={"platform": platform},
            ),
            F02ProvenanceEntry(
                evidence_type=F02EvidenceType.DETERMINISTIC_RULE,
                source_type="f02_test_fixture",
                source_identifier="script-f03-contract-test",
                method="build_trusted_handoff_fixture",
                summary="Constructed validated scene graph and evidence lineage for Floor 03 contract tests.",
                raw_data={"platform": platform, "scene_count": 3},
            ),
        ],
        successor_handoffs={
            "floor03_asset_realization": {
                "script_id": "script-f03-contract-test",
                "script_version": 1,
                "schema_version": "2.0",
            },
            "floor04_media_synthesis": {
                "script_id": "script-f03-contract-test",
                "script_version": 1,
                "schema_version": "2.0",
            },
        },
    )


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
    assert payload.floor_version == "2.3.0"
    assert payload.asset_plan_ir is not None
    assert payload.asset_plan_ir.script_id == f02_payload.script_id
    assert payload.asset_plan_ir.platform == payload.resolved_platform
    assert payload.asset_plan_ir.schema_version == "1.4.0"
    assert payload.asset_plan_ir.plan_fingerprint
    assert all(node.coverage_role.value for node in payload.asset_plan_ir.nodes)
    assert all(node.asset_id for node in payload.asset_plan_ir.nodes)
    assert all(node.node_fingerprint and len(node.node_fingerprint) == 64 for node in payload.asset_plan_ir.nodes)
    assert payload.asset_plan_ir.source_fingerprint == payload.asset_plan_ir.lineage.source_fingerprint
    assert payload.asset_plan_ir.lineage.source_floor_id == "floor02_scripting"
    assert payload.asset_plan_ir.lineage.compiler_floor_id == "floor03_asset_realization"
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
    assert report.floor_version == "2.3.0"
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
    asset_ids_a = {node.scene_id: node.asset_id for node in payload_a.asset_plan_ir.nodes}
    asset_ids_b = {node.scene_id: node.asset_id for node in payload_b.asset_plan_ir.nodes}
    assert asset_ids_a != asset_ids_b
    node_fingerprints_a = {node.scene_id: node.node_fingerprint for node in payload_a.asset_plan_ir.nodes}
    node_fingerprints_b = {node.scene_id: node.node_fingerprint for node in payload_b.asset_plan_ir.nodes}
    assert node_fingerprints_a == node_fingerprints_b


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
