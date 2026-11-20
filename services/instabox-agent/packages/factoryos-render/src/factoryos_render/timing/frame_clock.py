"""
Canonical Frame Clock for FactoryOS Render Engine.
Adopted from HyperFrames core principle:
t = frame / fps

Never relies on Date.now(), wall-clock time, or real-time sleep during rendering.
"""

from typing import Tuple

class FrameClock:
    def __init__(self, fps: int = 30):
        if fps <= 0:
            raise ValueError(f"FPS must be positive, got {fps}")
        self.fps = fps

    def frame_to_time(self, frame_index: int) -> float:
        """Convert zero-indexed frame to canonical timestamp in seconds."""
        return frame_index / float(self.fps)

    def time_to_frame(self, seconds: float) -> int:
        """Convert timestamp in seconds to nearest frame index."""
        return int(round(seconds * self.fps))

    def duration_to_frames(self, duration_seconds: float) -> int:
        """Convert duration in seconds to total frame count."""
        return max(1, int(round(duration_seconds * self.fps)))

    def calculate_progress(self, current_frame: int, start_frame: int, end_frame: int) -> float:
        """
        Calculate normalized progress p in [0.0, 1.0] for current frame within [start_frame, end_frame].
        Clamped deterministically.
        """
        if end_frame <= start_frame:
            return 1.0
        if current_frame <= start_frame:
            return 0.0
        if current_frame >= end_frame:
            return 1.0
        return float(current_frame - start_frame) / float(end_frame - start_frame)
