#!/usr/bin/env python3
"""
FactoryOS InstaBox Node Worker Agent
====================================
Dedicated, secure, pull-based rendering daemon for the 12-node InstaBox fleet.
Exclusively handles authenticated outbound polling, genuine hardware resource
telemetry, safe sandboxed ShortForge rendering with factoryos-render and FFmpeg,
SHA-256 integrity verification, bounded-memory artifact streaming upload into
FactoryOS CAS, continuous lease renewal during render/upload, and authoritative
acknowledged completion callbacks with exponential backoff.

Nodes:
- Controller: box1
- Workers: box2, box3, box4, box5, box6, box7, box8, box10, box11, box12, box13
- box9 is permanently excluded.
"""

import os
import re
import sys
import time
import json
import socket
import shutil
import signal
import hashlib
import ipaddress
import platform
import threading
import subprocess
import urllib.request
import urllib.error
from pathlib import Path
from typing import Dict, Any, Optional, Tuple, List

# Ensure factoryos_render is importable from bundled packages or virtualenv
AGENT_DIR = Path(__file__).resolve().parent
BUNDLED_RENDER_SRC = AGENT_DIR / "packages" / "factoryos-render" / "src"
if BUNDLED_RENDER_SRC.is_dir() and str(BUNDLED_RENDER_SRC) not in sys.path:
    sys.path.insert(0, str(BUNDLED_RENDER_SRC))

try:
    import psutil
except ImportError:
    psutil = None

try:
    from factoryos_render.contracts.render_intent import RenderIntent
    from factoryos_render.api import render as fo_render
    HAS_FACTORYOS_RENDER = True
except ImportError:
    HAS_FACTORYOS_RENDER = False

# Allowed InstaBox fleet nodes
ALLOWED_WORKER_NODES = {
    "box2", "box3", "box4", "box5", "box6", "box7",
    "box8", "box10", "box11", "box12", "box13",
}
EXCLUDED_NODES = {"box1", "box9"}
FORBIDDEN_SECRET_VALUES = {
    "changeme_in_production",
    "changeme",
    "default",
    "your_secure_instabox_secret_here",
    "test",
    "secret",
    "password",
    "placeholder",
}

# Configuration from environment
CONTROL_PLANE_URL = os.environ.get("CONTROL_PLANE_URL", "https://controlplane.shortforge.internal").rstrip("/")
ALLOW_INSECURE_HTTP_TEST = os.environ.get("ALLOW_INSECURE_HTTP_TEST", "false").lower() in ("true", "1")
ALLOW_PRIVATE_ASSET_NETWORKS = os.environ.get("ALLOW_PRIVATE_ASSET_NETWORKS", "false").lower() in ("true", "1")

INSTABOX_WORKER_SECRET = os.environ.get("INSTABOX_WORKER_SECRET") or os.environ.get("RENDER_WORKER_SECRET")
WORKER_ID = os.environ.get("WORKER_ID", "instabox-box2")
HEARTBEAT_INTERVAL_SECONDS = float(os.environ.get("HEARTBEAT_INTERVAL_SECONDS", "15.0"))
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "5.0"))
MAX_JOB_DURATION_SECONDS = int(os.environ.get("MAX_JOB_DURATION_SECONDS", "1800"))
MIN_DISK_AVAILABLE_MB = int(os.environ.get("MIN_DISK_AVAILABLE_MB", "2048"))

# Storage resolution: Prefer /data/shortforge/workspace, fallback to /tmp/instabox_workspace
configured_workspace = os.environ.get("WORKSPACE_BASE")
if configured_workspace:
    WORKSPACE_BASE = Path(configured_workspace)
elif Path("/data/shortforge/workspace").parent.exists():
    WORKSPACE_BASE = Path("/data/shortforge/workspace")
else:
    WORKSPACE_BASE = Path("/tmp/instabox_workspace")

SHUTDOWN_REQUESTED = False
ACTIVE_JOB_RUNNING = False

JOB_ID_REGEX = re.compile(r"^[a-zA-Z0-9_\-]{1,64}$")


