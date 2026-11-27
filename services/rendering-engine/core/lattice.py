#!/usr/bin/env python3
"""
P3 Sample-Exact Integer Lattice
===============================
48,000 Hz / 30 fps => exactly 1,600 audio samples per video frame.
No float timebases or fractional frame boundaries.
"""

from __future__ import annotations

import math

SR: int = 48_000
FPS: int = 30
SAMPLES_PER_FRAME: int = SR // FPS  # 1600 exact
MEDIA_TIMEBASE: int = 120_000  # 120,000 ticks/sec (4,000 ticks/frame at 30fps)
TICKS_PER_FRAME: int = MEDIA_TIMEBASE // FPS  # 4000 exact


def samples_for_frames(frame_count: int) -> int:
    if frame_count < 0:
        raise ValueError(f"frame_count must be non-negative, got {frame_count}")
    return int(frame_count) * SAMPLES_PER_FRAME


def frames_for_samples(sample_count: int) -> int:
    if sample_count <= 0:
        raise ValueError(f"sample_count must be positive, got {sample_count}")
    return math.ceil(sample_count / SAMPLES_PER_FRAME)


def ticks_to_frames(ticks: int) -> int:
    if ticks < 0:
        raise ValueError(f"ticks must be non-negative, got {ticks}")
    return (int(ticks) + TICKS_PER_FRAME - 1) // TICKS_PER_FRAME if ticks % TICKS_PER_FRAME else int(ticks) // TICKS_PER_FRAME


def frames_to_ticks(frame_count: int) -> int:
    if frame_count < 0:
        raise ValueError(f"frame_count must be non-negative, got {frame_count}")
    return int(frame_count) * TICKS_PER_FRAME
