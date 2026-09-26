"""Physical and semantic validators for Floor 05 timeline output."""
from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Tuple

import structlog

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import (
    RenderJobSpecification,
    TimelineSpec,
    TimelineTrackType,
)

logger = structlog.get_logger(__name__)

MAX_RENDER_FILE_SIZE_BYTES = 200 * 1024 * 1024


class PhysicalVideoValidator:
    """Use decoder/container evidence instead of trusting producer-declared media metadata."""

    @staticmethod
    def _run_ffprobe(file_path: Path) -> Dict[str, Any]:
        executable = shutil.which("ffprobe")
        if executable is None:
            raise GuardianValidationError("Render Validation Failure: ffprobe is required for physical video validation.")

        command = [
            executable,
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            str(file_path),
        ]
        try:
            completed = subprocess.run(
                command,
                check=True,
                capture_output=True,
                text=True,
                timeout=30,
            )
            return json.loads(completed.stdout or "{}")
        except (subprocess.CalledProcessError, json.JSONDecodeError, subprocess.TimeoutExpired) as exc:
            raise GuardianValidationError(
                f"Render Validation Failure: ffprobe could not decode {file_path}: {exc}"
            ) from exc

    @classmethod
    def probe_rendered_video(cls, file_path: str) -> Dict[str, Any]:
        return cls._run_ffprobe(Path(file_path).resolve())

    @staticmethod
    def _parse_rate(value: str | None) -> float:
        if not value or value in {"0/0", "N/A"}:
            return 0.0
        try:
            numerator, denominator = value.split("/", 1)
            return float(numerator) / float(denominator)
        except Exception:
            return 0.0

    @classmethod
    def validate_thumbnail(cls, file_path: str, storage_root: str) -> Tuple[str, int]:
        raw_path = Path(file_path)
        root = Path(storage_root).resolve()
        if raw_path.is_symlink():
            raise GuardianValidationError(
                f"Security Violation: Thumbnail must not be a symlink: {raw_path}"
            )
        p = raw_path.resolve()
        try:
            p.relative_to(root)
        except ValueError as exc:
            raise GuardianValidationError(
                f"Security Violation: Thumbnail path {p} attempts path traversal outside {root}"
            ) from exc

        if not p.exists() or not p.is_file():
            raise GuardianValidationError(f"Thumbnail File Error: Thumbnail does not exist at {p}")

        probe = cls._run_ffprobe(p)
        format_name = str(probe.get("format", {}).get("format_name", ""))
        if "png" not in format_name.lower():
            raise GuardianValidationError(
                f"Thumbnail Validation Failure: expected PNG, got {format_name!r}"
            )
        streams = [s for s in probe.get("streams", []) if s.get("codec_type") == "video"]
        if len(streams) != 1:
            raise GuardianValidationError("Thumbnail Validation Failure: expected exactly one image stream.")
        size = p.stat().st_size
        if size <= 0:
            raise GuardianValidationError("Thumbnail Validation Failure: thumbnail is empty.")
        return "image/png", size

    @classmethod
    def validate_rendered_video(
        cls,
        file_path: str,
        render_job: RenderJobSpecification,
        timeline_spec: TimelineSpec,
        storage_root: str,
    ) -> Tuple[str, str, int, float]:
        raw_path = Path(file_path)
        root = Path(storage_root).resolve()
        if raw_path.is_symlink():
            raise GuardianValidationError(
                f"Security Violation: Render output must not be a symlink: {raw_path}"
            )
        p = raw_path.resolve()

        try:
            p.relative_to(root)
        except ValueError as exc:
            raise GuardianValidationError(
                f"Security Violation: Render path {p} attempts path traversal outside {root}"
            ) from exc

        if not p.exists() or not p.is_file():
            raise GuardianValidationError(f"Render File Error: Rendered video file does not exist at {p}")

        size = p.stat().st_size
        if size == 0:
            raise GuardianValidationError(f"Render Validation Failure: File {p} is empty (0 bytes)")
        if size > MAX_RENDER_FILE_SIZE_BYTES:
            raise GuardianValidationError(
                f"Render Boundary Rejection: File size {size} bytes exceeds cap of {MAX_RENDER_FILE_SIZE_BYTES} bytes"
            )

        probe = cls._run_ffprobe(p)
        format_info = probe.get("format", {})
        format_name = str(format_info.get("format_name", ""))
        if "mp4" not in format_name and "mov" not in format_name:
            raise GuardianValidationError(
                f"Header Validation Failure: {p} is not a recognized MP4-family container ({format_name!r})"
            )

        streams = probe.get("streams", [])
        video_streams = [stream for stream in streams if stream.get("codec_type") == "video"]
        audio_streams = [stream for stream in streams if stream.get("codec_type") == "audio"]

        if len(video_streams) != 1:
            raise GuardianValidationError("Render Validation Failure: output must contain exactly one video stream.")

        video = video_streams[0]
        expected_codec = render_job.output_video_codec.lower()
        if expected_codec and str(video.get("codec_name", "")).lower() != expected_codec:
            raise GuardianValidationError(
                f"Render Validation Failure: expected video codec {expected_codec}, "
                f"got {video.get('codec_name')!r}"
            )

        if int(video.get("width", 0)) != timeline_spec.target_width or int(video.get("height", 0)) != timeline_spec.target_height:
            raise GuardianValidationError(
                "Render Validation Failure: physical video dimensions do not match TimelineSpec."
            )

        measured_fps = cls._parse_rate(video.get("avg_frame_rate") or video.get("r_frame_rate"))
        if abs(measured_fps - timeline_spec.target_fps) > 0.05:
            raise GuardianValidationError(
                f"Render Validation Failure: measured FPS {measured_fps:.4f} does not match target {timeline_spec.target_fps}."
            )

        requires_audio = any(
            clip.track_type in {
                TimelineTrackType.NARRATION,
                TimelineTrackType.BACKGROUND_AUDIO,
                TimelineTrackType.SFX,
            }
            for clip in timeline_spec.clips
        )
        if requires_audio and not audio_streams:
            raise GuardianValidationError("Render Validation Failure: timeline requires audio but output has no audio stream.")

        expected_audio_codec = render_job.output_audio_codec.lower()
        if audio_streams and expected_audio_codec:
            measured_audio_codec = str(audio_streams[0].get("codec_name", "")).lower()
            if measured_audio_codec != expected_audio_codec:
                raise GuardianValidationError(
                    f"Render Validation Failure: expected audio codec {expected_audio_codec}, got {measured_audio_codec!r}"
                )

        container_duration = float(format_info.get("duration") or 0.0)
        if container_duration <= 0:
            raise GuardianValidationError("Render Validation Failure: ffprobe reported a non-positive duration.")

        if abs(container_duration - timeline_spec.total_duration_seconds) > max(0.15, 1.0 / timeline_spec.target_fps * 2):
            raise GuardianValidationError(
                f"Render Validation Failure: measured duration {container_duration:.3f}s "
                f"does not match timeline {timeline_spec.total_duration_seconds:.3f}s."
            )

        sha256 = hashlib.sha256(p.read_bytes()).hexdigest()
        logger.info(
            "physical_video_validation_passed",
            file_path=str(p),
            sha256=sha256,
            size_bytes=size,
            duration=container_duration,
            measured_fps=measured_fps,
        )
        return "video/mp4", sha256, size, container_duration


