#!/usr/bin/env python3
"""
P3 Timeline Plan (Mirrors CompositionIR v2)
===========================================
Python consumes a compiled frame-integer plan; it never invents timing.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, model_validator

from core.lattice import FPS, MEDIA_TIMEBASE, SAMPLES_PER_FRAME, SR, ticks_to_frames


class ScenePlan(BaseModel):
    scene_id: str
    start_frame: int = Field(ge=0)
    end_frame: int = Field(gt=0)
    text: str = ""
    bg_path: Optional[str] = None
    audio_samples: int = Field(default=0, ge=0)

    @property
    def frame_count(self) -> int:
        return self.end_frame - self.start_frame

    @model_validator(mode="after")
    def _check_frame_order(self) -> "ScenePlan":
        if self.end_frame <= self.start_frame:
            raise ValueError(f"Scene {self.scene_id}: end_frame ({self.end_frame}) <= start_frame ({self.start_frame})")
        return self


class TimelinePlan(BaseModel):
    schema_version: str = "2.0.0"
    timebase: int = MEDIA_TIMEBASE
    fps: int = FPS
    sample_rate: int = SR
    samples_per_frame: int = SAMPLES_PER_FRAME
    scenes: List[ScenePlan]

    @property
    def total_frames(self) -> int:
        if not self.scenes:
            return 0
        return self.scenes[-1].end_frame

    @model_validator(mode="after")
    def _check_contiguous_frames(self) -> "TimelinePlan":
        if not self.scenes:
            raise ValueError("TimelinePlan requires at least one scene")
        cursor = 0
        for s in self.scenes:
            if s.start_frame != cursor:
                raise ValueError(f"Scene {s.scene_id} start_frame={s.start_frame} != expected contiguous {cursor}")
            cursor = s.end_frame
        return self


def compile_from_composition_ir(ir: Dict[str, Any]) -> TimelinePlan:
    timebase = int(ir.get("timebase", MEDIA_TIMEBASE))
    if timebase != MEDIA_TIMEBASE:
        raise ValueError(f"Expected MEDIA_TIMEBASE={MEDIA_TIMEBASE}, got {timebase}")

    scenes: List[ScenePlan] = []
    for idx, raw in enumerate(ir.get("scenes", [])):
        start_ticks = int(raw.get("startTicks", 0))
        dur_ticks = int(raw.get("durationTicks", 0))
        start_frame = ticks_to_frames(start_ticks)
        dur_frames = max(1, ticks_to_frames(dur_ticks))
        scenes.append(
            ScenePlan(
                scene_id=str(raw.get("sceneId") or f"scene_{idx + 1}"),
                start_frame=start_frame,
                end_frame=start_frame + dur_frames,
                text=str(raw.get("text", "")),
                bg_path=raw.get("bgPath"),
                audio_samples=dur_frames * SAMPLES_PER_FRAME,
            )
        )
    return TimelinePlan(scenes=scenes)
