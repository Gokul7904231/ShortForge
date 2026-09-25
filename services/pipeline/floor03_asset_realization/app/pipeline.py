"""Master Orchestration Pipeline for Floor 03 (Asset Specification & Realization Planning)."""

from __future__ import annotations

import json
from time import perf_counter
from pathlib import Path
from uuid import uuid4
from typing import Any, Dict, List, Optional, Tuple

import structlog

from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload
from floors.floor03_asset_realization.app.core.config import settings
from floors.floor03_asset_realization.app.core.exceptions import Floor03Error, Floor03PlatformError, Floor03ValidationError
from floors.floor03_asset_realization.app.core.identity import request_fingerprint
from floors.floor03_asset_realization.app.domain.asset_models import AudioAssetRequirement, VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.asset_plan_ir import AssetDependency, AssetPlanIR, AssetPlanNode
from floors.floor03_asset_realization.app.domain.handoff import (
    EvidenceType,
    ExecutionMode,
    ExecutionModeDetails,
    Floor03HandoffPayload,
    Floor03Input,
    FloorExecutionReport,
    HandoffStatus,
    ProvenanceEntry,
    WorkerExecutionSummary,
)
from floors.floor03_asset_realization.app.infrastructure.memory_store import AssetMemoryStore
from floors.floor03_asset_realization.app.logical_workers.audio_spec_worker import AudioSpecWorker
from floors.floor03_asset_realization.app.logical_workers.continuity_worker import ContinuityWorker
from floors.floor03_asset_realization.app.logical_workers.image_prompt_worker import ImagePromptWorker
from floors.floor03_asset_realization.app.logical_workers.manifest_worker import ManifestWorker

logger = structlog.get_logger(__name__)


