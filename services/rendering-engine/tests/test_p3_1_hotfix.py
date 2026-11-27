#!/usr/bin/env python3
"""
TDD Suite for Phase P3.1 — Broken Finalization & Unused Gate Wiring
===================================================================
"""

import json
import subprocess
import sys
from pathlib import Path

import pytest

ENGINE_DIR = Path(__file__).resolve().parent.parent
SCRIPTS_DIR = ENGINE_DIR / "scripts"
sys.path.insert(0, str(ENGINE_DIR))
sys.path.insert(0, str(SCRIPTS_DIR))


def test_motivational_e2e_assemble_and_finalize_retains_artifact(tmp_path, monkeypatch):
    """_assemble_video -> _finalize_render_and_upload must succeed without NameError and retain final.mp4."""
    import create_short

    out_dir = tmp_path / "mot_job_001"
    out_dir.mkdir(parents=True, exist_ok=True)
    img = out_dir / "scene1.png"
    audio_wav = out_dir / "audio.wav"
    out_srt = out_dir / "subtitles.srt"
    out_final = out_dir / "final.mp4"
    out_thumb = out_dir / "thumbnail.png"

    # Generate valid 1080x1920 image & 2s 48kHz audio
    from PIL import Image
    Image.new("RGB", (1080, 1920), (20, 30, 50)).save(img)
    subprocess.run(
        [
            "ffmpeg", "-y", "-v", "error",
            "-f", "lavfi", "-i", "aevalsrc=0.25*sin(2*PI*440*t):s=48000:d=2.0",
            "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1", str(audio_wav),
        ],
        check=True,
    )
    out_srt.write_text("1\n00:00:00,000 --> 00:00:02,000\nHello world\n", encoding="utf-8")

    meta = create_short._assemble_video(
        job_id="mot_job_001",
        render_profile="HIGH_QUALITY",
        images=[img],
        audio_wav=audio_wav,
        subtitles_srt=out_srt,
        out_mp4=out_final,
    )
    assert out_final.exists()

    def fake_upload(file_path, **kwargs):
        return {"secure_url": f"https://res.cloudinary.com/demo/video/upload/{Path(file_path).name}"}

    monkeypatch.setattr(create_short.cloudinary.uploader, "upload", fake_upload)
    monkeypatch.delenv("KEEP_RENDER_ARTIFACT", raising=False)
    monkeypatch.delenv("OUTPUT_DIR", raising=False)

    create_short._finalize_render_and_upload(
        job_id="mot_job_001",
        out_dir=out_dir,
        out_final=out_final,
        out_thumbnail=out_thumb,
        out_srt=out_srt,
        timings={"step4_render_sec": 1.0},
        subtitle_meta=meta,
        probe={"duration": 2.0, "playable": True, "audioDetected": True},
        cache_hits=0,
        cache_misses=1,
    )

    assert out_final.exists(), "final.mp4 must ALWAYS be retained on disk"
    res = json.loads((out_dir / "result.json").read_text(encoding="utf-8"))
    assert res["status"] == "staged"


def test_preflight_wired_into_quiz_and_motivational(tmp_path):
    """Over-budget script must be rejected pre-render by run_preflight_budget in both quiz & motivational."""
    import create_short
    from core.preflight import PreflightBudgetError

    over_text = " ".join(["OVERBUDGETWORD"] * 60)

    # Quiz over-budget hook
    bad_quiz = {
        "jobId": "bad_preflight_quiz",
        "topic": "Test Quiz",
        "contentType": "QUIZ_SHORTS",
        "quizData": {
            "hook": over_text,
            "questions": [
                {"question": "Q1?", "options": ["A", "B", "C", "D"], "answer": "A", "answerIndex": 0}
            ],
        },
    }
    with pytest.raises(PreflightBudgetError):
        create_short.run_quiz_shorts(
            bad_quiz, tmp_path, tmp_path / "a.wav", tmp_path / "s.srt", tmp_path / "f.mp4", tmp_path / "t.png", {}
        )

    # Motivational preflight helper
    with pytest.raises(PreflightBudgetError):
        create_short.validate_motivational_preflight([{"text": over_text}])


def test_quiz_timeline_uses_timeline_plan_zero_float_ceil():
    """Quiz path must derive total_frames from TimelinePlan + frames_for_samples, never ceil(total_duration * fps)."""
    src = (SCRIPTS_DIR / "create_short.py").read_text(encoding="utf-8")
    assert "math.ceil(total_duration * fps)" not in src, "Float-derived total_frames still present in create_short.py"
    assert "TimelinePlan(" in src, "create_short.py must construct TimelinePlan"
    assert "frames_for_samples(" in src, "create_short.py must derive frames via frames_for_samples"


