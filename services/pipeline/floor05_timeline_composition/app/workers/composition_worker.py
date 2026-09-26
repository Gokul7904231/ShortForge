"""Timeline composition worker compiling exact F03 intent + F04 physical media into TimelineSpec."""
from __future__ import annotations

import hashlib
from typing import Dict, List

import structlog

from floors.floor03_asset_realization.app.domain.asset_models import AudioAssetRequirement, VisualAssetRequirement
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import (
    SubtitleItem,
    TimelineClip,
    TimelineSpec,
    TimelineTimebase,
    TimelineTrackType,
    TransitionSpec,
)

logger = structlog.get_logger(__name__)


class TimelineCompositionWorker:
    """Compile a deterministic, frame-aligned TimelineSpec without heuristic asset substitution."""

    @staticmethod
    def _parse_resolution(resolution: str) -> tuple[int, int]:
        try:
            width_s, height_s = resolution.lower().replace(" ", "").split("x", 1)
            width, height = int(width_s), int(height_s)
            if width <= 0 or height <= 0:
                raise ValueError
            return width, height
        except Exception as exc:
            raise ValueError(f"Unsupported F03 resolution '{resolution}'. Expected WIDTHxHEIGHT.") from exc

    @staticmethod
    def _map_visual_assets(payload: Floor04HandoffPayload) -> Dict[str, object]:
        return {asset.asset_id: asset for asset in payload.synthesized_visual_assets}

    @staticmethod
    def _map_audio_assets(payload: Floor04HandoffPayload) -> Dict[str, object]:
        return {asset.asset_id: asset for asset in payload.synthesized_audio_assets}

    @classmethod
    def assemble_timeline(
        cls,
        floor03_payload,
        floor04_payload: Floor04HandoffPayload,
        target_fps: int = 30,
    ) -> TimelineSpec:
        f03 = floor03_payload
        plan = f03.asset_plan_ir
        if plan is None or not plan.plan_fingerprint:
            raise ValueError("F05 composition requires the semantic F03 AssetPlanIR fingerprint.")

        visual_assets = cls._map_visual_assets(floor04_payload)
        audio_assets = cls._map_audio_assets(floor04_payload)

        required_visual_ids = {req.asset_id for req in f03.visual_asset_requirements}
        required_audio_ids = {req.asset_id for req in f03.audio_asset_requirements}

        if required_visual_ids != set(visual_assets):
            raise ValueError("F05 cannot compose: F04 visual asset set does not exactly match F03 requirements.")
        if required_audio_ids != set(audio_assets):
            raise ValueError("F05 cannot compose: F04 audio asset set does not exactly match F03 requirements.")

        width, height = cls._parse_resolution(f03.manifest.resolved_resolution)
        aspect_ratio = f03.manifest.resolved_aspect_ratio or f03.asset_plan_ir.aspect_ratio

        ordered_visual_reqs: List[VisualAssetRequirement] = sorted(
            f03.visual_asset_requirements,
            key=lambda item: item.sequence_index,
        )
        audio_by_scene = {
            item.scene_id: item
            for item in f03.audio_asset_requirements
        }

        timeline_seed = f"{plan.plan_fingerprint}:{target_fps}:{f03.script_id}"
        timeline_id = "tl-" + hashlib.sha256(timeline_seed.encode("utf-8")).hexdigest()[:16]
        timebase = TimelineTimebase(numerator=target_fps, denominator=1)

        clips: List[TimelineClip] = []
        subtitles: List[SubtitleItem] = []
        transitions: List[TransitionSpec] = []
        current_end = 0.0
        previous_scene_id = None
        previous_visual_duration = 0.0

        for idx, visual_req in enumerate(ordered_visual_reqs):
            visual_asset = visual_assets.get(visual_req.asset_id)
            if visual_asset is None:
                raise ValueError(f"Missing F04 visual asset for F03 asset {visual_req.asset_id}.")

            audio_req: AudioAssetRequirement | None = audio_by_scene.get(visual_req.scene_id)
            if audio_req is None:
                raise ValueError(f"Missing F03 audio requirement for scene {visual_req.scene_id}.")

            audio_asset = audio_assets.get(audio_req.asset_id)
            if audio_asset is None:
                raise ValueError(f"Missing F04 audio asset for F03 asset {audio_req.asset_id}.")

            visual_duration = max(float(visual_req.target_duration_seconds), 1.0 / target_fps)
            audio_duration = max(float(audio_asset.duration_seconds), 1.0 / target_fps)
            scene_duration = max(visual_duration, audio_duration)

            transition_duration = 0.0
            if previous_scene_id is not None:
                transition_duration = min(
                    0.5,
                    previous_visual_duration / 2.0,
                    scene_duration / 2.0,
                )
                if transition_duration > 0:
                    transitions.append(
                        TransitionSpec(
                            transition_id=f"trans-{idx}",
                            from_scene_id=previous_scene_id,
                            to_scene_id=visual_req.scene_id,
                            transition_type="CROSSFADE",
                            duration_seconds=transition_duration,
                        )
                    )

            scene_start = max(0.0, current_end - transition_duration)

            clips.append(
                TimelineClip(
                    clip_id=f"clip-vis-{visual_req.scene_id}",
                    scene_id=visual_req.scene_id,
                    track_type=TimelineTrackType.VISUAL,
                    start_time=scene_start,
                    end_time=scene_start + scene_duration,
                    source_asset_id=visual_asset.asset_id,
                    source_asset_version=str(visual_req.asset_version),
                    source_file_path=visual_asset.file_path,
                )
            )
            clips.append(
                TimelineClip(
                    clip_id=f"clip-aud-{visual_req.scene_id}",
                    scene_id=visual_req.scene_id,
                    track_type=TimelineTrackType.NARRATION,
                    start_time=scene_start,
                    end_time=scene_start + audio_duration,
                    source_asset_id=audio_asset.asset_id,
                    source_asset_version=str(audio_req.asset_version),
                    source_file_path=audio_asset.file_path,
                )
            )

            if audio_req.narration_text:
                subtitles.append(
                    SubtitleItem(
                        subtitle_id=f"sub-{visual_req.scene_id}",
                        scene_id=visual_req.scene_id,
                        text=audio_req.narration_text,
                        start_time=scene_start,
                        end_time=scene_start + audio_duration,
                    )
                )

            current_end = scene_start + scene_duration
            previous_scene_id = visual_req.scene_id
            previous_visual_duration = scene_duration

        total_duration = current_end
        if floor04_payload.background_audio_asset is not None:
            bg = floor04_payload.background_audio_asset
            clips.append(
                TimelineClip(
                    clip_id="clip-bgm-global",
                    scene_id="global",
                    track_type=TimelineTrackType.BACKGROUND_AUDIO,
                    start_time=0.0,
                    end_time=total_duration,
                    source_asset_id=bg.asset_id,
                    source_asset_version="1",
                    source_file_path=bg.file_path,
                    volume=0.08,
                )
            )

        spec = TimelineSpec(
            timeline_id=timeline_id,
            target_width=width,
            target_height=height,
            target_fps=target_fps,
            timebase=timebase,
            aspect_ratio=aspect_ratio,
            total_duration_seconds=total_duration,
            clips=clips,
            subtitles=subtitles,
            transitions=transitions,
        )
        logger.info(
            "timeline_compiled",
            timeline_id=timeline_id,
            plan_fingerprint=plan.plan_fingerprint,
            clip_count=len(clips),
            transition_count=len(transitions),
            subtitle_count=len(subtitles),
            duration=total_duration,
        )
        return spec
