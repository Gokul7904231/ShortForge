"""Extensive unit tests for PhysicalMediaValidator."""

import shutil

import pytest

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor04_media_synthesis.app.services.validator import (
    MAX_AUDIO_FILE_SIZE_BYTES,
    MAX_IMAGE_FILE_SIZE_BYTES,
    PhysicalMediaValidator,
)
from floors.floor04_media_synthesis.tests.media_fixtures import (
    write_jpeg_header_fixture,
    write_png,
    write_wav,
)


@pytest.fixture
def storage_setup(tmp_path):
    root = tmp_path / "media_storage"
    root.mkdir()
    return root


def test_valid_png_validation(storage_setup):
    png_file = write_png(storage_setup / "test.png")

    mime, sha, size = PhysicalMediaValidator.validate_image_asset(
        file_path=str(png_file),
        required_width=1080,
        required_height=1920,
        storage_root=str(storage_setup),
    )

    assert mime == "image/png"
    assert len(sha) == 64
    assert size == png_file.stat().st_size


def test_image_size_exact_boundary_pass(storage_setup):
    exact_file = write_png(
        storage_setup / "exact_limit.png",
        pad_to=MAX_IMAGE_FILE_SIZE_BYTES,
    )

    mime, _sha, size = PhysicalMediaValidator.validate_image_asset(
        file_path=str(exact_file),
        required_width=1080,
        required_height=1920,
        storage_root=str(storage_setup),
    )
    assert mime == "image/png"
    assert size == MAX_IMAGE_FILE_SIZE_BYTES


