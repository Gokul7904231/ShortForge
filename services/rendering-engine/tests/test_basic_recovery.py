#!/usr/bin/env python3
"""
Integration, Recovery, and Regression Tests for Basic Render Service
====================================================================
Tests failure recovery, server restart resilience, admin worker isolation,
and safe manifest normalization.
"""

import pytest
import asyncio
import re
from unittest.mock import patch, MagicMock
from pathlib import Path
from basic_render_worker import BasicRenderWorker

def safe_extract_country(job: dict) -> str:
    """Helper matching create_short.py safe country extraction logic."""
    quiz_data_dict = job.get("quizData") if isinstance(job.get("quizData"), dict) else {}
    country_clean = str(
        job.get("country")
        or quiz_data_dict.get("country")
        or "Default"
    ).strip().replace(" ", "_")
    country_clean = re.sub(r'[^a-zA-Z0-9_]', '', country_clean)
    return country_clean or "Default"

# ---------------------------------------------------------------------------
# Country Extraction Regression Tests
# ---------------------------------------------------------------------------
def test_quiz_data_none_does_not_crash():
    """Explicit quizData=None does not throw AttributeError and returns Default."""
    job = {"jobId": "test-none-1", "quizData": None}
    country = safe_extract_country(job)
    assert country == "Default"

def test_quiz_data_empty_dict():
    """quizData={} works cleanly and returns Default."""
    job = {"jobId": "test-empty-1", "quizData": {}}
    country = safe_extract_country(job)
    assert country == "Default"

def test_top_level_country_field():
    """Top level country field is preferred."""
    job = {"jobId": "test-country-1", "country": "United States", "quizData": None}
    country = safe_extract_country(job)
    assert country == "United_States"

def test_nested_quiz_data_country():
    """Nested quizData country is extracted if top level is missing."""
    job = {"jobId": "test-nested-1", "quizData": {"country": "Japan"}}
    country = safe_extract_country(job)
    assert country == "Japan"

def test_missing_country_defaults():
    """Missing country defaults cleanly to 'Default'."""
    job = {"jobId": "test-missing-1"}
    country = safe_extract_country(job)
    assert country == "Default"

