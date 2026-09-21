"""
Content-Addressed Cache for FactoryOS Render Engine.
Caches rendered scenes and intermediate assets by semantic hash.
"""

import os
import shutil
from pathlib import Path
from typing import Optional

class ContentAddressedCache:
    def __init__(self, base_dir: str = ".factoryos_render_cache/content"):
        self.base_dir = os.path.abspath(base_dir)
        os.makedirs(self.base_dir, exist_ok=True)

    def get_scene_artifact(self, scene_hash: str) -> Optional[str]:
        path = os.path.join(self.base_dir, f"{scene_hash}.mp4")
        if os.path.exists(path) and os.path.getsize(path) > 1024:
            return path
        return None

    def store_scene_artifact(self, scene_hash: str, source_mp4_path: str) -> str:
        dest = os.path.join(self.base_dir, f"{scene_hash}.mp4")
        if os.path.abspath(source_mp4_path) != os.path.abspath(dest):
            shutil.copyfile(source_mp4_path, dest)
        return dest

    def clear(self) -> int:
        count = 0
        if os.path.exists(self.base_dir):
            for fname in os.listdir(self.base_dir):
                fpath = os.path.join(self.base_dir, fname)
                try:
                    if os.path.isfile(fpath):
                        os.remove(fpath)
                        count += 1
                except Exception:
                    pass
        return count
