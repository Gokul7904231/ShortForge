"""Configuration settings for Floor 01 v2."""

from __future__ import annotations

from functools import lru_cache
from typing import Any, List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Floor01Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="FLOOR01_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    floor_id: str = Field(default="floor01_strategy")
    floor_name: str = Field(default="Strategy & Intelligence")
    floor_version: str = Field(default="2.0.0")

    # Runtime safety: production/staging should explicitly authenticate service calls.
    environment: str = Field(default="development")
    allow_anonymous_dev: bool = Field(default=False)

    similarity_warning_threshold: float = Field(default=0.45, ge=0.0, le=1.0)
    similarity_rejection_threshold: float = Field(default=0.75, ge=0.0, le=1.0)
    min_confidence_threshold: float = Field(default=0.70, ge=0.0, le=1.0)

    supported_platforms: List[str] = Field(default_factory=lambda: [
        "youtube_shorts", "tiktok", "instagram_reels", "linkedin_video", "twitter_video"
    ])
    supported_formats: List[str] = Field(default_factory=lambda: [
        "educational_short", "quiz_short", "story_short", "news_breakdown"
    ])
    supported_difficulties: List[str] = Field(default_factory=lambda: ["beginner", "intermediate", "advanced"])

    min_duration_seconds: int = Field(default=15, ge=5)
    max_duration_seconds: int = Field(default=180, le=600)
    default_duration_seconds: int = Field(default=60)
    memory_file_path: str = Field(default="data/memory.json")

    # Evidence-gated by default. Compatibility callers can explicitly choose
    # a less strict policy at the runtime boundary.
    require_verified_research: bool = Field(default=True)
    minimum_research_sources: int = Field(default=1, ge=0)
    minimum_verified_claims: int = Field(default=1, ge=0)

    default_complexity_mode: str = Field(default="FAST")
    max_strategy_candidates: int = Field(default=3, ge=1, le=6)
    max_refinement_cycles: int = Field(default=1, ge=0, le=2)

    service_api_key: str | None = Field(default=None, repr=False)
    cors_origins: List[str] = Field(default_factory=list)
    llm_api_key: str | None = Field(default=None, repr=False)
    llm_base_url: str | None = Field(default=None)
    llm_model: str = Field(default="gpt-4o-mini")
    llm_timeout_seconds: float = Field(default=20.0, ge=1.0, le=120.0)

    log_level: str = Field(default="INFO")

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: Any) -> Any:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value


@lru_cache(maxsize=1)
def get_settings() -> Floor01Settings:
    return Floor01Settings()
