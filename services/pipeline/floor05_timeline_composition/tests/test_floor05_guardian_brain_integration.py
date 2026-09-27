"""Floor 05 Guardian uses TimelineBrain as proposal cognition, never as authority."""
from floors.floor05_timeline_composition.app.brain.timeline_brain import TimelineBrain
from floors.floor05_timeline_composition.app.domain.handoff import Floor05Input
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload


def test_timeline_brain_proposal_is_structured_and_non_authoritative(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    proposal = TimelineBrain().propose_composition_plan(
        Floor05Input(
            floor03_payload=f04.floor03_payload,
            floor04_payload=f04,
            request_id="req-brain-wave3",
        )
    )
    assert proposal.parameters["proposal_only"] is True
    assert proposal.parameters["guardian_authorization_required"] is True
    assert proposal.target_capability == "timeline_composition_pipeline_worker"
