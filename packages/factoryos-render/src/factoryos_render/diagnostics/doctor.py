"""
System Diagnostics and Health Checks for FactoryOS Render Engine.
Exposed via 'factoryos-render doctor' CLI and admin panel.
"""

import sys
import os
import shutil
import platform
from typing import Dict, Any, Optional
from ..version import __version__
from ..backends.ffmpeg import FFmpegBackend

class SystemDoctor:
    def __init__(self, ffmpeg_path: Optional[str] = None):
        self.ffmpeg = FFmpegBackend(ffmpeg_path)

    def run_diagnostics(self) -> Dict[str, Any]:
        results: Dict[str, Any] = {
            "rendererVersion": __version__,
            "platform": platform.platform(),
            "pythonVersion": sys.version.split()[0],
            "pythonPath": sys.executable,
            "os": platform.system(),
            "arch": platform.machine(),
            "checks": {},
            "allHealthy": True
        }

        # 1. Python check
        py_ok = sys.version_info >= (3, 10)
        results["checks"]["python"] = {
            "status": "PASS" if py_ok else "FAIL",
            "version": sys.version.split()[0],
            "details": "Python >= 3.10 required"
        }
        if not py_ok:
            results["allHealthy"] = False

        # 2. FFmpeg check
        ffmpeg_ok = self.ffmpeg.is_available()
        results["checks"]["ffmpeg"] = {
            "status": "PASS" if ffmpeg_ok else "FAIL",
            "path": self.ffmpeg.ffmpeg_path,
            "version": self.ffmpeg.get_version() if ffmpeg_ok else "NOT_FOUND",
            "details": "System or bundled FFmpeg binary"
        }
        if not ffmpeg_ok:
            results["allHealthy"] = False

        # 3. Pillow library check
        try:
            import PIL
            pil_ok = True
            pil_ver = PIL.__version__
        except Exception:
            pil_ok = False
            pil_ver = "NOT_INSTALLED"

        results["checks"]["pillow"] = {
            "status": "PASS" if pil_ok else "FAIL",
            "version": pil_ver,
            "details": "Pillow 2D raster engine"
        }
        if not pil_ok:
            results["allHealthy"] = False

        # 4. Codec support check
        h264_ok = False
        aac_ok = False
        if ffmpeg_ok:
            try:
                import subprocess
                res = subprocess.run([self.ffmpeg.ffmpeg_path, "-codecs"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                if "libx264" in res.stdout or "h264" in res.stdout:
                    h264_ok = True
                if "aac" in res.stdout:
                    aac_ok = True
            except Exception:
                pass

        results["checks"]["videoCodec"] = {
            "status": "PASS" if h264_ok else "WARN",
            "details": "H.264 video codec support"
        }
        results["checks"]["audioCodec"] = {
            "status": "PASS" if aac_ok else "WARN",
            "details": "AAC audio codec support"
        }

        # 5. Disk space check
        try:
            disk = shutil.disk_usage(".")
            free_gb = disk.free / (1024 ** 3)
            disk_ok = free_gb > 1.0
            results["checks"]["diskSpace"] = {
                "status": "PASS" if disk_ok else "WARN",
                "freeGB": round(free_gb, 2),
                "details": f"{round(free_gb, 2)} GB available in current workspace"
            }
        except Exception:
            pass

        return results
