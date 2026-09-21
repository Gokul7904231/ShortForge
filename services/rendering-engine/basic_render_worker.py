#!/usr/bin/env python3
"""
FactoryOS Persistent Basic Render Worker
========================================
Manages an in-process warm execution queue for Basic user video rendering jobs.
Reuses existing create_short.py pipeline in an isolated ephemeral workspace,
preserves persistent prompt-hash image cache across jobs, validates outputs
with ffprobe, and performs authoritative callbacks to the FactoryOS Control Plane.
"""

import os
import re
import sys
import time
import json
import shutil
import hashlib
import asyncio
import urllib.request
import urllib.error
import subprocess
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

# Load environment variables
try:
    from dotenv import load_dotenv
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        load_dotenv(dotenv_path=env_file)
except ImportError:
    pass

BASE_DIR = Path(__file__).resolve().parent
CONTROL_PLANE_URL = os.environ.get("CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
BASIC_RENDER_API_SECRET = os.environ.get("BASIC_RENDER_API_SECRET") or os.environ.get("RENDER_WORKER_SECRET") or os.environ.get("INTERNAL_API_SECRET_KEY", "factoryos_basic_secret_default")
WORKER_CONCURRENCY = int(os.environ.get("BASIC_RENDER_CONCURRENCY", "1"))
PERSISTENT_CACHE_DIR = Path(os.environ.get("BASIC_PERSISTENT_CACHE_DIR", "/opt/factoryos/basic-cache"))
EPHEMERAL_WORKSPACE_ROOT = Path(os.environ.get("BASIC_EPHEMERAL_WORKSPACE_ROOT", "/tmp/factoryos-basic-render"))
BASIC_RENDER_TEST_MODE = os.environ.get("BASIC_RENDER_TEST_MODE", "false").lower() == "true"
JOB_ID_RE = re.compile(r"^[a-zA-Z0-9_-]{8,64}$")

def log(tag: str, msg: str):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[{timestamp}] [BasicWorker:{tag}] {msg}", flush=True)

def compute_sha256(file_path: Path) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()

class BasicRenderWorker:
    """
    Persistent in-process worker managing warm queue and job lifecycle for Basic user renders.
    """
    def __init__(self, concurrency: int = WORKER_CONCURRENCY):
        self.concurrency = concurrency
        self.queue: asyncio.Queue = asyncio.Queue()
        self.active_jobs: Dict[str, Dict[str, Any]] = {}
        self.tasks: list[asyncio.Task] = []
        self.is_running = False
        self.start_time = time.time()
        self.metrics = {
            "totalEnqueued": 0,
            "totalCompleted": 0,
            "totalFailed": 0,
            "totalCancelled": 0,
            "imageCacheHits": 0,
            "imageCacheMisses": 0,
            "durations": [],
        }

        # Initialize directories
        self._init_directories()

    def _init_directories(self):
        try:
            PERSISTENT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            (PERSISTENT_CACHE_DIR / "image-cache").mkdir(parents=True, exist_ok=True)
            (PERSISTENT_CACHE_DIR / "fonts").mkdir(parents=True, exist_ok=True)
            (PERSISTENT_CACHE_DIR / "templates").mkdir(parents=True, exist_ok=True)
        except Exception as e:
            fallback = BASE_DIR / ".basic-cache"
            fallback.mkdir(parents=True, exist_ok=True)
            log("Init", f"Warning: Could not create {PERSISTENT_CACHE_DIR} ({e}), falling back to {fallback}")

        try:
            EPHEMERAL_WORKSPACE_ROOT.mkdir(parents=True, exist_ok=True)
        except Exception as e:
            fallback_ws = BASE_DIR / "output" / "basic-workspaces"
            fallback_ws.mkdir(parents=True, exist_ok=True)
            log("Init", f"Warning: Could not create {EPHEMERAL_WORKSPACE_ROOT} ({e}), falling back to {fallback_ws}")

    async def start(self):
        """Starts worker pool background tasks."""
        if self.is_running:
            return
        self.is_running = True
        log("Lifecycle", f"Starting {self.concurrency} Basic render worker(s)...")
        for i in range(self.concurrency):
            t = asyncio.create_task(self._worker_loop(worker_index=i))
            self.tasks.append(t)

    async def stop(self):
        """Stops worker pool cleanly."""
        self.is_running = False
        for t in self.tasks:
            t.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        self.tasks.clear()
        log("Lifecycle", "Basic render worker stopped.")

    def is_ready(self) -> Tuple[bool, Optional[str]]:
        """Checks if worker environment is ready for rendering."""
        # 1. Check FFmpeg
        try:
            res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True)
            if res.returncode != 0:
                return False, "FFmpeg binary check failed."
        except FileNotFoundError:
            return False, "FFmpeg binary not found in PATH."

        # 2. Check create_short.py
        script_path = BASE_DIR / "scripts" / "create_short.py"
        if not script_path.exists():
            return False, f"Renderer script missing at {script_path}"

        # 3. Check worker running
        if not self.is_running:
            return False, "Worker loop is not running."

        return True, None

    async def enqueue_job(self, job_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Enqueues a validated Basic render job.
        Idempotent: if job is already queued or processing, returns existing state.
        """
        job_id = job_payload.get("jobId") or job_payload.get("id")
        if not job_id:
            raise ValueError("jobId is required")
        if not JOB_ID_RE.match(job_id):
            raise ValueError("Invalid jobId format — must match ^[a-zA-Z0-9_-]{8,64}$")

        # Idempotency check
        if job_id in self.active_jobs:
            existing = self.active_jobs[job_id]
            log("Idempotency", f"Job {job_id} already in state: {existing['status']}")
            return {
                "jobId": job_id,
                "status": existing["status"],
                "message": "Job already registered (idempotent submission).",
            }

        job_record = {
            "jobId": job_id,
            "status": "queued",
            "enqueuedAt": time.time(),
            "startedAt": None,
            "completedAt": None,
            "payload": job_payload,
            "result": None,
            "error": None,
            "cancelled": False,
            "timings": {},
        }

        self.active_jobs[job_id] = job_record
        self.metrics["totalEnqueued"] += 1
        await self.queue.put(job_id)
        log("Queue", f"Enqueued job={job_id} (Queue depth: {self.queue.qsize()})")

        return {
            "jobId": job_id,
            "status": "queued",
        }

    def get_job(self, job_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves in-memory job status."""
        return self.active_jobs.get(job_id)

    async def cancel_job(self, job_id: str) -> Dict[str, Any]:
        """Cancels a job if queued or signals processing cancellation."""
        job = self.active_jobs.get(job_id)
        if not job:
            return {"jobId": job_id, "status": "not_found", "cancelled": False}

        if job["status"] == "queued":
            job["status"] = "cancelled"
            job["cancelled"] = True
            self.metrics["totalCancelled"] += 1
            log("Cancel", f"Cancelled queued job={job_id}")
            return {"jobId": job_id, "status": "cancelled", "cancelled": True}

        if job["status"] == "processing":
            job["cancelled"] = True
            log("Cancel", f"Marked processing job={job_id} for cancellation")
            return {"jobId": job_id, "status": "cancelling", "cancelled": True}

        return {"jobId": job_id, "status": job["status"], "cancelled": False}

    async def _worker_loop(self, worker_index: int):
        """Warm background loop pulling jobs from the queue."""
        log("Worker", f"Warm worker #{worker_index} ready and waiting for jobs.")
        while self.is_running:
            try:
                job_id = await self.queue.get()
                job_record = self.active_jobs.get(job_id)

                if not job_record or job_record.get("cancelled") or job_record["status"] == "cancelled":
                    self.queue.task_done()
                    continue

                # Process job
                job_record["status"] = "processing"
                job_record["startedAt"] = time.time()
                queue_wait_sec = job_record["startedAt"] - job_record["enqueuedAt"]
                job_record["timings"]["queueWaitMs"] = round(queue_wait_sec * 1000, 2)

                log("Worker", f"Worker #{worker_index} claimed job={job_id} (waited {queue_wait_sec:.2f}s in queue)")

                # Execute in thread executor to keep event loop responsive
                await asyncio.to_thread(self._process_single_job_sync, job_record)

                self.queue.task_done()
            except asyncio.CancelledError:
                break
            except Exception as e:
                log("Worker", f"Unhandled error in worker loop: {e}")
                await asyncio.sleep(1)

    def _process_single_job_sync(self, job_record: Dict[str, Any]):
        """Synchronous execution of single render job in isolated workspace."""
        job_id = job_record["jobId"]
        payload = job_record["payload"]
        execution_token = payload.get("executionToken") or payload.get("token")
        tier = (payload.get("tier") or "BASIC").upper()

        start_time = time.time()

        # Strict security constraint: Basic service rejects non-BASIC jobs
        if tier != "BASIC":
            err_msg = f"Security Error: Basic render service cannot execute tier={tier} jobs."
            log("Security", err_msg)
            job_record["status"] = "failed"
            job_record["error"] = err_msg
            self.metrics["totalFailed"] += 1
            self._send_callback(job_id, "failed", execution_token, error=err_msg)
            return

        # Validate jobId before any filesystem use (defense-in-depth; API already validates on ingress)
        if not JOB_ID_RE.match(job_id):
            raise ValueError(f"Invalid jobId format: {job_id}")
        # Resolve workspace and verify it stays inside the allowed root (path-traversal guard)
        job_workspace = (EPHEMERAL_WORKSPACE_ROOT / job_id).resolve()
        allowed_root = EPHEMERAL_WORKSPACE_ROOT.resolve()
        if not str(job_workspace).startswith(str(allowed_root) + os.sep):
            raise ValueError(f"Path traversal detected for jobId: {job_id}")
        if not job_workspace.parent.exists():
            # Fallback still scoped under BASE_DIR/output and re-checked
            job_workspace = (BASE_DIR / "output" / "basic-workspaces" / job_id).resolve()
            fallback_root = (BASE_DIR / "output" / "basic-workspaces").resolve()
            if not str(job_workspace).startswith(str(fallback_root) + os.sep):
                raise ValueError(f"Path traversal in fallback for jobId: {job_id}")
        job_workspace.mkdir(parents=True, exist_ok=True)

        try:
            log("Render", f"Starting render execution for job={job_id} in {job_workspace}")

            # Write payload for create_short.py
            payload_file = job_workspace / "payload.json"
            payload_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

            # Execute create_short.py in isolated subprocess
            script_path = BASE_DIR / "scripts" / "create_short.py"
            render_start = time.time()

            env = os.environ.copy()
            env["PYTHONIOENCODING"] = "utf-8"
            env["PYTHONUTF8"] = "1"
            env["OUTPUT_DIR"] = str(job_workspace)
            env["CACHE_DIR"] = str(PERSISTENT_CACHE_DIR / "image-cache")
            env["KEEP_RENDER_ARTIFACT"] = "1"
            env["BASIC_RENDER_LOCAL_ONLY"] = "1"

            cmd = [sys.executable, "-u", str(script_path), str(payload_file)]
            proc = subprocess.run(cmd, env=env, cwd=str(BASE_DIR), capture_output=True, text=True)

            render_dur = time.time() - render_start
            job_record["timings"]["renderMs"] = round(render_dur * 1000, 2)

            if proc.returncode != 0:
                err_log = proc.stderr[-800:] if proc.stderr else proc.stdout[-800:]
                log("Render", f"create_short.py failed with code {proc.returncode}: {err_log}")
                if BASIC_RENDER_TEST_MODE:
                    log("TestMode", f"BASIC_RENDER_TEST_MODE=true active. Generating synthetic baseline for job={job_id}")
                    output_mp4 = self._render_baseline_ffmpeg(payload, job_workspace)
                else:
                    raise RuntimeError(f"Renderer create_short.py failed (exit_code={proc.returncode}): {err_log}")
            else:
                # Find output mp4 within job workspace strictly
                output_mp4 = None
                mp4_candidates = [
                    job_workspace / "output.mp4",
                    job_workspace / job_id / "final.mp4",
                    job_workspace / "final.mp4",
                ]
                for cand in mp4_candidates:
                    if cand.exists() and cand.is_file():
                        output_mp4 = cand
                        break

                if not output_mp4:
                    if BASIC_RENDER_TEST_MODE:
                        output_mp4 = self._render_baseline_ffmpeg(payload, job_workspace)
                    else:
                        raise FileNotFoundError(
                            f"create_short.py completed with code 0 but final.mp4 was not produced in {job_workspace}"
                        )

            # ffprobe validation
            val_start = time.time()
            probe_result = self._validate_mp4(output_mp4)
            job_record["timings"]["validationMs"] = round((time.time() - val_start) * 1000, 2)

            # Discover result.json within workspace
            result_json_path = None
            json_candidates = [
                job_workspace / "result.json",
                job_workspace / job_id / "result.json",
            ]
            for jcand in json_candidates:
                if jcand.exists() and jcand.is_file():
                    result_json_path = jcand
                    break

            video_url = None
            if result_json_path and result_json_path.exists():
                try:
                    res_data = json.loads(result_json_path.read_text(encoding="utf-8"))
                    video_url = res_data.get("videoUrl")
                except Exception:
                    pass

            if not video_url:
                video_url = f"https://storage.factoryos.app/renders/{job_id}.mp4"

            total_duration = time.time() - start_time
            job_record["timings"]["totalMs"] = round(total_duration * 1000, 2)
            job_record["status"] = "completed"
            job_record["completedAt"] = time.time()
            job_record["result"] = {
                "videoUrl": video_url,
                "sizeMb": probe_result["sizeMb"],
                "durationSeconds": probe_result["durationSeconds"],
                "artifactSha256": probe_result.get("sha256"),
            }

            self.metrics["totalCompleted"] += 1
            self.metrics["durations"].append(total_duration)
            if len(self.metrics["durations"]) > 100:
                self.metrics["durations"].pop(0)

            log("Success", f"Job {job_id} successfully rendered in {total_duration:.2f}s ({probe_result['sizeMb']} MB)")

            # Perform authoritative success callback ONLY when render succeeded
            self._send_callback(
                job_id=job_id,
                status="completed",
                execution_token=execution_token,
                video_url=video_url,
                size_mb=probe_result["sizeMb"],
                duration_seconds=total_duration,
                artifact_sha=probe_result.get("sha256"),
                timings=job_record["timings"],
            )

        except Exception as e:
            err_msg = f"Rendering exception: {str(e)}"
            log("Error", err_msg)
            job_record["status"] = "failed"
            job_record["error"] = err_msg
            job_record["completedAt"] = time.time()
            self.metrics["totalFailed"] += 1
            # Send authoritative failed callback (never completed)
            self._send_callback(job_id, "failed", execution_token, error=err_msg, timings=job_record.get("timings", {}))
        finally:
            # Ephemeral workspace cleanup
            if job_workspace.exists():
                try:
                    shutil.rmtree(str(job_workspace), ignore_errors=True)
                    log("Cleanup", f"Cleaned ephemeral workspace for job={job_id}")
                except Exception as ce:
                    log("Cleanup", f"Warning: Failed to clean workspace: {ce}")

    def _validate_mp4(self, mp4_path: Path) -> Dict[str, Any]:
        """Validates rendered video with ffprobe."""
        if not mp4_path.exists() or mp4_path.stat().st_size < 1024:
            raise RuntimeError(f"Rendered video is missing or too small: {mp4_path}")

        size_bytes = mp4_path.stat().st_size
        size_mb = round(size_bytes / (1024 * 1024), 2)
        sha256_hash = compute_sha256(mp4_path)

        try:
            cmd = [
                "ffprobe",
                "-v", "quiet",
                "-print_format", "json",
                "-show_format",
                "-show_streams",
                str(mp4_path)
            ]
            res = subprocess.run(cmd, capture_output=True, text=True, check=True)
            probe_data = json.loads(res.stdout)
            format_info = probe_data.get("format", {})
            duration = float(format_info.get("duration", 30.0))

            video_stream = next((s for s in probe_data.get("streams", []) if s.get("codec_type") == "video"), {})

            return {
                "sizeBytes": size_bytes,
                "sizeMb": size_mb,
                "durationSeconds": duration,
                "width": int(video_stream.get("width", 1080)),
                "height": int(video_stream.get("height", 1920)),
                "codec": video_stream.get("codec_name", "h264"),
                "sha256": sha256_hash,
            }
        except Exception as e:
            log("Validation", f"ffprobe validation failed: {e}")
            raise RuntimeError(f"Physical media validation failed via ffprobe: {e}")

    def _render_baseline_ffmpeg(self, job: dict, workspace: Path) -> Path:
        """Fast fallback baseline generator if create_short.py encounters an issue."""
        output_mp4 = workspace / "output.mp4"
        raw_topic = job.get("topic") or "FactoryOS Basic Short"
        # Sanitize topic for ffmpeg drawtext filter injection (only the topic is externally supplied).
        # Whitelist alnum + space/punctuation and escape drawtext metachars.
        safe_topic = re.sub(r"[^a-zA-Z0-9 ,._-]", "", raw_topic)[:35]
        safe_topic = safe_topic.replace("\\", "\\\\").replace("'", "\\'").replace(":", "\\:")
        duration = int(job.get("durationSeconds") or 15)

        vf_filter = (
            f"drawbox=y=0:color=black@0.6:width=iw:height=160:t=fill,"
            f"drawtext=text='FactoryOS Basic Render':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=40,"
            f"drawtext=text='{safe_topic}':fontcolor=yellow:fontsize=44:x=(w-text_w)/2:y=100"
        )

        cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", f"color=c=0x0a0f1d:s=1080x1920:d={duration}:r=30",
            "-f", "lavfi",
            "-i", f"sine=frequency=440:duration={duration}",
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-preset", "ultrafast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            str(output_mp4)
        ]

        log("FFmpeg", f"Rendering fast baseline video ({duration}s, 1080x1920)")
        subprocess.run(cmd, check=True, capture_output=True)
        return output_mp4

    def _send_callback(
        self,
        job_id: str,
        status: str,
        execution_token: Optional[str] = None,
        video_url: Optional[str] = None,
        size_mb: Optional[float] = None,
        duration_seconds: Optional[float] = None,
        artifact_sha: Optional[str] = None,
        error: Optional[str] = None,
        timings: Optional[dict] = None,
    ):
        """Sends authoritative callback to FactoryOS Control Plane."""
        callback_url = f"{CONTROL_PLANE_URL}/api/rendering/callback"
        payload = {
            "jobId": job_id,
            "status": status,
            "executionToken": execution_token,
            "videoUrl": video_url,
            "videoSizeMb": size_mb,
            "renderDurationSeconds": duration_seconds,
            "artifactSha256": artifact_sha,
            "deliveryProvider": "basic_fastapi",
            "error": error,
            "telemetry": timings or {},
        }

        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            callback_url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {BASIC_RENDER_API_SECRET}",
                "x-execution-token": execution_token or "",
            },
            method="POST",
        )

        for attempt in range(1, 4):
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    if 200 <= resp.status < 300:
                        log("Callback", f"Callback succeeded for job={job_id} (status={status})")
                        return
            except Exception as e:
                log("Callback", f"Callback attempt #{attempt} failed for job={job_id}: {e}")
                time.sleep(1)

# Global singleton worker instance
basic_worker = BasicRenderWorker()
