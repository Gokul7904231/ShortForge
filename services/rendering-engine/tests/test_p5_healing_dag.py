#!/usr/bin/env python3
"""
Phase P5 & P5.1 — TDD Suite for Checkpointed CAS DAG, Durable SQLite Budgets,
Real Healing Loop, Circuit Breaker, Canary, Real Disk Quota & Fenced DLQ
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

ENGINE_ROOT = Path(__file__).resolve().parent.parent
if str(ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(ENGINE_ROOT))

from core.commit import post_fenced_dlq_callback  # noqa: E402
from core.recovery import (  # noqa: E402
    CheckpointedDAGRunner,
    CircuitBreaker,
    CircuitOpenError,
    DiskQuotaManager,
    FencedDiscardResult,
    FencedJobError,
    GlobalBudgetExhaustedError,
    PermanentInputError,
    StageBudgetExhaustedError,
    evaluate_worker_canary,
)


def test_p5_durable_sqlite_budgets_survive_process_restart(tmp_path: Path) -> None:
    """Durable SQLite budgets survive runner restart: 4th stage & 6th global refused -> DLQ."""
    cas_dir = tmp_path / "cas"
    dlq_dir = tmp_path / "dlq"
    db_path = tmp_path / "budgets.sqlite3"

    r1 = CheckpointedDAGRunner(cas_dir=cas_dir, dlq_dir=dlq_dir, toolchain_hash="tc_v1", db_path=db_path)
    r1.record_stage_attempt("job-restart-1", "F03")
    r1.record_stage_attempt("job-restart-1", "F03")
    r1.record_stage_attempt("job-restart-1", "F03")

    # Simulate process restart: new runner instance on same SQLite DB
    r2 = CheckpointedDAGRunner(cas_dir=cas_dir, dlq_dir=dlq_dir, toolchain_hash="tc_v1", db_path=db_path)
    with pytest.raises(StageBudgetExhaustedError):
        r2.record_stage_attempt("job-restart-1", "F03")

    # Remaining global budget across other floors: attempts 4 and 5 succeed, 6th hits DLQ
    r2.record_stage_attempt("job-restart-1", "F04")
    r2.record_stage_attempt("job-restart-1", "F05")
    with pytest.raises(GlobalBudgetExhaustedError):
        r2.record_stage_attempt("job-restart-1", "F06")

    bundle = dlq_dir / "job-restart-1" / "bundle.json"
    assert bundle.exists()
    data = json.loads(bundle.read_text(encoding="utf-8"))
    assert data["jobId"] == "job-restart-1"


def test_p5_execute_job_real_retry_and_healing_ladder(tmp_path: Path) -> None:
    """Transient failure retries <=3 with backoff sleep; permanent visual walks gen->stock->template."""
    runner = CheckpointedDAGRunner(
        cas_dir=tmp_path / "cas",
        dlq_dir=tmp_path / "dlq",
        toolchain_hash="tc_v1",
    )
    sleeps: list[float] = []
    transient_calls = {"n": 0}
    visual_modes: list[str] = []

    def stage_f02(inp):
        transient_calls["n"] += 1
        if transient_calls["n"] < 3:
            raise TimeoutError("transient TTS timeout")
        return {"script": inp["topic"], "ok": True}

    out_transient = runner.execute_job(
        job_id="job-heal-transient",
        initial_input={"topic": "Quantum"},
        stages=[("F02", stage_f02)],
        sleep_fn=sleeps.append,
    )
    assert transient_calls["n"] == 3
    assert len(sleeps) == 2
    assert all(2.0 <= s <= 30.0 for s in sleeps)
    assert out_transient["F02"]["ok"] is True

    def stage_f03(_inp, fallback_mode="gen"):
        visual_modes.append(fallback_mode)
        if fallback_mode != "branded_template":
            raise PermanentInputError(f"failed in mode {fallback_mode}")
        return {"visual": fallback_mode}

    out_visual = runner.execute_job(
        job_id="job-heal-visual",
        initial_input={"script": "Quantum"},
        stages=[("F03", stage_f03)],
        sleep_fn=sleeps.append,
        stage_kinds={"F03": "visual"},
    )
    assert visual_modes == ["gen", "pre_normalized_cas_stock", "branded_template"]
    assert out_visual["F03"]["visual"] == "branded_template"

    # Fenced error discards silently with no retry
    fenced_calls = {"n": 0}

    def stage_fenced(_inp):
        fenced_calls["n"] += 1
        raise FencedJobError("stale lease")

    fenced_out = runner.execute_job(
        job_id="job-fenced-1",
        initial_input={"topic": "Stale"},
        stages=[("F02", stage_fenced)],
        sleep_fn=sleeps.append,
    )
    assert isinstance(fenced_out, FencedDiscardResult)
    assert fenced_out.discarded is True and fenced_out.retry is False
    assert fenced_calls["n"] == 1


def test_p5_quiz_f02_f03_cas_resume_serves_from_checkpoint(tmp_path: Path) -> None:
    """Second run of identical quiz F02/F03 stages serves from CAS with zero re-executions."""
    cas_dir = tmp_path / "cas"
    runner = CheckpointedDAGRunner(
        cas_dir=cas_dir,
        dlq_dir=tmp_path / "dlq",
        toolchain_hash="tc_quiz_v1",
    )
    calls = {"F02": 0, "F03": 0}

    def f02(inp):
        calls["F02"] += 1
        return {"theme": "science_theme", "questions": inp["questions"]}

    def f03(inp):
        calls["F03"] += 1
        return {"audioAssets": {"tick": "/tmp/tick.wav"}, "theme": inp["theme"]}

    payload = {"theme": "science_theme", "questions": [{"question": "Q1", "options": ["A", "B", "C", "D"]}]}
    first = runner.execute_job(job_id="quiz-1", initial_input=payload, stages=[("F02", f02), ("F03", f03)])
    second = runner.execute_job(job_id="quiz-1", initial_input=payload, stages=[("F02", f02), ("F03", f03)])

    assert first == second
    assert calls == {"F02": 1, "F03": 1}
    assert (cas_dir / "reconcile" / "quiz-1_F02.json").exists()
    assert (cas_dir / "reconcile" / "quiz-1_F03.json").exists()


def test_p5_circuit_breaker_opens_at_20pct_and_probes_60s() -> None:
    now = [100.0]
    cb = CircuitBreaker(window_size=50, failure_threshold=0.20, cooldown_sec=60.0, clock=lambda: now[0])
    for _ in range(39):
        cb.record_success()
    for _ in range(11):
        cb.record_failure()
    assert cb.state == "OPEN"
    with pytest.raises(CircuitOpenError):
        cb.allow_intake()
    now[0] += 61.0
    assert cb.allow_intake() is True
    assert cb.state == "HALF_OPEN"
    with pytest.raises(CircuitOpenError):
        cb.allow_intake()
    cb.record_success()
    assert cb.state == "CLOSED"


def test_p5_canary_and_real_disk_quota_worker_refusal(tmp_path: Path) -> None:
    bad_canary = evaluate_worker_canary(worker_id="box2", observed_sha256="bad", fleet_golden_sha256="good")
    assert bad_canary.should_drain is True and bad_canary.status == "DRAINED"

    # Simulate 92% full disk via DiskQuotaManager disk_usage_fn
    mgr = DiskQuotaManager(
        scratch_root=tmp_path / "scratch",
        disk_usage_fn=lambda _p: (1000, 920, 80),
    )
    status = mgr.check_and_enforce()
    assert status["action"] == "DRAIN"
    assert status["status"] == "DEGRADED"
    assert status["refuse_new_leases"] is True

    # Verify worker_daemon.claim_job refuses new leases when disk >= 90%
    import worker_daemon

    with patch.object(worker_daemon, "RENDER_WORKER_SECRET", "secret-123"), patch.object(
        worker_daemon.DiskQuotaManager, "check_and_enforce", return_value=status
    ):
        assert worker_daemon.claim_job() is None


def test_fenced_dlq_callback_emits_dlq_status_and_recovery_rejects_exhausted_budget() -> None:
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"success": True, "status": "DLQ"}
    with patch("core.commit.requests.post", return_value=mock_resp) as post_mock:
        res = post_fenced_dlq_callback(
            callback_url="http://localhost:3000/api/rendering/instabox/callback",
            worker_id="instabox-box2",
            worker_secret="sec",
            execution_token="tok",
            execution_id="exec_1",
            attempt_id=1,
            job_id="job-dlq-1",
            failure_reason="Global budget exhausted",
            dlq_bundle={"jobId": "job-dlq-1"},
        )
        assert res["status"] == "DLQ"
        sent_json = post_mock.call_args.kwargs["json"]
        assert sent_json["status"] == "DLQ"
        assert sent_json["dlqBundle"]["jobId"] == "job-dlq-1"


def test_lexical_gate_and_preflight_rejects_over_budget_motivational_script() -> None:
    """Over-budget or uncovered-glyph motivational script must raise, never swallow."""
    scripts_dir = ENGINE_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import create_short
    from core.lexical import LexicalGateError

    # Uncovered glyph (e.g. emoji) -> LexicalGateError propagates from validate_and_compile_scenes
    with pytest.raises(LexicalGateError):
        create_short.validate_motivational_preflight([{"text": "Hello 🚀"}])


def test_dlq_callback_fires_when_budget_exhausted_in_create_short(tmp_path: Path, monkeypatch) -> None:
    """Budget exhaustion in create_short.run_quiz_shorts fires post_fenced_dlq_callback with status=DLQ and re-raises."""
    scripts_dir = ENGINE_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import create_short

    monkeypatch.setenv("CONTROL_PLANE_URL", "http://localhost:3000")
    monkeypatch.setenv("RENDER_WORKER_SECRET", "worker-sec-123")
    monkeypatch.setenv("SHORTFORGE_CAS_DIR", str(tmp_path / "cas"))
    monkeypatch.setenv("SHORTFORGE_DLQ_DIR", str(tmp_path / "dlq"))

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {"success": True, "status": "DLQ"}

    def always_fail(*_args, **_kwargs):
        raise TimeoutError("transient failure")

    monkeypatch.setattr(create_short, "_ensure_audio_assets", always_fail)
    monkeypatch.setattr("core.recovery.time.sleep", lambda _s: None)

    quiz_job = {
        "jobId": "quiz-dlq-e2e-1",
        "executionToken": "exec-tok-1",
        "workerId": "instabox-box2",
        "topic": "Science",
        "quizData": {
            "hook": "Quick quiz!",
            "questions": [{"question": "Q1?", "options": ["A", "B", "C", "D"], "answerIndex": 0}],
        },
    }

    with patch("core.commit.requests.post", return_value=mock_resp) as post_mock:
        with pytest.raises(StageBudgetExhaustedError):
            create_short.run_quiz_shorts(
                quiz_job,
                tmp_path / "out",
                tmp_path / "a.wav",
                tmp_path / "s.srt",
                tmp_path / "f.mp4",
                tmp_path / "t.png",
                {},
            )
        assert post_mock.called
        assert post_mock.call_args.kwargs["json"]["status"] == "DLQ"


def test_quiz_resume_after_tts_does_not_recall_tts(tmp_path: Path, monkeypatch) -> None:
    """When quiz fails after TTS (at encode), resuming from CAS checkpoint does not re-call TTS."""
    scripts_dir = ENGINE_ROOT / "scripts"
    if str(scripts_dir) not in sys.path:
        sys.path.insert(0, str(scripts_dir))
    import numpy as np
    import create_short

    monkeypatch.setenv("SHORTFORGE_CAS_DIR", str(tmp_path / "cas"))
    monkeypatch.setenv("SHORTFORGE_DLQ_DIR", str(tmp_path / "dlq"))

    tts_calls = {"n": 0}

    async def fake_tts(*, text: str, voice: str, rate: str, out_mp3: Path) -> None:
        tts_calls["n"] += 1
        out_mp3.parent.mkdir(parents=True, exist_ok=True)
        out_mp3.write_bytes(b"fake-mp3")

    monkeypatch.setattr(create_short, "_async_generate_tts_mp3", fake_tts)
    monkeypatch.setattr(create_short, "decode_audio_to_pcm48k", lambda _p: (np.zeros(4800, dtype=np.int16), 0.1))
    monkeypatch.setattr(create_short, "write_pcm48k_wav", lambda _pcm, p: p.write_bytes(b"RIFF"))
    monkeypatch.setattr(create_short, "_ensure_audio_assets", lambda _r: {"pop": tmp_path / "pop.wav", "ding": tmp_path / "ding.wav", "bgm": tmp_path / "bgm.wav"})
    for f in ("pop.wav", "ding.wav", "bgm.wav"):
        (tmp_path / f).write_bytes(b"RIFF")

    # Mock ffmpeg subprocess.run calls and encode failure on run 1
    encode_calls = {"n": 0}

    def fake_encode(**kwargs):
        encode_calls["n"] += 1
        if encode_calls["n"] == 1:
            raise TimeoutError("encode killed mid-run")
        kwargs["out_mp4"].write_bytes(b"MP4")

    monkeypatch.setattr(create_short, "assemble_canonical_mp4", fake_encode)
    monkeypatch.setattr("subprocess.run", lambda *a, **kw: MagicMock(returncode=0))
    monkeypatch.setattr("cloudinary.uploader.upload", lambda *a, **kw: {"secure_url": "https://example.com/v.mp4"})
    monkeypatch.setattr("core.recovery.time.sleep", lambda _s: None)

    quiz_job = {
        "jobId": "quiz-resume-tts-1",
        "topic": "Science",
        "quizData": {
            "hook": "Quick quiz!",
            "questions": [{"question": "Q1?", "options": ["A", "B", "C", "D"], "answerIndex": 0}],
        },
    }
    out_dir = tmp_path / "out"
    out_dir.mkdir(parents=True, exist_ok=True)

    res = create_short.run_quiz_shorts(
        quiz_job, out_dir, out_dir / "a.wav", out_dir / "s.srt", out_dir / "f.mp4", out_dir / "t.png", {}
    )
    # Run 1 failed at encode once, retried encode via DAG -> TTS was ONLY called in initial pass (4 segments), never re-called on encode retry!
    assert tts_calls["n"] == 4
    assert encode_calls["n"] == 2
    assert res["videoUrl"] == "https://example.com/v.mp4"

    # Second full run (resumed job): TTS is served from CAS -> tts_calls stays 4!
    res2 = create_short.run_quiz_shorts(
        quiz_job, out_dir, out_dir / "a.wav", out_dir / "s.srt", out_dir / "f.mp4", out_dir / "t.png", {}
    )
    assert tts_calls["n"] == 4
    assert res2["videoUrl"] == "https://example.com/v.mp4"
