"""Unit tests for physical and semantic Floor 05 validation."""
from shutil import which
import subprocess

import pytest

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor05_timeline_composition.app.domain.handoff import (
    RenderJobSpecification,
    SubtitleItem,
    TimelineClip,
    TimelineSpec,
    TimelineTrackType,
)
from floors.floor05_timeline_composition.app.services.source_manifest import SourceManifestVerifier
from floors.floor05_timeline_composition.app.services.validators import (
    PhysicalVideoValidator,
    SemanticCompositionValidator,
)


@pytest.fixture
def storage_setup(tmp_path):
    root = tmp_path / "renders"
    root.mkdir()
    return root


def _make_real_mp4(path, duration=1.0):
    ffmpeg = which("ffmpeg")
    if ffmpeg is None:
        pytest.skip("ffmpeg is required for physical media tests")
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=1080x1920:r=30",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=48000:cl=stereo",
            "-t",
            str(duration),
            "-c:v",
            "libx264",
            "-preset",
            "ultrafast",
            "-pix_fmt",
            "yuv420p",
            "-c:a",
            "aac",
            "-ar",
            "48000",
            "-ac",
            "2",
            "-movflags",
            "+faststart",
            str(path),
        ],
        check=True,
        capture_output=True,
    )


def test_valid_physical_video_validation(storage_setup):
    mp4_file = storage_setup / "valid.mp4"
    _make_real_mp4(mp4_file, duration=1.0)

    spec = TimelineSpec(
        timeline_id="tl-valid",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.0,
        clips=[
            TimelineClip(
                clip_id="visual",
                scene_id="sc1",
                track_type=TimelineTrackType.VISUAL,
                start_time=0.0,
                end_time=1.0,
                source_asset_id="vis-1",
                source_file_path="/path/1.png",
            ),
            TimelineClip(
                clip_id="voice",
                scene_id="sc1",
                track_type=TimelineTrackType.NARRATION,
                start_time=0.0,
                end_time=1.0,
                source_asset_id="aud-1",
                source_file_path="/path/1.wav",
            ),
        ],
    )
    job = RenderJobSpecification(
        render_job_id="job-v",
        request_id="req-v",
        timeline_id="tl-valid",
        render_input_hash="a" * 64,
        authorization_reference="auth-1",
        idempotency_key="idem-1",
    )

    mime, sha, size, dur = PhysicalVideoValidator.validate_rendered_video(
        file_path=str(mp4_file),
        render_job=job,
        timeline_spec=spec,
        storage_root=str(storage_setup),
    )

    assert mime == "video/mp4"
    assert len(sha) == 64
    assert size > 0
    assert 0.9 <= dur <= 1.1


def test_physical_video_path_traversal_rejection(storage_setup, tmp_path):
    outside = tmp_path / "outside.mp4"
    outside.write_bytes(b"\x00\x00\x00\x1cftypisom")

    spec = TimelineSpec(
        timeline_id="tl-out",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.0,
    )
    job = RenderJobSpecification(
        render_job_id="job-out",
        request_id="req-out",
        timeline_id="tl-out",
        render_input_hash="a" * 64,
        authorization_reference="a",
        idempotency_key="i",
    )

    with pytest.raises(GuardianValidationError, match="Security Violation"):
        PhysicalVideoValidator.validate_rendered_video(
            file_path=str(outside),
            render_job=job,
            timeline_spec=spec,
            storage_root=str(storage_setup),
        )


def test_semantic_validator_s1_missing_visual_clips_rejection():
    spec = TimelineSpec(
        timeline_id="tl-no-vis",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.0,
        clips=[],
    )
    job = RenderJobSpecification(
        render_job_id="j1",
        request_id="r1",
        timeline_id="tl-no-vis",
        render_input_hash="a" * 64,
        authorization_reference="a",
        idempotency_key="i",
    )

    with pytest.raises(GuardianValidationError, match="Semantic Invariant Violation \(S1\)"):
        SemanticCompositionValidator.validate_semantic_composition(job, spec, "a" * 64)


