from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_api_key
from ..config import settings
from ..database import get_db
from ..services.storage import save_revision
from ..catalog import get_monster_enriched_metadata

router = APIRouter(prefix="/api/assets", tags=["assets"])

ALLOWED_TYPES = {"monster", "map", "skill", "misc"}

def _generate_monster_tags(asset_id: str, user_tags: list[str] | None) -> list[str]:
    """Generate monster tags from enriched metadata and merge with user tags."""
    enriched = get_monster_enriched_metadata(asset_id)
    tags = user_tags.copy() if user_tags else []

    if enriched:
        # Add realm tier tag
        realm_tier = enriched.get("realmTier")
        if realm_tier is not None:
            realm_map = {
                1: "一级", 2: "二级", 3: "三级", 4: "四级", 5: "五级",
                6: "六级", 7: "七级", 8: "八级", 9: "九级"
            }
            realm_text = realm_map.get(realm_tier, f"境界 {realm_tier}")
            if realm_text not in tags:
                tags.append(realm_text)

        # Add map name tags
        map_names = enriched.get("mapNames", [])
        for map_name in map_names:
            if map_name not in tags:
                tags.append(map_name)

    return sorted(list(set(tags)))  # Remove duplicates and sort


def _parse_tags(raw: str | None) -> list[str] | None:
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list):
            return [str(item) for item in parsed]
    except json.JSONDecodeError:
        pass
    return [part.strip() for part in raw.split(",") if part.strip()]


def _parse_optional_json(raw: str | None) -> dict[str, Any] | None:
    if not raw:
        return None
    raw = raw.strip()
    if not raw:
        return None
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON payload: {exc}") from exc
    return None


def _serialize_revision(request: Request, revision: models.AssetRevision) -> schemas.AssetRevisionOut:
    download_url = str(request.url_for("raw_files", path=revision.file_path))
    return schemas.AssetRevisionOut(
        id=revision.id,
        file_name=revision.file_name,
        file_path=revision.file_path,
        content_type=revision.content_type,
        file_size=revision.file_size,
        checksum=revision.checksum,
        notes=revision.notes,
        created_at=revision.created_at,
        uploaded_by=revision.uploaded_by,
          download_url=download_url,
    )


def _serialize_asset(
    request: Request,
    asset: models.Asset,
    include_revisions: bool = False,
) -> schemas.AssetOut:
    revisions = asset.revisions if include_revisions else (asset.revisions[:1] if asset.revisions else [])
    revisions_out = [_serialize_revision(request, revision) for revision in revisions]
    latest_revision = revisions_out[0] if revisions_out else None
    return schemas.AssetOut(
        id=asset.asset_key,
        asset_type=asset.asset_type,
        title=asset.title,
        description=asset.description,
        tags=asset.tags or [],
          created_at=asset.created_at,
        updated_at=asset.updated_at,
        latest_revision=latest_revision,
        revisions=revisions_out if include_revisions else [],
    )


