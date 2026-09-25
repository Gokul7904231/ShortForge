"""Domain models and handoff contracts for Floor 06 Video Rendering & Compute Appliance."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field

from factoryos.guardian.contracts.guardian_state import ExecutionMode
from floors.floor05_timeline_composition.app.domain.handoff import Floor05HandoffPayload


class RenderWorkerPool(str, Enum):
    GITHUB_ACTIONS = "github-actions-pool"
    LOCAL_VPS = "local-vps-pool"


class RenderArtifactStatus(str, Enum):
    PENDING = "PENDING"
    RENDERING = "RENDERING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    VALIDATED = "VALIDATED"


class Floor06Input(BaseModel):
    """Input parameters for Floor 06 Video Rendering."""

    model_config = ConfigDict(extra="forbid")

    execution_id: UUID = Field(default_factory=uuid4)
    run_id: str = Field(...)
    user_id: str = Field(...)
    user_role: str = Field(default="VIEWER")
    timeline_payload: Floor05HandoffPayload = Field(...)
    worker_pool_override: Optional[RenderWorkerPool] = Field(default=None)
    output_resolution: Dict[str, int] = Field(default_factory=lambda: {"width": 1080, "height": 1920, "fps": 30})


class RenderOutputMetadata(BaseModel):
    """Metadata of the final rendered video artifact."""

    model_config = ConfigDict(extra="forbid")

    video_file_path: str = Field(...)
    mime_type: str = Field(default="video/mp4")
    file_size_bytes: int = Field(..., ge=0)
    duration_seconds: float = Field(..., gt=0.0)
    resolution_width: int = Field(default=1080)
    resolution_height: int = Field(default=1920)
    has_audio: bool = Field(default=True)
    assigned_worker_id: str = Field(...)
    render_duration_ms: int = Field(..., ge=0)


class Floor06HandoffPayload(BaseModel):
    """Authoritative output package emitted by Floor 06 upon successful video render."""

    model_config = ConfigDict(extra="forbid")

    handoff_id: UUID = Field(default_factory=uuid4)
    execution_id: UUID = Field(...)
    run_id: str = Field(...)
    user_id: str = Field(...)
    user_role: str = Field(...)
    status: RenderArtifactStatus = Field(default=RenderArtifactStatus.VALIDATED)
    render_metadata: RenderOutputMetadata = Field(...)
    timeline_handoff: Floor05HandoffPayload = Field(...)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
