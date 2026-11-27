#!/usr/bin/env python3
"""
TDD Suite for Phase P3 — Boring Deterministic Media Core
=========================================================
"""

import hashlib
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
import pytest

ENGINE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ENGINE_DIR / "scripts"
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(SCRIPTS_DIR))


def test_forbidden_patterns_absent_from_create_short():
    """Zero forbidden P3 patterns remain in create_short.py."""
    src = (SCRIPTS_DIR / "create_short.py").read_text(encoding="utf-8")
    forbidden = [
        "_load_total_duration_from_srt",
        "mutagen",
        "return 10.0",
        "return 5.0",
        "_preprocess_resize_image",
        "im.resize(",
        "volume=3.0",
        "volume=4.0",
        "q_lines[:4]",
        "textwrap.shorten",
        "-threads 0",
        "arial.ttf",
        "frame_%05d.png",
    ]
    found = [pat for pat in forbidden if pat in src]
    assert not found, f"Forbidden patterns still present in create_short.py: {found}"


def test_lattice_integer_math():
    """core/lattice.py enforces exact 48000 Hz / 30 fps / 1600 samples/frame."""
    from core.lattice import (
        FPS,
        MEDIA_TIMEBASE,
        SAMPLES_PER_FRAME,
        SR,
        frames_for_samples,
        samples_for_frames,
        ticks_to_frames,
    )

    assert SR == 48000
    assert FPS == 30
    assert SAMPLES_PER_FRAME == 1600
    assert MEDIA_TIMEBASE == 120_000
    assert samples_for_frames(30) == 48000
    assert frames_for_samples(1600) == 1
    assert frames_for_samples(1601) == 2
    assert ticks_to_frames(120_000) == 30


def test_audio_truth_decodes_mp3_named_wav_and_trims_silence(tmp_path):
    """core/audio_truth.py decodes MP3-as-.wav to 48kHz int16 mono and trims bounded silence."""
    from core.audio_truth import concat_master_audio, decode_audio_to_pcm48k, trim_bounded_silence

    fake_wav = tmp_path / "tts_lying_ext.wav"
    # Encode an actual MP3 stream inside a .wav filename
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=24000:duration=1.0",
            "-f", "mp3", "-c:a", "libmp3lame", str(fake_wav),
        ],
        check=True,
    )

    pcm, dur = decode_audio_to_pcm48k(fake_wav)
    assert pcm.dtype == np.int16
    assert len(pcm) > 40000
    assert abs(dur - len(pcm) / 48000.0) < 1e-9

    # Silence trim keeps 30ms (1440 samples) around active audio
    silent = np.zeros(48000, dtype=np.int16)
    tone = (np.sin(np.linspace(0, 200, 24000)) * 8000).astype(np.int16)
    combined = np.concatenate([silent, tone, silent])
    trimmed = trim_bounded_silence(combined)
    assert len(trimmed) < len(combined)
    assert len(trimmed) >= len(tone) + 1440

    master = concat_master_audio([tone, tone], [16, 16])
    assert master.dtype == np.int16
    assert len(master) == 32 * 1600


def test_timeline_ir_pydantic_mirror():
    """core/timeline.py mirrors CompositionIR ticks with integer start_frame/end_frame."""
    from core.timeline import ScenePlan, TimelinePlan, compile_from_composition_ir

    ir = {
        "schemaVersion": "2.0.0",
        "timebase": 120_000,
        "scenes": [
            {"sceneId": "s1", "startTicks": 0, "durationTicks": 120_000, "text": "Hello world"},
            {"sceneId": "s2", "startTicks": 120_000, "durationTicks": 240_000, "text": "Second scene"},
        ],
    }
    plan = compile_from_composition_ir(ir)
    assert isinstance(plan, TimelinePlan)
    assert plan.total_frames == 90
    assert plan.scenes[0].start_frame == 0
    assert plan.scenes[0].end_frame == 30
    assert plan.scenes[1].start_frame == 30
    assert plan.scenes[1].end_frame == 90


def test_preflight_rejects_over_budget_script_under_50ms():
    """core/preflight.py rejects over-budget script in <50ms with PreflightBudgetError."""
    from core.preflight import PreflightBudgetError, run_preflight_budget

    huge_text = " ".join(["SUPERLONGWORD"] * 60)
    t0 = time.perf_counter()
    with pytest.raises(PreflightBudgetError):
        run_preflight_budget([{"text": huge_text, "duration_frames": 60}])
    elapsed_ms = (time.perf_counter() - t0) * 1000.0
    assert elapsed_ms < 50.0, f"Preflight took {elapsed_ms:.2f}ms (>= 50ms)"

    # Emoji stripping / no-tofu guarantee
    clean = run_preflight_budget([{"text": "Hello 🧠 world", "duration_frames": 60}])
    assert "🧠" not in clean[0]["rendered_text"]


def test_deterministic_rawvideo_assemble_bit_identical(tmp_path):
    """core/frames.py + core/assemble.py render bit-identical SHA-256 across two runs."""
    from core.assemble import assemble_canonical_mp4
    from core.frames import stream_solid_frames_to_ffmpeg

    wav1 = tmp_path / "master.wav"
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "aevalsrc=0.25*sin(2*PI*440*t):s=48000:d=2.0",
            "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1", str(wav1),
        ],
        check=True,
    )

    out1 = tmp_path / "run1.mp4"
    out2 = tmp_path / "run2.mp4"
    assemble_canonical_mp4(
        frame_generator=lambda idx: stream_solid_frames_to_ffmpeg(idx, total_frames=60, text="Test Frame"),
        master_audio_wav=wav1,
        total_frames=60,
        out_mp4=out1,
    )
    assemble_canonical_mp4(
        frame_generator=lambda idx: stream_solid_frames_to_ffmpeg(idx, total_frames=60, text="Test Frame"),
        master_audio_wav=wav1,
        total_frames=60,
        out_mp4=out2,
    )
    h1 = hashlib.sha256(out1.read_bytes()).hexdigest()
    h2 = hashlib.sha256(out2.read_bytes()).hexdigest()
    assert h1 == h2, f"Non-deterministic render: {h1} != {h2}"
