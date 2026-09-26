"""Canonical Floor 03 configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    FLOOR_ID: str = "floor03_asset_realization"
    FLOOR_VERSION: str = "2.3.0"
    DEFAULT_API_KEY: str = "factoryos-floor03-dev-key"
    STORAGE_PATH: str = "services/pipeline/floor03_asset_realization/storage/asset_memory.json"
    MAX_MEMORY_RECORDS: int = 1000

    PLATFORM_SPECS: dict = {
        "youtube_shorts": {"aspect_ratio": "9:16", "resolution": "1080x1920"},
        "tiktok": {"aspect_ratio": "9:16", "resolution": "1080x1920"},
        "instagram_reels": {"aspect_ratio": "9:16", "resolution": "1080x1920"},
        "linkedin_video": {"aspect_ratio": "16:9", "resolution": "1920x1080"},
        "twitter_video": {"aspect_ratio": "16:9", "resolution": "1920x1080"},
    }
    DEFAULT_FALLBACK_PLATFORM: str = "youtube_shorts"


settings = Settings()
