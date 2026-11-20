"""
Audio-First Timing Sync for FactoryOS Render Engine.
Adopted from AgentTube: Per-segment physical audio duration is authoritative.
Never use character heuristics (e.g. chars / 15) when physical audio is present.
"""

import os
import wave
import subprocess
import json
from pathlib import Path
from typing import Optional, Dict, Any

class AudioSync:
    @staticmethod
    def get_physical_duration(audio_path: str, ffmpeg_bin: str = "ffmpeg") -> Optional[float]:
        """
        Extract physical duration of audio file in seconds.
        Tries wave library first (for WAV), falls back to ffprobe/ffmpeg.
        """
        if not audio_path or not os.path.exists(audio_path):
            return None

        # Try native wave if it's a WAV file
        if audio_path.lower().endswith(".wav"):
            try:
                with wave.open(audio_path, "rb") as wf:
                    frames = wf.getnframes()
                    rate = wf.getframerate()
                    if rate > 0:
                        return float(frames) / float(rate)
            except Exception:
                pass

        # Try ffprobe
        ffprobe_bin = "ffprobe"
        if ffmpeg_bin and os.path.exists(ffmpeg_bin):
            dir_name = os.path.dirname(ffmpeg_bin)
            probe_candidate = os.path.join(dir_name, "ffprobe.exe" if os.name == "nt" else "ffprobe")
            if os.path.exists(probe_candidate):
                ffprobe_bin = probe_candidate

        cmd = [
            ffprobe_bin,
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            audio_path
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, check=True)
            val = float(res.stdout.strip())
            return val
        except Exception:
            # Fallback to ffmpeg -i info parsing
            try:
                cmd_ffmpeg = [ffmpeg_bin, "-i", audio_path]
                res = subprocess.run(cmd_ffmpeg, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
                for line in res.stderr.splitlines():
                    if "Duration:" in line:
                        part = line.split("Duration:")[1].split(",")[0].strip()
                        h, m, s = part.split(":")
                        return float(h) * 3600 + float(m) * 60 + float(s)
            except Exception:
                pass

        return None

    @staticmethod
    def synchronize_scene_duration(scene_duration: float, audio_path: Optional[str], ffmpeg_bin: str = "ffmpeg") -> float:
        """
        Physical audio duration wins if audio is provided.
        Otherwise preserves scene_duration.
        """
        if audio_path and os.path.exists(audio_path):
            phys = AudioSync.get_physical_duration(audio_path, ffmpeg_bin)
            if phys and phys > 0.1:
                # Add minimal padding (0.15s) so speech doesn't cut abruptly
                return phys + 0.15
        return max(1.0, scene_duration)
