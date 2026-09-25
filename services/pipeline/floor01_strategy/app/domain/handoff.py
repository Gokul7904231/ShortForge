"""Domain models and data contracts for Floor 01 (Strategy & Intelligence).

Defines Floor01Input, ProvenanceEntry, execution modes, component output sub-schemas,
downstream handoff contract (Floor01HandoffPayload), and Overseer execution report (FloorExecutionReport).
"""

from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


# ── Enums ────────────────────────────────────────────────────────────────────

class EvidenceType(str, Enum):
    DETERMINISTIC_RULE = "DETERMINISTIC_RULE"
    MEMORY_LOOKUP = "MEMORY_LOOKUP"
    MODEL_INFERENCE = "MODEL_INFERENCE"
    EDUCATIONAL_FRAMEWORK = "EDUCATIONAL_FRAMEWORK"


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


# ── Input Contract ───────────────────────────────────────────────────────────

class Floor01Input(BaseModel):
    """Input parameters provided to Floor 01."""

    request_id: str = Field(default_factory=lambda: str(uuid4()))
    topic_query: str = Field(..., min_length=2, max_length=250, description="Topic or query to plan content around")
    target_audience: str = Field(default="general_learners", description="Target audience demographic or level")
    platform: str = Field(default="youtube_shorts", description="Primary publishing platform target")
    content_format: str = Field(default="educational_short", description="Content format type")
    niche_context: Optional[str] = Field(default=None, description="Optional domain or niche context")
    learning_level: str = Field(default="beginner", description="Target difficulty/learning level")
    constraints: Dict[str, Any] = Field(default_factory=dict, description="Additional processing constraints")
    research_context: Optional[ResearchContext] = Field(default=None, description="Typed projection of the upstream F00 ResearchPassport")



class ResearchEvidenceRef(BaseModel):
    """Compact evidence projection consumed by F01; raw retrieval remains owned by F00."""

    evidence_id: str
    claim_id: Optional[str] = None
    statement: str
    verification_status: str
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    supporting_source_ids: List[str] = Field(default_factory=list)
    source_quality: List[str] = Field(default_factory=list)


class ResearchContext(BaseModel):
    """Typed F00 -> F01 evidence boundary."""

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


# ── Provenance & Evidence Contract ───────────────────────────────────────────

class ProvenanceEntry(BaseModel):
    """Hardened evidence and provenance record for strategy and topic decisions."""

    evidence_id: str = Field(default_factory=lambda: str(uuid4()))
    evidence_type: EvidenceType = Field(..., description="Evidence classification: DETERMINISTIC_RULE, MEMORY_LOOKUP, MODEL_INFERENCE, EDUCATIONAL_FRAMEWORK")
    source_type: str = Field(..., description="Type of source: jaccard_similarity, llm_reasoning, rule_engine")
    source_identifier: str = Field(..., description="Identifier of model, algorithm, or framework used")
    method: str = Field(default="heuristic_evaluation", description="Method or function used")
    confidence_score: float = Field(..., ge=0.0, le=1.0, description="Heuristic score of this evidence item (0.0 to 1.0)")
    timestamp: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    summary: str = Field(..., description="Summary explanation of the evidence or rationale")
    raw_data: Dict[str, Any] = Field(default_factory=dict, description="Structured supporting evidence metadata")


# ── Logical Worker Output Sub-Schemas ────────────────────────────────────────

class TopicIntelligenceResult(BaseModel):
    """Output from the Topic Intelligence logical worker."""

    selected_topic: str = Field(..., min_length=2)
    normalized_topic: str = Field(..., min_length=2)
    category: str = Field(default="general_education")
    niche: str = Field(default="general")
    selection_reason: str = Field(..., min_length=5)
    similarity_risk_score: float = Field(default=0.0, ge=0.0, le=1.0)
    uniqueness_verdict: UniquenessVerdict = Field(default=UniquenessVerdict.MEMORY_UNSEEN)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class StrategyResult(BaseModel):
    """Output from the Strategy Planner logical worker."""

    target_audience: str = Field(...)
    platform: str = Field(...)
    content_angle: str = Field(..., min_length=3, description="Strategic angle (e.g., practical_mental_model, counter_intuitive_fact)")
    tone: str = Field(default="engaging_educational")
    format: str = Field(default="educational_short")
    target_duration_seconds: int = Field(default=60, ge=10, le=600)
    platform_spec: Dict[str, Any] = Field(default_factory=dict, description="Platform-specific constraints, versioning, and CTA rules")
    execution_mode: ExecutionMode = Field(default=ExecutionMode.DETERMINISTIC_FALLBACK)
    rationale: str = ""
    evidence_refs: List[str] = Field(default_factory=list)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class ContentPlanResult(BaseModel):
    """Output from the Content Planning logical worker."""

    core_objective: str = Field(..., min_length=5)
    key_takeaways: List[str] = Field(..., min_length=1)
    hook_direction: str = Field(..., min_length=5)
    cta_direction: str = Field(..., min_length=3)
    structural_outline: List[str] = Field(..., min_length=2)
    pacing_guidance: Dict[str, int] = Field(default_factory=dict, description="Recommended duration per section in seconds")
    downstream_requirements: Dict[str, Any] = Field(default_factory=dict, description="Constraints/hints for Floor 02 scriptwriter")
    provenance: List[ProvenanceEntry] = Field(default_factory=list)


