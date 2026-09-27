"""Deterministic WebVTT sidecar generation for Floor 05 subtitle evidence."""
from __future__ import annotations

import re
from pathlib import Path

from floors.floor05_timeline_composition.app.domain.handoff import TimelineSpec


_TIMING_RE = re.compile(
    r"^(?P<start>\d{2}:\d{2}:\d{2}\.\d{3}) --> (?P<end>\d{2}:\d{2}:\d{2}\.\d{3})$"
)


def _timestamp(seconds: float) -> str:
    total_ms = max(0, round(seconds * 1000))
    hours, rem = divmod(total_ms, 3_600_000)
    minutes, rem = divmod(rem, 60_000)
    secs, millis = divmod(rem, 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}.{millis:03d}"


def build_webvtt(timeline: TimelineSpec) -> str:
    lines = ["WEBVTT", ""]
    for index, cue in enumerate(
        sorted(timeline.subtitles, key=lambda item: (item.start_time, item.subtitle_id)),
        start=1,
    ):
        lines.extend(
            [
                str(index),
                f"{_timestamp(cue.start_time)} --> {_timestamp(cue.end_time)}",
                cue.text.replace("\r", "").replace("-->", "→"),
                "",
            ]
        )
    return "\n".join(lines)


def write_webvtt(timeline: TimelineSpec, output_path: str) -> str:
    path = Path(output_path).resolve()
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = build_webvtt(timeline)
    path.write_text(payload, encoding="utf-8")
    validate_webvtt(path, timeline)
    return str(path)


def validate_webvtt(path: str | Path, timeline: TimelineSpec) -> None:
    file_path = Path(path).resolve()
    if not file_path.exists() or file_path.stat().st_size <= 0:
        raise ValueError("WebVTT sidecar is missing or empty.")

    lines = file_path.read_text(encoding="utf-8").splitlines()
    if not lines or lines[0].strip() != "WEBVTT":
        raise ValueError("WebVTT sidecar must start with WEBVTT.")

    cue_count = 0
    for index, line in enumerate(lines):
        match = _TIMING_RE.match(line.strip())
        if not match:
            continue
        cue_count += 1
        if index + 1 >= len(lines):
            raise ValueError("WebVTT cue is missing caption text.")
        start = match.group("start")
        end = match.group("end")
        if start >= end:
            raise ValueError("WebVTT cue end time must be after start time.")

    if cue_count != len(timeline.subtitles):
        raise ValueError(
            f"WebVTT cue count mismatch: expected {len(timeline.subtitles)}, got {cue_count}."
        )
