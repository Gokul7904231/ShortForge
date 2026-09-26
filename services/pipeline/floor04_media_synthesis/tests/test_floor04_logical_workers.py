"""Unit tests for Floor 04 logical workers."""

import pytest

from floors.floor04_media_synthesis.app.workers.background_audio_worker import run_background_audio_worker
from floors.floor04_media_synthesis.app.workers.image_worker import run_image_worker
from floors.floor04_media_synthesis.app.workers.tts_worker import run_tts_worker


def test_run_image_worker(tmp_path):
    vis = run_image_worker(
        asset_id="vis-01",
        scene_id="sc-1",
        prompt_text="Python tutorial scene",
        target_width=1080,
        target_height=1920,
        storage_dir=str(tmp_path),
        request_id="req-test-img",
    )

    assert vis.asset_id == "vis-01"
    assert vis.mime_type == "image/png"
    assert vis.width == 1080
    assert vis.height == 1920
    assert vis.file_size_bytes > 0
    assert len(vis.sha256_checksum) == 64


def test_run_tts_worker(tmp_path):
    aud = run_tts_worker(
        asset_id="aud-01",
        scene_id="sc-1",
        narration_text="Explain Python functions",
        target_duration_seconds=5.5,
        voice_code="en_us_male",
        storage_dir=str(tmp_path),
        request_id="req-test-tts",
    )

    assert aud.asset_id == "aud-01"
    assert aud.duration_seconds == 5.5
    assert aud.mime_type == "audio/wav"
    assert aud.file_size_bytes > 0
    assert aud.sample_rate_hz == 44100


def test_run_background_audio_worker(tmp_path):
    bg = run_background_audio_worker(
        target_duration_seconds=60.0,
        mood="motivational",
        storage_dir=str(tmp_path),
        request_id="req-test-bg",
    )

    assert bg.asset_id == "bg-audio-01"
    assert bg.rights_metadata.source_type.value == "STOCK_LIBRARY"
    assert bg.rights_metadata.provider_name == "factoryos_stock_audio_library"
