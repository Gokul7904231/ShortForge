"""Security boundary for Floor 02.

Input hygiene is defense-in-depth only. Production authority comes from:
authenticated requests, bounded payloads, strict schemas, zero tools, output
sanitization, constant-time API-key checks, and a thread-safe rate limiter.
"""

from __future__ import annotations

import hmac
import re
import threading
import time
from typing import Dict

from fastapi import Header, HTTPException, Request, status

from floors.floor02_scripting.app.core.config import settings


_INJECTION_PATTERNS = [
    r"(?i)ignore\s+all\s+previous\s+instructions",
    r"(?i)disregard\s+the\s+previous\s+message",
    r"(?i)you\s+are\s+now\s+operating\s+in\s+developer\s+mode",
    r"(?i)system\s+prompt\s+override",
    r"(?i)reveal\s+(?:the\s+)?system\s+prompt",
]


def sanitize_input_text(text: str | None) -> str:
    """Normalize user text without pretending this is complete injection defense."""
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]*>", "", text)
    cleaned = "".join(ch for ch in cleaned if ord(ch) >= 32 or ch in ("\n", "\r", "\t"))
    for pattern in _INJECTION_PATTERNS:
        cleaned = re.sub(pattern, "[SANITIZED_PROMPT_INJECTION_ATTEMPT]", cleaned)
    return cleaned.strip()


def sanitize_output_text(text: str | None) -> str:
    """Prevent generated content from becoming an executable markup payload."""
    if not text:
        return ""
    cleaned = re.sub(r"<script\b[^>]*>[\s\S]*?</script>", "", text, flags=re.IGNORECASE)
    cleaned = re.sub(r"javascript:\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def sanitize_tree(value):
    """Recursively sanitize model-originated string leaves."""
    if isinstance(value, str):
        return sanitize_output_text(value)
    if isinstance(value, list):
        return [sanitize_tree(v) for v in value]
    if isinstance(value, dict):
        return {k: sanitize_tree(v) for k, v in value.items()}
    return value


class TokenBucketRateLimiter:
    """Thread-safe single-node token bucket."""

    def __init__(self, rate_per_minute: int = settings.RATE_LIMIT_REQUESTS_PER_MINUTE) -> None:
        self.capacity = max(1, rate_per_minute)
        self.fill_rate = self.capacity / 60.0
        self._buckets: Dict[str, float] = {}
        self._last_update: Dict[str, float] = {}
        self._lock = threading.Lock()

    def is_allowed(self, client_id: str) -> bool:
        now = time.monotonic()
        with self._lock:
            last_time = self._last_update.get(client_id, now)
            tokens = self._buckets.get(client_id, float(self.capacity))
            elapsed = max(0.0, now - last_time)
            tokens = min(float(self.capacity), tokens + elapsed * self.fill_rate)
            self._last_update[client_id] = now
            if tokens < 1.0:
                self._buckets[client_id] = tokens
                return False
            self._buckets[client_id] = tokens - 1.0
            return True

    def clear(self) -> None:
        with self._lock:
            self._buckets.clear()
            self._last_update.clear()


rate_limiter = TokenBucketRateLimiter()


def verify_api_key(x_api_key: str = Header(..., alias="X-API-Key")) -> str:
    configured = settings.DEFAULT_API_KEY
    if not configured:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Floor 02 authentication is not configured")
    if not hmac.compare_digest(x_api_key, configured):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header",
        )
    return x_api_key


async def enforce_body_limit(request: Request) -> None:
    raw = request.headers.get("content-length")
    if raw:
        try:
            if int(raw) > settings.MAX_REQUEST_BODY_BYTES:
                raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Request body exceeds Floor 02 limit")
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid Content-Length")
