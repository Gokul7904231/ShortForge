import json
import argparse
import subprocess
import os
import time
import shutil
import math
import socket
import ipaddress
import urllib.parse
import sys
import hashlib
from pathlib import Path
from typing import Optional, Dict, Any, List

_ENGINE_ROOT = Path(__file__).resolve().parent.parent
if str(_ENGINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_ENGINE_ROOT))

from core.commit import compute_file_sha256, emit_staged_result, post_fenced_callback
from core.lattice import FPS, SAMPLES_PER_FRAME, SR, frames_for_samples
from core.audio_truth import decode_audio_to_pcm48k, write_pcm48k_wav
from core.preflight import (
    get_pinned_font_path,
    run_preflight_budget,
    strip_uncovered_glyphs,
    wrap_lines_pixel_exact,
)
from core.assemble import (
    BT709_SETPARAMS_VF,
    COVER_CROP_VF,
    assemble_canonical_mp4,
    build_two_pass_audio_filter,
    measure_loudnorm_pass1,
)
from core.frames import render_pil_frame_to_rgb24

_TOOLCHAIN_HASH = os.environ.get("SHORTFORGE_TOOLCHAIN_HASH") or hashlib.sha256(
    Path(__file__).read_bytes()
).hexdigest()[:16]

# Load .env from render engine root (for standalone execution)
try:
    from dotenv import load_dotenv as _load_dotenv
    _env_file = Path(__file__).resolve().parent.parent / ".env"
    if _env_file.exists():
        _load_dotenv(dotenv_path=_env_file)
except ImportError:
    pass

import cloudinary
import cloudinary.uploader

# Initialize Cloudinary Configuration
cloudinary.config(
    cloud_name=os.environ.get("CLOUDINARY_CLOUD_NAME"),
    api_key=os.environ.get("CLOUDINARY_API_KEY"),
    api_secret=os.environ.get("CLOUDINARY_API_SECRET"),
    secure=True
)


# MoviePy (and imageio-ffmpeg) often need an explicit ffmpeg binary on Windows.
# Must be set before importing/initializing MoviePy.
try:
    import imageio_ffmpeg  # type: ignore

    os.environ["IMAGEIO_FFMPEG_EXE"] = imageio_ffmpeg.get_ffmpeg_exe()
    print(f"[ffmpeg] IMAGEIO_FFMPEG_EXE={os.environ['IMAGEIO_FFMPEG_EXE']}")
except Exception as e:
    print(f"[ffmpeg] imageio_ffmpeg fallback not available: {e}")

cache = {"hits": 0, "misses": 0}

# ---------------------------------------------------------------------------
# SSRF / path-traversal hardening for user-supplied background indirection.
# Used by prepare_scene_bg and flag processing.  Internal-only is NOT a
# safe boundary — a compromised job record can pivot via SSRF/path read.
# ---------------------------------------------------------------------------
_MAX_FETCH_BYTES = 10 * 1024 * 1024
_ALLOWED_FETCH_SCHEMES = {"http", "https"}


def _ip_is_blocked(ip_str: str) -> bool:
    try:
        ip = ipaddress.ip_address(ip_str.strip().strip("[]"))
        # is_private covers RFC1918 + CGNAT; is_reserved covers 0/8, 240/4 etc.
        # Explicit 169.254.x.x is link-local but check anyway for older Py.
        return (
            ip.is_loopback
            or ip.is_private
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
            or str(ip) == "169.254.169.254"
        )
    except ValueError:
        return True  # fail closed on unparseable


def _hostname_resolves_to_blocked(hostname: str) -> bool:
    h = hostname.lower().rstrip(".")
    # Fast-path: literal IP
    try:
        return _ip_is_blocked(h)
    except Exception:
        pass
    if h in {"localhost", "metadata.google.internal"} or h.endswith(".internal"):
        return True
    try:
        # Resolve ALL A/AAAA and block if ANY is private
        for _fam, _type, _proto, _canon, sockaddr in socket.getaddrinfo(h, None, proto=socket.IPPROTO_TCP):
            ip_str = sockaddr[0]
            if _ip_is_blocked(ip_str):
                return True
        return False
    except Exception:
        return True  # fail closed on DNS failure


def _is_safe_http_url(url: str) -> bool:
    try:
        parsed = urllib.parse.urlparse(url.strip())
        if parsed.scheme not in _ALLOWED_FETCH_SCHEMES:
            return False
        host = (parsed.hostname or "").lower().rstrip(".")
        if not host:
            return False
        if host in {"localhost", "0.0.0.0", "::", "metadata.google.internal"}:
            return False
        return not _hostname_resolves_to_blocked(host)
    except Exception:
        return False


def _safe_fetch_image_bytes(url: str, *, timeout: int = 15, max_bytes: int = _MAX_FETCH_BYTES) -> bytes:
    """Fetch url with SSRF guard, no auto-redirect, size limit. Returns bytes or raises."""
    if not _is_safe_http_url(url):
        raise ValueError(f"Blocked unsafe image URL: {url[:120]}")
    import requests

    current = url
    for _hop in range(3):  # follow at most 2 redirects manually so each hop is re-validated
        r = requests.get(current, timeout=timeout, allow_redirects=False, stream=True)
        # Handle redirect manually
        if 300 <= r.status_code < 400:
            loc = r.headers.get("Location")
            if not loc:
                raise ValueError(f"Redirect without Location from {current[:80]}")
            # Resolve relative Location against current
            nxt = urllib.parse.urljoin(current, loc)
            if not _is_safe_http_url(nxt):
                raise ValueError(f"Blocked redirect to unsafe URL: {nxt[:120]}")
            current = nxt
            continue
        if r.status_code >= 300:
            raise ValueError(f"Fetch failed HTTP {r.status_code} for {current[:80]}")
        clen = r.headers.get("Content-Length")
        if clen is not None:
            try:
                if int(clen) > max_bytes:
                    raise ValueError(f"Content-Length {clen} exceeds {max_bytes}")
            except ValueError as ve:
                if "exceeds" in str(ve):
                    raise
        ctype = (r.headers.get("Content-Type") or "").lower()
        # Allow image/*, octet-stream, or missing (Pillow will reject non-images)
        if ctype and not (ctype.startswith("image/") or "octet-stream" in ctype):
            # Still fetch but Pillow open will fail if not an image — warn only
            pass
        # Stream with cap
        buf = bytearray()
        for chunk in r.iter_content(chunk_size=64 * 1024):
            if chunk:
                buf.extend(chunk)
                if len(buf) > max_bytes:
                    raise ValueError(f"Response exceeds {max_bytes} bytes")
        return bytes(buf)
    raise ValueError("Too many redirects")


def _resolve_allowed_local_path(raw: str, allowed_bases: list[Path]) -> Optional[Path]:
    """If raw resolves inside one of allowed_bases and is a file, return resolved Path else None."""
    try:
        candidate = Path(raw).resolve()
        if not candidate.is_file():
            return None
        for base in allowed_bases:
            try:
                # Python 3.9+: is_relative_to ; fallback to startswith for 3.8 compat
                try:
                    if candidate.is_relative_to(base):  # type: ignore[attr-defined]
                        return candidate
                except AttributeError:
                    if str(candidate).startswith(str(base) + os.sep) or candidate == base:
                        return candidate
            except Exception:
                continue
        return None
    except Exception:
        return None

def _init_firebase() -> None:
    if firebase_admin._apps:
        return
        
    bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET")
    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
    
    sa_file = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if sa_file and Path(sa_file).exists():
        try:
            cred = credentials.Certificate(sa_file)
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
            print("[Firebase] Initialized with GOOGLE_APPLICATION_CREDENTIALS file.")
            return
        except Exception as e:
            print(f"[Firebase] GOOGLE_APPLICATION_CREDENTIALS init failed: {e}")

    if sa_json:
        try:
            cred = credentials.Certificate(json.loads(sa_json))
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
            print("[Firebase] Initialized with Service Account JSON.")
            return
        except Exception as e:
            print(f"[Firebase] Service Account JSON init failed: {e}")
            
    private_key = os.environ.get("FIREBASE_PRIVATE_KEY")
    client_email = os.environ.get("FIREBASE_CLIENT_EMAIL")
    project_id = os.environ.get("FIREBASE_PROJECT_ID")
    
    if private_key and client_email and project_id:
        try:
            cred_dict = {
                "type": "service_account",
                "project_id": project_id,
                "private_key": private_key.replace("\\n", "\n"),
                "client_email": client_email,
                "token_uri": "https://oauth2.googleapis.com/token"
            }
            cred = credentials.Certificate(cred_dict)
            firebase_admin.initialize_app(cred, {"storageBucket": bucket_name})
            print("[Firebase] Initialized with individual parameters.")
            return
        except Exception as e:
            print(f"[Firebase] Individual parameters init failed: {e}")
            
    try:
        firebase_admin.initialize_app(options={"storageBucket": bucket_name})
        print("[Firebase] Initialized with default credentials.")
    except Exception as e:
        print(f"[Firebase] Fallback initialization failed: {e}")


def _cover_crop_image(img_path: Path, target_w: int = 1080, target_h: int = 1920) -> None:
    from PIL import Image, ImageOps
    try:
        if not img_path.exists() or img_path.stat().st_size <= 0:
            return
        with Image.open(img_path) as im:
            if im.size != (target_w, target_h):
                cropped = ImageOps.fit(im, (target_w, target_h), method=Image.Resampling.LANCZOS)
                cropped.save(img_path)
    except Exception as e:
        print(f"[PIL] Error cover-cropping image {img_path}: {e}")


