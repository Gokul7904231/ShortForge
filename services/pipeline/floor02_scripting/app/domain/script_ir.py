"""Canonical narrative intermediate representation for Floor 02.

F02 is a Narrative Compiler: it converts the trusted Floor 01 strategy into a
structured, auditable ScriptIR that downstream visual/audio floors can consume.
This module contains only typed domain contracts; authority remains with the
deterministic compiler and validators.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class BeatType(str, Enum):
    HOOK = "HOOK"
    PROBLEM = "PROBLEM"
    CONTEXT = "CONTEXT"
    EXPLANATION = "EXPLANATION"
    EXAMPLE = "EXAMPLE"
    ESCALATION = "ESCALATION"
    PAYOFF = "PAYOFF"
    CTA = "CTA"


class ClaimRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    claim_id: str
    text: str = Field(min_length=2)
    evidence_refs: List[str] = Field(default_factory=list)


class ViewerState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    known_facts: List[str] = Field(default_factory=list)
    current_question: Optional[str] = None
    expectation: Optional[str] = None
    emotional_state: Optional[str] = None
    unresolved_promises: List[str] = Field(default_factory=list)


class NarrativeState(BaseModel):
    model_config = ConfigDict(extra="forbid")

    character_states: Dict[str, Dict[str, Any]] = Field(default_factory=dict)
    world_facts: List[str] = Field(default_factory=list)
    timeline_markers: List[str] = Field(default_factory=list)
    viewer_state: ViewerState = Field(default_factory=ViewerState)
    open_loops: List[str] = Field(default_factory=list)


class CausalEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_id: str
    description: str = Field(min_length=2)
    actor: Optional[str] = None
    cause_event_ids: List[str] = Field(default_factory=list)
    effect_event_ids: List[str] = Field(default_factory=list)
    state_before: Dict[str, Any] = Field(default_factory=dict)
    state_after: Dict[str, Any] = Field(default_factory=dict)
    evidence_refs: List[str] = Field(default_factory=list)


class NarrativeBeat(BaseModel):
    model_config = ConfigDict(extra="forbid")

    beat_id: str
    beat_type: BeatType
    objective: str = Field(min_length=2)
    scene_ids: List[str] = Field(default_factory=list)
    causal_event_ids: List[str] = Field(default_factory=list)
    viewer_effect: str = Field(default="")
    payoff_for_question: Optional[str] = None


class CritiqueSeverity(str, Enum):
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"


class CritiqueFinding(BaseModel):
    model_config = ConfigDict(extra="forbid")

    finding_id: str
    critic_id: str
    severity: CritiqueSeverity
    category: str
    message: str = Field(min_length=2)
    scene_ids: List[str] = Field(default_factory=list)
    remediation: Optional[str] = None


class CritiqueReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    critic_id: str
    passed: bool
    score: float = Field(ge=0.0, le=1.0)
    findings: List[CritiqueFinding] = Field(default_factory=list)


class QualityDimensionScore(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hook_strength: float = Field(ge=0.0, le=1.0)
    narrative_coherence: float = Field(ge=0.0, le=1.0)
    causal_soundness: float = Field(ge=0.0, le=1.0)
    evidence_fidelity: float = Field(ge=0.0, le=1.0)
    continuity: float = Field(ge=0.0, le=1.0)
    pacing: float = Field(ge=0.0, le=1.0)
    visualizability: float = Field(ge=0.0, le=1.0)
    production_feasibility: float = Field(ge=0.0, le=1.0)


class ScriptQualityReport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    overall_score: float = Field(ge=0.0, le=1.0)
    dimensions: QualityDimensionScore
    critiques: List[CritiqueReport] = Field(default_factory=list)
    hard_gates: Dict[str, bool] = Field(default_factory=dict)
    accepted: bool = False
    revision_count: int = Field(default=0, ge=0)


class VisualNarrativeIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    semantic_goal: str = Field(min_length=2)
    subject: str = Field(min_length=1)
    action: str = Field(min_length=1)
    environment: str = Field(min_length=1)
    emotional_state: str = Field(default="neutral")
    shot_type: str = Field(default="medium")
    camera_intent: str = Field(default="static")
    lighting_intent: str = Field(default="clear")
    transition_intent: str = Field(default="cut")
    character_anchor_refs: List[str] = Field(default_factory=list)
    scene_anchor_refs: List[str] = Field(default_factory=list)
    forbidden_changes: List[str] = Field(default_factory=list)


class VoiceNarrativeIntent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    delivery_style: str = Field(default="engaging_educational")
    emphasis_terms: List[str] = Field(default_factory=list)
    pause_after_phrases: List[str] = Field(default_factory=list)
    pronunciation_notes: Dict[str, str] = Field(default_factory=dict)
    target_words_per_second: float = Field(default=2.5, gt=0.0)


class NarrativeCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    candidate_id: str
    title: str
    logline: str
    strategy_variant: str
    beats: List[NarrativeBeat] = Field(default_factory=list)
    causal_events: List[CausalEvent] = Field(default_factory=list)
    narrative_state: NarrativeState = Field(default_factory=NarrativeState)
    claims: List[ClaimRef] = Field(default_factory=list)
    scenes: List[Any] = Field(default_factory=list)
    evidence_lineage: List[str] = Field(default_factory=list)


class ScriptIR(BaseModel):
    """Canonical authoritative narrative IR compiled by F02."""

    model_config = ConfigDict(extra="forbid")

    schema_version: str = "2.0"
    script_id: str
    script_version: int = Field(default=1, ge=1)
    plan_id: str
    request_id: str

    objective: str = Field(min_length=2)
    audience: str = Field(min_length=2)
    platform: str = Field(min_length=2)
    tone: str = Field(default="engaging_educational")

    claims: List[ClaimRef] = Field(default_factory=list)
    beats: List[NarrativeBeat] = Field(default_factory=list)
    causal_events: List[CausalEvent] = Field(default_factory=list)
    narrative_state: NarrativeState = Field(default_factory=NarrativeState)
    scenes: List[Any] = Field(default_factory=list)

    retention: Dict[str, Any] = Field(default_factory=dict)
    quality: Optional[ScriptQualityReport] = None
    provenance_refs: List[str] = Field(default_factory=list)
    compile_warnings: List[str] = Field(default_factory=list)
