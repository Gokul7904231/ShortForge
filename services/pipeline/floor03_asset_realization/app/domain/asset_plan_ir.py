"""Canonical Floor 03 Asset Plan IR.

The IR is specification-only: it describes what downstream media execution
must realize without owning providers, rendering engines, credentials, or F07
authority.

The shape deliberately borrows clean-room patterns from media asset
interoperability, graph execution, modular conditioning, and lineage systems:
stable asset identity, explicit dependencies, typed conditioning, repair impact,
and reproducible provenance.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class VisualShotType(str, Enum):
    BROLL = "BROLL"
    ESTABLISHING = "ESTABLISHING"
    CLOSEUP = "CLOSEUP"
    OVERLAY = "OVERLAY"
    CHARACTER = "CHARACTER"
    DIAGRAM = "DIAGRAM"
    TEXT = "TEXT"


class ConditioningType(str, Enum):
    REFERENCE_IMAGE = "reference_image"
    IDENTITY = "identity"
    STYLE = "style"
    DEPTH = "depth"
    POSE = "pose"
    EDGE = "edge"
    MOTION = "motion"
    KEYFRAME = "keyframe"
    SKETCH = "sketch"
    MASK = "mask"


class CameraSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shot_type: VisualShotType = VisualShotType.BROLL
    framing: Optional[str] = None
    camera_angle: Optional[str] = None
    focal_length_mm: Optional[float] = Field(default=None, ge=1.0, le=400.0)
    movement: Optional[str] = None
    subject_position: Optional[str] = None
    safe_text_region: Optional[str] = None


class AssetReference(BaseModel):
    """Provider-neutral logical reference to a managed asset.

    The entity_ref is intentionally opaque: F03 identifies what should be
    referenced, while an external resolver decides where/how it is obtained.
    """

    model_config = ConfigDict(extra="forbid")

    reference_id: str = Field(..., min_length=1)
    entity_ref: str = Field(..., min_length=1)
    role: str = Field(..., min_length=1)
    version_selector: Optional[str] = None
    traits: List[str] = Field(default_factory=list)


class ConditioningSpec(BaseModel):
    """A provider-neutral control signal for downstream visual generation."""

    model_config = ConfigDict(extra="forbid")

    conditioning_type: ConditioningType
    reference_id: str = Field(..., min_length=1)
    strength: float = Field(default=1.0, ge=0.0, le=2.0)
    start_fraction: float = Field(default=0.0, ge=0.0, le=1.0)
    end_fraction: float = Field(default=1.0, ge=0.0, le=1.0)
    target_time_seconds: Optional[float] = Field(default=None, ge=0.0)
    required: bool = True

    @model_validator(mode="after")
    def validate_window(self) -> "ConditioningSpec":
        if self.end_fraction < self.start_fraction:
            raise ValueError("end_fraction must be greater than or equal to start_fraction")
        return self


class VisualPromptPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_text: str = Field(..., min_length=1)
    negative_prompt: Optional[str] = None
    camera: CameraSpec = Field(default_factory=CameraSpec)
    style_tokens: List[str] = Field(default_factory=list)
    visual_references: List[str] = Field(default_factory=list)
    reference_assets: List[AssetReference] = Field(default_factory=list)
    conditionings: List[ConditioningSpec] = Field(default_factory=list)
    continuity_keys: List[str] = Field(default_factory=list)


class AssetDependency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1)


class AssetPlanNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(..., min_length=1)
    asset_version: int = Field(default=1, ge=1)
    scene_id: str = Field(..., min_length=1)
    scene_version: int = Field(default=1, ge=1)
    sequence_index: int = Field(..., ge=1)
    visual: VisualPromptPlan
    dependencies: List[AssetDependency] = Field(default_factory=list)
    target_duration_seconds: float = Field(..., ge=0.0)
    # Downstream scene IDs transitively affected when this node changes.
    impact_radius: List[str] = Field(default_factory=list)
    # Stable node-level cache/replay key. It excludes impact_radius because
    # repair topology must not invalidate an otherwise identical asset spec.
    node_fingerprint: str = Field(..., min_length=64, max_length=64)


class PlanProvenance(BaseModel):
    model_config = ConfigDict(extra="forbid")

    producer: str = Field(default="shortforge/floor03", min_length=1)
    source_floor_id: str = Field(default="floor02_scripting", min_length=1)
    source_script_id: str = Field(..., min_length=1)
    source_script_version: int = Field(..., ge=1)
    input_fingerprint: str = Field(..., min_length=64, max_length=64)
    compiler_version: str = Field(..., min_length=1)


class AssetPlanIR(BaseModel):
    """Deterministic, versioned, provider-neutral plan consumed by F04/F05."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = "1.1.0"
    plan_id: str = Field(..., min_length=1)
    plan_version: int = Field(default=1, ge=1)
    script_id: str = Field(..., min_length=1)
    script_version: int = Field(..., ge=1)
    platform: str = Field(..., min_length=1)
    aspect_ratio: str = Field(..., min_length=1)
    resolution: str = Field(..., min_length=1)
    provenance: PlanProvenance
    nodes: List[AssetPlanNode] = Field(..., min_length=1)
    content_fingerprint: str = Field(..., min_length=64, max_length=64)

    @model_validator(mode="after")
    def validate_graph(self) -> "AssetPlanIR":
        scene_ids = [node.scene_id for node in self.nodes]
        if len(scene_ids) != len(set(scene_ids)):
            raise ValueError("AssetPlanIR scene_id values must be unique")

        sequence_indexes = [node.sequence_index for node in self.nodes]
        if len(sequence_indexes) != len(set(sequence_indexes)):
            raise ValueError("AssetPlanIR sequence_index values must be unique")

        asset_ids = {node.asset_id for node in self.nodes}
        if len(asset_ids) != len(self.nodes):
            raise ValueError("AssetPlanIR asset_id values must be unique")

        scene_by_asset = {node.asset_id: node.scene_id for node in self.nodes}
        scene_set = set(scene_ids)

        graph = {node.scene_id: [] for node in self.nodes}
        for node in self.nodes:
            for dep in node.dependencies:
                dep_scene_id = scene_by_asset.get(dep.asset_id)
                if dep_scene_id is None:
                    raise ValueError(
                        f"AssetPlanIR dependency '{dep.asset_id}' is not present in the plan"
                    )
                if dep_scene_id == node.scene_id:
                    raise ValueError(
                        f"AssetPlanIR node '{node.scene_id}' cannot depend on itself"
                    )
                graph[dep_scene_id].append(node.scene_id)

            unknown_impact = [scene_id for scene_id in node.impact_radius if scene_id not in scene_set]
            if unknown_impact:
                raise ValueError(
                    f"AssetPlanIR node '{node.scene_id}' references unknown impact scenes: {unknown_impact}"
                )

        visit_state: dict[str, int] = {scene_id: 0 for scene_id in graph}

        def visit(scene_id: str) -> None:
            visit_state[scene_id] = 1
            for downstream_scene_id in graph[scene_id]:
                if visit_state[downstream_scene_id] == 1:
                    raise ValueError("AssetPlanIR dependency graph contains a cycle")
                if visit_state[downstream_scene_id] == 0:
                    visit(downstream_scene_id)
            visit_state[scene_id] = 2

        for scene_id in graph:
            if visit_state[scene_id] == 0:
                visit(scene_id)

        return self