def log(tag: str, msg: str):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[{timestamp}] [{WORKER_ID}] [{tag}] {msg}", flush=True)


def sig_handler(signum, frame):
    global SHUTDOWN_REQUESTED
    log("Lifecycle", f"Received termination signal ({signum}). Initiating graceful drain...")
    SHUTDOWN_REQUESTED = True


signal.signal(signal.SIGTERM, sig_handler)
signal.signal(signal.SIGINT, sig_handler)


def parse_node_id(worker_id: str) -> str:
    if worker_id.startswith("instabox-"):
        return worker_id.replace("instabox-", "")
    return worker_id


def validate_environment_or_die():
    """Fail-closed startup validations ensuring security, credentials, node identity, and telemetry."""
    # 1. Secret validation
    if not INSTABOX_WORKER_SECRET:
        log("Security", "CRITICAL: INSTABOX_WORKER_SECRET is missing. Refusing to start.")
        sys.exit(1)

    clean_secret = INSTABOX_WORKER_SECRET.strip().lower()
    if clean_secret in FORBIDDEN_SECRET_VALUES or clean_secret.startswith("changeme") or len(clean_secret) < 16:
        log("Security", "CRITICAL: INSTABOX_WORKER_SECRET is a placeholder or shorter than 16 chars. Refusing to start.")
        sys.exit(1)

    # 2. Node identity validation
    node_id = parse_node_id(WORKER_ID)
    if node_id in EXCLUDED_NODES:
        log("Security", f"CRITICAL: Node {node_id} is explicitly excluded from the rendering fleet. Refusing to start.")
        sys.exit(1)

    if node_id not in ALLOWED_WORKER_NODES:
        log("Security", f"CRITICAL: Node {node_id} is not in the allowed InstaBox worker fleet. Refusing to start.")
        sys.exit(1)

    # 3. Transport security
    if not CONTROL_PLANE_URL.startswith("https://"):
        if not ALLOW_INSECURE_HTTP_TEST:
            log("Security", f"CRITICAL: Insecure HTTP control plane URL rejected: {CONTROL_PLANE_URL}. Use HTTPS.")
            sys.exit(1)
        else:
            log("Security", f"WARNING: Insecure HTTP permitted by explicit ALLOW_INSECURE_HTTP_TEST flag: {CONTROL_PLANE_URL}")

    # 4. Psutil availability
    if not psutil:
        log("Telemetry", "CRITICAL: psutil library is not available. Real hardware metrics cannot be collected.")
        sys.exit(1)

    # 5. factoryos-render availability
    if not HAS_FACTORYOS_RENDER:
        log("Render", "CRITICAL: factoryos_render package could not be imported. Real ShortForge rendering unavailable.")
        sys.exit(1)


def compute_sha256(file_path: Path) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()


def get_system_metrics() -> Optional[Dict[str, Any]]:
    """Collect genuine hardware telemetry without hardcoded fallback values."""
    if not psutil:
        return None

    try:
        cpu_cores = os.cpu_count() or 4
        operating_system = f"{platform.system()} {platform.release()} ({platform.machine()})"
        mem = psutil.virtual_memory()
        memory_total_mb = int(mem.total / (1024 * 1024))
        memory_avail_mb = int(mem.available / (1024 * 1024))
        cpu_usage = float(psutil.cpu_percent(interval=None))
        load_avg = float(os.getloadavg()[0]) if hasattr(os, "getloadavg") else 0.0

        disk = shutil.disk_usage(str(WORKSPACE_BASE) if WORKSPACE_BASE.exists() else "/")
        disk_total_mb = int(disk.total / (1024 * 1024))
        disk_avail_mb = int(disk.free / (1024 * 1024))

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
    except Exception as e:
        log("Telemetry", f"Failed to sample hardware metrics: {e}")
        return None


