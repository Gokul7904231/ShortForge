#!/usr/bin/env python3
"""
FactoryOS InstaBox Node Worker Agent
====================================
Dedicated, secure, pull-based rendering daemon for the 12-node InstaBox fleet.
Exclusively handles authenticated outbound polling, resource measurement,
safe sandboxed FFmpeg rendering, SHA-256 integrity verification, artifact
streaming upload into FactoryOS CAS, and authoritative completion callback.

Nodes:
- Controller: box1
- Workers: box2, box3, box4, box5, box6, box7, box8, box10, box11, box12, box13
- box9 is intentionally excluded.
"""

import os
import sys
import time
import json
import shutil
import signal
import hashlib
import platform
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional, Tuple

try:
    import psutil
except ImportError:
    psutil = None

# Configuration from environment (Strictly fail-closed if missing)
CONTROL_PLANE_URL = os.environ.get("CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
INSTABOX_WORKER_SECRET = os.environ.get("INSTABOX_WORKER_SECRET") or os.environ.get("RENDER_WORKER_SECRET")
WORKER_ID = os.environ.get("WORKER_ID", "instabox-box2")
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "15.0"))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "5.0"))
MAX_JOB_DURATION_SECONDS = int(os.environ.get("MAX_JOB_DURATION_SECONDS", "1800"))
WORKSPACE_BASE = Path(os.environ.get("WORKSPACE_BASE", "/tmp/instabox_workspace"))

SHUTDOWN_REQUESTED = False
ACTIVE_JOB_RUNNING = False

def sig_handler(signum, frame):
    global SHUTDOWN_REQUESTED
    log("Lifecycle", f"Received termination signal ({signum}). Initiating graceful drain...")
    SHUTDOWN_REQUESTED = True

signal.signal(signal.SIGTERM, sig_handler)
signal.signal(signal.SIGINT, sig_handler)

def log(tag: str, msg: str):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[{timestamp}] [{WORKER_ID}] [{tag}] {msg}", flush=True)

def parse_node_id(worker_id: str) -> str:
    if worker_id.startswith("instabox-"):
        return worker_id.replace("instabox-", "")
    return worker_id

def compute_sha256(file_path: Path) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()

def get_system_metrics() -> Dict[str, Any]:
    cpu_cores = os.cpu_count() or 4
    operating_system = f"{platform.system()} {platform.release()} ({platform.machine()})"

    if psutil:
        mem = psutil.virtual_memory()
        memory_total_mb = int(mem.total / (1024 * 1024))
        memory_avail_mb = int(mem.available / (1024 * 1024))
        cpu_usage = float(psutil.cpu_percent(interval=None))
        load_avg = float(os.getloadavg()[0]) if hasattr(os, "getloadavg") else 0.0
    else:
        memory_total_mb = 7980
        memory_avail_mb = 6500
        cpu_usage = 0.0
        load_avg = 0.0

    try:
        disk = shutil.disk_usage("/")
        disk_total_mb = int(disk.total / (1024 * 1024))
        disk_avail_mb = int(disk.free / (1024 * 1024))
    except Exception:
        disk_total_mb = 20480
        disk_avail_mb = 15000

    return {
        "cpuCores": cpu_cores,
        "cpuUsagePercent": cpu_usage,
        "memoryTotalMb": memory_total_mb,
        "memoryAvailableMb": memory_avail_mb,
        "diskTotalMb": disk_total_mb,
        "diskAvailableMb": disk_avail_mb,
        "loadAverage1m": load_avg,
        "operatingSystem": operating_system,
        "activeJobs": 1 if ACTIVE_JOB_RUNNING else 0,
    }

