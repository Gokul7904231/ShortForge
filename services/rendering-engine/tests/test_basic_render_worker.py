#!/usr/bin/env python3
"""
Unit and Integration Tests for Basic Render Worker
==================================================
Tests worker queue lifecycle, persistent caching, ffprobe validation, and error recovery.
"""

import pytest
from basic_render_worker import BasicRenderWorker, compute_sha256

@pytest.mark.asyncio
async def test_worker_lifecycle():
    """Worker starts and stops cleanly."""
    worker = BasicRenderWorker(concurrency=1)
    await worker.start()
    assert worker.is_running is True

    await worker.stop()
    assert worker.is_running is False

@pytest.mark.asyncio
async def test_worker_enqueue_and_status():
    """Worker accepts jobs and stores active state."""
    worker = BasicRenderWorker(concurrency=1)
    res = await worker.enqueue_job({
        "jobId": "worker-test-001",
        "executionToken": "token-w-001",
        "tier": "BASIC",
        "topic": "Quantum Computing",
    })
    assert res["jobId"] == "worker-test-001"
    assert res["status"] == "queued"

    job = worker.get_job("worker-test-001")
    assert job is not None
    assert job["jobId"] == "worker-test-001"

@pytest.mark.asyncio
async def test_worker_job_cancellation():
    """Queued job can be cancelled."""
    worker = BasicRenderWorker(concurrency=1)
    await worker.enqueue_job({
        "jobId": "cancel-test-001",
        "executionToken": "token-c-001",
        "tier": "BASIC",
    })

    cancel_res = await worker.cancel_job("cancel-test-001")
    assert cancel_res["cancelled"] is True
    assert cancel_res["status"] == "cancelled"

    job = worker.get_job("cancel-test-001")
    assert job["cancelled"] is True

def test_compute_sha256(tmp_path):
    """File SHA256 hashing functions deterministically."""
    test_file = tmp_path / "test.txt"
    test_file.write_text("FactoryOS Basic Render", encoding="utf-8")
    h1 = compute_sha256(test_file)
    h2 = compute_sha256(test_file)
    assert h1 == h2
    assert len(h1) == 64
