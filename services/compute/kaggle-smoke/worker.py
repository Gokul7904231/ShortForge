import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path


KERNEL_ID = "gokulkumara/shortforge-kaggle-gpu-smoke-test"

OUTPUT_DIR = Path("/kaggle/working")
VIDEO_PATH = OUTPUT_DIR / "shortforge-kaggle-gpu-smoke.mp4"
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


print("=== ShortForge Kaggle GPU Render Test ===")

# ---------------------------------------------------------
# 1. GPU detection
# ---------------------------------------------------------
print("\n[1] NVIDIA GPU")

nvidia_smi = shutil.which("nvidia-smi")

if not nvidia_smi:
    raise RuntimeError("nvidia-smi not found")

gpu_code, gpu_output = run_command([
    nvidia_smi,
    "--query-gpu=index,name,memory.total,driver_version",
    "--format=csv,noheader",
])

if gpu_code != 0:
    raise RuntimeError("nvidia-smi failed")

gpu_lines = [
    line.strip()
    for line in gpu_output.splitlines()
    if line.strip()
]

print(f"Detected GPUs: {len(gpu_lines)}")

if len(gpu_lines) < 1:
    raise RuntimeError("No NVIDIA GPUs detected")


# ---------------------------------------------------------
# 2. FFmpeg / NVENC capability
# ---------------------------------------------------------
print("\n[2] FFmpeg")

ffmpeg_path = shutil.which("ffmpeg")

if not ffmpeg_path:
    raise RuntimeError("ffmpeg not found")

ffmpeg_version_code, ffmpeg_version = run_command([
    ffmpeg_path,
    "-version",
])

if ffmpeg_version_code != 0:
    raise RuntimeError("FFmpeg version check failed")


print("\n[3] Checking NVENC support")

encoder_code, encoder_output = run_command([
    ffmpeg_path,
    "-hide_banner",
    "-encoders",
])

nvenc_available = "h264_nvenc" in encoder_output

print("h264_nvenc available =", nvenc_available)

encoder = "h264_nvenc" if nvenc_available else "libx264"

if not nvenc_available:
    print("WARNING: NVENC unavailable; falling back to libx264 CPU encoding")


# ---------------------------------------------------------
# 3. Render
# ---------------------------------------------------------
print("\n[4] Rendering")

render_command = [
    ffmpeg_path,
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=1080x1920:rate=30",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=r=48000:cl=stereo",
    "-t",
    "5",
]

if encoder == "h264_nvenc":
    render_command += [
        "-c:v",
        "h264_nvenc",
        "-preset",
        "p4",
        "-pix_fmt",
        "yuv420p",
    ]
else:
    render_command += [
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-pix_fmt",
        "yuv420p",
    ]

render_command += [
    "-c:a",
    "aac",
    "-shortest",
    str(VIDEO_PATH),
]

render_code, render_output = run_command(render_command)

if render_code != 0:
    raise RuntimeError("FFmpeg render failed")

if not VIDEO_PATH.exists():
    raise RuntimeError("Rendered MP4 was not created")


# ---------------------------------------------------------
# 4. Physical artifact verification
# ---------------------------------------------------------
print("\n[5] Artifact verification")

byte_length = VIDEO_PATH.stat().st_size

if byte_length <= 0:
    raise RuntimeError("Rendered MP4 is empty")

sha256 = sha256_file(VIDEO_PATH)


# ---------------------------------------------------------
# 5. Receipt
# ---------------------------------------------------------
receipt = {
    "provider": "kaggle",
    "kernel_id": KERNEL_ID,
    "status": "completed",
    "gpu": {
        "detected": True,
        "count": len(gpu_lines),
        "devices": gpu_lines,
    },
    "ffmpeg": {
        "encoder_selected": encoder,
        "nvenc_available": nvenc_available,
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

print("\n=== GPU RENDER TEST COMPLETE ===")
print("Kernel:", KERNEL_ID)
print("Encoder:", encoder)
print("Bytes:", byte_length)
print("SHA-256:", sha256)
print("Receipt:", RECEIPT_PATH)
