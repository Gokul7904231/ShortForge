#!/usr/bin/env python3
"""
FactoryOS Basic Render API Service
==================================
FastAPI asynchronous microservice providing a persistent, warm rendering endpoint
for provider-neutral self-hosted video generation.
"""

import os
import re
import time
from contextlib import asynccontextmanager
from typing import Optional, Dict, Any

JOB_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")

from fastapi import FastAPI, HTTPException, Header, Depends, status, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ConfigDict

from basic_render_worker import basic_worker, RENDER_WORKER_SECRET, log

# Pydantic Schemas
class RenderJobRequest(BaseModel):
    model_config = ConfigDict(extra="allow")

    jobId: str = Field(..., description="Unique FactoryOS RenderJob identifier")
    executionToken: str = Field(..., description="Authoritative execution token issued by Control Plane")
    tier: str = Field(default="BASIC", description="Target user tier (must be BASIC)")
    topic: Optional[str] = Field(default=None, description="Video topic")
    renderProfile: Optional[str] = Field(default="FAST_QUIZ", description="Rendering profile")
    durationSeconds: Optional[int] = Field(default=15, description="Target video duration")
    contentType: Optional[str] = Field(default="QUIZ_SHORTS", description="Content type")
    quizData: Optional[Dict[str, Any]] = None
    script: Optional[Any] = None
    scenes: Optional[Any] = None
    options: Optional[Dict[str, Any]] = None

class RenderJobResponse(BaseModel):
    jobId: str
    status: str
    message: Optional[str] = None

# Lifespan context manager
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    log("API", "Initializing Basic Render API...")
    await basic_worker.start()
    yield
    # Shutdown
    log("API", "Shutting down Basic Render API...")
    await basic_worker.stop()

app = FastAPI(
    title="FactoryOS Persistent Render API",
    version="1.0.0",
    description="Persistent, warm rendering microservice for FactoryOS Basic video production.",
    lifespan=lifespan,
)

# Authentication Dependency
async def verify_internal_secret(
    authorization: Optional[str] = Header(None),
    x_worker_secret: Optional[str] = Header(None),
):
    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ")[1].strip()
    elif x_worker_secret:
        token = x_worker_secret.strip()

    if not token or token != RENDER_WORKER_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: Missing or invalid Render Worker secret.",
        )
    return token

# Endpoints
@app.get("/health")
async def health_check():
    """Liveness probe returning service and worker pool status."""
    return {
        "status": "ok",
        "service": "factoryos-persistent-render",
        "version": "1.0.0",
        "workerCount": basic_worker.concurrency,
        "uptimeSeconds": round(time.time() - basic_worker.start_time, 2),
    }

@app.get("/ready")
async def readiness_check():
    """Readiness probe checking dependencies, ffmpeg, caches, and worker loop."""
    ready, error_msg = basic_worker.is_ready()
    if not ready:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "not_ready",
                "service": "factoryos-basic-render",
                "error": error_msg,
                "queueDepth": basic_worker.queue.qsize(),
                "activeJobs": len([j for j in basic_worker.active_jobs.values() if j["status"] == "processing"]),
            },
        )
    return {
        "status": "ready",
        "service": "factoryos-basic-render",
        "queueDepth": basic_worker.queue.qsize(),
        "activeJobs": len([j for j in basic_worker.active_jobs.values() if j["status"] == "processing"]),
        "completedJobs": basic_worker.metrics["totalCompleted"],
        "failedJobs": basic_worker.metrics["totalFailed"],
        "uptimeSeconds": round(time.time() - basic_worker.start_time, 2),
    }

@app.post(
    "/api/render/jobs",
    response_model=RenderJobResponse,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(verify_internal_secret)],
)
async def submit_render_job(job: RenderJobRequest):
    """
    Submits a validated Basic render job to the warm execution queue.
    Returns immediately without blocking on render completion.
    """
    # 1. Enforce executionToken requirement
    if not job.executionToken or not job.executionToken.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Validation Error: executionToken is strictly required.",
        )

    # 2. Strict Tier Isolation: Basic service rejects non-BASIC jobs
    if job.tier.upper() != "BASIC":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Tier Isolation Error: Basic Render API only accepts tier=BASIC jobs (received: {job.tier}).",
        )

    # 3. Validate jobId format at API boundary (reject traversal payloads before enqueue)
    if not JOB_ID_RE.match(job.jobId):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid jobId format — must match ^[a-zA-Z0-9_-]{8,64}$.",
        )

    # 4. Enqueue to warm worker
    payload = job.model_dump()
    result = await basic_worker.enqueue_job(payload)
    return result

@app.get(
    "/api/render/jobs/{job_id}",
    dependencies=[Depends(verify_internal_secret)],
)
async def get_render_job_status(job_id: str):
    """Retrieves current job status, timings, and artifact URLs."""
    job = basic_worker.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found in active worker registry.",
        )
    return {
        "jobId": job["jobId"],
        "status": job["status"],
        "enqueuedAt": job["enqueuedAt"],
        "startedAt": job["startedAt"],
        "completedAt": job["completedAt"],
        "timings": job["timings"],
        "result": job["result"],
        "error": job["error"],
    }

@app.post(
    "/api/render/jobs/{job_id}/cancel",
    dependencies=[Depends(verify_internal_secret)],
)
async def cancel_render_job(job_id: str):
    """Cancels a queued render job or signals cancellation for an active render."""
    result = await basic_worker.cancel_job(job_id)
    if result["status"] == "not_found":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Job '{job_id}' not found in active worker registry.",
        )
    return result

@app.get(
    "/metrics",
    dependencies=[Depends(verify_internal_secret)],
)
async def get_metrics():
    """Operational telemetry metrics for monitoring and benchmarking."""
    durations = basic_worker.metrics["durations"]
    avg_duration = round(sum(durations) / len(durations), 2) if durations else 0.0

    return {
        "queueDepth": basic_worker.queue.qsize(),
        "activeJobs": len([j for j in basic_worker.active_jobs.values() if j["status"] == "processing"]),
        "totalEnqueued": basic_worker.metrics["totalEnqueued"],
        "totalCompleted": basic_worker.metrics["totalCompleted"],
        "totalFailed": basic_worker.metrics["totalFailed"],
        "totalCancelled": basic_worker.metrics["totalCancelled"],
        "avgDurationSeconds": avg_duration,
        "imageCacheHits": basic_worker.metrics["imageCacheHits"],
        "imageCacheMisses": basic_worker.metrics["imageCacheMisses"],
        "uptimeSeconds": round(time.time() - basic_worker.start_time, 2),
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("BASIC_RENDER_PORT", "8100"))
    host = os.environ.get("BASIC_RENDER_HOST", "127.0.0.1")
    log("Server", f"Starting Basic Render API on {host}:{port}...")
    uvicorn.run("basic_render_api:app", host=host, port=port, log_level="info")
