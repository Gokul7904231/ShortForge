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
            visual_tracks.append({
                "clipId": clip.clip_id,
                "assetId": clip.source_asset_id,
                "assetType": "IMAGE",
                "src": clip.source_file_path,
                "timelineStartMs": start_ms,
                "durationMs": duration_ms,
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
            audio_tracks.append({
                "audioId": clip.clip_id,
                "trackType": track_type,
                "src": clip.source_file_path,
                "timelineStartMs": start_ms,
                "durationMs": duration_ms,
                "volume": min(1.0, clip.volume),
            })

    for subtitle in sorted(
        timeline.subtitles,
        key=lambda s: (_frame(timeline, s.start_time), s.subtitle_id),
    ):
        subtitle_tracks.append({
            "subtitleId": subtitle.subtitle_id,
            "text": subtitle.text,
            "startMs": round(subtitle.start_time * 1000),
            "endMs": round(subtitle.end_time * 1000),
            "wordCues": [],
            "style": {
                "fontFamily": "sans-serif",
                "fontSize": 48,
                "primaryColor": "#FFFFFF",
                "animation": "NONE",
            },
        })

    payload = {
        "timelineId": timeline.timeline_id,
        "schemaVersion": "1.0.0",
        "missionId": correlation_id,
        "compositionType": "FACTS_SHORTS",
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
