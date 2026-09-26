"""Floor 05 Timeline Brain generating candidate proposals for Guardian policy authorization."""

from __future__ import annotations

from typing import Dict, List, Optional
from uuid import uuid4

import structlog

from factoryos.guardian.contracts.decision import DecisionActionType, GuardianDecisionProposal, ReasonCategory
from floors.floor05_timeline_composition.app.domain.handoff import Floor05Input
from floors.floor05_timeline_composition.app.brain.proposal import TimelineProposalIR

logger = structlog.get_logger(__name__)


class TimelineBrain:
    """Timeline Brain proposing candidate composition plans for Guardian policy evaluation.

    IMMUTABLE AUTONOMY LAW:
    Brain proposes candidate decisions. Guardian independently authorizes through policy & registry.
    A Brain MUST NEVER grant itself capability or authorize execution.
    """

    def propose_composition_plan(self, input_payload: Floor05Input) -> GuardianDecisionProposal:
        """Formulate candidate decision proposal for timeline composition & rendering."""
        request_id = input_payload.request_id or f"req-{uuid4().hex[:8]}"

        proposal_ir = TimelineProposalIR.from_input(
            input_payload=input_payload,
            proposal_id=f"proposal-{request_id}",
            request_id=request_id,
        )

        proposal = GuardianDecisionProposal(
            action_type=DecisionActionType.RUN_WORKER,
            target_capability="timeline_composition_pipeline_worker",
            reasoning_summary=f"Propose timeline composition and reference rendering for request {request_id}",
            reason_category=ReasonCategory.INITIAL_PLANNING,
            expected_outcome="Assemble TimelineSpec and produce verified MP4 render artifact",
            parameters={
                "request_id": request_id,
                "target_fps": input_payload.target_fps,
                "execution_mode": input_payload.execution_mode.value,
                "input_semantic_fingerprint": input_payload.semantic_fingerprint(),
                "asset_plan_fingerprint": input_payload.floor03_payload.asset_plan_ir.plan_fingerprint,
                "proposal_only": True,
                "guardian_authorization_required": True,
                "source_manifest_verification_required": True,
                "timeline_proposal_ir": proposal_ir.model_dump(),
                "timeline_proposal_fingerprint": proposal_ir.semantic_fingerprint(),
            },
        )
        logger.info("timeline_brain_proposed_plan", request_id=request_id, target_capability=proposal.target_capability)
        return proposal