def test_flux_failure_fails_closed_never_ships_placeholder(tmp_path, monkeypatch):
    """FLUX failure must raise VisualAssetGenerationError and never produce a placeholder or reach emit_staged_result."""
    import create_short

    assert not hasattr(create_short, "_write_placeholder_image"), "_write_placeholder_image must be deleted"

    def fail_flux(*args, **kwargs):
        raise RuntimeError("Simulated FLUX 503")

    monkeypatch.setattr(create_short, "_generate_or_load_cached_image", fail_flux)
    job_file = tmp_path / "job_flux_fail.json"
    job_file.write_text(
        json.dumps({
            "jobId": "job_flux_fail",
            "topic": "Discipline",
            "script": "Stay focused every day.",
            "scenes": [{"text": "Stay focused every day."}],
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(sys, "argv", ["create_short.py", str(job_file)])
    with pytest.raises(create_short.VisualAssetGenerationError):
        create_short.main()

    assert not (tmp_path / "job_flux_fail" / "result.json").exists()


def test_quiz_upload_failure_writes_upload_failed_and_raises(tmp_path, monkeypatch):
    """Quiz Cloudinary upload failure must write status=upload_failed and raise RuntimeError."""
    import create_short

    async def mock_tts(text, voice, rate, out_mp3):
        subprocess.run(
            ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=2", "-c:a", "libmp3lame", "-b:a", "128k", str(out_mp3)],
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
        )

    monkeypatch.setattr(create_short, "_async_generate_tts_mp3", mock_tts)
    monkeypatch.setattr(create_short.cloudinary.uploader, "upload", lambda *a, **kw: (_ for _ in ()).throw(RuntimeError("Simulated Cloudinary failure")))

    job = {
        "jobId": "quiz_upload_fail_001",
        "topic": "World Geography Quiz",
        "contentType": "QUIZ_SHORTS",
        "voiceCode": "en-US-AriaNeural",
        "quizData": {
            "hook": "Quick test!",
            "questions": [
                {"question": "Capital of France?", "options": ["Paris", "Lyon", "Nice", "Marseille"], "answer": "Paris", "answerIndex": 0}
            ],
        },
    }
    out_dir = tmp_path / "quiz_up_fail"
    out_dir.mkdir(parents=True, exist_ok=True)
    with pytest.raises(RuntimeError, match="upload"):
        create_short.run_quiz_shorts(
            job, out_dir, out_dir / "a.wav", out_dir / "s.srt", out_dir / "f.mp4", out_dir / "t.png", {}
        )
    res = json.loads((out_dir / "result.json").read_text(encoding="utf-8"))
    assert res["status"] == "upload_failed"


def test_zero_placeholder_references_in_create_short_source():
    """Static source grep: _write_placeholder_image must not appear anywhere in create_short.py."""
    src = (SCRIPTS_DIR / "create_short.py").read_text(encoding="utf-8")
    assert "_write_placeholder_image" not in src


def test_motivational_missing_thumbnail_fails_closed(tmp_path, monkeypatch):
    """Missing thumbnail source image must raise VisualAssetGenerationError with no result.json staged."""
    import create_short

    # _generate_or_load_cached_image succeeds without creating out_png (simulating missing scene image)
    monkeypatch.setattr(create_short, "_generate_or_load_cached_image", lambda *a, **kw: None)
    # Minimal valid TTS + SRT stubs so execution reaches the thumbnail gate
    async def mock_tts(*a, **kw):
        return None
    monkeypatch.setattr(create_short, "_async_generate_tts_mp3", mock_tts)
    monkeypatch.setattr(create_short, "_edge_tts", lambda text, wav, **kw: subprocess.run(
        ["ffmpeg", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "1", str(wav)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True,
    ))
    monkeypatch.setattr(create_short, "_transcribe_to_srt", lambda wav, srt: srt.write_text("1\n00:00:00,000 --> 00:00:01,000\nTest\n", encoding="utf-8"))

    job_file = tmp_path / "job_missing_thumb.json"
    job_file.write_text(
        json.dumps({
            "jobId": "job_missing_thumb",
            "topic": "Focus",
            "script": "Stay focused.",
            "scenes": [{"text": "Stay focused."}],
        }),
        encoding="utf-8",
    )
    monkeypatch.setattr(sys, "argv", ["create_short.py", str(job_file)])
    with pytest.raises(create_short.VisualAssetGenerationError, match="thumbnail"):
        create_short.main()

    assert not (tmp_path / "job_missing_thumb" / "result.json").exists()