class SemanticCompositionValidator:
    """Validate semantic structure before an artifact may become a committed F05 handoff."""

    @classmethod
    def validate_lineage(
        cls,
        floor03_payload: Floor03HandoffPayload,
        floor04_payload: Floor04HandoffPayload,
        timeline_spec: TimelineSpec,
    ) -> None:
        plan = floor03_payload.asset_plan_ir
        if plan is None or not plan.plan_fingerprint:
            raise GuardianValidationError("Semantic Invariant Violation (L0): F03 AssetPlanIR fingerprint is missing.")

        if floor04_payload.source_asset_plan_fingerprint != plan.plan_fingerprint:
            raise GuardianValidationError("Semantic Invariant Violation (L0): F04 media is linked to a different F03 plan.")

        required_visuals = {req.asset_id for req in floor03_payload.visual_asset_requirements}
        required_audio = {req.asset_id for req in floor03_payload.audio_asset_requirements}
        actual_visuals = {asset.asset_id for asset in floor04_payload.synthesized_visual_assets}
        actual_audio = {asset.asset_id for asset in floor04_payload.synthesized_audio_assets}

        if required_visuals != actual_visuals:
            raise GuardianValidationError("Semantic Invariant Violation (L0): F03/F04 visual asset sets differ.")
        if required_audio != actual_audio:
            raise GuardianValidationError("Semantic Invariant Violation (L0): F03/F04 audio asset sets differ.")

        for clip in timeline_spec.clips:
            if clip.track_type == TimelineTrackType.VISUAL:
                valid_ids = actual_visuals
            elif clip.track_type in {TimelineTrackType.NARRATION, TimelineTrackType.SFX}:
                valid_ids = actual_audio
            elif clip.track_type == TimelineTrackType.BACKGROUND_AUDIO:
                valid_ids = {floor04_payload.background_audio_asset.asset_id} if floor04_payload.background_audio_asset else set()
            else:
                valid_ids = set()
            if clip.track_type != TimelineTrackType.OVERLAY and clip.track_type != TimelineTrackType.SUBTITLE:
                if clip.source_asset_id not in valid_ids:
                    raise GuardianValidationError(
                        f"Semantic Invariant Violation (S2): clip {clip.clip_id} references unknown asset."
                    )

    @classmethod
    def validate_semantic_composition(
        cls,
        render_job: RenderJobSpecification,
        timeline_spec: TimelineSpec,
        rendered_sha256: str,
    ) -> bool:
        visual_clips = sorted(
            [c for c in timeline_spec.clips if c.track_type == TimelineTrackType.VISUAL],
            key=lambda clip: clip.start_time,
        )
        if not visual_clips:
            raise GuardianValidationError("Semantic Invariant Violation (S1): TimelineSpec contains no visual scene clips.")

        if any(clip.end_time > timeline_spec.total_duration_seconds + 1e-6 for clip in timeline_spec.clips):
            raise GuardianValidationError("Semantic Invariant Violation (S3): clip exceeds timeline bounds.")

        # Narration/SFX tracks may not contain accidental self-overlap.
        for track_type in (TimelineTrackType.NARRATION, TimelineTrackType.SFX):
            track = sorted(
                [c for c in timeline_spec.clips if c.track_type == track_type],
                key=lambda clip: clip.start_time,
            )
            for left, right in zip(track, track[1:]):
                if right.start_time < left.end_time - 1e-6:
                    raise GuardianValidationError(
                        f"Semantic Invariant Violation (S4): overlapping {track_type.value} clips detected."
                    )

        transition_pairs = {
            (transition.from_scene_id, transition.to_scene_id): transition.duration_seconds
            for transition in timeline_spec.transitions
        }
        for left, right in zip(visual_clips, visual_clips[1:]):
            overlap = max(0.0, left.end_time - right.start_time)
            if overlap > 1e-6:
                expected = transition_pairs.get((left.scene_id, right.scene_id))
                if expected is None or abs(overlap - expected) > 1.0 / timeline_spec.target_fps + 1e-6:
                    raise GuardianValidationError(
                        "Semantic Invariant Violation (S5): visual overlap is not explained by an explicit transition."
                    )

        for subtitle in timeline_spec.subtitles:
            if subtitle.start_time < 0 or subtitle.end_time > timeline_spec.total_duration_seconds:
                raise GuardianValidationError(
                    f"Semantic Invariant Violation (S6): subtitle {subtitle.subtitle_id} out of timeline bounds."
                )

        transition_ids = [transition.transition_id for transition in timeline_spec.transitions]
        if len(transition_ids) != len(set(transition_ids)):
            raise GuardianValidationError("Semantic Invariant Violation (S9): duplicate transition_id values.")

        if len(render_job.render_input_hash) != 64:
            raise GuardianValidationError(
                "Semantic Invariant Violation (S10): RenderJob missing valid 64-char SHA-256 render_input_hash."
            )
        if len(rendered_sha256) != 64:
            raise GuardianValidationError("Semantic Invariant Violation (S10): rendered artifact checksum is invalid.")
        if render_job.artifact_sha256 and render_job.artifact_sha256 != rendered_sha256:
            raise GuardianValidationError("Semantic Invariant Violation (S10): render job checksum differs from physical artifact.")

        logger.info("semantic_composition_validation_passed", render_job_id=render_job.render_job_id)
        return True