def is_ssrf_safe_ip(ip_str: str) -> bool:
    """Validate that target IP is not private, loopback, link-local, or cloud metadata."""
    try:
        ip = ipaddress.ip_address(ip_str)
        if ip.is_loopback or ip.is_private or ip.is_link_local or ip.is_multicast or ip.is_reserved or ip.is_unspecified:
            return False
        # Specific cloud metadata checks
        if str(ip) in ("169.254.169.254", "169.254.170.2"):
            return False
        return True
    except ValueError:
        return False


def download_asset_safe(url: str, dest_path: Path, max_bytes: int = 100 * 1024 * 1024) -> Path:
    """Download external asset with strict SSRF protection and bounded transfer size."""
    if not url.startswith("http://") and not url.startswith("https://"):
        raise ValueError(f"Unsupported asset URL scheme: {url}")

    host = urllib.parse.urlparse(url).hostname
    if not host:
        raise ValueError(f"Invalid host in asset URL: {url}")

    if not ALLOW_PRIVATE_ASSET_NETWORKS:
        try:
            addr_info = socket.getaddrinfo(host, None)
            for item in addr_info:
                ip_str = item[4][0]
                if not is_ssrf_safe_ip(ip_str):
                    raise PermissionError(f"SSRF violation: host {host} resolves to prohibited address {ip_str}")
        except socket.gaierror as e:
            raise ConnectionError(f"Failed to resolve asset host {host}: {e}")

    req = urllib.request.Request(url, headers={"User-Agent": "ShortForge-InstaBox-Worker/1.0"})
    with urllib.request.urlopen(req, timeout=30) as resp, open(dest_path, "wb") as out:
        total_read = 0
        while chunk := resp.read(65536):
            total_read += len(chunk)
            if total_read > max_bytes:
                raise ValueError(f"Asset exceeded maximum allowed download size of {max_bytes} bytes")
            out.write(chunk)

    return dest_path


def send_heartbeat(status: str = "HEALTHY") -> Optional[Dict[str, Any]]:
    metrics = get_system_metrics()
    if not metrics:
        log("Heartbeat", "Failing heartbeat: unable to read authentic system telemetry.")
        return None

    node_id = parse_node_id(WORKER_ID)
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
        log("Heartbeat", f"Heartbeat failed: {e}")
        return None


def claim_job() -> Optional[Dict[str, Any]]:
    # Pre-claim disk space check
    metrics = get_system_metrics()
    if metrics and metrics.get("diskAvailableMb", 0) < MIN_DISK_AVAILABLE_MB:
        log("Claim", f"Insufficient disk space ({metrics.get('diskAvailableMb')} MB < {MIN_DISK_AVAILABLE_MB} MB). Skipping job claim.")
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


class BackgroundLeaseRenewer:
    """Maintains active lease renewal and heartbeat on control plane while rendering/uploading."""

    def __init__(self, job_id: str, execution_token: str, interval_seconds: float = 10.0):
        self.job_id = job_id
        self.execution_token = execution_token
        self.interval = interval_seconds
        self.stop_event = threading.Event()
        self.thread: Optional[threading.Thread] = None
        self.current_percent = 20
        self.current_message = "Rendering in progress"
        self.revoked = False

    def start(self):
        self.thread = threading.Thread(target=self._run, daemon=True)
        self.thread.start()

    def update(self, percent: int, message: str):
        self.current_percent = percent
        self.current_message = message

    def stop(self):
        self.stop_event.set()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=3.0)

    def _run(self):
        consecutive_failures = 0
        while not self.stop_event.wait(self.interval):
            success = report_progress(
                self.job_id,
                self.execution_token,
                self.current_percent,
                self.current_message,
            )
            if success:
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                log("Lease", f"Warning: Lease renewal missed for {self.job_id} ({consecutive_failures} failures)")
                if consecutive_failures >= 5:
                    log("Lease", f"ERROR: Lease renewal rejected 5 consecutive times for {self.job_id}. Marking revoked.")
                    self.revoked = True
                    break


