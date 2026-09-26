"""Boundary tests for the hardened Floor 05 -> Floor 06 handoff."""
from uuid import uuid4

import pytest

from floors.floor04_media_synthesis.app.domain.handoff import Floor04HandoffPayload
from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05HandoffPayload,
    RenderJobSpecification,
    RenderJobState,
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
)
from floors.floor05_timeline_composition.app.services.canonical_hasher import CanonicalHasher
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload
from floors.floor06_rendering.app.domain.handoff import Floor06Input, Floor06HandoffPayload, RenderOutputMetadata


def build_mock_floor05_handoff(tmp_path) -> Floor05HandoffPayload:
    f04: Floor04HandoffPayload = build_mock_floor04_payload(tmp_path)
    asset = f04.synthesized_visual_assets[0]
    version = str(f04.floor03_payload.visual_asset_requirements[0].asset_version)

    timeline = TimelineSpec(
        timeline_id="tl-f06-boundary",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.0,
        clips=[
            TimelineClip(
                clip_id="clip-f06-boundary",
                scene_id=asset.scene_id,
                track_type=TimelineTrackType.VISUAL,
                start_time=0.0,
                end_time=1.0,
                source_asset_id=asset.asset_id,
                source_asset_version=version,
                source_file_path=asset.file_path,
            )
        ],
    )
    render_job = RenderJobSpecification(
        render_job_id="job-f06-boundary",
        request_id="req-f06-boundary",
        timeline_id=timeline.timeline_id,
        render_input_hash="a" * 64,
        authorization_reference="guardian-f05:req-f06-boundary",
        idempotency_key="render:a" * 32,
        state=RenderJobState.COMMITTED,
        artifact_sha256="b" * 64,
        artifact_size_bytes=1234,
    )
    timeline_fingerprint = CanonicalHasher.compute_timeline_fingerprint(timeline)

    return Floor05HandoffPayload(
        request_id="req-f06-boundary",
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        timeline_spec=timeline,
        timeline_fingerprint=timeline_fingerprint,
        render_job=render_job,
        rendered_video_path="/tmp/f05.mp4",
        rendered_thumbnail_path="/tmp/f05.png",
        sha256_checksum="b" * 64,
        file_size_bytes=1234,
        provenance_hash="c" * 64,
    )


def test_f06_accepts_committed_f05_lineage(tmp_path):
    f05 = build_mock_floor05_handoff(tmp_path)

    inp = Floor06Input(
        run_id="run-f06-1",
        user_id="user-1",
        user_role="OVERSEER",
        timeline_payload=f05,
        output_resolution={"width": 1080, "height": 1920, "fps": 30},
    )

    assert inp.timeline_payload.render_job.state == RenderJobState.COMMITTED


def test_f06_preserves_f05_source_identity(tmp_path):
    f05 = build_mock_floor05_handoff(tmp_path)
    output = RenderOutputMetadata(
        video_file_path="/tmp/f06.mp4",
        file_size_bytes=4321,
        duration_seconds=1.0,
        resolution_width=1080,
        resolution_height=1920,
        frame_rate=30.0,
        has_audio=True,
        sha256_checksum="d" * 64,
        assigned_worker_id="worker-1",
        render_duration_ms=100,
        source_timeline_fingerprint=f05.timeline_fingerprint,
        source_render_input_hash=f05.render_job.render_input_hash,
        source_f05_artifact_sha256=f05.sha256_checksum,
        source_f05_artifact_size_bytes=f05.file_size_bytes,
    )

    handoff = Floor06HandoffPayload(
        execution_id=f05.execution_id,
        run_id="run-f06-2",
        user_id="user-1",
        user_role="OVERSEER",
        render_metadata=output,
        timeline_handoff=f05,
    )

    assert handoff.render_metadata.sha256_checksum == "d" * 64


def test_f06_rejects_modified_f05_source_checksum(tmp_path):
    f05 = build_mock_floor05_handoff(tmp_path)
    output = RenderOutputMetadata(
        video_file_path="/tmp/f06.mp4",
        file_size_bytes=4321,
        duration_seconds=1.0,
        resolution_width=1080,
        resolution_height=1920,
        frame_rate=30.0,
        has_audio=True,
        sha256_checksum="d" * 64,
        assigned_worker_id="worker-1",
        render_duration_ms=100,
        source_timeline_fingerprint=f05.timeline_fingerprint,
        source_render_input_hash=f05.render_job.render_input_hash,
        source_f05_artifact_sha256="e" * 64,
        source_f05_artifact_size_bytes=f05.file_size_bytes,
    )

    with pytest.raises(ValueError, match="exact F05 source artifact checksum"):
        Floor06HandoffPayload(
            execution_id=f05.execution_id,
            run_id="run-f06-3",
            user_id="user-1",
            user_role="OVERSEER",
            render_metadata=output,
            timeline_handoff=f05,
        )
