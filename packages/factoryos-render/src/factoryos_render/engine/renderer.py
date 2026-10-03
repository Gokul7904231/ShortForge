"""
Main FactoryOS Render Engine.
Consumes canonical RenderIntent, resolves physical audio timing, manages scene graphs,
executes frame composition, persists checkpoints, and atomically commits verified MP4.
"""

import os
import sys
import time
import uuid
import hashlib
from pathlib import Path
from typing import Optional, Callable, Dict, Any, List

from ..version import __version__
from ..contracts.render_intent import RenderIntent, SceneIntent
from ..contracts.composition import CompositionIR, CompositionScene, CompositionShot
from ..contracts.receipt import RenderReceipt, RenderValidationResult
from ..contracts.checkpoint import CheckpointState
from ..timing.frame_clock import FrameClock
from ..timing.audio_sync import AudioSync
from ..backends.ffmpeg import FFmpegBackend
from .scene_engine import SceneEngine
from ..persistence.checkpoint_store import CheckpointStore
from ..assets.cache import ContentAddressedCache

class Renderer:
    def __init__(self, ffmpeg_path: Optional[str] = None, cache_dir: str = ".factoryos_render_cache"):
        self.ffmpeg = FFmpegBackend(ffmpeg_path)
        self.cache_dir = os.path.abspath(cache_dir)
        self.checkpoints = CheckpointStore(os.path.join(self.cache_dir, "checkpoints"))
        self.cache = ContentAddressedCache(os.path.join(self.cache_dir, "content"))

    def compile_composition(self, intent: RenderIntent) -> CompositionIR:
        """
        Compiles RenderIntent into deterministic CompositionIR.
        Resolves audio-first scene durations.
        """
        fps = intent.output.fps
        clock = FrameClock(fps)

        scenes_ir: List[CompositionScene] = []
        current_frame = 0
        total_duration = 0.0

        for s in intent.scenes:
            audio_path = s.audio_track.audio_path if s.audio_track else None
            # Authoritative audio-first timing
            dur_sec = float(s.duration_seconds) if (s.duration_seconds and s.duration_seconds >= 0.5) else AudioSync.synchronize_scene_duration(s.duration_seconds, audio_path, self.ffmpeg.ffmpeg_path)
            dur_frames = clock.duration_to_frames(dur_sec)

            start_f = current_frame
            end_f = current_frame + dur_frames - 1

            shots_ir: List[CompositionShot] = []
            shot_start = 0
            # Distribute shots evenly across scene frames if multiple
            if s.shots:
                shot_dur = dur_frames // len(s.shots)
                for i, sh in enumerate(s.shots):
                    sh_start = shot_start
                    sh_end = (shot_start + shot_dur - 1) if i < len(s.shots) - 1 else dur_frames - 1
                    shots_ir.append(
                        CompositionShot(
                            shot_id=sh.id,
                            recipe_id=sh.recipe_id,
                            start_frame=sh_start,
                            end_frame=sh_end,
                            duration_frames=sh_end - sh_start + 1,
                            props=sh.props,
                            motion=sh.motion,
                            assets=sh.assets
                        )
                    )
                    shot_start = sh_end + 1
            else:
                shots_ir.append(
                    CompositionShot(
                        shot_id="default_shot",
                        recipe_id="IMAGE_WITH_CAPTION",
                        start_frame=0,
                        end_frame=dur_frames - 1,
                        duration_frames=dur_frames,
                        props={"caption": s.narration_text},
                        motion={},
                        assets=[]
                    )
                )

            scenes_ir.append(
                CompositionScene(
                    scene_id=s.scene_id,
                    template_id=s.template_id,
                    start_frame=start_f,
                    end_frame=end_f,
                    duration_frames=dur_frames,
                    duration_seconds=dur_sec,
                    shots=shots_ir,
                    narration_text=s.narration_text,
                    audio_path=audio_path,
                    captions=[c.__dict__ if hasattr(c, "__dict__") else c for c in s.captions],
                    is_locked=s.is_locked
                )
            )

            current_frame += dur_frames
            total_duration += dur_sec

        # Deterministic composition hash
        h = hashlib.sha256()
        h.update(str(intent.output.width).encode())
        h.update(str(intent.output.height).encode())
        h.update(str(fps).encode())
        h.update(str(current_frame).encode())
        for sc in scenes_ir:
            h.update(sc.scene_id.encode())
            h.update(str(sc.duration_frames).encode())
            h.update(sc.narration_text.encode())
        comp_hash = h.hexdigest()

        return CompositionIR(
            composition_id=f"comp_{comp_hash[:12]}",
            width=intent.output.width,
            height=intent.output.height,
            fps=fps,
            total_frames=current_frame,
            total_duration_seconds=total_duration,
            scenes=scenes_ir,
            audio_mix=[],
            output_path=os.path.abspath(intent.output_path),
            render_mode=intent.render_mode,
            composition_hash=comp_hash
        )

    def render(
        self,
        intent: RenderIntent,
        run_id: Optional[str] = None,
        progress_callback: Optional[Callable[[str, int, int], None]] = None
    ) -> RenderReceipt:
        """
        Executes complete production render.
        Follows checkpoint -> scene renders -> concat -> validation -> atomic commit.
        """
        start_time = time.time()
        if not run_id:
            run_id = f"run_{uuid.uuid4().hex[:12]}"

        # Intent hash
        intent_h = hashlib.sha256(str(intent.project_id).encode()).hexdigest()
        comp = self.compile_composition(intent)

        # Initialize or load checkpoint
        state = self.checkpoints.load(run_id)
        if not state:
            state = CheckpointState(
                run_id=run_id,
                project_id=intent.project_id,
                intent_hash=intent_h,
                composition_hash=comp.composition_hash,
                total_scenes=len(comp.scenes),
                stage="SCENES_RENDERING"
            )
            self.checkpoints.save(state)

        scene_engine = SceneEngine(
            ffmpeg=self.ffmpeg,
            width=comp.width,
            height=comp.height,
            fps=comp.fps
        )

        rendered_scene_paths: List[str] = []
        cache_hits = 0
        cache_misses = 0

        # Step 1: Render individual scenes
        for i, scene in enumerate(comp.scenes):
            if progress_callback:
                progress_callback(f"Rendering scene {i+1}/{len(comp.scenes)} ({scene.scene_id})", i + 1, len(comp.scenes))

            scene_h = scene_engine.calculate_scene_hash(scene)

            # Check if already completed in checkpoint
            if scene.scene_id in state.completed_scenes and scene.scene_id in state.scene_artifacts:
                cached_path = state.scene_artifacts[scene.scene_id]
                if os.path.exists(cached_path) and os.path.getsize(cached_path) > 1024:
                    rendered_scene_paths.append(cached_path)
                    cache_hits += 1
                    continue

            # Check content-addressed cache
            cached_scene = self.cache.get_scene_artifact(scene_h)
            if cached_scene:
                rendered_scene_paths.append(cached_scene)
                state.completed_scenes.append(scene.scene_id)
                state.scene_artifacts[scene.scene_id] = cached_scene
                self.checkpoints.save(state)
                cache_hits += 1
                continue

            cache_misses += 1
            # Render new scene artifact to temp file
            temp_scene_dir = os.path.join(self.cache_dir, "temp", run_id)
            os.makedirs(temp_scene_dir, exist_ok=True)
            scene_tmp_path = os.path.join(temp_scene_dir, f"{scene.scene_id}.mp4")

            scene_engine.render_scene(
                scene=scene,
                output_mp4_path=scene_tmp_path,
                safe_top=intent.safe_area.top,
                safe_bottom=intent.safe_area.bottom
            )

            # Store in cache
            cached_dest = self.cache.store_scene_artifact(scene_h, scene_tmp_path)
            rendered_scene_paths.append(cached_dest)

            state.completed_scenes.append(scene.scene_id)
            state.scene_artifacts[scene.scene_id] = cached_dest
            self.checkpoints.save(state)

        # Step 2: Atomic Final Output Concatenation
        if progress_callback:
            progress_callback("Composing final video stream", len(comp.scenes), len(comp.scenes))

        state.stage = "COMPOSITING"
        self.checkpoints.save(state)

        final_dest = os.path.abspath(intent.output_path)
        os.makedirs(os.path.dirname(final_dest), exist_ok=True)
        final_temp = final_dest + f".{uuid.uuid4().hex[:6]}.tmp.mp4"

        try:
            if len(rendered_scene_paths) == 1:
                # Single scene: copy directly
                import shutil
                shutil.copyfile(rendered_scene_paths[0], final_temp)
            else:
                self.ffmpeg.concatenate_scenes(rendered_scene_paths, final_temp)

            # Step 3: Validate physical MP4 output before committing
            state.stage = "VALIDATING"
            self.checkpoints.save(state)

            validation = self.ffmpeg.validate_mp4(final_temp)
            if not validation.is_valid:
                raise RuntimeError(f"Render validation failed: {'; '.join(validation.errors)}")

            # Atomic rename to final output with Windows retry
            committed = False
            for attempt in range(5):
                try:
                    if os.path.exists(final_dest):
                        try:
                            os.remove(final_dest)
                        except Exception:
                            pass
                    os.replace(final_temp, final_dest)
                    committed = True
                    break
                except (PermissionError, OSError):
                    time.sleep(0.08)

            if not committed:
                import shutil
                shutil.copyfile(final_temp, final_dest)
                try:
                    os.remove(final_temp)
                except Exception:
                    pass

            out_sha256 = self.ffmpeg.calculate_sha256(final_dest)

            state.stage = "COMPLETED"
            self.checkpoints.save(state)

            render_duration_ms = int((time.time() - start_time) * 1000)

            receipt = RenderReceipt(
                run_id=run_id,
                renderer_version=__version__,
                intent_hash=intent_h,
                composition_hash=comp.composition_hash,
                output_path=final_dest,
                output_sha256=out_sha256,
                width=comp.width,
                height=comp.height,
                fps=comp.fps,
                duration_seconds=validation.duration_seconds,
                total_frames=comp.total_frames,
                render_time_ms=render_duration_ms,
                render_mode=intent.render_mode,
                ffmpeg_version=self.ffmpeg.get_version(),
                cache_hits=cache_hits,
                cache_misses=cache_misses,
                validation=validation,
                scenes_rendered=[s.scene_id for s in comp.scenes]
            )

            return receipt

        except Exception as e:
            if os.path.exists(final_temp):
                try:
                    os.remove(final_temp)
                except Exception:
                    pass
            state.stage = "FAILED"
            state.error = str(e)
            self.checkpoints.save(state)
            raise e
