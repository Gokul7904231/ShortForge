"""Process-safe file memory store for Floor 03 asset specifications and request idempotency."""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, Optional

import structlog

from floors.floor03_asset_realization.app.core.config import settings

logger = structlog.get_logger(__name__)

# Cross-platform file locking imports
if sys.platform == "win32":
    import msvcrt

    def _lock_file(f):
        f.seek(0)
        msvcrt.locking(f.fileno(), msvcrt.LK_LOCK, 1)

    def _unlock_file(f):
        f.seek(0)
        try:
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        except OSError:
            pass
else:
    import fcntl

    def _lock_file(f):
        fcntl.flock(f.fileno(), fcntl.LOCK_EX)

    def _unlock_file(f):
        fcntl.flock(f.fileno(), fcntl.LOCK_UN)


class AssetMemoryStore:
    """Process-safe memory store for Floor 03 asset specification persistence and deduplication."""

    def __init__(self, storage_path: Optional[str] = None):
        self.storage_path = Path(storage_path or settings.STORAGE_PATH)
        self.storage_path.parent.mkdir(parents=True, exist_ok=True)
        self.lock_path = self.storage_path.with_suffix(".lock")
        self._records: Dict[str, Dict[str, Any]] = {}
        self._load_with_lock()

    def _load_with_lock(self) -> None:
        """Acquire sidecar lock and load JSON file with corruption auto-recovery."""
        with open(self.lock_path, "a+", encoding="utf-8") as lock_file:
            _lock_file(lock_file)
            try:
                if self.storage_path.exists() and self.storage_path.stat().st_size > 0:
                    with open(self.storage_path, "r", encoding="utf-8") as f:
                        self._records = json.load(f)
                else:
                    self._records = {}
            except Exception as e:
                logger.error("memory_store_corruption_detected", error=str(e))
                # Backup corrupted file
                corrupt_backup = self.storage_path.with_name(
                    f"{self.storage_path.name}.corrupted.{int(time.time())}"
                )
                try:
                    if self.storage_path.exists():
                        os.replace(self.storage_path, corrupt_backup)
                except Exception:
                    pass
                self._records = {}
            finally:
                _unlock_file(lock_file)

    def get_idempotent_payload(
        self,
        request_id: str,
        expected_fingerprint: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Retrieve a cached payload and reject fingerprint conflicts when known."""
        self._load_with_lock()
        record = self._records.get(request_id)
        if not record:
            return None

        stored_fingerprint = record.get("request_fingerprint")
        if expected_fingerprint and stored_fingerprint and stored_fingerprint != expected_fingerprint:
            raise ValueError(
                f"Idempotency conflict: fingerprint mismatch for request_id '{request_id}'."
            )

        # Older records may not contain a fingerprint. They remain readable for
        # compatibility; new writes always persist one.
        return record.get("payload")

    def save_payload(
        self,
        request_id: str,
        payload_dict: Dict[str, Any],
        request_fingerprint: Optional[str] = None,
    ) -> None:
        """Atomically persist payload dict under process-level sidecar lock."""
        with open(self.lock_path, "a+", encoding="utf-8") as lock_file:
            _lock_file(lock_file)
            try:
                # Reload latest state
                if self.storage_path.exists() and self.storage_path.stat().st_size > 0:
                    with open(self.storage_path, "r", encoding="utf-8") as f:
                        self._records = json.load(f)

                # Enforce max record retention
                if len(self._records) >= settings.MAX_MEMORY_RECORDS:
                    oldest_keys = list(self._records.keys())[:100]
                    for k in oldest_keys:
                        del self._records[k]

                self._records[request_id] = {
                    "timestamp": time.time(),
                    "request_fingerprint": request_fingerprint,
                    "payload": payload_dict,
                }

                # Atomic write via temporary file replacement
                dir_path = self.storage_path.parent
                tf = tempfile.NamedTemporaryFile("w", dir=dir_path, delete=False, encoding="utf-8")
                temp_name = tf.name
                try:
                    json.dump(self._records, tf, indent=2)
                    tf.flush()
                    tf.close()
                    for attempt in range(5):
                        try:
                            os.replace(temp_name, self.storage_path)
                            break
                        except PermissionError:
                            if attempt == 4:
                                raise
                            time.sleep(0.05)
                finally:
                    if os.path.exists(temp_name):
                        try:
                            os.remove(temp_name)
                        except OSError:
                            pass
            finally:
                _unlock_file(lock_file)
