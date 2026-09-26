"""Pipeline service for Floor 05 Timeline Composition & Video Assembly."""

from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional
from uuid import uuid4

import structlog

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor05_timeline_composition.app.domain.handoff import Floor05HandoffPayload, Floor05Input, RenderJobState
from floors.floor05_timeline_composition.app.services.reconciliation import CrashReconciliationEngine
from floors.floor05_timeline_composition.app.services.registry import TimelineRegistry
from floors.floor05_timeline_composition.app.services.validators import PhysicalVideoValidator, SemanticCompositionValidator
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker
from floors.floor05_timeline_composition.app.workers.render_worker import ReferenceRenderWorker

logger = structlog.get_logger(__name__)


class Floor05PipelineService:
    """Orchestrates timeline composition, video rendering, double validation, and transaction committing."""

    def __init__(self, storage_root: Optional[str] = None):
        if storage_root:
            self.storage_root = Path(storage_root).resolve()
        else:
            self.storage_root = Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "renders"
        self.storage_root.mkdir(parents=True, exist_ok=True)

        self.registry = TimelineRegistry(storage_root=str(self.storage_root))
        self.reconciliation = CrashReconciliationEngine(storage_root=str(self.storage_root))

    def run_pipeline(self, input_payload: Floor05Input) -> Floor05HandoffPayload:
        """Run Floor 05 composition, render, double validation, and transaction commit."""
        request_id = input_payload.request_id or f"req-{uuid4().hex[:8]}"
        f03_payload = input_payload.floor03_payload
        f04_payload = input_payload.floor04_payload

        # Step 1: Assemble TimelineSpec
        timeline_spec = TimelineCompositionWorker.assemble_timeline(
            floor03_payload=f03_payload,
            floor04_payload=f04_payload,
            target_fps=input_payload.target_fps,
        )
        self.registry.register_timeline(timeline_spec)

        # Step 2: Render Reference Video Artifact
        job_spec, video_path, thumb_path = ReferenceRenderWorker.execute_render(
            request_id=request_id,
            floor03_payload=f03_payload,
            floor04_payload=f04_payload,
            timeline_spec=timeline_spec,
            storage_root=str(self.storage_root),
        )

        # Record journal executing state
        tx_id = f"tx-render-{job_spec.render_job_id}"
        self.reconciliation.record_transaction(tx_id, "RENDERING", {"files": [video_path, thumb_path]})

        # Step 3: Physical Video Validation
        mime, sha256_val, size_bytes, duration = PhysicalVideoValidator.validate_rendered_video(
            file_path=video_path,
            render_job=job_spec,
            timeline_spec=timeline_spec,
            storage_root=str(self.storage_root),
        )

        # Step 4: Semantic Composition Validation (10 Invariants S1-S10)
        SemanticCompositionValidator.validate_semantic_composition(
            render_job=job_spec,
            timeline_spec=timeline_spec,
            rendered_sha256=sha256_val,
        )

        # Step 5: Mark Job Committed
        job_spec.state = RenderJobState.COMMITTED
        self.registry.register_render_job(job_spec)
        self.reconciliation.record_transaction(tx_id, "COMMITTED", {"files": [video_path, thumb_path]})

        # Step 6: Compute cumulative provenance hash
        provenance_str = f"{f03_payload.asset_plan_ir.plan_fingerprint if f03_payload.asset_plan_ir else f03_payload.asset_plan_id}:{f04_payload.provenance_hash}:{job_spec.render_input_hash}:{sha256_val}"
        provenance_hash = hashlib.sha256(provenance_str.encode("utf-8")).hexdigest()

        handoff = Floor05HandoffPayload(
            request_id=request_id,
            execution_id=job_spec.execution_id,
            floor04_payload=f04_payload,
            timeline_spec=timeline_spec,
            render_job=job_spec,
            rendered_video_path=video_path,
            rendered_thumbnail_path=thumb_path,
            sha256_checksum=sha256_val,
            file_size_bytes=size_bytes,
            execution_mode=input_payload.execution_mode,
            provenance_hash=provenance_hash,
        )

        logger.info("floor05_pipeline_execution_successful", request_id=request_id, render_job_id=job_spec.render_job_id)
        return handoff
