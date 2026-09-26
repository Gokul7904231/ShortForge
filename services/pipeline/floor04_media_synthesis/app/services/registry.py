"""Persistent Storage & Provenance Registry for Floor 04 Media Assets."""

from __future__ import annotations

import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field
import structlog

from factoryos.guardian.core.exceptions import GuardianValidationError
from floors.floor04_media_synthesis.app.domain.handoff import RightsMetadata

logger = structlog.get_logger(__name__)


class MediaAssetRecord(BaseModel):
    model_config = ConfigDict(extra="forbid")

    asset_id: str = Field(...)
    asset_version: int = Field(default=1, ge=1)
    scene_id: str = Field(...)
    source_spec_hash: str = Field(...)
    sha256_checksum: str = Field(..., min_length=64, max_length=64)
    file_size_bytes: int = Field(..., gt=0)
    mime_type: str = Field(...)
    media_type: str = Field(...)
    width: Optional[int] = Field(default=None, gt=0)
    height: Optional[int] = Field(default=None, gt=0)
    duration_seconds: Optional[float] = Field(default=None, gt=0)
    codec: Optional[str] = None
    sample_rate_hz: Optional[int] = Field(default=None, gt=0)
    provider_name: str = Field(...)
    model_name: str = Field(default="deterministic_fallback")
    generation_request_id: str = Field(...)
    transaction_id: str = Field(...)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    validation_status: str = Field(default="VALIDATED")
    storage_path: str = Field(...)
    rights_metadata: RightsMetadata = Field(...)


class MediaAssetRegistry:
    """Crash-safe registry using atomic replacement and stale-state reload before writes."""

    def __init__(self, registry_file_path: Optional[str] = None):
        self.file_path = (
            Path(registry_file_path).resolve()
            if registry_file_path
            else Path("data/media_storage/media_registry.json").resolve()
        )
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self._records: Dict[str, MediaAssetRecord] = {}
        self._load()

    def _load(self) -> None:
        if not self.file_path.exists():
            return
        try:
            raw = json.loads(self.file_path.read_text(encoding="utf-8"))
            self._records = {
                key: MediaAssetRecord.model_validate(value)
                for key, value in raw.items()
            }
        except Exception as exc:
            logger.error("media_registry_load_failed", error=str(exc))
            self._records = {}

    def _atomic_save(self) -> None:
        raw = {
            key: value.model_dump(mode="json")
            for key, value in self._records.items()
        }

        fd, temp_path = tempfile.mkstemp(
            prefix=self.file_path.name + ".",
            suffix=".tmp",
            dir=str(self.file_path.parent),
        )
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(raw, handle, indent=2, sort_keys=True, default=str)
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_path, self.file_path)
        finally:
            if os.path.exists(temp_path):
                os.unlink(temp_path)

    def register_asset(self, record: MediaAssetRecord) -> None:
        if not record.source_spec_hash:
            raise GuardianValidationError(
                f"Provenance Violation: Asset '{record.asset_id}' missing source_spec_hash."
            )
        if not record.sha256_checksum:
            raise GuardianValidationError(
                f"Integrity Violation: Asset '{record.asset_id}' missing sha256_checksum."
            )
        if not Path(record.storage_path).exists():
            raise GuardianValidationError(
                f"Storage Violation: Asset '{record.asset_id}' file does not exist at registration time."
            )

        # Reload before every write so long-running workers do not overwrite
        # records created by another process.
        self._load()
        existing = self._records.get(record.asset_id)
        if existing and existing.sha256_checksum != record.sha256_checksum:
            raise GuardianValidationError(
                f"Identity Violation: asset_id '{record.asset_id}' already maps to another checksum."
            )

        self._records[record.asset_id] = record
        self._atomic_save()
        logger.info(
            "media_asset_registered",
            asset_id=record.asset_id,
            spec_hash=record.source_spec_hash,
            sha256=record.sha256_checksum,
        )

    def get_asset(self, asset_id: str) -> Optional[MediaAssetRecord]:
        self._load()
        return self._records.get(asset_id)

    def list_assets(self) -> List[MediaAssetRecord]:
        self._load()
        return list(self._records.values())

    def verify_spec_linkage(self, asset_id: str, expected_spec_hash: str) -> bool:
        rec = self.get_asset(asset_id)
        return bool(rec and rec.source_spec_hash == expected_spec_hash)
