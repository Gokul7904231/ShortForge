"""
ShortForge-owned Kaggle renderer.

Reference patterns:
- Detect the runtime rather than assuming the accelerator.
- Explicitly support the T4 x2 profile.
- Keep model-backed Wan execution separate from the deterministic proof.
- Use Kaggle Secrets for optional HF_TOKEN; never commit credentials.
- Produce one controlled MP4 artifact under /kaggle/working/shortforge/outputs/.

This file is intentionally not a copy of a community notebook. It is an
owned renderer implementing the useful runtime ideas we validated from public
Wan/Kaggle examples.
"""

from __future__ import annotations

import gc
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any


REQUEST_PATH = Path("/kaggle/working/shortforge-render-request.json")
DEFAULT_OUTPUT = Path(
    "/kaggle/working/shortforge/outputs/shortforge-output.mp4"
)
DEFAULT_MODEL_1_3B = "Wan-AI/Wan2.1-T2V-1.3B-Diffusers"
DEFAULT_MODEL_14B = "Wan-AI/Wan2.1-T2V-14B-Diffusers"


def log(message: str) -> None:
    print(message, flush=True)


def load_request() -> dict[str, Any]:
    if not REQUEST_PATH.exists():
        return {
            "renderer": "shortforge-deterministic",
            "outputPath": str(DEFAULT_OUTPUT),
            "requireDualT4": True,
            "nativeWidth": 480,
            "nativeHeight": 832,
            "fps": 16,
            "numFrames": 21,
            "numInferenceSteps": 1,
            "guidanceScale": 1.0,
        }

    return json.loads(REQUEST_PATH.read_text(encoding="utf-8"))


def gpu_inventory() -> list[dict[str, Any]]:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is required for the Kaggle renderer.") from exc

    if not torch.cuda.is_available():
        return []

    inventory = []
    for index in range(torch.cuda.device_count()):
        props = torch.cuda.get_device_properties(index)
        inventory.append(
            {
                "index": index,
                "name": torch.cuda.get_device_name(index),
                "total_memory_bytes": int(props.total_memory),
                "total_memory_gb": round(props.total_memory / 1024**3, 2),
                "capability": f"{props.major}.{props.minor}",
            }
        )
    return inventory


def require_gpu(inventory: list[dict[str, Any]], require_dual_t4: bool) -> None:
    if not inventory:
        raise RuntimeError("Kaggle renderer requires a CUDA GPU.")

    log("GPU INVENTORY:")
    for gpu in inventory:
        log(
            "  GPU {index}: {name} | {gb} GB | capability {capability}".format(
                index=gpu["index"],
                name=gpu["name"],
                gb=gpu["total_memory_gb"],
                capability=gpu["capability"],
            )
        )

    t4_count = sum("T4" in gpu["name"] for gpu in inventory)
    if require_dual_t4 and t4_count < 2:
        raise RuntimeError(
            "KAGGLE_DUAL_T4 profile requires two visible NVIDIA T4 GPUs; "
            f"observed {len(inventory)} GPU(s), {t4_count} T4."
        )


def resolve_hf_token() -> str | None:
    try:
        from kaggle_secrets import UserSecretsClient

        value = UserSecretsClient().get_secret("HF_TOKEN")
        if value:
            return value
    except Exception:
        pass

    return os.environ.get("HF_TOKEN") or None


def run_command(command: list[str]) -> None:
    log("$ " + " ".join(command))
    completed = subprocess.run(command, check=False)
    if completed.returncode != 0:
        raise RuntimeError(
            f"Command failed with exit code {completed.returncode}: {command}"
        )


