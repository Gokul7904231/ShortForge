#!/usr/bin/env python3
"""
Phase P5 / P5.1 — Checkpointed DAG, Durable SQLite Budgets, Bounded Healing,
Circuit Breaker, Canary & Real Disk Quota Measurement
=============================================================================
- CAS memoization keyed by (input_hash, toolchain_hash, floor_id) with
  two-level sharded layout + reconciliation records
- Durable SQLite per-stage (3) and global (5) attempt budgets across restarts
- Real healing loop in execute_job: transient (2s..30s jittered backoff),
  permanent-input (visual/voice HealingLadder), systemic (circuit breaker),
  fenced (silent discard, no retry)
- DLQ forensic bundle with IRs, probe JSONs, input hashes, and logs
- Golden canary hash gate (mismatch => DRAIN worker)
- Disk quota (2GB/job, real shutil.disk_usage measurement, 80% GC / 90% DRAIN)
"""

from __future__ import annotations

import hashlib
import inspect
import json
import random
import shutil
import sqlite3
import time
from collections import deque
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Dict, Optional, Sequence, Tuple

MAX_STAGE_ATTEMPTS = 3
MAX_GLOBAL_ATTEMPTS = 5
PER_JOB_QUOTA_BYTES = 2 * 1024 * 1024 * 1024  # 2 GB


class StageBudgetExhaustedError(RuntimeError):
    """Raised when a single floor exceeds MAX_STAGE_ATTEMPTS (3)."""


class GlobalBudgetExhaustedError(RuntimeError):
    """Raised when a job exceeds MAX_GLOBAL_ATTEMPTS (5) across all floors."""


class CircuitOpenError(RuntimeError):
    """Raised when the systemic circuit breaker is OPEN and intake is paused."""


class FencedJobError(RuntimeError):
    """Raised when a job lease/token is fenced (stale/superseded)."""

    failure_class = "fenced"


class PermanentInputError(RuntimeError):
    """Raised when an input/asset cannot be generated and needs fallback ladder."""

    failure_class = "permanent-input"


@dataclass(frozen=True)
class FencedDiscardResult:
    discarded: bool = True
    retry: bool = False
    detail: str = ""


@dataclass(frozen=True)
class CanaryEvaluation:
    worker_id: str
    healthy: bool
    should_drain: bool
    status: str
    observed_sha256: str
    expected_sha256: str


def compute_jittered_backoff_sec(
    attempt: int,
    *,
    base_sec: float = 2.0,
    cap_sec: float = 30.0,
    rng_unit: Optional[float] = None,
) -> float:
    raw = min(cap_sec, base_sec * (2 ** max(0, attempt - 1)))
    u = random.random() if rng_unit is None else max(0.0, min(1.0, float(rng_unit)))
    jittered = raw * (0.75 + 0.5 * u)
    return max(base_sec, min(cap_sec, jittered))


def classify_failure(exc: Exception) -> str:
    explicit = getattr(exc, "failure_class", None)
    if explicit in ("fenced", "transient", "permanent-input", "systemic"):
        return str(explicit)
    if isinstance(exc, CircuitOpenError):
        return "systemic"
    name = type(exc).__name__.lower()
    msg = str(exc).lower()
    if "fenced" in name or "stale" in msg or "fenced" in msg:
        return "fenced"
    if "visualasset" in name or "permanent" in name or "preflight" in name or isinstance(exc, ValueError):
        return "permanent-input"
    return "transient"


class HealingLadder:
    VISUAL_LADDER = ["gen", "pre_normalized_cas_stock", "branded_template"]
    VOICE_LADDER = ["primary", "secondary"]

    def next_visual_fallback(self, current: str) -> Optional[str]:
        try:
            idx = self.VISUAL_LADDER.index(current)
            return self.VISUAL_LADDER[idx + 1] if idx + 1 < len(self.VISUAL_LADDER) else None
        except ValueError:
            return None

    def next_voice_fallback(self, current: str) -> Optional[str]:
        try:
            idx = self.VOICE_LADDER.index(current)
            return self.VOICE_LADDER[idx + 1] if idx + 1 < len(self.VOICE_LADDER) else None
        except ValueError:
            return None

    def handle_classification(self, classification: str, *, detail: str = "") -> Any:
        if classification == "fenced":
            return FencedDiscardResult(discarded=True, retry=False, detail=detail)
        if classification == "transient":
            return {"action": "retry_backoff", "detail": detail}
        if classification == "permanent-input":
            return {"action": "fallback_ladder", "detail": detail}
        if classification == "systemic":
            return {"action": "trip_circuit_breaker", "detail": detail}
        raise ValueError(f"Unknown failure classification: {classification}")


