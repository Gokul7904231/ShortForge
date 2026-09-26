"""Domain models and handoff contracts for Floor 04 Media Synthesis & Provider Execution."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from factoryos.guardian.contracts.guardian_state import ExecutionMode
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload, HandoffStatus


class AssetSourceType(str, Enum):
    DETERMINISTIC_SYNTHESIS = "DETERMINISTIC_SYNTHESIS"
    STOCK_LIBRARY = "STOCK_LIBRARY"
    AI_PROVIDER = "AI_PROVIDER"
    ROYALTY_FREE = "ROYALTY_FREE"


class RightsMetadata(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_type: AssetSourceType = Field(...)
    provider_name: str = Field(...)
    license_type: str = Field(default="ROYALTY_FREE")
    attribution_required: bool = Field(default=False)
    usage_restrictions: Optional[str] = Field(default=None)
    acquired_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProviderExecutionRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider_id: str = Field(..., min_length=1)
    model_id: Optional[str] = None
    capability: str = Field(..., min_length=1)
    request_fingerprint: str = Field(..., min_length=64, max_length=64)
    attempt: int = Field(default=1, ge=1)
    cache_hit: bool = False
    latency_ms: Optional[float] = Field(default=None, ge=0.0)
    external_request_id: Optional[str] = None
    execution_mode: ExecutionMode = ExecutionMode.DETERMINISTIC_FALLBACK


class SynthesizedVisualAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(...)
    scene_id: str = Field(...)
    file_path: str = Field(...)
    mime_type: str = Field(...)
    width: int = Field(..., gt=0)
    height: int = Field(..., gt=0)
    sha256_checksum: str = Field(..., min_length=64, max_length=64)
    file_size_bytes: int = Field(..., gt=0)
    provenance_hash: str = Field(..., min_length=64, max_length=64)
    source_spec_hash: str = Field(..., min_length=1)
    provider_execution: ProviderExecutionRecord
    rights_metadata: RightsMetadata = Field(...)


class SynthesizedAudioAsset(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(...)
    scene_id: str = Field(...)
    file_path: str = Field(...)
    mime_type: str = Field(...)
    duration_seconds: float = Field(..., gt=0.0)
    sample_rate_hz: int = Field(..., gt=0)
    sha256_checksum: str = Field(..., min_length=64, max_length=64)
    file_size_bytes: int = Field(..., gt=0)
    provenance_hash: str = Field(..., min_length=64, max_length=64)
    source_spec_hash: str = Field(..., min_length=1)
    provider_execution: ProviderExecutionRecord
    rights_metadata: RightsMetadata = Field(...)


class MediaPackageManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total_visual_assets: int = Field(..., ge=0)
    total_audio_assets: int = Field(..., ge=0)
    has_background_audio: bool = Field(default=False)
    total_size_bytes: int = Field(..., ge=0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Floor04Input(BaseModel):
    model_config = ConfigDict(extra="forbid")

    floor03_payload: Floor03HandoffPayload = Field(...)
    request_id: Optional[str] = Field(default=None)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.HYBRID)

    @model_validator(mode="after")
    def validate_upstream_contract(self) -> "Floor04Input":
        f03 = self.floor03_payload
        if f03.handoff_status != HandoffStatus.VALIDATED:
            raise ValueError("F03 handoff must be VALIDATED before Floor 04 execution.")
        if f03.floor_id != "floor03_asset_realization":
            raise ValueError("Floor 04 requires the canonical Floor 03 handoff.")
        if f03.asset_plan_ir is None:
            raise ValueError("Floor 04 requires the typed AssetPlanIR from Floor 03.")
        return self


class Floor04HandoffPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    request_id: str = Field(...)
    execution_id: UUID = Field(default_factory=uuid4)
    floor03_payload: Floor03HandoffPayload = Field(...)

    synthesized_visual_assets: List[SynthesizedVisualAsset] = Field(default_factory=list)
    synthesized_audio_assets: List[SynthesizedAudioAsset] = Field(default_factory=list)
    background_audio_asset: Optional[SynthesizedAudioAsset] = Field(default=None)

    media_manifest: MediaPackageManifest = Field(...)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.HYBRID)
    source_asset_plan_fingerprint: str = Field(..., min_length=64, max_length=64)
    provider_executions: List[ProviderExecutionRecord] = Field(default_factory=list)
    provenance_hash: str = Field(..., min_length=64, max_length=64)
    version: str = Field(default="2.0.0")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    @model_validator(mode="after")
    def validate_lineage_and_manifest(self) -> "Floor04HandoffPayload":
        f03 = self.floor03_payload
        if f03.asset_plan_ir is None:
            raise ValueError("F04 handoff requires F03 AssetPlanIR.")
        expected_plan_fingerprint = f03.asset_plan_ir.plan_fingerprint or f03.asset_plan_ir.source_fingerprint
        if self.source_asset_plan_fingerprint != expected_plan_fingerprint:
            raise ValueError("F03/F04 lineage mismatch: source_asset_plan_fingerprint does not match AssetPlanIR.")

        visual_requirements = {r.asset_id: r for r in f03.visual_asset_requirements}
        audio_requirements = {r.asset_id: r for r in f03.audio_asset_requirements}
        visual_ids = [asset.asset_id for asset in self.synthesized_visual_assets]
        audio_ids = [asset.asset_id for asset in self.synthesized_audio_assets]

        if len(visual_ids) != len(set(visual_ids)):
            raise ValueError("Duplicate visual asset_id in Floor 04 handoff.")
        if len(audio_ids) != len(set(audio_ids)):
            raise ValueError("Duplicate audio asset_id in Floor 04 handoff.")
        if not set(visual_ids).issubset(visual_requirements):
            raise ValueError("Floor 04 produced a visual asset not declared by Floor 03.")
        if not set(audio_ids).issubset(audio_requirements):
            raise ValueError("Floor 04 produced an audio asset not declared by Floor 03.")

        for asset in [*self.synthesized_visual_assets, *self.synthesized_audio_assets]:
            if asset.source_spec_hash != self.source_asset_plan_fingerprint:
                raise ValueError(f"Asset {asset.asset_id} is linked to a different F03 plan fingerprint.")
        if self.background_audio_asset is not None and self.background_audio_asset.source_spec_hash != self.source_asset_plan_fingerprint:
            raise ValueError("Background audio is linked to a different F03 plan fingerprint.")

        if self.media_manifest.total_visual_assets != len(self.synthesized_visual_assets):
            raise ValueError("F04 media_manifest visual count mismatch.")
        if self.media_manifest.total_audio_assets != len(self.synthesized_audio_assets):
            raise ValueError("F04 media_manifest audio count mismatch.")

        expected_size = (
            sum(asset.file_size_bytes for asset in self.synthesized_visual_assets)
            + sum(asset.file_size_bytes for asset in self.synthesized_audio_assets)
            + (self.background_audio_asset.file_size_bytes if self.background_audio_asset else 0)
        )
        if self.media_manifest.total_size_bytes != expected_size:
            raise ValueError("F04 media_manifest total_size_bytes mismatch.")

        return self


class Floor04ExecutionReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    execution_id: UUID
    request_id: str
    source_asset_plan_fingerprint: str
    status: str
    provider_executions: List[ProviderExecutionRecord] = Field(default_factory=list)
    artifact_count: int = Field(default=0, ge=0)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
