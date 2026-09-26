"""Canonical Floor 03 contracts."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, model_validator

from floors.floor02_scripting.app.domain.handoff import Floor02HandoffPayload, HandoffStatus
from floors.floor03_asset_realization.app.domain.asset_models import AssetManifest, AudioAssetRequirement, VisualAssetRequirement
from floors.floor03_asset_realization.app.domain.asset_plan_ir import AssetPlanIR


class ExecutionMode(str, Enum):
    DETERMINISTIC = "DETERMINISTIC"
    DETERMINISTIC_FALLBACK = "DETERMINISTIC_FALLBACK"
    HYBRID = "HYBRID"
    MODEL = "MODEL"


class EvidenceType(str, Enum):
    UPSTREAM_HANDOFF = "UPSTREAM_HANDOFF"
    DETERMINISTIC_RULE = "DETERMINISTIC_RULE"
    MODEL_INFERENCE = "MODEL_INFERENCE"
    VALIDATION_RULE = "VALIDATION_RULE"


class ProvenanceEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")
    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    evidence_type: EvidenceType
    source_type: str = Field(..., min_length=1)
    source_identifier: str = Field(..., min_length=1)
    method: str = Field(..., min_length=1)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    summary: str = Field(..., min_length=5)
    raw_data: Dict[str, Any] = Field(default_factory=dict)


class Floor03Input(BaseModel):
    model_config = ConfigDict(extra="forbid")
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    floor02_payload: Floor02HandoffPayload
    platform: Optional[str] = None
    aspect_ratio: Optional[str] = None
    target_resolution: Optional[str] = None
    style_preset: Optional[str] = None
    voice_id: Optional[str] = None
    authorized_override: bool = False
    constraints: Dict[str, Any] = Field(default_factory=dict)


class ExecutionModeDetails(BaseModel):
    model_config = ConfigDict(extra="forbid")
    global_mode: ExecutionMode = ExecutionMode.DETERMINISTIC
    worker_modes: Dict[str, ExecutionMode] = Field(default_factory=dict)
    configured_provider: Optional[str] = None
    configured_model: Optional[str] = None
    selected_provider: Optional[str] = None
    selected_model: Optional[str] = None
    executed: bool = False
    executed_model: Optional[str] = None


class Floor03HandoffPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    asset_plan_id: str = Field(default_factory=lambda: str(uuid4()))
    asset_plan_version: int = Field(default=1, ge=1)
    script_id: str
    script_version: int = Field(default=1, ge=1)
    request_id: str
    floor_id: str = "floor03_asset_realization"
    floor_version: str = "2.3.1"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    resolved_platform: str
    execution_mode: ExecutionModeDetails = Field(default_factory=ExecutionModeDetails)
    visual_asset_requirements: List[VisualAssetRequirement] = Field(..., min_length=1)
    audio_asset_requirements: List[AudioAssetRequirement] = Field(..., min_length=1)
    manifest: AssetManifest
    asset_plan_ir: AssetPlanIR
    decision_quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    handoff_status: HandoffStatus = HandoffStatus.VALIDATED
    provenance: List[ProvenanceEntry] = Field(..., min_length=1)

    @model_validator(mode="after")
    def validate_plan_boundary(self) -> "Floor03HandoffPayload":
        if self.asset_plan_ir is None:
            raise ValueError("Floor 03 handoff requires AssetPlanIR.")
        if not self.asset_plan_ir.plan_fingerprint:
            raise ValueError("Floor 03 handoff requires a semantic AssetPlanIR plan_fingerprint.")
        if self.asset_plan_ir.plan_id != self.asset_plan_id:
            raise ValueError("Floor 03 handoff asset_plan_id must match AssetPlanIR plan_id.")
        if self.asset_plan_ir.script_id != self.script_id or self.asset_plan_ir.script_version != self.script_version:
            raise ValueError("Floor 03 AssetPlanIR script lineage must match the handoff.")
        return self


class WorkerExecutionSummary(BaseModel):
    model_config = ConfigDict(extra="forbid")
    worker_name: str
    duration_ms: Optional[float] = None
    decision_quality_score: Optional[float] = None


class FloorExecutionReport(BaseModel):
    model_config = ConfigDict(extra="forbid")
    execution_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str
    script_id: str
    asset_plan_id: str
    floor_id: str = "floor03_asset_realization"
    floor_version: str = "2.3.0"
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    duration_ms: Optional[float] = None
    execution_mode: ExecutionModeDetails
    status: HandoffStatus = HandoffStatus.VALIDATED
    input_summary: Dict[str, Any]
    worker_results: List[WorkerExecutionSummary] = Field(default_factory=list)
    decisions: List[Dict[str, Any]] = Field(default_factory=list)
    decision_quality_score: Optional[float] = None
    component_gates: Dict[str, bool] = Field(default_factory=dict)
    provenance_audit: List[ProvenanceEntry] = Field(..., min_length=1)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    handoff_reference: Dict[str, str] = Field(default_factory=dict)
