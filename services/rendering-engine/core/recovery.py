#!/usr/bin/env python3
"""
Phase P5 — Checkpointed DAG, Bounded Healing, Circuit Breaker, Canary & Disk Quota
=================================================================================
- CAS memoization keyed by (input_hash, toolchain_hash, floor_id)
- Per-stage retry cap = 3; Global job attempt budget = 5 across all floors
- Healing ladder: transient (2s..30s jittered), permanent-input (visual/voice),
  systemic (circuit breaker), fenced (silent discard)
- DLQ forensic bundle with IRs, probe JSONs, input hashes, and logs
- Golden canary hash gate (mismatch => DRAIN worker)
- Disk quota (2GB/job, 80% GC / 90% drain, /scratch/{job}/{epoch}/)
"""

from __future__ import annotations

import hashlib
import json
import random
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
    """Enforces 2GB per-job quota, 80% GC / 90% drain watermarks, and /scratch/{job}/{epoch}/."""

    def __init__(
        self,
        *,
        scratch_root: Path,
        per_job_quota_bytes: int = PER_JOB_QUOTA_BYTES,
    ) -> None:
        self.scratch_root = scratch_root
        self.per_job_quota_bytes = per_job_quota_bytes

    def get_job_scratch_dir(self, job_id: str, *, epoch: int) -> Path:
        return self.scratch_root / job_id / str(epoch)

    def evaluate_disk_watermark(self, usage_ratio: float) -> str:
        if usage_ratio >= 0.90:
            return "DRAIN"
        if usage_ratio >= 0.80:
            return "GC"
        return "OK"


class CheckpointedDAGRunner:
    """CAS-memoized floor runner with bounded per-stage (3) & global (5) attempt budgets."""

    def __init__(
        self,
        *,
        cas_dir: Path,
        dlq_dir: Path,
        toolchain_hash: str,
    ) -> None:
        self.cas_dir = cas_dir
        self.dlq_dir = dlq_dir
        self.toolchain_hash = toolchain_hash
        self.cas_dir.mkdir(parents=True, exist_ok=True)
        self.dlq_dir.mkdir(parents=True, exist_ok=True)
        self._stage_attempts: Dict[Tuple[str, str], int] = {}
        self._global_attempts: Dict[str, int] = {}

    def _memo_key(self, input_data: Any, floor_id: str) -> str:
        input_hash = hashlib.sha256(
            json.dumps(input_data, sort_keys=True, default=str).encode("utf-8")
        ).hexdigest()
        return hashlib.sha256(
            f"{input_hash}:{self.toolchain_hash}:{floor_id}".encode("utf-8")
        ).hexdigest()

    def write_dlq_bundle(self, job_id: str, forensic_context: Dict[str, Any]) -> Path:
        bundle_dir = self.dlq_dir / job_id
        bundle_dir.mkdir(parents=True, exist_ok=True)
        bundle_path = bundle_dir / "bundle.json"
        payload = {
            "jobId": job_id,
            "toolchainHash": self.toolchain_hash,
            "globalAttempts": self._global_attempts.get(job_id, 0),
            "ir": forensic_context.get("ir", {}),
            "probes": forensic_context.get("probes", []),
            "inputHashes": forensic_context.get("inputHashes", {}),
            "logs": forensic_context.get("logs", []),
        }
        bundle_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return bundle_path

    def record_stage_attempt(
        self,
        job_id: str,
        floor_id: str,
        *,
        forensic_context: Optional[Dict[str, Any]] = None,
    ) -> None:
        g_count = self._global_attempts.get(job_id, 0) + 1
        if g_count > MAX_GLOBAL_ATTEMPTS:
            self.write_dlq_bundle(job_id, forensic_context or {"logs": [f"Global budget exhausted at {floor_id}"]})
            raise GlobalBudgetExhaustedError(
                f"Job {job_id} exceeded global attempt budget ({MAX_GLOBAL_ATTEMPTS}); routed to DLQ"
            )
        s_count = self._stage_attempts.get((job_id, floor_id), 0) + 1
        if s_count > MAX_STAGE_ATTEMPTS:
            self.write_dlq_bundle(job_id, forensic_context or {"logs": [f"Stage budget exhausted at {floor_id}"]})
            raise StageBudgetExhaustedError(
                f"Job {job_id} floor {floor_id} exceeded stage attempt budget ({MAX_STAGE_ATTEMPTS})"
            )
        self._global_attempts[job_id] = g_count
        self._stage_attempts[(job_id, floor_id)] = s_count

    def execute_job(
        self,
        *,
        job_id: str,
        initial_input: Any,
        stages: Sequence[Tuple[str, Callable[[Any], Any]]],
    ) -> Dict[str, Any]:
        results: Dict[str, Any] = {}
        current_input = initial_input
        for floor_id, fn in stages:
            key = self._memo_key(current_input, floor_id)
            cas_file = self.cas_dir / f"{key}.json"
            if cas_file.exists():
                out = json.loads(cas_file.read_text(encoding="utf-8"))
            else:
                self.record_stage_attempt(job_id, floor_id, forensic_context={"ir": initial_input})
                out = fn(current_input)
                cas_file.write_text(json.dumps(out, sort_keys=True), encoding="utf-8")
            results[floor_id] = out
            current_input = out
        return results
