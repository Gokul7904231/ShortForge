"""Floor 05 wave-3 bridge and security regression tests."""
from uuid import uuid4

from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05Input,
    GuardianAuthorizationContext,
)
from floors.floor05_timeline_composition.app.services.timeline_ir_bridge import (
    build_canonical_timeline_ir,
    canonical_timeline_ir_fingerprint,
)
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker


def test_canonical_timeline_ir_bridge_is_deterministic(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    inp = Floor05Input(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        request_id="req-wave3-bridge",
    )
    timeline = TimelineCompositionWorker.assemble_timeline(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        target_fps=30,
    )

    a = build_canonical_timeline_ir(timeline, inp.request_id)
    b = build_canonical_timeline_ir(timeline.model_validate_json(timeline.model_dump_json()), inp.request_id)

    assert a == b
    assert a["provenanceDigest"] == canonical_timeline_ir_fingerprint(timeline, inp.request_id)
    assert a["canvas"]["width"] == 1080
    assert a["canvas"]["height"] == 1920
    assert "subtitleTracks" in a


def test_guardian_authorization_context_is_floor_and_capability_scoped():
    context = GuardianAuthorizationContext(
        decision_id=str(uuid4()),
        execution_id=str(uuid4()),
        floor_id="floor05",
        capability_name="timeline_composition_pipeline_worker",
    )
    assert context.authorized_by == "GUARDIAN_ACTION_GATE"
