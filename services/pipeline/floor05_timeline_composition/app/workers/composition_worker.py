"""Timeline Composition Worker assembling TimelineSpec manifests from Floor 04 handoff payloads."""

from __future__ import annotations

from typing import List
from uuid import uuid4

import structlog

from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import (
    SubtitleItem,
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
    TransitionSpec,
)

logger = structlog.get_logger(__name__)


class TimelineCompositionWorker:
    """Assembles TimelineSpec from Floor 04 verified handoff payload."""

    @classmethod
    def assemble_timeline(
        cls,
        floor03_payload: Floor03HandoffPayload,
        floor04_payload: Floor04HandoffPayload,
        target_fps: int = 30,
    ) -> TimelineSpec:
        """Construct deterministic TimelineSpec manifest with asset version snapshotting."""
        timeline_id = f"tl-{uuid4().hex[:8]}"
        f03 = floor04_payload.floor03_payload

        # Get aspect_ratio from first visual asset requirement if available
        aspect_ratio = "9:16"
        if f03.visual_asset_requirements and f03.visual_asset_requirements[0].aspect_ratio:
            aspect_ratio = f03.visual_asset_requirements[0].aspect_ratio

        if aspect_ratio == "9:16":
            width, height = 1080, 1920
        else:
            width, height = 1920, 1080

        clips: List[TimelineClip] = []
        subtitles: List[SubtitleItem] = []
        transitions: List[TransitionSpec] = []

        current_time = 0.0

        # Map visual and narration scene clips using visual_asset_requirements
        for idx, vis_req in enumerate(f03.visual_asset_requirements):
            scene_id = vis_req.scene_id
            dur = vis_req.target_duration_seconds if vis_req.target_duration_seconds > 0 else 5.0

            # Find matching visual asset
            vis_asset = next((v for v in floor04_payload.synthesized_visual_assets if v.scene_id == scene_id), None)
            if not vis_asset and floor04_payload.synthesized_visual_assets:
                vis_asset = floor04_payload.synthesized_visual_assets[0]

            vis_clip_id = f"clip-vis-{scene_id}"
            clips.append(
                TimelineClip(
                    clip_id=vis_clip_id,
                    track_type=TimelineTrackType.VISUAL,
                    start_time=current_time,
                    end_time=current_time + dur,
                    source_asset_id=vis_asset.asset_id if vis_asset else f"vis-req-{scene_id}",
                    source_asset_version=str(vis_req.asset_version),
                    source_file_path=vis_asset.file_path if vis_asset else f"/mock/{scene_id}.png",
                )
            )

            # Find matching audio requirement/asset
            aud_req = next((a for a in f03.audio_asset_requirements if a.scene_id == scene_id), None)
            aud_asset = next((a for a in floor04_payload.synthesized_audio_assets if a.scene_id == scene_id), None)
            if not aud_asset and floor04_payload.synthesized_audio_assets:
                aud_asset = floor04_payload.synthesized_audio_assets[0]

            aud_dur = aud_asset.duration_seconds if aud_asset else dur
            aud_clip_id = f"clip-aud-{scene_id}"
            clips.append(
                TimelineClip(
                    clip_id=aud_clip_id,
                    track_type=TimelineTrackType.NARRATION,
                    start_time=current_time,
                    end_time=current_time + aud_dur,
                    source_asset_id=aud_asset.asset_id if aud_asset else f"aud-req-{scene_id}",
                    source_asset_version=str(aud_req.asset_version) if aud_req else "1",
                    source_file_path=aud_asset.file_path if aud_asset else f"/mock/{scene_id}.mp3",
                )
            )

            # Subtitles if narration text is available
            if aud_req and aud_req.narration_text:
                subtitles.append(
                    SubtitleItem(
                        subtitle_id=f"sub-{scene_id}",
                        scene_id=scene_id,
                        text=aud_req.narration_text,
                        start_time=current_time,
                        end_time=current_time + aud_dur,
                    )
                )

            # Transition between scenes
            if idx > 0:
                prev_scene_id = f03.visual_asset_requirements[idx - 1].scene_id
                transitions.append(
                    TransitionSpec(
                        transition_id=f"trans-{idx}",
                        from_scene_id=prev_scene_id,
                        to_scene_id=scene_id,
                        duration_seconds=0.5,
                        transition_type="crossfade",
                    )
                )

            current_time += max(dur, aud_dur)

        total_duration = max(current_time, 0.1)

        spec = TimelineSpec(
            timeline_id=timeline_id,
            target_width=width,
            target_height=height,
            target_fps=target_fps,
            aspect_ratio=aspect_ratio,
            total_duration_seconds=total_duration,
            clips=clips,
            subtitles=subtitles,
            transitions=transitions,
        )

        logger.info(
            "timeline_assembled",
            timeline_id=timeline_id,
            clip_count=len(clips),
            subtitle_count=len(subtitles),
            duration=total_duration,
        )
        return spec
