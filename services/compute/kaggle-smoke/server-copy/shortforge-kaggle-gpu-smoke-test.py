import hashlib
import json
import os
import subprocess
import time
from pathlib import Path


OUTPUT_DIR = Path("/kaggle/working")
VIDEO_PATH = OUTPUT_DIR / "shortforge-kaggle-smoke.mp4"
RECEIPT_PATH = OUTPUT_DIR / "shortforge-receipt.json"


def run_command(command):
    result = subprocess.run(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        check=False,
    )
    print(result.stdout)
    return result.returncode, result.stdout


def sha256_file(path):
    digest = hashlib.sha256()

    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


print("=== ShortForge Kaggle GPU Smoke Test ===")

print("\n[1] Checking GPU...")
gpu_code, gpu_output = run_command(
    [
        "nvidia-smi",
        "--query-gpu=name,memory.total,driver_version",
        "--format=csv,noheader",
    ]
)

if gpu_code != 0:
    raise RuntimeError("GPU check failed")

print("\n[2] Checking FFmpeg...")
ffmpeg_code, ffmpeg_output = run_command(["ffmpeg", "-version"])

if ffmpeg_code != 0:
    raise RuntimeError("FFmpeg check failed")

print("\n[3] Rendering test MP4...")

render_command = [
    "ffmpeg",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=1080x1920:r=30",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    "5",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    str(VIDEO_PATH),
]

render_code, render_output = run_command(render_command)

if render_code != 0:
    raise RuntimeError("FFmpeg render failed")

if not VIDEO_PATH.exists():
    raise RuntimeError("Expected MP4 was not created")

byte_length = VIDEO_PATH.stat().st_size
sha256 = sha256_file(VIDEO_PATH)

if byte_length <= 0:
    raise RuntimeError("Rendered MP4 is empty")

print("\n[4] Writing receipt...")

receipt = {
    "provider": "kaggle",
    "kernel_id": "gokulyt/shortforge-kaggle-smoke",
    "status": "completed",
    "gpu_check": {
        "success": gpu_code == 0,
        "output": gpu_output.strip(),
    },
    "ffmpeg_check": {
        "success": ffmpeg_code == 0,
    },
    "artifact": {
        "filename": VIDEO_PATH.name,
        "path": str(VIDEO_PATH),
        "byteLength": byte_length,
        "sha256": sha256,
    },
    "timestamp": int(time.time()),
}

RECEIPT_PATH.write_text(
    json.dumps(receipt, indent=2),
    encoding="utf-8",
)

print("\n=== SMOKE TEST COMPLETE ===")
print(f"Artifact: {VIDEO_PATH}")
print(f"Bytes:    {byte_length}")
print(f"SHA-256:  {sha256}")
print(f"Receipt:  {RECEIPT_PATH}")
