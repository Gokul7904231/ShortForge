"""Domain contracts for Floor 06 Video Rendering & Compute."""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Dict, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from factoryos.guardian.contracts.guardian_state import ExecutionMode
from floors.floor05_timeline_composition.app.domain.handoff import Floor05HandoffPayload, RenderJobState


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
    """Only accepts a physically and semantically committed Floor 05 handoff."""

    model_config = ConfigDict(extra="forbid")

    execution_id: UUID = Field(default_factory=uuid4)
    run_id: str = Field(...)
    user_id: str = Field(...)
    user_role: str = Field(default="VIEWER")
    timeline_payload: Floor05HandoffPayload = Field(...)
    worker_pool_override: Optional[RenderWorkerPool] = Field(default=None)
    output_resolution: Dict[str, int] = Field(
        default_factory=lambda: {"width": 1080, "height": 1920, "fps": 30}
    )

    @model_validator(mode="after")
    def validate_f05_boundary(self) -> "Floor06Input":
        f05 = self.timeline_payload
        if f05.render_job.state != RenderJobState.COMMITTED:
            raise ValueError("F06 requires a COMMITTED Floor 05 render job.")
        if f05.render_job.artifact_sha256 != f05.sha256_checksum:
            raise ValueError("F06 requires the exact F05 artifact SHA-256.")
        if f05.render_job.artifact_size_bytes != f05.file_size_bytes:
            raise ValueError("F06 requires the exact F05 artifact byte length.")
        if f05.render_job.timeline_id != f05.timeline_spec.timeline_id:
            raise ValueError("F06 requires render job and TimelineSpec identity alignment.")
        if self.output_resolution.get("width") != f05.timeline_spec.target_width:
            raise ValueError("F06 output width must match the committed F05 timeline.")
        if self.output_resolution.get("height") != f05.timeline_spec.target_height:
            raise ValueError("F06 output height must match the committed F05 timeline.")
        if self.output_resolution.get("fps") != f05.timeline_spec.target_fps:
            raise ValueError("F06 output fps must match the committed F05 timeline.")
        return self


class RenderOutputMetadata(BaseModel):
    """Metadata of the final rendered video artifact."""

    model_config = ConfigDict(extra="forbid")

    video_file_path: str = Field(...)
    mime_type: str = Field(default="video/mp4")
    file_size_bytes: int = Field(..., gt=0)
    duration_seconds: float = Field(..., gt=0.0)
    resolution_width: int = Field(default=1080, gt=0)
    resolution_height: int = Field(default=1920, gt=0)
    frame_rate: float = Field(default=30.0, gt=0.0)
    has_audio: bool = Field(default=True)
    sha256_checksum: str = Field(..., min_length=64, max_length=64)
    assigned_worker_id: str = Field(...)
    render_duration_ms: int = Field(..., ge=0)
    source_timeline_fingerprint: str = Field(..., min_length=64, max_length=64)
    source_render_input_hash: str = Field(..., min_length=64, max_length=64)
    source_f05_artifact_sha256: str = Field(..., min_length=64, max_length=64)
    source_f05_artifact_size_bytes: int = Field(..., gt=0)


class Floor06HandoffPayload(BaseModel):
    """Authoritative output package emitted by Floor 06 after render verification."""

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

    @model_validator(mode="after")
    def validate_output_lineage(self) -> "Floor06HandoffPayload":
        f05 = self.timeline_handoff
        metadata = self.render_metadata
        if metadata.source_timeline_fingerprint != f05.timeline_fingerprint:
            raise ValueError("F06 output provenance must point at the exact F05 timeline fingerprint.")
        if metadata.source_render_input_hash != f05.render_job.render_input_hash:
            raise ValueError("F06 output provenance must point at the exact F05 render input hash.")
        if metadata.source_f05_artifact_sha256 != f05.sha256_checksum:
            raise ValueError("F06 output must preserve the exact F05 source artifact checksum.")
        if metadata.source_f05_artifact_size_bytes != f05.file_size_bytes:
            raise ValueError("F06 output must preserve the exact F05 source artifact byte length.")
        return self
