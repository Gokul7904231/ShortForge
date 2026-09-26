"""Media Synthesis Execution Orchestrator for Floor 04."""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from time import perf_counter
from typing import Optional
from uuid import uuid4

import structlog

from factoryos.guardian.contracts.guardian_state import ExecutionMode
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload, Floor04Input
from floors.floor04_media_synthesis.app.services.provider_registry import MediaProviderRegistry
from floors.floor04_media_synthesis.app.services.reconciliation import CrashReconciliationEngine
from floors.floor04_media_synthesis.app.services.registry import MediaAssetRecord, MediaAssetRegistry
from floors.floor04_media_synthesis.app.services.validator import PhysicalMediaValidator
from floors.floor04_media_synthesis.app.workers.background_audio_worker import run_background_audio_worker
from floors.floor04_media_synthesis.app.workers.image_worker import run_image_worker
from floors.floor04_media_synthesis.app.workers.media_package_worker import run_media_package_worker
from floors.floor04_media_synthesis.app.workers.tts_worker import run_tts_worker

logger = structlog.get_logger(__name__)


class Floor04PipelineService:
    """Provider-aware media orchestrator with deterministic fallback and crash recovery."""

    def __init__(
        self,
        storage_root: Optional[str] = None,
        provider_registry: Optional[MediaProviderRegistry] = None,
        registry: Optional[MediaAssetRegistry] = None,
        reconciliation: Optional[CrashReconciliationEngine] = None,
        max_workers: int = 4,
    ):
        self.storage_root = (
            Path(storage_root).resolve()
            if storage_root
            else Path("data/media_storage").resolve()
        )
        self.storage_root.mkdir(parents=True, exist_ok=True)
        self.provider_registry = provider_registry or MediaProviderRegistry.deterministic_fallback()
        self.registry = registry or MediaAssetRegistry(
            registry_file_path=str(self.storage_root / "media_registry.json")
        )
        self.reconciliation = reconciliation or CrashReconciliationEngine(
            storage_root=str(self.storage_root)
        )
        self.max_workers = max(1, max_workers)

    def execute_pipeline(self, input_data: Floor04Input) -> Floor04HandoffPayload:
        """Run media synthesis with bounded provider selection and crash-safe transaction tracking."""
        started = perf_counter()
        req_id = input_data.request_id or f"req-f04-{uuid4()}"
        f03_payload = input_data.floor03_payload
        plan = f03_payload.asset_plan_ir
        if plan is None:
            raise ValueError("Floor 04 requires F03 AssetPlanIR.")
        source_plan_fingerprint = plan.plan_fingerprint or plan.source_fingerprint

        execution_id = uuid4()
        transaction_id = str(execution_id)
        out_dir = self.storage_root / req_id
        out_dir.mkdir(parents=True, exist_ok=True)

        self.reconciliation.record_transaction(
            transaction_id,
            "EXECUTING",
            {
                "request_id": req_id,
                "files": [],
                "source_asset_plan_fingerprint": source_plan_fingerprint,
            },
        )

        try:
            image_provider = self.provider_registry.select(
                "image_generation",
            )
            tts_provider = self.provider_registry.select(
                "tts_generation",
            )
            background_provider = self.provider_registry.select(
                "background_audio_generation",
            )

            def generate_visual(req):
                asset = run_image_worker(
                    asset_id=req.asset_id,
                    scene_id=req.scene_id,
                    prompt_text=req.prompt_text,
                    target_width=1080,
                    target_height=1920,
                    storage_dir=str(out_dir),
                    request_id=req_id,
                    source_spec_hash=source_plan_fingerprint,
                    provider_selection=image_provider,
                )
                self.reconciliation.add_transaction_file(transaction_id, asset.file_path)
                return asset

            def generate_audio(spec):
                asset = run_tts_worker(
                    asset_id=spec.asset_id,
                    scene_id=spec.scene_id,
                    narration_text=spec.narration_text,
                    target_duration_seconds=spec.estimated_speech_duration_seconds,
                    voice_code=spec.voice_id or "en_us_male",
                    storage_dir=str(out_dir),
                    request_id=req_id,
                    source_spec_hash=source_plan_fingerprint,
                    provider_selection=tts_provider,
                )
                self.reconciliation.add_transaction_file(transaction_id, asset.file_path)
                return asset

            with ThreadPoolExecutor(max_workers=self.max_workers) as pool:
                visual_assets = list(pool.map(generate_visual, f03_payload.visual_asset_requirements))
                audio_assets = list(pool.map(generate_audio, f03_payload.audio_asset_requirements))

            total_audio_duration = sum(audio.duration_seconds for audio in audio_assets)
            bg_audio = run_background_audio_worker(
                target_duration_seconds=max(total_audio_duration, 15.0),
                mood="motivational",
                storage_dir=str(out_dir),
                request_id=req_id,
                source_spec_hash=source_plan_fingerprint,
                provider_selection=background_provider,
            )
            self.reconciliation.add_transaction_file(transaction_id, bg_audio.file_path)

            for asset in [*visual_assets, *audio_assets, bg_audio]:
                if asset.mime_type.startswith("image/"):
                    PhysicalMediaValidator.validate_image_asset(
                        asset.file_path,
                        asset.width,
                        asset.height,
                        str(out_dir),
                        expected_mime=asset.mime_type,
                    )
                    self.registry.register_asset(
                        MediaAssetRecord(
                            asset_id=asset.asset_id,
                            scene_id=asset.scene_id,
                            source_spec_hash=asset.source_spec_hash,
                            sha256_checksum=asset.sha256_checksum,
                            file_size_bytes=asset.file_size_bytes,
                            mime_type=asset.mime_type,
                            media_type="visual",
                            width=asset.width,
                            height=asset.height,
                            provider_name=asset.provider_execution.provider_id,
                            model_name=asset.provider_execution.model_id or "deterministic_fallback",
                            generation_request_id=req_id,
                            transaction_id=transaction_id,
                            storage_path=asset.file_path,
                            rights_metadata=asset.rights_metadata,
                        )
                    )
                else:
                    PhysicalMediaValidator.validate_audio_asset(
                        asset.file_path,
                        asset.duration_seconds,
                        str(out_dir),
                        expected_mime=asset.mime_type,
                    )
                    self.registry.register_asset(
                        MediaAssetRecord(
                            asset_id=asset.asset_id,
                            scene_id=asset.scene_id,
                            source_spec_hash=asset.source_spec_hash,
                            sha256_checksum=asset.sha256_checksum,
                            file_size_bytes=asset.file_size_bytes,
                            mime_type=asset.mime_type,
                            media_type="background_audio" if asset.scene_id == "global_bg" else "audio",
                            duration_seconds=asset.duration_seconds,
                            sample_rate_hz=asset.sample_rate_hz,
                            provider_name=asset.provider_execution.provider_id,
                            model_name=asset.provider_execution.model_id or "deterministic_fallback",
                            generation_request_id=req_id,
                            transaction_id=transaction_id,
                            storage_path=asset.file_path,
                            rights_metadata=asset.rights_metadata,
                        )
                    )

            handoff = run_media_package_worker(
                request_id=req_id,
                execution_id=execution_id,
                f03_payload=f03_payload,
                visual_assets=visual_assets,
                audio_assets=audio_assets,
                bg_audio_asset=bg_audio,
                execution_mode=input_data.execution_mode,
            )

            self.reconciliation.record_transaction(
                transaction_id,
                "COMMITTED",
                {
                    "request_id": req_id,
                    "files": [
                        asset.file_path
                        for asset in [*visual_assets, *audio_assets, bg_audio]
                    ],
                    "source_asset_plan_fingerprint": source_plan_fingerprint,
                    "duration_ms": round((perf_counter() - started) * 1000, 3),
                },
            )

            logger.info(
                "floor04_pipeline_executed",
                request_id=req_id,
                visual_count=len(visual_assets),
                audio_count=len(audio_assets),
                duration_ms=round((perf_counter() - started) * 1000, 3),
            )
            return handoff

        except Exception as exc:
            self.reconciliation.record_transaction(
                transaction_id,
                "ROLLED_BACK",
                {
                    "request_id": req_id,
                    "source_asset_plan_fingerprint": source_plan_fingerprint,
                    "error": str(exc),
                },
            )
            logger.error("floor04_pipeline_failed", request_id=req_id, error=str(exc))
            raise
