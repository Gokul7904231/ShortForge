"""Floor 05 Guardian reasoning adapter.

TimelineBrain is the cognition/proposal layer; GuardianEngine remains the
authorization and execution authority. This adapter makes the documented
proposal -> authorization -> execution -> completion loop executable without
giving the Brain direct worker privileges.
"""
from __future__ import annotations

from typing import List

from factoryos.guardian.capabilities.models import Capability
from factoryos.guardian.contracts.decision import (
    DecisionActionType,
    GuardianDecisionProposal,
    ReasonCategory,
)
from factoryos.guardian.contracts.guardian_state import GuardianState
from floors.floor05_timeline_composition.app.brain.timeline_brain import TimelineBrain


class Floor05ReasoningEngine:
    """Deterministic bridge from TimelineBrain proposals into Guardian decisions."""

    def __init__(self, brain: TimelineBrain | None = None):
        self.brain = brain or TimelineBrain()

    def propose(
        self,
        state: GuardianState,
        available_capabilities: List[Capability],
        context: dict,
    ) -> GuardianDecisionProposal:
        completed = set(state.completed_actions)
        target = "timeline_composition_pipeline_worker"

        if target in completed:
            return GuardianDecisionProposal(
                action_type=DecisionActionType.COMPLETE,
                reason_category=ReasonCategory.OBJECTIVE_SATISFIED,
                reasoning_summary=(
                    "Timeline composition worker completed; the Guardian verification "
                    "state is ready to finalize the Floor 05 objective."
                ),
                expected_outcome="Committed Floor 05 handoff is present in working memory.",
            )

        if not any(cap.name == target for cap in available_capabilities):
            return GuardianDecisionProposal(
                action_type=DecisionActionType.ESCALATE,
                reason_category=ReasonCategory.FATAL_FAILURE,
                reasoning_summary="Required Floor 05 timeline composition capability is unavailable.",
                expected_outcome="Guardian escalates because the required capability is not registered.",
            )

        input_payload = context["input_data"]
        proposal = self.brain.propose_composition_plan(input_payload)
        return proposal
