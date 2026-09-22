import os
import shutil
import subprocess
from pathlib import Path


print("=== ShortForge Kaggle GPU Diagnostic ===")

print("\n[1] Environment")
print("CUDA_VISIBLE_DEVICES =", os.environ.get("CUDA_VISIBLE_DEVICES"))
print("PATH =", os.environ.get("PATH"))

print("\n[2] nvidia-smi discovery")
nvidia_smi = shutil.which("nvidia-smi")
print("nvidia-smi path =", nvidia_smi)

if nvidia_smi:
    result = subprocess.run(
        [
            nvidia_smi,
            "--query-gpu=name,memory.total,driver_version",
            "--format=csv,noheader",
        ],
        capture_output=True,
        text=True,
    )
    print("nvidia-smi return code =", result.returncode)
    print(result.stdout)
    print(result.stderr)

print("\n[3] NVIDIA device files")
for path in sorted(Path("/dev").glob("nvidia*")):
    print(path)

print("\n[4] PyTorch")
try:
    import torch

    print("torch version =", torch.__version__)
    print("torch CUDA version =", torch.version.cuda)
    print("torch CUDA available =", torch.cuda.is_available())
    print("torch device count =", torch.cuda.device_count())

    for i in range(torch.cuda.device_count()):
        print(f"device {i} =", torch.cuda.get_device_name(i))
        print(f"capability {i} =", torch.cuda.get_device_capability(i))

except Exception as exc:
    print("PyTorch diagnostic failed:", repr(exc))

print("\n[5] CUDA libraries")
for candidate in [
    "/usr/local/cuda",
    "/usr/local/cuda/bin/nvidia-smi",
    "/usr/bin/nvidia-smi",
    "/opt/nvidia/bin/nvidia-smi",
]:
    path = Path(candidate)
    print(candidate, "=>", "EXISTS" if path.exists() else "missing")

print("\n=== Diagnostic finished ===")