def test_semantic_validator_rejects_unexplained_visual_overlap():
    clips = [
        TimelineClip(
            clip_id="c1",
            scene_id="sc1",
            track_type=TimelineTrackType.VISUAL,
            start_time=0.0,
            end_time=1.0,
            source_asset_id="vis-1",
            source_file_path="/path/1.png",
        ),
        TimelineClip(
            clip_id="c2",
            scene_id="sc2",
            track_type=TimelineTrackType.VISUAL,
            start_time=0.5,
            end_time=1.5,
            source_asset_id="vis-2",
            source_file_path="/path/2.png",
        ),
    ]
    spec = TimelineSpec(
        timeline_id="tl-overlap",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.5,
        clips=clips,
    )
    job = RenderJobSpecification(
        render_job_id="j-overlap",
        request_id="r-overlap",
        timeline_id="tl-overlap",
        render_input_hash="a" * 64,
        authorization_reference="a",
        idempotency_key="i",
    )
    with pytest.raises(GuardianValidationError, match="S5"):
        SemanticCompositionValidator.validate_semantic_composition(job, spec, "a" * 64)


def test_semantic_validator_s6_subtitle_out_of_bounds_rejection():
    clip = TimelineClip(
        clip_id="c1",
        scene_id="sc1",
        track_type=TimelineTrackType.VISUAL,
        start_time=0.0,
        end_time=1.0,
        source_asset_id="vis-1",
        source_file_path="/path/1.png",
    )
    with pytest.raises(ValueError, match="extends beyond total timeline duration"):
        TimelineSpec(
            timeline_id="tl-sub-err",
            target_width=1080,
            target_height=1920,
            target_fps=30,
            aspect_ratio="9:16",
            total_duration_seconds=1.0,
            clips=[clip],
            subtitles=[
                SubtitleItem(
                    subtitle_id="s1",
                    scene_id="sc1",
                    text="Late text",
                    start_time=0.0,
                    end_time=2.0,
                )
            ],
        )


def test_render_job_rejects_non_sha256_hash():
    with pytest.raises(ValueError, match="string_too_short"):
        RenderJobSpecification(
            render_job_id="bad",
            request_id="r",
            timeline_id="tl",
            render_input_hash="short_hash",
            authorization_reference="a",
            idempotency_key="i",
        )


def test_source_manifest_rejects_symlink_before_resolution(tmp_path):
    target = tmp_path / "real.bin"
    target.write_bytes(b"trusted")
    link = tmp_path / "link.bin"
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip("symlink creation is unavailable on this runner")

    with pytest.raises(GuardianValidationError, match="must not be a symlink"):
        SourceManifestVerifier._verify_path(
            str(link),
            "a" * 64,
            target.stat().st_size,
            "visual",
        )


def test_render_validator_rejects_symlink_before_resolution(storage_setup, tmp_path):
    target = storage_setup / "target.mp4"
    target.write_bytes(b"placeholder")
    link = storage_setup / "link.mp4"
    try:
        link.symlink_to(target)
    except OSError:
        pytest.skip("symlink creation is unavailable on this runner")

    spec = TimelineSpec(
        timeline_id="tl-symlink",
        target_width=1080,
        target_height=1920,
        target_fps=30,
        aspect_ratio="9:16",
        total_duration_seconds=1.0,
    )
    job = RenderJobSpecification(
        render_job_id="job-symlink",
        request_id="req-symlink",
        timeline_id="tl-symlink",
        render_input_hash="a" * 64,
        authorization_reference="auth",
        idempotency_key="idem",
    )

    with pytest.raises(GuardianValidationError, match="must not be a symlink"):
        PhysicalVideoValidator.validate_rendered_video(
            str(link),
            job,
            spec,
            str(storage_setup),
        )
