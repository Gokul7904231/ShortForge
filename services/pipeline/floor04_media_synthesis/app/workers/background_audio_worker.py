"""Deterministic background-audio fallback worker producing real PCM WAV media."""

from __future__ import annotations

import hashlib
import math
import wave
from pathlib import Path
from time import perf_counter

import structlog

from floors.floor04_media_synthesis.app.domain.handoff import (
    AssetSourceType,
    ExecutionMode,
    ProviderExecutionRecord,
    RightsMetadata,
    SynthesizedAudioAsset,
)
from floors.floor04_media_synthesis.app.services.provider_registry import ProviderSelection, provider_execution_record
from floors.floor04_media_synthesis.app.services.validator import PhysicalMediaValidator

logger = structlog.get_logger(__name__)


def _write_background_wav(path: Path, duration_seconds: float, mood: str, sample_rate: int = 44100) -> None:
    duration_seconds = max(0.25, float(duration_seconds))
    frame_count = int(round(duration_seconds * sample_rate))
    digest = hashlib.sha256(mood.encode("utf-8")).digest()
    base = 110.0 + (digest[0] % 90)
    second = base * 1.5

    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)

        frames = bytearray()
        for index in range(frame_count):
            t = index / sample_rate
            envelope = min(1.0, t / 0.2, max(0.0, (duration_seconds - t) / 0.4))
            value = (
                0.65 * math.sin(2 * math.pi * base * t)
                + 0.25 * math.sin(2 * math.pi * second * t)
            )
            sample = int(32767 * 0.08 * envelope * value)
            frames.extend(sample.to_bytes(2, "little", signed=True))

        wav.writeframes(bytes(frames))


def run_background_audio_worker(
    target_duration_seconds: float,
    mood: str,
    storage_dir: str,
    request_id: str,
    source_spec_hash: str = "",
    provider_selection: ProviderSelection | None = None,
) -> SynthesizedAudioAsset:
    started = perf_counter()
    out_dir = Path(storage_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    asset_id = "bg-audio-01"
    file_path = out_dir / f"bg_music_{mood}.wav"

    selection = provider_selection or ProviderSelection(
        provider_id="deterministic_background_audio_fallback",
        capability="background_audio_generation",
        model_id=None,
        execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
    )
    if not source_spec_hash:
        source_spec_hash = hashlib.sha256(
            f"{asset_id}:{mood}:{target_duration_seconds}".encode("utf-8")
        ).hexdigest()

    _write_background_wav(
        file_path,
        target_duration_seconds,
        mood,
    )

    mime_type, sha256_hash, file_size, validated_duration = PhysicalMediaValidator.validate_audio_asset(
        file_path=str(file_path),
        required_duration_seconds=target_duration_seconds,
        storage_root=str(out_dir),
        expected_mime="audio/wav",
    )

    latency_ms = round((perf_counter() - started) * 1000, 3)
    request_fingerprint = hashlib.sha256(
        f"{request_id}:{asset_id}:{source_spec_hash}:{mood}".encode("utf-8")
    ).hexdigest()
    execution = provider_execution_record(selection, request_fingerprint, latency_ms=latency_ms)

    provenance_hash = hashlib.sha256(
        f"{source_spec_hash}:{asset_id}:{mood}:{sha256_hash}".encode("utf-8")
    ).hexdigest()

    rights = RightsMetadata(
        source_type=AssetSourceType.DETERMINISTIC_SYNTHESIS,
        provider_name=selection.provider_id,
        license_type="INTERNAL_DETERMINISTIC_FALLBACK",
        attribution_required=False,
        usage_restrictions="Deterministic fallback audio; not a licensed stock-library asset.",
    )

    bg_asset = SynthesizedAudioAsset(
        asset_id=asset_id,
        scene_id="global_bg",
        file_path=str(file_path),
        mime_type=mime_type,
        duration_seconds=validated_duration,
        sample_rate_hz=44100,
        sha256_checksum=sha256_hash,
        file_size_bytes=file_size,
        provenance_hash=provenance_hash,
        source_spec_hash=source_spec_hash,
        provider_execution=execution,
        rights_metadata=rights,
    )

    logger.info(
        "background_audio_fallback_generated",
        mood=mood,
        duration=validated_duration,
        sha256=sha256_hash,
    )
    return bg_asset
