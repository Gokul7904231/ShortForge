"""Reference rendering worker producing real, decoder-valid MP4 evidence from the F05 timeline."""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Tuple
from uuid import uuid4

import structlog

from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import (
    RenderJobSpecification,
    RenderJobState,
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
)
from floors.floor05_timeline_composition.app.services.canonical_hasher import CanonicalHasher
from floors.floor05_timeline_composition.app.services.source_manifest import SourceManifestVerifier

logger = structlog.get_logger(__name__)


class ReferenceRenderWorker:
    """Execute a deterministic FFmpeg reference render; no synthetic MP4 byte stubs."""

    RENDERER_ID = "ffmpeg_reference_renderer"
    RENDERER_VERSION = "2.0.0"

    @classmethod
    def _require_tools(cls) -> str:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg is None:
            raise RuntimeError("FFmpeg is required for Floor 05 reference rendering.")
        return ffmpeg

    @classmethod
    def _run(cls, command: List[str]) -> None:
        try:
            subprocess.run(command, check=True, capture_output=True, text=True, timeout=180)
        except subprocess.CalledProcessError as exc:
            raise RuntimeError(
                "FFmpeg render command failed: "
                + (exc.stderr[-4000:] if exc.stderr else str(exc))
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("FFmpeg render command timed out after 180 seconds.") from exc

    @classmethod
    def _render_scene_segment(
        cls,
        ffmpeg: str,
        visual: TimelineClip,
        narration: TimelineClip,
        timeline: TimelineSpec,
        output_path: Path,
    ) -> None:
        duration = visual.end_time - visual.start_time
        output_path.parent.mkdir(parents=True, exist_ok=True)
        cls._run(
            [
                ffmpeg,
                "-y",
                "-loop",
                "1",
                "-i",
                visual.source_file_path,
                "-i",
                narration.source_file_path,
                "-t",
                f"{duration:.6f}",
                "-vf",
                (
                    f"scale={timeline.target_width}:{timeline.target_height}:"
                    "force_original_aspect_ratio=decrease,"
                    f"pad={timeline.target_width}:{timeline.target_height}:(ow-iw)/2:(oh-ih)/2,"
                    "setsar=1"
                ),
                "-r",
                str(timeline.target_fps),
                "-pix_fmt",
                "yuv420p",
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-profile:v",
                "high",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-af",
                "apad",
                "-shortest",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )

    @classmethod
    def _join_segments(
        cls,
        ffmpeg: str,
        segments: List[Tuple[Path, float]],
        transitions: Dict[Tuple[str, str], float],
        scene_ids: List[str],
        target_fps: int,
        output_path: Path,
    ) -> None:
        if len(segments) == 1:
            shutil.copy2(segments[0][0], output_path)
            return

        inputs: List[str] = []
        for segment_path, _duration in segments:
            inputs.extend(["-i", str(segment_path)])

        filter_parts: List[str] = []
        video_label = "[0:v]"
        audio_label = "[0:a]"
        cumulative_video_duration = segments[0][1]

        for index in range(1, len(segments)):
            previous_scene = scene_ids[index - 1]
            current_scene = scene_ids[index]
            transition_duration = transitions.get((previous_scene, current_scene), 0.0)
            if transition_duration <= 0:
                raise RuntimeError(
                    f"F05 reference renderer cannot join scene {previous_scene} -> {current_scene} without a transition."
                )

            next_label = f"[v{index}]"
            offset = max(0.0, cumulative_video_duration - transition_duration)
            filter_parts.append(
                f"{video_label}[{index}:v]xfade=transition=fade:duration={transition_duration:.6f}:offset={offset:.6f}{next_label}"
            )
            video_label = next_label
            cumulative_video_duration += segments[index][1] - transition_duration

            audio_next_label = f"[a{index}]"
            filter_parts.append(
                f"{audio_label}[{index}:a]acrossfade=d={transition_duration:.6f}:c1=tri:c2=tri{audio_next_label}"
            )
            audio_label = audio_next_label

        filter_complex = ";".join(filter_parts)
        cls._run(
            [
                ffmpeg,
                "-y",
                *inputs,
                "-filter_complex",
                filter_complex,
                "-map",
                video_label,
                "-map",
                audio_label,
                "-c:v",
                "libx264",
                "-preset",
                "ultrafast",
                "-pix_fmt",
                "yuv420p",
                "-r",
                str(target_fps),
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )

    @classmethod
    def _mix_background_audio(
        cls,
        ffmpeg: str,
        video_path: Path,
        background_audio: str,
        duration: float,
        output_path: Path,
    ) -> None:
        cls._run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(video_path),
                "-stream_loop",
                "-1",
                "-i",
                background_audio,
                "-filter_complex",
                (
                    f"[1:a]volume=0.08,atrim=0:{duration:.6f},asetpts=N/SR/TB[bg];"
                    "[0:a][bg]amix=inputs=2:duration=first:dropout_transition=2[aout]"
                ),
                "-map",
                "0:v",
                "-map",
                "[aout]",
                "-t",
                f"{duration:.6f}",
                "-c:v",
                "copy",
                "-c:a",
                "aac",
                "-ar",
                "48000",
                "-ac",
                "2",
                "-movflags",
                "+faststart",
                str(output_path),
            ]
        )

    @classmethod
    def _create_thumbnail(cls, ffmpeg: str, video_path: Path, thumbnail_path: Path) -> None:
        cls._run(
            [
                ffmpeg,
                "-y",
                "-i",
                str(video_path),
                "-frames:v",
                "1",
                "-vf",
                "scale=540:-2",
                "-c:v",
                "png",
                str(thumbnail_path),
            ]
        )

    @classmethod
    def execute_render(
        cls,
        request_id: str,
        floor03_payload,
        floor04_payload: Floor04HandoffPayload,
        timeline_spec: TimelineSpec,
        storage_root: str,
    ) -> Tuple[RenderJobSpecification, str, str]:
        ffmpeg = cls._require_tools()
        SourceManifestVerifier.verify_visuals(floor04_payload.synthesized_visual_assets)
        SourceManifestVerifier.verify_audio(floor04_payload.synthesized_audio_assets)
        SourceManifestVerifier.verify_background_audio(floor04_payload.background_audio_asset)

        root = Path(storage_root).resolve()
        root.mkdir(parents=True, exist_ok=True)
        staging_root = root / f"staging_render_{uuid4().hex}"
        staging_root.mkdir(parents=True, exist_ok=False)

        visual_clips = sorted(
            [clip for clip in timeline_spec.clips if clip.track_type == TimelineTrackType.VISUAL],
            key=lambda clip: clip.start_time,
        )
        audio_by_scene = {
            clip.scene_id: clip
            for clip in timeline_spec.clips
            if clip.track_type == TimelineTrackType.NARRATION
        }
        if not visual_clips:
            raise RuntimeError("F05 cannot render an empty visual timeline.")

        render_input_hash = CanonicalHasher.compute_render_input_hash(
            floor04_payload=floor04_payload,
            timeline_spec=timeline_spec,
            renderer_id=cls.RENDERER_ID,
            renderer_version=cls.RENDERER_VERSION,
        )
        render_job_id = f"job-{uuid4().hex[:12]}"
        video_path = root / f"render_{render_job_id}.mp4"
        thumb_path = root / f"thumb_{render_job_id}.png"
        concat_path = staging_root / "scene_joined.mp4"
        mixed_path = staging_root / "scene_with_bgm.mp4"

        job_spec = RenderJobSpecification(
            render_job_id=render_job_id,
            request_id=request_id,
            timeline_id=timeline_spec.timeline_id,
            timeline_version=timeline_spec.version,
            render_input_hash=render_input_hash,
            renderer_id=cls.RENDERER_ID,
            renderer_version=cls.RENDERER_VERSION,
            authorization_reference=f"guardian-floor05:{request_id}",
            attempt_id=1,
            idempotency_key=f"render:{render_input_hash}",
            state=RenderJobState.REQUESTED,
            output_container="mp4",
            output_video_codec="h264",
            output_audio_codec="aac",
        )

        job_spec.transition_to(RenderJobState.PROPOSED)
        job_spec.transition_to(RenderJobState.AUTHORIZED)
        job_spec.transition_to(RenderJobState.PREPARED)
        job_spec.transition_to(RenderJobState.RENDERING)

        segments: List[Tuple[Path, float]] = []
        scene_ids: List[str] = []
        for index, visual in enumerate(visual_clips):
            narration = audio_by_scene.get(visual.scene_id)
            if narration is None:
                raise RuntimeError(f"F05 visual scene {visual.scene_id} has no narration clip.")
            segment_path = staging_root / f"segment_{index:03d}.mp4"
            cls._render_scene_segment(ffmpeg, visual, narration, timeline_spec, segment_path)
            segments.append((segment_path, visual.duration))
            scene_ids.append(visual.scene_id)

        transitions = {
            (transition.from_scene_id, transition.to_scene_id): transition.duration_seconds
            for transition in timeline_spec.transitions
        }
        cls._join_segments(
            ffmpeg,
            segments,
            transitions,
            scene_ids,
            timeline_spec.target_fps,
            concat_path,
        )

        background_clip = next(
            (
                clip
                for clip in timeline_spec.clips
                if clip.track_type == TimelineTrackType.BACKGROUND_AUDIO
            ),
            None,
        )
        if background_clip and floor04_payload.background_audio_asset:
            cls._mix_background_audio(
                ffmpeg,
                concat_path,
                floor04_payload.background_audio_asset.file_path,
                timeline_spec.total_duration_seconds,
                mixed_path,
            )
            shutil.copy2(mixed_path, video_path)
        else:
            shutil.copy2(concat_path, video_path)

        job_spec.transition_to(RenderJobState.ARTIFACT_RECEIVED)
        cls._create_thumbnail(ffmpeg, video_path, thumb_path)

        job_spec.artifact_reference = str(video_path)
        job_spec.artifact_sha256 = None
        job_spec.artifact_size_bytes = video_path.stat().st_size

        # Keep staging evidence out of the committed artifact namespace.
        shutil.rmtree(staging_root, ignore_errors=True)

        logger.info(
            "executed_ffmpeg_reference_render",
            render_job_id=render_job_id,
            render_input_hash=render_input_hash,
            video_path=str(video_path),
        )
        return job_spec, str(video_path), str(thumb_path)