def test_image_size_boundary_plus_one_rejection(storage_setup):
    over_file = write_png(
        storage_setup / "over_limit.png",
        pad_to=MAX_IMAGE_FILE_SIZE_BYTES + 1,
    )

    with pytest.raises(GuardianValidationError, match="exceeds"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(over_file),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_audio_size_exact_boundary_pass(storage_setup):
    exact_audio = write_wav(
        storage_setup / "exact_audio.wav",
        duration_seconds=1.0,
        pad_to=MAX_AUDIO_FILE_SIZE_BYTES,
    )

    mime, _sha, size, duration = PhysicalMediaValidator.validate_audio_asset(
        file_path=str(exact_audio),
        required_duration_seconds=0.5,
        storage_root=str(storage_setup),
        expected_mime="audio/wav",
    )
    assert mime == "audio/wav"
    assert size == MAX_AUDIO_FILE_SIZE_BYTES
    assert duration >= 0.5


def test_audio_size_boundary_plus_one_rejection(storage_setup):
    over_audio = write_wav(
        storage_setup / "over_audio.wav",
        duration_seconds=1.0,
        pad_to=MAX_AUDIO_FILE_SIZE_BYTES + 1,
    )

    with pytest.raises(GuardianValidationError, match="exceeds"):
        PhysicalMediaValidator.validate_audio_asset(
            file_path=str(over_audio),
            required_duration_seconds=0.5,
            storage_root=str(storage_setup),
            expected_mime="audio/wav",
        )


def test_corrupted_png_header_rejection(storage_setup):
    bad_png = storage_setup / "bad.png"
    bad_png.write_bytes(b"NOT_PNG_HEADER_BYTES")

    with pytest.raises(GuardianValidationError, match="magic bytes"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(bad_png),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_truncated_png_missing_iend_rejection(storage_setup):
    trunc_png = storage_setup / "trunc.png"
    trunc_png.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + b"\x00\x00\x00\x0dIHDR"
        + b"\x00\x00\x04\x38\x00\x00\x07\x80\x08\x06\x00\x00\x00"
    )

    with pytest.raises(GuardianValidationError, match="Decoder Failure"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(trunc_png),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_spoofed_extension_rejection(storage_setup):
    spoofed = storage_setup / "spoofed.png"
    spoofed.write_text("Hello World TXT Content", encoding="utf-8")

    with pytest.raises(GuardianValidationError, match="magic bytes"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(spoofed),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_valid_jpeg_validation(storage_setup):
    jpg_file = write_jpeg_header_fixture(storage_setup / "test.jpg")

    mime, sha, size = PhysicalMediaValidator.validate_image_asset(
        file_path=str(jpg_file),
        required_width=1080,
        required_height=1920,
        storage_root=str(storage_setup),
    )
    assert mime == "image/jpeg"
    assert len(sha) == 64
    assert size == jpg_file.stat().st_size


def test_jpeg_missing_eoi_footer_rejection(storage_setup):
    bad_jpg = storage_setup / "no_eoi.jpg"
    bad_jpg.write_bytes(b"\xff\xd8\xff\xe0\x00\x10JFIF")

    with pytest.raises(GuardianValidationError, match="Decoder Failure"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(bad_jpg),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


@pytest.mark.skipif(
    shutil.which("ffprobe") is None,
    reason="ffprobe is required for physical MP3 duration validation",
)
def test_valid_mp3_validation(storage_setup):
    # A generated MP3 fixture is intentionally not synthesized here; use the
    # repository's real ffprobe capability when a real MP3 fixture is available.
    pytest.skip("Real MP3 fixture should be supplied by provider integration tests")


def test_truncated_mp3_rejection(storage_setup):
    trunc_mp3 = storage_setup / "short.mp3"
    trunc_mp3.write_bytes(b"ID3\x00")

    with pytest.raises(GuardianValidationError, match="Decoder Failure"):
        PhysicalMediaValidator.validate_audio_asset(
            file_path=str(trunc_mp3),
            required_duration_seconds=5.0,
            storage_root=str(storage_setup),
        )


def test_valid_wav_validation(storage_setup):
    wav_file = write_wav(storage_setup / "test.wav", duration_seconds=1.0)

    mime, sha, size, dur = PhysicalMediaValidator.validate_audio_asset(
        file_path=str(wav_file),
        required_duration_seconds=0.5,
        storage_root=str(storage_setup),
        expected_mime="audio/wav",
    )
    assert mime == "audio/wav"
    assert dur >= 0.5
    assert len(sha) == 64
    assert size == wav_file.stat().st_size


def test_corrupted_wav_missing_wave_rejection(storage_setup):
    bad_wav = storage_setup / "bad.wav"
    bad_wav.write_bytes(b"RIFF\x00\x00\x00\x00FAIL_HEADER_DATA")

    with pytest.raises(GuardianValidationError, match="WAVE header"):
        PhysicalMediaValidator.validate_audio_asset(
            file_path=str(bad_wav),
            required_duration_seconds=0.5,
            storage_root=str(storage_setup),
        )


def test_path_traversal_escape_rejection(storage_setup, tmp_path):
    outside = write_png(tmp_path / "outside.png")

    with pytest.raises(GuardianValidationError, match="Security Violation"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(outside),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_empty_file_rejection(storage_setup):
    empty = storage_setup / "empty.png"
    empty.write_bytes(b"")

    with pytest.raises(GuardianValidationError, match="empty"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(empty),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_invalid_target_dimensions_rejection(storage_setup):
    png = write_png(storage_setup / "dim.png")

    with pytest.raises(GuardianValidationError, match="Invalid target dimensions"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(png),
            required_width=0,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_provider_mime_mismatch_rejection(storage_setup):
    png = write_png(storage_setup / "mismatch.png")

    with pytest.raises(GuardianValidationError, match="Provider Trust Violation"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(png),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
            expected_mime="image/jpeg",
        )


def test_physical_dimensions_are_not_taken_from_requested_values(storage_setup):
    png = write_png(storage_setup / "wrong-dim.png", width=720, height=1280)

    with pytest.raises(GuardianValidationError, match="physical PNG dimensions"):
        PhysicalMediaValidator.validate_image_asset(
            file_path=str(png),
            required_width=1080,
            required_height=1920,
            storage_root=str(storage_setup),
        )


def test_physical_duration_is_not_taken_from_requested_values(storage_setup):
    wav = write_wav(storage_setup / "short.wav", duration_seconds=0.25)

    with pytest.raises(GuardianValidationError, match="duration"):
        PhysicalMediaValidator.validate_audio_asset(
            file_path=str(wav),
            required_duration_seconds=2.0,
            storage_root=str(storage_setup),
            expected_mime="audio/wav",
        )
