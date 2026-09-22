from dataclasses import dataclass, field, asdict
from typing import Dict, Any, List, Optional

@dataclass
class CheckpointState:
    run_id: str
    project_id: str
    intent_hash: str
    composition_hash: str
    total_scenes: int
    completed_scenes: List[str] = field(default_factory=list)
    scene_artifacts: Dict[str, str] = field(default_factory=dict)  # scene_id -> temp_video_path
    stage: str = "INITIALIZED"  # INITIALIZED | SCENES_RENDERING | COMPOSITING | ENCODING | VALIDATING | COMPLETED | FAILED
    error: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CheckpointState':
        return cls(
            run_id=data.get("run_id", ""),
            project_id=data.get("project_id", ""),
            intent_hash=data.get("intent_hash", ""),
            composition_hash=data.get("composition_hash", ""),
            total_scenes=data.get("total_scenes", 0),
            completed_scenes=data.get("completed_scenes", []),
            scene_artifacts=data.get("scene_artifacts", {}),
            stage=data.get("stage", "INITIALIZED"),
            error=data.get("error"),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
        )
