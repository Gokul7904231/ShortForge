#!/usr/bin/env python3
"""
Unit and Integration Tests for Basic Render FastAPI Service
===========================================================
Tests authentication, validation, health/readiness, metrics, and job submission.
"""

import pytest
from fastapi.testclient import TestClient
from basic_render_api import app, RENDER_WORKER_SECRET

client = TestClient(app)

def test_health_endpoint():
    """Health check liveness probe returns 200 and expected metadata."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["service"] == "factoryos-basic-render"
    assert "workerCount" in data
    assert "uptimeSeconds" in data

def test_ready_endpoint():
    """Readiness probe returns status."""
    response = client.get("/ready")
    assert response.status_code in [200, 503]
    data = response.json()
    assert "status" in data
    assert "queueDepth" in data

def test_auth_rejection_missing_secret():
    """Unauthenticated requests are rejected with 401."""
    response = client.post("/api/render/jobs", json={
        "jobId": "test-job-001",
        "executionToken": "token-001",
        "tier": "BASIC"
    })
    assert response.status_code == 401

def test_auth_rejection_invalid_secret():
    """Requests with wrong secret are rejected with 401."""
    response = client.post(
        "/api/render/jobs",
        json={"jobId": "test-job-001", "executionToken": "token-001", "tier": "BASIC"},
        headers={"Authorization": "Bearer wrong_secret_key"}
    )
    assert response.status_code == 401

def test_tier_isolation_rejects_admin_jobs():
    """Basic FastAPI service strictly rejects tier=ADMIN jobs with 403."""
    response = client.post(
        "/api/render/jobs",
        json={"jobId": "admin-job-001", "executionToken": "token-001", "tier": "ADMIN"},
        headers={"Authorization": f"Bearer {RENDER_WORKER_SECRET}"}
    )
    assert response.status_code == 403
    assert "Tier Isolation Error" in response.json()["detail"]

def test_missing_execution_token_rejected():
    """Job submission without executionToken is rejected with 400."""
    response = client.post(
        "/api/render/jobs",
        json={"jobId": "test-job-002", "executionToken": "", "tier": "BASIC"},
        headers={"Authorization": f"Bearer {RENDER_WORKER_SECRET}"}
    )
    assert response.status_code == 400

def test_valid_basic_job_submission_accepted():
    """Valid Basic job submission is accepted with 202."""
    response = client.post(
        "/api/render/jobs",
        json={
            "jobId": "basic-test-job-100",
            "executionToken": "valid-token-100",
            "tier": "BASIC",
            "topic": "Python Performance Optimization",
            "renderProfile": "FAST_QUIZ"
        },
        headers={"Authorization": f"Bearer {RENDER_WORKER_SECRET}"}
    )
    assert response.status_code == 202
    data = response.json()
    assert data["jobId"] == "basic-test-job-100"
    assert data["status"] in ["queued", "processing"]

def test_duplicate_job_submission_is_idempotent():
    """Submitting the same jobId returns existing state without duplication."""
    # First submission
    client.post(
        "/api/render/jobs",
        json={"jobId": "idempotent-job-01", "executionToken": "token-idem", "tier": "BASIC"},
        headers={"Authorization": f"Bearer {RENDER_WORKER_SECRET}"}
    )

    # Second submission
    response = client.post(
        "/api/render/jobs",
        json={"jobId": "idempotent-job-01", "executionToken": "token-idem", "tier": "BASIC"},
        headers={"Authorization": f"Bearer {RENDER_WORKER_SECRET}"}
    )
    assert response.status_code == 202
    data = response.json()
    assert data["jobId"] == "idempotent-job-01"
    assert "already registered" in data.get("message", "") or data["status"] in ["queued", "processing"]

def test_metrics_endpoint():
    """Metrics endpoint reports operational stats."""
    response = client.get(
        "/metrics",
        headers={"Authorization": f"Bearer {RENDER_WORKER_SECRET}"}
    )
    assert response.status_code == 200
    data = response.json()
    assert "totalEnqueued" in data
    assert "activeJobs" in data
    assert "uptimeSeconds" in data
