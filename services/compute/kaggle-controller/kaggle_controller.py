#!/usr/bin/env python3

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path


POLL_SECONDS = 5
DEFAULT_TIMEOUT_SECONDS = 900


def log(message: str):
    print(f"[KAGGLE-CONTROLLER] {message}", flush=True)


def run_command(args, cwd=None, check=True):
    log("RUN: " + " ".join(str(x) for x in args))

    result = subprocess.run(
        args,
        cwd=cwd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
    )

    print(result.stdout, end="", flush=True)

    if check and result.returncode != 0:
        raise RuntimeError(
            f"Command failed with exit code {result.returncode}: {' '.join(map(str, args))}"
        )

    return result


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)

    return digest.hexdigest()


def build_worker_script(job: dict) -> str:
    job_json = json.dumps(job, separators=(",", ":"))
    job_literal = repr(job_json)

    return f'''#!/usr/bin/env python3

import hashlib
import json
import shutil
import subprocess
from pathlib import Path


JOB = json.loads({job_literal})

WORKSPACE = Path("/kaggle/working")
OUTPUT = WORKSPACE / (JOB["jobId"] + ".mp4")
RECEIPT = WORKSPACE / "shortforge-receipt.json"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()

    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)

    return digest.hexdigest()


def has_nvenc() -> bool:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-encoders"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    return "h264_nvenc" in result.stdout


def render():
    duration = int(JOB.get("duration", 5))
    topic = str(JOB.get("topic", "ShortForge Kaggle Render"))

    encoder = "h264_nvenc" if has_nvenc() else "libx264"

    print("=== ShortForge Real Kaggle Controller Test ===", flush=True)
    print("Job ID:", JOB["jobId"], flush=True)
    print("Topic:", topic, flush=True)
    print("Duration:", duration, flush=True)

    print("\\n=== GPU ===", flush=True)

    subprocess.run(
        [
            "nvidia-smi",
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ],
        check=False,
    )

    print("\\n=== FFmpeg Encoder ===", flush=True)
    print("Selected encoder:", encoder, flush=True)

    if encoder == "h264_nvenc":
        video_encoder_args = [
            "-c:v", "h264_nvenc",
            "-preset", "p4",
        ]
    else:
        video_encoder_args = [
            "-c:v", "libx264",
        ]

    cmd = [
        "ffmpeg",
        "-y",
        "-f", "lavfi",
        "-i", f"testsrc2=size=1080x1920:rate=30",
        "-f", "lavfi",
        "-i", "anullsrc=r=48000:cl=stereo",
        "-t", str(duration),
        "-vf",
        f"drawtext=text='{{topic}}':fontsize=64:fontcolor=white:"
        "x=(w-text_w)/2:y=(h-text_h)/2",
        *video_encoder_args,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        str(OUTPUT),
    ]

    print("\\n=== RENDER ===", flush=True)

    result = subprocess.run(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    print(result.stderr, flush=True)

    if result.returncode != 0:
        raise RuntimeError(
            f"FFmpeg failed with exit code {{result.returncode}}"
        )

    if not OUTPUT.exists():
        raise RuntimeError("Expected output file was not created.")

    byte_length = OUTPUT.stat().st_size
    digest = sha256_file(OUTPUT)

    print("\\n=== ARTIFACT ===", flush=True)
    print("Filename:", OUTPUT.name, flush=True)
    print("Bytes:", byte_length, flush=True)
    print("SHA-256:", digest, flush=True)

    receipt = {{
        "provider": "kaggle",
        "controller_test": True,
        "job": JOB,
        "kernel_id": "{os.environ.get("KERNEL_ID", "UNKNOWN")}",
        "status": "completed",
        "gpu": {{
            "detected": True,
        }},
        "ffmpeg": {{
            "encoder_selected": encoder,
            "nvenc_available": encoder == "h264_nvenc",
        }},
        "artifact": {{
            "filename": OUTPUT.name,
            "path": str(OUTPUT),
            "byteLength": byte_length,
            "sha256": digest,
        }},
        "timestamp": int(__import__("time").time()),
    }}

    RECEIPT.write_text(
        json.dumps(receipt, indent=2),
        encoding="utf-8",
    )

    print("\\n=== CONTROLLER KERNEL COMPLETE ===", flush=True)


if __name__ == "__main__":
    render()
'''


def kernel_status(kernel_id: str) -> str:
    result = run_command(
        ["kaggle", "kernels", "status", kernel_id],
        check=False,
    )

    output = result.stdout.upper()

    if "COMPLETE" in output:
        return "COMPLETE"
    if "ERROR" in output or "FAILED" in output:
        return "FAILED"
    if "CANCEL" in output:
        return "CANCELLED"
    if "RUNNING" in output:
        return "RUNNING"
    if "QUEUED" in output:
        return "QUEUED"
    if "STARTING" in output:
        return "STARTING"

    return "UNKNOWN"


