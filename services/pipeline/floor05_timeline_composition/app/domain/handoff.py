"""Domain models and handoff contracts for Floor 05 Timeline Composition & Video Assembly."""
from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from enum import Enum
from fractions import Fraction
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from factoryos.guardian.contracts.guardian_state import ExecutionMode
from floors.floor02_scripting.app.domain.handoff import HandoffStatus
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload


class GuardianAuthorizationContext(BaseModel):
    """Execution authorization evidence injected by Guardian immediately before a worker runs."""

    model_config = ConfigDict(extra="forbid")

    decision_id: str = Field(..., min_length=1)
    execution_id: str = Field(..., min_length=1)
    floor_id: str = Field(..., min_length=1)
    capability_name: str = Field(..., min_length=1)
    authorized_by: str = Field(default="GUARDIAN_ACTION_GATE", min_length=1)

    @model_validator(mode="after")
    def validate_floor_scope(self) -> "GuardianAuthorizationContext":
        if self.floor_id != "floor05":
            raise ValueError("Floor 05 authorization context must be scoped to floor05.")
        if self.capability_name != "timeline_composition_pipeline_worker":
            raise ValueError("Floor 05 authorization context must name the canonical F05 worker capability.")
        if self.authorized_by != "GUARDIAN_ACTION_GATE":
            raise ValueError("Floor 05 execution requires the Guardian action gate authorization source.")
        return self


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


_ALLOWED_RENDER_TRANSITIONS = {
    RenderJobState.REQUESTED: {RenderJobState.PROPOSED, RenderJobState.AUTHORIZED, RenderJobState.RENDERING},
    RenderJobState.PROPOSED: {RenderJobState.AUTHORIZED, RenderJobState.ROLLED_BACK},
    RenderJobState.AUTHORIZED: {RenderJobState.PREPARED, RenderJobState.RENDERING, RenderJobState.ROLLED_BACK},
    RenderJobState.PREPARED: {RenderJobState.DISPATCHED, RenderJobState.RENDERING, RenderJobState.ROLLED_BACK},
    RenderJobState.DISPATCHED: {RenderJobState.RENDERING, RenderJobState.ROLLED_BACK},
    RenderJobState.RENDERING: {RenderJobState.ARTIFACT_RECEIVED, RenderJobState.RECONCILIATION_REQUIRED, RenderJobState.ROLLED_BACK},
    RenderJobState.ARTIFACT_RECEIVED: {RenderJobState.PHYSICAL_VALIDATION, RenderJobState.ROLLED_BACK, RenderJobState.RECONCILIATION_REQUIRED},
    RenderJobState.PHYSICAL_VALIDATION: {RenderJobState.SEMANTIC_VALIDATION, RenderJobState.ROLLED_BACK},
    RenderJobState.SEMANTIC_VALIDATION: {RenderJobState.COMMITTED, RenderJobState.ROLLED_BACK},
    RenderJobState.RECONCILIATION_REQUIRED: {RenderJobState.COMMITTED, RenderJobState.ROLLED_BACK, RenderJobState.ORPHANED},
    RenderJobState.COMMITTED: set(),
    RenderJobState.ROLLED_BACK: set(),
    RenderJobState.ORPHANED: set(),
}


class TimelineTimebase(BaseModel):
    """Exact rational frame rate used as the timeline's temporal authority."""

    model_config = ConfigDict(extra="forbid")

    numerator: int = Field(default=30, gt=0)
    denominator: int = Field(default=1, gt=0)

    @property
    def fps(self) -> float:
        return self.numerator / self.denominator

    def frame_index(self, seconds: float) -> int:
        raw = seconds * self.numerator / self.denominator
        frame = round(raw)
        if abs(raw - frame) > 1e-6:
            raise ValueError(
                f"Timestamp {seconds} seconds is not aligned to the {self.numerator}/{self.denominator} frame grid."
            )
        return frame

    def seconds_for_frame(self, frame: int) -> float:
        return frame * self.denominator / self.numerator


