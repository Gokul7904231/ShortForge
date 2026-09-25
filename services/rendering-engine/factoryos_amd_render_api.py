#!/usr/bin/env python3
"""
FactoryOS AMD Render Worker API

Runs on the AMD Linux render host and exposes a narrow authenticated HTTP
control/data plane for Floor 06.

The worker executes the canonical packages/factoryos-render JSON adapter,
stores the resulting physical MP4 locally, and exposes the artifact only
after SHA-256 validation.

Required environment:
  AMD_WORKER_SECRET
Optional:
  AMD_WORKER_ID
  AMD_WORKER_HOST
  AMD_WORKER_PORT
  AMD_RENDER_ARTIFACT_DIR
  AMD_RENDER_INPUT_DIR
  AMD_RENDER_CONCURRENCY
  AMD_RENDER_JOB_TIMEOUT_SECONDS
  AMD_GPU_MODEL
  AMD_GPU_VRAM_MB
  AMD_VIDEO_ENCODER              (default: h264_vaapi)
  AMD_VAAPI_DEVICE               (default: /dev/dri/renderD128)
  AMD_REQUIRE_GPU_ENCODE         (default: true)
  FACTORYOS_REPO_ROOT
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from copy import deepcopy
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field


JOB_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
WORKER_ID = os.environ.get("AMD_WORKER_ID", "amd-worker-01")
WORKER_HOST = os.environ.get("AMD_WORKER_HOST", "0.0.0.0")
WORKER_PORT = int(os.environ.get("AMD_WORKER_PORT", "8101"))
WORKER_SECRET = os.environ.get("AMD_WORKER_SECRET")
MAX_CONCURRENCY = max(1, int(os.environ.get("AMD_RENDER_CONCURRENCY", "1")))
JOB_TIMEOUT_SECONDS = max(
    60,
    int(os.environ.get("AMD_RENDER_JOB_TIMEOUT_SECONDS", "3600")),
)
VIDEO_ENCODER = os.environ.get("AMD_VIDEO_ENCODER", "h264_vaapi")
VAAPI_DEVICE = os.environ.get("AMD_VAAPI_DEVICE", "/dev/dri/renderD128")
REQUIRE_GPU_ENCODE = (
    os.environ.get("AMD_REQUIRE_GPU_ENCODE", "true").strip().lower()
    in {"1", "true", "yes"}
)

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = Path(
    os.environ.get(
        "FACTORYOS_REPO_ROOT",
        str(BASE_DIR.parent.parent),
    )
).resolve()
RENDER_SRC = REPO_ROOT / "packages" / "factoryos-render" / "src"
ARTIFACT_ROOT = Path(
    os.environ.get(
        "AMD_RENDER_ARTIFACT_DIR",
        "/opt/factoryos/amd-render-artifacts",
    )
).resolve()
INPUT_ROOT = Path(
    os.environ.get(
        "AMD_RENDER_INPUT_DIR",
        "/opt/factoryos/amd-render-inputs",
    )
).resolve()
MAX_INPUT_BYTES = (
    max(1, int(os.environ.get("AMD_MAX_INPUT_FILE_MB", "250")))
    * 1024
    * 1024
)

ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
INPUT_ROOT.mkdir(parents=True, exist_ok=True)


class RenderSubmission(BaseModel):
    jobId: str = Field(..., min_length=8, max_length=64)
    executionId: str = Field(..., min_length=1, max_length=128)
    localRenderIntent: dict[str, Any]
    compilerPlan: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None


class JobRecord:
    def __init__(self, submission: RenderSubmission) -> None:
        self.job_id = submission.jobId
        self.execution_id = submission.executionId
        self.submission = submission
        self.status = "queued"
        self.error: str | None = None
        self.result: dict[str, Any] | None = None
        self.created_at = time.time()
        self.started_at: float | None = None
        self.completed_at: float | None = None


jobs: dict[str, JobRecord] = {}
queue: asyncio.Queue[str] = asyncio.Queue()
worker_tasks: list[asyncio.Task[Any]] = []
semaphore: asyncio.Semaphore | None = None


app = FastAPI(
    title="FactoryOS AMD Render Worker",
    version="1.0.0",
)


def require_secret(authorization: str | None) -> None:
    if not WORKER_SECRET:
        raise HTTPException(
            status_code=503,
            detail="AMD_WORKER_SECRET is not configured on the worker.",
        )

    token = None
    if authorization and authorization.startswith("Bearer "):
        token = authorization[7:].strip()

    if not token or token != WORKER_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized.",
        )


def run_command(
    args: list[str],
    *,
    timeout: int = 5,
) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        return proc.returncode, proc.stdout, proc.stderr
    except Exception as exc:
        return 1, "", str(exc)


def detect_amd_gpu() -> tuple[bool, str]:
    code, stdout, stderr = run_command(["rocminfo"], timeout=5)
    combined = (stdout + "\n" + stderr).lower()

    if code == 0 and "gfx" in combined and "agent" in combined:
        return True, "AMD GPU detected through rocminfo."

    code, stdout, stderr = run_command(
        ["amd-smi", "list"],
        timeout=5,
    )
    combined = (stdout + "\n" + stderr).lower()

    if code == 0 and "gpu" in combined:
        return True, "AMD GPU detected through amd-smi."

    return False, "No AMD GPU evidence from rocminfo/amd-smi."


def ffmpeg_has_encoder(encoder: str) -> bool:
    code, stdout, _stderr = run_command(
        ["ffmpeg", "-hide_banner", "-encoders"],
        timeout=5,
    )
    return code == 0 and encoder in stdout


def renderer_importable() -> bool:
    env = os.environ.copy()
    env["PYTHONPATH"] = (
        str(RENDER_SRC)
        if not env.get("PYTHONPATH")
        else str(RENDER_SRC) + os.pathsep + env["PYTHONPATH"]
    )

    code, _stdout, _stderr = run_command(
        [sys.executable, "-c", "import factoryos_render"],
        timeout=10,
    )
    return code == 0


def worker_capabilities() -> dict[str, Any]:
    gpu_ready, gpu_reason = detect_amd_gpu()
    ffmpeg_available = shutil.which("ffmpeg") is not None
    renderer_ready = renderer_importable()
    encoder_ready = ffmpeg_has_encoder(VIDEO_ENCODER)
    vaapi_device_ready = (
        VIDEO_ENCODER != "h264_vaapi" or Path(VAAPI_DEVICE).exists()
    )

    gpu_model = os.environ.get(
        "AMD_GPU_MODEL",
        "AMD GPU (detected)" if gpu_ready else "AMD GPU (not detected)",
    )

    try:
        vram_mb = int(os.environ.get("AMD_GPU_VRAM_MB", "0"))
    except ValueError:
        vram_mb = 0

    return {
        "ready": bool(
            gpu_ready
            and ffmpeg_available
            and renderer_ready
            and (
                not REQUIRE_GPU_ENCODE
                or (encoder_ready and vaapi_device_ready)
            )
        ),
        "workerId": WORKER_ID,
        "gpuVendor": "AMD",
        "gpuModel": gpu_model,
        "vramMb": vram_mb,
        "gpuCount": 1 if gpu_ready else 0,
        "cpuCores": os.cpu_count() or 1,
        "memoryMb": 0,
        "rocmVersion": os.environ.get("ROCM_VERSION"),
        "ffmpegAvailable": ffmpeg_available,
        "videoEncoder": VIDEO_ENCODER,
        "maxConcurrency": MAX_CONCURRENCY,
        "isEphemeral": os.environ.get("AMD_WORKER_EPHEMERAL", "false").lower()
        in {"1", "true", "yes"},
        "checks": {
            "gpu": gpu_reason,
            "rendererImportable": renderer_ready,
            "encoderAvailable": encoder_ready,
            "vaapiDeviceExists": vaapi_device_ready,
        },
    }


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def safe_job_path(root: Path, job_id: str) -> Path:
    target = (root / job_id).resolve()
    if not str(target).startswith(str(root) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid job path.")
    target.mkdir(parents=True, exist_ok=True)
    return target


def ensure_local_output(intent: dict[str, Any], output_path: Path) -> dict[str, Any]:
    prepared = deepcopy(intent)
    prepared["output_path"] = str(output_path)
    prepared["project_id"] = str(prepared.get("project_id") or output_path.stem)

    output = prepared.setdefault("output", {})
    # Contract codec stays logical H.264; the backend selects the physical encoder via env.
    output["video_codec"] = "h264"
    output.setdefault("audio_codec", "aac")
    return prepared


async def execute_job(record: JobRecord) -> None:
    global semaphore

    record.status = "processing"
    record.started_at = time.time()

    workspace = safe_job_path(ARTIFACT_ROOT, record.job_id)
    output_path = workspace / "final.mp4"
    intent = ensure_local_output(
        record.submission.localRenderIntent,
        output_path,
    )

    request_payload = {
        "protocolVersion": "1.0",
        "requestId": "amd_" + record.execution_id,
        "command": "render",
        "renderIntent": intent,
        "runId": record.execution_id,
    }

    env = os.environ.copy()
    python_path = str(RENDER_SRC)
    if env.get("PYTHONPATH"):
        python_path += os.pathsep + env["PYTHONPATH"]
    env["PYTHONPATH"] = python_path
    env["FACTORYOS_VIDEO_ENCODER"] = VIDEO_ENCODER
    env["FACTORYOS_VAAPI_DEVICE"] = VAAPI_DEVICE

    if VIDEO_ENCODER == "h264_vaapi":
        env["FACTORYOS_VAAPI_DEVICE"] = VAAPI_DEVICE

    started = time.time()

    try:
        assert semaphore is not None
        async with semaphore:
            proc = await asyncio.to_thread(
                subprocess.run,
                [sys.executable, "-m", "factoryos_render.cli", "--adapter"],
                input=json.dumps(request_payload),
                capture_output=True,
                text=True,
                timeout=JOB_TIMEOUT_SECONDS,
                cwd=str(REPO_ROOT),
                env=env,
                check=False,
            )

        if proc.returncode != 0:
            raise RuntimeError(
                "factoryos-render exited with code "
                + str(proc.returncode)
                + ": "
                + (proc.stderr[-3000:] or proc.stdout[-3000:])
            )

        stdout = proc.stdout.strip()
        if not stdout:
            raise RuntimeError(
                "factoryos-render produced no JSON response. stderr="
                + proc.stderr[-3000:]
            )

        try:
            response = json.loads(stdout)
        except json.JSONDecodeError as exc:
            raise RuntimeError(
                "factoryos-render returned invalid JSON: "
                + stdout[-3000:]
            ) from exc

        if response.get("status") == "FAILED":
            raise RuntimeError(
                "factoryos-render failed: "
                + json.dumps(response.get("error") or response)
            )

        receipt = response.get("receipt") or {}
        validation = receipt.get("validation") or {}
        reported_output = Path(
            str(receipt.get("output_path") or output_path)
        ).resolve()

        final_path = output_path
        if reported_output.exists() and reported_output != output_path:
            reported_output = reported_output.resolve()
            if not str(reported_output).startswith(str(workspace) + os.sep):
                raise RuntimeError(
                    "Renderer attempted to write artifact outside AMD artifact root."
                )
            shutil.copy2(reported_output, output_path)

        if not final_path.exists():
            raise RuntimeError(
                "Renderer completed without physical MP4 at "
                + str(final_path)
            )

        artifact_sha = sha256_file(final_path)
        byte_length = final_path.stat().st_size

        if byte_length < 1024:
            raise RuntimeError("AMD render artifact is smaller than 1KB.")

        if validation and validation.get("is_valid") is False:
            raise RuntimeError(
                "Renderer validation failed: "
                + json.dumps(validation.get("errors") or [])
            )

        record.result = {
            "artifactSha256": artifact_sha,
            "byteLength": byte_length,
            "videoUrl": "/api/factoryos/render/jobs/"
            + record.job_id
            + "/artifact",
            "durationSeconds": receipt.get("duration_seconds"),
            "width": receipt.get("width"),
            "height": receipt.get("height"),
            "fps": receipt.get("fps"),
            "codec": validation.get("codec") or "h264",
            "encoder": VIDEO_ENCODER,
            "renderTimeMs": receipt.get(
                "render_time_ms",
                int((time.time() - started) * 1000),
            ),
        }
        record.status = "completed"
    except asyncio.CancelledError:
        record.status = "cancelled"
        raise
    except Exception as exc:
        record.status = "failed"
        record.error = str(exc)
    finally:
        record.completed_at = time.time()
        input_dir = (INPUT_ROOT / record.job_id).resolve()
        if str(input_dir).startswith(str(INPUT_ROOT) + os.sep):
            shutil.rmtree(input_dir, ignore_errors=True)


async def worker_loop() -> None:
    while True:
        job_id = await queue.get()
        try:
            record = jobs.get(job_id)
            if record is not None:
                await execute_job(record)
        finally:
            queue.task_done()


@app.on_event("startup")
async def startup() -> None:
    global semaphore
    if not WORKER_SECRET:
        raise RuntimeError("AMD_WORKER_SECRET must be configured.")
    semaphore = asyncio.Semaphore(MAX_CONCURRENCY)
    for _ in range(MAX_CONCURRENCY):
        worker_tasks.append(asyncio.create_task(worker_loop()))


@app.on_event("shutdown")
async def shutdown() -> None:
    for task in worker_tasks:
        task.cancel()
    await asyncio.gather(*worker_tasks, return_exceptions=True)
    worker_tasks.clear()


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "factoryos-amd-render-worker",
        "workerId": WORKER_ID,
        "queuedJobs": queue.qsize(),
        "knownJobs": len(jobs),
    }


@app.get("/ready")
async def ready() -> JSONResponse:
    caps = worker_capabilities()
    if not caps["ready"]:
        return JSONResponse(status_code=503, content={
            "status": "not_ready",
            "workerId": WORKER_ID,
            "reason": caps["checks"],
        })
    return JSONResponse(status_code=200, content={
        "status": "ready",
        "workerId": WORKER_ID,
        "checks": caps["checks"],
    })


@app.get("/capabilities")
async def capabilities(authorization: str | None = Header(None)) -> dict[str, Any]:
    require_secret(authorization)
    return worker_capabilities()


@app.post("/api/factoryos/render/inputs")
async def upload_input(
    request: Request,
    authorization: str | None = Header(None),
    x_job_id: str | None = Header(None),
    x_filename: str | None = Header(None),
) -> dict[str, Any]:
    require_secret(authorization)

    job_id = x_job_id or ""
    if not JOB_ID_RE.match(job_id):
        raise HTTPException(status_code=400, detail="Invalid jobId.")

    filename = Path(x_filename or "input.bin").name
    if not filename or filename in {".", ".."}:
        raise HTTPException(status_code=400, detail="Invalid filename.")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="Empty input.")

    if len(data) > MAX_INPUT_BYTES:
        raise HTTPException(status_code=413, detail="Input exceeds configured size limit.")

    job_dir = safe_job_path(INPUT_ROOT, job_id)
    target = (job_dir / filename).resolve()
    if not str(target).startswith(str(job_dir) + os.sep):
        raise HTTPException(status_code=400, detail="Invalid input path.")

    target.write_bytes(data)
    return {
        "remotePath": str(target),
        "sha256": hashlib.sha256(data).hexdigest(),
        "byteLength": len(data),
    }


@app.post("/api/factoryos/render/jobs", status_code=202)
async def submit_job(
    submission: RenderSubmission,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    require_secret(authorization)

    if not JOB_ID_RE.match(submission.jobId):
        raise HTTPException(
            status_code=400,
            detail="jobId must match ^[A-Za-z0-9_-]{8,64}$.",
        )

    if not isinstance(submission.localRenderIntent.get("scenes"), list):
        raise HTTPException(
            status_code=400,
            detail="localRenderIntent.scenes is required.",
        )

    existing = jobs.get(submission.jobId)
    if existing is not None:
        return {
            "jobId": existing.job_id,
            "status": existing.status,
            "idempotent": True,
        }

    record = JobRecord(submission)
    jobs[submission.jobId] = record
    await queue.put(submission.jobId)

    return {
        "jobId": submission.jobId,
        "status": record.status,
        "idempotent": False,
    }


@app.get("/api/factoryos/render/jobs/{job_id}")
async def job_status(
    job_id: str,
    authorization: str | None = Header(None),
) -> dict[str, Any]:
    require_secret(authorization)

    record = jobs.get(job_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Job not found.")

    return {
        "jobId": record.job_id,
        "executionId": record.execution_id,
        "status": record.status,
        "error": record.error,
        "result": record.result,
        "createdAt": record.created_at,
        "startedAt": record.started_at,
        "completedAt": record.completed_at,
    }


@app.get("/api/factoryos/render/jobs/{job_id}/artifact")
async def artifact(
    job_id: str,
    authorization: str | None = Header(None),
) -> FileResponse:
    require_secret(authorization)

    record = jobs.get(job_id)
    if record is None or record.status != "completed" or not record.result:
        raise HTTPException(status_code=404, detail="Completed artifact not available.")

    workspace = safe_job_path(ARTIFACT_ROOT, job_id)
    target = (workspace / "final.mp4").resolve()
    if not target.exists():
        raise HTTPException(status_code=404, detail="Physical artifact missing.")

    actual_sha = sha256_file(target)
    if actual_sha != record.result.get("artifactSha256"):
        raise HTTPException(
            status_code=409,
            detail="Artifact digest changed after completion.",
        )

    response = FileResponse(
        path=str(target),
        media_type="video/mp4",
        filename=job_id + ".mp4",
    )
    response.headers["X-Artifact-SHA256"] = actual_sha
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "factoryos_amd_render_api:app",
        host=WORKER_HOST,
        port=WORKER_PORT,
        log_level="info",
    )