def main():
    parser = argparse.ArgumentParser(
        description="ShortForge real Kaggle controller"
    )

    parser.add_argument(
        "--job-id",
        default="sf_kaggle_controller_test",
    )

    parser.add_argument(
        "--topic",
        default="ShortForge Real Kaggle Controller Test",
    )

    parser.add_argument(
        "--duration",
        type=int,
        default=5,
    )

    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
    )

    args = parser.parse_args()

    username = os.environ.get("KAGGLE_USERNAME")

    if not username:
        raise RuntimeError(
            "KAGGLE_USERNAME is not set."
        )

    job = {
        "jobId": args.job_id,
        "topic": args.topic,
        "duration": args.duration,
    }

    kernel_slug = (
        "shortforge-real-"
        + args.job_id.lower()
        .replace("_", "-")
        .replace(" ", "-")
    )

    kernel_id = f"{username}/{kernel_slug}"

    log(f"Job ID: {args.job_id}")
    log(f"Kernel ID: {kernel_id}")

    work_dir = Path(
        tempfile.mkdtemp(prefix="shortforge-kaggle-")
    )

    output_dir = Path.cwd() / "controller-output"

    try:
        log(f"Temporary kernel directory: {work_dir}")

        metadata = {
            "id": kernel_id,
            "title": f"ShortForge Real Kaggle — {args.job_id}",
            "code_file": "worker.py",
            "language": "python",
            "kernel_type": "script",
            "is_private": "true",
            "enable_gpu": "true",
            "enable_internet": "true",
            "machine_shape": "NvidiaTeslaT4",
            "dataset_sources": [],
            "competition_sources": [],
            "kernel_sources": [],
            "model_sources": [],
        }

        (work_dir / "kernel-metadata.json").write_text(
            json.dumps(metadata, indent=2),
            encoding="utf-8",
        )

        worker_script = build_worker_script(job)

        worker_script = worker_script.replace(
            'kernel_id": "UNKNOWN"',
            f'kernel_id": "{kernel_id}"',
        )

        (work_dir / "worker.py").write_text(
            worker_script,
            encoding="utf-8",
        )

        log("Generated Kaggle kernel files.")

        run_command(
            [
                "kaggle",
                "kernels",
                "push",
                "-p",
                str(work_dir),
                "--accelerator",
                "NvidiaTeslaT4",
            ],
            check=True,
        )

        log("Kernel submitted successfully.")

        started = time.time()

        while True:
            status = kernel_status(kernel_id)
            log(f"Kernel status: {status}")

            if status == "COMPLETE":
                break

            if status in {"FAILED", "CANCELLED"}:
                raise RuntimeError(
                    f"Kaggle kernel finished with status {status}"
                )

            if time.time() - started > args.timeout:
                raise TimeoutError(
                    f"Kaggle kernel exceeded {args.timeout} seconds."
                )

            time.sleep(POLL_SECONDS)

        if output_dir.exists():
            shutil.rmtree(output_dir)

        output_dir.mkdir(parents=True)

        run_command(
            [
                "kaggle",
                "kernels",
                "output",
                kernel_id,
                "-p",
                str(output_dir),
                "-o",
            ],
            check=True,
        )

        mp4_files = list(output_dir.glob("*.mp4"))
        receipt_path = output_dir / "shortforge-receipt.json"

        if not mp4_files:
            raise RuntimeError(
                "No MP4 artifact was returned by Kaggle."
            )

        if not receipt_path.exists():
            raise RuntimeError(
                "shortforge-receipt.json was not returned."
            )

        artifact_path = mp4_files[0]

        local_sha = sha256_file(artifact_path)
        local_size = artifact_path.stat().st_size

        receipt = json.loads(
            receipt_path.read_text(encoding="utf-8")
        )

        remote_sha = receipt["artifact"]["sha256"]
        remote_size = receipt["artifact"]["byteLength"]

        log(f"Downloaded artifact: {artifact_path}")
        log(f"Local bytes: {local_size}")
        log(f"Receipt bytes: {remote_size}")
        log(f"Local SHA-256: {local_sha}")
        log(f"Receipt SHA-256: {remote_sha}")

        if local_sha != remote_sha:
            raise RuntimeError(
                "SHA-256 mismatch between Kaggle receipt and "
                "downloaded physical artifact."
            )

        if local_size != remote_size:
            raise RuntimeError(
                "Byte-length mismatch between Kaggle receipt and "
                "downloaded physical artifact."
            )

        log("========================================")
        log("REAL KAGGLE CONTROLLER TEST PASSED")
        log("========================================")
        log(f"Kernel: {kernel_id}")
        log(f"Artifact: {artifact_path}")
        log(f"SHA-256: {local_sha}")
        log(f"Bytes: {local_size}")

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(
            f"[KAGGLE-CONTROLLER] ERROR: {exc}",
            file=sys.stderr,
        )
        sys.exit(1)


