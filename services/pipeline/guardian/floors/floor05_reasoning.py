"""Floor 05 Guardian reasoning bridge: TimelineBrain proposes; Guardian authorizes."""
from __future__ import annotations

from typing import List

from factoryos.guardian.capabilities.models import Capability
from factoryos.guardian.contracts.decision import DecisionActionType, GuardianDecisionProposal, ReasonCategory
from factoryos.guardian.contracts.guardian_state import GuardianState
from floors.floor05_timeline_composition.app.brain.timeline_brain import TimelineBrain


class Floor05ReasoningEngine:
    """Convert TimelineBrain proposals into Guardian proposals without granting authority."""

    def __init__(self, brain: TimelineBrain | None = None):
        self.brain = brain or TimelineBrain()

    def propose(
        self,
        state: GuardianState,
        available_capabilities: List[Capability],
        context: dict,
    ) -> GuardianDecisionProposal:
        target = "timeline_composition_pipeline_worker"
        if target in state.completed_actions:
            return GuardianDecisionProposal(
                action_type=DecisionActionType.COMPLETE,
                reason_category=ReasonCategory.OBJECTIVE_SATISFIED,
                reasoning_summary="Floor 05 timeline composition worker completed; finalize the Guardian objective.",
                expected_outcome="Committed Floor 05 handoff is present in working memory.",
            )
        if not any(cap.name == target for cap in available_capabilities):
            return GuardianDecisionProposal(
                action_type=DecisionActionType.ESCALATE,
                reason_category=ReasonCategory.FATAL_FAILURE,
                reasoning_summary="Required Floor 05 timeline composition capability is unavailable.",
                expected_outcome="Guardian escalates because the capability is not registered.",
            )
        return self.brain.propose_composition_plan(context["input_data"])
