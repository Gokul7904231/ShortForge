"""Canonical Floor 03 Asset Plan IR.

The IR is intentionally specification-only: it describes what downstream media
execution must realize without owning providers, rendering engines, or F07 authority.
"""

from __future__ import annotations

from enum import Enum
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class VisualShotType(str, Enum):
    BROLL = "BROLL"
    ESTABLISHING = "ESTABLISHING"
    CLOSEUP = "CLOSEUP"
    OVERLAY = "OVERLAY"
    CHARACTER = "CHARACTER"
    DIAGRAM = "DIAGRAM"
    TEXT = "TEXT"


class CameraSpec(BaseModel):
    model_config = ConfigDict(extra="forbid")

    shot_type: VisualShotType = VisualShotType.BROLL
    framing: Optional[str] = None
    camera_angle: Optional[str] = None
    focal_length_mm: Optional[float] = Field(default=None, ge=1.0, le=400.0)
    movement: Optional[str] = None
    subject_position: Optional[str] = None
    safe_text_region: Optional[str] = None


class VisualPromptPlan(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prompt_text: str = Field(..., min_length=1)
    negative_prompt: Optional[str] = None
    camera: CameraSpec = Field(default_factory=CameraSpec)
    style_tokens: List[str] = Field(default_factory=list)
    visual_references: List[str] = Field(default_factory=list)
    continuity_keys: List[str] = Field(default_factory=list)


class AssetDependency(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(..., min_length=1)
    relation: str = Field(..., min_length=1)


class AssetPlanNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scene_id: str = Field(..., min_length=1)
    sequence_index: int = Field(..., ge=1)
    visual: VisualPromptPlan
    dependencies: List[AssetDependency] = Field(default_factory=list)
    target_duration_seconds: float = Field(..., ge=0.0)
    impact_radius: List[str] = Field(default_factory=list)


class AssetPlanIR(BaseModel):
    """Deterministic, versioned, provider-neutral plan consumed by F04/F05."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = "1.0.0"
    plan_id: str = Field(..., min_length=1)
    plan_version: int = Field(default=1, ge=1)
    script_id: str = Field(..., min_length=1)
    script_version: int = Field(..., ge=1)
    platform: str = Field(..., min_length=1)
    aspect_ratio: str = Field(..., min_length=1)
    resolution: str = Field(..., min_length=1)
    nodes: List[AssetPlanNode] = Field(..., min_length=1)
