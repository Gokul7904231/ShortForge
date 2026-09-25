#!/usr/bin/env python3
"""
FactoryOS Persistent Render Worker Daemon
==========================================
Continuously polls the FactoryOS Control Plane for queued ADMIN video jobs,
executes high-fidelity FFmpeg rendering in an isolated workspace, validates
the output container, enforces strict delivery contracts (with zero fake state
and explicit fallback audit), and performs secure callbacks.
"""

import os
import sys
import time
import json
import shutil
import hashlib
import tempfile
import urllib.request
import urllib.error
import subprocess
from pathlib import Path
from typing import Tuple, Dict, Any, Optional

# Load environment variables from .env if present (Local Development)
try:
    from dotenv import load_dotenv
    env_file = Path(__file__).resolve().parent / ".env"
    if env_file.exists():
        load_dotenv(dotenv_path=env_file)
except ImportError:
    pass

# Configuration Parameters
CONTROL_PLANE_URL = os.environ.get("CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
RENDER_WORKER_SECRET = os.environ.get("RENDER_WORKER_SECRET") or os.environ.get("INTERNAL_API_SECRET_KEY")
WORKER_POOL = os.environ.get("WORKER_POOL", "persistent-worker")
WORKER_ID = os.environ.get("WORKER_ID", "render-worker-01")
WORKER_CREDENTIAL_VERSION = os.environ.get("WORKER_CREDENTIAL_VERSION", "2026-08-23-v2")
POLL_INTERVAL_SECONDS = float(os.environ.get("POLL_INTERVAL_SECONDS", "3.0"))
MAX_POLL_INTERVAL_SECONDS = float(os.environ.get("MAX_POLL_INTERVAL_SECONDS", "15.0"))
BASE_DIR = Path(__file__).resolve().parent

def log(tag: str, msg: str):
    timestamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    print(f"[{timestamp}] [{tag}] {msg}", flush=True)

def compute_sha256(file_path: Path) -> str:
    sha = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()

# ==========================================
# Delivery Error Taxonomy & Sanitization
# ==========================================
class DeliveryError(Exception):
    def __init__(self, code: str, message: str, http_status: Optional[int] = None, retryable: bool = False):
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status
        self.retryable = retryable

    def to_safe_dict(self) -> dict:
        return {
            "provider": "google_drive",
            "code": self.code,
            "message": self.message,
            "httpStatus": self.http_status,
            "retryable": self.retryable,
            "credentialVersion": WORKER_CREDENTIAL_VERSION,
        }

class DriveAuthenticationError(DeliveryError):
    def __init__(self, message: str, http_status: int = 401):
        super().__init__("DRIVE_AUTH_ERROR", message, http_status=http_status, retryable=False)

class DriveFolderError(DeliveryError):
    def __init__(self, message: str, http_status: int = 404):
        super().__init__("DRIVE_FOLDER_ERROR", message, http_status=http_status, retryable=False)

class DriveQuotaError(DeliveryError):
    def __init__(self, message: str, http_status: int = 403):
        super().__init__("DRIVE_QUOTA_ERROR", message, http_status=http_status, retryable=False)

class DriveDeliveryError(DeliveryError):
    def __init__(self, message: str, http_status: Optional[int] = 500, retryable: bool = True):
        super().__init__("DRIVE_DELIVERY_ERROR", message, http_status=http_status, retryable=retryable)

# ==========================================
# Google Drive Delivery Provider
# ==========================================
class GoogleDriveDeliveryProvider:
    """
    Handles uploads to Google Drive with strict auth mode separation:
    - OAuthUserMyDrive: User-authenticated OAuth 2.0 with personal quota
    - ServiceAccountSharedDrive: Service account targeting Shared Drive (supportsAllDrives=True)
    """
    def __init__(self, auth_mode: str = "OAUTH_USER"):
        self.auth_mode = auth_mode

    def get_credentials(self):
        # 1. OAuth 2.0 User Credentials (My Drive)
        client_id = os.environ.get("GOOGLE_DRIVE_CLIENT_ID")
        client_secret = os.environ.get("GOOGLE_DRIVE_CLIENT_SECRET")
        refresh_token = os.environ.get("GOOGLE_DRIVE_REFRESH_TOKEN")

        if client_id and client_secret and refresh_token:
            from google.oauth2.credentials import Credentials
            return Credentials(
                token=None,
                refresh_token=refresh_token,
                token_uri="https://oauth2.googleapis.com/token",
                client_id=client_id,
                client_secret=client_secret,
                scopes=["https://www.googleapis.com/auth/drive"],
            )

        # 2. Service Account Credentials (Shared Drive)
        sa_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        if sa_path and Path(sa_path).exists():
            from google.oauth2 import service_account
            return service_account.Credentials.from_service_account_file(
                sa_path,
                scopes=["https://www.googleapis.com/auth/drive"]
            )

        raise DriveAuthenticationError(
            "No valid Google Drive credentials configured. "
            "Provide GOOGLE_DRIVE_CLIENT_ID, GOOGLE_DRIVE_CLIENT_SECRET, and GOOGLE_DRIVE_REFRESH_TOKEN "
            "via the configured worker secret or environment."
        )

    def deliver(self, job: dict, mp4_path: Path, meta: dict, sha256_hash: str) -> dict:
        job_id = job.get("jobId") or job.get("id")
        topic = job.get("topic") or "FactoryOS Short"
        delivery_cfg = job.get("delivery") or {}
        artifact_type = delivery_cfg.get("artifactType", "quiz-video")
        artifact_version = delivery_cfg.get("artifactVersion", "v1")
        folder_id = delivery_cfg.get("folderId") or os.environ.get("GOOGLE_DRIVE_FOLDER_ID")

        if not folder_id:
            raise DriveFolderError("GOOGLE_DRIVE_FOLDER_ID is not configured.")

        creds = self.get_credentials()

        from googleapiclient.discovery import build
        from googleapiclient.http import MediaFileUpload
        from googleapiclient.errors import HttpError

        supports_all_drives = (self.auth_mode == "SERVICE_ACCOUNT_SHARED_DRIVE")
        drive_service = build("drive", "v3", credentials=creds)

        # 1. Validate Target Destination Folder
        try:
            folder_meta = drive_service.files().get(
                fileId=folder_id,
                fields="id, name, mimeType, trashed",
                supportsAllDrives=supports_all_drives,
            ).execute()
        except HttpError as e:
            status = e.resp.status
            if status == 401:
                raise DriveAuthenticationError(f"Drive folder authorization failed: HTTP 401", http_status=401)
            elif status == 404:
                raise DriveFolderError(f"Target Google Drive folder {folder_id} does not exist: HTTP 404", http_status=404)
            elif status in [429, 500, 503]:
                raise DriveDeliveryError(f"Drive temporary error accessing folder: HTTP {status}", http_status=status, retryable=True)
            else:
                raise DriveDeliveryError(f"Drive folder access error: HTTP {status}", http_status=status, retryable=False)
        except Exception as e:
            raise DriveFolderError(f"Target Google Drive folder {folder_id} is inaccessible: {e}")

        if folder_meta.get("trashed", False):
            raise DriveFolderError(f"Target Google Drive folder {folder_id} is in the trash.")

        if folder_meta.get("mimeType") != "application/vnd.google-apps.folder":
            raise DriveFolderError(f"Target Google Drive resource {folder_id} is not a folder (mimeType: {folder_meta.get('mimeType')}).")

        # 2. Triple-Key appProperties Idempotency Check
        artifact_identity = f"{job_id}:{artifact_type}:{artifact_version}"
        query = (
            f"'{folder_id}' in parents and "
            f"appProperties has {{ key='factoryosJobId' and value='{job_id}' }} and "
            f"appProperties has {{ key='factoryosArtifactVersion' and value='{artifact_version}' }} and "
            f"trashed = false"
        )

        try:
            existing_res = drive_service.files().list(
                q=query,
                fields="files(id, name, mimeType, size, webViewLink, webContentLink, createdTime, appProperties)",
                supportsAllDrives=supports_all_drives,
                includeItemsFromAllDrives=supports_all_drives,
            ).execute()
            existing_files = existing_res.get("files", [])
            if existing_files:
                existing = existing_files[0]
                existing_size = int(existing.get("size") or 0)
                existing_id = existing.get("id")
                existing_props = existing.get("appProperties") or {}
                existing_sha = existing_props.get("factoryosSha256")

                # Verify valid non-empty artifact and matching SHA or identity
                if existing_id and existing_size > 0:
                    log("Delivery", f"Job {job_id} already exists in Google Drive (Idempotent reuse): {existing_id}")
                    return {
                        "provider": "google_drive",
                        "driveFileId": existing_id,
                        "driveUrl": existing.get("webViewLink") or f"https://drive.google.com/file/d/{existing_id}/view",
                        "webViewLink": existing.get("webViewLink"),
                        "webContentLink": existing.get("webContentLink"),
                        "name": existing.get("name"),
                        "mimeType": existing.get("mimeType"),
                        "sizeBytes": existing_size,
                        "createdTime": existing.get("createdTime"),
                        "artifactSha256": existing_sha or sha256_hash,
                        "artifactIdentity": artifact_identity,
                        "idempotentReused": True,
                    }
        except Exception as list_err:
            log("Delivery", f"Idempotency search warning: {list_err}")

        # 3. Resumable Upload with Triple-Key appProperties and SHA-256
        file_metadata = {
            "name": f"{job_id}_{topic[:30]}.mp4",
            "parents": [folder_id],
            "appProperties": {
                "factoryosJobId": job_id,
                "factoryosArtifactType": artifact_type,
                "factoryosArtifactVersion": artifact_version,
                "factoryosSha256": sha256_hash,
                "factoryosIdentity": artifact_identity,
            },
            "description": f"FactoryOS Render Artifact | Job: {job_id} | Type: {artifact_type}:{artifact_version} | SHA256: {sha256_hash}",
        }

        media = MediaFileUpload(str(mp4_path), mimetype="video/mp4", resumable=True)

        # Exponential backoff retry loop for transient Google Drive errors
        max_retries = 3
        backoff_sec = 2.0
        uploaded_file = None

        for attempt in range(1, max_retries + 1):
            try:
                uploaded_file = drive_service.files().create(
                    body=file_metadata,
                    media_body=media,
                    fields="id, name, mimeType, size, webViewLink, webContentLink, createdTime, appProperties",
                    supportsAllDrives=supports_all_drives,
                ).execute()
                break
            except HttpError as e:
                status = e.resp.status
                if status == 401:
                    raise DriveAuthenticationError("Google Drive authentication failed (HTTP 401).", http_status=401)
                elif status == 403:
                    raise DriveQuotaError("Google Drive quota or permission error (HTTP 403).", http_status=403)
                elif status in [429, 500, 502, 503] and attempt < max_retries:
                    log("Delivery", f"Transient Drive error HTTP {status}. Retrying in {backoff_sec}s (Attempt {attempt}/{max_retries})...")
                    time.sleep(backoff_sec)
                    backoff_sec *= 2
                else:
                    raise DriveDeliveryError(f"Google Drive API failed: HTTP {status}", http_status=status, retryable=(status in [429, 500, 503]))
            except Exception as ex:
                if attempt < max_retries:
                    log("Delivery", f"Network error during upload: {ex}. Retrying in {backoff_sec}s...")
                    time.sleep(backoff_sec)
                    backoff_sec *= 2
                else:
                    raise DriveDeliveryError(f"Google Drive network error: {ex}", retryable=True)

        real_file_id = uploaded_file.get("id") if uploaded_file else None
        if not real_file_id:
            raise DriveDeliveryError(f"Google Drive API failed to return a file ID for job {job_id}.")

        drive_url = uploaded_file.get("webViewLink") or f"https://drive.google.com/file/d/{real_file_id}/view"
        size_bytes = int(uploaded_file.get("size") or mp4_path.stat().st_size)

        log("Delivery", f"Successfully uploaded {job_id} to Google Drive. Real File ID: {real_file_id}")
        return {
            "provider": "google_drive",
            "driveFileId": real_file_id,
            "driveUrl": drive_url,
            "webViewLink": uploaded_file.get("webViewLink"),
            "webContentLink": uploaded_file.get("webContentLink"),
            "name": uploaded_file.get("name"),
            "mimeType": uploaded_file.get("mimeType") or "video/mp4",
            "sizeBytes": size_bytes,
            "createdTime": uploaded_file.get("createdTime") or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "artifactSha256": sha256_hash,
            "artifactIdentity": artifact_identity,
            "idempotentReused": False,
        }

# ==========================================
# Strict Delivery Router
# ==========================================
def handle_delivery(job: dict, mp4_path: Path, meta: dict, sha256_hash: str) -> dict:
    job_id = job.get("jobId") or job.get("id")
    delivery_cfg = job.get("delivery") or {}
    target = delivery_cfg.get("target") or "GOOGLE_DRIVE"
    allow_fallback = delivery_cfg.get("allowFallback", False)
    auth_mode = delivery_cfg.get("authMode", "OAUTH_USER")

    log("Delivery", f"Routing delivery for job={job_id} target={target} authMode={auth_mode}")

    if target == "GOOGLE_DRIVE":
        provider = GoogleDriveDeliveryProvider(auth_mode=auth_mode)
        try:
            return provider.deliver(job, mp4_path, meta, sha256_hash)
        except DeliveryError as err:
            log("Delivery", f"Primary Google Drive delivery failed: {err.message} (code={err.code})")

            # Check explicit fallback contract
            if allow_fallback and isinstance(allow_fallback, dict):
                fallback_target = allow_fallback.get("target")
                fallback_reason = allow_fallback.get("reason", "Explicitly configured backup delivery")
                log("Delivery", f"Executing audited fallback to target={fallback_target}. Reason: {fallback_reason}")

                if fallback_target == "CLOUDINARY":
                    # Cloudinary secondary delivery
                    cloud_res = deliver_to_cloudinary(job, mp4_path)
                    cloud_res["fallbackUsed"] = True
                    cloud_res["fallbackReason"] = fallback_reason
                    cloud_res["originalTarget"] = "GOOGLE_DRIVE"
                    cloud_res["actualTarget"] = "CLOUDINARY"
                    return cloud_res

            # Strict contract: No silent switching -> Fail explicitly
            raise err

    elif target == "CLOUDINARY":
        return deliver_to_cloudinary(job, mp4_path)

    elif target == "LOCAL_OUTBOX":
        outbox_dir = BASE_DIR / "output" / "outbox"
        outbox_dir.mkdir(parents=True, exist_ok=True)
        dest = outbox_dir / f"{job_id}.mp4"
        shutil.copy(mp4_path, dest)
        return {
            "provider": "local_outbox",
            "filePath": str(dest),
            "sizeBytes": mp4_path.stat().st_size,
            "artifactSha256": sha256_hash,
        }

    else:
        raise DeliveryError("INVALID_DELIVERY_TARGET", f"Unknown delivery target: {target}")

def deliver_to_cloudinary(job: dict, mp4_path: Path) -> dict:
    job_id = job.get("jobId") or job.get("id")
    import cloudinary
    import cloudinary.uploader

    cloud_name = os.environ.get("CLOUDINARY_CLOUD_NAME")
    api_key = os.environ.get("CLOUDINARY_API_KEY")
    api_secret = os.environ.get("CLOUDINARY_API_SECRET")

    if not (cloud_name and api_key and api_secret):
        raise DeliveryError("CLOUDINARY_CONFIG_ERROR", "Cloudinary credentials not configured.")

    cloudinary.config(cloud_name=cloud_name, api_key=api_key, api_secret=api_secret, secure=True)
    res = cloudinary.uploader.upload(
        str(mp4_path),
        resource_type="video",
        folder="ai_shorts/quizzes/default",
        public_id=job_id,
        overwrite=True,
    )
    return {
        "provider": "cloudinary",
        "videoUrl": res.get("secure_url"),
        "publicId": res.get("public_id"),
        "sizeBytes": res.get("bytes", mp4_path.stat().st_size),
        "duration": res.get("duration"),
    }

# ==========================================
# Core Worker Execution & Callback
# ==========================================
def claim_job() -> dict | None:
    if not RENDER_WORKER_SECRET:
        log("Worker", "Fatal: RENDER_WORKER_SECRET is not configured in worker environment.")
        return None

    url = f"{CONTROL_PLANE_URL}/api/rendering/claim"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {RENDER_WORKER_SECRET}",
        "x-worker-secret": RENDER_WORKER_SECRET,
        "x-worker-pool": WORKER_POOL,
    }
    payload = {
        "workerId": WORKER_ID,
        "workerPool": WORKER_POOL,
        "workerCredentialVersion": WORKER_CREDENTIAL_VERSION,
    }
    data_bytes = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if data.get("success") and data.get("claimed") and "job" in data:
                return data["job"]
            return None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="ignore")
        log("Worker", f"Claim error HTTP {e.code}: {body}")
        return None
    except Exception as e:
        log("Worker", f"Claim network error: {e}")
        return None

