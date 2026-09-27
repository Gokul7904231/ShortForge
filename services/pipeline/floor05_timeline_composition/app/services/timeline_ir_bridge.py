"""Bridge Floor 05 TimelineSpec into the project-wide canonical TimelineIR JSON shape.

Clean-room interoperability layer:
- Floor 05 keeps its Python TimelineSpec as the local compilation contract.
- apps/web/factoryos/core/timeline/TimelineIR.ts remains the canonical semantic schema.
- This adapter emits deterministic JSON so the two representations cannot drift silently.
- It does not invoke Remotion/FFmpeg and does not grant execution authority.
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Dict

from floors.floor05_timeline_composition.app.domain.handoff import (
    TimelineSpec,
    TimelineTrackType,
)

def _frame(timeline: TimelineSpec, seconds: float) -> int:
    return timeline.timebase.frame_index(seconds)


def build_canonical_timeline_ir(timeline: TimelineSpec, correlation_id: str) -> Dict[str, Any]:
    """Return the deterministic JSON shape described by TimelineIR.ts."""
    visual_tracks = []
    audio_tracks = []
    subtitle_tracks = []

    for clip in sorted(
        timeline.clips,
        key=lambda c: (c.track_type.value, _frame(timeline, c.start_time), c.clip_id),
    ):
        start_frame = _frame(timeline, clip.start_time)
        end_frame = _frame(timeline, clip.end_time)
        node = {
            "clipId": clip.clip_id,
            "assetId": clip.source_asset_id,
            "assetType": (
                "IMAGE" if clip.track_type == TimelineTrackType.VISUAL else "MOTION_CANVAS"
            ),
            "src": clip.source_file_path,
            "timelineStartMs": round(clip.start_time * 1000),
            "durationMs": round((clip.end_time - clip.start_time) * 1000),
            "zIndex": 0 if clip.track_type == TimelineTrackType.VISUAL else 10,
        }

        if clip.track_type == TimelineTrackType.VISUAL:
            visual_tracks.append(node)
        elif clip.track_type in {
            TimelineTrackType.NARRATION,
            TimelineTrackType.BACKGROUND_AUDIO,
            TimelineTrackType.SFX,
        }:
            audio_tracks.append(
                {
                    "audioId": clip.clip_id,
                    "trackType": (
                        "VOICE"
                        if clip.track_type == TimelineTrackType.NARRATION
                        else "BACKGROUND_MUSIC"
                        if clip.track_type == TimelineTrackType.BACKGROUND_AUDIO
                        else "SFX"
                    ),
                    "src": clip.source_file_path,
                    "timelineStartMs": round(clip.start_time * 1000),
                    "durationMs": round((clip.end_time - clip.start_time) * 1000),
                    "volume": min(1.0, clip.volume),
                }
            )

    for subtitle in sorted(
        timeline.subtitles,
        key=lambda s: (_frame(timeline, s.start_time), s.subtitle_id),
    ):
        subtitle_tracks.append(
            {
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
            }
        )

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

    digest_payload = dict(payload)
    digest_payload.pop("provenanceDigest", None)
    canonical = json.dumps(digest_payload, sort_keys=True, separators=(",", ":"))
    payload["provenanceDigest"] = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return payload


def canonical_timeline_ir_fingerprint(timeline: TimelineSpec, correlation_id: str) -> str:
    return str(build_canonical_timeline_ir(timeline, correlation_id)["provenanceDigest"])


def canonical_timeline_ir_document(timeline: TimelineSpec, correlation_id: str) -> str:
    payload = build_canonical_timeline_ir(timeline, correlation_id)
    return json.dumps(payload, indent=2, sort_keys=True) + "\n"


def validate_bridge_identity(timeline: TimelineSpec, correlation_id: str, expected: str) -> None:
    actual = canonical_timeline_ir_fingerprint(timeline, correlation_id)
    if actual != expected:
        raise ValueError(
            f"Canonical TimelineIR fingerprint mismatch: expected {expected}, got {actual}"
        )
