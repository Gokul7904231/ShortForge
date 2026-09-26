"""Read-only verification of Floor 04 media artifacts before Floor 05 composition."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Iterable

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor04_media_synthesis.app.domain.handoff import SynthesizedAudioAsset, SynthesizedVisualAsset


class SourceManifestVerifier:
    """Treat the Floor 04 handoff as an immutable media manifest and verify bytes before use."""

    @staticmethod
    def _verify_path(file_path: str, expected_sha256: str, expected_size: int, kind: str) -> Path:
        path = Path(file_path).resolve()
        if path.is_symlink():
            raise GuardianValidationError(
                f"F05 source integrity rejection: {kind} artifact must not be a symlink: {path}"
            )
        if not path.exists() or not path.is_file():
            raise GuardianValidationError(
                f"F05 source integrity rejection: {kind} artifact is missing: {path}"
            )
        actual_size = path.stat().st_size
        if actual_size != expected_size:
            raise GuardianValidationError(
                f"F05 source integrity rejection: {kind} artifact size mismatch for {path}: "
                f"expected {expected_size}, got {actual_size}"
            )
        actual_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_sha256 != expected_sha256:
            raise GuardianValidationError(
                f"F05 source integrity rejection: {kind} artifact checksum mismatch for {path}"
            )
        return path

    @classmethod
    def verify_visuals(cls, assets: Iterable[SynthesizedVisualAsset]) -> list[Path]:
        return [
            cls._verify_path(asset.file_path, asset.sha256_checksum, asset.file_size_bytes, "visual")
            for asset in assets
        ]

    @classmethod
    def verify_audio(cls, assets: Iterable[SynthesizedAudioAsset]) -> list[Path]:
        return [
            cls._verify_path(asset.file_path, asset.sha256_checksum, asset.file_size_bytes, "audio")
            for asset in assets
        ]

    @classmethod
    def verify_background_audio(cls, asset: SynthesizedAudioAsset | None) -> Path | None:
        if asset is None:
            return None
        return cls._verify_path(
            asset.file_path,
            asset.sha256_checksum,
            asset.file_size_bytes,
            "background audio",
        )
