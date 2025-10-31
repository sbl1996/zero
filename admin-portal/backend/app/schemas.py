from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, HttpUrl


class PaginationMeta(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int


class MonsterExtra(BaseModel):
    realmTier: int | None = None
    mapIds: list[str] = []
    mapNames: list[str] = []


class AssetRevisionOut(BaseModel):
    id: int
    file_name: str
    file_path: str
    content_type: str | None = None
    file_size: int
    checksum: str | None = None
    notes: str | None = None
    created_at: datetime
    uploaded_by: str | None = None
    extra_metadata: dict[str, Any] | None = None
    download_url: HttpUrl


class AssetOut(BaseModel):
    asset_key: str = Field(alias="id")
    asset_type: str
    title: str | None = None
    description: str | None = None
    tags: list[str] = []
    extra_metadata: dict[str, Any] | MonsterExtra | None = None
    created_at: datetime
    updated_at: datetime
    latest_revision: AssetRevisionOut | None = None
    revisions: list[AssetRevisionOut] = []

    model_config = {"populate_by_name": True}


class AssetListResponse(BaseModel):
    items: list[AssetOut]
    pagination: PaginationMeta


class AssetCreate(BaseModel):
    id: str = Field(pattern=r"^[a-z0-9_\-]+$")
    asset_type: Literal["monster", "map", "skill", "misc"] = "monster"
    title: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    uploaded_by: str | None = None
    extra_metadata: dict[str, Any] | None = None


class AssetUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    notes: str | None = None
    uploaded_by: str | None = None
    extra_metadata: dict[str, Any] | None = None


class CatalogItem(BaseModel):
    id: str
    label: str


class CatalogResponse(BaseModel):
    type: str
    items: list[CatalogItem]


class BackupFileInfo(BaseModel):
    file_name: str
    file_size: int
    created_at: datetime
    backup_timestamp: str


class BackupListResponse(BaseModel):
    asset_key: str
    extension: str
    backups: list[BackupFileInfo]


class BackupRestoreResponse(BaseModel):
    success: bool
    message: str
