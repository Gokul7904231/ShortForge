"""Stable identity and canonical hashing utilities for Floor 03."""

from __future__ import annotations

import hashlib
import json
from typing import Any


CANONICAL_FLOOR_ID = "floor03_asset_realization"
CANONICAL_FLOOR_VERSION = "2.3.1"


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def stable_sha256(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def request_fingerprint(request_id: str, script_id: str, script_version: int) -> str:
    return stable_sha256(
        {"request_id": request_id, "script_id": script_id, "script_version": script_version}
    )


def _semanticize_plan(value: Any, key: str | None = None) -> Any:
    """Remove runtime-only identifiers from the plan fingerprint projection."""
    if isinstance(value, dict):
        return {
            item_key: _semanticize_plan(item_value, item_key)
            for item_key, item_value in value.items()
            if item_key not in {
                "plan_id",
                "plan_version",
                "plan_fingerprint",
                "script_id",
                "asset_id",
                "source_asset_id",
                "evidence_id",
            }
        }
    if isinstance(value, list):
        return [_semanticize_plan(item) for item in value]
    return value


def floor02_source_fingerprint(payload: Any) -> str:
    """Fingerprint the semantic Floor 02 state that materially feeds F03."""
    value = payload.model_dump(mode="json") if hasattr(payload, "model_dump") else dict(payload)
    semantic = _semanticize_plan(value)
    for key in ("request_id", "created_at", "provenance", "successor_handoffs",
                "decision_quality_score", "handoff_status", "quality_report"):
        semantic.pop(key, None)
    semantic.pop("plan_id", None)
    semantic.pop("script_id", None)
    semantic.pop("script_version", None)
    return stable_sha256(
        {
            "source_floor_id": value.get("floor_id", "floor02_scripting"),
            "source_floor_version": value.get("floor_version", "unknown"),
            "script_version": value.get("script_version", 1),
            "source": semantic,
        }
    )


def asset_plan_node_fingerprint(node: Any) -> str:
    """Fingerprint node semantics independently of runtime asset identity."""
    value = node.model_dump(mode="json") if hasattr(node, "model_dump") else dict(node)
    return stable_sha256(_semanticize_plan(value))


def asset_plan_fingerprint(plan: Any) -> str:
    """Fingerprint semantic plan content, independent of runtime/request identity."""
    value = plan.model_dump(mode="json") if hasattr(plan, "model_dump") else dict(plan)
    semantic = _semanticize_plan(value)
    lineage = semantic.get("lineage") or {}
    semantic["lineage"] = {
        "source_floor_id": lineage.get("source_floor_id"),
        "source_floor_version": lineage.get("source_floor_version"),
        "source_script_version": lineage.get("source_script_version"),
        "source_fingerprint": lineage.get("source_fingerprint"),
        "compiler_floor_id": lineage.get("compiler_floor_id"),
        "compiler_floor_version": lineage.get("compiler_floor_version"),
    }
    return stable_sha256(semantic)



def floor03_input_fingerprint(value: Any) -> str:
    """Fingerprint the complete validated Floor 03 input for Guardian evidence."""
    if hasattr(value, "model_dump"):
        value = value.model_dump(mode="json")
    return stable_sha256({"floor": CANONICAL_FLOOR_ID, "input": value})