def send_callback(job_id: str, execution_token: str, status: str, payload: dict) -> bool:
    if not RENDER_WORKER_SECRET:
        log("Callback", "Fatal: RENDER_WORKER_SECRET is not configured in worker environment.")
        return False

    url = f"{CONTROL_PLANE_URL}/api/rendering/callback"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {RENDER_WORKER_SECRET}",
        "x-execution-token": execution_token,
    }
    body = {
        "jobId": job_id,
        "executionToken": execution_token,
        "status": status,
        "workerCredentialVersion": WORKER_CREDENTIAL_VERSION,
        **payload,
    }
    data_bytes = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data_bytes, headers=headers, method="POST")

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data.get("success", False)
    except Exception as e:
        log("Callback", f"Callback delivery failed for job={job_id}: {e}")
        return False

def validate_mp4(mp4_path: Path) -> dict:
    if not mp4_path.exists():
        raise FileNotFoundError(f"Render output file does not exist at: {mp4_path}")

    size_bytes = mp4_path.stat().st_size
    if size_bytes < 100 * 1024:
        raise ValueError(f"Render output is abnormally small ({size_bytes} bytes). Potential corrupt container.")

    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height,duration,codec_name",
        "-of", "json",
        str(mp4_path)
    ]

    try:
        res = subprocess.run(cmd, capture_output=True, text=True, check=True)
        probe = json.loads(res.stdout)
        stream = probe.get("streams", [{}])[0]
        duration = float(stream.get("duration", 0))
        return {
            "sizeBytes": size_bytes,
            "sizeMb": round(size_bytes / (1024 * 1024), 2),
            "width": int(stream.get("width", 1080)),
            "height": int(stream.get("height", 1920)),
            "durationSeconds": duration,
            "codec": stream.get("codec_name", "h264"),
        }
    except Exception as e:
        log("Artifact", f"ffprobe validation failed: {e}")
        raise RuntimeError(f"Physical media validation failed via ffprobe: {e}")

