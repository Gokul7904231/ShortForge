"""Deterministic visual fallback worker producing a real PNG artifact."""

from __future__ import annotations

import hashlib
import struct
import zlib
from pathlib import Path
from time import perf_counter

import structlog

from floors.floor04_media_synthesis.app.domain.handoff import (
    AssetSourceType,
    ExecutionMode,
    ProviderExecutionRecord,
    RightsMetadata,
    SynthesizedVisualAsset,
)
from floors.floor04_media_synthesis.app.services.provider_registry import ProviderSelection, provider_execution_record
from floors.floor04_media_synthesis.app.services.validator import PNG_IEND, PNG_MAGIC, PhysicalMediaValidator

logger = structlog.get_logger(__name__)


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    crc = zlib.crc32(kind)
    crc = zlib.crc32(payload, crc) & 0xFFFFFFFF
    return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", crc)


def _generate_real_png(width: int, height: int, seed_text: str) -> bytes:
    """Generate a standards-valid flat RGBA PNG without external image libraries."""
    digest = hashlib.sha256(seed_text.encode("utf-8")).digest()
    rgb = (digest[0], digest[1], digest[2], 255)
    row = b"\x00" + bytes(rgb) * width
    raw = row * height
    compressed = zlib.compress(raw, level=6)

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return PNG_MAGIC + _png_chunk(b"IHDR", ihdr) + _png_chunk(b"IDAT", compressed) + _png_chunk(b"IEND", b"")


def run_image_worker(
    asset_id: str,
    scene_id: str,
    prompt_text: str,
    target_width: int,
    target_height: int,
    storage_dir: str,
    request_id: str,
    source_spec_hash: str = "",
    provider_selection: ProviderSelection | None = None,
) -> SynthesizedVisualAsset:
    """Create, physically validate, hash and register a real PNG fallback artifact."""
    started = perf_counter()
    out_dir = Path(storage_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    file_path = out_dir / f"visual_{asset_id}.png"

    selection = provider_selection or ProviderSelection(
        provider_id="deterministic_image_fallback",
        capability="image_generation",
        model_id=None,
        execution_mode=ExecutionMode.DETERMINISTIC_FALLBACK,
    )
    if not source_spec_hash:
        source_spec_hash = hashlib.sha256(
            f"{asset_id}:{scene_id}:{prompt_text}:{target_width}x{target_height}".encode("utf-8")
        ).hexdigest()

    file_path.write_bytes(
        _generate_real_png(
            target_width,
            target_height,
            f"{source_spec_hash}:{prompt_text}",
        )
    )

    mime_type, sha256_hash, file_size = PhysicalMediaValidator.validate_image_asset(
        file_path=str(file_path),
        required_width=target_width,
        required_height=target_height,
        storage_root=str(out_dir),
    )

    latency_ms = round((perf_counter() - started) * 1000, 3)
    request_fingerprint = hashlib.sha256(
        f"{request_id}:{asset_id}:{source_spec_hash}:{prompt_text}".encode("utf-8")
    ).hexdigest()

    execution = provider_execution_record(
        selection,
        request_fingerprint,
        latency_ms=latency_ms,
    )

    provenance_hash = hashlib.sha256(
        f"{source_spec_hash}:{asset_id}:{prompt_text}:{sha256_hash}".encode("utf-8")
    ).hexdigest()

    rights = RightsMetadata(
        source_type=AssetSourceType.DETERMINISTIC_SYNTHESIS,
        provider_name=selection.provider_id,
        license_type="INTERNAL_DETERMINISTIC_FALLBACK",
        attribution_required=False,
    )

    visual_asset = SynthesizedVisualAsset(
        asset_id=asset_id,
        scene_id=scene_id,
        file_path=str(file_path),
        mime_type=mime_type,
        width=target_width,
        height=target_height,
        sha256_checksum=sha256_hash,
        file_size_bytes=file_size,
        provenance_hash=provenance_hash,
        source_spec_hash=source_spec_hash,
        provider_execution=execution,
        rights_metadata=rights,
    )

    logger.info(
        "visual_image_synthesized",
        asset_id=asset_id,
        scene_id=scene_id,
        provider=selection.provider_id,
        sha256=sha256_hash,
    )
    return visual_asset
