"""Process-safe durable script memory and idempotency store."""

from __future__ import annotations

import hashlib
import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog

from floors.floor02_scripting.app.core.config import settings

logger = structlog.get_logger(__name__)

if sys.platform == "win32":
    import msvcrt

    def _lock_file(f) -> None:
        for _ in range(1000):
            try:
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                return
            except (IOError, OSError):
                time.sleep(0.01)
        raise TimeoutError("Failed to acquire process file lock")

    def _unlock_file(f) -> None:
        try:
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        except (IOError, OSError):
            pass
else:
    import fcntl

    def _lock_file(f) -> None:
        for _ in range(1000):
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                return
            except (IOError, OSError):
                time.sleep(0.01)
        raise TimeoutError("Failed to acquire process file lock")

    def _unlock_file(f) -> None:
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except (IOError, OSError):
            pass


class ScriptMemoryStore:
    """Atomic, bounded, process-safe persistence with request fingerprints."""

    SCHEMA_VERSION = "2.0"

    def __init__(self, storage_path: Optional[str] = None, max_records: int = settings.MEMORY_MAX_RECORDS) -> None:
        self.storage_path = Path(storage_path) if storage_path else None
        self.max_records = max_records
        self._records: List[Dict[str, Any]] = []
        self._idempotency_map: Dict[str, Dict[str, Any]] = {}
        self._fingerprints: Dict[str, str] = {}
        if self.storage_path and self.storage_path.exists():
            self._load_from_disk()

    @staticmethod
    def fingerprint(payload: Dict[str, Any]) -> str:
        canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
        return hashlib.sha256(canonical).hexdigest()

    def _lock_path(self) -> Optional[Path]:
        return self.storage_path.with_name(self.storage_path.name + ".lock") if self.storage_path else None

    def _load_from_disk(self, skip_lock: bool = False) -> List[Dict[str, Any]]:
        if not self.storage_path or not self.storage_path.is_file():
            return self._records

        lock = None
        lock_path = self._lock_path()
        if lock_path and not skip_lock:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock = open(lock_path, "a+", encoding="utf-8")
            _lock_file(lock)
        try:
            try:
                raw = self.storage_path.read_text(encoding="utf-8")
            except (PermissionError, OSError) as exc:
                logger.warning("script_memory_read_failed", error=str(exc))
                return self._records

            if not raw.strip():
                return self._records
            try:
                data = json.loads(raw)
            except json.JSONDecodeError as exc:
                self._handle_corruption()
                logger.error("script_memory_corrupted", error=str(exc))
                return self._records

            disk_records = data.get("records", []) if isinstance(data, dict) else data if isinstance(data, list) else []
            self._records = disk_records if isinstance(disk_records, list) else []
            self._rebuild_indexes()
            return self._records
        finally:
            if lock:
                _unlock_file(lock)
                lock.close()

    def _rebuild_indexes(self) -> None:
        self._idempotency_map.clear()
        self._fingerprints.clear()
        for rec in self._records:
            req = rec.get("request_id")
            if req:
                self._idempotency_map[req] = rec.get("payload") or {}
                self._fingerprints[req] = rec.get("request_fingerprint", "")

    def _handle_corruption(self) -> None:
        if self.storage_path and self.storage_path.exists():
            stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            backup = self.storage_path.with_name(f"{self.storage_path.name}.corrupted.{stamp}")
            try:
                self.storage_path.rename(backup)
            except Exception as exc:
                logger.error("script_memory_corruption_backup_failed", error=str(exc))
        self._records = []
        self._idempotency_map = {}
        self._fingerprints = {}

    def save_to_disk(self, skip_lock: bool = False) -> None:
        if not self.storage_path:
            return

        lock = None
        lock_path = self._lock_path()
        if lock_path and not skip_lock:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock = open(lock_path, "a+", encoding="utf-8")
            _lock_file(lock)

        temp_name: Optional[str] = None
        try:
            if self.storage_path.exists():
                self._load_from_disk(skip_lock=True)

            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            fd, temp_name = tempfile.mkstemp(prefix=self.storage_path.name + ".", suffix=".tmp", dir=str(self.storage_path.parent))
            with os.fdopen(fd, "w", encoding="utf-8") as handle:
                json.dump(
                    {
                        "schema_version": self.SCHEMA_VERSION,
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                        "record_count": len(self._records),
                        "records": self._records,
                    },
                    handle,
                    indent=2,
                    ensure_ascii=False,
                )
                handle.flush()
                os.fsync(handle.fileno())
            os.replace(temp_name, self.storage_path)
            temp_name = None
        except Exception as exc:
            if temp_name and os.path.exists(temp_name):
                try:
                    os.unlink(temp_name)
                except OSError:
                    pass
            logger.error("script_memory_save_failed", error=str(exc))
            if settings.is_production:
                raise
        finally:
            if lock:
                _unlock_file(lock)
                lock.close()

    def get_idempotent_payload(self, request_id: str, fingerprint: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if self.storage_path and self.storage_path.exists():
            self._load_from_disk()
        cached = self._idempotency_map.get(request_id)
        if cached is not None and fingerprint is not None:
            previous = self._fingerprints.get(request_id)
            if previous and previous != fingerprint:
                raise ValueError(f"Idempotency conflict for request_id '{request_id}'")
        return cached

    def add_record(
        self,
        script_id: str,
        title: str,
        request_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
        request_fingerprint: Optional[str] = None,
    ) -> None:
        lock = None
        lock_path = self._lock_path()
        if lock_path:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock = open(lock_path, "a+", encoding="utf-8")
            _lock_file(lock)

        try:
            if self.storage_path and self.storage_path.exists():
                self._load_from_disk(skip_lock=True)

            fingerprint = request_fingerprint or self.fingerprint(payload or {})
            if request_id and request_id in self._fingerprints:
                if self._fingerprints[request_id] != fingerprint:
                    raise ValueError(f"Idempotency conflict for request_id '{request_id}'")
                return

            self._records.append(
                {
                    "record_id": str(uuid4()),
                    "request_id": request_id,
                    "script_id": script_id,
                    "title": title,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "request_fingerprint": fingerprint,
                    "metadata": metadata or {},
                    "payload": payload or {},
                }
            )
            if len(self._records) > self.max_records:
                self._records = self._records[-self.max_records :]
            self._rebuild_indexes()
            self.save_to_disk(skip_lock=True)
        finally:
            if lock:
                _unlock_file(lock)
                lock.close()

    def clear(self) -> None:
        self._records.clear()
        self._idempotency_map.clear()
        self._fingerprints.clear()
        self.save_to_disk()
