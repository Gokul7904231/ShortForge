"""Authoritative domain contracts for Floor 01 Strategy & Intelligence v2."""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import json

from floors.floor01_strategy.app.core.input_safety import (
    sanitize_constraint_value,
    sanitize_input_text,
)
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


class EvidenceType(str, Enum):
    DETERMINISTIC_RULE = "DETERMINISTIC_RULE"
    MEMORY_LOOKUP = "MEMORY_LOOKUP"
    MODEL_INFERENCE = "MODEL_INFERENCE"
    EDUCATIONAL_FRAMEWORK = "EDUCATIONAL_FRAMEWORK"
    UPSTREAM_RESEARCH = "UPSTREAM_RESEARCH"
    EVALUATOR = "EVALUATOR"
    FALLBACK = "FALLBACK"


class ExecutionMode(str, Enum):
    DETERMINISTIC = "DETERMINISTIC"
    MODEL = "MODEL"
    HYBRID = "HYBRID"
    DETERMINISTIC_FALLBACK = "DETERMINISTIC_FALLBACK"


class UniquenessVerdict(str, Enum):
    MEMORY_UNSEEN = "MEMORY_UNSEEN"
    SIMILAR_TO_MEMORY = "SIMILAR_TO_MEMORY"
    DUPLICATE_IN_MEMORY = "DUPLICATE_IN_MEMORY"


class BloomLevel(str, Enum):
    REMEMBER = "Remember"
    UNDERSTAND = "Understand"
    APPLY = "Apply"
    ANALYZE = "Analyze"
    EVALUATE = "Evaluate"
    CREATE = "Create"


class HandoffStatus(str, Enum):
    VALIDATED = "VALIDATED"
    DEGRADED = "DEGRADED"
    REJECTED = "REJECTED"


class CandidateStatus(str, Enum):
    GENERATED = "GENERATED"
    SELECTED = "SELECTED"
    REJECTED = "REJECTED"


class ResearchEvidenceRef(BaseModel):
    evidence_id: str
    claim_id: Optional[str] = None
    statement: str
    verification_status: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    supporting_source_ids: List[str] = Field(default_factory=list)
    source_quality: List[str] = Field(default_factory=list)


class ResearchContext(BaseModel):
    """Typed F00 -> F01 evidence boundary.

    integrity_verified is populated only after upstream passport verification.
    """

    passport_id: str
    mission_id: str
    integrity_verified: bool = False
    question: str = ""
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    source_count: int = Field(default=0, ge=0)
    verified_claim_count: int = Field(default=0, ge=0)
    unresolved_issue_count: int = Field(default=0, ge=0)
    freshness: str = "any"
    key_findings: List[str] = Field(default_factory=list)
    recommended_hook: Optional[str] = None
    hook_archetype: Optional[str] = None
    evidence: List[ResearchEvidenceRef] = Field(default_factory=list)
    provenance: List[str] = Field(default_factory=list)


class Floor01Input(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid4()))
    topic_query: str = Field(..., min_length=2, max_length=250)
    target_audience: str = Field(default="general_learners", min_length=1, max_length=120)
    platform: str = Field(default="youtube_shorts", min_length=1, max_length=64)
    content_format: str = Field(default="educational_short", min_length=1, max_length=120)
    niche_context: Optional[str] = Field(default=None, max_length=200)
    learning_level: str = Field(default="beginner", min_length=1, max_length=32)
    constraints: Dict[str, Any] = Field(default_factory=dict)
    research_context: Optional[ResearchContext] = None

    @field_validator(
        "topic_query",
        "target_audience",
        "platform",
        "content_format",
        "niche_context",
        "learning_level",
        mode="before",
    )
    @classmethod
    def sanitize_text_fields(cls, value: Any) -> Any:
        if value is None:
            return value
        return sanitize_input_text(str(value), max_length=2000)

    @field_validator("constraints", mode="before")
    @classmethod
    def sanitize_constraints(cls, value: Any) -> Dict[str, Any]:
        if value is None:
            return {}
        sanitized = sanitize_constraint_value(value)
        serialized = json.dumps(sanitized, ensure_ascii=False, sort_keys=True)
        if len(serialized) > 16000:
            raise ValueError("constraints payload is too large")
        if not isinstance(sanitized, dict):
            raise ValueError("constraints must be an object")
        return sanitized


class ProvenanceEntry(BaseModel):
    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    evidence_type: EvidenceType
    source_type: str
    source_identifier: str
    method: str = "heuristic_evaluation"
    confidence_score: float = Field(ge=0.0, le=1.0)
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    summary: str
    raw_data: Dict[str, Any] = Field(default_factory=dict)