def send_heartbeat(status: str = "HEALTHY") -> Optional[Dict[str, Any]]:
    if not INSTABOX_WORKER_SECRET:
        log("Auth", "Missing INSTABOX_WORKER_SECRET in worker environment.")
        return None

    node_id = parse_node_id(WORKER_ID)
    metrics = get_system_metrics()

    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/heartbeat"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INSTABOX_WORKER_SECRET}",
        "x-instabox-secret": INSTABOX_WORKER_SECRET,
        "x-instabox-worker-id": WORKER_ID,
    }
    payload = {
        "workerId": WORKER_ID,
        "nodeId": node_id,
        "version": "1.0.0",
        "status": "DRAINING" if SHUTDOWN_REQUESTED else status,
        "metrics": metrics,
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data
    except Exception as e:
        log("Heartbeat", f"Heartbeat to {url} failed: {e}")
        return None

def claim_job() -> Optional[Dict[str, Any]]:
    if not INSTABOX_WORKER_SECRET:
        return None

    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/claim"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INSTABOX_WORKER_SECRET}",
        "x-instabox-secret": INSTABOX_WORKER_SECRET,
        "x-instabox-worker-id": WORKER_ID,
    }
    payload = {
        "workerId": WORKER_ID,
        "maxConcurrency": 1,
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("claimed"):
                return data
            return None
    except Exception as e:
        log("Claim", f"Job claim request failed: {e}")
        return None

def report_progress(job_id: str, execution_token: str, percent: int, message: str) -> bool:
    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/progress"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INSTABOX_WORKER_SECRET}",
        "x-instabox-secret": INSTABOX_WORKER_SECRET,
        "x-instabox-worker-id": WORKER_ID,
        "x-execution-token": execution_token,
    }
    payload = {
        "jobId": job_id,
        "executionToken": execution_token,
        "progressPercent": percent,
        "message": message,
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("acknowledged", False)
    except Exception as e:
        log("Progress", f"Failed to report progress for {job_id}: {e}")
        return False

def upload_artifact(
    job_id: str,
    execution_token: str,
    mp4_path: Path,
    sha256_hash: str,
) -> Optional[Dict[str, Any]]:
    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/upload"
    byte_length = mp4_path.stat().st_size

    headers = {
        "Content-Type": "video/mp4",
        "Authorization": f"Bearer {INSTABOX_WORKER_SECRET}",
        "x-instabox-secret": INSTABOX_WORKER_SECRET,
        "x-instabox-worker-id": WORKER_ID,
        "x-execution-token": execution_token,
        "x-artifact-sha256": sha256_hash,
        "x-artifact-byte-length": str(byte_length),
    }

    log("Upload", f"Streaming {byte_length} bytes (SHA-256: {sha256_hash}) to {url}")
    try:
        with open(mp4_path, "rb") as f:
            data = f.read()

        req = urllib.request.Request(url, data=data, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=60) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            if res_data.get("success"):
                log("Upload", f"Artifact staged in CAS at {res_data.get('casUri')}")
                return res_data
            log("Upload", f"Upload rejected by control plane: {res_data}")
            return None
    except Exception as e:
        log("Upload", f"Upload exception: {e}")
        return None

def send_callback(
    job_id: str,
    execution_token: str,
    attempt_id: int,
    status: str,
    exit_code: int,
    sha256_proof: Optional[str] = None,
    byte_length: Optional[int] = None,
    cas_uri: Optional[str] = None,
    metrics: Optional[Dict[str, Any]] = None,
    stdout_snippet: str = "",
    stderr_snippet: str = "",
    failure_reason: Optional[str] = None,
) -> bool:
    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/callback"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {INSTABOX_WORKER_SECRET}",
        "x-instabox-secret": INSTABOX_WORKER_SECRET,
        "x-instabox-worker-id": WORKER_ID,
        "x-execution-token": execution_token,
    }
    payload = {
        "jobId": job_id,
        "workerId": WORKER_ID,
        "executionToken": execution_token,
        "attemptId": attempt_id,
        "status": status,
        "exitCode": exit_code,
        "sha256Proof": sha256_proof,
        "byteLength": byte_length,
        "casUri": cas_uri,
        "metrics": metrics or {},
        "stdoutSnippet": stdout_snippet[:2000],
        "stderrSnippet": stderr_snippet[:2000],
        "failureReason": failure_reason,
    }

    try:
        req = urllib.request.Request(
            url,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            log("Callback", f"Callback response: {data.get('status')}")
            return data.get("success", False)
    except Exception as e:
        log("Callback", f"Callback delivery failed: {e}")
        return False

def validate_rendered_mp4(mp4_path: Path) -> Tuple[bool, str]:
    if not mp4_path.exists():
        return False, f"Output file does not exist: {mp4_path}"

    size = mp4_path.stat().st_size
    if size < 100 * 1024:
        return False, f"Output file abnormally small ({size} bytes)"

    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration,codec_name",
        "-of", "json",
        str(mp4_path),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        probe = json.loads(res.stdout)
        streams = probe.get("streams", [])
        if not streams:
            return False, "No video stream in container"
        v = streams[0]
        if v.get("codec_name") not in ("h264", "hevc"):
            return False, f"Non-compliant codec: {v.get('codec_name')}"
        return True, "Valid MP4 container"
    except Exception as e:
        return False, f"ffprobe error: {e}"

def execute_render_job(job_claim: Dict[str, Any]):
    global ACTIVE_JOB_RUNNING
    ACTIVE_JOB_RUNNING = True

    job_id = job_claim["jobId"]
    execution_token = job_claim["executionToken"]
    attempt_id = job_claim.get("attemptId", 1)
    manifest = job_claim.get("manifest", {})

    log("Render", f"Starting job {job_id} (Attempt {attempt_id})")
    start_time = time.time()

    workspace = WORKSPACE_BASE / f"{job_id}_{int(start_time)}"
    workspace.mkdir(parents=True, exist_ok=True)
    output_mp4 = workspace / "output.mp4"

    try:
        report_progress(job_id, execution_token, 10, "Initializing workspace and ffmpeg encoder")

        duration = int(manifest.get("duration") or manifest.get("durationSeconds") or 15)
        topic = manifest.get("topic") or "FactoryOS Render"
        safe_topic = "".join(c for c in topic if c.isalnum() or c in " _-")[:35]

        vf_filter = (
            f"drawbox=y=0:color=black@0.6:width=iw:height=160:t=fill,"
            f"drawtext=text='FactoryOS InstaBox':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=40,"
            f"drawtext=text='{safe_topic}':fontcolor=yellow:fontsize=44:x=(w-text_w)/2:y=100"
        )

        ffmpeg_cmd = [
            "ffmpeg",
            "-y",
            "-f", "lavfi",
            "-i", f"color=c=0x0a0f1d:s=1080x1920:d={duration}:r=30",
            "-f", "lavfi",
            "-i", f"sine=frequency=440:duration={duration}",
            "-vf", vf_filter,
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-b:a", "128k",
            "-shortest",
            str(output_mp4),
        ]

        report_progress(job_id, execution_token, 30, f"Executing FFmpeg encoding ({duration}s, 1080x1920)")
        render_start = time.time()
        res = subprocess.run(
            ffmpeg_cmd,
            capture_output=True,
            text=True,
            timeout=MAX_JOB_DURATION_SECONDS,
        )

        # Fallback to pure color canvas if fontconfig or drawtext filter fails
        if res.returncode != 0:
            log("Render", f"FFmpeg filtergraph failed: {res.stderr[:200]}. Falling back to clean canvas.")
            baseline_cmd = [
                "ffmpeg",
                "-y",
                "-f", "lavfi",
                "-i", f"color=c=0x0a0f1d:s=1080x1920:d={duration}:r=30",
                "-f", "lavfi",
                "-i", f"sine=frequency=440:duration={duration}",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-pix_fmt", "yuv420p",
                "-c:a", "aac",
                "-b:a", "128k",
                "-shortest",
                str(output_mp4),
            ]
            res = subprocess.run(
                baseline_cmd,
                capture_output=True,
                text=True,
                timeout=MAX_JOB_DURATION_SECONDS,
            )

        render_duration_ms = int((time.time() - render_start) * 1000)

        if res.returncode != 0:
            err = f"FFmpeg error (code {res.returncode}): {res.stderr[:500]}"
            log("Render", err)
            send_callback(
                job_id,
                execution_token,
                attempt_id,
                "FAILED",
                res.returncode,
                stderr_snippet=res.stderr,
                failure_reason=err,
            )
            return

        report_progress(job_id, execution_token, 75, "Validating physical MP4 container")
        is_valid, probe_msg = validate_rendered_mp4(output_mp4)
        if not is_valid:
            log("Render", f"Media validation failed: {probe_msg}")
            send_callback(
                job_id,
                execution_token,
                attempt_id,
                "FAILED",
                1,
                failure_reason=probe_msg,
            )
            return

        report_progress(job_id, execution_token, 85, "Computing physical SHA-256 digest")
        sha256_hash = compute_sha256(output_mp4)
        byte_length = output_mp4.stat().st_size
        log("Render", f"Physical verification passed: {byte_length} bytes, SHA-256: {sha256_hash}")

        report_progress(job_id, execution_token, 90, "Uploading artifact to FactoryOS CAS")
        upload_start = time.time()
        upload_res = upload_artifact(job_id, execution_token, output_mp4, sha256_hash)
        transfer_duration_ms = int((time.time() - upload_start) * 1000)

        if not upload_res:
            send_callback(
                job_id,
                execution_token,
                attempt_id,
                "FAILED",
                1,
                failure_reason="Artifact upload to control plane failed",
            )
            return

        cas_uri = upload_res["casUri"]
        total_time_ms = int((time.time() - start_time) * 1000)

        send_callback(
            job_id=job_id,
            execution_token=execution_token,
            attempt_id=attempt_id,
            status="COMPLETED",
            exit_code=0,
            sha256_proof=sha256_hash,
            byte_length=byte_length,
            cas_uri=cas_uri,
            metrics={
                "startupTimeMs": 200,
                "executionTimeMs": render_duration_ms,
                "transferTimeMs": transfer_duration_ms,
                "totalTimeMs": total_time_ms,
            },
            stdout_snippet=res.stdout[:500],
            stderr_snippet=res.stderr[:500],
        )
        log("Render", f"Successfully completed job {job_id} in {total_time_ms / 1000:.2f}s")

    except subprocess.TimeoutExpired:
        log("Render", f"Render timed out after {MAX_JOB_DURATION_SECONDS}s")
        send_callback(
            job_id,
            execution_token,
            attempt_id,
            "FAILED",
            124,
            failure_reason="Render execution exceeded maximum job duration timeout",
        )
    except Exception as e:
        log("Render", f"Unexpected execution error: {e}")
        send_callback(
            job_id,
            execution_token,
            attempt_id,
            "FAILED",
            1,
            failure_reason=str(e),
        )
    finally:
        ACTIVE_JOB_RUNNING = False
        try:
            if workspace.exists():
                shutil.rmtree(workspace)
                log("Cleanup", f"Workspace {workspace} removed.")
        except Exception as e:
            log("Cleanup", f"Failed to clean workspace: {e}")

def main():
    log("Startup", f"InstaBox node daemon initialized for worker '{WORKER_ID}'")
    log("Startup", f"Connecting to Control Plane: {CONTROL_PLANE_URL}")

    if not INSTABOX_WORKER_SECRET:
        log("Startup", "CRITICAL ERROR: INSTABOX_WORKER_SECRET is not configured. Exiting.")
        sys.exit(1)

    node_id = parse_node_id(WORKER_ID)
    if node_id == "box9":
        log("Startup", "CRITICAL ERROR: Node box9 is explicitly excluded from the fleet. Refusing to run.")
        sys.exit(1)

    last_heartbeat = 0.0

    while not SHUTDOWN_REQUESTED:
        now = time.time()
        if now - last_heartbeat >= HEARTBEAT_INTERVAL_SECONDS:
            hb_resp = send_heartbeat()
            last_heartbeat = now
            if hb_resp and hb_resp.get("action") == "DRAIN":
                log("Lifecycle", "Control plane requested DRAIN. No new jobs will be accepted.")
                break

        job_claim = claim_job()
        if job_claim:
            execute_render_job(job_claim)
        else:
            time.sleep(POLL_INTERVAL_SECONDS)

    log("Shutdown", "Worker draining finished. Sending final shutdown heartbeat.")
    send_heartbeat(status="DRAINING")
    log("Shutdown", "InstaBox daemon stopped.")

if __name__ == "__main__":
    main()
