"""Clean-room adapter from Floor 05 TimelineSpec to canonical project TimelineIR JSON.

This is an interoperability/evidence layer. It never invokes renderers or grants
execution authority; TimelineSpec remains the local Floor 05 compilation contract.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from floors.floor05_timeline_composition.app.domain.handoff import TimelineSpec, TimelineTrackType


def _frame(timeline: TimelineSpec, seconds: float) -> int:
    return timeline.timebase.frame_index(seconds)


def build_canonical_timeline_ir(timeline: TimelineSpec, correlation_id: str) -> Dict[str, Any]:
    visual_tracks: list[Dict[str, Any]] = []
    audio_tracks: list[Dict[str, Any]] = []
    subtitle_tracks: list[Dict[str, Any]] = []

    for clip in sorted(
        timeline.clips,
        key=lambda c: (c.track_type.value, _frame(timeline, c.start_time), c.clip_id),
    ):
        start_ms = round(clip.start_time * 1000)
        duration_ms = round((clip.end_time - clip.start_time) * 1000)

        if clip.track_type == TimelineTrackType.VISUAL:
            if clip.trim_end is not None and clip.trim_end <= clip.trim_start:
                raise ValueError(f"Visual clip {clip.clip_id} has a non-positive source trim range.")
            visual_tracks.append({
                "clipId": clip.clip_id,
                "sceneId": clip.scene_id,
                "assetId": clip.source_asset_id,
                "sourceAssetVersion": clip.source_asset_version,
                "assetType": "IMAGE",
                "src": clip.source_file_path,
                "timelineStartMs": start_ms,
                "durationMs": duration_ms,
                "trimStartMs": round(clip.trim_start * 1000),
                "trimEndMs": round(clip.trim_end * 1000) if clip.trim_end is not None else None,
                "zIndex": 0,
            })
        elif clip.track_type in {
            TimelineTrackType.NARRATION,
            TimelineTrackType.BACKGROUND_AUDIO,
            TimelineTrackType.SFX,
        }:
            track_type = (
                "VOICE" if clip.track_type == TimelineTrackType.NARRATION
                else "BACKGROUND_MUSIC" if clip.track_type == TimelineTrackType.BACKGROUND_AUDIO
                else "SFX"
            )
            if clip.trim_end is not None and clip.trim_end <= clip.trim_start:
                raise ValueError(f"Audio clip {clip.clip_id} has a non-positive source trim range.")
            audio_tracks.append({
                "audioId": clip.clip_id,
                "sceneId": clip.scene_id,
                "sourceAssetVersion": clip.source_asset_version,
                "trackType": track_type,
                "src": clip.source_file_path,
                "timelineStartMs": start_ms,
                "durationMs": duration_ms,
                "sourceInMs": round(clip.trim_start * 1000),
                "sourceDurationMs": (
                    round((clip.trim_end - clip.trim_start) * 1000)
                    if clip.trim_end is not None else duration_ms
                ),
                "volume": min(1.0, clip.volume),
            })

    for subtitle in sorted(
        timeline.subtitles,
        key=lambda s: (_frame(timeline, s.start_time), s.subtitle_id),
    ):
        subtitle_tracks.append({
            "subtitleId": subtitle.subtitle_id,
            "sceneId": subtitle.scene_id,
            "text": subtitle.text,
            "startMs": round(subtitle.start_time * 1000),
            "endMs": round(subtitle.end_time * 1000),
            "position": subtitle.position,
            "fontStyle": subtitle.font_style,
            "wordCues": [],
            "style": {
                "fontFamily": subtitle.font_style,
                "fontSize": 48,
                "primaryColor": "#FFFFFF",
                "animation": "NONE",
            },
        })

    payload = {
        "timelineId": timeline.timeline_id,
        "schemaVersion": "1.0.0",
        "missionId": correlation_id,
        "compositionType": timeline.composition_type,
        "canvas": {
            "width": timeline.target_width,
            "height": timeline.target_height,
            "fps": timeline.target_fps,
            "aspectRatio": timeline.aspect_ratio,
        },
        "totalDurationMs": round(timeline.total_duration_seconds * 1000),
        "visualTracks": visual_tracks,
        "audioTracks": audio_tracks,
        "subtitleTracks": subtitle_tracks,
        "transitions": [
            {
                "transitionId": transition.transition_id,
                "fromSceneId": transition.from_scene_id,
                "toSceneId": transition.to_scene_id,
                "transitionType": transition.transition_type,
                "durationMs": round(transition.duration_seconds * 1000),
            }
            for transition in sorted(timeline.transitions, key=lambda t: (t.from_scene_id, t.to_scene_id, t.transition_id))
        ],
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    payload["provenanceDigest"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return payload


def canonical_timeline_ir_fingerprint(timeline: TimelineSpec, correlation_id: str) -> str:
    return str(build_canonical_timeline_ir(timeline, correlation_id)["provenanceDigest"])


def canonical_timeline_ir_document(timeline: TimelineSpec, correlation_id: str) -> str:
    return json.dumps(build_canonical_timeline_ir(timeline, correlation_id), indent=2, sort_keys=True) + "\n"


def validate_bridge_identity(timeline: TimelineSpec, correlation_id: str, expected: str) -> None:
    actual = canonical_timeline_ir_fingerprint(timeline, correlation_id)
    if actual != expected:
        raise ValueError(f"Canonical TimelineIR fingerprint mismatch: expected {expected}, got {actual}")
