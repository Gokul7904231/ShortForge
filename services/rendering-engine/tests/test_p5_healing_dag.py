#!/usr/bin/env python3
"""
TDD Suite for Phase P5 — Checkpointed DAG & Bounded Healing
===========================================================
"""

import json
import sys
from pathlib import Path

import pytest

ENGINE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ENGINE_DIR))


def test_cas_memoization_resumes_at_failed_floor(tmp_path):
    """Kill/fail at voice stage -> retry resumes at voice; script & images served from CAS."""
    from core.recovery import CheckpointedDAGRunner

    cas_dir = tmp_path / "cas"
    dlq_dir = tmp_path / "dlq"
    runner = CheckpointedDAGRunner(cas_dir=cas_dir, dlq_dir=dlq_dir, toolchain_hash="tc-p5")

    calls = {"script": 0, "images": 0, "voice": 0}
    voice_should_fail = {"flag": True}

    def run_script(inp):
        calls["script"] += 1
        return {"script": "Hello world"}

    def run_images(inp):
        calls["images"] += 1
        return {"images": ["img1.png"]}

    def run_voice(inp):
        calls["voice"] += 1
        if voice_should_fail["flag"]:
            raise RuntimeError("transient: TTS timeout")
        return {"voice": "voice.wav"}

    stages = [("F02_script", run_script), ("F03_images", run_images), ("F04_voice", run_voice)]

    with pytest.raises(RuntimeError, match="transient"):
        runner.execute_job(job_id="job-resume-1", initial_input={"topic": "AI"}, stages=stages)

    assert calls == {"script": 1, "images": 1, "voice": 1}

    voice_should_fail["flag"] = False
    out = runner.execute_job(job_id="job-resume-1", initial_input={"topic": "AI"}, stages=stages)
    assert out["F04_voice"]["voice"] == "voice.wav"
    # Script and images were memoized in CAS and NOT re-executed
    assert calls == {"script": 1, "images": 1, "voice": 2}


def test_stage_retry_budget_max_3_and_global_budget_max_5(tmp_path):
    """4th retry at a stage refused; 6th global attempt across floors refused -> DLQ forensic bundle."""
    from core.recovery import CheckpointedDAGRunner, GlobalBudgetExhaustedError, StageBudgetExhaustedError

    runner = CheckpointedDAGRunner(cas_dir=tmp_path / "cas", dlq_dir=tmp_path / "dlq", toolchain_hash="tc-p5")

    # Stage max 3 attempts (1 initial + 2 retries = 3; 4th attempt refused)
    for _ in range(3):
        runner.record_stage_attempt("job-stage-cap", "F04_voice")
    with pytest.raises(StageBudgetExhaustedError):
        runner.record_stage_attempt("job-stage-cap", "F04_voice")

    # Global max 5 attempts across ALL floors (6th attempt refused -> DLQ)
    job_id = "job-global-cap"
    runner.record_stage_attempt(job_id, "F02_script")
    runner.record_stage_attempt(job_id, "F02_script")
    runner.record_stage_attempt(job_id, "F03_images")
    runner.record_stage_attempt(job_id, "F03_images")
    runner.record_stage_attempt(job_id, "F04_voice")
    with pytest.raises(GlobalBudgetExhaustedError):
        runner.record_stage_attempt(
            job_id,
            "F05_compose",
            forensic_context={
                "ir": {"timebase": 120000},
                "probes": [{"stream": "video"}],
                "inputHashes": {"F02": "abc"},
                "logs": ["global attempt limit reached"],
            },
        )

    bundle_path = tmp_path / "dlq" / job_id / "bundle.json"
    assert bundle_path.exists()
    bundle = json.loads(bundle_path.read_text(encoding="utf-8"))
    assert bundle["jobId"] == job_id
    assert bundle["ir"] == {"timebase": 120000}
    assert len(bundle["probes"]) == 1
    assert bundle["inputHashes"] == {"F02": "abc"}
    assert "logs" in bundle


def test_healing_ladder_transient_permanent_fenced():
    """Transient jittered backoff [2s, 30s]; permanent fallback ladders; fenced silent discard."""
    from core.recovery import (
        FencedDiscardResult,
        HealingLadder,
        compute_jittered_backoff_sec,
    )

    # Bounded backoff: base 2s, cap 30s
    for attempt in range(1, 8):
        delay = compute_jittered_backoff_sec(attempt, rng_unit=0.5)
        assert 2.0 <= delay <= 30.0

    ladder = HealingLadder()
    assert ladder.next_visual_fallback("gen") == "pre_normalized_cas_stock"
    assert ladder.next_visual_fallback("pre_normalized_cas_stock") == "branded_template"
    assert ladder.next_visual_fallback("branded_template") is None

    assert ladder.next_voice_fallback("primary") == "secondary"
    assert ladder.next_voice_fallback("secondary") is None

    res = ladder.handle_classification("fenced", detail="stale attemptId")
    assert isinstance(res, FencedDiscardResult)
    assert res.discarded is True
    assert res.retry is False


def test_circuit_breaker_opens_at_20_percent_and_pauses_intake():
    """Window=50, opens at >20% stage failure, pauses intake, half-open probe 1/60s."""
    from core.recovery import CircuitBreaker, CircuitOpenError

    now = [1000.0]
    cb = CircuitBreaker(window_size=50, failure_threshold=0.20, cooldown_sec=60.0, clock=lambda: now[0])

    # 39 successes + 11 failures = 11/50 = 22% > 20% -> OPEN
    for _ in range(39):
        cb.record_success()
    for _ in range(11):
        cb.record_failure()

    assert cb.state == "OPEN"
    with pytest.raises(CircuitOpenError):
        cb.allow_intake()

    # After 60s -> HALF_OPEN allows 1 probe, blocks 2nd concurrent probe
    now[0] += 61.0
    assert cb.allow_intake() is True
    assert cb.state == "HALF_OPEN"
    with pytest.raises(CircuitOpenError):
        cb.allow_intake()

    # Probe succeeds -> CLOSED
    cb.record_success()
    assert cb.state == "CLOSED"


def test_golden_canary_mismatch_drains_worker(tmp_path):
    """Canary hash mismatch drains worker before it ships defects."""
    from core.recovery import evaluate_worker_canary

    good = evaluate_worker_canary(
        worker_id="instabox-box2",
        observed_sha256="a" * 64,
        fleet_golden_sha256="a" * 64,
    )
    assert good.healthy is True
    assert good.should_drain is False

    bad = evaluate_worker_canary(
        worker_id="instabox-box2",
        observed_sha256="b" * 64,
        fleet_golden_sha256="a" * 64,
    )
    assert bad.healthy is False
    assert bad.should_drain is True
    assert bad.status == "DRAINED"


def test_disk_quota_2gb_and_watermarks_80_90(tmp_path):
    """Per-job quota 2GB, watermarks 80% GC / 90% drain, /scratch/{job}/{epoch}/ layout."""
    from core.recovery import DiskQuotaManager

    mgr = DiskQuotaManager(scratch_root=tmp_path / "scratch")
    epoch_dir = mgr.get_job_scratch_dir("job-disk-1", epoch=2)
    assert epoch_dir == tmp_path / "scratch" / "job-disk-1" / "2"
    assert mgr.per_job_quota_bytes == 2 * 1024 * 1024 * 1024

    assert mgr.evaluate_disk_watermark(0.75) == "OK"
    assert mgr.evaluate_disk_watermark(0.82) == "GC"
    assert mgr.evaluate_disk_watermark(0.91) == "DRAIN"