class TimelineClip(BaseModel):
    """Clip placed on a timeline track with exact scene and asset identity."""

    model_config = ConfigDict(extra="forbid")

    clip_id: str = Field(...)
    scene_id: str = Field(...)
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

    @model_validator(mode="after")
    def validate_time_range(self) -> "TimelineClip":
        if self.end_time <= self.start_time:
            raise ValueError(f"TimelineClip {self.clip_id} must have end_time > start_time.")
        if self.trim_end is not None and self.trim_end < self.trim_start:
            raise ValueError(f"TimelineClip {self.clip_id} has trim_end before trim_start.")
        return self


class SubtitleItem(BaseModel):
    """Subtitle caption text item aligned to a scene timeline range."""

    model_config = ConfigDict(extra="forbid")

    subtitle_id: str = Field(...)
    scene_id: str = Field(...)
    text: str = Field(..., min_length=1)
    start_time: float = Field(..., ge=0.0)
    end_time: float = Field(..., gt=0.0)
    position: str = Field(default="bottom_center")
    font_style: str = Field(default="sans_serif_bold")

    @model_validator(mode="after")
    def validate_time_range(self) -> "SubtitleItem":
        if self.end_time <= self.start_time:
            raise ValueError(f"Subtitle {self.subtitle_id} must have end_time > start_time.")
        return self


class TransitionSpec(BaseModel):
    """Explicit transition between two visual scenes."""

    model_config = ConfigDict(extra="forbid")

    transition_id: str = Field(...)
    from_scene_id: str = Field(...)
    to_scene_id: str = Field(...)
    transition_type: str = Field(default="CROSSFADE")
    duration_seconds: float = Field(default=0.5, ge=0.0)


class TimelineSpec(BaseModel):
    """Canonical composition IR. Rational timebase is the temporal source of truth."""

    model_config = ConfigDict(extra="forbid")

    timeline_id: str = Field(...)
    version: str = Field(default="2.0.0")
    schema_version: str = Field(default="2.0.0")
    timebase: TimelineTimebase = Field(default_factory=TimelineTimebase)
    target_width: int = Field(..., gt=0)
    target_height: int = Field(..., gt=0)
    target_fps: int = Field(..., gt=0)
    aspect_ratio: str = Field(...)
    total_duration_seconds: float = Field(..., gt=0.0)
    clips: List[TimelineClip] = Field(default_factory=list)
    subtitles: List[SubtitleItem] = Field(default_factory=list)
    transitions: List[TransitionSpec] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def validate_timeline(self) -> "TimelineSpec":
        if abs(self.timebase.fps - self.target_fps) > 1e-9:
            raise ValueError("Timeline target_fps must match the rational timebase.")

        total_frames = self.timebase.frame_index(self.total_duration_seconds)
        if total_frames <= 0:
            raise ValueError("Timeline must contain at least one frame.")

        clip_ids = [clip.clip_id for clip in self.clips]
        if len(clip_ids) != len(set(clip_ids)):
            raise ValueError("Timeline clip_id values must be unique.")

        scene_ids = {clip.scene_id for clip in self.clips}
        for clip in self.clips:
            self.timebase.frame_index(clip.start_time)
            self.timebase.frame_index(clip.end_time)
            if clip.end_time > self.total_duration_seconds + 1e-6:
                raise ValueError(f"Clip {clip.clip_id} extends beyond total timeline duration.")

        for subtitle in self.subtitles:
            self.timebase.frame_index(subtitle.start_time)
            self.timebase.frame_index(subtitle.end_time)
            if subtitle.end_time > self.total_duration_seconds + 1e-6:
                raise ValueError(f"Subtitle {subtitle.subtitle_id} extends beyond total timeline duration.")
            if subtitle.scene_id not in scene_ids:
                raise ValueError(f"Subtitle {subtitle.subtitle_id} references unknown scene {subtitle.scene_id}.")

        known_scenes = {
            clip.scene_id for clip in self.clips if clip.track_type == TimelineTrackType.VISUAL
        }
        for transition in self.transitions:
            if transition.from_scene_id not in known_scenes or transition.to_scene_id not in known_scenes:
                raise ValueError(
                    f"Transition {transition.transition_id} references an unknown visual scene."
                )
            if transition.duration_seconds < 0:
                raise ValueError(f"Transition {transition.transition_id} cannot have negative duration.")
            self.timebase.frame_index(transition.duration_seconds)

        return self