class CurriculumMapResult(BaseModel):
    """Output from the Curriculum Mapping logical worker."""

    difficulty_level: str = Field(default="beginner")
    prerequisites: List[str] = Field(default_factory=list)
    learning_objectives: List[str] = Field(..., min_length=1)
    bloom_taxonomy_level: BloomLevel = Field(default=BloomLevel.UNDERSTAND)
    concept_dependencies: List[str] = Field(default_factory=list, description="Ordered concept progression graph")
    knowledge_gap_hypothesis: List[str] = Field(default_factory=list, description="Hypothesized learner knowledge gaps (pending empirical evidence)")
    assessment_opportunities: List[str] = Field(default_factory=list)
    suggested_sequence_order: int = Field(default=1, ge=1)
    provenance: List[ProvenanceEntry] = Field(default_factory=list)



class QualityDimensions(BaseModel):
    """Independent heuristic dimensions; never interpreted as probability."""

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


# ── Contract 1: Authoritative Downstream Handoff Payload (Floor 01 -> Floor 02) ──

class Floor01HandoffPayload(BaseModel):
    """Authoritative machine-readable contract produced by Floor 01 for Floor 02 consumption."""

    plan_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str = Field(...)
    floor_id: str = Field(default="floor01_strategy")
    floor_version: str = Field(default="2.0.0")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    execution_mode: ExecutionMode = Field(default=ExecutionMode.DETERMINISTIC_FALLBACK, description="Execution mode: DETERMINISTIC, MODEL, HYBRID, or DETERMINISTIC_FALLBACK")
    topic: TopicIntelligenceResult
    strategy: StrategyResult
    content_plan: ContentPlanResult
    curriculum: CurriculumMapResult
    selected_candidate_id: Optional[str] = None
    evaluation: Optional[StrategyEvaluation] = None
    decision_record: Optional[StrategyDecisionRecord] = None
    strategic_memory_refs: List[str] = Field(default_factory=list)
    decision_quality_score: float = Field(..., ge=0.0, le=1.0, description="Composite heuristic score; not a calibrated probability")
    handoff_status: HandoffStatus = Field(default=HandoffStatus.VALIDATED)

    @field_validator("decision_quality_score")
    @classmethod
    def validate_quality_score(cls, v: float) -> float:
        if v < 0.0 or v > 1.0:
            raise ValueError("decision_quality_score must be between 0.0 and 1.0")
        return round(v, 4)


# ── Contract 2: Overseer Execution Report (Floor 01 -> Overseer) ────────────

class WorkerExecutionSummary(BaseModel):
    """Summary metrics for a single worker execution."""

    worker_name: str
    execution_mode: ExecutionMode
    duration_ms: float
    confidence_score: float
    evidence_count: int
    status: str = "COMPLETED"


class ExecutionModeDetails(BaseModel):
    """Detailed breakdown distinguishing configured vs actually executed LLM model execution."""

    global_mode: ExecutionMode
    worker_modes: Dict[str, ExecutionMode]
    configured_provider: Optional[str] = "gemini"
    configured_model: Optional[str] = "gemini-1.5-flash"
    executed: bool = False
    executed_model: Optional[str] = None


class FloorExecutionReport(BaseModel):
    """Canonical execution report contract generated for Overseer consumption."""

    execution_id: str = Field(default_factory=lambda: str(uuid4()))
    request_id: str = Field(...)
    plan_id: str = Field(...)
    floor_id: str = Field(default="floor01")
    floor_version: str = Field(default="1.0.0")
    started_at: str = Field(...)
    completed_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    duration_ms: float = Field(..., ge=0.0)
    execution_mode: ExecutionModeDetails
    status: HandoffStatus = Field(default=HandoffStatus.VALIDATED)
    input_summary: Dict[str, Any]
    worker_results: List[WorkerExecutionSummary] = Field(default_factory=list)
    decisions: List[Dict[str, Any]] = Field(default_factory=list)
    decision_quality_score: float = Field(..., ge=0.0, le=1.0)
    component_gates: Dict[str, bool] = Field(default_factory=dict)
    provenance_audit: List[ProvenanceEntry] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    errors: List[str] = Field(default_factory=list)
    handoff_reference: Optional[Dict[str, Any]] = None