class TopicIntelligenceResult(BaseModel):
    selected_topic: str = Field(..., min_length=2)
    normalized_topic: str = Field(..., min_length=2)
    category: str = "general_education"
    niche: str = "general"
    selection_reason: str = Field(..., min_length=5)
    similarity_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    uniqueness_verdict: UniquenessVerdict = UniquenessVerdict.MEMORY_UNSEEN
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class StrategyResult(BaseModel):
    target_audience: str
    platform: str
    content_angle: str = Field(..., min_length=3)
    tone: str = "engaging_educational"
    format: str = "educational_short"
    target_duration_seconds: int = Field(default=60, ge=10, le=600)
    platform_spec: Dict[str, Any] = Field(default_factory=dict)
    execution_mode: ExecutionMode = ExecutionMode.DETERMINISTIC_FALLBACK
    rationale: str = ""
    evidence_refs: List[str] = Field(default_factory=list)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class ContentPlanResult(BaseModel):
    core_objective: str = Field(..., min_length=5)
    key_takeaways: List[str] = Field(..., min_length=1)
    hook_direction: str = Field(..., min_length=5)
    cta_direction: str = Field(..., min_length=3)
    structural_outline: List[str] = Field(..., min_length=2)
    pacing_guidance: Dict[str, int] = Field(default_factory=dict)
    downstream_requirements: Dict[str, Any] = Field(default_factory=dict)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class CurriculumMapResult(BaseModel):
    difficulty_level: str = "beginner"
    prerequisites: List[str] = Field(default_factory=list)
    learning_objectives: List[str] = Field(..., min_length=1)
    bloom_taxonomy_level: BloomLevel = BloomLevel.UNDERSTAND
    concept_dependencies: List[str] = Field(default_factory=list)
    knowledge_gap_hypothesis: List[str] = Field(default_factory=list)
    assessment_opportunities: List[str] = Field(default_factory=list)
    suggested_sequence_order: int = Field(default=1, ge=1)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class QualityDimensions(BaseModel):
    evidence_adequacy: float = Field(ge=0.0, le=1.0)
    novelty: float = Field(ge=0.0, le=1.0)
    audience_fit: float = Field(ge=0.0, le=1.0)
    platform_fit: float = Field(ge=0.0, le=1.0)
    curriculum_coherence: float = Field(ge=0.0, le=1.0)
    downstream_feasibility: float = Field(ge=0.0, le=1.0)
    constraint_compliance: float = Field(ge=0.0, le=1.0)

    @property
    def overall(self) -> float:
        weights = {
            "evidence_adequacy": 0.22,
            "novelty": 0.16,
            "audience_fit": 0.14,
            "platform_fit": 0.14,
            "curriculum_coherence": 0.10,
            "downstream_feasibility": 0.12,
            "constraint_compliance": 0.12,
        }
        return round(sum(getattr(self, key) * weight for key, weight in weights.items()), 4)


class StrategyCandidate(BaseModel):
    candidate_id: str = Field(default_factory=lambda: f"cand_{uuid4().hex[:10]}")
    status: CandidateStatus = CandidateStatus.GENERATED
    strategy: StrategyResult
    rationale: str = ""
    evidence_refs: List[str] = Field(default_factory=list)
    model_generated: bool = False


class StrategyEvaluation(BaseModel):
    candidate_id: str
    dimensions: QualityDimensions
    overall_score: float = Field(ge=0.0, le=1.0)
    accepted: bool = False
    blockers: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    evaluator_provenance: List[ProvenanceEntry] = Field(default_factory=list)

    @field_validator("overall_score")
    @classmethod
    def round_score(cls, value: float) -> float:
        return round(value, 4)


class StrategyDecisionRecord(BaseModel):
    selected_candidate_id: str
    candidate_ids_considered: List[str]
    selection_basis: str
    evaluation_score: float
    complexity_mode: str
    bounded_deliberation_used: bool = False


class Floor01HandoffPayload(BaseModel):
    plan_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str
    input_fingerprint: str = Field(
        default="",
        description="SHA-256 fingerprint of the normalized request excluding request_id.",
    )
    floor_id: str = "floor01_strategy"
    floor_version: str = "2.0.0"
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    execution_mode: ExecutionMode = ExecutionMode.DETERMINISTIC_FALLBACK
    research_context: Optional[ResearchContext] = None
    topic: TopicIntelligenceResult
    strategy: StrategyResult
    content_plan: ContentPlanResult
    curriculum: CurriculumMapResult
    selected_candidate_id: Optional[str] = None
    evaluation: Optional[StrategyEvaluation] = None
    decision_record: Optional[StrategyDecisionRecord] = None
    strategic_memory_refs: List[str] = Field(default_factory=list)
    decision_quality_score: float = Field(ge=0.0, le=1.0)
    handoff_status: HandoffStatus = HandoffStatus.VALIDATED

    @field_validator("decision_quality_score")
    @classmethod
    def validate_quality_score(cls, value: float) -> float:
        return round(value, 4)


class WorkerExecutionSummary(BaseModel):
    worker_name: str
    execution_mode: ExecutionMode
    duration_ms: float
    confidence_score: float
    evidence_count: int
    status: str = "COMPLETED"


class ExecutionModeDetails(BaseModel):
    global_mode: ExecutionMode
    worker_modes: Dict[str, ExecutionMode]
    configured_provider: Optional[str] = None
    configured_model: Optional[str] = None
    executed: bool = False
    executed_model: Optional[str] = None


class FloorExecutionReport(BaseModel):
    execution_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str
    plan_id: str
    floor_id: str = "floor01_strategy"
    floor_version: str = "2.0.0"
    started_at: str
    completed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    duration_ms: float = Field(..., ge=0.0)
    execution_mode: ExecutionModeDetails
    status: HandoffStatus = HandoffStatus.VALIDATED
    input_summary: Dict[str, Any]
    worker_results: List[WorkerExecutionSummary] = Field(default_factory=list)
    decisions: List[Dict[str, Any]] = Field(default_factory=list)
    decision_quality_score: float = Field(ge=0.0, le=1.0)
    component_gates: Dict[str, bool] = Field(default_factory=dict)
    provenance_audit: List[ProvenanceEntry] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    handoff_reference: Optional[Dict[str, Any]] = None
