"""Floor 05 wave-2 temporal/identity regression tests."""
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload
from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05HandoffPayload,
    Floor05Input,
    RenderJobSpecification,
    RenderJobState,
    TimelineSpec,
    TimelineTrackType,
)
from floors.floor05_timeline_composition.app.services.canonical_hasher import CanonicalHasher
from floors.floor05_timeline_composition.app.services.registry import TimelineRegistry
from floors.floor05_timeline_composition.app.workers.composition_worker import TimelineCompositionWorker


def test_f05_honors_cut_intent_without_creating_overlap(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    for req in f04.floor03_payload.visual_asset_requirements:
        req.continuity_constraints["transition_intent"] = "cut"

    timeline = TimelineCompositionWorker.assemble_timeline(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        target_fps=30,
    )

    assert timeline.transitions
    assert all(t.duration_seconds == 0 for t in timeline.transitions)
    ordered_visual = sorted(
        [c for c in timeline.clips if c.track_type == TimelineTrackType.VISUAL],
        key=lambda c: c.start_time,
    )
    for previous, current in zip(ordered_visual, ordered_visual[1:]):
        assert current.start_time == previous.end_time


def test_registry_does_not_reuse_mutated_committed_artifact(tmp_path):
    registry = TimelineRegistry(storage_root=str(tmp_path))
    artifact = tmp_path / "render.mp4"
    artifact.write_bytes(b"valid-render-bytes")
    import hashlib

    sha = hashlib.sha256(artifact.read_bytes()).hexdigest()
    job = RenderJobSpecification(
        render_job_id="job-wave2",
        request_id="req-wave2",
        timeline_id="tl-wave2",
        render_input_hash="r" * 64,
        authorization_reference="auth-wave2",
        idempotency_key="idem-wave2",
        state=RenderJobState.COMMITTED,
        artifact_reference=str(artifact),
        artifact_sha256=sha,
        artifact_size_bytes=artifact.stat().st_size,
    )
    registry.register_render_job(job)
    assert registry.get_render_job_by_hash("r" * 64) is not None

    artifact.write_bytes(b"tampered")
    assert registry.get_render_job_by_hash("r" * 64) is None


def test_handoff_fingerprint_is_stable_across_serialization(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    spec = TimelineCompositionWorker.assemble_timeline(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        target_fps=30,
    )
    fp1 = CanonicalHasher.compute_timeline_fingerprint(spec)
    fp2 = CanonicalHasher.compute_timeline_fingerprint(
        TimelineSpec.model_validate_json(spec.model_dump_json())
    )
    assert fp1 == fp2
