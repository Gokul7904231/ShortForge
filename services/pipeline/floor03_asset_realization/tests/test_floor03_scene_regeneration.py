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


def test_asset_plan_dependency_edges_and_impact_radius_survive_regeneration(tmp_path):
    f02_payload = build_mock_floor02_payload()
    f02_payload.scenes[1].depends_on_scene_ids = [f02_payload.scenes[0].scene_id]
    f02_payload.scenes[2].depends_on_scene_ids = [f02_payload.scenes[1].scene_id]

    store = AssetMemoryStore(storage_path=str(tmp_path / "memory.json"))
    pipeline = Floor03Pipeline(memory_store=store)
    initial_payload = pipeline.execute(
        Floor03Input(floor02_payload=f02_payload, request_id="req-regen-graph-1")
    )
    plan = initial_payload.asset_plan_ir
    assert plan is not None

    nodes = {node.scene_id: node for node in plan.nodes}
    scene_a = f02_payload.scenes[0].scene_id
    scene_b = f02_payload.scenes[1].scene_id
    scene_c = f02_payload.scenes[2].scene_id

    assert [dep.scene_id for dep in nodes[scene_b].dependencies] == [scene_a]
    assert [dep.scene_id for dep in nodes[scene_c].dependencies] == [scene_b]
    assert nodes[scene_a].impact_radius == [scene_b, scene_c]
    assert nodes[scene_b].impact_radius == [scene_c]
    assert nodes[scene_c].impact_radius == []

    old_scene_a_asset = next(
        req.asset_id for req in initial_payload.visual_asset_requirements if req.scene_id == scene_a
    )

    updated_payload = pipeline.regenerate_scene_assets(
        current_payload=initial_payload,
        target_scene_id=scene_a,
        new_prompt_instruction="repair upstream reference",
    )
    updated_plan = updated_payload.asset_plan_ir
    assert updated_plan is not None
    updated_nodes = {node.scene_id: node for node in updated_plan.nodes}
    new_scene_a_asset = next(
        req.asset_id for req in updated_payload.visual_asset_requirements if req.scene_id == scene_a
    )

    assert new_scene_a_asset != old_scene_a_asset
    assert updated_nodes[scene_b].dependencies[0].scene_id == scene_a
    assert updated_nodes[scene_b].dependencies[0].asset_id == new_scene_a_asset
    assert updated_nodes[scene_c].dependencies[0].scene_id == scene_b
    assert updated_nodes[scene_a].impact_radius == [scene_b, scene_c]
    assert updated_nodes[scene_b].impact_radius == [scene_c]


def test_asset_plan_rejects_unknown_or_cyclic_scene_dependencies(tmp_path):
    f02_payload = build_mock_floor02_payload()
    f02_payload.scenes[1].depends_on_scene_ids = ["does-not-exist"]

    pipeline = Floor03Pipeline(
        memory_store=AssetMemoryStore(storage_path=str(tmp_path / "missing-memory.json"))
    )
    with pytest.raises(Floor03ValidationError, match="missing dependency"):
        pipeline.execute(
            Floor03Input(floor02_payload=f02_payload, request_id="req-invalid-graph-1")
        )

    f02_cycle = build_mock_floor02_payload()
    scene_a = f02_cycle.scenes[0].scene_id
    scene_b = f02_cycle.scenes[1].scene_id
    f02_cycle.scenes[0].depends_on_scene_ids = [scene_b]
    f02_cycle.scenes[1].depends_on_scene_ids = [scene_a]

    with pytest.raises(Floor03ValidationError):
        pipeline.execute(
            Floor03Input(floor02_payload=f02_cycle, request_id="req-invalid-graph-2")
        )
