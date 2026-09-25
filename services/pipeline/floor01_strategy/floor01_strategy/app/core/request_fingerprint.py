"""Deterministic request fingerprinting for Floor 01 idempotency."""

from __future__ import annotations

import hashlib
import json
from typing import Any

from floor01_strategy.app.domain.handoff import Floor01Input


def fingerprint_floor01_input(inp: Floor01Input) -> str:
    """Return a stable SHA-256 fingerprint excluding the caller-selected request id."""
    payload: dict[str, Any] = inp.model_dump(mode="json", exclude={"request_id"})
    canonical = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()
