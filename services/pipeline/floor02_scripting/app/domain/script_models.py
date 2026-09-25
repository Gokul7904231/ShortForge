"""Domain sub-models for Floor 02 (Scripting & Narrative).

Defines SceneSpecification, CharacterProfile, NarrativeFormat, and scene-level versioning attributes.
"""

from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class NarrativeFormat(str, Enum):
    EDUCATIONAL_EXPLAINER = "educational_explainer"
    QUIZ_SHORTS = "quiz_shorts"
    STORY_NARRATIVE = "story_narrative"


class CharacterProfile(BaseModel):
    """Structured character profile representation for narrative consistency across scenes."""

    character_id: str = Field(..., description="Unique character identifier")
    name: str = Field(..., min_length=1, description="Character name")
    role: str = Field(default="protagonist", description="Narrative role: protagonist, guide, observer")
    appearance: str = Field(..., description="Visual appearance summary")
    speaking_style: str = Field(default="engaging_educational", description="Tone and speaking style constraints")
    constraints: Dict[str, Any] = Field(default_factory=dict, description="Visual/narrative constraints")


class SceneSpecification(BaseModel):
    """Canonical machine-readable specification for a single narrative scene.

    F02 owns the semantic narrative intent. F03/F04 own physical visual/audio
    realization. The additional state/graph fields make regeneration impact-
    aware without taking downstream production authority.
    """

    scene_id: str = Field(..., description="Stable scene identity (survives single-scene regeneration)")
    scene_version: int = Field(default=1, ge=1, description="Scene version number, incremented on regeneration")
    sequence_index: int = Field(..., ge=1, description="1-indexed sequence position within the script")
    section_type: str = Field(default="Core Narrative", description="Narrative section type: Hook, Retain, Payoff, CTA")
    beat_id: str = Field(default="", description="Canonical narrative beat identity")
    scene_goal: str = Field(default="", description="Why this scene exists in the narrative")
    narration_text: str = Field(..., min_length=2, description="Spoken voiceover or dialogue text")
    on_screen_text: str = Field(default="", description="Caption or subtitle overlay text")
    visual_intent: str = Field(..., min_length=5, description="Semantic narrative intent description for visual scene setup")
    voice_intent: Dict[str, Any] = Field(default_factory=dict, description="Voice delivery intent owned by F02")
    target_duration_seconds: int = Field(default=10, ge=3, le=60, description="Target section duration bound")
    word_count: int = Field(..., ge=1, description="Exact word count of narration_text")
    estimated_speech_duration_seconds: float = Field(..., ge=0.0, description="Calculated speech duration based on speech rate")
    character_references: List[str] = Field(default_factory=list, description="IDs of characters appearing in scene")
    continuity_rules: Dict[str, Any] = Field(default_factory=dict, description="Visual and narrative continuity constraints")
    depends_on_scene_ids: List[str] = Field(default_factory=list, description="Scene dependencies used for impact-aware regeneration")
    causal_event_ids: List[str] = Field(default_factory=list, description="Causal events introduced or resolved in this scene")
    evidence_refs: List[str] = Field(default_factory=list, description="Upstream evidence/provenance IDs supporting factual content")
    viewer_state_before: Dict[str, Any] = Field(default_factory=dict)
    viewer_state_after: Dict[str, Any] = Field(default_factory=dict)
    visual_intent_structured: Dict[str, Any] = Field(default_factory=dict)


class NarrativeStructure(BaseModel):
    """High-level structural outline for a script."""

    format: NarrativeFormat = Field(default=NarrativeFormat.EDUCATIONAL_EXPLAINER)
    title: str = Field(..., min_length=2)
    logline: str = Field(..., min_length=5)
    target_duration_seconds: int = Field(default=60, ge=10, le=600)
    estimated_total_duration_seconds: float = Field(..., ge=0.0)
    estimated_speech_duration_seconds: float = Field(..., ge=0.0)
    estimated_pause_transition_duration_seconds: float = Field(default=0.0, ge=0.0)
    scenes: List[SceneSpecification] = Field(default_factory=list)
