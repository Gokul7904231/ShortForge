"""Structured, non-authoritative Floor 05 proposal evidence.

This IR is a training/decision-trace artifact. It never grants capability,
does not mutate the timeline, and is not a substitute for Guardian policy.
"""
from __future__ import annotations

import hashlib
import json
from typing import Dict, List

from pydantic import BaseModel, ConfigDict, Field

from floors.floor05_timeline_composition.app.domain.handoff import Floor05Input, TimelineTimebase


class TimelineProposalIR(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: str = "1.0.0"
    proposal_id: str = Field(min_length=1)
    request_id: str = Field(min_length=1)
    input_semantic_fingerprint: str = Field(min_length=64, max_length=64)
    asset_plan_fingerprint: str = Field(min_length=64, max_length=64)
    target_fps: float = Field(gt=0.0)
    scene_order: List[str] = Field(min_length=1)
    transition_intents: Dict[str, str] = Field(default_factory=dict)
    target_duration_frames: Dict[str, int] = Field(default_factory=dict)
    hard_constraints: List[str] = Field(default_factory=list)
    optimization_objectives: List[str] = Field(default_factory=list)
    proposal_only: bool = True
    guardian_authorization_required: bool = True
    physical_verification_required: bool = True

    def semantic_fingerprint(self) -> str:
        payload = self.model_dump(exclude={"proposal_id"})
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    @classmethod
    def from_input(cls, input_payload: Floor05Input, proposal_id: str, request_id: str) -> "TimelineProposalIR":
        plan = input_payload.floor03_payload.asset_plan_ir
        if plan is None or not plan.plan_fingerprint:
            raise ValueError("Floor 05 proposal requires a valid F03 AssetPlanIR fingerprint.")

        timebase = TimelineTimebase(
            numerator=input_payload.target_fps.as_integer_ratio()[0],
            denominator=input_payload.target_fps.as_integer_ratio()[1],
        )
        scene_order = [
            node.scene_id
            for node in sorted(plan.nodes, key=lambda node: node.sequence_index)
        ]
        transition_intents: Dict[str, str] = {}
        for requirement in input_payload.floor03_payload.visual_asset_requirements:
            transition_intents[requirement.scene_id] = str(
                requirement.continuity_constraints.get("transition_intent") or "cut"
            ).strip().lower() or "cut"

        durations = {
            node.scene_id: max(1, timebase.frame_index(node.target_duration_seconds))
            for node in plan.nodes
        }
        return cls(
            proposal_id=proposal_id,
            request_id=request_id,
            input_semantic_fingerprint=input_payload.semantic_fingerprint(),
            asset_plan_fingerprint=plan.plan_fingerprint,
            target_fps=input_payload.target_fps,
            scene_order=scene_order,
            transition_intents=transition_intents,
            target_duration_frames=durations,
            hard_constraints=[
                "exact_f03_f04_asset_set",
                "exact_source_path_and_version",
                "no_asset_substitution",
                "guardian_authorization_required",
                "physical_media_verification_required",
                "f06_requires_committed_handoff",
            ],
            optimization_objectives=[
                "frame_aligned_timing",
                "narration_visual_duration_alignment",
                "explicit_transition_policy",
                "deterministic_replay",
                "bounded_repair",
            ],
        )