def ensure_dirs(output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe(path: Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            str(path),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    if completed.returncode != 0:
        raise RuntimeError(
            "ffprobe failed: " + (completed.stderr or completed.stdout)
        )

    return json.loads(completed.stdout or "{}")


def encode_vertical_mp4(
    source_path: Path,
    output_path: Path,
    fps: int,
) -> None:
    ensure_dirs(output_path)

    filter_graph = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,setsar=1"
    )

    run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-i",
            str(source_path),
            "-vf",
            filter_graph,
            "-r",
            str(fps),
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "20",
            "-pix_fmt",
            "yuv420p",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=channel_layout=stereo:sample_rate=48000",
            "-c:a",
            "aac",
            "-shortest",
            "-movflags",
            "+faststart",
            str(output_path),
        ]
    )


def deterministic_gpu_proof(request: dict[str, Any]) -> Path:
    import numpy as np
    import torch

    output_path = Path(request.get("outputPath") or DEFAULT_OUTPUT)
    raw_path = output_path.with_suffix(".rgb")
    native_path = output_path.with_name(output_path.stem + "-native.mp4")

    ensure_dirs(output_path)
    device = torch.device("cuda")

    width = int(request.get("nativeWidth", 480))
    height = int(request.get("nativeHeight", 832))
    fps = int(request.get("fps", 16))
    frames = int(request.get("numFrames", 21))

    log(
        f"SHORTFORGE_KAGGLE_PROFILE proof | {torch.cuda.device_count()} CUDA GPU(s)"
    )

    y = torch.linspace(0, 1, height, device=device).view(height, 1)
    x = torch.linspace(0, 1, width, device=device).view(1, width)

    with raw_path.open("wb") as handle:
        for index in range(frames):
            progress = index / max(frames - 1, 1)
            red = ((x + progress) * 255).clamp(0, 255)
            green = ((y + progress * 0.5) * 255).clamp(0, 255)
            blue = (
                (1.0 - x * 0.5 + progress * 0.25) * 255
            ).clamp(0, 255)

            frame = torch.stack(
                [
                    red.expand(height, width),
                    green.expand(height, width),
                    blue.expand(height, width),
                ],
                dim=2,
            ).to(torch.uint8)

            handle.write(frame.cpu().numpy().astype(np.uint8).tobytes())

    run_command(
        [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "rawvideo",
            "-pixel_format",
            "rgb24",
            "-video_size",
            f"{width}x{height}",
            "-framerate",
            str(fps),
            "-i",
            str(raw_path),
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            str(native_path),
        ]
    )

    encode_vertical_mp4(native_path, output_path, fps)

    raw_path.unlink(missing_ok=True)
    native_path.unlink(missing_ok=True)
    return output_path


def install_wan_dependencies() -> None:
    required = ["diffusers", "transformers", "accelerate", "ftfy", "imageio"]
    missing: list[str] = []

    for package in required:
        module = package.replace("-", "_")
        try:
            __import__(module)
        except ImportError:
            missing.append(package)

    if missing:
        log("Installing missing Wan dependencies: " + ", ".join(missing))
        run_command(
            [
                sys.executable,
                "-m",
                "pip",
                "install",
                "-q",
                "diffusers",
                "transformers",
                "accelerate",
                "ftfy",
                "imageio",
                "imageio-ffmpeg",
                "safetensors",
            ]
        )


