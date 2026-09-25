"""Canonical Floor 03 Asset Plan IR.

The IR is specification-only: it describes what downstream media execution
must realize without owning providers, rendering engines, credentials,
or F07 authority.
"""

from __future__ import annotations

from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class CoverageRole(str, Enum):
    ESTABLISH = "establish"
    ACTION = "action"
    REACTION = "reaction"
    DETAIL = "detail"
    TRANSITION = "transition"
    PAYOFF = "payoff"
    OVERLAY = "overlay"


class VisualShotType(str, Enum):
    BROLL = "BROLL"
    ESTABLISHING = "ESTABLISHING"
    CLOSEUP = "CLOSEUP"
    OVERLAY = "OVERLAY"
    CHARACTER = "CHARACTER"
    DIAGRAM = "DIAGRAM"
    TEXT = "TEXT"


class ContinuityMode(str, Enum):
    INDEPENDENT = "independent"
    STRICT = "strict"
    SCENE_END = "scene_end"
    CHAIN_FROM_PREVIOUS = "chain_from_previous"
    REANCHOR = "reanchor"


class ReferenceUse(str, Enum):
    CHARACTER_IDENTITY = "reference_character"
    PROP = "reference_prop"
    COMPOSITION = "reference_composition"
    STYLE = "reference_style"
    STAGE = "reference_stage"
    TARGET_STATE = "reference_target_state"
    FIRST_FRAME = "first_frame"
    LAST_FRAME = "last_frame"
    VIDEO = "reference_video"


class GenerationInputMode(str, Enum):
    TEXT = "text"
    IMAGE_REFERENCE = "image_reference"
    VIDEO_REFERENCE = "video_reference"
    AUDIO_REFERENCE = "audio_reference"
    FIRST_FRAME = "first_frame"
    LAST_FRAME = "last_frame"


class RepairScope(str, Enum):
    NODE = "node"
    DEPENDENT_SUBGRAPH = "dependent_subgraph"


class DependencyRelation(str, Enum):
    SCENE_DEPENDENCY = "scene_dependency"
    CONTINUITY_FROM = "continuity_from"
    REFERENCE_FROM = "reference_from"


class SafeRegion(BaseModel):
    model_config = ConfigDict(extra="forbid")

    x: float = Field(..., ge=0.0, le=1.0)
    y: float = Field(..., ge=0.0, le=1.0)
    width: float = Field(..., gt=0.0, le=1.0)
    height: float = Field(..., gt=0.0, le=1.0)

    @model_validator(mode="after")
    def validate_bounds(self) -> "SafeRegion":
        if self.x + self.width > 1.0 or self.y + self.height > 1.0:
            raise ValueError("safe region must remain inside normalized frame bounds")
        return self


class CameraSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shot_type: VisualShotType = VisualShotType.BROLL
    framing: Optional[str] = None
    camera_angle: Optional[str] = None
    camera_height: Optional[str] = None
    lens_profile: Optional[str] = None
    camera_body: Optional[str] = None
    focal_length_mm: Optional[float] = Field(default=None, ge=1.0, le=400.0)
    movement: Optional[str] = None
    subject_position: Optional[str] = None
    safe_text_region: Optional[SafeRegion] = None


class MotionBeat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    start_seconds: float = Field(..., ge=0.0)
    end_seconds: float = Field(..., gt=0.0)
    instruction: str = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_interval(self) -> "MotionBeat":
        if self.end_seconds <= self.start_seconds:
            raise ValueError("motion beat end_seconds must be greater than start_seconds")
        return self


class ReferenceBinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reference_id: str = Field(..., min_length=1)
    use: ReferenceUse
    subject_id: Optional[str] = None
    source_scene_id: Optional[str] = None
    source_asset_id: Optional[str] = None
    required: bool = True


class ContinuityPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: ContinuityMode = ContinuityMode.INDEPENDENT
    chain_from_previous: bool = False
    locked_subject_ids: List[str] = Field(default_factory=list)
    invariant_attributes: List[str] = Field(default_factory=list)
    allowed_changes: List[str] = Field(default_factory=list)
    reanchor_required: bool = False


class RepairPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scope: RepairScope = RepairScope.NODE
    failure_families: List[str] = Field(default_factory=list)
    rationale: Optional[str] = None


class VisualPromptPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_text: str = Field(..., min_length=1)
    negative_prompt: Optional[str] = None
    lighting: Optional[str] = None
    camera: CameraSpec = Field(default_factory=CameraSpec)
    style_tokens: List[str] = Field(default_factory=list)
    subject_constraints: List[str] = Field(default_factory=list)
    references: List[ReferenceBinding] = Field(default_factory=list)
    continuity: ContinuityPlan = Field(default_factory=ContinuityPlan)
    motion_beats: List[MotionBeat] = Field(default_factory=list)
    start_state: Optional[str] = None
    end_state: Optional[str] = None
    generation_inputs: List[GenerationInputMode] = Field(
        default_factory=lambda: [GenerationInputMode.TEXT]
    )


class AssetDependency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(..., min_length=1)
    scene_id: Optional[str] = None
    relation: DependencyRelation


class AssetPlanNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scene_id: str = Field(..., min_length=1)
    source_scene_version: int = Field(default=1, ge=1)
    source_beat_id: Optional[str] = None
    sequence_index: int = Field(..., ge=1)
    coverage_role: CoverageRole = CoverageRole.ACTION
    visual: VisualPromptPlan
    dependencies: List[AssetDependency] = Field(default_factory=list)
    target_duration_seconds: float = Field(..., ge=0.0)
    evidence_refs: List[str] = Field(default_factory=list)
    causal_event_ids: List[str] = Field(default_factory=list)
    impact_radius: List[str] = Field(
        default_factory=list,
        description="Downstream scene IDs whose plans are transitively affected by this node.",
    )
    repair: RepairPlan = Field(default_factory=RepairPlan)


class AssetPlanIR(BaseModel):
    """Deterministic, versioned, provider-neutral plan consumed downstream."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = "1.2.0"
    plan_id: str = Field(..., min_length=1)
    plan_version: int = Field(default=1, ge=1)
    plan_fingerprint: Optional[str] = None
    script_id: str = Field(..., min_length=1)
    script_version: int = Field(..., ge=1)
    platform: str = Field(..., min_length=1)
    aspect_ratio: str = Field(..., min_length=1)
    resolution: str = Field(..., min_length=1)
    nodes: List[AssetPlanNode] = Field(..., min_length=1)
