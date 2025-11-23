from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


def _default_repo_root() -> Path:
    """Infer the repository root based on this file's location."""
    return Path(__file__).resolve().parents[3]


def _path_from_env(variable: str, default: Path) -> Path:
    value = os.getenv(variable)
    if value:
        return Path(value).expanduser().resolve()
    return default


class Settings(BaseModel):
    """Runtime configuration for the monster editor backend."""

    model_config = ConfigDict(arbitrary_types_allowed=True)

    repo_root: Path = Field(default_factory=_default_repo_root)
    data_file: Path = Field(
        default_factory=lambda: _path_from_env(
            "MONSTER_BLUEPRINTS_FILE",
            _default_repo_root() / "src/data/monster-blueprints.json",
        )
    )
    map_metadata_file: Path = Field(
        default_factory=lambda: _path_from_env(
            "MAP_METADATA_FILE",
            _default_repo_root() / "src/data/map-metadata.json",
        )
    )
    equipment_items_file: Path = Field(
        default_factory=lambda: _path_from_env(
            "EQUIPMENT_ITEMS_FILE",
            _default_repo_root() / "src/data/equipment_items.json",
        )
    )
    raw_assets_dir: Path = Field(
        default_factory=lambda: _path_from_env(
            "MONSTER_RAW_ASSETS_DIR", _default_repo_root() / "src/assets/raw"
        )
    )
    webp_assets_dir: Path = Field(
        default_factory=lambda: _path_from_env(
            "MONSTER_WEBP_ASSETS_DIR", _default_repo_root() / "src/assets"
        )
    )
    map_images_dir: Path = Field(
        default_factory=lambda: _path_from_env(
            "MAP_IMAGES_DIR", _default_repo_root() / "src/assets"
        )
    )
    assets_dir: Path = Field(
        default_factory=lambda: _path_from_env(
            "ASSETS_DIR", _default_repo_root() / "src/assets"
        )
    )
    conversion_script: Path = Field(
        default_factory=lambda: _path_from_env(
            "MONSTER_CONVERSION_SCRIPT",
            _default_repo_root() / "scripts/portrait_to_webp.py",
        )
    )


_settings: Optional[Settings] = None


def get_settings() -> Settings:
    """Expose cached settings so tests can override when needed."""
    global _settings
    if _settings is None:
        _settings = Settings()
    return _settings


def override_settings(settings: Optional[Settings]) -> None:
    """Used by tests to provide custom Settings instances."""
    global _settings
    _settings = settings