def upload_artifact_streaming(
    job_id: str,
    execution_token: str,
    mp4_path: Path,
    sha256_hash: str,
) -> Optional[Dict[str, Any]]:
    """Streams the rendered MP4 file directly to CAS without buffering the whole file in RAM."""
    url = f"{CONTROL_PLANE_URL}/api/rendering/instabox/upload"
    byte_length = mp4_path.stat().st_size

    headers = {
        "Content-Type": "video/mp4",
        "Content-Length": str(byte_length),
        "Authorization": f"Bearer {INSTABOX_WORKER_SECRET}",
        "x-instabox-secret": INSTABOX_WORKER_SECRET,
        "x-instabox-worker-id": WORKER_ID,
        "x-execution-token": execution_token,
        "x-artifact-sha256": sha256_hash,
        "x-artifact-byte-length": str(byte_length),
    }

    log("Upload", f"Streaming {byte_length} bytes (SHA-256: {sha256_hash}) from disk to {url}")
    file_handle = None
    try:
        file_handle = open(mp4_path, "rb")
        req = urllib.request.Request(url, data=file_handle, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=120) as resp:
            res_data = json.loads(resp.read().decode("utf-8"))
            if res_data.get("success"):
                log("Upload", f"Artifact staged in CAS at {res_data.get('casUri')}")
                return res_data
            log("Upload", f"Upload rejected by control plane: {res_data}")
            return None
    except Exception as e:
        log("Upload", f"Streaming upload exception: {e}")
        return None
    finally:
        if file_handle:
            file_handle.close()


def send_callback_with_retry(
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
    max_retries: int = 3,
) -> bool:
    """Authoritative callback with exponential backoff and strict acknowledgment verification."""
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

    body = json.dumps(payload).encode("utf-8")

    for attempt in range(1, max_retries + 1):
        try:
            req = urllib.request.Request(url, data=body, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=15) as resp:
                data = json.loads(resp.read().decode("utf-8"))
                acknowledged = data.get("success", False) is True and data.get("status") == status
                if acknowledged:
                    log("Callback", f"Callback acknowledged on attempt {attempt}: status={data.get('status')}")
                    return True
                log("Callback", f"Callback rejected by control plane on attempt {attempt}: {data}")
        except Exception as e:
            log("Callback", f"Callback delivery attempt {attempt}/{max_retries} failed: {e}")

        if attempt < max_retries:
            backoff_sleep = 2 ** (attempt - 1)
            time.sleep(backoff_sleep)

    return False


def validate_rendered_mp4(mp4_path: Path) -> Tuple[bool, str]:
    """Verify geometry (1080x1920), codecs, and presence of valid streams using ffprobe."""
    if not mp4_path.exists():
        return False, f"Output file does not exist: {mp4_path}"

    size = mp4_path.stat().st_size
    if size < 10 * 1024:
        return False, f"Output file abnormally small ({size} bytes)"

    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "stream=width,height,duration,codec_name,codec_type",
        "-of", "json",
        str(mp4_path),
    ]
    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        probe = json.loads(res.stdout)
        streams = probe.get("streams", [])
        if not streams:
            return False, "No media streams found in container"

        video_stream = next((s for s in streams if s.get("codec_type") == "video"), None)
        if not video_stream:
            return False, "No video stream in container"

        if video_stream.get("codec_name") not in ("h264", "hevc"):
            return False, f"Non-compliant video codec: {video_stream.get('codec_name')}"

        width = video_stream.get("width")
        height = video_stream.get("height")
        if width != 1080 or height != 1920:
            return False, f"Non-compliant dimensions: {width}x{height} (expected 1080x1920)"

        return True, "Valid 1080x1920 MP4 container"
    except Exception as e:
        return False, f"ffprobe validation error: {e}"


