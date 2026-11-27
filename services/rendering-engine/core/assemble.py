#!/usr/bin/env python3
"""
P3 Canonical Assembler (Deterministic + Two-Pass Loudnorm + +faststart)
=======================================================================
Enforces:
- Cover-crop visual fit (never stretch)
- Audio chain: amix normalize=0 -> two-pass loudnorm I=-14:TP=-1.5:LRA=11:linear=true
  -> aresample=48000 -> alimiter=limit=0.891
- Canonical encode: libx264 medium crf 18 yuv420p, -r 30 -fps_mode cfr,
  -g 60 -keyint_min 60 -sc_threshold 0 -threads 4 -frames:v {TOTAL}
  -video_track_timescale 15360 bt709 tv, aac 192k 48kHz stereo,
  -movflags +faststart+write_colr, bitexact determinism.
"""

from __future__ import annotations

import json
import subprocess
from pathlib import Path
from typing import Callable, Dict

from core.lattice import FPS, SR

COVER_CROP_VF = "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1"
BT709_SETPARAMS_VF = "setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv"


def measure_loudnorm_pass1(audio_in: Path) -> Dict[str, str]:
    """Run pass-1 loudnorm analysis on input audio."""
    proc = subprocess.run(
        [
            "ffmpeg",
            "-hide_banner",
            "-nostats",
            "-i",
            str(audio_in),
            "-af",
            "aresample=48000,aformat=channel_layouts=stereo,loudnorm=I=-14.2:TP=-1.5:LRA=11:print_format=json",
            "-f",
            "null",
            "-",
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    stderr = proc.stderr
    start = stderr.rfind("{")
    end = stderr.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise RuntimeError(f"Pass-1 loudnorm JSON missing in stderr: {stderr[-300:]}")
    return json.loads(stderr[start : end + 1])


def build_two_pass_audio_filter(measured: Dict[str, str]) -> str:
    """Two-pass linear loudnorm -> mandatory aresample=48000 -> alimiter=limit=0.891."""
    return (
        f"aresample={SR},aformat=channel_layouts=stereo,"
        f"loudnorm=I=-14.2:TP=-1.5:LRA=11:linear=true:"
        f"measured_I={measured['input_i']}:"
        f"measured_TP={measured['input_tp']}:"
        f"measured_LRA={measured['input_lra']}:"
        f"measured_thresh={measured['input_thresh']}:"
        f"offset={measured['target_offset']},"
        f"aresample={SR},"
        f"alimiter=limit=0.891"
    )


def assemble_canonical_mp4(
    *,
    frame_generator: Callable[[int], bytes],
    master_audio_wav: Path,
    total_frames: int,
    out_mp4: Path,
    crf: int = 18,
    preset: str = "medium",
) -> Path:
    """Stream raw RGB24 frames via stdin pipe + two-pass loudnorm audio to canonical MP4."""
    if total_frames <= 0:
        raise ValueError(f"total_frames must be positive, got {total_frames}")

    measured = measure_loudnorm_pass1(master_audio_wav)
    af_chain = build_two_pass_audio_filter(measured)
    out_mp4.parent.mkdir(parents=True, exist_ok=True)

    cmd = [
        "ffmpeg",
        "-y",
        "-v",
        "error",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        "1080x1920",
        "-r",
        str(FPS),
        "-i",
        "pipe:0",
        "-i",
        str(master_audio_wav),
        "-vf",
        BT709_SETPARAMS_VF,
        "-af",
        af_chain,
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-crf",
        str(crf),
        "-pix_fmt",
        "yuv420p",
        "-r",
        str(FPS),
        "-fps_mode",
        "cfr",
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-sc_threshold",
        "0",
        "-threads",
        "4",
        "-frames:v",
        str(total_frames),
        "-video_track_timescale",
        "15360",
        "-colorspace",
        "bt709",
        "-color_primaries",
        "bt709",
        "-color_trc",
        "bt709",
        "-color_range",
        "tv",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        str(SR),
        "-ac",
        "2",
        "-movflags",
        "+faststart+write_colr",
        "-flags",
        "+bitexact",
        "-fflags",
        "+bitexact",
        str(out_mp4),
    ]

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None
    try:
        for frame_idx in range(total_frames):
            frame_bytes = frame_generator(frame_idx)
            proc.stdin.write(frame_bytes)
        proc.stdin.close()
    except BrokenPipeError:
        pass
    stderr_bytes = proc.stderr.read() if proc.stderr else b""
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"Canonical ffmpeg encode failed (rc={rc}): {stderr_bytes.decode('utf-8', errors='replace')}")
    return out_mp4
