from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional

@dataclass
class CompositionShot:
    shot_id: str
    recipe_id: str
    start_frame: int
    end_frame: int
    duration_frames: int
    props: Dict[str, Any]
    motion: Dict[str, Any]
    assets: List[Dict[str, Any]]

@dataclass
class CompositionScene:
    scene_id: str
    template_id: str
    start_frame: int
    end_frame: int
    duration_frames: int
    duration_seconds: float
    shots: List[CompositionShot]
    narration_text: str
    audio_path: Optional[str] = None
    audio_start_seconds: float = 0.0
    captions: List[Dict[str, Any]] = field(default_factory=list)
    is_locked: bool = False

@dataclass
class CompositionIR:
    composition_id: str
    width: int
    height: int
    fps: int
    total_frames: int
    total_duration_seconds: float
    scenes: List[CompositionScene]
    audio_mix: List[Dict[str, Any]]
    output_path: str
    render_mode: str
    composition_hash: str
