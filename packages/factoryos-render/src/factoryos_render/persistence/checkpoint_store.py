"""
Persistent Checkpoint Store for FactoryOS Render Engine.
Adopted from AgentTube: Saves stage checkpoints to allow resuming interrupted runs.
"""

import os
import json
import time
from pathlib import Path
from typing import Optional
from ..contracts.checkpoint import CheckpointState

class CheckpointStore:
    def __init__(self, base_dir: str = ".factoryos_render_cache/checkpoints"):
        self.base_dir = os.path.abspath(base_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def _get_path(self, run_id: str) -> str:
        safe_id = "".join(c for c in run_id if c.isalnum() or c in ("-", "_"))
        return os.path.join(self.base_dir, f"{safe_id}.json")

    def save(self, state: CheckpointState) -> None:
        path = self._get_path(state.run_id)
        state.updated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        if not state.created_at:
            state.created_at = state.updated_at

        tmp_path = path + ".tmp"
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(state.to_dict(), f, indent=2)

        for attempt in range(5):
            try:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception:
                        pass
                os.replace(tmp_path, path)
                break
            except (PermissionError, OSError):
                if attempt == 4:
                    try:
                        import shutil
                        shutil.copyfile(tmp_path, path)
                        os.remove(tmp_path)
                    except Exception:
                        pass
                else:
                    time.sleep(0.05)

    def load(self, run_id: str) -> Optional[CheckpointState]:
        path = self._get_path(run_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
                return CheckpointState.from_dict(data)
        except Exception:
            return None

    def delete(self, run_id: str) -> bool:
        path = self._get_path(run_id)
        if os.path.exists(path):
            try:
                os.remove(path)
                return True
            except Exception:
                pass
        return False
