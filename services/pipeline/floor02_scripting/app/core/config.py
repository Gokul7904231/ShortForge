"""Core configuration and settings for Floor 02 (Scripting & Narrative)."""

import os
from pydantic import BaseModel, Field


class Settings(BaseModel):
    FLOOR_ID: str = "floor02_scripting"
    LEGACY_FLOOR_ID: str = "floor02"
    FLOOR_NAME: str = "Cognitive Scripting & Structure"
    FLOOR_VERSION: str = "2.0.0"

    ENVIRONMENT: str = os.getenv("FLOOR02_ENV", "development").lower()

    DEFAULT_LLM_PROVIDER: str = os.getenv("FLOOR02_LLM_PROVIDER", os.getenv("DEFAULT_LLM_PROVIDER", "openai_compatible"))
    DEFAULT_LLM_MODEL: str = os.getenv("FLOOR02_LLM_MODEL", os.getenv("DEFAULT_LLM_MODEL", "gpt-4.1-mini"))
    DEFAULT_LLM_BASE_URL: str = os.getenv("FLOOR02_LLM_BASE_URL", "")
    DEFAULT_API_KEY: str = os.getenv("FLOOR02_API_KEY", "dev-secret-key-floor02")

    # Deterministic fallback is permitted for tests/simulation, never silently in production.
    ALLOW_DETERMINISTIC_FALLBACK: bool = os.getenv("FLOOR02_ALLOW_DETERMINISTIC_FALLBACK", "true").lower() == "true"
    REQUIRE_REAL_MODEL_IN_PRODUCTION: bool = os.getenv("FLOOR02_REQUIRE_REAL_MODEL", "true").lower() == "true"
    MAX_LLM_REVISIONS: int = Field(default=int(os.getenv("FLOOR02_MAX_REVISIONS", "2")), ge=0, le=3)
    MAX_CANDIDATES: int = Field(default=int(os.getenv("FLOOR02_MAX_CANDIDATES", "3")), ge=1, le=5)

    # Narrative pacing: 130–160 words per 60 seconds, normalized to requested duration.
    MIN_WORDS_PER_MINUTE: int = 130
    MAX_WORDS_PER_MINUTE: int = 160
    HOOK_MAX_SECONDS: int = 8

    # HTTP safety limits.
    MAX_REQUEST_BODY_BYTES: int = 256 * 1024
    MAX_RESPONSE_BYTES: int = 512 * 1024
    REQUEST_TIMEOUT_SECONDS: float = 30.0

    # Rate Limiter settings
    RATE_LIMIT_REQUESTS_PER_MINUTE: int = int(os.getenv("FLOOR02_RATE_LIMIT_RPM", "100"))

    # Memory storage
    MEMORY_STORAGE_PATH: str = os.getenv(
        "FLOOR02_MEMORY_PATH",
        "floors/floor02_scripting/storage/script_memory.json",
    )
    MEMORY_MAX_RECORDS: int = int(os.getenv("FLOOR02_MEMORY_MAX_RECORDS", "1000"))
    EXECUTION_REPORT_PATH: str = os.getenv(
        "FLOOR02_EXECUTION_REPORT_PATH",
        "used_artifact/reports",
    )

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"


settings = Settings()
