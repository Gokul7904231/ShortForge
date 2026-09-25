"""API Security, Authentication, Input Sanitization, and Abuse Protection for Floor 01."""

from __future__ import annotations

import re
import time
from typing import Dict, Tuple

from fastapi import Depends, HTTPException, Header, Request, status
from fastapi.security import APIKeyHeader

from floors.floor01_strategy.app.core.config import get_settings

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


def sanitize_input_text(text: str) -> str:
    """Sanitize untrusted input text by stripping control chars, HTML tags, and injection markers."""
    if not text:
        return ""
    # Strip HTML tags
    cleaned = re.sub(r"<[^>]*>", "", text)
    # Strip prompt injection overrides
    cleaned = re.sub(r"(?i)ignore\s+all\s+previous\s+instructions", "", cleaned)
    cleaned = re.sub(r"(?i)system\s+prompt\s+override", "", cleaned)
    # Strip non-printable control characters
    cleaned = re.sub(r"[\x00-\x1f\x7f-\x9f]", "", cleaned)
    return cleaned.strip()


class RateLimiter:
    """In-memory token bucket rate limiter for API protection."""

    def __init__(self, requests_per_minute: int = 60) -> None:
        self.rate = requests_per_minute
        self.tokens: Dict[str, Tuple[float, float]] = {}

    def check(self, client_ip: str) -> bool:
        now = time.time()
        capacity, last_update = self.tokens.get(client_ip, (self.rate, now))

        # Replenish tokens based on elapsed time
        elapsed = now - last_update
        capacity = min(self.rate, capacity + elapsed * (self.rate / 60.0))

        if capacity >= 1.0:
            self.tokens[client_ip] = (capacity - 1.0, now)
            return True

        self.tokens[client_ip] = (capacity, now)
        return False


global_rate_limiter = RateLimiter(requests_per_minute=100)


async def verify_api_key(api_key: str = Depends(api_key_header)) -> str:
    """Validate API key header if required by settings."""
    settings = get_settings()
    # If dev mode or no required API key configured in env, allow access
    required_key = settings.service_api_key
    if not required_key:
        return "anonymous_dev"

    if api_key != required_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header",
        )
    return api_key


async def enforce_rate_limit(request: Request) -> None:
    """Enforce rate limits per client IP."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not global_rate_limiter.check(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please slow down requests.",
        )
