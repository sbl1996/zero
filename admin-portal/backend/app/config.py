from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="ADMIN_PORTAL_",
        extra="ignore",
        env_file=".env",
        env_file_encoding="utf-8"
    )

    database_url: str = Field(default="sqlite:///./var/admin_portal.db", description="SQLAlchemy database URL.")
    raw_assets_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[3] / "src" / "assets" / "raw",
        description="Directory containing the raw asset files that should be exposed under /files/raw.",
    )
    backup_assets_dir: Path = Field(
        default_factory=lambda: Path(__file__).resolve().parents[3] / "src" / "assets" / "raw" / "backup",
        description="Directory containing backup versions of overwritten asset files.",
    )
    api_key: str = Field(default="change-me", description="Simple API key used for admin authentication.")
    read_only: bool = Field(default=False, description="Toggle to prevent write operations (useful for demos/tests).")
    pagination_default_limit: int = Field(default=20, ge=1, le=200)
    pagination_max_limit: int = Field(default=100, ge=1, le=500)
    catalog_scan_cache_seconds: int = Field(default=300, ge=0)
    enable_backup: bool = Field(default=True, description="Enable automatic backup of overwritten files.")
    max_backup_versions: int = Field(default=10, ge=1, le=50, description="Maximum number of backup versions to keep per file.")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
