"""Regression tests for structured, non-authoritative Floor 05 brain proposals."""
from floors.floor05_timeline_composition.app.brain.timeline_brain import TimelineBrain
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload
from floors.floor05_timeline_composition.app.domain.handoff import Floor05Input


def test_timeline_brain_proposal_contains_bounded_typed_evidence(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    proposal = TimelineBrain().propose_composition_plan(
        Floor05Input(
            floor03_payload=f04.floor03_payload,
            floor04_payload=f04,
            request_id="req-brain-wave2",
            target_fps=30,
        )
    )
    assert proposal.target_capability == "timeline_composition_pipeline_worker"
    assert proposal.parameters["proposal_only"] is True
    assert proposal.parameters["guardian_authorization_required"] is True
    assert proposal.parameters["timeline_proposal_fingerprint"]
    proposal_ir = proposal.parameters["timeline_proposal_ir"]
    assert proposal_ir["asset_plan_fingerprint"] == f04.floor03_payload.asset_plan_ir.plan_fingerprint
    assert "no_asset_substitution" in proposal_ir["hard_constraints"]
    assert proposal_ir["physical_verification_required"] is True
