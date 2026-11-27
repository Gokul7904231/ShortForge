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


def test_p5_fenced_dlq_callback_emits_dlq_status() -> None:
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
