"""Domain contracts for Floor 02 (Scripting & Narrative).

Defines Floor02Input, ProvenanceEntry, Floor02HandoffPayload (downstream Floor 03 contract),
ExecutionModeDetails, WorkerExecutionSummary, and FloorExecutionReport (Overseer contract).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field

from floors.floor01_strategy.app.domain.handoff import Floor01HandoffPayload
from floors.floor02_scripting.app.domain.script_models import (
    CharacterProfile,
    NarrativeFormat,
    SceneSpecification,
)
from floors.floor02_scripting.app.domain.script_ir import ScriptIR, ScriptQualityReport


class EvidenceType(str, Enum):
    DETERMINISTIC_RULE = "DETERMINISTIC_RULE"
    MEMORY_LOOKUP = "MEMORY_LOOKUP"
    MODEL_INFERENCE = "MODEL_INFERENCE"
    UPSTREAM_HANDOFF = "UPSTREAM_HANDOFF"


class ExecutionMode(str, Enum):
    DETERMINISTIC = "DETERMINISTIC"
    MODEL = "MODEL"
    HYBRID = "HYBRID"
    DETERMINISTIC_FALLBACK = "DETERMINISTIC_FALLBACK"


class HandoffStatus(str, Enum):
    VALIDATED = "VALIDATED"
    DEGRADED = "DEGRADED"
    REJECTED = "REJECTED"


# ── Provenance Record ────────────────────────────────────────────────────────

class ProvenanceEntry(BaseModel):
    """Hardened evidence and provenance record for narrative decisions."""

    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    evidence_type: EvidenceType = Field(..., description="Evidence classification: DETERMINISTIC_RULE, MEMORY_LOOKUP, MODEL_INFERENCE, UPSTREAM_HANDOFF")
    source_type: str = Field(..., description="Type of source: floor01_handoff, pacing_rule_engine, llm_adapter")
    source_identifier: str = Field(..., description="Identifier of model, algorithm, or template used")
    method: str = Field(default="heuristic_evaluation", description="Method or function used")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    summary: str = Field(..., description="Summary explanation of evidence or rationale")
    raw_data: Dict[str, Any] = Field(default_factory=dict, description="Structured supporting evidence metadata")


# ── Input Contract ───────────────────────────────────────────────────────────

class Floor02Input(BaseModel):
    """Input contract for Floor 02 execution."""

    request_id: str = Field(default_factory=lambda: str(uuid4()))
    floor01_payload: Optional[Floor01HandoffPayload] = Field(default=None, description="Upstream handoff from Floor 01")
    topic_query: str = Field(default="General Education", min_length=2, max_length=250)
    target_duration_seconds: int = Field(default=60, ge=10, le=600)
    narrative_format: NarrativeFormat = Field(default=NarrativeFormat.EDUCATIONAL_EXPLAINER)
    words_per_second: float = Field(default=2.5, ge=1.0, le=5.0, description="Target narration speech rate")
    constraints: Dict[str, Any] = Field(default_factory=dict)
    strict_upstream: bool = Field(default=True, description="Production executions require a validated Floor 01 handoff")


# ── Contract A: Downstream Handoff Payload (Floor 02 -> Floor 03) ────────────

class Floor02HandoffPayload(BaseModel):
    """Authoritative downstream handoff payload produced by Floor 02 for Floor 03 consumption."""

    script_id: str = Field(default_factory=lambda: str(uuid4()))
    script_version: int = Field(default=1, ge=1, description="Script version number, incremented on regeneration")
    plan_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str = Field(...)
    floor_id: str = Field(default="floor02_scripting")
    floor_version: str = Field(default="1.0.0")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    execution_mode: ExecutionMode = Field(default=ExecutionMode.DETERMINISTIC_FALLBACK)
    format: NarrativeFormat = Field(default=NarrativeFormat.EDUCATIONAL_EXPLAINER)
    title: str = Field(...)
    logline: str = Field(...)
    target_duration_seconds: int = Field(default=60, ge=10, le=600)
    estimated_total_duration_seconds: float = Field(..., ge=0.0)
    estimated_speech_duration_seconds: float = Field(..., ge=0.0)
    estimated_pause_transition_duration_seconds: float = Field(default=0.0, ge=0.0)
    scenes: List[SceneSpecification] = Field(..., min_length=1)
    character_profiles: List[CharacterProfile] = Field(default_factory=list)
    educational_beats: Dict[str, str] = Field(default_factory=dict, description="Map of scene_id to learning objective")
    decision_quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0, description="Defined weighted heuristic quality score; null if uncalculated")
    handoff_status: HandoffStatus = Field(default=HandoffStatus.VALIDATED)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)
    script_ir: Optional[ScriptIR] = Field(default=None, description="Canonical F02 ScriptIR; mandatory for production handoff")
    quality_report: Optional[ScriptQualityReport] = Field(default=None)
    successor_handoffs: Dict[str, Dict[str, Any]] = Field(default_factory=dict, description="Typed F03/F04 branch handoff metadata")


# ── Contract B: Overseer Execution Report (Floor 02 -> Overseer) ────────────

class ExecutionModeDetails(BaseModel):
    """Detailed record of configured vs selected vs executed models for execution transparency."""

    global_mode: ExecutionMode = Field(default=ExecutionMode.DETERMINISTIC_FALLBACK)
    worker_modes: Dict[str, ExecutionMode] = Field(default_factory=dict)
    configured_provider: str = Field(default="gemini")
    configured_model: str = Field(default="gemini-1.5-flash")
    selected_provider: str = Field(default="gemini")
    selected_model: str = Field(default="gemini-1.5-flash")
    executed: bool = Field(default=False)
    executed_model: Optional[str] = Field(default=None)


class WorkerExecutionSummary(BaseModel):
    """Summary record of a logical worker's execution within Floor 02."""

    worker_name: str = Field(...)
    execution_mode: ExecutionMode = Field(default=ExecutionMode.DETERMINISTIC)
    duration_ms: Optional[float] = Field(default=None, ge=0.0)
    decision_quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    status: str = Field(default="SUCCESS")
    summary: str = Field(default="")


class FloorExecutionReport(BaseModel):
    """Authoritative execution report generated by Floor 02 for Overseer control plane consumption."""

    execution_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str = Field(...)
    plan_id: Optional[str] = Field(default=None)
    script_id: Optional[str] = Field(default=None)
    floor_id: str = Field(default="floor02_scripting")
    floor_version: str = Field(default="1.0.0")
    started_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    completed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    duration_ms: Optional[float] = Field(default=None, ge=0.0)
    execution_mode: ExecutionModeDetails = Field(default_factory=ExecutionModeDetails)
    status: HandoffStatus = Field(default=HandoffStatus.VALIDATED)
    input_summary: Dict[str, Any] = Field(default_factory=dict)
    worker_results: List[WorkerExecutionSummary] = Field(default_factory=list)
    decisions: List[Dict[str, Any]] = Field(default_factory=list)
    decision_quality_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    component_gates: Dict[str, bool] = Field(default_factory=dict)
    provenance_audit: List[ProvenanceEntry] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    handoff_reference: Dict[str, Any] = Field(default_factory=dict)
    script_ir_schema_version: str = Field(default="2.0")
    quality_gates: Dict[str, bool] = Field(default_factory=dict)
