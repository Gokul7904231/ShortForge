"""Fail-closed service authentication for the Floor 04 internal runtime API."""

from __future__ import annotations

import hmac
import os
from typing import Optional

from fastapi import Header, HTTPException


def verify_api_key(x_api_key: Optional[str] = Header(default=None)) -> str:
    """Authenticate the internal caller; never accept a development default key."""
    expected = os.environ.get("FLOOR04_SERVICE_API_KEY") or os.environ.get("FLOOR04_API_KEY")
    if not expected:
        raise HTTPException(status_code=503, detail="Floor 04 service authentication is not configured.")
    if not x_api_key or not hmac.compare_digest(x_api_key, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing X-API-Key authentication header.")
    return x_api_key