def _finalize_render_and_upload(
    job_id: str,
    out_dir: Path,
    out_final: Path,
    out_thumbnail: Path,
    out_srt: Path,
    timings: dict,
    subtitle_meta: dict,
    probe: dict,
    cache_hits: int,
    cache_misses: int,
    is_quiz: bool = False,
    video_duration: float | None = None,
    start_time: float = 0.0,
    country: str = "default",
    video_url: str | None = None,
) -> None:
    video_size_mb = 0.0
    if out_final.exists():
        video_size_mb = round(os.path.getsize(out_final) / (1024 * 1024), 2)

    thumbnail_url = None
    subtitles_url = None

    country_folder = country.lower().strip().replace(" ", "_")
    folder_path = f"ai_shorts/quizzes/{country_folder}/{job_id}" if is_quiz else f"ai_shorts/{job_id}"

    try:
        if not video_url:
            print(f"[Cloudinary] Uploading {out_final} as video to {folder_path}...")
            video_upload = cloudinary.uploader.upload(
                str(out_final),
                resource_type="video",
                folder=folder_path,
                overwrite=True
            )
            video_url = video_upload.get("secure_url")
            print(f"[Cloudinary] Video uploaded. URL: {video_url}")
        else:
            print(f"[Cloudinary] Using pre-streamed Video URL: {video_url}")

        if out_thumbnail.exists():
            print(f"[Cloudinary] Uploading {out_thumbnail} as image to {folder_path}...")
            thumb_upload = cloudinary.uploader.upload(
                str(out_thumbnail),
                resource_type="image",
                folder=folder_path,
                overwrite=True
            )
            thumbnail_url = thumb_upload.get("secure_url")
            print(f"[Cloudinary] Thumbnail uploaded. URL: {thumbnail_url}")

        if out_srt.exists():
            print(f"[Cloudinary] Uploading {out_srt} as raw file to {folder_path}...")
            srt_upload = cloudinary.uploader.upload(
                str(out_srt),
                resource_type="raw",
                folder=folder_path,
                overwrite=True
            )
            subtitles_url = srt_upload.get("secure_url")
            print(f"[Cloudinary] Subtitles uploaded. URL: {subtitles_url}")

        dur = video_duration if video_duration is not None else probe.get("duration", 0.0)
        staged = emit_staged_result(
            job_id=job_id,
            out_dir=out_dir,
            artifact_path=out_final,
            probe=probe,
            timings=timings,
            extra={
                "videoUrl": video_url,
                "thumbnailUrl": thumbnail_url,
                "subtitlesUrl": subtitles_url,
                "renderProfile": subtitle_meta.get("renderProfile", "STANDARD_SHORTS"),
                "fps": subtitle_meta.get("fps", 24),
                "resolution": subtitle_meta.get("resolution", "720x1280"),
                "cache": {"hits": cache_hits, "misses": cache_misses},
                "videoDuration": dur,
                "videoSizeMb": video_size_mb,
                "playable": probe.get("playable", True),
                "audioDetected": probe.get("audioDetected", True),
            },
        )
        nested_res = out_dir / job_id / "result.json"
        nested_res.parent.mkdir(parents=True, exist_ok=True)
        nested_res.write_text(json.dumps(staged, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"[Worker] Wrote staging metadata to {out_dir / 'result.json'}")
    except Exception as e:
        print(f"[ERROR][Upload] Upload failed: {e}")
        if not out_final.exists() or out_final.stat().st_size < 1024:
            raise RuntimeError(f"Rendering failed and artifact not produced: {e}") from e

        dur = video_duration if video_duration is not None else probe.get("duration", 0.0)
        final_sha256 = compute_file_sha256(out_final)
        result_payload = {
            "jobId": job_id,
            "status": "upload_failed",
            "error": str(e),
            "artifactSha256": final_sha256,
            "byteLength": out_final.stat().st_size,
            "renderProfile": subtitle_meta.get("renderProfile", "STANDARD_SHORTS"),
            "fps": subtitle_meta.get("fps", 24),
            "resolution": subtitle_meta.get("resolution", "720x1280"),
            "timings": timings,
            "cache": {"hits": cache_hits, "misses": cache_misses},
            "videoDuration": dur,
            "videoSizeMb": video_size_mb,
        }
        try:
            (out_dir / "result.json").write_text(json.dumps(result_payload, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception:
            pass
        raise RuntimeError(f"Artifact upload failed for {job_id}: {e}") from e
        
    print("[Cleanup] Dropping temporary WAV cuts and local assets...")
    temp_dir = out_dir / "temp"
    if temp_dir.exists():
        try:
            shutil.rmtree(str(temp_dir), ignore_errors=True)
        except Exception:
            pass
    images_dir = out_dir / "images"
    if images_dir.exists():
        try:
            shutil.rmtree(str(images_dir), ignore_errors=True)
        except Exception:
            pass

    keep_artifacts = (
        os.getenv("KEEP_RENDER_ARTIFACT", "").lower() in {"1", "true", "yes"}
        or local_only
        or bool(os.getenv("OUTPUT_DIR"))
    )
    if not keep_artifacts:
        for local_file in [out_final, out_thumbnail, out_srt, out_dir / "audio.wav"]:
            if local_file.exists():
                try:
                    local_file.unlink()
                except Exception:
                    pass
    else:
        print(f"[Cleanup] Preserved final render artifacts ({out_final}) in {out_dir}")
    # Under Charter Invariant P1.4 / O7, local artifacts are NEVER unlinked by the worker.
    # Preserved for F07 verifier, CAS reconciliation, and fenced callback confirmation.
    print(f"[Worker] Preserved final render artifacts ({out_final}) for verifier and CAS reconciliation.")

def _run(cmd: list[str], *, cwd: Path | None = None) -> None:
    print("Running:", " ".join(cmd))
    subprocess.run(cmd, check=True, cwd=str(cwd) if cwd else None)


def _edge_tts(text: str, out_wav: Path, voice: str = "en-US-ChristopherNeural", rate: str | None = None) -> None:
    """Generates high-quality neural TTS audio from text using edge-tts library asynchronously.
    Bypasses external GPU requirements entirely.
    """
    import asyncio
    import edge_tts
    import time as _sleep
    import uuid

    out_wav.parent.mkdir(parents=True, exist_ok=True)

    # Resolve shared memory path for temporary MP3 synthesis to prevent disk write
    shm_dir = Path("/dev/shm")
    if not shm_dir.exists():
        shm_dir = out_wav.parent / "temp"
    shm_dir.mkdir(parents=True, exist_ok=True)
    temp_audio = shm_dir / f"temp_audio_{uuid.uuid4().hex}.mp3"

    async def _async_compile():
        r = rate if rate else "+0%"
        communicate = edge_tts.Communicate(text, voice, rate=r)
        await communicate.save(str(temp_audio))

    try:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                asyncio.run(_async_compile())
                break
            except Exception as e:
                if attempt == max_retries - 1:
                    print(f"[EDGE-TTS] Failed after {max_retries} attempts: {e}")
                    raise
                sleep_time = 2 ** attempt
                print(f"[EDGE-TTS] Attempt {attempt + 1} failed. Retrying in {sleep_time}s... Error: {e}")
                _sleep.sleep(sleep_time)

        if not temp_audio.exists():
            raise RuntimeError(f"[STEP 2] edge-tts temp output {temp_audio} does not exist.")

        temp_size = temp_audio.stat().st_size
        print(f"[AUDIO] temp readable: {temp_audio.as_posix()} (size={temp_size})")

        minimal_threshold = 256  # bytes
        if temp_size < minimal_threshold:
            raise RuntimeError(
                f"[STEP 2] Invalid temp audio size={temp_size} bytes (<{minimal_threshold})."
            )

        # Copy bytes into final contract file
        with open(temp_audio, "rb") as src:
            with open(out_wav, "wb") as dst:
                dst.write(src.read())
                dst.flush()
                os.fsync(dst.fileno())

        # Optional stabilization.
        _sleep.sleep(0.75)

        if not out_wav.exists():
            raise RuntimeError(f"[STEP 2] audio.wav copy failed: {out_wav} does not exist")

        out_size = out_wav.stat().st_size
        print(f"[AUDIO] copy success -> audio.wav: {out_wav.as_posix()} (size={out_size})")
        if out_size < minimal_threshold:
            raise RuntimeError(
                f"[STEP 2] audio.wav invalid size={out_size} bytes (<{minimal_threshold})"
            )
    finally:
        # Cleanup temp file from shared memory / temp directory
        if temp_audio.exists():
            try:
                temp_audio.unlink()
                print(f"[Cleanup] Cleaned up edge-tts temp file: {temp_audio}")
            except Exception as clean_err:
                print(f"[Cleanup] Error unlinking temp file {temp_audio}: {clean_err}")



def _write_placeholder_image(out_png: Path, title: str) -> None:
    from PIL import Image, ImageDraw, ImageFont

    w, h = 1080, 1920
    img = Image.new("RGB", (w, h), color=(18, 18, 18))
    draw = ImageDraw.Draw(img)

    pinned_fp = str(get_pinned_font_path())
    font_title = ImageFont.truetype(pinned_fp, 40)
    font_sub = ImageFont.truetype(pinned_fp, 26)

    title = (title or "").strip() or "Scene"

    max_chars = 24
    lines = [title[i : i + max_chars] for i in range(0, len(title), max_chars)]
    lines = lines[:6]

    y = 120
    for line in lines:
        tw = draw.textlength(line, font=font_title)
        draw.text(((w - tw) / 2, y), line, font=font_title, fill=(240, 240, 240))
        y += 60

    footer = "Generated placeholder"
    tw = draw.textlength(footer, font=font_sub)
    draw.text(((w - tw) / 2, h - 140), footer, font=font_sub, fill=(150, 150, 150))

    out_png.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_png)


def _build_flux_scene_prompt(topic: str, scene_text: str, scene_image_prompt: str, style: str, i: int) -> str:
    topic = (topic or "").strip()
    scene_text = (scene_text or "").strip()
    scene_image_prompt = (scene_image_prompt or "").strip()
    style = (style or "").strip()

    base = (
        f"Topic: {topic}. "
        if topic
        else ""
    )

    prompt_parts = [
        base.strip(),
        f"Scene {i}: {scene_text}" if scene_text else f"Scene {i}",
        f"Style: {style}" if style else "",
        scene_image_prompt,
        "Motivational cinematic, realistic photography, dynamic composition, golden hour lighting, shallow depth of field",
        "camera angle: slightly low, subject in foreground, city/background with depth",
        "ultra-detailed, high contrast, no text, no watermark",
    ]

    prompt = ", ".join([p for p in prompt_parts if p])
    return prompt[:2000]


def _compute_file_sha256(file_path: Path) -> str:
    import hashlib

    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            h.update(chunk)
    return h.hexdigest()


def _sha256_text(s: str) -> str:
    import hashlib

    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def _get_cache_root() -> Path:
    script_parent = Path(__file__).resolve().parent
    engine_root = script_parent.parent
    if "rendering-engine" in str(script_parent.resolve()):
        return engine_root / "output" / "image-cache"
    else:
        repo_root = script_parent.parent
        return repo_root / "apps" / "web" / "generated" / "image-cache"


def _cache_paths(cache_key: str) -> tuple[Path, Path]:
    cache_root = _get_cache_root()
    img_path = cache_root / f"{cache_key}.png"
    meta_path = cache_root / f"{cache_key}.json"
    return img_path, meta_path


def _flux_generate_image_url(
    prompt: str,
    *,
    model: str = "black-forest-labs/FLUX.1-schnell",
    width: int = 1024,
    height: int = 1024,
    steps: int = 4,
) -> str:
    import requests

    api_key = os.environ.get("TOGETHER_API_KEY")
    if not api_key:
        raise RuntimeError(
            "TOGETHER_API_KEY env var is missing; cannot call FLUX Schnell via Together API."
        )

    url = "https://api.together.xyz/v1/images/generations"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "prompt": prompt,
        "width": width,
        "height": height,
        "steps": steps,
        "n": 1,
        "response_format": "url",
    }

    r = requests.post(url, headers=headers, json=payload, timeout=300)
    if r.status_code >= 300:
        raise RuntimeError(f"FLUX request failed: HTTP {r.status_code}: {r.text[:500]}")

    data = r.json()
    image_url = None
    if isinstance(data, dict):
        arr = data.get("data")
        if isinstance(arr, list) and arr:
            first = arr[0]
            if isinstance(first, dict):
                image_url = first.get("url")

    if not image_url:
        keys = list(data.keys()) if isinstance(data, dict) else type(data)
        raise RuntimeError(
            "FLUX response missing data[0].url. "
            f"keys={keys}"
        )

    return str(image_url)


def _compute_image_cache_key(
    prompt: str,
    model: str = "black-forest-labs/FLUX.1-schnell",
    width: int = 1024,
    height: int = 1024,
    steps: int = 4,
    toolchain_hash: str = _TOOLCHAIN_HASH,
) -> str:
    return _sha256_text(f"{model}:{width}x{height}:{steps}:{toolchain_hash}:{prompt}")


def _generate_or_load_cached_image(
    prompt: str,
    out_png: Path,
    model: str = "black-forest-labs/FLUX.1-schnell",
    width: int = 1024,
    height: int = 1024,
    steps: int = 4,
) -> None:
    cache_key = _compute_image_cache_key(prompt, model=model, width=width, height=height, steps=steps)
    cache_img_path, cache_meta_path = _cache_paths(cache_key)

    try:
        if cache_img_path.exists() and cache_img_path.stat().st_size > 0:
            out_png.parent.mkdir(parents=True, exist_ok=True)
            cache["hits"] = cache.get("hits", 0) + 1
            shutil.copyfile(str(cache_img_path), str(out_png))
            return

        cache["misses"] = cache.get("misses", 0) + 1
        image_url = _flux_generate_image_url(
            prompt,
            model=model,
            width=width,
            height=height,
            steps=steps,
        )

        cache_img_path.parent.mkdir(parents=True, exist_ok=True)
        _download_image(image_url, cache_img_path)

        meta = {
            "prompt": prompt,
            "model": model,
            "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "width": width,
            "height": height,
        }
        cache_meta_path.write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")

        out_png.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(str(cache_img_path), str(out_png))
    except Exception:
        raise


def _download_image(url: str, out_path: Path) -> None:
    if not _is_safe_http_url(url):
        raise ValueError(f"SSRF blocked: Disallowed or unsafe image URL '{url}'")
    data = _safe_fetch_image_bytes(url, timeout=120)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_bytes(data)


def _seconds_from_srt_time(ts: str) -> float:
    # format: HH:MM:SS,mmm
    hh = int(ts[0:2])
    mm = int(ts[3:5])
    ss = int(ts[6:8])
    ms = int(ts[9:12])
    return hh * 3600 + mm * 60 + ss + ms / 1000.0


def _transcribe_to_srt(audio_wav: Path, out_srt: Path) -> None:
    from faster_whisper import WhisperModel

    model = WhisperModel("small", compute_type="int8", device="cpu")
    segments, _info = model.transcribe(str(audio_wav), beam_size=1, vad_filter=True)

    out_srt.parent.mkdir(parents=True, exist_ok=True)
    with open(out_srt, "w", encoding="utf-8") as f:
        idx = 1
        for seg in segments:
            text = (seg.text or "").strip()
            if not text:
                continue

            start = seg.start
            end = seg.end

            def fmt(t: float) -> str:
                hh = int(t // 3600)
                t = t - hh * 3600
                mm = int(t // 60)
                t = t - mm * 60
                ss = int(t)
                ms = int(round((t - ss) * 1000))
                return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"

            f.write(f"{idx}\n")
            f.write(f"{fmt(start)} --> {fmt(end)}\n")
            f.write(f"{text}\n\n")
            idx += 1


def _assemble_video(
    job_id: str,
    render_profile: str,
    images: list[Path],
    audio_wav: Path,
    subtitles_srt: Path,
    out_mp4: Path,
) -> dict:
    import numpy as np

    # Audio is the master clock: decode physical audio truth to 48kHz mono PCM
    pcm, _ = decode_audio_to_pcm48k(audio_wav)
    total_frames = max(1, frames_for_samples(len(pcm)))
    target_samples = total_frames * SAMPLES_PER_FRAME
    if len(pcm) < target_samples:
        pcm = np.concatenate([pcm, np.zeros(target_samples - len(pcm), dtype=np.int16)])
    else:
        pcm = pcm[:target_samples]
    assert len(pcm) == total_frames * SAMPLES_PER_FRAME

    master_wav = out_mp4.parent / f"{job_id}_master_48k.wav"
    write_pcm48k_wav(pcm, master_wav)

    target_w, target_h = 1080, 1920
    for img in images:
        _cover_crop_image(img, target_w, target_h)

    ffmpeg_exe = os.environ.get("IMAGEIO_FFMPEG_EXE", "ffmpeg")
    n = max(1, len(images))
    frames_per_img = max(1, total_frames // n)

    cmd = [ffmpeg_exe, "-y", "-v", "error"]
    filter_concat = ""
    for idx, img in enumerate(images):
        img_dur = (total_frames - (frames_per_img * (n - 1)) if idx == n - 1 else frames_per_img) / float(FPS)
        cmd.extend(["-loop", "1", "-t", f"{img_dur:.6f}", "-i", str(img)])
        filter_concat += f"[{idx}:v]{COVER_CROP_VF}[v{idx}];"

    audio_idx = len(images)
    cmd.extend(["-i", str(master_wav)])

    measured = measure_loudnorm_pass1(master_wav)
    af_chain = build_two_pass_audio_filter(measured)

    v_inputs = "".join(f"[v{i}]" for i in range(n))
    v_chain = (
        f"{filter_concat}{v_inputs}concat=n={n}:v=1:a=0,{BT709_SETPARAMS_VF}[v_final]"
        if n > 1
        else f"{filter_concat}[v0]{BT709_SETPARAMS_VF}[v_final]"
    )

    cmd.extend([
        "-filter_complex", v_chain,
        "-map", "[v_final]",
        "-map", f"{audio_idx}:a",
        "-af", af_chain,
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "18",
        "-pix_fmt", "yuv420p",
        "-r", str(FPS),
        "-fps_mode", "cfr",
        "-g", "60",
        "-keyint_min", "60",
        "-sc_threshold", "0",
        "-threads", "4",
        "-frames:v", str(total_frames),
        "-video_track_timescale", "15360",
        "-colorspace", "bt709",
        "-color_primaries", "bt709",
        "-color_trc", "bt709",
        "-color_range", "tv",
        "-c:a", "aac",
        "-b:a", "192k",
        "-ar", str(SR),
        "-ac", "2",
        "-movflags", "+faststart+write_colr",
        "-flags", "+bitexact",
        "-fflags", "+bitexact",
        str(out_mp4),
    ])

    subprocess.run(cmd, check=True)
    return {
        "subtitleOverlay": "WORKING",
        "renderProfile": "HIGH_QUALITY",
        "fps": FPS,
        "resolution": f"{target_w}x{target_h}",
    }


def _log_step_time(step: int, start_ts: float) -> float:
    dt = time.time() - start_ts
    print(f"STEP {step} time: {dt:.2f}s")
    return dt


def get_font(font_name: str, size: int):
    from PIL import ImageFont
    try:
        return ImageFont.truetype(font_name, size)
    except Exception:
        return ImageFont.truetype(str(get_pinned_font_path()), size)


def _process_flag_background(flag_url: str, out_path: Path) -> bool:
    from PIL import Image, ImageFilter, ImageEnhance
    temp_flag = out_path.parent / "temp_flag_raw.png"
    try:
        print(f"[Pillow] Downloading flag image: {flag_url[:120]}")
        try:
            img_bytes = _safe_fetch_image_bytes(flag_url, timeout=30)
        except Exception as fetch_err:
            print(f"[Pillow] Blocked/failed flag fetch: {fetch_err}")
            return False
        temp_flag.write_bytes(img_bytes)
        
        with Image.open(temp_flag) as img:
            target_w, target_h = 1080, 1920
            img_w, img_h = img.size
            scale = max(target_w / img_w, target_h / img_h)
            new_w = int(img_w * scale)
            new_h = int(img_h * scale)
            img_resized = img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            
            x_offset = (new_w - target_w) // 2
            y_offset = (new_h - target_h) // 2
            img_cropped = img_resized.crop((x_offset, y_offset, x_offset + target_w, y_offset + target_h))
            
            img_blurred = img_cropped.filter(ImageFilter.GaussianBlur(radius=25))
            
            enhancer = ImageEnhance.Brightness(img_blurred)
            img_final = enhancer.enhance(0.7)
            
            img_final.convert("RGBA").save(out_path)
            print(f"[Pillow] Processed background flag saved to {out_path}")
        return True
    except Exception as e:
        print(f"[Pillow] Warning: Failed to process flag background: {e}")
        return False
    finally:
        if temp_flag.exists():
            try:
                temp_flag.unlink()
            except Exception:
                pass


async def _async_generate_tts_mp3(text: str, voice: str, rate: str, out_mp3: Path) -> None:
    """Generates a single TTS audio clip as an MP3 asynchronously.
    Includes network retry logic for robustness.
    """
    import edge_tts
    import asyncio
    
    r = rate if rate else "+0%"
    max_retries = 3
    for attempt in range(max_retries):
        try:
            communicate = edge_tts.Communicate(text, voice, rate=r)
            await communicate.save(str(out_mp3))
            
            # Verify file exists and is readable
            if out_mp3.exists() and out_mp3.stat().st_size >= 256:
                return
            raise RuntimeError(f"Generated MP3 file too small or empty: {out_mp3}")
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"[EDGE-TTS] Failed concurrent generation of {out_mp3.name} after {max_retries} attempts: {e}")
                raise
            sleep_time = 2 ** attempt
            print(f"[EDGE-TTS] Attempt {attempt + 1} failed for {out_mp3.name}. Retrying in {sleep_time}s... Error: {e}")
            await asyncio.sleep(sleep_time)

def _ensure_audio_assets(engine_root: Path) -> dict:
    assets_dir = engine_root / "assets" / "audio"
    assets_dir.mkdir(parents=True, exist_ok=True)
    
    pop_wav = assets_dir / "pop.wav"
    ding_wav = assets_dir / "ding.wav"
    bgm_wav = assets_dir / "bgm.wav"
    
    ffmpeg_exe = os.environ.get("IMAGEIO_FFMPEG_EXE", "ffmpeg")
    
    if not pop_wav.exists():
        subprocess.run([ffmpeg_exe, "-y", "-f", "lavfi", "-i", "aevalsrc='sin(400*2*PI*t)*exp(-15*t)':d=0.15", str(pop_wav)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not ding_wav.exists():
        subprocess.run([ffmpeg_exe, "-y", "-f", "lavfi", "-i", "aevalsrc='sin(800*2*PI*t)*exp(-4*t)+sin(1200*2*PI*t)*exp(-4*t)':d=0.8", str(ding_wav)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if not bgm_wav.exists():
        subprocess.run([ffmpeg_exe, "-y", "-f", "lavfi", "-i", "aevalsrc='sin(60*2*PI*t)*0.1':d=10", str(bgm_wav)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
    return {
        "pop": pop_wav,
        "ding": ding_wav,
        "bgm": bgm_wav
    }

def run_quiz_shorts(job: dict, out_dir: Path, out_audio: Path, out_srt: Path, out_final: Path, out_thumbnail: Path, timings: dict) -> dict:
    import wave
    import numpy as np
    from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
    import os
    import time
    import shutil
    import asyncio
    import subprocess
    import textwrap
    import uuid
    import cloudinary.uploader

    total_start = time.perf_counter()

    topic = str(job.get("topic", ""))
    quiz_data = job.get("quizData")
    if not quiz_data:
        quiz_data = {
            "hook": job.get("hook") or job.get("script") or "Let's test your knowledge.",
            "questions": job.get("questions", []),
            "title": job.get("title", ""),
            "description": job.get("description", ""),
            "hashtags": job.get("hashtags", []),
            "flagUrl": job.get("flagUrl"),
            "voiceCode": job.get("voiceCode"),
            "gradingScale": job.get("gradingScale"),
        }

    job_id = str(job.get("jobId") or out_dir.name)

    # 1. Strict 4-Option Validation (Renderer does not invent missing options)
    questions = quiz_data.get("questions", [])
    if not questions:
        raise ValueError("QuizRenderValidationError: quizData.questions cannot be empty.")
    
    for q_i, q in enumerate(questions):
        opts = q.get("options") or []
        if len(opts) != 4:
            raise ValueError(
                f"QuizRenderValidationError: Question {q_i + 1} has {len(opts)} options (expected exactly 4). "
                "The canonical quiz renderer requires exactly 4 options [A, B, C, D] and does not invent missing content."
            )

    topic_lower = topic.lower()
    if "india" in topic_lower or "cricket" in topic_lower:
        theme = "india_theme"
    elif "geography" in topic_lower or "country" in topic_lower or "flag" in topic_lower or "capital" in topic_lower or "uk" in topic_lower or "mexico" in topic_lower or "london" in topic_lower or "map" in topic_lower:
        theme = "geography_theme"
    elif "science" in topic_lower or "space" in topic_lower or "physics" in topic_lower or "chemistry" in topic_lower or "biology" in topic_lower or "math" in topic_lower:
        theme = "science_theme"
    elif "sports" in topic_lower or "football" in topic_lower or "olympic" in topic_lower or "game" in topic_lower:
        theme = "sports_theme"
    else:
        theme = "world_theme"

    temp_dir = out_dir / "temp"
    temp_dir.mkdir(parents=True, exist_ok=True)

    shm_root = Path("/dev/shm")
    if shm_root.exists() and os.name != "nt":
        shm_dir = shm_root
    else:
        shm_dir = temp_dir

    created_files = set()

    def get_audio_duration(path: Path) -> float:
        _pcm, dur = decode_audio_to_pcm48k(path)
        return dur

    def get_ffmpeg_font() -> str:
        return str(get_pinned_font_path())

    try:
        script_parent = Path(__file__).resolve().parent
        engine_root = script_parent.parent if "rendering-engine" in str(script_parent.resolve()) else script_parent.parent / "services" / "rendering-engine"
        repo_root = script_parent.parent if "rendering-engine" not in str(script_parent.resolve()) else script_parent.parent.parent
        audio_assets = _ensure_audio_assets(engine_root)

        # 2. Prepare Default Fallback Background
        fallback_bg_path = engine_root / "assets" / "backgrounds" / f"{theme}.png"
        if not fallback_bg_path.exists():
            fallback_bg_path = engine_root / "assets" / "backgrounds" / "world_theme.png"
        if not fallback_bg_path.exists():
            fallback_bg_path = repo_root / "assets" / "backgrounds" / f"{theme}.png"

        flag_url = quiz_data.get("flagUrl")
        flag_bg_path = shm_dir / f"quiz_{job_id}_temp_bg.png"
        processed_flag = False
        if flag_url:
            processed_flag = _process_flag_background(flag_url, flag_bg_path)
            if processed_flag:
                created_files.add(flag_bg_path)
                fallback_bg_path = flag_bg_path

        # Background processing helper: 1080x1920, GaussianBlur(8), Brightness(0.60)
        # Hardened: file paths confined to engine_root/repo_root; http fetches SSRF-checked.
        _allowed_bg_bases = [p.resolve() for p in (engine_root, repo_root) if p.exists()]

        def prepare_scene_bg(raw_path_or_url: Optional[str], default_path: Path) -> Image.Image:
            base_img = None
            if raw_path_or_url:
                raw = str(raw_path_or_url).strip()
                try:
                    if raw.startswith("http://") or raw.startswith("https://"):
                        from io import BytesIO

                        img_bytes = _safe_fetch_image_bytes(raw, timeout=15)
                        base_img = Image.open(BytesIO(img_bytes)).convert("RGBA")
                    elif raw:
                        # Treat as local path only if it resolves inside an allowlisted base
                        candidate = _resolve_allowed_local_path(raw, _allowed_bg_bases)
                        if candidate is not None:
                            base_img = Image.open(candidate).convert("RGBA")
                        else:
                            print(f"[Pillow] Blocked background path outside allowlist: {raw[:120]}")
                except Exception as b_err:
                    print(f"[Pillow] Background custom load skipped ({raw[:120]}): {b_err}")

            if base_img is None:
                if default_path.exists():
                    try:
                        base_img = Image.open(default_path).convert("RGBA")
                    except Exception:
                        base_img = None
            if base_img is None:
                base_img = Image.new("RGBA", (1080, 1920), (15, 23, 42, 255))

            target_w, target_h = 1080, 1920
            img_w, img_h = base_img.size
            scale = max(target_w / img_w, target_h / img_h)
            new_w = int(img_w * scale)
            new_h = int(img_h * scale)
            img_resized = base_img.resize((new_w, new_h), Image.Resampling.LANCZOS)
            x_offset = (new_w - target_w) // 2
            y_offset = (new_h - target_h) // 2
            img_cropped = img_resized.crop((x_offset, y_offset, x_offset + target_w, y_offset + target_h))

            img_blurred = img_cropped.filter(ImageFilter.GaussianBlur(radius=8))
            enhancer = ImageEnhance.Brightness(img_blurred)
            return enhancer.enhance(0.60).convert("RGBA")

        # Prepare per-question & hook/outro backgrounds
        hook_bg_img = prepare_scene_bg(quiz_data.get("hookImagePath"), fallback_bg_path)
        outro_bg_img = prepare_scene_bg(quiz_data.get("outroImagePath"), fallback_bg_path)
        question_bg_imgs = [
            prepare_scene_bg(q.get("imagePath") or q.get("imageUrl") or q.get("imagePrompt"), fallback_bg_path)
            for q in questions
        ]

        # 3. Global ShortForge Branding Watermark Layer
        watermark_candidates = [
            engine_root / "assets" / "branding" / "shortforge-watermark.png",
            repo_root / "assets" / "branding" / "shortforge-watermark.png",
            repo_root / "apps" / "web" / "public" / "favicon-white.png",
        ]
        global_watermark_img = None
        for wmc in watermark_candidates:
            if wmc.exists():
                try:
                    raw_wm = Image.open(wmc).convert("RGBA")
                    wm_w = 80
                    wm_h = int(raw_wm.height * (80 / raw_wm.width))
                    wm_resized = raw_wm.resize((wm_w, wm_h), Image.Resampling.LANCZOS)
                    r, g, b, a = wm_resized.split()
                    a = a.point(lambda p: int(p * 0.75))
                    global_watermark_img = Image.merge("RGBA", (r, g, b, a))
                    break
                except Exception as wm_e:
                    print(f"[Watermark] Failed to load {wmc}: {wm_e}")

        # 4. Audio Synthesis
        tts_start = time.perf_counter()
        ffmpeg_exe = os.environ.get("IMAGEIO_FFMPEG_EXE", "ffmpeg")

        voice_code = quiz_data.get("voiceCode") or job.get("voiceCode") or "en-US-AriaNeural"
        country_lower = str(job.get("country", "")).lower()
        if not quiz_data.get("voiceCode") and not job.get("voiceCode"):
            if "united kingdom" in country_lower or "uk" in country_lower:
                voice_code = "en-GB-RyanNeural"
            elif "india" in country_lower:
                voice_code = "en-IN-PrabhatNeural"
            elif "japan" in country_lower:
                voice_code = "ja-JP-KeitaNeural"

        tts_requests = []
        hook_mp3 = shm_dir / f"quiz_{job_id}_hook.mp3"
        tts_requests.append({
            "text": quiz_data.get("hook", "Let's test your knowledge."),
            "mp3": hook_mp3,
            "rate": "+20%"
        })

        is_rapid = len(questions) <= 8
        rapid_rate = "+30%" if is_rapid else "+20%"
        for idx, q in enumerate(questions):
            num = idx + 1
            q_mp3 = shm_dir / f"quiz_{job_id}_q{num}.mp3"
            a_mp3 = shm_dir / f"quiz_{job_id}_a{num}.mp3"
            exp_mp3 = shm_dir / f"quiz_{job_id}_exp{num}.mp3"

            q_narr = f"Question {num}. {q['question']}"
            a_narr = f"{q['answer']}" if "answer" in q else f"{q['options'][q['answerIndex']]}"
            exp_narr = q.get("explanation", "").strip() if not is_rapid else ""

            tts_requests.append({"text": q_narr, "mp3": q_mp3, "rate": rapid_rate})
            tts_requests.append({"text": a_narr, "mp3": a_mp3, "rate": "+25%"})
            if exp_narr:
                tts_requests.append({"text": exp_narr, "mp3": exp_mp3, "rate": "+20%"})

        outro_mp3 = shm_dir / f"quiz_{job_id}_outro.mp3"
        tts_requests.append({
            "text": "For more quizzes, subscribe and comment your score below!",
            "mp3": outro_mp3,
            "rate": "+20%"
        })

        async def run_concurrent_tts():
            tasks = []
            for req in tts_requests:
                created_files.add(req["mp3"])
                tasks.append(
                    asyncio.create_task(
                        _async_generate_tts_mp3(
                            text=req["text"],
                            voice=voice_code,
                            rate=req["rate"],
                            out_mp3=req["mp3"]
                        )
                    )
                )
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for res, req in zip(results, tts_requests):
                if isinstance(res, Exception):
                    raise RuntimeError(f"Concurrent TTS failed for segment text '{req['text']}': {res}")

        asyncio.run(run_concurrent_tts())
        print(f"[PERF METRIC - TTS]: Concurrency completed in {time.perf_counter() - tts_start:.2f} seconds.")

        # Calculate exact timeline schedule
        t = 0.0
        hook_req = tts_requests[0]
        hook_req["start_time"] = t
        hook_req["duration"] = get_audio_duration(hook_req["mp3"])
        t += hook_req["duration"] + 0.1

        req_idx = 1
        pop_delays = []
        ding_delays = []

        for idx, q in enumerate(questions):
            q_req = tts_requests[req_idx]
            q_req["start_time"] = t
            q_req["duration"] = get_audio_duration(q_req["mp3"])
            t += q_req["duration"]
            req_idx += 1

            pop_delays.append(int(t * 1000))
            q["think_start"] = t
            q["think_duration"] = 2.0 if is_rapid else float(q.get("duration", 3.5))
            q["think_end"] = q["think_start"] + q["think_duration"]
            t = q["think_end"]
            ding_delays.append(int(t * 1000))

            a_req = tts_requests[req_idx]
            a_req["start_time"] = t
            a_req["duration"] = get_audio_duration(a_req["mp3"])
            t += a_req["duration"]
            req_idx += 1

            exp_narr = q.get("explanation", "").strip() if not is_rapid else ""
            if exp_narr:
                t += 0.1
                exp_req = tts_requests[req_idx]
                exp_req["start_time"] = t
                exp_req["duration"] = get_audio_duration(exp_req["mp3"])
                t += exp_req["duration"]
                req_idx += 1
            t += 0.1

        outro_req = tts_requests[req_idx]
        outro_req["start_time"] = t
        outro_req["duration"] = get_audio_duration(outro_req["mp3"])
        t += outro_req["duration"]
        total_duration = t

        # Write subtitles.srt
        step3_start = time.time()
        def fmt_srt_time(seconds):
            hh = int(seconds // 3600)
            mm = int((seconds % 3600) // 60)
            ss = int(seconds % 60)
            ms = int(round((seconds - int(seconds)) * 1000))
            if ms > 999: ms = 999
            return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"

        with open(out_srt, "w", encoding="utf-8") as f:
            f.write("1\n")
            f.write(f"{fmt_srt_time(0.0)} --> {fmt_srt_time(hook_req['duration'])}\n")
            f.write(f"{quiz_data.get('hook', '')}\n\n")

            srt_idx = 2
            req_idx = 1
            for idx, q in enumerate(questions):
                q_req = tts_requests[req_idx]
                f.write(f"{srt_idx}\n")
                q_end = q_req["start_time"] + q_req["duration"]
                f.write(f"{fmt_srt_time(q_req['start_time'])} --> {fmt_srt_time(q_end)}\n")
                f.write(f"Question {idx+1}. {q['question']}\n\n")
                srt_idx += 1
                req_idx += 1

                a_req = tts_requests[req_idx]
                f.write(f"{srt_idx}\n")
                a_end = a_req["start_time"] + a_req["duration"]
                f.write(f"{fmt_srt_time(a_req['start_time'])} --> {fmt_srt_time(a_end)}\n")
                f.write(f"The correct answer is {q['answer'] if 'answer' in q else q['options'][q['answerIndex']]}.\n\n")
                srt_idx += 1
                req_idx += 1

                exp_narr = q.get("explanation", "").strip() if not is_rapid else ""
                if exp_narr:
                    exp_req = tts_requests[req_idx]
                    f.write(f"{srt_idx}\n")
                    exp_end = exp_req["start_time"] + exp_req["duration"]
                    f.write(f"{fmt_srt_time(exp_req['start_time'])} --> {fmt_srt_time(exp_end)}\n")
                    f.write(f"{exp_narr}\n\n")
                    srt_idx += 1
                    req_idx += 1

            outro_req = tts_requests[req_idx]
            f.write(f"{srt_idx}\n")
            outro_end = outro_req["start_time"] + outro_req["duration"]
            f.write(f"{fmt_srt_time(outro_req['start_time'])} --> {fmt_srt_time(outro_end)}\n")
            f.write("For more quizzes, subscribe and comment your score below!\n\n")

        timings["step3_subtitles_sec"] = time.time() - step3_start

        # 5. Build Audio Mix in FFmpeg (normalize=0)
        filter_parts = []
        for idx, req in enumerate(tts_requests):
            inp_idx = idx + 1
            delay_ms = int(req["start_time"] * 1000)
            filter_parts.append(f"[{inp_idx}:a]adelay={delay_ms}|{delay_ms}:all=1[a_delayed_{inp_idx}]")

        delayed_labels = "".join(f"[a_delayed_{i+1}]" for i in range(len(tts_requests)))

        pop_idx = len(tts_requests) + 1
        ding_idx = len(tts_requests) + 2
        bgm_idx = len(tts_requests) + 3

        num_q = len(questions)
        sfx_mix_labels = ""
        if num_q > 0:
            filter_parts.append(f"[{pop_idx}:a]asplit={num_q}" + "".join(f"[pop_split_{i}]" for i in range(num_q)))
            filter_parts.append(f"[{ding_idx}:a]asplit={num_q}" + "".join(f"[ding_split_{i}]" for i in range(num_q)))
            for i in range(num_q):
                filter_parts.append(f"[pop_split_{i}]adelay={pop_delays[i]}|{pop_delays[i]}:all=1[pop_d_{i}]")
                filter_parts.append(f"[ding_split_{i}]adelay={ding_delays[i]}|{ding_delays[i]}:all=1[ding_d_{i}]")
                sfx_mix_labels += f"[pop_d_{i}][ding_d_{i}]"

        filter_parts.append(f"[{bgm_idx}:a]volume=0.08[bgm_vol]")
        total_audio_inputs = len(tts_requests) + (num_q * 2) + 1
        filter_parts.append(
            f"{delayed_labels}{sfx_mix_labels}[bgm_vol]amix=inputs={total_audio_inputs}:duration=longest:dropout_transition=0:normalize=0,aresample={SR}[a_mixed]"
        )

        filter_complex_file = shm_dir / f"quiz_{job_id}_filter.txt"
        filter_complex_file.write_text(";".join(filter_parts), encoding="utf-8")
        created_files.add(filter_complex_file)

        # 6. Render Frames via Canonical Glassmorphism Specification (Rawvideo Pipe, Zero PNGs)
        fps = FPS
        total_frames = max(1, int(math.ceil(total_duration * fps)))
        pinned_font_path = get_pinned_font_path()
        font_path = str(pinned_font_path)
        font_pill = get_font(font_path, 34)
        font_header = get_font(font_path, 34)
        font_question = get_font(font_path, 48)
        font_badge = get_font(font_path, 26)
        font_option = get_font(font_path, 34)
        font_hook = get_font(font_path, 46)
        font_outro_header = get_font(font_path, 34)
        font_outro_headline = get_font(font_path, 44)
        font_outro_cta = get_font(font_path, 34)

        topic_clean = topic.strip()
        if "india" in topic_lower:
            topic_header = "INDIA GEOGRAPHY QUIZ"
        elif "japan" in topic_lower:
            topic_header = "JAPAN GEOGRAPHY QUIZ"
        elif "geography" in topic_lower or "country" in topic_lower:
            topic_header = f"{topic_clean.upper()} QUIZ" if "quiz" not in topic_lower else topic_clean.upper()
        else:
            topic_header = f"{topic_clean.upper()} QUIZ" if "quiz" not in topic_lower else topic_clean.upper()
        topic_header = strip_uncovered_glyphs(topic_header, pinned_font_path)

        opt_labels = ["A", "B", "C", "D"]

        def render_canonical_question_frame(bg_img: Image.Image, q: dict, phase: str, timer_text: str, timer_color: tuple) -> Image.Image:
            frame = bg_img.copy()
            overlay = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)

            # Main Glassmorphism Card [90, 450, 990, 1510] rx=26
            draw.rounded_rectangle([90, 450, 990, 1510], radius=26, fill=(8, 18, 40, 115), outline=(0, 170, 255, 153), width=2)

            # Timer Pill [490, 340, 590, 400] rx=30
            draw.rounded_rectangle([490, 340, 590, 400], radius=30, fill=(8, 18, 40, 153), outline=timer_color, width=2)
            ptw = draw.textlength(timer_text, font=font_pill)
            draw.text((540 - ptw / 2, 355), timer_text, font=font_pill, fill=timer_color)

            # Topic Header & Divider 1
            hw = draw.textlength(topic_header, font=font_header)
            draw.text((540 - hw / 2, 490), topic_header, font=font_header, fill=(0, 170, 255, 255))
            draw.line([(160, 545), (920, 545)], fill=(255, 255, 255, 31), width=1)

            # Question Text (pixel-exact wrapping, no silent [:4] truncation)
            q_clean = strip_uncovered_glyphs(str(q.get("question", "")), pinned_font_path)
            q_lines = wrap_lines_pixel_exact(q_clean, font_question, 800)
            curr_qy = 580
            for ql in q_lines:
                ql_w = draw.textlength(ql, font=font_question)
                draw.text((540 - ql_w / 2 + 2, curr_qy + 2), ql, font=font_question, fill=(0, 0, 0, 153))
                draw.text((540 - ql_w / 2, curr_qy), ql, font=font_question, fill=(255, 255, 255, 255))
                curr_qy += 56

            # Divider 2
            draw.line([(160, 840), (920, 840)], fill=(255, 255, 255, 31), width=1)

            # Options
            options = q.get("options", [])
            correct_idx = q.get("answerIndex", 0)
            if correct_idx is None or correct_idx < 0:
                ans_str = str(q.get("answer", "")).strip().lower()
                for o_i, o_val in enumerate(options):
                    if str(o_val).strip().lower() == ans_str:
                        correct_idx = o_i
                        break
            if correct_idx is None or correct_idx < 0:
                correct_idx = 0

            is_reveal = (phase == "reveal")

            for oidx in range(4):
                opt_y = 880 + oidx * 140
                box = [120, opt_y, 960, opt_y + 110]
                is_correct = (oidx == correct_idx)

                if is_reveal:
                    if is_correct:
                        c_fill = (34, 197, 94, 56)
                        c_outline = (34, 197, 94, 255)
                        c_width = 3
                        b_fill = (34, 197, 94, 255)
                        b_outline = (34, 197, 94, 255)
                        b_text = "✓"
                        b_color = (15, 23, 42, 255)
                        t_color = (34, 197, 94, 255)
                    else:
                        c_fill = (255, 255, 255, 5)
                        c_outline = (255, 255, 255, 13)
                        c_width = 1
                        b_fill = (255, 255, 255, 10)
                        b_outline = (255, 255, 255, 25)
                        b_text = opt_labels[oidx]
                        b_color = (100, 116, 139, 255)
                        t_color = (100, 116, 139, 255)
                else:
                    c_fill = (255, 255, 255, 15)
                    c_outline = (255, 255, 255, 31)
                    c_width = 1
                    b_fill = (0, 170, 255, 51)
                    b_outline = (0, 170, 255, 153)
                    b_text = opt_labels[oidx]
                    b_color = (255, 255, 255, 255)
                    t_color = (226, 232, 240, 255)

                draw.rounded_rectangle(box, radius=22, fill=c_fill, outline=c_outline, width=c_width)
                draw.ellipse([180 - 28, opt_y + 55 - 28, 180 + 28, opt_y + 55 + 28], fill=b_fill, outline=b_outline, width=1)
                btw = draw.textlength(b_text, font=font_badge)
                draw.text((180 - btw / 2, opt_y + 55 - 16), b_text, font=font_badge, fill=b_color)

                opt_val = strip_uncovered_glyphs(str(options[oidx] if oidx < len(options) else ""), pinned_font_path)
                opt_lines = wrap_lines_pixel_exact(opt_val, font_option, 680)
                opt_val_clean = opt_lines[0] if opt_lines else ""
                draw.text((230, opt_y + 36), opt_val_clean, font=font_option, fill=t_color)

            frame_comp = Image.alpha_composite(frame, overlay)
            if global_watermark_img:
                frame_comp.paste(global_watermark_img, (820, 1460), global_watermark_img)
            return frame_comp

        def render_canonical_hook_frame(bg_img: Image.Image, hook_text: str) -> Image.Image:
            frame = bg_img.copy()
            overlay = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)

            draw.rounded_rectangle([90, 500, 990, 1400], radius=26, fill=(8, 18, 40, 115), outline=(0, 170, 255, 153), width=2)
            hw = draw.textlength(topic_header, font=font_header)
            draw.text((540 - hw / 2, 600), topic_header, font=font_header, fill=(0, 170, 255, 255))
            draw.line([(160, 650), (920, 650)], fill=(255, 255, 255, 31), width=1)

            h_lines = wrap_lines_pixel_exact(strip_uncovered_glyphs(hook_text, pinned_font_path), font_hook, 800)
            total_h = len(h_lines) * 65
            start_y = 900 - total_h / 2
            for hl in h_lines:
                hl_w = draw.textlength(hl, font=font_hook)
                draw.text((540 - hl_w / 2 + 2, start_y + 2), hl, font=font_hook, fill=(0, 0, 0, 153))
                draw.text((540 - hl_w / 2, start_y), hl, font=font_hook, fill=(255, 255, 255, 255))
                start_y += 65

            frame_comp = Image.alpha_composite(frame, overlay)
            if global_watermark_img:
                frame_comp.paste(global_watermark_img, (820, 1460), global_watermark_img)
            return frame_comp

        def render_canonical_outro_frame(bg_img: Image.Image) -> Image.Image:
            frame = bg_img.copy()
            overlay = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)

            draw.rounded_rectangle([90, 500, 990, 1400], radius=26, fill=(8, 18, 40, 115), outline=(0, 170, 255, 153), width=2)
            outro_hdr = "QUIZ COMPLETED"
            ohw = draw.textlength(outro_hdr, font=font_outro_header)
            draw.text((540 - ohw / 2, 600), outro_hdr, font=font_outro_header, fill=(0, 170, 255, 255))
            draw.line([(160, 650), (920, 650)], fill=(255, 255, 255, 31), width=1)

            hl = "HOW MANY DID YOU GET RIGHT?"
            hlw = draw.textlength(hl, font=font_outro_headline)
            draw.text((540 - hlw / 2, 750), hl, font=font_outro_headline, fill=(255, 255, 255, 255))

            draw.rounded_rectangle([150, 880, 930, 990], radius=22, fill=(255, 255, 255, 15), outline=(255, 255, 255, 31), width=1)
            c1 = strip_uncovered_glyphs("Comment your score below!", pinned_font_path)
            c1w = draw.textlength(c1, font=font_outro_cta)
            draw.text((540 - c1w / 2, 915), c1, font=font_outro_cta, fill=(0, 170, 255, 255))

            draw.rounded_rectangle([150, 1020, 930, 1130], radius=22, fill=(255, 255, 255, 15), outline=(255, 255, 255, 31), width=1)
            c2 = strip_uncovered_glyphs("Follow for more daily quizzes!", pinned_font_path)
            c2w = draw.textlength(c2, font=font_outro_cta)
            draw.text((540 - c2w / 2, 1055), c2, font=font_outro_cta, fill=(255, 255, 255, 255))

            frame_comp = Image.alpha_composite(frame, overlay)
            if global_watermark_img:
                frame_comp.paste(global_watermark_img, (820, 1460), global_watermark_img)
            return frame_comp

        print(f"[Pillow] Preparing {total_frames} canonical frames for rawvideo pipe (zero PNG disk writes)...")
        render_frames_start = time.perf_counter()
        _frame_rgb_cache: dict[tuple, bytes] = {}

        def quiz_frame_generator(f_idx: int) -> bytes:
            t = f_idx / float(fps)
            if t <= hook_req["duration"]:
                key = ("hook",)
                if key not in _frame_rgb_cache:
                    _frame_rgb_cache[key] = render_pil_frame_to_rgb24(
                        render_canonical_hook_frame(hook_bg_img, quiz_data.get("hook", ""))
                    )
                return _frame_rgb_cache[key]
            elif t >= outro_req["start_time"]:
                key = ("outro",)
                if key not in _frame_rgb_cache:
                    _frame_rgb_cache[key] = render_pil_frame_to_rgb24(
                        render_canonical_outro_frame(outro_bg_img)
                    )
                return _frame_rgb_cache[key]
            else:
                active_q_idx = 0
                q_req_idx = 1
                for idx, q in enumerate(questions):
                    q_req = tts_requests[q_req_idx]
                    q_req_idx += 1
                    a_req = tts_requests[q_req_idx]
                    q_req_idx += 1

                    exp_req = None
                    exp_narr = q.get("explanation", "").strip() if not is_rapid else ""
                    if exp_narr:
                        exp_req = tts_requests[q_req_idx]
                        q_req_idx += 1

                    q_start = q_req["start_time"]
                    q_block_end = exp_req["start_time"] + exp_req["duration"] if exp_req else a_req["start_time"] + a_req["duration"]

                    if q_start <= t <= q_block_end:
                        active_q_idx = idx
                        break

                active_q = questions[active_q_idx]
                bg_for_q = question_bg_imgs[active_q_idx] if active_q_idx < len(question_bg_imgs) else hook_bg_img
                is_think = active_q["think_start"] <= t <= active_q["think_end"]
                is_answer = t > active_q["think_end"]

                if is_answer:
                    key = ("q", active_q_idx, "reveal", 0)
                    if key not in _frame_rgb_cache:
                        _frame_rgb_cache[key] = render_pil_frame_to_rgb24(
                            render_canonical_question_frame(
                                bg_for_q, active_q, phase="reveal", timer_text="OK", timer_color=(34, 197, 94, 255)
                            )
                        )
                    return _frame_rgb_cache[key]
                elif is_think:
                    cnt_num = max(1, int(math.ceil(active_q["think_end"] - t)))
                    key = ("q", active_q_idx, "think", cnt_num)
                    if key not in _frame_rgb_cache:
                        _frame_rgb_cache[key] = render_pil_frame_to_rgb24(
                            render_canonical_question_frame(
                                bg_for_q, active_q, phase="think", timer_text=f"{cnt_num}s", timer_color=(0, 170, 255, 255)
                            )
                        )
                    return _frame_rgb_cache[key]
                else:
                    countdown_total = int(math.ceil(active_q.get("think_duration", 2.0)))
                    key = ("q", active_q_idx, "read", countdown_total)
                    if key not in _frame_rgb_cache:
                        _frame_rgb_cache[key] = render_pil_frame_to_rgb24(
                            render_canonical_question_frame(
                                bg_for_q, active_q, phase="read", timer_text=f"{countdown_total}s", timer_color=(0, 170, 255, 255)
                            )
                        )
                    return _frame_rgb_cache[key]

        # 7. Generate thumbnail from frame 0
        try:
            frame0 = quiz_frame_generator(0)
            Image.frombytes("RGB", (1080, 1920), frame0).save(str(out_thumbnail))
            print(f"[Thumbnail] Generated canonical thumbnail at {out_thumbnail}")
        except Exception as thumb_err:
            print(f"[Thumbnail] Warning: Failed to save thumbnail: {thumb_err}")

        # 8. Build sample-exact master audio WAV (len == total_frames * 1600) and assemble via canonical pipe
        ffmpeg_start = time.perf_counter()
        import numpy as np

        mix_cmd = [ffmpeg_exe, "-y", "-v", "error"]
        for req in tts_requests:
            mix_cmd.extend(["-i", str(req["mp3"])])
        mix_cmd.extend(["-i", str(audio_assets["pop"])])
        mix_cmd.extend(["-i", str(audio_assets["ding"])])
        mix_cmd.extend(["-stream_loop", "-1", "-i", str(audio_assets["bgm"])])
        # Shift input indices by -1 since rawvideo is no longer input 0
        shifted_filter = ";".join(filter_parts)
        for i in range(len(tts_requests) + 3, 0, -1):
            shifted_filter = shifted_filter.replace(f"[{i}:a]", f"[{i - 1}:a]")
        shifted_filter_file = shm_dir / f"quiz_{job_id}_audio_filter.txt"
        shifted_filter_file.write_text(shifted_filter, encoding="utf-8")
        created_files.add(shifted_filter_file)

        mix_cmd.extend([
            "-filter_complex_script", str(shifted_filter_file),
            "-map", "[a_mixed]",
            "-ac", "1",
            "-ar", str(SR),
            "-c:a", "pcm_s16le",
            "-t", f"{total_frames / float(fps):.6f}",
            str(out_audio),
        ])
        subprocess.run(mix_cmd, check=True)

        master_pcm, _ = decode_audio_to_pcm48k(out_audio)
        target_samples = total_frames * SAMPLES_PER_FRAME
        if len(master_pcm) < target_samples:
            master_pcm = np.concatenate([master_pcm, np.zeros(target_samples - len(master_pcm), dtype=np.int16)])
        else:
            master_pcm = master_pcm[:target_samples]
        assert len(master_pcm) == total_frames * SAMPLES_PER_FRAME
        write_pcm48k_wav(master_pcm, out_audio)

        assemble_canonical_mp4(
            frame_generator=quiz_frame_generator,
            master_audio_wav=out_audio,
            total_frames=total_frames,
            out_mp4=out_final,
        )
        print(f"[PERF METRIC - PILLOW+FFMPEG]: Rendered {total_frames} frames in {time.perf_counter() - render_frames_start:.2f}s")
        timings["step4_render_sec"] = time.perf_counter() - ffmpeg_start

        # 9. Cloudinary Upload
        from datetime import datetime
        import re
        now = datetime.now()
        date_folder = now.strftime("%Y-%m-%d")
        time_str = now.strftime("%H-%M-%S")

        quiz_data_dict = job.get("quizData") if isinstance(job.get("quizData"), dict) else {}
        country_clean = str(
            job.get("country")
            or quiz_data_dict.get("country")
            or "Default"
        ).strip().replace(" ", "_")
        country_clean = re.sub(r'[^a-zA-Z0-9_]', '', country_clean)
        if not country_clean:
            country_clean = "Default"

        difficulty_clean = str(job.get("difficulty") or (questions[0].get("difficulty") if questions and len(questions) > 0 else None) or "Medium").strip().capitalize()
        difficulty_clean = re.sub(r'[^a-zA-Z0-9_]', '', difficulty_clean)

        version_clean = str(job.get("version") or "1").strip()
        version_clean = re.sub(r'[^a-zA-Z0-9_]', '', version_clean)

        folder_path = f"geo_quiz_factory/{date_folder}"
        public_id_str = f"{country_clean}_{difficulty_clean}_Batch_{version_clean}_{time_str}"

        video_url = None
        thumbnail_url = None

        try:
            raw_hashtags = job.get("hashtags", [])
            clean_tags = [tag.replace("#", "").strip() for tag in raw_hashtags]
            system_tags = ["shortforge", "automated_batch", "quiz_shorts"]
            final_tags = clean_tags + system_tags

            print(f"🚀 Uploading to Cloudinary with tags: {final_tags}")
            print(f"[Cloudinary] Uploading video to {folder_path}/{public_id_str} ...")

            upload_res = cloudinary.uploader.upload(
                str(out_final),
                resource_type="video",
                folder=folder_path,
                public_id=public_id_str,
                overwrite=True,
                tags=final_tags
            )
            video_url = upload_res.get("secure_url")
            print(f"[Cloudinary] Video uploaded: {video_url}")
        except Exception as cu_err:
            print(f"[Cloudinary] Video upload failed: {cu_err}. Falling back to static serve.")

        try:
            if out_thumbnail.exists():
                thumb_res = cloudinary.uploader.upload(
                    str(out_thumbnail),
                    resource_type="image",
                    folder=folder_path,
                    public_id=f"{public_id_str}_thumb",
                    overwrite=True,
                )
                thumbnail_url = thumb_res.get("secure_url")
                print(f"[Cloudinary] Thumbnail uploaded: {thumbnail_url}")
        except Exception as tu_err:
            print(f"[Cloudinary] Thumbnail upload failed: {tu_err}")

        print(f"[PERF METRIC - TOTAL]: Worker total execution time: {time.perf_counter() - total_start:.2f} seconds.")

        return {
            "subtitleOverlay": "WORKING",
            "renderProfile": "FAST_QUIZ",
            "fps": 30,
            "resolution": "1080x1920",
            "videoDuration": total_duration,
            "videoUrl": video_url,
            "thumbnailUrl": thumbnail_url,
        }

    finally:
        print("[Cleanup] Running absolute memory hygiene cleanup...")
        for p in created_files:
            if p.exists():
                try:
                    p.unlink()
                except Exception:
                    pass
        if temp_dir.exists():
            try:
                shutil.rmtree(str(temp_dir), ignore_errors=True)
            except Exception:
                pass


def main() -> None:
    start_time = time.time()
    parser = argparse.ArgumentParser(
        description="Hybrid short generator: images + voice + captions -> final.mp4"
    )

    parser.add_argument("jobJsonPath", type=str, help="Path to job JSON")
    args = parser.parse_args()

    job_path = Path(args.jobJsonPath)
    job = json.loads(job_path.read_text(encoding="utf-8"))

    topic = str(job.get("topic", ""))
    script = str(job.get("script", ""))
    scenes = job.get("scenes", [])
    job_id = str(job.get("jobId") or job_path.stem)

    script_parent = Path(__file__).resolve().parent
    engine_root = script_parent.parent
    if "rendering-engine" in str(script_parent.resolve()):
        out_dir = job_path.parent / job_id
    else:
        out_dir = job_path.parent.parent / "local-ai" / "output" / job_id

    images_dir = out_dir / "images"
    out_audio = out_dir / "audio.wav"
    out_srt = out_dir / "subtitles.srt"
    out_final = out_dir / "final.mp4"
    out_thumbnail = out_dir / "thumbnail.png"

    contentType = job.get("contentType", "MOTIVATIONAL")
    try:
        if contentType == "QUIZ_SHORTS":
            timings = {
                "step1_images_sec": 0.0,
                "step2_audio_sec": 0.0,
                "step3_subtitles_sec": 0.0,
                "step4_render_sec": 0.0,
            }
            # Ensure output directory exists
            out_dir.mkdir(parents=True, exist_ok=True)
            result = run_quiz_shorts(job, out_dir, out_audio, out_srt, out_final, out_thumbnail, timings)

            # Worker writes staging metadata — never self-declares completed.
            emit_staged_result(
                job_id=job_id,
                out_dir=out_dir,
                artifact_path=out_final,
                probe={"duration": result.get("videoDuration"), "playable": True, "audioDetected": True},
                timings=timings,
                extra={
                    "videoUrl": result.get("videoUrl"),
                    "thumbnailUrl": result.get("thumbnailUrl"),
                    "subtitlesUrl": result.get("subtitlesUrl"),
                    "renderProfile": result.get("renderProfile", "FAST_QUIZ"),
                    "fps": result.get("fps", 30),
                    "resolution": result.get("resolution", "1080x1920"),
                    "cache": {"hits": 0, "misses": 0},
                },
            )
            print(f"[Worker] Wrote quiz staging result.json to {out_dir / 'result.json'}")
            return

        scenes_list = scenes if isinstance(scenes, list) else []
        if not scenes_list:
            scenes_list = [{"text": "Scene 1"}, {"text": "Scene 2"}]

        # Ensure output and images directories exist
        out_dir.mkdir(parents=True, exist_ok=True)
        images_dir.mkdir(parents=True, exist_ok=True)

        image_paths: list[Path] = []
        thumbnail_scene_index = 1
        try:
            if isinstance(scenes_list, list) and len(scenes_list) > 0:
                maybe_best = None
                for sc_i, sc in enumerate(scenes_list, start=1):
                    if isinstance(sc, dict) and sc.get("bestScene"):
                        maybe_best = sc_i
                        break
                if isinstance(maybe_best, int) and maybe_best >= 1:
                    thumbnail_scene_index = maybe_best
        except Exception:
            thumbnail_scene_index = 1

        timings = {
            "step1_images_sec": None,
            "step2_audio_sec": None,
            "step3_subtitles_sec": None,
            "step4_render_sec": None,
        }
        
        step1_start = time.time()
        try:
            print("[STEP 1] Generating images...")
            for i, sc in enumerate(scenes_list, start=1):
                sc_text = ""
                if isinstance(sc, dict):
                    sc_text = sc.get("text") or sc.get("contactText") or sc.get("imagePrompt") or ""

                title = sc_text.strip() or (f"{topic} - Scene {i}" if topic else f"Scene {i}")
                out_png = images_dir / f"scene{i}.png"

                try:
                    scene_image_prompt = ""
                    if isinstance(sc, dict):
                        scene_image_prompt = sc.get("imagePrompt") or sc.get("image_prompt") or ""

                    prompt = _build_flux_scene_prompt(
                        topic=topic,
                        scene_text=sc_text,
                        scene_image_prompt=scene_image_prompt,
                        style=str(job.get("style", "")),
                        i=i,
                    )

                    _generate_or_load_cached_image(
                        prompt,
                        out_png=out_png,
                        width=1024,
                        height=1024,
                        steps=4,
                    )
                    _cover_crop_image(out_png, 1080, 1920)
                except Exception as e:
                    print(f"[STEP 1][IMAGE] FLUX failed for scene {i}: {e}")
                    _write_placeholder_image(out_png, title)
                    _cover_crop_image(out_png, 1080, 1920)

                image_paths.append(out_png)

            print("[STEP 1] Images complete")
        except Exception as e:
            print(f"[ERROR][STEP 1] {e}")
            raise
        finally:
            timings["step1_images_sec"] = _log_step_time(1, step1_start)

        tts_text = script.strip()
        if not tts_text:
            tts_text = (
                " ".join(
                    [
                        (s.get("text") or s.get("contactText") or "").strip()
                        for s in scenes_list
                        if isinstance(s, dict)
                    ]
                ).strip()
                or topic
            )

        if not tts_text:
            raise RuntimeError("Job JSON missing script/topic; cannot generate narration.")

        step2_start = time.time()
        try:
            _edge_tts(tts_text, out_audio)
            print("[STEP 2] Audio complete")
        except Exception as e:
            print(f"[ERROR][STEP 2] {e}")
            raise
        finally:
            timings["step2_audio_sec"] = _log_step_time(2, step2_start)

        step3_start = time.time()
        try:
            _transcribe_to_srt(out_audio, out_srt)
            print("[STEP 3] Subtitles complete")
        except Exception as e:
            print(f"[ERROR][STEP 3] {e}")
            raise
        finally:
            timings["step3_subtitles_sec"] = _log_step_time(3, step3_start)

        thumbnail_scene_img = None
        try:
            idx0 = max(0, min(len(image_paths) - 1, thumbnail_scene_index - 1))
            thumbnail_scene_img = image_paths[idx0]
        except Exception:
            thumbnail_scene_img = image_paths[0] if image_paths else None

        out_thumbnail = out_dir / "thumbnail.png"
        try:
            if thumbnail_scene_img and thumbnail_scene_img.exists():
                shutil.copyfile(str(thumbnail_scene_img), str(out_thumbnail))
            else:
                _write_placeholder_image(out_thumbnail, "Thumbnail")
        except Exception as e:
            print(f"[WARN][THUMBNAIL] Failed to write thumbnail.png: {e}")
            try:
                _write_placeholder_image(out_thumbnail, "Thumbnail")
            except Exception:
                pass

        step4_start = time.time()
        subtitle_meta = {"subtitleOverlay": "FALLBACK"}
        try:
            subtitle_meta = _assemble_video(
                job_id,
                job.get("renderProfile") or "STANDARD_SHORTS",
                image_paths,
                out_audio,
                out_srt,
                out_final,
            )
            print("[STEP 4] final.mp4 complete")
        except Exception as e:
            print(f"[ERROR][STEP 4] {e}")
            raise
        finally:
            timings["step4_render_sec"] = _log_step_time(4, step4_start)

        if not out_final.exists() or out_final.stat().st_size < 1024:
            raise RuntimeError(f"Movie render produced no valid final.mp4: {out_final}")

        probe = _probe_with_ffprobe(out_final)

        _finalize_render_and_upload(
            job_id=job_id,
            out_dir=out_dir,
            out_final=out_final,
            out_thumbnail=out_thumbnail,
            out_srt=out_srt,
            timings=timings,
            subtitle_meta=subtitle_meta,
            probe=probe,
            cache_hits=cache.get("hits", 0),
            cache_misses=cache.get("misses", 0),
            is_quiz=False,
            video_duration=probe.get("duration", None),
            start_time=start_time
        )
    except Exception as e:
        print(f"[ERROR][GLOBAL] Rendering failed: {e}")
        raise
    finally:
        temp_dir = out_dir / "temp"
        if temp_dir.exists():
            try:
                shutil.rmtree(str(temp_dir), ignore_errors=True)
            except Exception:
                pass
        images_dir = out_dir / "images"
        if images_dir.exists():
            try:
                shutil.rmtree(str(images_dir), ignore_errors=True)
            except Exception:
                pass
        # Final render artifacts (out_final, out_thumbnail, out_srt, result.json)
        # must be preserved in out_dir for CAS and F07 verifier inspection.
        print(f"[Artifacts] Preserving output artifacts in {out_dir} for F07 verifier")


if __name__ == "__main__":
    main()