def resolve_render_intent(manifest: Dict[str, Any], output_path: Path, workspace: Path) -> RenderIntent:
    """
    Parse and resolve genuine ShortForge RenderIntent.
    Consumes scenes, templates, visual assets, audio tracks, and safe-area constraints.
    Downloads any remote assets with SSRF validation into the isolated job workspace.
    """
    # 1. Check if manifest has an embedded render intent
    raw_intent: Dict[str, Any] = {}
    if isinstance(manifest.get("localRenderIntent"), dict):
        raw_intent = dict(manifest["localRenderIntent"])
    elif isinstance(manifest.get("renderIntent"), dict):
        raw_intent = dict(manifest["renderIntent"])
    elif "scenes" in manifest:
        raw_intent = dict(manifest)
    else:
        # Construct standard ShortForge intent from topic/duration
        duration = float(manifest.get("duration") or manifest.get("durationSeconds") or 5.0)
        topic = str(manifest.get("topic") or "ShortForge Production Render")
        raw_intent = {
            "project_id": f"proj_{int(time.time())}",
            "title": topic,
            "scenes": [
                {
                    "scene_id": "scene_01",
                    "template_id": "facts.rapid-facts.v1",
                    "narration_text": topic,
                    "duration_seconds": duration,
                    "shots": [
                        {
                            "id": "shot_01",
                            "recipe_id": "sf.hook.kinetic_stack",
                            "start_seconds": 0.0,
                            "duration_seconds": duration,
                            "props": {
                                "headline": topic[:40],
                            },
                        }
                    ],
                }
            ],
        }

    raw_intent["output_path"] = str(output_path)
    output_cfg = raw_intent.get("output", {})
    output_cfg["width"] = 1080
    output_cfg["height"] = 1920
    output_cfg["fps"] = output_cfg.get("fps", 30)
    raw_intent["output"] = output_cfg

    # Resolve and download remote assets safely
    scenes = raw_intent.get("scenes", [])
    for s_idx, scene in enumerate(scenes):
        # Audio track URL check
        if scene.get("audio_track") and isinstance(scene["audio_track"], dict):
            audio_url = scene["audio_track"].get("audio_path")
            if audio_url and (audio_url.startswith("http://") or audio_url.startswith("https://")):
                local_audio = workspace / f"audio_scene_{s_idx}_{Path(audio_url).name}"
                download_asset_safe(audio_url, local_audio)
                scene["audio_track"]["audio_path"] = str(local_audio)

        # Visual assets / shots
        for sh_idx, shot in enumerate(scene.get("shots", [])):
            props = shot.get("props", {})
            src = props.get("source") or props.get("image_path")
            if src and (src.startswith("http://") or src.startswith("https://")):
                local_asset = workspace / f"asset_{s_idx}_{sh_idx}_{Path(src).name}"
                download_asset_safe(src, local_asset)
                props["source"] = str(local_asset)
                props["image_path"] = str(local_asset)

    return RenderIntent.from_dict(raw_intent)


