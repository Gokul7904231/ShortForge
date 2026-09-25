"""Stable identity and canonical hashing utilities for Floor 03."""

from __future__ import annotations

import hashlib
import json
from typing import Any


CANONICAL_FLOOR_ID = "floor03_asset_realization"
CANONICAL_FLOOR_VERSION = "2.2.0"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def stable_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def request_fingerprint(request_id: str, script_id: str, script_version: int) -> str:
    return stable_sha256(
        {"request_id": request_id, "script_id": script_id, "script_version": script_version}
    )


def asset_plan_fingerprint(plan: Any) -> str:
    """Fingerprint semantic plan content, independent of runtime/request identity."""
    if hasattr(plan, "model_dump"):
        value = plan.model_dump(mode="json", exclude={"plan_id", "plan_fingerprint"})
    else:
        value = dict(plan)
        value.pop("plan_id", None)
        value.pop("plan_fingerprint", None)
    return stable_sha256(value)


def floor03_input_fingerprint(value: Any) -> str:
    """Fingerprint the complete validated Floor 03 input for Guardian evidence."""
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json")
    return stable_sha256({"floor": CANONICAL_FLOOR_ID, "input": value})
