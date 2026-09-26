"""Unit tests for deterministic Floor 05 timeline identity."""
from floors.floor05_timeline_composition.app.domain.handoff import (
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
)
from floors.floor05_timeline_composition.app.services.canonical_hasher import CanonicalHasher
from floors.floor05_timeline_composition.app.services.registry import TimelineRegistry
from floors.floor05_timeline_composition.tests.test_floor05_handoff import build_mock_floor04_payload


def test_canonical_hasher_determinism(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)

    clip1 = TimelineClip(
        clip_id="clip-01",
        scene_id="sc-1",
        track_type=TimelineTrackType.VISUAL,
        start_time=0.0,
        end_time=5.0,
        source_asset_id="vis-001",
        source_asset_version="1.0.0",
        source_file_path="/path/1.png",
    )
    clip2 = TimelineClip(
        clip_id="clip-02",
        scene_id="sc-1",
        track_type=TimelineTrackType.NARRATION,
        start_time=0.0,
        end_time=5.0,
        source_asset_id="aud-001",
        source_asset_version="1.0.0",
        source_file_path="/path/1.mp3",
    )

    spec_a = TimelineSpec(
        timeline_id="tl-100",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=5.0,
        clips=[clip1, clip2],
    )
    spec_b = TimelineSpec(
        timeline_id="tl-100",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=5.0,
        clips=[clip2, clip1],
    )

    hash_a = CanonicalHasher.compute_render_input_hash(f04, spec_a, "renderer-1", "1.0.0")
    hash_b = CanonicalHasher.compute_render_input_hash(f04, spec_b, "renderer-1", "1.0.0")

    assert hash_a == hash_b
    assert len(hash_a) == 64


def test_timeline_fingerprint_changes_when_timing_changes(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    clip = TimelineClip(
        clip_id="clip-01",
        scene_id="sc-1",
        track_type=TimelineTrackType.VISUAL,
        start_time=0.0,
        end_time=5.0,
        source_asset_id="vis-001",
        source_asset_version="1.0.0",
        source_file_path="/path/1.png",
    )
    spec_a = TimelineSpec(
        timeline_id="tl-101",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=5.0,
        clips=[clip],
    )
    spec_b = spec_a.model_copy(deep=True)
    spec_b.clips[0].end_time = 4.0
    spec_b.total_duration_seconds = 4.0

    assert CanonicalHasher.compute_timeline_fingerprint(spec_a) != CanonicalHasher.compute_timeline_fingerprint(spec_b)


def test_canonical_hasher_versioning_sensitivity(tmp_path):
    f04 = build_mock_floor04_payload(tmp_path)
    clip = TimelineClip(
        clip_id="clip-01",
        scene_id="sc-1",
        track_type=TimelineTrackType.VISUAL,
        start_time=0.0,
        end_time=5.0,
        source_asset_id="vis-001",
        source_asset_version="1.0.0",
        source_file_path="/path/1.png",
    )
    spec = TimelineSpec(
        timeline_id="tl-100",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=5.0,
        clips=[clip],
    )

    hash_v1 = CanonicalHasher.compute_render_input_hash(f04, spec, "renderer-1", "1.0.0")
    hash_v2 = CanonicalHasher.compute_render_input_hash(f04, spec, "renderer-1", "2.0.0")

    assert hash_v1 != hash_v2


def test_timeline_registry_ignores_creation_timestamp(tmp_path):
    timeline = TimelineSpec(
        timeline_id="tl-registry",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.0,
        clips=[
            TimelineClip(
                clip_id="clip-reg",
                scene_id="scene-1",
                track_type=TimelineTrackType.VISUAL,
                start_time=0.0,
                end_time=1.0,
                source_asset_id="asset-1",
                source_file_path="/path/asset.png",
            )
        ],
    )
    registry = TimelineRegistry(str(tmp_path / "registry"))
    registry.register_timeline(timeline)

    replay = timeline.model_copy(update={"created_at": timeline.created_at.replace(microsecond=999999)})
    registry.register_timeline(replay)

    assert registry.get_timeline("tl-registry") is not None