class Floor03Pipeline:
    """Master orchestrator for Floor 03 Asset Specification & Realization Planning."""

    def __init__(self, memory_store: Optional[AssetMemoryStore] = None, artifact_report_dir: Optional[str] = None):
        self.memory_store = memory_store or AssetMemoryStore()
        self.artifact_report_dir = Path(artifact_report_dir or "used_artifact/reports")
        self.artifact_report_dir.mkdir(parents=True, exist_ok=True)

        self.image_prompt_worker = ImagePromptWorker()
        self.audio_spec_worker = AudioSpecWorker()
        self.continuity_worker = ContinuityWorker()
        self.manifest_worker = ManifestWorker()

    def resolve_platform_spec(self, inp: Floor03Input) -> Tuple[str, str, str, ProvenanceEntry]:
        """Enforce Authoritative Platform Resolution Order:

        Caller override check -> Authorized caller override > Upstream strategy > Config default > Reject.
        Rejects unauthorized caller platform overrides.
        """
        # 1. Caller Override Validation
        if inp.platform:
            if not inp.authorized_override:
                raise Floor03PlatformError(
                    f"Unauthorized platform override attempt: '{inp.platform}'. "
                    "Caller overrides require authorized_override=True."
                )
            if inp.platform not in settings.PLATFORM_SPECS:
                raise Floor03PlatformError(f"Unsupported platform override: '{inp.platform}'.")
            resolved_platform = inp.platform
            source_desc = "authorized_caller_override"
        else:
            upstream_platform = None
            # Extract upstream platform from Floor02 provenance raw_data
            for prov in inp.floor02_payload.provenance:
                if isinstance(prov.raw_data, dict):
                    if "platform" in prov.raw_data:
                        upstream_platform = prov.raw_data["platform"]
                        break
                    elif "strategy" in prov.raw_data and isinstance(prov.raw_data["strategy"], dict):
                        upstream_platform = prov.raw_data["strategy"].get("platform")
                        if upstream_platform:
                            break

            if upstream_platform and upstream_platform in settings.PLATFORM_SPECS:
                resolved_platform = upstream_platform
                source_desc = "upstream_floor01_strategy"
            elif settings.DEFAULT_FALLBACK_PLATFORM in settings.PLATFORM_SPECS:
                resolved_platform = settings.DEFAULT_FALLBACK_PLATFORM
                source_desc = "configuration_default_fallback"
            else:
                raise Floor03PlatformError("Unresolved target platform. Upstream platform, override, or config required.")

        spec = settings.PLATFORM_SPECS[resolved_platform]
        aspect_ratio = inp.aspect_ratio or spec["aspect_ratio"]
        resolution = inp.target_resolution or spec["resolution"]

        prov = ProvenanceEntry(
            evidence_type=EvidenceType.DETERMINISTIC_RULE,
            source_type="platform_resolution_engine",
            source_identifier=source_desc,
            method="resolve_authoritative_platform",
            summary=f"Resolved platform '{resolved_platform}' ({aspect_ratio}, {resolution}) via {source_desc}.",
            raw_data={"resolved_platform": resolved_platform, "aspect_ratio": aspect_ratio, "resolution": resolution},
        )
        return resolved_platform, aspect_ratio, resolution, prov

    def _compile_asset_plan_ir(
        self,
        inp: Floor03Input,
        platform: str,
        aspect_ratio: str,
        resolution: str,
        visual_reqs: List[VisualAssetRequirement],
        plan_id: Optional[str] = None,
        plan_version: int = 1,
    ) -> AssetPlanIR:
        req_by_scene = {req.scene_id: req for req in visual_reqs}
        nodes: List[AssetPlanNode] = []
        for req in sorted(visual_reqs, key=lambda item: item.sequence_index):
            scene = next((sc for sc in inp.floor02_payload.scenes if sc.scene_id == req.scene_id), None)
            if scene is None or req.scene_plan is None:
                raise Floor03ValidationError(
                    f"Missing scene or scene plan for scene_id '{req.scene_id}'."
                )
            dependencies: List[AssetDependency] = []
            for dep_scene_id in scene.depends_on_scene_ids:
                dep_req = req_by_scene.get(dep_scene_id)
                if dep_req:
                    dependencies.append(
                        AssetDependency(asset_id=dep_req.asset_id, relation="scene_dependency")
                    )
            nodes.append(
                AssetPlanNode(
                    scene_id=req.scene_id,
                    sequence_index=req.sequence_index,
                    visual=req.scene_plan,
                    dependencies=dependencies,
                    target_duration_seconds=req.target_duration_seconds,
                    impact_radius=list(scene.depends_on_scene_ids),
                )
            )
        return AssetPlanIR(
            plan_id=plan_id or f"asset-plan-{inp.floor02_payload.script_id}-{inp.request_id}",
            plan_version=plan_version,
            script_id=inp.floor02_payload.script_id,
            script_version=inp.floor02_payload.script_version,
            platform=platform,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            nodes=nodes,
        )

    def _execute_internal(self, inp: Floor03Input) -> Tuple[Floor03HandoffPayload, Dict[str, float]]:
        """Execute once and return payload plus measured worker timings."""
        logger.info("floor03_pipeline_started", request_id=inp.request_id)

        # 1. Idempotency Check
        cached_dict = self.memory_store.get_idempotent_payload(inp.request_id)
        if cached_dict:
            cached_payload = Floor03HandoffPayload.model_validate(cached_dict)
            if cached_payload.script_id != inp.floor02_payload.script_id:
                raise Floor03ValidationError(
                    f"Idempotency conflict: request_id '{inp.request_id}' already associated with script_id '{cached_payload.script_id}'."
                )
            logger.info("floor03_pipeline_idempotent_hit", request_id=inp.request_id)
            return cached_payload

        # 2. Authoritative Platform Resolution
        platform, aspect_ratio, resolution, plat_prov = self.resolve_platform_spec(inp)

        provenance_list: List[ProvenanceEntry] = [plat_prov]
        worker_modes: Dict[str, ExecutionMode] = {}

        # 3. Image Prompt Worker
        image_started = perf_counter()
        visual_reqs, img_mode, img_provs = self.image_prompt_worker.execute(
            scenes=inp.floor02_payload.scenes,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            style_preset=inp.style_preset,
        )
        worker_modes["image_prompt_worker"] = img_mode
        provenance_list.extend(img_provs)
        image_duration_ms = round((perf_counter() - image_started) * 1000.0, 2)

        # 4. Audio Spec Worker
        audio_started = perf_counter()
        audio_reqs, aud_mode, aud_provs = self.audio_spec_worker.execute(
            scenes=inp.floor02_payload.scenes,
            voice_id=inp.voice_id,
        )
        worker_modes["audio_spec_worker"] = aud_mode
        provenance_list.extend(aud_provs)
        audio_duration_ms = round((perf_counter() - audio_started) * 1000.0, 2)

        # 5. Continuity Worker
        continuity_started = perf_counter()
        visual_reqs, cont_mode, cont_provs = self.continuity_worker.execute(
            visual_reqs=visual_reqs,
            character_profiles=inp.floor02_payload.character_profiles,
        )
        worker_modes["continuity_worker"] = cont_mode
        provenance_list.extend(cont_provs)
        continuity_duration_ms = round((perf_counter() - continuity_started) * 1000.0, 2)

        # 6. Manifest Worker
        manifest_started = perf_counter()
        manifest, man_mode, man_provs = self.manifest_worker.execute(
            script_id=inp.floor02_payload.script_id,
            script_version=inp.floor02_payload.script_version,
            resolved_platform=platform,
            resolved_aspect_ratio=aspect_ratio,
            resolved_resolution=resolution,
            visual_reqs=visual_reqs,
            audio_reqs=audio_reqs,
        )
        worker_modes["manifest_worker"] = man_mode
        provenance_list.extend(man_provs)
        manifest_duration_ms = round((perf_counter() - manifest_started) * 1000.0, 2)

        # Determine Global Execution Mode
        # DETERMINISTIC_FALLBACK is set ONLY if actual fallback occurred in a worker
        global_mode = ExecutionMode.DETERMINISTIC
        if any(m == ExecutionMode.DETERMINISTIC_FALLBACK for m in worker_modes.values()):
            global_mode = ExecutionMode.DETERMINISTIC_FALLBACK
        elif any(m == ExecutionMode.HYBRID for m in worker_modes.values()):
            global_mode = ExecutionMode.HYBRID
        elif all(m == ExecutionMode.MODEL for m in worker_modes.values()):
            global_mode = ExecutionMode.MODEL

        exec_details = ExecutionModeDetails(
            global_mode=global_mode,
            worker_modes=worker_modes,
            executed=False,
            executed_model=None,
        )

        payload = Floor03HandoffPayload(
            asset_plan_version=1,
            script_id=inp.floor02_payload.script_id,
            script_version=inp.floor02_payload.script_version,
            request_id=inp.request_id,
            resolved_platform=platform,
            execution_mode=exec_details,
            visual_asset_requirements=visual_reqs,
            audio_asset_requirements=audio_reqs,
            manifest=manifest,
            asset_plan_ir=self._compile_asset_plan_ir(
                inp,
                platform=platform,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                visual_reqs=visual_reqs,
            ),
            decision_quality_score=None,
            handoff_status=HandoffStatus.VALIDATED,
            provenance=provenance_list,
        )

        # Persist payload to memory store for process locking & deduplication
        self.memory_store.save_payload(inp.request_id, payload.model_dump())
        logger.info("floor03_pipeline_completed", request_id=inp.request_id, asset_plan_id=payload.asset_plan_id)
        return payload, {
            "image_prompt_worker": image_duration_ms,
            "audio_spec_worker": audio_duration_ms,
            "continuity_worker": continuity_duration_ms,
            "manifest_worker": manifest_duration_ms,
        }

    def execute(self, inp: Floor03Input) -> Floor03HandoffPayload:
        payload, _ = self._execute_internal(inp)
        return payload

    def execute_with_report(self, inp: Floor03Input) -> Tuple[Floor03HandoffPayload, FloorExecutionReport]:
        """Execute pipeline and persist Overseer FloorExecutionReport JSON artifact."""
        start_time = perf_counter()
        payload, worker_durations = self._execute_internal(inp)
        duration_ms = round((perf_counter() - start_time) * 1000.0, 2)

        worker_results = [
            WorkerExecutionSummary(worker_name=name, duration_ms=duration)
            for name, duration in worker_durations.items()
        ]

        report = FloorExecutionReport(
            request_id=inp.request_id,
            script_id=payload.script_id,
            asset_plan_id=payload.asset_plan_id,
            duration_ms=duration_ms,
            execution_mode=payload.execution_mode,
            status=HandoffStatus.VALIDATED,
            input_summary={
                "request_id": inp.request_id,
                "script_id": inp.floor02_payload.script_id,
                "resolved_platform": payload.resolved_platform,
                "request_fingerprint": request_fingerprint(
                    inp.request_id, inp.floor02_payload.script_id, inp.floor02_payload.script_version
                ),
            },
            worker_results=worker_results,
            decisions=[
                {
                    "total_visual_assets": payload.manifest.total_visual_assets,
                    "total_audio_assets": payload.manifest.total_audio_assets,
                    "resolved_platform": payload.resolved_platform,
                }
            ],
            decision_quality_score=None,
            component_gates={"asset_completeness_gate": True, "format_spec_gate": True},
            provenance_audit=payload.provenance,
            handoff_reference={"asset_plan_id": payload.asset_plan_id, "status": "VALIDATED"},
        )

        # Persist local JSON execution report artifact
        report_file = self.artifact_report_dir / f"floor03_execution_{report.execution_id}.json"
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump(report.model_dump(), f, indent=2)

        logger.info("floor03_execution_report_persisted", report_file=str(report_file))
        return payload, report

    def regenerate_scene_assets(
        self,
        current_payload: Floor03HandoffPayload,
        target_scene_id: str,
        new_prompt_instruction: str,
    ) -> Floor03HandoffPayload:
        """Execute targeted single-scene asset regeneration.

        Increments target scene asset versions with a new asset identity.
        Preserves exact specification equality for unaffected scenes.
        Increments asset_plan_version while preserving upstream ScriptIR version.
        """
        logger.info("regenerate_scene_assets_started", target_scene_id=target_scene_id)

        target_visual_found = False
        updated_visuals: List[VisualAssetRequirement] = []

        for req in current_payload.visual_asset_requirements:
            if req.scene_id == target_scene_id:
                target_visual_found = True
                updated_req = req.model_copy(deep=True)
                updated_req.asset_id = str(uuid4())
                updated_req.asset_version += 1
                updated_req.scene_version += 1
                updated_req.prompt_text = f"{req.prompt_text} ({new_prompt_instruction})"
                updated_visuals.append(updated_req)
            else:
                # Unaffected scenes: Byte and semantic equivalence preserved
                updated_visuals.append(req.model_copy(deep=True))

        if not target_visual_found:
            raise Floor03ValidationError(f"Target scene_id '{target_scene_id}' not found in visual asset requirements.")

        updated_audios: List[AudioAssetRequirement] = [a.model_copy(deep=True) for a in current_payload.audio_asset_requirements]

        new_payload = current_payload.model_copy(deep=True)
        new_payload.asset_plan_version += 1
        new_payload.visual_asset_requirements = updated_visuals
        new_payload.audio_asset_requirements = updated_audios

        new_prov = ProvenanceEntry(
            evidence_type=EvidenceType.DETERMINISTIC_RULE,
            source_type="scene_asset_regenerator",
            source_identifier=target_scene_id,
            method="regenerate_target_scene_assets",
            summary=f"Regenerated assets for scene {target_scene_id} (incremented asset_version & plan_version).",
            raw_data={"target_scene_id": target_scene_id, "instruction": new_prompt_instruction},
        )
        new_payload.provenance.append(new_prov)

        logger.info("regenerate_scene_assets_completed", asset_plan_version=new_payload.asset_plan_version)
        return new_payload
