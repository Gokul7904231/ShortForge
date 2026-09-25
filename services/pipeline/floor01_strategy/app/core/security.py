"""API Security, Authentication, Input Sanitization, and Abuse Protection for Floor 01."""

from __future__ import annotations

import re
import secrets
import time
from typing import Dict, Tuple

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyHeader

from floors.floor01_strategy.app.core.config import get_settings

API_KEY_NAME = "X-API-Key"
api_key_header = APIKeyHeader(name=API_KEY_NAME, auto_error=False)


def sanitize_input_text(text: str) -> str:
    """Sanitize untrusted input text by stripping control chars, HTML tags, and injection markers."""
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]*>", "", text)
    cleaned = re.sub(r"(?i)ignore\s+all\s+previous\s+instructions", "", cleaned)
    cleaned = re.sub(r"(?i)system\s+prompt\s+override", "", cleaned)
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
        elapsed = now - last_update
        capacity = min(self.rate, capacity + elapsed * (self.rate / 60.0))

        if capacity >= 1.0:
            self.tokens[client_ip] = (capacity - 1.0, now)
            return True

        self.tokens[client_ip] = (capacity, now)
        return False


global_rate_limiter = RateLimiter(requests_per_minute=100)


async def verify_api_key(api_key: str = Depends(api_key_header)) -> str:
    """Validate the service API key, failing closed outside explicitly anonymous development."""
    settings = get_settings()
    required_key = settings.service_api_key

    if not required_key:
        if settings.environment.lower() == "production" or not settings.allow_anonymous_dev:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Floor 01 service authentication is not configured",
            )
        return "anonymous_dev"

    supplied_key = api_key or ""
    if not secrets.compare_digest(supplied_key, required_key):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing X-API-Key header",
        )
    return supplied_key


async def enforce_rate_limit(request: Request) -> None:
    """Enforce rate limits per client IP."""
    client_ip = request.client.host if request.client else "127.0.0.1"
    if not global_rate_limiter.check(client_ip):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Please slow down requests.",
        )