class RenderJobSpecification(BaseModel):
    """Authorized render job specification with canonical hash identity."""

    model_config = ConfigDict(extra="forbid")

    render_job_id: str = Field(...)
    request_id: str = Field(...)
    execution_id: UUID = Field(default_factory=uuid4)
    timeline_id: str = Field(...)
    timeline_version: str = Field(default="2.0.0")
    render_input_hash: str = Field(..., min_length=64, max_length=64)
    renderer_id: str = Field(default="ffmpeg_reference_renderer")
    renderer_version: str = Field(default="2.0.0")
    authorization_reference: str = Field(...)
    attempt_id: int = Field(default=1, ge=1)
    idempotency_key: str = Field(...)
    state: RenderJobState = Field(default=RenderJobState.REQUESTED)
    output_container: str = Field(default="mp4")
    output_video_codec: str = Field(default="h264")
    output_audio_codec: str = Field(default="aac")
    artifact_reference: Optional[str] = Field(default=None)
    artifact_sha256: Optional[str] = Field(default=None, min_length=64, max_length=64)
    artifact_size_bytes: Optional[int] = Field(default=None, gt=0)
    artifact_duration_seconds: Optional[float] = Field(default=None, gt=0.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = Field(default=None)

    def transition_to(self, new_state: RenderJobState) -> None:
        if new_state == self.state:
            return
        allowed = _ALLOWED_RENDER_TRANSITIONS[self.state]
        if new_state not in allowed:
            raise ValueError(f"Illegal render job state transition: {self.state.value} -> {new_state.value}")
        self.state = new_state


class Floor05Input(BaseModel):
    """Converged input from the independently verified F03 and F04 predecessors."""

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

        expected_plan_fingerprint = self.floor03_payload.asset_plan_ir.plan_fingerprint
        if not expected_plan_fingerprint:
            raise ValueError("F05 requires a typed F03 AssetPlanIR fingerprint.")

        if self.floor04_payload.source_asset_plan_fingerprint != expected_plan_fingerprint:
            raise ValueError(
                "F04/F05 join mismatch: Floor 04 media must be derived from the exact F03 AssetPlanIR."
            )
        return self

    def semantic_fingerprint(self) -> str:
        payload = (
            f"{self.floor03_payload.asset_plan_ir.plan_fingerprint}:"
            f"{self.floor04_payload.provenance_hash}:"
            f"{self.target_fps}:"
            f"{self.execution_mode.value}"
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class Floor05HandoffPayload(BaseModel):
    """Authoritative output package emitted by Floor 05 for Floor 06 rendering."""

    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(...)
    execution_id: UUID = Field(default_factory=uuid4)
    floor03_payload: Floor03HandoffPayload = Field(...)
    floor04_payload: Floor04HandoffPayload = Field(...)
    timeline_spec: TimelineSpec = Field(...)
    timeline_fingerprint: str = Field(..., min_length=64, max_length=64)
    render_job: RenderJobSpecification = Field(...)
    rendered_video_path: str = Field(...)
    rendered_thumbnail_path: str = Field(...)
    subtitle_file_path: Optional[str] = Field(default=None)
    sha256_checksum: str = Field(..., min_length=64, max_length=64)
    file_size_bytes: int = Field(..., gt=0)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.HYBRID)
    provenance_hash: str = Field(..., min_length=64, max_length=64)
    ffprobe_summary: Dict[str, Any] = Field(default_factory=dict)
    canonical_timeline_ir_path: Optional[str] = Field(default=None)
    canonical_timeline_ir_fingerprint: Optional[str] = Field(default=None, min_length=64, max_length=64)
    version: str = Field(default="2.1.0")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def validate_contract(self) -> "Floor05HandoffPayload":
        expected_plan_fingerprint = self.floor03_payload.asset_plan_ir.plan_fingerprint
        if not expected_plan_fingerprint:
            raise ValueError("F05 handoff requires a semantic F03 AssetPlanIR fingerprint.")

        nested_f03 = self.floor04_payload.floor03_payload
        if (
            nested_f03.asset_plan_id != self.floor03_payload.asset_plan_id
            or nested_f03.script_id != self.floor03_payload.script_id
            or nested_f03.script_version != self.floor03_payload.script_version
        ):
            raise ValueError("F03/F04 lineage mismatch inside F05 handoff.")

        if self.floor04_payload.source_asset_plan_fingerprint != expected_plan_fingerprint:
            raise ValueError("F03/F04/F05 plan fingerprint mismatch.")

        required_visuals = {req.asset_id: req for req in self.floor03_payload.visual_asset_requirements}
        required_audio = {req.asset_id: req for req in self.floor03_payload.audio_asset_requirements}
        available_visuals = {asset.asset_id: asset for asset in self.floor04_payload.synthesized_visual_assets}
        available_audio = {asset.asset_id: asset for asset in self.floor04_payload.synthesized_audio_assets}

        if set(required_visuals) != set(available_visuals):
            raise ValueError("F05 requires an exact visual asset set from F04; missing or extra visual assets detected.")
        if set(required_audio) != set(available_audio):
            raise ValueError("F05 requires an exact audio asset set from F04; missing or extra audio assets detected.")

        for clip in self.timeline_spec.clips:
            if clip.track_type == TimelineTrackType.VISUAL:
                asset = available_visuals.get(clip.source_asset_id)
            elif clip.track_type in {TimelineTrackType.NARRATION, TimelineTrackType.SFX}:
                asset = available_audio.get(clip.source_asset_id)
            elif clip.track_type == TimelineTrackType.BACKGROUND_AUDIO:
                asset = self.floor04_payload.background_audio_asset
            else:
                continue
            if asset is None:
                raise ValueError(f"F05 timeline references an asset not present in F04 handoff: {clip.source_asset_id}")
            if clip.source_file_path != asset.file_path:
                raise ValueError(f"F05 clip {clip.clip_id} points at a path different from the F04 manifest.")
            expected_version = (
                str(required_visuals[clip.source_asset_id].asset_version)
                if clip.track_type == TimelineTrackType.VISUAL
                else str(required_audio[clip.source_asset_id].asset_version)
                if clip.track_type in {TimelineTrackType.NARRATION, TimelineTrackType.SFX}
                else "1"
            )
            if clip.source_asset_version != expected_version:
                raise ValueError(f"F05 clip {clip.clip_id} uses the wrong asset version snapshot.")

        if self.render_job.timeline_id != self.timeline_spec.timeline_id:
            raise ValueError("F05 render job timeline_id does not match TimelineSpec.")
        if self.render_job.request_id != self.request_id:
            raise ValueError("F05 render job request_id does not match handoff request_id.")
        if self.render_job.state != RenderJobState.COMMITTED:
            raise ValueError("F05 handoff requires a COMMITTED render job.")
        if self.render_job.artifact_sha256 and self.render_job.artifact_sha256 != self.sha256_checksum:
            raise ValueError("F05 render job artifact checksum does not match handoff checksum.")
        if self.render_job.artifact_size_bytes and self.render_job.artifact_size_bytes != self.file_size_bytes:
            raise ValueError("F05 render job artifact size does not match handoff size.")

        if len(self.timeline_fingerprint) != 64:
            raise ValueError("F05 timeline_fingerprint must be SHA-256.")
        if self.canonical_timeline_ir_path is None and self.canonical_timeline_ir_fingerprint is not None:
            raise ValueError("F05 canonical TimelineIR fingerprint requires its serialized artifact path.")
        return self