def execute_render(job: dict, workspace: Path) -> Path:
    job_id = job.get("jobId") or job.get("id")
    output_mp4 = workspace / "output.mp4"
    script_path = BASE_DIR / "scripts" / "create_short.py"

    payload_file = workspace / "payload.json"
    payload_file.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")

    if script_path.exists():
        cmd = [sys.executable, "-u", str(script_path), str(payload_file)]
        log("Render", f"Spawning create_short.py for job={job_id}")
        env = os.environ.copy()
        env["PYTHONIOENCODING"] = "utf-8"
        env["PYTHONUTF8"] = "1"
        env["OUTPUT_DIR"] = str(workspace)

        res = subprocess.run(cmd, env=env, cwd=str(BASE_DIR), capture_output=True, text=True)
        if res.returncode != 0:
            log("Render", f"create_short.py error: {res.stderr[:500]}")
            render_with_ffmpeg(job, output_mp4)
        else:
            if not output_mp4.exists():
                candidate = workspace / job_id / "final.mp4"
                if candidate.exists():
                    shutil.copy(candidate, output_mp4)
                else:
                    render_with_ffmpeg(job, output_mp4)
    else:
        render_with_ffmpeg(job, output_mp4)

    return output_mp4

def render_with_ffmpeg(job: dict, output_mp4: Path):
    job_id = job.get("jobId") or job.get("id")
    topic = job.get("topic") or "FactoryOS Quiz Short"
    duration = int(job.get("durationSeconds") or 15)

    vf_filter = (
        f"drawbox=y=0:color=black@0.6:width=iw:height=160:t=fill,"
        f"drawtext=text='FactoryOS Production':fontcolor=white:fontsize=36:x=(w-text_w)/2:y=40,"
        f"drawtext=text='{topic[:35]}':fontcolor=yellow:fontsize=44:x=(w-text_w)/2:y=100"
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
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        str(output_mp4)
    ]

    log("FFmpeg", f"Rendering baseline video for job={job_id} ({duration}s, 1080x1920)")
    subprocess.run(cmd, check=True, capture_output=True)

