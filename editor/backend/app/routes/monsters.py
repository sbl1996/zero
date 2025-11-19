from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Literal, Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from ..config import Settings, get_settings
from ..models import AssetStatus, ConversionResult, MonsterBlueprint, MonsterList
from ..repository import MonsterRepository

router = APIRouter(prefix="/api/monsters", tags=["monsters"])


def get_repository(settings: Settings = Depends(get_settings)) -> MonsterRepository:
    return MonsterRepository(settings.data_file)


def _asset_status(monster_id: str, settings: Settings) -> AssetStatus:
    return AssetStatus(
        png=_find_asset_path(settings.raw_assets_dir, monster_id, "png") is not None,
        webp=_find_asset_path(settings.webp_assets_dir, monster_id, "webp") is not None,
        mp4=_find_asset_path(settings.raw_assets_dir, monster_id, "mp4") is not None,
    )


def _find_asset_path(directory: Path, monster_id: str, extension: str) -> Optional[Path]:
    """Locate the primary asset file (with optional suffix) for the provided monster."""
    if not directory.exists():
        return None
    base_path = directory / f"{monster_id}.{extension}"
    if base_path.exists():
        return base_path
    candidates = sorted(directory.glob(f"{monster_id}-*.{extension}"))
    return candidates[0] if candidates else None


@router.get("", response_model=MonsterList)
def list_monsters(repository: MonsterRepository = Depends(get_repository)) -> MonsterList:
    return repository.list()


@router.post("", response_model=MonsterBlueprint, status_code=status.HTTP_201_CREATED)
def upsert_monster(
    monster: MonsterBlueprint, repository: MonsterRepository = Depends(get_repository)
) -> MonsterBlueprint:
    return repository.upsert(monster)


@router.delete(
    "/{monster_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_monster(
    monster_id: str, repository: MonsterRepository = Depends(get_repository)
) -> Response:
    try:
        repository.delete(monster_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Monster {monster_id} not found"
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{monster_id}/assets", response_model=AssetStatus)
def get_monster_assets(
    monster_id: str, settings: Settings = Depends(get_settings)
) -> AssetStatus:
    return _asset_status(monster_id, settings)


@router.get("/assets/statuses", response_model=Dict[str, AssetStatus])
def list_all_asset_statuses(
    repository: MonsterRepository = Depends(get_repository),
    settings: Settings = Depends(get_settings),
) -> Dict[str, AssetStatus]:
    return {
        monster.id: _asset_status(monster.id, settings)
        for monster in repository.list()
    }


@router.get("/{monster_id}/assets/{asset_type}")
def download_monster_asset(
    monster_id: str,
    asset_type: Literal["png", "webp", "mp4"],
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    if asset_type == "png":
        asset_path = _find_asset_path(settings.raw_assets_dir, monster_id, "png")
        media_type = "image/png"
    elif asset_type == "mp4":
        asset_path = _find_asset_path(settings.raw_assets_dir, monster_id, "mp4")
        media_type = "video/mp4"
    else:
        asset_path = _find_asset_path(settings.webp_assets_dir, monster_id, "webp")
        media_type = "image/webp"

    if not asset_path or not asset_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"{asset_type.upper()} asset for {monster_id} not found",
        )

    return FileResponse(asset_path, media_type=media_type)


@router.post("/{monster_id}/assets/png", response_model=AssetStatus)
async def upload_monster_png(
    monster_id: str,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> AssetStatus:
    if not file.filename or not file.filename.lower().endswith(".png"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a .png image",
        )
    target_path = settings.raw_assets_dir / f"{monster_id}.png"
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)
    return _asset_status(monster_id, settings)


@router.post("/{monster_id}/assets/mp4", response_model=AssetStatus)
async def upload_monster_mp4(
    monster_id: str,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
) -> AssetStatus:
    if not file.filename or not file.filename.lower().endswith(".mp4"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file must be a .mp4 video",
        )
    target_path = settings.raw_assets_dir / f"{monster_id}.mp4"
    target_path.parent.mkdir(parents=True, exist_ok=True)
    with target_path.open("wb") as destination:
        shutil.copyfileobj(file.file, destination)
    return _asset_status(monster_id, settings)


@router.post("/assets/convert", response_model=ConversionResult)
def convert_missing_assets(settings: Settings = Depends(get_settings)) -> ConversionResult:
    if not settings.conversion_script.exists():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Conversion script not found at {settings.conversion_script}",
        )
    command = [
        "~/.uv-venvs/base/bin/python",
        "-u",
        str(settings.conversion_script),
    ]
    # expand home directory
    command[0] = os.path.expanduser(command[0])
    completed = subprocess.run(
        command,
        cwd=settings.repo_root,
        capture_output=True,
        text=True,
        check=False,
    )
    succeeded = completed.returncode == 0
    if not succeeded:
        # print error
        print(completed.stderr.strip())
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=completed.stderr.strip() or "Conversion script failed",
        )
    return ConversionResult(succeeded=True, stdout=completed.stdout, stderr=completed.stderr)
