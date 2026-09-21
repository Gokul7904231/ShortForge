from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional

@dataclass
class RenderValidationResult:
    is_valid: bool
    file_exists: bool
    file_size_bytes: int
    duration_seconds: float
    width: int
    height: int
    has_video_stream: bool
    has_audio_stream: bool
    codec: str
    errors: List[str] = field(default_factory=list)

@dataclass
class RenderReceipt:
    run_id: str
    renderer_version: str
    intent_hash: str
    composition_hash: str
    output_path: str
    output_sha256: str
    width: int
    height: int
    fps: int
    duration_seconds: float
    total_frames: int
    render_time_ms: int
    render_mode: str
    ffmpeg_version: str
    cache_hits: int = 0
    cache_misses: int = 0
    warnings: List[str] = field(default_factory=list)
    validation: Optional[RenderValidationResult] = None
    scenes_rendered: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)
