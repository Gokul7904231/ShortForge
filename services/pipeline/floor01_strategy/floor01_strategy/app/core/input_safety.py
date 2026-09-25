"""Shared untrusted-input boundary for Floor 01."""

from __future__ import annotations

import re
from typing import Any

_HTML_RE = re.compile(r"<[^>]*>")
_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")
_INJECTION_PATTERNS = (
    re.compile(r"(?i)ignore\s+all\s+previous\s+instructions"),
    re.compile(r"(?i)system\s+prompt\s+override"),
    re.compile(r"(?i)developer\s+message\s+override"),
    re.compile(r"(?i)reveal\s+(the\s+)?system\s+prompt"),
)


def sanitize_input_text(text: str, *, max_length: int = 2000) -> str:
    """Strip markup, control bytes, and common instruction-boundary attacks."""
    if not text:
        return ""
    cleaned = _HTML_RE.sub("", str(text))
    for pattern in _INJECTION_PATTERNS:
        cleaned = pattern.sub("", cleaned)
    cleaned = _CONTROL_RE.sub("", cleaned).strip()
    return cleaned[:max_length]


def sanitize_constraint_value(value: Any, depth: int = 0) -> Any:
    """Recursively sanitize user-controlled constraint strings with a bounded depth."""
    if depth > 6:
        return "[TRUNCATED]"
    if isinstance(value, str):
        return sanitize_input_text(value, max_length=1000)
    if isinstance(value, list):
        return [sanitize_constraint_value(item, depth + 1) for item in value[:100]]
    if isinstance(value, tuple):
        return tuple(sanitize_constraint_value(item, depth + 1) for item in value[:100])
    if isinstance(value, dict):
        return {
            str(key)[:120]: sanitize_constraint_value(item, depth + 1)
            for key, item in list(value.items())[:100]
        }
    return value
