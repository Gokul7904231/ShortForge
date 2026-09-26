"""Handoff contract and domain model unit tests for Floor 05 Timeline Composition."""

import json
from pathlib import Path
from uuid import uuid4

import pytest

from floors.floor03_asset_realization.tests.test_floor03_handoff import build_mock_floor02_payload
from floors.floor03_asset_realization.app.domain.handoff import Floor03HandoffPayload, Floor03Input
from floors.floor03_asset_realization.app.pipeline import Floor03Pipeline
from floors.floor04_media_synthesis.app.domain.handoff import (
    AssetSourceType,
    Floor04HandoffPayload,
    MediaPackageManifest,
    RightsMetadata,
    SynthesizedAudioAsset,
    SynthesizedVisualAsset,
)
from floors.floor05_timeline_composition.app.domain.handoff import (
    Floor05HandoffPayload,
    Floor05Input,
    RenderJobSpecification,
    RenderJobState,
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
)


def build_mock_floor03_payload() -> Floor03HandoffPayload:
    f02_payload = build_mock_floor02_payload()
    f03_pipeline = Floor03Pipeline()
    return f03_pipeline.execute(Floor03Input(floor02_payload=f02_payload, request_id=f"req-f03-test-{uuid4()}"))


def build_mock_floor04_payload(tmp_path) -> Floor04HandoffPayload:
    f03 = build_mock_floor03_payload()
    root = tmp_path / "mock_assets"
    root.mkdir(exist_ok=True)

    img_path = root / "scene1.png"
    img_path.write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00\x0dIHDRIEND\xaeB`\x82")

    aud_path = root / "scene1.mp3"
    aud_path.write_bytes(b"ID3\x04\x00\x00\x00\x00\x00\x00Valid MP3 Stream Payload")

    rights = RightsMetadata(
        source_type=AssetSourceType.DETERMINISTIC_SYNTHESIS,
        provider_name="test_provider",
    )

    vis = SynthesizedVisualAsset(
        asset_id="vis-001",
        scene_id="sc-1",
        file_path=str(img_path),
        mime_type="image/png",
        width=1080,
        height=1920,
        sha256_checksum="a" * 64,
        file_size_bytes=100,
        provenance_hash="p" * 64,
        rights_metadata=rights,
    )

    aud = SynthesizedAudioAsset(
        asset_id="aud-001",
        scene_id="sc-1",
        file_path=str(aud_path),
        mime_type="audio/mpeg",
        duration_seconds=5.0,
        sample_rate_hz=44100,
        sha256_checksum="b" * 64,
        file_size_bytes=200,
        provenance_hash="q" * 64,
        rights_metadata=rights,
    )

    manifest = MediaPackageManifest(total_visual_assets=1, total_audio_assets=1, total_size_bytes=300)

    return Floor04HandoffPayload(
        request_id="req-f04-mock",
        floor03_payload=f03,
        synthesized_visual_assets=[vis],
        synthesized_audio_assets=[aud],
        media_manifest=manifest,
        provenance_hash="f04prov" + "0" * 57,
    )


def test_floor05_handoff_contract_serialization(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    inp = Floor05Input(floor03_payload=f04.floor03_payload, floor04_payload=f04, request_id="req-f05-01")

    clip = TimelineClip(
        clip_id="clip-1",
        track_type=TimelineTrackType.VISUAL,
        start_time=0.0,
        end_time=5.0,
        source_asset_id="vis-001",
        source_asset_version="1.0.0",
        source_file_path="/path/to/img.png",
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

    job = RenderJobSpecification(
        render_job_id="job-1",
        request_id="req-f05-01",
        timeline_id="tl-1",
        render_input_hash="h" * 64,
        authorization_reference="auth-ref-1",
        idempotency_key="idem-1",
        state=RenderJobState.COMMITTED,
    )

    payload = Floor05HandoffPayload(
        request_id="req-f05-01",
        floor03_payload=f04.floor03_payload,
        floor04_payload=f04,
        timeline_spec=spec,
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
    assert deserialized.timeline_spec.clips[0].source_asset_id == "vis-001"


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

