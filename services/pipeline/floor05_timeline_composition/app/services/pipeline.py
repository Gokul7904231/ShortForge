"""Floor 05 converged timeline composition and reference rendering pipeline."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Optional
from uuid import uuid4

import structlog

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05HandoffPayload,
    Floor05Input,
    GuardianAuthorizationContext,
    RenderJobState,
)
from floors.floor05_timeline_composition.app.services.canonical_hasher import CanonicalHasher
from floors.floor05_timeline_composition.app.services.reconciliation import CrashReconciliationEngine
from floors.floor05_timeline_composition.app.services.registry import TimelineRegistry
from floors.floor05_timeline_composition.app.services.source_manifest import SourceManifestVerifier
from floors.floor05_timeline_composition.app.services.subtitle_sidecar import write_webvtt, validate_webvtt
from floors.floor05_timeline_composition.app.services.validators import (
    PhysicalVideoValidator,
    SemanticCompositionValidator,
)
from floors.floor05_timeline_composition.app.services.timeline_ir_bridge import (
    canonical_timeline_ir_document,
    canonical_timeline_ir_fingerprint,
)
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker
from floors.floor05_timeline_composition.app.workers.render_worker import ReferenceRenderWorker

logger = structlog.get_logger(__name__)


class Floor05PipelineService:
    """Converge verified F03/F04 media into a deterministic, validated render intent and artifact."""

    def __init__(self, storage_root: Optional[str] = None):
        self.storage_root = (
            Path(storage_root).resolve()
            if storage_root
            else Path(__file__).resolve().parent.parent.parent.parent.parent / "data" / "renders"
        )
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.registry = TimelineRegistry(storage_root=str(self.storage_root))
        self.reconciliation = CrashReconciliationEngine(storage_root=str(self.storage_root))

    @staticmethod
    def _provenance_hash(f03_payload, f04_payload, timeline_fingerprint: str, render_input_hash: str, artifact_sha256: str) -> str:
        material = (
            f"{f03_payload.asset_plan_ir.plan_fingerprint}:"
            f"{f04_payload.provenance_hash}:"
            f"{timeline_fingerprint}:"
            f"{render_input_hash}:"
            f"{artifact_sha256}"
        )
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _finalize_handoff(
        self,
        request_id: str,
        input_payload: Floor05Input,
        timeline_spec,
        job_spec,
        video_path: str,
        thumb_path: str,
        authorization: GuardianAuthorizationContext,
        canonical_ir_path: str,
        canonical_ir_fingerprint: str,
        subtitle_path: str,
    ) -> Floor05HandoffPayload:
        mime, sha256_val, size_bytes, duration = PhysicalVideoValidator.validate_rendered_video(
            file_path=video_path,
            render_job=job_spec,
            timeline_spec=timeline_spec,
            storage_root=str(self.storage_root),
        )
        PhysicalVideoValidator.validate_thumbnail(
            file_path=thumb_path,
            storage_root=str(self.storage_root),
        )
        SemanticCompositionValidator.validate_semantic_composition(
            render_job=job_spec,
            timeline_spec=timeline_spec,
            rendered_sha256=sha256_val,
        )
        job_spec.artifact_sha256 = sha256_val
        job_spec.artifact_size_bytes = size_bytes
        job_spec.artifact_duration_seconds = duration
        if job_spec.state == RenderJobState.COMMITTED:
            pass
        else:
            job_spec.transition_to(RenderJobState.PHYSICAL_VALIDATION)
            job_spec.transition_to(RenderJobState.SEMANTIC_VALIDATION)
            job_spec.transition_to(RenderJobState.COMMITTED)
        self.registry.register_render_job(job_spec)

        timeline_fingerprint = CanonicalHasher.compute_timeline_fingerprint(timeline_spec)
        provenance_hash = self._provenance_hash(
            input_payload.floor03_payload,
            input_payload.floor04_payload,
            timeline_fingerprint,
            job_spec.render_input_hash,
            sha256_val,
        )
        ffprobe_summary = PhysicalVideoValidator.probe_rendered_video(video_path)
        validate_webvtt(subtitle_path, timeline_spec)
        return Floor05HandoffPayload(
            request_id=request_id,
            execution_id=job_spec.execution_id,
            floor03_payload=input_payload.floor03_payload,
            floor04_payload=input_payload.floor04_payload,
            timeline_spec=timeline_spec,
            timeline_fingerprint=timeline_fingerprint,
            render_job=job_spec,
            rendered_video_path=video_path,
            rendered_thumbnail_path=thumb_path,
            sha256_checksum=sha256_val,
            file_size_bytes=size_bytes,
            execution_mode=input_payload.execution_mode,
            provenance_hash=provenance_hash,
            ffprobe_summary=ffprobe_summary,
            canonical_timeline_ir_path=canonical_ir_path,
            canonical_timeline_ir_fingerprint=canonical_ir_fingerprint,
            subtitle_file_path=subtitle_path,
        )

    def run_pipeline(
        self,
        input_payload: Floor05Input,
        authorization: GuardianAuthorizationContext,
    ) -> Floor05HandoffPayload:
        """Compose exact F03 intent + F04 media only after an authenticated Guardian decision."""
        if authorization.floor_id != "floor05":
            raise GuardianValidationError("Floor 05 execution denied: authorization scope is not floor05.")
        if authorization.capability_name != "timeline_composition_pipeline_worker":
            raise GuardianValidationError("Floor 05 execution denied: wrong Guardian capability.")
        if authorization.authorized_by != "GUARDIAN_ACTION_GATE":
            raise GuardianValidationError("Floor 05 execution denied: authorization source is not Guardian.")
        request_id = input_payload.request_id or f"req-f05-{uuid4().hex[:8]}"
        f03_payload = input_payload.floor03_payload
        f04_payload = input_payload.floor04_payload

        # Gate 0: verify immutable F04 manifest before any composition decisions.
        SourceManifestVerifier.verify_visuals(f04_payload.synthesized_visual_assets)
        SourceManifestVerifier.verify_audio(f04_payload.synthesized_audio_assets)
        SourceManifestVerifier.verify_background_audio(f04_payload.background_audio_asset)

        # Gate 1: compile deterministic timeline.
        timeline_spec = TimelineCompositionWorker.assemble_timeline(
            floor03_payload=f03_payload,
            floor04_payload=f04_payload,
            target_fps=input_payload.target_fps,
        )
        SemanticCompositionValidator.validate_lineage(f03_payload, f04_payload, timeline_spec)
        timeline_fingerprint = CanonicalHasher.compute_timeline_fingerprint(timeline_spec)
        canonical_ir_fp = canonical_timeline_ir_fingerprint(timeline_spec, request_id)
        canonical_ir_path = self.storage_root / f"timeline_{timeline_spec.timeline_id}.timelineir.json"
        canonical_ir_path.write_text(
            canonical_timeline_ir_document(timeline_spec, request_id),
            encoding="utf-8",
        )
        subtitle_path = self.storage_root / f"subtitle_{timeline_spec.timeline_id}.vtt"
        write_webvtt(timeline_spec, str(subtitle_path))
        self.registry.register_timeline(timeline_spec)

        # Compute the render identity before dispatch so duplicate requests can reuse a committed artifact.
        expected_render_hash = CanonicalHasher.compute_render_input_hash(
            floor04_payload=f04_payload,
            timeline_spec=timeline_spec,
            renderer_id=ReferenceRenderWorker.RENDERER_ID,
            renderer_version=ReferenceRenderWorker.RENDERER_VERSION,
            canonical_timeline_ir_fingerprint=canonical_ir_fp,
        )
        existing = self.registry.get_render_job_by_hash(expected_render_hash)
        if existing is not None:
            video_path = existing.artifact_reference
            thumb_path = str(self.storage_root / f"thumb_{existing.render_job_id}.png")
            if video_path and Path(video_path).exists() and Path(thumb_path).exists():
                return self._finalize_handoff(
                    request_id=request_id,
                    input_payload=input_payload,
                    timeline_spec=timeline_spec,
                    job_spec=existing,
                    video_path=video_path,
                    thumb_path=thumb_path,
                    authorization=authorization,
                    canonical_ir_path=str(canonical_ir_path),
                    canonical_ir_fingerprint=canonical_ir_fp,
                    subtitle_path=str(subtitle_path),
                )

        # Gate 2: create an early crash-recovery journal before FFmpeg starts.
        tx_id = f"tx-render-{expected_render_hash[:20]}"
        self.reconciliation.record_transaction(
            tx_id,
            "RENDERING",
            {
                "request_id": request_id,
                "files": [],
                "source_asset_plan_fingerprint": f03_payload.asset_plan_ir.plan_fingerprint,
                "timeline_fingerprint": timeline_fingerprint,
                "render_input_hash": expected_render_hash,
                "canonical_timeline_ir_fingerprint": canonical_ir_fp,
                "authorization_decision_id": authorization.decision_id,
            },
        )

        try:
            job_spec, video_path, thumb_path = ReferenceRenderWorker.execute_render(
                request_id=request_id,
                floor03_payload=f03_payload,
                floor04_payload=f04_payload,
                timeline_spec=timeline_spec,
                storage_root=str(self.storage_root),
                authorization_reference=f"guardian-decision:{authorization.decision_id}",
                canonical_timeline_ir_fingerprint=canonical_ir_fp,
            )
            video_file = Path(video_path)
            thumb_file = Path(thumb_path)
            expected_artifacts = {
                "video": {
                    "sha256": hashlib.sha256(video_file.read_bytes()).hexdigest(),
                    "size_bytes": video_file.stat().st_size,
                },
                "thumbnail": {
                    "sha256": hashlib.sha256(thumb_file.read_bytes()).hexdigest(),
                    "size_bytes": thumb_file.stat().st_size,
                },
            }
            self.reconciliation.record_transaction(
                tx_id,
                "ARTIFACT_RECEIVED",
                {
                    "files": [
                        {"path": video_path, "kind": "video"},
                        {"path": thumb_path, "kind": "thumbnail"},
                    ],
                    "expected_artifacts": expected_artifacts,
                },
            )

            # Gate 3: physical + semantic verification.
            handoff = self._finalize_handoff(
                request_id=request_id,
                input_payload=input_payload,
                timeline_spec=timeline_spec,
                job_spec=job_spec,
                video_path=video_path,
                thumb_path=thumb_path,
                authorization=authorization,
                canonical_ir_path=str(canonical_ir_path),
                canonical_ir_fingerprint=canonical_ir_fp,
                subtitle_path=str(subtitle_path),
            )

            self.reconciliation.record_transaction(
                tx_id,
                "COMMITTED",
                {
                    "files": [
                        {"path": video_path, "kind": "video"},
                        {"path": thumb_path, "kind": "thumbnail"},
                    ],
                    "artifact_sha256": handoff.sha256_checksum,
                    "artifact_size_bytes": handoff.file_size_bytes,
                },
            )
            logger.info(
                "floor05_pipeline_execution_successful",
                request_id=request_id,
                render_job_id=job_spec.render_job_id,
                timeline_fingerprint=handoff.timeline_fingerprint,
            )
            return handoff
        except Exception as exc:
            self.reconciliation.record_transaction(
                tx_id,
                "RECONCILIATION_REQUIRED",
                {"request_id": request_id, "error": str(exc)},
            )
            logger.error("floor05_pipeline_failed", request_id=request_id, error=str(exc))
            raise GuardianValidationError(f"Floor 05 execution failed closed: {exc}") from exc
