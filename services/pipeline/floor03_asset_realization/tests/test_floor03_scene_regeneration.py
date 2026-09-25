"""Unit tests for single-scene asset regeneration and versioning invariants."""

import pytest

from floors.floor03_asset_realization.app.core.exceptions import Floor03ValidationError
from floors.floor03_asset_realization.app.domain.handoff import Floor03Input
from floors.floor03_asset_realization.app.infrastructure.memory_store import AssetMemoryStore
from floors.floor03_asset_realization.app.pipeline import Floor03Pipeline
from floors.floor03_asset_realization.tests.test_floor03_handoff import build_mock_floor02_payload


def test_single_scene_asset_regeneration_invariants(tmp_path):
    """Verify single-scene regeneration increments target asset versions and preserves byte/semantic equality of unaffected scenes."""
    f02_payload = build_mock_floor02_payload()
    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-regen-invariants-1")
    initial_payload = pipeline.execute(inp)

    assert len(initial_payload.visual_asset_requirements) >= 3
    assert initial_payload.asset_plan_version == 1

    asset_a_initial = initial_payload.visual_asset_requirements[0].model_dump()
    asset_b_initial = initial_payload.visual_asset_requirements[1].model_dump()
    asset_c_initial = initial_payload.visual_asset_requirements[2].model_dump()

    target_scene_id = asset_b_initial["scene_id"]

    updated_payload = pipeline.regenerate_scene_assets(
        current_payload=initial_payload,
        target_scene_id=target_scene_id,
        new_prompt_instruction="Enhance code syntax glow",
    )

    # Asset plan version increments while ScriptIR lineage remains upstream-owned
    assert updated_payload.asset_plan_version == 2
    assert updated_payload.script_version == initial_payload.script_version

    # Scene A (unaffected): Byte & semantic equivalence preserved
    asset_a_updated = updated_payload.visual_asset_requirements[0].model_dump()
    assert asset_a_updated == asset_a_initial

    # Scene B (target): identity/version incremented and prompt updated
    asset_b_updated = updated_payload.visual_asset_requirements[1].model_dump()
    assert asset_b_updated["scene_id"] == target_scene_id
    assert asset_b_updated["asset_id"] != asset_b_initial["asset_id"]
    assert asset_b_updated["asset_version"] == asset_b_initial["asset_version"] + 1
    assert asset_b_updated["scene_version"] == asset_b_initial["scene_version"] + 1
    assert "Enhance code syntax glow" in asset_b_updated["prompt_text"]
    assert updated_payload.asset_plan_ir is not None
    target_nodes = [node for node in updated_payload.asset_plan_ir.nodes if node.scene_id == target_scene_id]
    assert len(target_nodes) == 1
    assert "Enhance code syntax glow" in target_nodes[0].visual.prompt_text
    assert updated_payload.asset_plan_ir.plan_version == 2
    assert updated_payload.asset_plan_ir.plan_fingerprint
    assert updated_payload.asset_plan_ir.script_version == initial_payload.asset_plan_ir.script_version

    # Scene C (unaffected): Byte & semantic equivalence preserved
    asset_c_updated = updated_payload.visual_asset_requirements[2].model_dump()
    assert asset_c_updated == asset_c_initial


def test_scene_asset_regeneration_invalid_scene_id_rejection(tmp_path):
    f02_payload = build_mock_floor02_payload()
    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    inp = Floor03Input(floor02_payload=f02_payload, request_id="req-regen-invalid-1")
    initial_payload = pipeline.execute(inp)

    with pytest.raises(Floor03ValidationError) as exc_info:
        pipeline.regenerate_scene_assets(
            current_payload=initial_payload,
            target_scene_id="non-existent-scene-id-999",
            new_prompt_instruction="Should fail",
        )

    assert "not found" in str(exc_info.value)