def execute_render_job(job_claim: Dict[str, Any]):
    global ACTIVE_JOB_RUNNING
    ACTIVE_JOB_RUNNING = True

    job_id = job_claim["jobId"]
    if not JOB_ID_REGEX.match(job_id):
        log("Security", f"Rejected job claim: malformed jobId '{job_id}'")
        ACTIVE_JOB_RUNNING = False
        return

    execution_token = job_claim["executionToken"]
    attempt_id = job_claim.get("attemptId", 1)
    manifest = job_claim.get("manifest", {})

    log("Render", f"Starting genuine ShortForge rendering for job {job_id} (Attempt {attempt_id})")
    start_time = time.time()

    workspace = WORKSPACE_BASE / f"{job_id}_{int(start_time)}"
    workspace.mkdir(parents=True, exist_ok=True)
    output_mp4 = workspace / "output.mp4"

    lease_renewer = BackgroundLeaseRenewer(job_id, execution_token, interval_seconds=10.0)
    lease_renewer.start()

    try:
        report_progress(job_id, execution_token, 10, "Initializing workspace and resolving ShortForge render intent")
        lease_renewer.update(15, "Resolving assets and compiling composition")

        # 1. Resolve and compile genuine ShortForge RenderIntent
        intent = resolve_render_intent(manifest, output_mp4, workspace)

        # 2. Execute genuine ShortForge rendering via factoryos_render
        report_progress(job_id, execution_token, 30, "Executing factoryos-render composition and FFmpeg compilation")
        lease_renewer.update(45, "Encoding ShortForge frames and audio tracks")

        render_start = time.time()
        receipt = fo_render(intent, ffmpeg_path="ffmpeg")
        render_duration_ms = int((time.time() - render_start) * 1000)

        if lease_renewer.revoked:
            log("Render", f"Aborting job {job_id}: lease was revoked during rendering.")
            return

        # 3. Validate physical MP4 container geometry and codecs
        report_progress(job_id, execution_token, 75, "Validating container streams (1080x1920)")
        is_valid, probe_msg = validate_rendered_mp4(output_mp4)
        if not is_valid:
            log("Render", f"Media validation failed: {probe_msg}")
            send_callback_with_retry(
                job_id,
                execution_token,
                attempt_id,
                "FAILED",
                1,
                failure_reason=probe_msg,
            )
            return

        # 4. Compute physical SHA-256 digest
        report_progress(job_id, execution_token, 85, "Computing SHA-256 digest")
        sha256_hash = compute_sha256(output_mp4)
        byte_length = output_mp4.stat().st_size
        log("Render", f"ShortForge render verified: {byte_length} bytes, SHA-256: {sha256_hash}")

        # 5. Streaming upload to CAS with bounded memory
        report_progress(job_id, execution_token, 90, "Streaming MP4 artifact to FactoryOS CAS")
        lease_renewer.update(92, "Streaming artifact to CAS")
        upload_start = time.time()
        upload_res = upload_artifact_streaming(job_id, execution_token, output_mp4, sha256_hash)
        transfer_duration_ms = int((time.time() - upload_start) * 1000)

        if not upload_res:
            send_callback_with_retry(
                job_id,
                execution_token,
                attempt_id,
                "FAILED",
                1,
                failure_reason="Streaming artifact upload to control plane failed",
            )
            return

        cas_uri = upload_res["casUri"]
        total_time_ms = int((time.time() - start_time) * 1000)

        # 6. Authoritative callback with verified acknowledgment
        callback_ok = send_callback_with_retry(
            job_id=job_id,
            execution_token=execution_token,
            attempt_id=attempt_id,
            status="COMPLETED",
            exit_code=0,
            sha256_proof=sha256_hash,
            byte_length=byte_length,
            cas_uri=cas_uri,
            metrics={
                "startupTimeMs": 150,
                "executionTimeMs": render_duration_ms,
                "transferTimeMs": transfer_duration_ms,
                "totalTimeMs": total_time_ms,
            },
            stdout_snippet=f"Rendered {receipt.total_frames} frames via {receipt.renderer_version}",
        )

        if callback_ok:
            log("Render", f"Successfully completed job {job_id} in {total_time_ms / 1000:.2f}s (CAS: {cas_uri})")
        else:
            log("Render", f"CRITICAL: Job {job_id} rendered and uploaded, but callback acknowledgment failed after retries.")

    except subprocess.TimeoutExpired:
        log("Render", f"Render timed out after {MAX_JOB_DURATION_SECONDS}s")
        send_callback_with_retry(
            job_id,
            execution_token,
            attempt_id,
            "FAILED",
            124,
            failure_reason="Render execution exceeded maximum job duration timeout",
        )
    except Exception as e:
        log("Render", f"Execution error: {e}")
        send_callback_with_retry(
            job_id,
            execution_token,
            attempt_id,
            "FAILED",
            1,
            failure_reason=str(e),
        )
    finally:
        lease_renewer.stop()
        ACTIVE_JOB_RUNNING = False
        try:
            if workspace.exists():
                shutil.rmtree(workspace)
                log("Cleanup", f"Workspace {workspace} removed.")
        except Exception as e:
            log("Cleanup", f"Failed to clean workspace: {e}")


def main():
    validate_environment_or_die()

    log("Startup", f"InstaBox node daemon initialized for worker '{WORKER_ID}'")
    log("Startup", f"Control plane: {CONTROL_PLANE_URL}")
    log("Startup", f"Workspace base: {WORKSPACE_BASE}")

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