def wan_t2v(request: dict[str, Any], inventory: list[dict[str, Any]]) -> Path:
    install_wan_dependencies()

    import torch
    from diffusers import AutoModel, WanPipeline
    from diffusers.schedulers.scheduling_unipc_multistep import (
        UniPCMultistepScheduler,
    )
    from diffusers.utils import export_to_video

    model_id = (
        request.get("modelId")
        or DEFAULT_MODEL_14B
        if request.get("requireDualT4")
        else request.get("modelId") or DEFAULT_MODEL_1_3B
    )

    if request.get("requireDualT4") and len(inventory) < 2:
        raise RuntimeError(
            "Wan dual-T4 profile cannot continue without two visible GPUs."
        )

    hf_token = resolve_hf_token()
    token_kwargs = {"token": hf_token} if hf_token else {}

    dtype = torch.float16

    log(f"WAN MODEL: {model_id}")
    log(f"WAN GPU MODE: {'balanced' if len(inventory) >= 2 else 'cuda'}")

    vae = AutoModel.from_pretrained(
        model_id,
        subfolder="vae",
        torch_dtype=torch.float32,
        **token_kwargs,
    )

    pipeline_kwargs: dict[str, Any] = {
        "vae": vae,
        "torch_dtype": dtype,
        **token_kwargs,
    }

    if len(inventory) >= 2:
        pipeline_kwargs["device_map"] = "balanced"
        pipeline_kwargs["max_memory"] = {0: "15GB", 1: "15GB"}
    else:
        pipeline_kwargs["device_map"] = "cuda"

    pipe = WanPipeline.from_pretrained(model_id, **pipeline_kwargs)

    flow_shift = 3.0
    pipe.scheduler = UniPCMultistepScheduler.from_config(
        pipe.scheduler.config, flow_shift=flow_shift
    )

    prompt = (
        request.get("prompt")
        or "A cinematic vertical short-form video, gentle camera movement, "
        "high detail, clean composition, natural lighting"
    )
    negative_prompt = request.get("negativePrompt") or ""

    frames = int(request.get("numFrames", 21))
    fps = int(request.get("fps", 16))
    height = int(request.get("nativeHeight", 832))
    width = int(request.get("nativeWidth", 480))
    steps = int(request.get("numInferenceSteps", 12))
    guidance = float(request.get("guidanceScale", 5.0))

    if (frames - 1) % 4 != 0:
        raise RuntimeError(
            "Wan frame count must follow the documented 4*k+1 pattern; "
            f"received {frames}."
        )

    generator = torch.Generator(device="cuda").manual_seed(
        int(request.get("seed", 42))
    )

    started = time.perf_counter()
    output = pipe(
        prompt=prompt,
        negative_prompt=negative_prompt,
        height=height,
        width=width,
        num_frames=frames,
        guidance_scale=guidance,
        num_inference_steps=steps,
        generator=generator,
    ).frames[0]
    elapsed = time.perf_counter() - started

    output_path = Path(request.get("outputPath") or DEFAULT_OUTPUT)
    native_path = output_path.with_name(
        output_path.stem + "-native.mp4"
    )
    ensure_dirs(output_path)

    export_to_video(output, str(native_path), fps=fps)
    del output
    gc.collect()
    torch.cuda.empty_cache()

    encode_vertical_mp4(native_path, output_path, fps)
    native_path.unlink(missing_ok=True)

    log(f"WAN GENERATION SECONDS: {elapsed:.2f}")
    return output_path


def main() -> int:
    request = load_request()
    inventory = gpu_inventory()
    require_gpu(
        inventory,
        bool(request.get("requireDualT4")),
    )

    renderer = str(request.get("renderer") or "shortforge-deterministic")

    log("SHORTFORGE_KAGGLE_RENDER_START")
    log(
        "PROFILE="
        + (
            "KAGGLE_DUAL_T4"
            if request.get("requireDualT4")
            else "KAGGLE_GPU"
        )
    )
    log("RENDERER=" + renderer)
    log("GPU_COUNT=" + str(len(inventory)))

    output_path = (
        deterministic_gpu_proof(request)
        if renderer == "shortforge-deterministic"
        else wan_t2v(request, inventory)
    )

    if not output_path.exists():
        raise RuntimeError("ShortForge output MP4 was not created.")

    if output_path.stat().st_size <= 0:
        raise RuntimeError("ShortForge output MP4 is empty.")

    probe = ffprobe(output_path)
    sha256 = sha256_file(output_path)

    print(
        json.dumps(
            {
                "status": "SUCCEEDED",
                "artifact_path": str(output_path),
                "artifact_bytes": output_path.stat().st_size,
                "artifact_sha256": sha256,
                "renderer": renderer,
                "gpu_count": len(inventory),
                "gpus": inventory,
                "probe": probe,
            },
            indent=2,
            sort_keys=True,
        ),
        flush=True,
    )

    log("SHORTFORGE_KAGGLE_RENDER_COMPLETE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
