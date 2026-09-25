"""Floor 03 visual planning worker."""

from __future__ import annotations

from typing import List, Optional, Tuple

import structlog

from floors.floor02_scripting.app.domain.script_models import SceneSpecification
from floors.floor03_asset_realization.app.core.exceptions import Floor03ValidationError
from floors.floor03_asset_realization.app.core.security import sanitize_input_text
from floors.floor03_asset_realization.app.domain.asset_models import AssetRole, AssetType, VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.asset_plan_ir import CameraSpec, VisualPromptPlan, VisualShotType
from floors.floor03_asset_realization.app.domain.handoff import EvidenceType, ExecutionMode, ProvenanceEntry
from floors.floor03_asset_realization.app.infrastructure.llm_asset_adapter import LLMAssetAdapter

logger = structlog.get_logger(__name__)


class ImagePromptWorker:
    """Convert F02 visual intent into provider-neutral shot/asset specifications.

    Model use is optional and bounded to prompt/shot enrichment. The worker never
    selects a provider, writes media, or mutates upstream ScriptIR.
    """

    def __init__(self, llm_adapter: Optional[LLMAssetAdapter] = None):
        self.llm_adapter = llm_adapter or LLMAssetAdapter()

    @staticmethod
    def _shot_type(scene: SceneSpecification) -> VisualShotType:
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
                raise Floor03ValidationError(f"Missing required visual_intent for scene_id '{sc.scene_id}'.")

            sanitized_intent = sanitize_input_text(raw_intent)
            if not sanitized_intent:
                raise Floor03ValidationError(f"visual_intent became empty after sanitization for scene_id '{sc.scene_id}'.")

            res = self.llm_adapter.enhance_visual_prompt(
                visual_intent=sanitized_intent,
                aspect_ratio=aspect_ratio,
                style_preset=style_preset,
            )
            worker_modes.append(res["mode"])

            shot_type = self._shot_type(sc)
            visual_plan = VisualPromptPlan(
                prompt_text=res["prompt_text"],
                camera=CameraSpec(
                    shot_type=shot_type,
                    safe_text_region="center-safe-80" if shot_type != VisualShotType.TEXT else "full-frame-safe-80",
                ),
                style_tokens=[style_preset] if style_preset else [],
                continuity_keys=list(sc.character_references),
            )

            scene_plan = visual_plan

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
                    "safe_text_region": visual_plan.camera.safe_text_region,
                },
                scene_plan=scene_plan,
            )
            visual_reqs.append(v_req)

            provenance.append(
                ProvenanceEntry(
                    evidence_type=EvidenceType.UPSTREAM_HANDOFF,
                    source_type="floor02_scene_specification",
                    source_identifier=sc.scene_id,
                    method="compile_visual_asset_plan",
                    summary=f"Compiled provider-neutral shot plan for scene {sc.scene_id}.",
                    raw_data={
                        "scene_id": sc.scene_id,
                        "shot_type": shot_type.value,
                        "prompt_text": res["prompt_text"],
                        "depends_on_scene_ids": list(sc.depends_on_scene_ids),
                    },
                )
            )

        overall_mode = ExecutionMode.DETERMINISTIC
        if any(m == ExecutionMode.DETERMINISTIC_FALLBACK for m in worker_modes):
            overall_mode = ExecutionMode.DETERMINISTIC_FALLBACK
        elif any(m == ExecutionMode.MODEL for m in worker_modes):
            overall_mode = ExecutionMode.MODEL
        return visual_reqs, overall_mode, provenance
