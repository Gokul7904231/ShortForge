"""Strategy Memory Store for Floor 01.

Provides process-safe, atomic-write file persistence / in-memory storage for past topic queries,
strategic decisions, request idempotency indexing, corruption recovery, and retention bounds.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple
from uuid import uuid4

import structlog

logger = structlog.get_logger(__name__)

# Cross-platform process file locking support
if sys.platform == "win32":
    import msvcrt

    def _lock_file(f):
        for attempt in range(1000):
            try:
                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                return
            except (IOError, OSError):
                time.sleep(0.01)
        raise TimeoutError("Failed to acquire process file lock within timeout")

    def _unlock_file(f):
        try:
            f.seek(0)
            msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
        except (IOError, OSError):
            pass
else:
    import fcntl

    def _lock_file(f):
        for attempt in range(1000):
            try:
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                return
            except (IOError, OSError):
                time.sleep(0.01)
        raise TimeoutError("Failed to acquire process file lock within timeout")

    def _unlock_file(f):
        try:
            fcntl.flock(f.fileno(), fcntl.LOCK_UN)
        except (IOError, OSError):
            pass


class StrategyMemoryStore:
    """Process-safe, atomic-write strategy memory persistence & idempotency store."""

    SCHEMA_VERSION = "1.0"
    DEFAULT_MAX_RECORDS = 1000

    def __init__(
        self,
        storage_path: Optional[str] = None,
        max_records: int = DEFAULT_MAX_RECORDS,
    ) -> None:
        self.storage_path = Path(storage_path) if storage_path else None
        self.max_records = max_records
        self._records: List[Dict[str, Any]] = []
        self._idempotency_map: Dict[str, Dict[str, Any]] = {}
        self._reservations: Dict[str, Dict[str, Any]] = {}

        if self.storage_path and self.storage_path.exists():
            self._load_from_disk(skip_lock=False)

    def _get_lock_path(self) -> Optional[Path]:
        if self.storage_path:
            return self.storage_path.with_name(f"{self.storage_path.name}.lock")
        return None

    def _load_from_disk(self, skip_lock: bool = False) -> List[Dict[str, Any]]:
        if not self.storage_path or not self.storage_path.is_file():
            return []

        lock_path = self._get_lock_path()
        lock_file = None
        if lock_path and not skip_lock:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock_file = open(lock_path, "a+")
            _lock_file(lock_file)

        try:
            content = None
            for attempt in range(10):
                try:
                    with self.storage_path.open("r", encoding="utf-8") as f:
                        content = f.read()
                        break
                except (PermissionError, OSError) as exc:
                    if attempt < 9:
                        time.sleep(0.01)
                        continue
                    logger.warning("strategy_memory_read_retry_failed", error=str(exc))

            if content is None or not content.strip():
                return self._records

            try:
                data = json.loads(content)
            except json.JSONDecodeError as exc:
                logger.warning("strategy_memory_corrupted_recovery", error=str(exc), path=str(self.storage_path))
                self._handle_corruption()
                return []

            if isinstance(data, dict) and "records" in data:
                disk_records = data.get("records", [])
                disk_reservations = data.get("reservations", {})
            elif isinstance(data, list):
                disk_records = data
                disk_reservations = {}
            else:
                disk_records = []
                disk_reservations = {}

            if isinstance(disk_reservations, dict):
                self._reservations.update(disk_reservations)

            # Merge disk records with in-memory records
            seen_keys = {r.get("record_id") or r.get("request_id") or r.get("topic") for r in self._records if r}
            for dr in disk_records:
                key = dr.get("record_id") or dr.get("request_id") or dr.get("topic")
                if key and key not in seen_keys:
                    self._records.append(dr)
                    seen_keys.add(key)

            self._rebuild_idempotency_map()
            return self._records

        finally:
            if lock_file:
                _unlock_file(lock_file)
                lock_file.close()

    def _handle_corruption(self) -> None:
        """Backup corrupted memory file and reset to clean state."""
        if self.storage_path and self.storage_path.exists():
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            corrupt_path = self.storage_path.with_name(f"{self.storage_path.name}.corrupted.{timestamp}")
            try:
                self.storage_path.rename(corrupt_path)
                logger.info("corrupted_memory_file_backed_up", corrupt_path=str(corrupt_path))
            except Exception as e:
                logger.error("corrupted_memory_backup_failed", error=str(e))

        self._records = []
        self._idempotency_map = {}

    def _rebuild_idempotency_map(self) -> None:
        self._idempotency_map.clear()
        for rec in self._records:
            req_id = rec.get("request_id")
            if req_id:
                self._idempotency_map[req_id] = rec.get("payload") or {}

    def save_to_disk(self, skip_lock: bool = False) -> None:
        if not self.storage_path:
            return

        lock_path = self._get_lock_path()
        lock_file = None
        if lock_path and not skip_lock:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock_file = open(lock_path, "a+")
            _lock_file(lock_file)

        try:
            # Re-read existing records before saving (pass skip_lock=True as we already hold lock_file)
            if self.storage_path.exists():
                self._load_from_disk(skip_lock=True)

            self.storage_path.parent.mkdir(parents=True, exist_ok=True)
            temp_file = tempfile.NamedTemporaryFile(
                mode="w",
                dir=str(self.storage_path.parent),
                delete=False,
                encoding="utf-8",
            )
            
            data = {
                "schema_version": self.SCHEMA_VERSION,
                "updated_at": datetime.now(timezone.utc).isoformat(),
                "record_count": len(self._records),
                "records": self._records,
                "reservations": self._reservations,
            }

            with temp_file as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
                f.flush()
                os.fsync(f.fileno())

            # Atomic replace with retry
            for attempt in range(15):
                try:
                    os.replace(temp_file.name, str(self.storage_path))
                    break
                except (PermissionError, OSError) as e:
                    if attempt < 14:
                        time.sleep(0.02)
                    else:
                        raise e

            logger.info("strategy_memory_saved_atomic", record_count=len(self._records))

        except Exception as exc:
            logger.error("strategy_memory_save_failed", error=str(exc))
            if "temp_file" in locals() and os.path.exists(temp_file.name):
                try:
                    os.remove(temp_file.name)
                except Exception:
                    pass
            raise
        finally:
            if lock_file:
                _unlock_file(lock_file)
                lock_file.close()

    def add_record(
        self,
        topic: str,
        plan_id: str,
        request_id: Optional[str] = None,
        payload: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        lock_path = self._get_lock_path()
        lock_file = None
        if lock_path:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock_file = open(lock_path, "a+")
            _lock_file(lock_file)

        try:
            # Reload disk records FIRST under lock (skip_lock=True since lock_file is already held)
            if self.storage_path and self.storage_path.exists():
                self._load_from_disk(skip_lock=True)

            # Idempotency check under lock: if request_id already exists on disk or in memory, skip adding duplicate
            if request_id:
                for rec in self._records:
                    if rec.get("request_id") == request_id:
                        existing_payload = rec.get("payload") or {}
                        logger.info("skip_duplicate_idempotent_add_record", request_id=request_id)
                        return existing_payload

            record = {
                "record_id": str(uuid4()),
                "request_id": request_id,
                "topic": topic,
                "plan_id": plan_id,
                "created_at": datetime.now(timezone.utc).isoformat(),
                "metadata": metadata or {},
                "payload": payload,
            }

            self._records.append(record)

            # Enforce maximum retention bounds (FIFO eviction of oldest records)
            if len(self._records) > self.max_records:
                evicted = self._records.pop(0)
                logger.info("strategy_memory_record_evicted", evicted_topic=evicted.get("topic"))

            if request_id:
                self._idempotency_map[request_id] = payload or {}
                self._reservations.pop(request_id, None)

            # Pass skip_lock=True to save_to_disk as lock_file is already held
            self.save_to_disk(skip_lock=True)

        finally:
            if lock_file:
                _unlock_file(lock_file)
                lock_file.close()

    def claim_request(
        self,
        request_id: str,
        input_fingerprint: str,
        ttl_seconds: float = 120.0,
    ) -> Tuple[str, Optional[Dict[str, Any]], Optional[str]]:
        """Atomically claim an idempotent request across OS processes.

        Returns (status, payload, owner_token), where status is OWNER, WAIT,
        or COMPLETED. A fingerprint conflict raises ValueError.
        """
        now = time.time()
        lock_path = self._get_lock_path()
        lock_file = None

        if lock_path:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock_file = open(lock_path, "a+")
            _lock_file(lock_file)

        try:
            if self.storage_path and self.storage_path.exists():
                self._load_from_disk(skip_lock=True)

            completed = self._idempotency_map.get(request_id)
            if completed:
                cached_fingerprint = completed.get("input_fingerprint")
                if cached_fingerprint and cached_fingerprint != input_fingerprint:
                    raise ValueError("Idempotency conflict: request fingerprint does not match the completed request.")
                return "COMPLETED", completed, None

            existing = self._reservations.get(request_id)
            if existing:
                if existing.get("input_fingerprint") != input_fingerprint:
                    raise ValueError("Idempotency conflict: request fingerprint does not match the in-flight request.")
                expires_at = float(existing.get("expires_at", 0.0))
                if expires_at > now:
                    return "WAIT", None, None
                self._reservations.pop(request_id, None)

            owner_token = str(uuid4())
            self._reservations[request_id] = {
                "input_fingerprint": input_fingerprint,
                "owner_token": owner_token,
                "created_at": now,
                "expires_at": now + max(5.0, ttl_seconds),
            }
            self.save_to_disk(skip_lock=True)
            return "OWNER", None, owner_token
        finally:
            if lock_file:
                _unlock_file(lock_file)
                lock_file.close()

    def wait_for_request(
        self,
        request_id: str,
        input_fingerprint: str,
        timeout_seconds: float = 130.0,
        poll_seconds: float = 0.025,
    ) -> Tuple[str, Optional[Dict[str, Any]]]:
        """Wait for the current owner to publish a canonical result or release its reservation."""
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            payload = self.get_idempotent_payload(request_id)
            if payload is not None:
                cached_fingerprint = payload.get("input_fingerprint")
                if cached_fingerprint and cached_fingerprint != input_fingerprint:
                    raise ValueError("Idempotency conflict: completed request fingerprint differs.")
                return "COMPLETED", payload

            now = time.time()
            reservation = self.get_request_reservation(request_id)
            if reservation is None or float(reservation.get("expires_at", 0.0)) <= now:
                return "RETRY", None
            if reservation.get("input_fingerprint") != input_fingerprint:
                raise ValueError("Idempotency conflict: in-flight request fingerprint differs.")
            time.sleep(poll_seconds)

        return "TIMEOUT", None

    def get_request_reservation(self, request_id: str) -> Optional[Dict[str, Any]]:
        if self.storage_path and self.storage_path.exists():
            self._load_from_disk()
        return dict(self._reservations.get(request_id)) if request_id in self._reservations else None

    def release_request(self, request_id: str, owner_token: Optional[str]) -> None:
        """Release an in-flight request reservation owned by this process."""
        if not owner_token:
            return

        lock_path = self._get_lock_path()
        lock_file = None
        if lock_path:
            lock_path.parent.mkdir(parents=True, exist_ok=True)
            lock_file = open(lock_path, "a+")
            _lock_file(lock_file)

        try:
            if self.storage_path and self.storage_path.exists():
                self._load_from_disk(skip_lock=True)
            reservation = self._reservations.get(request_id)
            if reservation and reservation.get("owner_token") == owner_token:
                self._reservations.pop(request_id, None)
                self.save_to_disk(skip_lock=True)
        finally:
            if lock_file:
                _unlock_file(lock_file)
                lock_file.close()

    def get_idempotent_payload(self, request_id: str) -> Optional[Dict[str, Any]]:
        """Return cached payload for request_id if previously processed."""
        if self.storage_path and self.storage_path.exists():
            self._load_from_disk()
        return self._idempotency_map.get(request_id)

    def get_all_topics(self) -> List[str]:
        if self.storage_path and self.storage_path.exists():
            self._load_from_disk()
        return [r["topic"] for r in self._records if "topic" in r]

    def clear(self) -> None:
        self._records.clear()
        self._idempotency_map.clear()
        self._reservations.clear()
        self.save_to_disk()
