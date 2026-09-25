"""Floor 03 visual planning worker."""

from __future__ import annotations

from typing import Any, Dict, List, Optional, Tuple

import structlog

from floors.floor02_scripting.app.domain.script_models import SceneSpecification
from floors.floor03_asset_realization.app.core.exceptions import Floor03ValidationError
from floors.floor03_asset_realization.app.core.security import sanitize_input_text
from floors.floor03_asset_realization.app.domain.asset_models import AssetRole, AssetType, VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.asset_plan_ir import (
    CameraSpec,
    ContinuityMode,
    CoverageRole,
    ContinuityPlan,
    GenerationInputMode,
    MotionBeat,
    ReferenceBinding,
    ReferenceStrategy,
    ReferenceUse,
    SafeRegion,
    VisualPromptPlan,
    VisualShotType,
)
from floors.floor03_asset_realization.app.domain.handoff import EvidenceType, ExecutionMode, ProvenanceEntry
from floors.floor03_asset_realization.app.infrastructure.llm_asset_adapter import LLMAssetAdapter

logger = structlog.get_logger(__name__)


class ImagePromptWorker:
    """Convert F02 visual intent into provider-neutral shot/asset specifications.

    The worker never selects a provider, writes media, or mutates upstream ScriptIR.
    Structured F02 intent is preferred over reparsing prose when available.
    """

    def __init__(self, llm_adapter: Optional[LLMAssetAdapter] = None):
        self.llm_adapter = llm_adapter or LLMAssetAdapter()

    @staticmethod
    def _shot_type(scene: SceneSpecification) -> VisualShotType:
        structured = scene.visual_intent_structured or {}
        explicit = structured.get("shot_type")
        if isinstance(explicit, str):
            normalized = explicit.upper().replace("-", "_").replace(" ", "_")
            try:
                return VisualShotType(normalized)
            except ValueError:
                pass

        intent = (scene.visual_intent or "").lower()
        if any(k in intent for k in ("close-up", "closeup", "detail")):
            return VisualShotType.CLOSEUP
        if any(k in intent for k in ("character", "person", "host")):
            return VisualShotType.CHARACTER
        if any(k in intent for k in ("diagram", "chart", "graph")):
            return VisualShotType.DIAGRAM
        if any(k in intent for k in ("text", "caption", "quote")):
            return VisualShotType.TEXT
        if scene.sequence_index == 1:
            return VisualShotType.ESTABLISHING
        return VisualShotType.BROLL

    @staticmethod
    def _coverage_role(scene: SceneSpecification, shot_type: VisualShotType) -> CoverageRole:
        structured = scene.visual_intent_structured or {}
        explicit = str(structured.get("coverage_role") or "").strip().lower()
        if explicit:
            try:
                return CoverageRole(explicit)
            except ValueError:
                pass

        intent = (scene.visual_intent or "").lower()
        if shot_type == VisualShotType.TEXT:
            return CoverageRole.OVERLAY
        if shot_type == VisualShotType.CLOSEUP:
            return CoverageRole.DETAIL
        if any(token in intent for token in ("reaction", "reacts", "responds", "listens")):
            return CoverageRole.REACTION
        if any(token in intent for token in ("transition", "cut to", "moves to", "shift")):
            return CoverageRole.TRANSITION
        if any(token in intent for token in ("payoff", "reveal", "conclusion", "cta")):
            return CoverageRole.PAYOFF
        if scene.sequence_index == 1 or shot_type == VisualShotType.ESTABLISHING:
            return CoverageRole.ESTABLISH
        return CoverageRole.ACTION

    @staticmethod
    def _safe_text_region(scene: SceneSpecification, shot_type: VisualShotType):
        structured = scene.visual_intent_structured or {}
        raw = structured.get("safe_text_region_box")
        if isinstance(raw, dict):
            try:
                return SafeRegion(
                    x=float(raw["x"]),
                    y=float(raw["y"]),
                    width=float(raw["width"]),
                    height=float(raw["height"]),
                )
            except (KeyError, TypeError, ValueError):
                pass

        if shot_type == VisualShotType.TEXT:
            return SafeRegion(x=0.05, y=0.05, width=0.90, height=0.90)
        return SafeRegion(x=0.10, y=0.10, width=0.80, height=0.80)

    @staticmethod
    def _string_list(value: Any) -> List[str]:
        if not isinstance(value, list):
            return []
        return [str(item).strip() for item in value if str(item).strip()]

    @classmethod
    def _references(
        cls,
        scene: SceneSpecification,
    ) -> Tuple[List[ReferenceBinding], List[GenerationInputMode]]:
        structured = scene.visual_intent_structured or {}
        references: List[ReferenceBinding] = []
        inputs = {GenerationInputMode.TEXT}

        for character_id in scene.character_references:
            references.append(
                ReferenceBinding(
                    reference_id=character_id,
                    use=ReferenceUse.CHARACTER_IDENTITY,
                    subject_id=character_id,
                    required=True,
                )
            )
            inputs.add(GenerationInputMode.IMAGE_REFERENCE)

        raw_refs = structured.get("video_references")
        if isinstance(raw_refs, list):
            for raw in raw_refs:
                if not isinstance(raw, dict):
                    continue
                reference_id = str(raw.get("source_id") or raw.get("reference_id") or "").strip()
                usage = str(raw.get("usage") or "").strip()
                if not reference_id:
                    continue
                use_map = {
                    "reference_character": ReferenceUse.CHARACTER_IDENTITY,
                    "reference_prop": ReferenceUse.PROP,
                    "reference_composition": ReferenceUse.COMPOSITION,
                    "reference_style": ReferenceUse.STYLE,
                    "reference_stage": ReferenceUse.STAGE,
                    "reference_target_state": ReferenceUse.TARGET_STATE,
                    "first_frame": ReferenceUse.FIRST_FRAME,
                    "last_frame": ReferenceUse.LAST_FRAME,
                    "reference_video": ReferenceUse.VIDEO,
                }
                use = use_map.get(usage)
                if use is None:
                    continue
                references.append(
                    ReferenceBinding(
                        reference_id=reference_id,
                        use=use,
                        subject_id=str(raw.get("subject") or "").strip() or None,
                        required=bool(raw.get("required", True)),
                    )
                )
                if use in {ReferenceUse.FIRST_FRAME}:
                    inputs.add(GenerationInputMode.FIRST_FRAME)
                elif use in {ReferenceUse.LAST_FRAME}:
                    inputs.add(GenerationInputMode.LAST_FRAME)
                elif use == ReferenceUse.VIDEO:
                    inputs.add(GenerationInputMode.VIDEO_REFERENCE)
                else:
                    inputs.add(GenerationInputMode.IMAGE_REFERENCE)

        continuity_mode = str(
            structured.get("continuity_mode")
            or scene.continuity_rules.get("continuity_mode")
            or "independent"
        ).lower()
        chain_requested = bool(
            structured.get("chain_from_previous")
            or scene.continuity_rules.get("chain_from_previous")
            or continuity_mode in {"scene_end", "chain_from_previous"}
        )
        if chain_requested:
            for dependency_scene_id in scene.depends_on_scene_ids:
                references.append(
                    ReferenceBinding(
                        reference_id=f"scene:{dependency_scene_id}:last-frame",
                        use=ReferenceUse.LAST_FRAME,
                        subject_id=dependency_scene_id,
                        source_scene_id=dependency_scene_id,
                        required=False,
                    )
                )
                inputs.add(GenerationInputMode.LAST_FRAME)

        return references, sorted(inputs, key=lambda item: item.value)

    @staticmethod
    def _reference_strategy(
        references: List[ReferenceBinding],
        chain_requested: bool,
    ) -> ReferenceStrategy:
        reference_first = any(
            ref.use in {
                ReferenceUse.CHARACTER_IDENTITY,
                ReferenceUse.PROP,
                ReferenceUse.COMPOSITION,
                ReferenceUse.STYLE,
                ReferenceUse.STAGE,
                ReferenceUse.TARGET_STATE,
                ReferenceUse.VIDEO,
            }
            for ref in references
        )
        last_frame_chain = chain_requested or any(
            ref.use == ReferenceUse.LAST_FRAME for ref in references
        )
        if reference_first and last_frame_chain:
            return ReferenceStrategy.HYBRID
        if reference_first:
            return ReferenceStrategy.REFERENCE_FIRST
        if last_frame_chain:
            return ReferenceStrategy.LAST_FRAME_CHAIN
        return ReferenceStrategy.NONE

    @classmethod
    def _continuity(
        cls,
        scene: SceneSpecification,
        references: List[ReferenceBinding],
    ) -> ContinuityPlan:
        structured = scene.visual_intent_structured or {}
        raw_mode = str(
            structured.get("continuity_mode")
            or scene.continuity_rules.get("continuity_mode")
            or "independent"
        ).lower()
        try:
            mode = ContinuityMode(raw_mode)
        except ValueError:
            mode = ContinuityMode.INDEPENDENT

        chain_requested = bool(
            structured.get("chain_from_previous")
            or scene.continuity_rules.get("chain_from_previous")
            or mode in {ContinuityMode.SCENE_END, ContinuityMode.CHAIN_FROM_PREVIOUS}
        )

        return ContinuityPlan(
            mode=mode,
            reference_strategy=cls._reference_strategy(references, chain_requested),
            chain_from_previous=chain_requested,
            locked_subject_ids=list(scene.character_references),
            invariant_attributes=cls._string_list(
                structured.get("subject_constraints")
                or scene.continuity_rules.get("locked_attributes")
            ),
            allowed_changes=cls._string_list(
                structured.get("allowed_changes")
                or scene.continuity_rules.get("allowed_changes")
            ),
            reanchor_required=mode == ContinuityMode.REANCHOR,
        )

    @classmethod
    def _motion_beats(cls, scene: SceneSpecification) -> List[MotionBeat]:
        raw = (scene.visual_intent_structured or {}).get("time_beats")
        if not isinstance(raw, list):
            return []
        result: List[MotionBeat] = []
        for beat in raw:
            if not isinstance(beat, dict):
                continue
            try:
                motion = MotionBeat(
                    start_seconds=float(beat.get("start_seconds", beat.get("start", 0))),
                    end_seconds=float(beat.get("end_seconds", beat.get("end", 0))),
                    instruction=str(beat.get("instruction") or beat.get("description") or "").strip(),
                )
            except (TypeError, ValueError) as exc:
                raise Floor03ValidationError(
                    f"Invalid motion beat for scene_id '{scene.scene_id}'."
                ) from exc

            if motion.end_seconds > float(scene.target_duration_seconds):
                raise Floor03ValidationError(
                    f"Motion beat for scene_id '{scene.scene_id}' exceeds target duration."
                )
            result.append(motion)

        return result

    @classmethod
    def _camera(
        cls,
        scene: SceneSpecification,
        shot_type: VisualShotType,
    ) -> CameraSpec:
        structured = scene.visual_intent_structured or {}
        camera_block = structured.get("camera")
        camera_block = camera_block if isinstance(camera_block, dict) else {}
        focal = camera_block.get("focal_length_mm", structured.get("focal_length_mm"))
        try:
            focal_value = float(focal) if focal is not None else None
        except (TypeError, ValueError):
            focal_value = None

        return CameraSpec(
            shot_type=shot_type,
            framing=str(camera_block.get("framing") or structured.get("framing") or "").strip() or None,
            camera_angle=str(
                camera_block.get("camera_angle")
                or structured.get("camera_angle")
                or ""
            ).strip()
            or None,
            camera_height=str(
                camera_block.get("camera_height")
                or structured.get("camera_height")
                or ""
            ).strip()
            or None,
            lens_profile=str(
                camera_block.get("lens_profile")
                or structured.get("lens_profile")
                or structured.get("lens")
                or ""
            ).strip()
            or None,
            camera_body=str(
                camera_block.get("camera_body")
                or structured.get("camera_body")
                or ""
            ).strip()
            or None,
            focal_length_mm=focal_value,
            movement=str(
                camera_block.get("movement")
                or structured.get("camera_movement")
                or ""
            ).strip()
            or None,
            subject_position=str(
                camera_block.get("subject_position")
                or structured.get("subject_position")
                or ""
            ).strip()
            or None,
            safe_text_region=cls._safe_text_region(scene, shot_type),
        )

    def execute(
        self,
        scenes: List[SceneSpecification],
        aspect_ratio: str,
        resolution: str,
        style_preset: str = None,
    ) -> Tuple[List[VisualAssetRequirement], ExecutionMode, List[ProvenanceEntry]]:
        visual_reqs: List[VisualAssetRequirement] = []
        provenance: List[ProvenanceEntry] = []
        worker_modes: List[ExecutionMode] = []

        for sc in scenes:
            raw_intent = (sc.visual_intent or "").strip()
            if not raw_intent:
                raise Floor03ValidationError(
                    f"Missing required visual_intent for scene_id '{sc.scene_id}'."
                )

            sanitized_intent = sanitize_input_text(raw_intent)
            if not sanitized_intent:
                raise Floor03ValidationError(
                    f"visual_intent became empty after sanitization for scene_id '{sc.scene_id}'."
                )

            res = self.llm_adapter.enhance_visual_prompt(
                visual_intent=sanitized_intent,
                aspect_ratio=aspect_ratio,
                style_preset=style_preset,
            )
            worker_modes.append(res["mode"])

            shot_type = self._shot_type(sc)
            coverage_role = self._coverage_role(sc, shot_type)
            references, generation_inputs = self._references(sc)
            continuity = self._continuity(sc, references)
            structured = sc.visual_intent_structured or {}

            negative_values = structured.get("negative_constraints") or sc.continuity_rules.get(
                "negative_constraints"
            )
            negative_prompt = ", ".join(self._string_list(negative_values)) or None

            style_tokens = ([style_preset] if style_preset else []) + self._string_list(
                structured.get("style_tokens")
            )

            visual_plan = VisualPromptPlan(
                prompt_text=res["prompt_text"],
                negative_prompt=negative_prompt,
                lighting=str(
                    structured.get("lighting")
                    or sc.continuity_rules.get("lighting")
                    or ""
                ).strip() or None,
                camera=self._camera(sc, shot_type),
                style_tokens=list(dict.fromkeys(style_tokens)),
                subject_constraints=self._string_list(
                    structured.get("subject_constraints")
                    or sc.continuity_rules.get("subject_constraints")
                ),
                references=references,
                continuity=continuity,
                motion_beats=self._motion_beats(sc),
                start_state=str(structured.get("start_state") or "").strip() or None,
                end_state=str(
                    structured.get("end_frame_description")
                    or structured.get("end_state")
                    or ""
                ).strip()
                or None,
                generation_inputs=generation_inputs,
            )

            v_req = VisualAssetRequirement(
                asset_type=AssetType.VISUAL,
                asset_role=AssetRole.BACKGROUND_VISUAL,
                scene_id=sc.scene_id,
                scene_version=sc.scene_version,
                sequence_index=sc.sequence_index,
                prompt_text=res["prompt_text"],
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                style_preset=style_preset,
                target_duration_seconds=sc.target_duration_seconds,
                character_references=list(sc.character_references),
                continuity_constraints={
                    **dict(sc.continuity_rules),
                    "shot_type": shot_type.value,
                    "safe_text_region": visual_plan.camera.safe_text_region.model_dump(),
                    "dependency_scene_ids": list(sc.depends_on_scene_ids),
                    "coverage_role": coverage_role.value,
                },
                scene_plan=visual_plan,
            )
            visual_reqs.append(v_req)

            provenance.append(
                ProvenanceEntry(
                    evidence_type=EvidenceType.UPSTREAM_HANDOFF,
                    source_type="floor02_scene_specification",
                    source_identifier=sc.scene_id,
                    method="compile_visual_asset_plan_v2",
                    summary=f"Compiled structured provider-neutral shot plan for scene {sc.scene_id}.",
                    raw_data={
                        "scene_id": sc.scene_id,
                        "shot_type": shot_type.value,
                        "depends_on_scene_ids": list(sc.depends_on_scene_ids),
                        "character_references": list(sc.character_references),
                        "structured_intent_keys": sorted(structured.keys()),
                    },
                )
            )

        overall_mode = ExecutionMode.DETERMINISTIC
        if any(m == ExecutionMode.DETERMINISTIC_FALLBACK for m in worker_modes):
            overall_mode = ExecutionMode.DETERMINISTIC_FALLBACK
        elif any(m == ExecutionMode.MODEL for m in worker_modes):
            overall_mode = ExecutionMode.MODEL
        return visual_reqs, overall_mode, provenance
