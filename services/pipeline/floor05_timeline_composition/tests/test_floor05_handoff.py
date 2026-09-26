"""Floor 05 handoff contract tests using real F04-produced media."""
from uuid import uuid4

import pytest

from floors.floor03_asset_realization.tests.test_floor03_handoff import build_mock_floor02_payload
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload, Floor03Input
from floors.floor03_asset_realization.app.pipeline import Floor03Pipeline
from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05HandoffPayload,
    Floor05Input,
    RenderJobSpecification,
    RenderJobState,
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
)
from floors.floor05_timeline_composition.app.services.canonical_hasher import CanonicalHasher


def build_mock_floor03_payload() -> Floor03HandoffPayload:
    f02_payload = build_mock_floor02_payload()
    return Floor03Pipeline().execute(
        Floor03Input(
            floor02_payload=f02_payload,
            request_id=f"req-f03-test-{uuid4()}",
        )
    )


def build_mock_floor04_payload(tmp_path) -> Floor04HandoffPayload:
    from floors.floor04_media_synthesis.app.domain.handoff import Floor04Input
    from floors.floor04_media_synthesis.app.services.pipeline import Floor04PipelineService

    f03 = build_mock_floor03_payload()
    service = Floor04PipelineService(storage_root=str(tmp_path / "mock_assets"))
    return service.execute_pipeline(
        Floor04Input(
            floor03_payload=f03,
            request_id=f"req-f04-test-{uuid4()}",
        )
    )


def test_floor05_handoff_contract_serialization(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    inp = Floor05Input(
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        request_id="req-f05-01",
    )
    asset = f04.synthesized_visual_assets[0]

    clip = TimelineClip(
        clip_id="clip-1",
        scene_id=asset.scene_id,
        track_type=TimelineTrackType.VISUAL,
        start_time=0.0,
        end_time=5.0,
        source_asset_id=asset.asset_id,
        source_asset_version=str(
            f04.floor03_payload.visual_asset_requirements[0].asset_version
        ),
        source_file_path=asset.file_path,
    )

    spec = TimelineSpec(
        timeline_id="tl-1",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=5.0,
        clips=[clip],
    )
    timeline_fingerprint = CanonicalHasher.compute_timeline_fingerprint(spec)

    job = RenderJobSpecification(
        render_job_id="job-1",
        request_id="req-f05-01",
        timeline_id="tl-1",
        render_input_hash="h" * 64,
        authorization_reference="auth-ref-1",
        idempotency_key="idem-1",
        state=RenderJobState.COMMITTED,
        artifact_sha256="c" * 64,
        artifact_size_bytes=5000,
    )

    payload = Floor05HandoffPayload(
        request_id="req-f05-01",
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        timeline_spec=spec,
        timeline_fingerprint=timeline_fingerprint,
        render_job=job,
        rendered_video_path="/path/to/out.mp4",
        rendered_thumbnail_path="/path/to/thumb.png",
        sha256_checksum="c" * 64,
        file_size_bytes=5000,
        provenance_hash="p" * 64,
    )

    serialized = payload.model_dump_json()
    deserialized = Floor05HandoffPayload.model_validate_json(serialized)

    assert deserialized.request_id == "req-f05-01"
    assert deserialized.render_job.render_job_id == "job-1"
    assert deserialized.timeline_spec.clips[0].source_asset_id == asset.asset_id
    assert deserialized.timeline_fingerprint == timeline_fingerprint
    assert inp.semantic_fingerprint()


def test_floor05_rejects_f03_f04_lineage_mismatch(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    mismatched = f04.floor03_payload.model_copy(deep=True)
    mismatched.asset_plan_version += 1

    with pytest.raises(ValueError, match="F03/F04 join mismatch"):
        Floor05Input(
            floor03_payload=mismatched,
            floor04_payload=f04,
            request_id="req-f05-mismatch",
        )


def test_floor05_rejects_asset_path_substitution(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    asset = f04.synthesized_visual_assets[0]
    with pytest.raises(ValueError, match="points at a path different"):
        Floor05HandoffPayload(
            request_id="req-f05-path",
            floor03_payload=f04.floor03_payload,
            floor04_payload=f04,
            timeline_spec=TimelineSpec(
                timeline_id="tl-path",
                target_width=1080,
                target_height=1920,
                target_fps=30,
                aspect_ratio="9:16",
                total_duration_seconds=5.0,
                clips=[
                    TimelineClip(
                        clip_id="clip-path",
                        scene_id=asset.scene_id,
                        track_type=TimelineTrackType.VISUAL,
                        start_time=0.0,
                        end_time=5.0,
                        source_asset_id=asset.asset_id,
                        source_asset_version="999",
                        source_file_path="/untrusted/substitute.png",
                    )
                ],
            ),
            timeline_fingerprint="a" * 64,
            render_job=RenderJobSpecification(
                render_job_id="job-path",
                request_id="req-f05-path",
                timeline_id="tl-path",
                render_input_hash="b" * 64,
                authorization_reference="auth",
                idempotency_key="idem",
                state=RenderJobState.COMMITTED,
            ),
            rendered_video_path="/tmp/out.mp4",
            rendered_thumbnail_path="/tmp/thumb.png",
            sha256_checksum="c" * 64,
            file_size_bytes=1,
            provenance_hash="d" * 64,
        )