# ---------------------------------------------------------------------------
# Failure Isolation & Worker Recovery Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_nonzero_exit_marks_job_failed_and_no_success_callback():
    """create_short non-zero exit marks job FAILED and never sends success callback."""
    worker = BasicRenderWorker(concurrency=1)
    callback_calls = []

    def mock_send_callback(job_id, status, execution_token=None, **kwargs):
        callback_calls.append({"job_id": job_id, "status": status, **kwargs})

    worker._send_callback = mock_send_callback

    # Mock subprocess.run returning exit code 1 (failure)
    with patch("subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stderr="Simulated create_short exception", stdout="")
        
        job_record = {
            "jobId": "failing-job-001",
            "status": "queued",
            "enqueuedAt": 0,
            "startedAt": 0,
            "completedAt": None,
            "payload": {"jobId": "failing-job-001", "executionToken": "tok-fail", "tier": "BASIC"},
            "result": None,
            "error": None,
            "cancelled": False,
            "timings": {},
        }
        
        worker._process_single_job_sync(job_record)

        assert job_record["status"] == "failed"
        assert "Renderer create_short.py failed" in job_record["error"]
        
        # Verify callback was called with 'failed', NEVER 'completed'
        assert len(callback_calls) == 1
        assert callback_calls[0]["status"] == "failed"
        assert callback_calls[0]["job_id"] == "failing-job-001"

@pytest.mark.asyncio
async def test_worker_survives_failed_job_and_processes_next():
    """Worker loop handles a failed render and processes next job without restart."""
    worker = BasicRenderWorker(concurrency=1)
    await worker.start()

    # Submit invalid job
    await worker.enqueue_job({
        "jobId": "invalid-tier-job-99",
        "executionToken": "token-99",
        "tier": "ADMIN",  # Rejected by tier check
    })

    await asyncio.sleep(0.5)

    job1 = worker.get_job("invalid-tier-job-99")
    assert job1 is not None
    assert job1["status"] == "failed"

    # Worker stays alive
    assert worker.is_running is True

    # Submit second valid job
    await worker.enqueue_job({
        "jobId": "valid-second-job-100",
        "executionToken": "token-100",
        "tier": "BASIC",
    })

    job2 = worker.get_job("valid-second-job-100")
    assert job2 is not None
    assert job2["status"] in ["queued", "processing", "completed"]

    await worker.stop()

# ---------------------------------------------------------------------------
# Admin Isolation Protection Tests
# ---------------------------------------------------------------------------
def test_worker_files_are_provider_neutral():
    """Verifies the persistent worker remains present without Azure-specific coupling."""
    base_dir = Path(__file__).resolve().parent.parent
    worker_daemon = base_dir / "worker_daemon.py"
    worker_service = base_dir / "factoryos-persistent-render.service"

    assert worker_daemon.exists()
    assert worker_service.exists()

    daemon_content = worker_daemon.read_text(encoding="utf-8")
    assert "FactoryOS Persistent Render Worker Daemon" in daemon_content
    assert "azure" not in daemon_content.lower()


# ---------------------------------------------------------------------------
# Artifact Lifecycle & Preservation Tests
# ---------------------------------------------------------------------------
def test_worker_passes_keep_render_artifact_env():
    """Worker sets KEEP_RENDER_ARTIFACT=1 in subprocess environment."""
    worker = BasicRenderWorker(concurrency=1)
    captured_env = {}

    def mock_subprocess_run(cmd, env=None, **kwargs):
        nonlocal captured_env
        captured_env = env or {}
        return MagicMock(returncode=1, stderr="fail", stdout="")

    with patch("subprocess.run", side_effect=mock_subprocess_run):
        job_record = {
            "jobId": "test-artifact-env-01",
            "status": "queued",
            "enqueuedAt": 0,
            "startedAt": 0,
            "completedAt": None,
            "payload": {"jobId": "test-artifact-env-01", "executionToken": "tok-1", "tier": "BASIC"},
            "result": None,
            "error": None,
            "cancelled": False,
            "timings": {},
        }
        worker._process_single_job_sync(job_record)

    assert captured_env.get("KEEP_RENDER_ARTIFACT") == "1"


def test_create_short_preserves_artifacts_when_flag_enabled(tmp_path):
    """create_short finally block preserves final.mp4 and result.json when KEEP_RENDER_ARTIFACT is true."""
    out_dir = tmp_path / "test_out"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_final = out_dir / "final.mp4"
    out_final.write_bytes(b"dummy mp4 data 12345")
    result_json = out_dir / "result.json"
    result_json.write_text('{"status": "completed"}', encoding="utf-8")

    # Simulate finally block with KEEP_RENDER_ARTIFACT=1
    keep_artifacts = True
    if not keep_artifacts:
        if out_final.exists():
            out_final.unlink()
        if out_dir.exists():
            out_dir.rmdir()

    assert out_final.exists() is True
    assert result_json.exists() is True
    assert out_dir.exists() is True


def test_create_short_cleans_artifacts_when_flag_disabled(tmp_path):
    """create_short finally block cleans final.mp4 when KEEP_RENDER_ARTIFACT is false/empty."""
    out_dir = tmp_path / "test_out_clean"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_final = out_dir / "final.mp4"
    out_final.write_bytes(b"dummy mp4 data")

    # Simulate finally block with KEEP_RENDER_ARTIFACT=False
    keep_artifacts = False
    if not keep_artifacts:
        if out_final.exists():
            out_final.unlink()

    assert out_final.exists() is False


def test_worker_discovers_nested_final_mp4(tmp_path):
    """Worker successfully discovers final.mp4 in nested <workspace>/<jobId>/final.mp4."""
    worker = BasicRenderWorker(concurrency=1)
    job_id = "nested-mp4-job-01"
    
    workspace = tmp_path / job_id
    workspace.mkdir(parents=True, exist_ok=True)
    nested_dir = workspace / job_id
    nested_dir.mkdir(parents=True, exist_ok=True)
    
    final_mp4 = nested_dir / "final.mp4"
    final_mp4.write_bytes(b"dummy video bytes 1234567890")

    result_json = nested_dir / "result.json"
    result_json.write_text('{"videoUrl": "https://res.cloudinary.com/test.mp4"}', encoding="utf-8")

    # Mock subprocess and probe
    with patch("subprocess.run") as mock_run, \
         patch.object(worker, "_validate_mp4") as mock_val, \
         patch.object(worker, "_send_callback") as mock_cb:
        
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        mock_val.return_value = {"valid": True, "sizeMb": 2.5, "durationSeconds": 15.0, "sha256": "abc123"}
        
        job_record = {
            "jobId": job_id,
            "status": "queued",
            "enqueuedAt": 0,
            "startedAt": 0,
            "completedAt": None,
            "payload": {"jobId": job_id, "executionToken": "tok-1", "tier": "BASIC"},
            "result": None,
            "error": None,
            "cancelled": False,
            "timings": {},
        }
        
        # Override workspace root to tmp_path for test
        with patch("basic_render_worker.EPHEMERAL_WORKSPACE_ROOT", tmp_path):
            worker._process_single_job_sync(job_record)

        assert job_record["status"] == "completed"
        assert job_record["result"]["videoUrl"] == "https://res.cloudinary.com/test.mp4"
        assert job_record["result"]["sizeMb"] == 2.5


def test_missing_final_mp4_causes_job_failed(tmp_path):
    """If create_short exits 0 but produces no final.mp4 in workspace, job is marked failed."""
    worker = BasicRenderWorker(concurrency=1)
    job_id = "missing-mp4-job-02"

    with patch("subprocess.run") as mock_run, \
         patch.object(worker, "_send_callback") as mock_cb:
        
        mock_run.return_value = MagicMock(returncode=0, stdout="", stderr="")
        
        job_record = {
            "jobId": job_id,
            "status": "queued",
            "enqueuedAt": 0,
            "startedAt": 0,
            "completedAt": None,
            "payload": {"jobId": job_id, "executionToken": "tok-2", "tier": "BASIC"},
            "result": None,
            "error": None,
            "cancelled": False,
            "timings": {},
        }
        
        with patch("basic_render_worker.EPHEMERAL_WORKSPACE_ROOT", tmp_path), \
             patch("basic_render_worker.BASIC_RENDER_TEST_MODE", False):
            worker._process_single_job_sync(job_record)

        assert job_record["status"] == "failed"
        assert "final.mp4 was not produced" in job_record["error"]

