"""
Deterministic Frame Engine for FactoryOS Render Engine.
Evaluates frame N with canonical clock t = N / fps and renders the exact RGBA state.
"""

from typing import Dict, Any, Optional, Tuple
from ..timing.frame_clock import FrameClock
from ..backends.image import NativeFrameCompositor
from ..contracts.composition import CompositionScene, CompositionShot

class FrameEngine:
    def __init__(self, width: int = 1080, height: int = 1920, fps: int = 30):
        self.width = width
        self.height = height
        self.fps = fps
        self.clock = FrameClock(fps)
        self.compositor = NativeFrameCompositor(width, height)

    def render_scene_frame(
        self,
        scene: CompositionScene,
        scene_frame_index: int,
        safe_top: int = 160,
        safe_bottom: int = 320
    ) -> bytes:
        """
        Renders a single frame for a scene at relative frame index scene_frame_index.
        Returns raw RGBA bytes.
        """
        progress = self.clock.calculate_progress(
            scene_frame_index, 0, max(1, scene.duration_frames - 1)
        )

        # Find active shot within scene
        active_shot = None
        for shot in scene.shots:
            if shot.start_frame <= scene_frame_index <= shot.end_frame:
                active_shot = shot
                break

        if not active_shot and scene.shots:
            active_shot = scene.shots[0]

        recipe_id = active_shot.recipe_id if active_shot else "IMAGE_WITH_CAPTION"
        shot_props = active_shot.props if active_shot else {}

        # Resolve caption text if available
        caption_text = scene.narration_text
        if scene.captions:
            # Check timestamp against captions
            t = self.clock.frame_to_time(scene_frame_index)
            for c in scene.captions:
                if c.get("start_seconds", 0.0) <= t <= (c.get("start_seconds", 0.0) + c.get("duration_seconds", 3.0)):
                    caption_text = c.get("text", caption_text)
                    break

        img = self.compositor.render_frame(
            scene_props={
                "scene_id": scene.scene_id,
                "template_id": scene.template_id,
                "narration_text": scene.narration_text
            },
            shot_recipe=recipe_id,
            shot_props=shot_props,
            progress=progress,
            caption_text=caption_text,
            safe_top=safe_top,
            safe_bottom=safe_bottom
        )

        return img.tobytes()
