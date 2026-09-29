"""F05 Wave 3 reconciliation regression tests."""
from uuid import uuid4

import pytest

from floors.floor05_timeline_composition.app.brain.timeline_brain import TimelineBrain
from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05Input,
    GuardianAuthorizationContext,
    TimelineSpec,
)
from floors.floor05_timeline_composition.app.services.timeline_ir_bridge import (
    build_canonical_timeline_ir,
    canonical_timeline_ir_fingerprint,
)
from floors.floor05_timeline_composition.app.services.pipeline import Floor05PipelineService
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload


def test_canonical_timeline_ir_bridge_is_deterministic(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    inp = Floor05Input(floor03_payload=f04.floor03_payload, floor04_payload=f04, request_id="req-wave3-bridge")
    timeline = TimelineCompositionWorker.assemble_timeline(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        target_fps=30,
    )
    a = build_canonical_timeline_ir(timeline, inp.request_id)
    b = build_canonical_timeline_ir(TimelineSpec.model_validate_json(timeline.model_dump_json()), inp.request_id)
    assert a == b
    assert a["provenanceDigest"] == canonical_timeline_ir_fingerprint(timeline, inp.request_id)
    assert a["schemaVersion"] == "1.0.0"


def test_timeline_brain_remains_proposal_only(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    proposal = TimelineBrain().propose_composition_plan(
        Floor05Input(floor03_payload=f04.floor03_payload, floor04_payload=f04, request_id="req-brain-wave3")
    )
    assert proposal.target_capability == "timeline_composition_pipeline_worker"
    assert proposal.parameters["proposal_only"] is True
    assert proposal.parameters["guardian_authorization_required"] is True


def test_explicit_caption_intent_is_preserved_into_f05(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    f04.floor03_payload.audio_asset_requirements[0].caption_text = "ON SCREEN FACT"
    timeline = TimelineCompositionWorker.assemble_timeline(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        target_fps=30,
    )
    assert timeline.subtitles[0].text == "ON SCREEN FACT"


def test_f05_pipeline_rejects_missing_guardian_authorization(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    service = Floor05PipelineService(storage_root=str(tmp_path))
    with pytest.raises(Exception, match="authorization"):
        service.run_pipeline(
            Floor05Input(floor03_payload=f04.floor03_payload, floor04_payload=f04, request_id="req-auth"),
            GuardianAuthorizationContext(
                decision_id=str(uuid4()),
                execution_id=str(uuid4()),
                floor_id="floor05",
                capability_name="wrong-capability",
            ),
        )
