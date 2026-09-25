"""
FFmpeg Backend for FactoryOS Render Engine.
Manages FFmpeg discovery, pipes raw RGBA frames to encoder, handles audio mixing,
and enforces atomic commits (write to .tmp -> validate -> rename).
"""

import os
import sys
import shutil
import hashlib
import subprocess
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from ..contracts.receipt import RenderValidationResult

class FFmpegBackend:
    def __init__(self, explicit_path: Optional[str] = None):
        self.ffmpeg_path = self._discover_ffmpeg(explicit_path)

    def _discover_ffmpeg(self, explicit_path: Optional[str] = None) -> str:
        # 1. Explicit path parameter
        if explicit_path and os.path.exists(explicit_path):
            return explicit_path

        # 2. FACTORYOS_FFMPEG_PATH env var
        env_path = os.environ.get("FACTORYOS_FFMPEG_PATH")
        if env_path and os.path.exists(env_path):
            return env_path

        # 3. System PATH ffmpeg
        which_ffmpeg = shutil.which("ffmpeg")
        if which_ffmpeg:
            return which_ffmpeg

        # 4. imageio-ffmpeg bundled binary if installed
        try:
            import imageio_ffmpeg
            bundled = imageio_ffmpeg.get_ffmpeg_exe()
            if bundled and os.path.exists(bundled):
                return bundled
        except ImportError:
            pass

        return "ffmpeg"  # fallback string for error diagnosis

    def is_available(self) -> bool:
        try:
            res = subprocess.run([self.ffmpeg_path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            return res.returncode == 0
        except Exception:
            return False

    def get_version(self) -> str:
        try:
            res = subprocess.run([self.ffmpeg_path, "-version"], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode == 0 and res.stdout:
                return res.stdout.splitlines()[0]
        except Exception:
            pass
        return "Unknown FFmpeg"

    def _video_encode_args(self, preset: str = "fast", crf: int = 20) -> List[str]:
        """
        Build the video encoder portion of the FFmpeg command.

        Default remains libx264. Remote AMD workers can opt into VAAPI with:
          FACTORYOS_VIDEO_ENCODER=h264_vaapi
          FACTORYOS_VAAPI_DEVICE=/dev/dri/renderD128
        """
        encoder = os.environ.get("FACTORYOS_VIDEO_ENCODER", "libx264").strip()
        if encoder == "h264_vaapi":
            device = os.environ.get(
                "FACTORYOS_VAAPI_DEVICE",
                "/dev/dri/renderD128",
            )
            qp = os.environ.get("FACTORYOS_VAAPI_QP", "23")
            return [
                "-vaapi_device",
                device,
                "-vf",
                "format=nv12,hwupload",
                "-c:v",
                "h264_vaapi",
                "-qp",
                qp,
            ]

        if encoder == "libx264":
            return [
                "-c:v",
                "libx264",
                "-pix_fmt",
                "yuv420p",
                "-preset",
                preset,
                "-crf",
                str(crf),
            ]

        return [
            "-c:v",
            encoder,
            "-pix_fmt",
            "yuv420p",
            "-preset",
            preset,
        ]

    def open_pipe_encoder(
        self,
        output_temp_path: str,
        width: int = 1080,
        height: int = 1920,
        fps: int = 30,
        crf: int = 20,
        preset: str = "fast",
        audio_path: Optional[str] = None,
        duration_seconds: Optional[float] = None
    ) -> subprocess.Popen:
        """
        Spawns ffmpeg process that accepts raw RGBA frames over stdin.
        Writes to output_temp_path.
        """
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-loglevel", "error",
            "-f", "rawvideo",
            "-vcodec", "rawvideo",
            "-s", f"{width}x{height}",
            "-pix_fmt", "rgba",
            "-r", str(fps),
            "-i", "-",  # stdin
        ]

        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-i", audio_path])
        else:
            cmd.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])

        cmd.extend(self._video_encode_args(preset=preset, crf=crf) + [
            "-c:a", "aac",
            "-b:a", "192k",
        ])

        if duration_seconds:
            cmd.extend(["-t", f"{duration_seconds:.3f}"])

        cmd.append(output_temp_path)

        proc = subprocess.Popen(
            cmd,
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE
        )
        return proc

    def encode_static_scene(
        self,
        frame_png_path: str,
        output_temp_path: str,
        duration_seconds: float,
        fps: int = 30,
        audio_path: Optional[str] = None,
        crf: int = 20,
        preset: str = "fast"
    ) -> None:
        """
        Fast-path static scene encoder. Loops a single rendered frame image for duration_seconds.
        Avoids generating redundant identical frames.
        """
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-loglevel", "error",
            "-loop", "1",
            "-i", frame_png_path,
        ]

        if audio_path and os.path.exists(audio_path):
            cmd.extend(["-i", audio_path])
        else:
            cmd.extend(["-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100"])

        cmd.extend(self._video_encode_args(preset=preset, crf=crf) + [
            "-r", str(fps),
            "-c:a", "aac",
            "-b:a", "192k",
            "-t", f"{duration_seconds:.3f}",
            output_temp_path
        ])

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if res.returncode != 0:
            raise RuntimeError(f"FFmpeg static scene encode failed: {res.stderr}")

    def concatenate_scenes(
        self,
        scene_paths: List[str],
        output_temp_path: str,
        bgm_path: Optional[str] = None,
        bgm_volume: float = 0.2
    ) -> None:
        """
        Concatenates multiple scene MP4 files into output_temp_path.
        """
        list_file = output_temp_path + ".txt"
        with open(list_file, "w", encoding="utf-8") as f:
            for p in scene_paths:
                clean = os.path.abspath(p).replace("\\", "/")
                f.write(f"file '{clean}'\n")

        try:
            cmd = [
                self.ffmpeg_path,
                "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", list_file,
                "-c", "copy",
                output_temp_path
            ]
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            if res.returncode != 0:
                raise RuntimeError(f"FFmpeg concat failed: {res.stderr}")
        finally:
            if os.path.exists(list_file):
                os.remove(list_file)

    def validate_mp4(self, file_path: str) -> RenderValidationResult:
        """
        Authoritatively inspect physical MP4 file.
        """
        if not os.path.exists(file_path):
            return RenderValidationResult(
                is_valid=False,
                file_exists=False,
                file_size_bytes=0,
                duration_seconds=0.0,
                width=0,
                height=0,
                has_video_stream=False,
                has_audio_stream=False,
                codec="",
                errors=["File does not exist"]
            )

        file_size = os.path.getsize(file_path)
        if file_size < 1024:
            return RenderValidationResult(
                is_valid=False,
                file_exists=True,
                file_size_bytes=file_size,
                duration_seconds=0.0,
                width=0,
                height=0,
                has_video_stream=False,
                has_audio_stream=False,
                codec="",
                errors=["File size too small (< 1KB)"]
            )

        # Inspect using ffmpeg -i
        cmd = [self.ffmpeg_path, "-i", file_path]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stderr = res.stderr

        has_video = "Video:" in stderr
        has_audio = "Audio:" in stderr
        duration = 0.0
        width = 0
        height = 0
        codec = ""
        errors: List[str] = []

        for line in stderr.splitlines():
            if "Duration:" in line:
                try:
                    part = line.split("Duration:")[1].split(",")[0].strip()
                    h, m, s = part.split(":")
                    duration = float(h) * 3600 + float(m) * 60 + float(s)
                except Exception:
                    pass
            if "Video:" in line:
                try:
                    # e.g. Video: h264 (High) (avc1 / ...), yuv420p(progressive), 1080x1920
                    codec_part = line.split("Video:")[1].split(",")[0].strip()
                    codec = codec_part
                    for token in line.split(","):
                        token = token.strip()
                        if "x" in token:
                            parts = token.split(" ")[0].split("x")
                            if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
                                width = int(parts[0])
                                height = int(parts[1])
                except Exception:
                    pass

        if not has_video:
            errors.append("No video stream found")
        if duration <= 0.05:
            errors.append("Invalid or zero duration")

        is_valid = len(errors) == 0

        return RenderValidationResult(
            is_valid=is_valid,
            file_exists=True,
            file_size_bytes=file_size,
            duration_seconds=duration,
            width=width,
            height=height,
            has_video_stream=has_video,
            has_audio_stream=has_audio,
            codec=codec,
            errors=errors
        )

    def calculate_sha256(self, file_path: str) -> str:
        h = hashlib.sha256()
        with open(file_path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()
