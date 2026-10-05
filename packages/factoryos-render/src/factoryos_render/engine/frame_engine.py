"""
Deterministic Frame Engine for FactoryOS Render Engine.
Evaluates frame N with canonical clock t = N / fps and renders the exact RGBA state.
"""

from typing import Dict, Any, Optional, Tuple, List
from ..timing.frame_clock import FrameClock
from ..backends.image import NativeFrameCompositor
from ..contracts.composition import CompositionScene, CompositionShot
from .feature_lowering import render_feature_stack, transition_mix


class FrameEngine:
    def __init__(self, width: int = 1080, height: int = 1920, fps: int = 30):
        self.width = width
        self.height = height
        self.fps = fps
        self.clock = FrameClock(fps)
        self.compositor = NativeFrameCompositor(width, height)

    def _feature_props(self, shot: CompositionShot) -> Tuple[Dict[str, Any], List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
        props = shot.props or {}
        return (
            dict(props.get("transform") or props.get("editorTransform") or {}),
            list(props.get("animations") or props.get("editorAnimations") or []),
            list(props.get("effects") or props.get("editorEffects") or []),
            list(props.get("masks") or props.get("editorMasks") or []),
        )

    def _render_shot(
        self,
        scene: CompositionScene,
        shot: CompositionShot,
        frame_index: int,
        *,
        transparent: bool,
        caption_text: str = "",
        safe_top: int = 160,
        safe_bottom: int = 320,
    ):
        shot_time = max(0.0, (frame_index - shot.start_frame) / float(max(1, self.fps)))
        shot_progress = self.clock.calculate_progress(
            frame_index,
            shot.start_frame,
            max(shot.start_frame + 1, shot.end_frame),
        )
        transform, animations, effects, masks = self._feature_props(shot)

        props = dict(shot.props or {})
        props.setdefault("zIndex", props.get("z_index", 0))

        img = self.compositor.render_frame(
            scene_props={
                "scene_id": scene.scene_id,
                "template_id": scene.template_id,
                "narration_text": scene.narration_text,
                "background": scene.background,
                "transparent": transparent,
            },
            shot_recipe=shot.recipe_id,
            shot_props=props,
            progress=shot_progress,
            caption_text=caption_text,
            safe_top=safe_top,
            safe_bottom=safe_bottom,
        )
        return render_feature_stack(
            img,
            transform=transform,
            animations=animations,
            effects=effects,
            masks=masks,
            time_seconds=shot_time,
        )

    def _transition_candidate(
        self,
        scene: CompositionScene,
        frame_index: int,
    ) -> Optional[Tuple[CompositionShot, CompositionShot, float, str]]:
        ordered = sorted(
            scene.shots,
            key=lambda shot: (
                int((shot.props or {}).get("zIndex", (shot.props or {}).get("z_index", 0))),
                shot.start_frame,
                shot.shot_id,
            ),
        )
        temporal = sorted(ordered, key=lambda shot: (shot.start_frame, shot.shot_id))

        for idx in range(1, len(temporal)):
            incoming = temporal[idx]
            outgoing = temporal[idx - 1]
            trans = (incoming.props or {}).get("transitionIn") or (incoming.props or {}).get("editorTransitionIn")
            if not trans:
                trans = (outgoing.props or {}).get("transitionOut") or (outgoing.props or {}).get("editorTransitionOut")
            if not trans:
                continue
            duration_seconds = float(trans.get("durationSeconds", trans.get("duration_seconds", 0.0)) or 0.0)
            duration_frames = max(1, round(duration_seconds * self.fps))
            start = incoming.start_frame
            if start <= frame_index < start + duration_frames:
                progress = (frame_index - start) / float(max(1, duration_frames - 1))
                kind = str(trans.get("kind", "FADE"))
                return outgoing, incoming, max(0.0, min(1.0, progress)), kind

        return None

    def render_scene_frame(
        self,
        scene: CompositionScene,
        scene_frame_index: int,
        safe_top: int = 160,
        safe_bottom: int = 320,
    ) -> bytes:
        """
        Renders a single composition frame, including lowered transforms,
        keyframes, effects, masks and clip-edge transitions.
        """
        if scene.duration_frames <= 0:
            raise ValueError("Scene must contain at least one frame.")

        transition = self._transition_candidate(scene, scene_frame_index)
        if transition:
            outgoing, incoming, progress, kind = transition
            out_img = self._render_shot(
                scene,
                outgoing,
                outgoing.end_frame,
                transparent=False,
                safe_top=safe_top,
                safe_bottom=safe_bottom,
            )
            in_img = self._render_shot(
                scene,
                incoming,
                scene_frame_index,
                transparent=False,
                safe_top=safe_top,
                safe_bottom=safe_bottom,
            )
            return transition_mix(out_img, in_img, kind, progress).tobytes()

        active = [
            shot
            for shot in scene.shots
            if shot.start_frame <= scene_frame_index <= shot.end_frame
        ]
        active.sort(
            key=lambda shot: (
                int((shot.props or {}).get("zIndex", (shot.props or {}).get("z_index", 0))),
                shot.shot_id,
            )
        )

        if not active:
            # Real timeline gaps expose only the declared canvas background and captions.
            empty = self.compositor.render_frame(
                scene_props={
                    "scene_id": scene.scene_id,
                    "template_id": scene.template_id,
                    "narration_text": scene.narration_text,
                    "background": scene.background,
                },
                shot_recipe="IMAGE_WITH_CAPTION",
                shot_props={},
                progress=0.0,
                caption_text=scene.narration_text,
                safe_top=safe_top,
                safe_bottom=safe_bottom,
            )
            return empty.tobytes()

        frame_image = None
        for index, shot in enumerate(active):
            rendered = self._render_shot(
                scene,
                shot,
                scene_frame_index,
                transparent=index > 0,
                caption_text=scene.narration_text if index == 0 else "",
                safe_top=safe_top,
                safe_bottom=safe_bottom,
            )
            if frame_image is None:
                frame_image = rendered
            else:
                frame_image.alpha_composite(rendered)

        return frame_image.tobytes()
