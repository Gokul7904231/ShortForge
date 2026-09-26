"""Contract tests for the provider-neutral Floor 03 AssetPlanIR."""

import pytest
from pydantic import ValidationError

from floors.floor03_asset_realization.app.domain.asset_plan_ir import (
    AssetDependency,
    AssetPlanIR,
    AssetPlanNode,
    ConditioningSpec,
    ConditioningType,
    ContinuityPlan,
    DependencyRelation,
    GenerationInputMode,
    PlanLineage,
    ReferenceBinding,
    ReferenceUse,
    VisualPromptPlan,
)
from floors.floor03_asset_realization.app.core.identity import stable_sha256


def _lineage() -> PlanLineage:
    return PlanLineage(
        source_floor_id="floor02_scripting",
        source_floor_version="2.0.0",
        source_script_id="script-1",
        source_script_version=1,
        source_fingerprint=stable_sha256({"script": 1}),
        compiler_floor_id="floor03_asset_realization",
        compiler_floor_version="2.3.0",
    )


def _node(
    scene_id: str,
    asset_id: str,
    sequence_index: int,
    *,
    dependency=None,
    node_fingerprint=None,
    references=None,
    conditionings=None,
):
    references = references or []
    conditionings = conditionings or []
    visual = VisualPromptPlan(
        prompt_text=f"scene {scene_id}",
        references=references,
        continuity=ContinuityPlan(),
        generation_inputs=[GenerationInputMode.TEXT],
        conditionings=conditionings,
    )
    return AssetPlanNode(
        scene_id=scene_id,
        asset_id=asset_id,
        sequence_index=sequence_index,
        node_fingerprint=node_fingerprint or stable_sha256({"node": scene_id}),
        visual=visual,
        dependencies=[dependency] if dependency else [],
        impact_radius=[],
    )


def test_conditioning_must_bind_to_reference():
    ref = ReferenceBinding(
        reference_id="char-1",
        use=ReferenceUse.CHARACTER_IDENTITY,
        entity_ref="character:char-1",
        traits=["identity"],
    )
    conditioning = ConditioningSpec(
        conditioning_type=ConditioningType.IDENTITY,
        reference_id="unknown-reference",
    )
    node = _node(
        "scene-1",
        "asset-1",
        1,
        references=[ref],
        conditionings=[conditioning],
    )

    with pytest.raises(ValidationError, match="conditioning"):
        AssetPlanIR(
            plan_id="plan-1",
            script_id="script-1",
            script_version=1,
            platform="youtube_shorts",
            aspect_ratio="9:16",
            resolution="1080x1920",
            source_fingerprint=stable_sha256({"source": 1}),
            lineage=_lineage(),
            nodes=[node],
        )


def test_dependency_fingerprint_tracks_upstream_node_version():
    node_a = _node("scene-a", "asset-a", 1)
    node_b = _node(
        "scene-b",
        "asset-b",
        2,
        dependency=AssetDependency(
            asset_id="asset-a",
            scene_id="scene-a",
            relation=DependencyRelation.SCENE_DEPENDENCY,
            dependency_node_fingerprint=node_a.node_fingerprint,
        ),
    )
    AssetPlanIR(
        plan_id="plan-2",
        script_id="script-1",
        script_version=1,
        platform="youtube_shorts",
        aspect_ratio="9:16",
        resolution="1080x1920",
        source_fingerprint=stable_sha256({"source": 2}),
        lineage=_lineage(),
        nodes=[node_a, node_b],
    )

    stale_dependency = node_b.dependencies[0].model_copy(
        update={"dependency_node_fingerprint": stable_sha256({"node": "stale"})}
    )
    stale_node = node_b.model_copy(update={"dependencies": [stale_dependency]})
    with pytest.raises(ValidationError, match="dependency node fingerprint mismatch"):
        AssetPlanIR(
            plan_id="plan-3",
            script_id="script-1",
            script_version=1,
            platform="youtube_shorts",
            aspect_ratio="9:16",
            resolution="1080x1920",
            source_fingerprint=stable_sha256({"source": 3}),
            lineage=_lineage(),
            nodes=[node_a, stale_node],
        )