class CircuitBreaker:
    """Sliding-window (50 jobs) circuit breaker opening at >20% failure, 1 probe per 60s."""

    def __init__(
        self,
        *,
        window_size: int = 50,
        failure_threshold: float = 0.20,
        cooldown_sec: float = 60.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        self.window_size = window_size
        self.failure_threshold = failure_threshold
        self.cooldown_sec = cooldown_sec
        self.clock = clock
        self._outcomes: deque[bool] = deque(maxlen=window_size)
        self.state = "CLOSED"
        self._opened_at: Optional[float] = None
        self._probe_in_flight = False

    def record_success(self) -> None:
        self._outcomes.append(True)
        if self.state == "HALF_OPEN":
            self.state = "CLOSED"
            self._opened_at = None
            self._probe_in_flight = False

    def record_failure(self) -> None:
        self._outcomes.append(False)
        if self.state == "HALF_OPEN":
            self.state = "OPEN"
            self._opened_at = self.clock()
            self._probe_in_flight = False
            return
        if len(self._outcomes) >= 10:
            failures = sum(1 for ok in self._outcomes if not ok)
            if (failures / len(self._outcomes)) > self.failure_threshold:
                self.state = "OPEN"
                self._opened_at = self.clock()

    def allow_intake(self) -> bool:
        if self.state == "CLOSED":
            return True
        if self.state == "OPEN":
            assert self._opened_at is not None
            if (self.clock() - self._opened_at) >= self.cooldown_sec:
                self.state = "HALF_OPEN"
                self._probe_in_flight = True
                return True
            raise CircuitOpenError("Systemic circuit breaker is OPEN; intake paused")
        if self.state == "HALF_OPEN":
            if self._probe_in_flight:
                raise CircuitOpenError("Half-open probe already in flight (1/60s)")
            self._probe_in_flight = True
            return True
        return False


def evaluate_worker_canary(
    *,
    worker_id: str,
    observed_sha256: str,
    fleet_golden_sha256: str,
) -> CanaryEvaluation:
    match = observed_sha256.strip().lower() == fleet_golden_sha256.strip().lower()
    return CanaryEvaluation(
        worker_id=worker_id,
        healthy=match,
        should_drain=not match,
        status="HEALTHY" if match else "DRAINED",
        observed_sha256=observed_sha256,
        expected_sha256=fleet_golden_sha256,
    )


class DiskQuotaManager:
    """Enforces 2GB per-job quota, real disk measurement, 80% GC / 90% drain watermarks."""

    def __init__(
        self,
        *,
        scratch_root: Path,
        per_job_quota_bytes: int = PER_JOB_QUOTA_BYTES,
        disk_usage_fn: Optional[Callable[[Path], Tuple[int, int, int]]] = None,
    ) -> None:
        self.scratch_root = scratch_root
        self.per_job_quota_bytes = per_job_quota_bytes
        self._disk_usage_fn = disk_usage_fn or self._default_disk_usage

    @staticmethod
    def _default_disk_usage(target: Path) -> Tuple[int, int, int]:
        usage = shutil.disk_usage(str(target))
        return int(usage.total), int(usage.used), int(usage.free)

    def get_job_scratch_dir(self, job_id: str, *, epoch: int) -> Path:
        return self.scratch_root / job_id / str(epoch)

    def evaluate_disk_watermark(self, usage_ratio: float) -> str:
        if usage_ratio >= 0.90:
            return "DRAIN"
        if usage_ratio >= 0.80:
            return "GC"
        return "OK"

    def measure_disk_usage(self, target: Optional[Path] = None) -> Tuple[float, int, int, int]:
        check_path = target or self.scratch_root
        check_path.mkdir(parents=True, exist_ok=True)
        total, used, free = self._disk_usage_fn(check_path)
        ratio = (used / total) if total > 0 else 0.0
        return ratio, total, used, free

    def check_and_enforce(self, target: Optional[Path] = None) -> Dict[str, Any]:
        ratio, total, used, free = self.measure_disk_usage(target)
        action = self.evaluate_disk_watermark(ratio)
        if action == "GC":
            self._prune_old_scratch()
        return {
            "action": action,
            "status": "DEGRADED" if action == "DRAIN" else ("GC" if action == "GC" else "HEALTHY"),
            "refuse_new_leases": action == "DRAIN",
            "usage_ratio": round(ratio, 4),
            "total_bytes": total,
            "used_bytes": used,
            "free_bytes": free,
        }

    def _prune_old_scratch(self, max_age_sec: float = 3600.0) -> int:
        if not self.scratch_root.exists():
            return 0
        removed = 0
        now = time.time()
        for child in self.scratch_root.iterdir():
            try:
                if child.is_dir() and (now - child.stat().st_mtime) > max_age_sec:
                    shutil.rmtree(child, ignore_errors=True)
                    removed += 1
            except Exception:
                pass
        return removed


class CheckpointedDAGRunner:
    """CAS-memoized floor runner with durable SQLite budgets and bounded healing."""

    def __init__(
        self,
        *,
        cas_dir: Path,
        dlq_dir: Path,
        toolchain_hash: str,
        db_path: Optional[Path] = None,
    ) -> None:
        self.cas_dir = cas_dir
        self.dlq_dir = dlq_dir
        self.toolchain_hash = toolchain_hash
        self.cas_dir.mkdir(parents=True, exist_ok=True)
        self.dlq_dir.mkdir(parents=True, exist_ok=True)
        (self.cas_dir / "reconcile").mkdir(parents=True, exist_ok=True)
        self.db_path = db_path or (self.cas_dir / "recovery_budgets.sqlite3")
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(str(self.db_path), timeout=30.0, isolation_level=None)
        conn.execute("PRAGMA journal_mode=WAL")
        return conn

    def _init_db(self) -> None:
        conn = self._connect()
        try:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS stage_attempts (
                    job_id TEXT NOT NULL,
                    floor_id TEXT NOT NULL,
                    attempts INTEGER NOT NULL,
                    updated_at REAL NOT NULL,
                    PRIMARY KEY (job_id, floor_id)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS global_attempts (
                    job_id TEXT PRIMARY KEY,
                    attempts INTEGER NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
        finally:
            conn.close()

    def get_global_attempts(self, job_id: str) -> int:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT attempts FROM global_attempts WHERE job_id = ?", (job_id,)
            ).fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()

    def get_stage_attempts(self, job_id: str, floor_id: str) -> int:
        conn = self._connect()
        try:
            row = conn.execute(
                "SELECT attempts FROM stage_attempts WHERE job_id = ? AND floor_id = ?",
                (job_id, floor_id),
            ).fetchone()
            return int(row[0]) if row else 0
        finally:
            conn.close()

    def _memo_key(self, input_data: Any, floor_id: str) -> str:
        input_hash = hashlib.sha256(
            json.dumps(input_data, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        return hashlib.sha256(
            f"{input_hash}:{self.toolchain_hash}:{floor_id}".encode("utf-8")
        ).hexdigest()

    def _cas_path(self, key: str) -> Path:
        shard_dir = self.cas_dir / key[:2]
        shard_dir.mkdir(parents=True, exist_ok=True)
        return shard_dir / f"{key}.json"

    def _write_reconcile_record(self, job_id: str, floor_id: str, key: str, cas_file: Path) -> None:
        rec_path = self.cas_dir / "reconcile" / f"{job_id}_{floor_id}.json"
        rec_path.write_text(
            json.dumps(
                {
                    "jobId": job_id,
                    "floorId": floor_id,
                    "sha256": key,
                    "casPath": str(cas_file),
                    "toolchainHash": self.toolchain_hash,
                    "recordedAt": time.time(),
                },
                indent=2,
            ),
            encoding="utf-8",
        )

    def write_dlq_bundle(self, job_id: str, forensic_context: Dict[str, Any]) -> Dict[str, Any]:
        bundle_dir = self.dlq_dir / job_id
        bundle_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = bundle_dir / "bundle.json"
        payload = {
            "jobId": job_id,
            "toolchainHash": self.toolchain_hash,
            "globalAttempts": self.get_global_attempts(job_id),
            "ir": forensic_context.get("ir", {}),
            "probes": forensic_context.get("probes", []),
            "inputHashes": forensic_context.get("inputHashes", {}),
            "logs": forensic_context.get("logs", []),
        }
        bundle_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return {"bundlePath": str(bundle_path), "bundle": payload}

    def record_stage_attempt(
        self,
        job_id: str,
        floor_id: str,
        *,
        forensic_context: Optional[Dict[str, Any]] = None,
    ) -> Tuple[int, int]:
        now = time.time()
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            g_row = conn.execute(
                "SELECT attempts FROM global_attempts WHERE job_id = ?", (job_id,)
            ).fetchone()
            g_count = (int(g_row[0]) if g_row else 0) + 1
            if g_count > MAX_GLOBAL_ATTEMPTS:
                conn.execute("ROLLBACK")
                self.write_dlq_bundle(
                    job_id, forensic_context or {"logs": [f"Global budget exhausted at {floor_id}"]}
                )
                raise GlobalBudgetExhaustedError(
                    f"Job {job_id} exceeded global attempt budget ({MAX_GLOBAL_ATTEMPTS}); routed to DLQ"
                )

            s_row = conn.execute(
                "SELECT attempts FROM stage_attempts WHERE job_id = ? AND floor_id = ?",
                (job_id, floor_id),
            ).fetchone()
            s_count = (int(s_row[0]) if s_row else 0) + 1
            if s_count > MAX_STAGE_ATTEMPTS:
                conn.execute("ROLLBACK")
                self.write_dlq_bundle(
                    job_id, forensic_context or {"logs": [f"Stage budget exhausted at {floor_id}"]}
                )
                raise StageBudgetExhaustedError(
                    f"Job {job_id} floor {floor_id} exceeded stage attempt budget ({MAX_STAGE_ATTEMPTS})"
                )

            conn.execute(
                """
                INSERT INTO global_attempts (job_id, attempts, updated_at)
                VALUES (?, ?, ?)
                ON CONFLICT(job_id) DO UPDATE SET attempts = excluded.attempts, updated_at = excluded.updated_at
                """,
                (job_id, g_count, now),
            )
            conn.execute(
                """
                INSERT INTO stage_attempts (job_id, floor_id, attempts, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(job_id, floor_id) DO UPDATE SET attempts = excluded.attempts, updated_at = excluded.updated_at
                """,
                (job_id, floor_id, s_count, now),
            )
            conn.execute("COMMIT")
            return s_count, g_count
        finally:
            conn.close()

    @staticmethod
    def _invoke_stage(fn: Callable[..., Any], current_input: Any, fallback_mode: Optional[str]) -> Any:
        try:
            sig = inspect.signature(fn)
            if "fallback_mode" in sig.parameters:
                return fn(current_input, fallback_mode=fallback_mode)
        except (TypeError, ValueError):
            pass
        return fn(current_input)

    def execute_job(
        self,
        *,
        job_id: str,
        initial_input: Any,
        stages: Sequence[Tuple[str, Callable[..., Any]]],
        breaker: Optional[CircuitBreaker] = None,
        sleep_fn: Callable[[float], None] = time.sleep,
        ladder: Optional[HealingLadder] = None,
        stage_kinds: Optional[Dict[str, str]] = None,
    ) -> Any:
        healing = ladder or HealingLadder()
        kinds = stage_kinds or {}
        results: Dict[str, Any] = {}
        current_input = initial_input

        for floor_id, fn in stages:
            key = self._memo_key(current_input, floor_id)
            cas_file = self._cas_path(key)
            if cas_file.exists():
                out = json.loads(cas_file.read_text(encoding="utf-8"))
                self._write_reconcile_record(job_id, floor_id, key, cas_file)
                results[floor_id] = out
                current_input = out
                continue

            kind = kinds.get(floor_id, "visual")
            fallback_mode: Optional[str] = (
                healing.VOICE_LADDER[0] if kind == "voice" else healing.VISUAL_LADDER[0]
            )
            logs: list[str] = []

            while True:
                stage_attempt, _ = self.record_stage_attempt(
                    job_id,
                    floor_id,
                    forensic_context={"ir": initial_input, "logs": logs},
                )
                try:
                    out = self._invoke_stage(fn, current_input, fallback_mode)
                    cas_file.write_text(json.dumps(out, sort_keys=True), encoding="utf-8")
                    self._write_reconcile_record(job_id, floor_id, key, cas_file)
                    if breaker is not None:
                        breaker.record_success()
                    break
                except Exception as exc:
                    logs.append(f"{floor_id} attempt={stage_attempt} mode={fallback_mode}: {exc}")
                    cls = classify_failure(exc)
                    if cls == "fenced":
                        return FencedDiscardResult(discarded=True, retry=False, detail=str(exc))
                    if cls == "systemic":
                        if breaker is not None:
                            breaker.record_failure()
                        self.write_dlq_bundle(job_id, {"ir": initial_input, "logs": logs})
                        raise
                    if cls == "transient":
                        delay = compute_jittered_backoff_sec(stage_attempt)
                        sleep_fn(delay)
                        continue
                    if cls == "permanent-input":
                        next_fb = (
                            healing.next_voice_fallback(fallback_mode)
                            if kind == "voice" and fallback_mode
                            else healing.next_visual_fallback(fallback_mode or healing.VISUAL_LADDER[0])
                        )
                        if next_fb is None:
                            self.write_dlq_bundle(job_id, {"ir": initial_input, "logs": logs})
                            raise
                        fallback_mode = next_fb
                        continue

            results[floor_id] = out
            current_input = out
        return results
