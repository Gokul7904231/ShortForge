#!/usr/bin/env python3
"""
P3 Audio Truth Decoder & Sample-Exact Master Concatenation
==========================================================
Decodes any TTS container (including MP3 misnamed .wav) to 48kHz int16 mono PCM.
Duration is strictly len(pcm) / 48000. Never trusts file extensions or metadata.
"""

from __future__ import annotations

import subprocess
import wave
from pathlib import Path
from typing import Sequence, Tuple

import numpy as np

from core.lattice import SAMPLES_PER_FRAME, SR


def decode_audio_to_pcm48k(audio_path: Path) -> Tuple[np.ndarray, float]:
    """Decode any audio file via ffmpeg into int16 48kHz mono PCM; return (pcm, duration_sec)."""
    if not audio_path.exists() or audio_path.stat().st_size == 0:
        raise FileNotFoundError(f"Audio file missing or empty: {audio_path}")

    proc = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(audio_path),
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            str(SR),
            "-ac",
            "1",
            "-f",
            "s16le",
            "pipe:1",
        ],
        capture_output=True,
        check=True,
    )
    pcm = np.frombuffer(proc.stdout, dtype=np.int16).copy()
    if len(pcm) == 0:
        raise RuntimeError(f"Decoded zero audio samples from {audio_path}")
    return pcm, len(pcm) / float(SR)


def trim_bounded_silence(
    pcm: np.ndarray,
    *,
    threshold_dbfs: float = -50.0,
    keep_ms: int = 30,
) -> np.ndarray:
    """Trim leading/trailing silence below threshold_dbfs while keeping keep_ms pad."""
    if len(pcm) == 0:
        return pcm
    threshold_amp = int(round(32767.0 * (10.0 ** (threshold_dbfs / 20.0))))
    active = np.flatnonzero(np.abs(pcm) > threshold_amp)
    if len(active) == 0:
        return pcm
    keep_samples = int((SR * keep_ms) // 1000)
    start = max(0, int(active[0]) - keep_samples)
    end = min(len(pcm), int(active[-1]) + 1 + keep_samples)
    return pcm[start:end].copy()


def concat_master_audio(
    scene_pcms: Sequence[np.ndarray],
    scene_frames: Sequence[int],
) -> np.ndarray:
    """Zero-pad each scene PCM to frames_i * 1600 and concatenate. Asserts exact sample count."""
    if len(scene_pcms) != len(scene_frames):
        raise ValueError("scene_pcms and scene_frames must have identical length")
    chunks = []
    total_frames = 0
    for idx, (pcm, frames) in enumerate(zip(scene_pcms, scene_frames)):
        target_samples = int(frames) * SAMPLES_PER_FRAME
        if len(pcm) > target_samples:
            raise ValueError(
                f"Scene {idx} audio ({len(pcm)} samples) exceeds allocated {frames} frames ({target_samples} samples)"
            )
        pad = target_samples - len(pcm)
        if pad > 0:
            chunks.append(np.concatenate([pcm.astype(np.int16), np.zeros(pad, dtype=np.int16)]))
        else:
            chunks.append(pcm.astype(np.int16))
        total_frames += int(frames)

    master = np.concatenate(chunks) if chunks else np.zeros(0, dtype=np.int16)
    assert len(master) == total_frames * SAMPLES_PER_FRAME, (
        f"Master audio sample mismatch: {len(master)} != {total_frames * SAMPLES_PER_FRAME}"
    )
    return master


def write_pcm48k_wav(pcm: np.ndarray, out_wav: Path) -> None:
    """Write int16 48kHz mono PCM to a canonical RIFF WAV file."""
    out_wav.parent.mkdir(parents=True, exist_ok=True)
    pcm16 = np.asarray(pcm, dtype=np.int16)
    with wave.open(str(out_wav), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm16.tobytes())