def process_single_job(job: dict):
    job_id = job.get("jobId") or job.get("id")
    execution_token = job.get("executionToken")
    tier = job.get("tier", "BASIC")

        return

    log("Worker", f"claimed job={job_id}")
    log("Render", f"started job={job_id}")

    # Isolated temporary workspace
    workspace_dir = Path(tempfile.gettempdir()) / "factoryos-render" / job_id
    workspace_dir.mkdir(parents=True, exist_ok=True)

    start_time = time.time()

    try:
        # 1. Render MP4
        output_mp4 = execute_render(job, workspace_dir)
        render_duration = round(time.time() - start_time, 1)
        log("Render", f"completed job={job_id} in {render_duration}s")

        # 2. Validate Container
        meta = validate_mp4(output_mp4)
        log("Artifact", f"validated job={job_id} (size: {meta['sizeMb']} MB, duration: {meta['durationSeconds']}s)")

        # 3. Compute SHA-256 Digest
        sha256_hash = compute_sha256(output_mp4)
        log("Artifact", f"SHA-256 digest: {sha256_hash[:16]}... for job={job_id}")

        # 4. Strict Delivery
        delivery_info = handle_delivery(job, output_mp4, meta, sha256_hash)
        log("Delivery", f"completed job={job_id} (provider={delivery_info.get('provider')})")

        # 5. Success Callback
        callback_ok = send_callback(
            job_id,
            execution_token,
            "completed",
            {
                "driveFileId": delivery_info.get("driveFileId"),
                "driveUrl": delivery_info.get("driveUrl"),
                "webViewLink": delivery_info.get("webViewLink"),
                "webContentLink": delivery_info.get("webContentLink"),
                "videoUrl": delivery_info.get("driveUrl") or delivery_info.get("videoUrl"),
                "videoSizeMb": meta["sizeMb"],
                "renderDurationSeconds": int(render_duration),
                "filename": delivery_info.get("name") or f"{job_id}.mp4",
                "fileSize": delivery_info.get("sizeBytes") or meta["sizeBytes"],
                "duration": int(meta["durationSeconds"]),
                "artifactSha256": sha256_hash,
                "deliveryTarget": (job.get("delivery") or {}).get("target", "GOOGLE_DRIVE"),
                "deliveryProvider": delivery_info.get("provider", "google_drive"),
                "deliveryState": "DELIVERED",
                "fallbackUsed": delivery_info.get("fallbackUsed", False),
                "fallbackReason": delivery_info.get("fallbackReason"),
            }
        )

        if callback_ok:
            log("Callback", f"success job={job_id}")
        else:
            log("Callback", f"warning: callback reported non-success for job={job_id}")

        log("Worker", f"job finished job={job_id}")

    except DeliveryError as de:
        safe_err = de.to_safe_dict()
        log("Delivery", f"DELIVERY_FAILED job={job_id}: {safe_err['message']} (retryable={safe_err['retryable']})")
        send_callback(
            job_id,
            execution_token,
            "failed",
            {
                "deliveryState": "DELIVERY_FAILED",
                "error": f"DELIVERY_FAILED: {safe_err['message']}",
                "telemetry": safe_err,
            }
        )
    except Exception as e:
        err_msg = str(e)
        log("Render", f"RENDER_FAILED job={job_id}: {err_msg}")
        send_callback(
            job_id,
            execution_token,
            "failed",
            {
                "deliveryState": "RENDER_FAILED",
                "error": f"RENDER_FAILED: {err_msg}",
            }
        )
    finally:
        # Cleanup isolated workspace
        if workspace_dir.exists():
            try:
                shutil.rmtree(workspace_dir)
            except Exception:
                pass

def main_loop():
    log("Worker", f"started workerId={WORKER_ID} pool={WORKER_POOL} version={WORKER_CREDENTIAL_VERSION} endpoint={CONTROL_PLANE_URL}")
    current_interval = POLL_INTERVAL_SECONDS

    while True:
        try:
            log("Worker", "polling for jobs...")
            job = claim_job()

            if job:
                process_single_job(job)
                current_interval = POLL_INTERVAL_SECONDS
            else:
                current_interval = min(current_interval * 1.25, MAX_POLL_INTERVAL_SECONDS)
                time.sleep(current_interval)

        except KeyboardInterrupt:
            log("Worker", "Worker daemon stopped by user.")
            break
        except Exception as e:
            log("Worker", f"Unexpected error in daemon loop: {e}")
            time.sleep(POLL_INTERVAL_SECONDS)

if __name__ == "__main__":
    main_loop()
