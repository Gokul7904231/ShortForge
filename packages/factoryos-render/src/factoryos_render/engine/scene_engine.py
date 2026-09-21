"""
Scene Engine for FactoryOS Render Engine.
Manages isolated per-scene rendering, fast-path static optimizations, and scene-level repair.
"""

import os
import hashlib
from typing import Optional, Callable
from .frame_engine import FrameEngine
from ..contracts.composition import CompositionScene
from ..backends.ffmpeg import FFmpegBackend

class SceneEngine:
    def __init__(self, ffmpeg: FFmpegBackend, width: int = 1080, height: int = 1920, fps: int = 30):
        self.ffmpeg = ffmpeg
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_engine = FrameEngine(width, height, fps)

    def calculate_scene_hash(self, scene: CompositionScene) -> str:
        """Deterministic content-addressed hash of scene definition."""
        h = hashlib.sha256()
        h.update(scene.scene_id.encode())
        h.update(scene.template_id.encode())
        h.update(str(scene.duration_frames).encode())
        h.update(scene.narration_text.encode())
        for shot in scene.shots:
            h.update(shot.recipe_id.encode())
            h.update(str(sorted(shot.props.items())).encode())
        return h.hexdigest()

    def render_scene(
        self,
        scene: CompositionScene,
        output_mp4_path: str,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        safe_top: int = 160,
        safe_bottom: int = 320
    ) -> str:
        """
        Renders an entire scene into output_mp4_path.
        Streams raw frames directly to FFmpeg pipe.
        """
        os.makedirs(os.path.dirname(os.path.abspath(output_mp4_path)), exist_ok=True)

        # Rule 55 Fast-Path Optimization: If scene has no complex per-frame motion, loop single frame
        is_static = True
        for shot in scene.shots:
            if shot.motion and (shot.motion.get("animated") is True or shot.motion.get("type") == "DYNAMIC"):
                is_static = False
                break

        if is_static:
            frame_png_path = output_mp4_path + ".frame.png"
            try:
                # Render single master frame at middle of scene
                mid_frame = scene.duration_frames // 2
                raw = self.frame_engine.render_scene_frame(
                    scene=scene,
                    scene_frame_index=mid_frame,
                    safe_top=safe_top,
                    safe_bottom=safe_bottom
                )
                from PIL import Image
                master_img = Image.frombytes("RGBA", (self.width, self.height), raw)
                master_img.save(frame_png_path, format="PNG")

                self.ffmpeg.encode_static_scene(
                    frame_png_path=frame_png_path,
                    output_temp_path=output_mp4_path,
                    duration_seconds=scene.duration_seconds,
                    fps=self.fps,
                    audio_path=scene.audio_path
                )
                if progress_callback:
                    progress_callback(scene.duration_frames, scene.duration_frames)
                return output_mp4_path
            finally:
                if os.path.exists(frame_png_path):
                    try:
                        os.remove(frame_png_path)
                    except Exception:
                        pass

        # Dynamic multi-frame path for animated shots
        encoder_proc = self.ffmpeg.open_pipe_encoder(
            output_temp_path=output_mp4_path,
            width=self.width,
            height=self.height,
            fps=self.fps,
            audio_path=scene.audio_path,
            duration_seconds=scene.duration_seconds
        )

        try:
            for frame_idx in range(scene.duration_frames):
                frame_bytes = self.frame_engine.render_scene_frame(
                    scene=scene,
                    scene_frame_index=frame_idx,
                    safe_top=safe_top,
                    safe_bottom=safe_bottom
                )
                encoder_proc.stdin.write(frame_bytes)
                if progress_callback and frame_idx % 15 == 0:
                    progress_callback(frame_idx + 1, scene.duration_frames)

            encoder_proc.stdin.close()
            encoder_proc.wait()
            if encoder_proc.returncode != 0:
                stderr = encoder_proc.stderr.read().decode("utf-8", errors="ignore")
                raise RuntimeError(f"FFmpeg scene render failed with code {encoder_proc.returncode}: {stderr}")

        except Exception as e:
            if encoder_proc.poll() is None:
                encoder_proc.kill()
            if os.path.exists(output_mp4_path):
                try:
                    os.remove(output_mp4_path)
                except Exception:
                    pass
            raise e

        return output_mp4_path