@router.get("", response_model=schemas.AssetListResponse)
def list_assets(
    request: Request,
    asset_type: str | None = Query(default=None),
    q: str | None = Query(default=None, description="Search keyword matched against id/title/description."),
    tags: str | None = Query(default=None, description="Comma separated list of tags to filter by."),
    sort: str | None = Query(default="updated_desc", description="Sorting option: 'updated_desc' for latest updated first; 'id' for by ID; others default by asset_key."),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=None, ge=1),
    db: Session = Depends(get_db),
):
    page_size = page_size or settings.pagination_default_limit
    page_size = min(page_size, settings.pagination_max_limit)

    query = db.query(models.Asset)
    if asset_type:
        query = query.filter(models.Asset.asset_type == asset_type)
    if q:
        pattern = f"%{q}%"
        query = query.filter(
            or_(
                models.Asset.asset_key.ilike(pattern),
                models.Asset.title.ilike(pattern),
                models.Asset.description.ilike(pattern),
            )
        )
    if tags:
        tag_list = [tag.strip() for tag in tags.split(",") if tag.strip()]
        if tag_list:
            # Filter assets that have ALL the specified tags
            for tag in tag_list:
                # Use SQLite's json_extract with Unicode encoding handling
                # Check both the actual Unicode text and its encoded representation
                encoded_tag = tag.encode('unicode-escape').decode('ascii')
                query = query.filter(
                    (func.json_extract(models.Asset.tags, f'$').like(f'%"{tag}"%')) |
                    (func.json_extract(models.Asset.tags, f'$').like(f'%"{encoded_tag}"%'))
                )
    total = query.count()
    pages = max((total + page_size - 1) // page_size, 1)
    if page > pages and total > 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Page number exceeds result set.")
    # Order: handle different sorting options
    if sort == 'updated_desc':
        order_by_clause = models.Asset.updated_at.desc()
    elif sort == 'id':
        order_by_clause = models.Asset.id
    else:
        order_by_clause = func.lower(models.Asset.asset_key)  # default sorting
    items = (
        query.order_by(order_by_clause)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    serialized = [_serialize_asset(request, asset, include_revisions=False) for asset in items]
    return schemas.AssetListResponse(
        items=serialized,
        pagination=schemas.PaginationMeta(total=total, page=page, page_size=page_size, pages=pages),
    )


@router.get("/{asset_id}", response_model=schemas.AssetOut)
def get_asset(asset_id: str, request: Request, db: Session = Depends(get_db)):
    asset = db.query(models.Asset).filter(models.Asset.asset_key == asset_id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")
    return _serialize_asset(request, asset, include_revisions=True)


@router.post("", response_model=schemas.AssetOut, status_code=status.HTTP_201_CREATED)
async def create_asset(
    request: Request,
    id: str = Form(..., description="Asset identifier, e.g. m-slime or map-florence."),
    asset_type: str = Form(..., description="Asset category such as monster/map/skill."),
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None, description="Comma separated or JSON array of tags."),
    notes: str | None = Form(default=None),
    uploaded_by: str | None = Form(default=None),
      file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: str = Depends(get_api_key),
):
    if settings.read_only:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Backend is running in read-only mode.")
    asset_key = id.strip()
    if asset_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported asset_type '{asset_type}'.")
    existing = db.query(models.Asset).filter(models.Asset.asset_key == asset_key).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Asset already exists.")

    # Validate filename matches asset ID (excluding extension)
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file must have a filename.")

    from pathlib import Path
    file_path = Path(file.filename)
    filename_without_ext = file_path.stem

    # Handle files with no extension
    if filename_without_ext != asset_key:
        if file_path.suffix:
            expected_filename = f"{asset_key}{file_path.suffix}"
        else:
            expected_filename = asset_key

        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Filename (without extension) must match asset ID. Expected: '{expected_filename}', got: '{file.filename}'"
        )

    stored_file = await save_revision(asset_key, file)

    # Parse user tags first
    user_tags = _parse_tags(tags) or []

    # Generate auto tags for monsters
    if asset_type == "monster":
        final_tags = _generate_monster_tags(asset_key, user_tags)
    else:
        final_tags = user_tags

    asset = models.Asset(
        asset_key=asset_key,
        asset_type=asset_type,
        title=title,
        description=description,
        tags=final_tags,
    )
    revision = models.AssetRevision(
        file_name=stored_file.file_name,
        file_path=stored_file.relative_path,
        content_type=stored_file.content_type,
        file_size=stored_file.file_size,
        checksum=stored_file.checksum,
        notes=notes,
        uploaded_by=uploaded_by,
    )
    asset.revisions.append(revision)
    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _serialize_asset(request, asset, include_revisions=True)


@router.patch("/{asset_id}", response_model=schemas.AssetOut)
async def update_asset(
    asset_id: str,
    request: Request,
    title: str | None = Form(default=None),
    description: str | None = Form(default=None),
    tags: str | None = Form(default=None),
    notes: str | None = Form(default=None),
    uploaded_by: str | None = Form(default=None),
        file: UploadFile | None = File(default=None),
    db: Session = Depends(get_db),
    _: str = Depends(get_api_key),
):
    if settings.read_only:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Backend is running in read-only mode.")
    asset = db.query(models.Asset).filter(models.Asset.asset_key == asset_id).first()
    if not asset:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Asset not found.")

    if title is not None:
        asset.title = title
    if description is not None:
        asset.description = description
    if tags is not None:
        # Parse user tags and generate auto tags for monsters
        user_tags = _parse_tags(tags) or []
        if asset.asset_type == "monster":
            asset.tags = _generate_monster_tags(asset.asset_key, user_tags)
        else:
            asset.tags = user_tags

    if file:
        stored_file = await save_revision(asset.asset_key, file, existing_files=[rev.file_path for rev in asset.revisions])
        revision = models.AssetRevision(
            file_name=stored_file.file_name,
            file_path=stored_file.relative_path,
            content_type=stored_file.content_type,
            file_size=stored_file.file_size,
            checksum=stored_file.checksum,
            notes=notes,
            uploaded_by=uploaded_by,
        )
        asset.revisions.insert(0, revision)
    elif notes is not None or uploaded_by is not None:
        latest = asset.revisions[0] if asset.revisions else None
        if latest:
            if notes is not None:
                latest.notes = notes
            if uploaded_by is not None:
                latest.uploaded_by = uploaded_by

    db.add(asset)
    db.commit()
    db.refresh(asset)
    return _serialize_asset(request, asset, include_revisions=True)


