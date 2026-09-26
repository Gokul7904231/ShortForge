"""Domain models and handoff contracts for Floor 05 Timeline Composition & Video Assembly."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from factoryos.guardian.contracts.guardian_state import ExecutionMode
from floors.floor02_scripting.app.domain.handoff import HandoffStatus
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload


class TimelineTrackType(str, Enum):
    VISUAL = "VISUAL"
    NARRATION = "NARRATION"
    BACKGROUND_AUDIO = "BACKGROUND_AUDIO"
    SFX = "SFX"
    SUBTITLE = "SUBTITLE"
    OVERLAY = "OVERLAY"


class RenderJobState(str, Enum):
    REQUESTED = "REQUESTED"
    PROPOSED = "PROPOSED"
    AUTHORIZED = "AUTHORIZED"
    PREPARED = "PREPARED"
    DISPATCHED = "DISPATCHED"
    RENDERING = "RENDERING"
    ARTIFACT_RECEIVED = "ARTIFACT_RECEIVED"
    PHYSICAL_VALIDATION = "PHYSICAL_VALIDATION"
    SEMANTIC_VALIDATION = "SEMANTIC_VALIDATION"
    COMMITTED = "COMMITTED"
    ROLLED_BACK = "ROLLED_BACK"
    RECONCILIATION_REQUIRED = "RECONCILIATION_REQUIRED"
    ORPHANED = "ORPHANED"


class TimelineClip(BaseModel):
    """Clip placed on a timeline track with temporal boundaries and asset version snapshotting."""

    model_config = ConfigDict(extra="forbid")

    clip_id: str = Field(...)
    track_type: TimelineTrackType = Field(...)
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., gt=0.0)
    source_asset_id: str = Field(...)
    source_asset_version: str = Field(default="1.0.0")
    source_file_path: str = Field(...)
    volume: float = Field(default=1.0, ge=0.0, le=2.0)
    trim_start: float = Field(default=0.0, ge=0.0)
    trim_end: Optional[float] = Field(default=None, ge=0.0)

    @property
    def duration(self) -> float:
        return self.end_time - self.start_time


class SubtitleItem(BaseModel):
    """Subtitle caption text item aligned to narration timeline timestamps."""

    model_config = ConfigDict(extra="forbid")

    subtitle_id: str = Field(...)
    scene_id: str = Field(...)
    text: str = Field(...)
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., gt=0.0)
    position: str = Field(default="bottom_center")
    font_style: str = Field(default="sans_serif_bold")


class TransitionSpec(BaseModel):
    """Visual transition spec between scene clips."""

    model_config = ConfigDict(extra="forbid")

    transition_id: str = Field(...)
    from_scene_id: str = Field(...)
    to_scene_id: str = Field(...)
    transition_type: str = Field(default="CROSSFADE")
    duration_seconds: float = Field(default=0.5, gt=0.0)


class TimelineSpec(BaseModel):
    """Master timeline specification holding tracks, clips, and target output properties."""

    model_config = ConfigDict(extra="forbid")

    timeline_id: str = Field(...)
    version: str = Field(default="1.0.0")
    target_width: int = Field(..., gt=0)
    target_height: int = Field(..., gt=0)
    target_fps: int = Field(..., gt=0)
    aspect_ratio: str = Field(...)
    total_duration_seconds: float = Field(..., gt=0.0)
    clips: List[TimelineClip] = Field(default_factory=list)
    subtitles: List[SubtitleItem] = Field(default_factory=list)
    transitions: List[TransitionSpec] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RenderJobSpecification(BaseModel):
    """Authorized render job specification with canonical hash identity."""

    model_config = ConfigDict(extra="forbid")

    render_job_id: str = Field(...)
    request_id: str = Field(...)
    execution_id: UUID = Field(default_factory=uuid4)
    timeline_id: str = Field(...)
    timeline_version: str = Field(default="1.0.0")
    render_input_hash: str = Field(...)
    renderer_id: str = Field(default="vps_ffmpeg_reference_renderer")
    renderer_version: str = Field(default="1.0.0")
    authorization_reference: str = Field(...)
    attempt_id: int = Field(default=1, ge=1)
    idempotency_key: str = Field(...)
    state: RenderJobState = Field(default=RenderJobState.REQUESTED)
    output_container: str = Field(default="mp4")
    output_video_codec: str = Field(default="h264")
    output_audio_codec: str = Field(default="aac")
    artifact_reference: Optional[str] = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = Field(default=None)


class Floor05Input(BaseModel):
    """Input payload for Floor 05 execution.

    F03 and F04 are independent predecessors. The typed F03 handoff is carried
    explicitly so Floor 05 never recovers F03 semantics indirectly from F04.
    """

    model_config = ConfigDict(extra="forbid")

    floor03_payload: Floor03HandoffPayload = Field(...)
    floor04_payload: Floor04HandoffPayload = Field(...)
    request_id: Optional[str] = Field(default=None)
    target_fps: int = Field(default=30, gt=0)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.HYBRID)

    @model_validator(mode="after")
    def validate_join(self) -> "Floor05Input":
        nested_f03 = self.floor04_payload.floor03_payload
        if (
            nested_f03.asset_plan_id != self.floor03_payload.asset_plan_id
            or nested_f03.asset_plan_version != self.floor03_payload.asset_plan_version
            or nested_f03.script_id != self.floor03_payload.script_id
            or nested_f03.script_version != self.floor03_payload.script_version
        ):
            raise ValueError(
                "F03/F04 join mismatch: floor03_payload must match the F03 lineage embedded in floor04_payload."
            )
        if self.floor03_payload.handoff_status != HandoffStatus.VALIDATED:
            raise ValueError("F03 handoff must be VALIDATED before Floor 05 execution.")
        return self


class Floor05HandoffPayload(BaseModel):
    """Authoritative handoff payload produced by Floor 05 for Floor 07."""

    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(...)
    execution_id: UUID = Field(default_factory=uuid4)
    floor03_payload: Floor03HandoffPayload = Field(...)
    floor04_payload: Floor04HandoffPayload = Field(...)
    timeline_spec: TimelineSpec = Field(...)
    render_job: RenderJobSpecification = Field(...)
    rendered_video_path: str = Field(...)
    rendered_thumbnail_path: str = Field(...)
    subtitle_file_path: Optional[str] = Field(default=None)
    sha256_checksum: str = Field(...)
    file_size_bytes: int = Field(..., gt=0)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.HYBRID)
    provenance_hash: str = Field(...)
    version: str = Field(default="1.0.0")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
