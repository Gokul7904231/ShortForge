"""Deterministic identity functions for Floor 05 timelines and render jobs."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import TimelineSpec


class CanonicalHasher:
    CANONICALIZATION_VERSION = "v2"

    @staticmethod
    def _frame_index(timeline: TimelineSpec, seconds: float) -> int:
        return timeline.timebase.frame_index(seconds)

    @classmethod
    def timeline_snapshot(cls, timeline_spec: TimelineSpec) -> Dict[str, Any]:
        return {
            "schema_version": timeline_spec.schema_version,
            "version": timeline_spec.version,
            "timebase": {
                "numerator": timeline_spec.timebase.numerator,
                "denominator": timeline_spec.timebase.denominator,
            },
            "target_width": timeline_spec.target_width,
            "target_height": timeline_spec.target_height,
            "target_fps": timeline_spec.target_fps,
            "aspect_ratio": timeline_spec.aspect_ratio,
            "total_duration_frames": cls._frame_index(
                timeline_spec, timeline_spec.total_duration_seconds
            ),
            "clips": [
                {
                    "clip_id": c.clip_id,
                    "scene_id": c.scene_id,
                    "track_type": c.track_type.value,
                    "start_frame": cls._frame_index(timeline_spec, c.start_time),
                    "end_frame": cls._frame_index(timeline_spec, c.end_time),
                    "source_asset_id": c.source_asset_id,
                    "source_version": c.source_asset_version,
                    "volume": c.volume,
                    "trim_start": c.trim_start,
                    "trim_end": c.trim_end,
                }
                for c in sorted(
                    timeline_spec.clips,
                    key=lambda clip: (
                        clip.track_type.value,
                        cls._frame_index(timeline_spec, clip.start_time),
                        clip.clip_id,
                    ),
                )
            ],
            "subtitles": [
                {
                    "subtitle_id": s.subtitle_id,
                    "scene_id": s.scene_id,
                    "text": s.text,
                    "start_frame": cls._frame_index(timeline_spec, s.start_time),
                    "end_frame": cls._frame_index(timeline_spec, s.end_time),
                    "position": s.position,
                    "font_style": s.font_style,
                }
                for s in sorted(
                    timeline_spec.subtitles,
                    key=lambda item: (cls._frame_index(timeline_spec, item.start_time), item.subtitle_id),
                )
            ],
            "transitions": [
                {
                    "transition_id": t.transition_id,
                    "from_scene_id": t.from_scene_id,
                    "to_scene_id": t.to_scene_id,
                    "transition_type": t.transition_type,
                    "duration_frames": cls._frame_index(timeline_spec, t.duration_seconds),
                }
                for t in sorted(timeline_spec.transitions, key=lambda item: item.transition_id)
            ],
        }

    @classmethod
    def compute_timeline_fingerprint(cls, timeline_spec: TimelineSpec) -> str:
        canonical = json.dumps(
            cls.timeline_snapshot(timeline_spec),
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @classmethod
    def compute_render_input_hash(
        cls,
        floor04_payload: Floor04HandoffPayload,
        timeline_spec: TimelineSpec,
        renderer_id: str,
        renderer_version: str,
        render_profile: str = "STANDARD_SHORTS",
    ) -> str:
        f04_snapshot = {
            "source_asset_plan_fingerprint": floor04_payload.source_asset_plan_fingerprint,
            "provenance_hash": floor04_payload.provenance_hash,
            "visual_assets": sorted(
                [
                    {
                        "asset_id": asset.asset_id,
                        "scene_id": asset.scene_id,
                        "sha256": asset.sha256_checksum,
                        "size": asset.file_size_bytes,
                        "mime_type": asset.mime_type,
                        "width": asset.width,
                        "height": asset.height,
                        "source_spec_hash": asset.source_spec_hash,
                    }
                    for asset in floor04_payload.synthesized_visual_assets
                ],
                key=lambda value: value["asset_id"],
            ),
            "audio_assets": sorted(
                [
                    {
                        "asset_id": asset.asset_id,
                        "scene_id": asset.scene_id,
                        "sha256": asset.sha256_checksum,
                        "size": asset.file_size_bytes,
                        "mime_type": asset.mime_type,
                        "duration": asset.duration_seconds,
                        "sample_rate_hz": asset.sample_rate_hz,
                        "source_spec_hash": asset.source_spec_hash,
                    }
                    for asset in floor04_payload.synthesized_audio_assets
                ],
                key=lambda value: value["asset_id"],
            ),
            "background_audio": (
                {
                    "asset_id": floor04_payload.background_audio_asset.asset_id,
                    "sha256": floor04_payload.background_audio_asset.sha256_checksum,
                    "size": floor04_payload.background_audio_asset.file_size_bytes,
                    "duration": floor04_payload.background_audio_asset.duration_seconds,
                }
                if floor04_payload.background_audio_asset
                else None
            ),
        }

        render_spec = {
            "render_profile": render_profile,
            "output_container": "mp4",
            "output_video_codec": "h264",
            "output_audio_codec": "aac",
        }

        master = {
            "canonicalization_version": cls.CANONICALIZATION_VERSION,
            "f04_snapshot": f04_snapshot,
            "timeline_snapshot": cls.timeline_snapshot(timeline_spec),
            "render_spec": render_spec,
            "renderer_identity": renderer_id,
            "renderer_version": renderer_version,
        }
        canonical = json.dumps(master, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
