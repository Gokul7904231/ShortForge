"""Integration unit tests for Floor 05 Timeline Brain & Guardian Adapter."""

from pathlib import Path
import pytest

from factoryos.guardian.contracts.decision import DecisionActionType, GuardianDecisionProposal, ReasonCategory
from factoryos.guardian.contracts.guardian_report import GuardianReport
from factoryos.guardian.contracts.guardian_state import GuardianLifecycleState, GuardianState
from factoryos.guardian.core.exceptions import GuardianCapabilityError, GuardianValidationError
from factoryos.guardian.floors.floor05_guardian import Floor05Guardian
from floors.floor05_timeline_composition.app.brain.timeline_brain import TimelineBrain
from floors.floor05_timeline_composition.app.domain.handoff import Floor05HandoffPayload, Floor05Input
from floors.floor05_timeline_composition.app.services.pipeline import Floor05PipelineService
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload


def test_brain_proposal_generation(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    inp = Floor05Input(floor03_payload=f04.floor03_payload, floor04_payload=f04, request_id="req-brain-1")

    brain = TimelineBrain()
    proposal = brain.propose_composition_plan(inp)

    assert proposal.target_capability == "timeline_composition_pipeline_worker"
    assert proposal.action_type == DecisionActionType.RUN_WORKER
    assert proposal.parameters["request_id"] == "req-brain-1"


def test_guardian_authorizes_and_executes_floor05_pipeline(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    inp = Floor05Input(floor03_payload=f04.floor03_payload, floor04_payload=f04, request_id="req-g-05-auth")

    pipeline_service = Floor05PipelineService(storage_root=str(tmp_path))
    guardian = Floor05Guardian(pipeline_service=pipeline_service)

    report = guardian.execute(inp)

    assert report.status == GuardianLifecycleState.COMPLETED
    assert report.floor_id == "floor05"
    assert report.handoff_payload is not None
    payload_dict = report.handoff_payload
    assert payload_dict["request_id"] == "req-g-05-auth"
    assert payload_dict["render_job"]["state"] == "COMMITTED"
    assert len(payload_dict["provenance_hash"]) == 64


def test_guardian_denies_unregistered_capability_for_floor05(tmp_path):
    pipeline_service = Floor05PipelineService(storage_root=str(tmp_path))
    guardian = Floor05Guardian(pipeline_service=pipeline_service)

    state = GuardianState(
        floor_id="floor05", request_id="req-g-bad", objective="Test bypass", input_contract_hash="hash-123"
    )
    unauthorized_proposal = GuardianDecisionProposal(
        action_type=DecisionActionType.RUN_WORKER,
        target_capability="unregistered_malicious_worker",
        reasoning_summary="Bypass attempt",
        reason_category=ReasonCategory.INITIAL_PLANNING,
        expected_outcome="Bypass authorization",
    )

    policy_results = guardian.engine.policy_engine.evaluate_proposal(state, unauthorized_proposal)
    fatal_denials = [r for r in policy_results if not r.allowed]
    assert len(fatal_denials) >= 1
    assert "not registered in the allowlist registry" in fatal_denials[0].reason
