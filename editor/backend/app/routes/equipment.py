from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from ..config import Settings, get_settings
from ..models import EquipmentItem, EquipmentList, ConversionResult
from ..repository import EquipmentRepository

router = APIRouter(prefix="/api/equipment", tags=["equipment"])


def get_repository(settings: Settings = Depends(get_settings)) -> EquipmentRepository:
    return EquipmentRepository(settings.equipment_items_file)


@router.get("", response_model=EquipmentList)
def list_equipment(
    repository: EquipmentRepository = Depends(get_repository),
    slot: Optional[str] = None,
    quality: Optional[str] = None,
    tier_min: Optional[int] = None,
    tier_max: Optional[int] = None,
    search: Optional[str] = None,
) -> EquipmentList:
    """List all equipment with optional filters."""
    items = repository.list()
    
    # Apply filters
    if slot:
        items = [item for item in items if item.slot == slot]
    if quality:
        items = [item for item in items if item.base_quality == quality]
    if tier_min is not None:
        items = [item for item in items if item.required_tier and item.required_tier >= tier_min]
    if tier_max is not None:
        items = [item for item in items if item.required_tier and item.required_tier <= tier_max]
    if search:
        search_lower = search.lower()
        items = [
            item for item in items
            if search_lower in item.id.lower() or search_lower in item.name.lower()
        ]
    
    return items


@router.get("/{equipment_id}", response_model=EquipmentItem)
def get_equipment(
    equipment_id: str, repository: EquipmentRepository = Depends(get_repository)
) -> EquipmentItem:
    """Get a single equipment item by ID."""
    try:
        return repository.get(equipment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {equipment_id} not found"
        )


@router.post("", response_model=EquipmentItem, status_code=status.HTTP_201_CREATED)
def upsert_equipment(
    equipment: EquipmentItem, repository: EquipmentRepository = Depends(get_repository)
) -> EquipmentItem:
    """Create or update an equipment item."""
    return repository.upsert(equipment)


@router.put("/{equipment_id}", response_model=EquipmentItem)
def update_equipment(
    equipment_id: str,
    equipment: EquipmentItem,
    repository: EquipmentRepository = Depends(get_repository)
) -> EquipmentItem:
    """Update an equipment item."""
    if equipment.id != equipment_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Equipment ID in path and body must match"
        )
    return repository.upsert(equipment)


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(
    equipment_id: str, repository: EquipmentRepository = Depends(get_repository)
) -> Response:
    """Delete an equipment item."""
    try:
        repository.delete(equipment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {equipment_id} not found"
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{equipment_id}/image")
def get_equipment_image(
    equipment_id: str,
    settings: Settings = Depends(get_settings),
    repository: EquipmentRepository = Depends(get_repository)
) -> FileResponse:
    """Get equipment image."""
    try:
        equipment = repository.get(equipment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {equipment_id} not found"
        )
    
    # Try to find image with eq- prefix
    webp_filename = f"eq-{equipment_id}.webp"
    image_path = settings.assets_dir / webp_filename
    
    # Fall back to artwork field if exists
    if not image_path.exists() and equipment.artwork:
        image_path = settings.assets_dir / equipment.artwork
    
    if not image_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image file not found for equipment {equipment_id}"
        )
    
    return FileResponse(image_path)


@router.post("/{equipment_id}/image/png")
async def upload_equipment_png(
    equipment_id: str,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    repository: EquipmentRepository = Depends(get_repository)
) -> dict:
    """Upload equipment image (PNG format)."""
    # Validate file extension
    if not file.filename or not file.filename.lower().endswith('.png'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PNG format is supported"
        )
    
    # Ensure equipment exists
    try:
        equipment = repository.get(equipment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {equipment_id} not found"
        )
    
    # Create raw directory if it doesn't exist (save directly to raw assets root)
    raw_dir = settings.raw_assets_dir
    raw_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the file with eq- prefix
    filename = f"eq-{equipment_id}.png"
    file_path = raw_dir / filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Auto-populate artwork field with corresponding webp filename
    webp_filename = f"eq-{equipment_id}.webp"
    if equipment.artwork != webp_filename:
        equipment.artwork = webp_filename
        repository.upsert(equipment)
    
    return {"path": filename, "filename": filename}


@router.post("/{equipment_id}/image")
async def upload_equipment_image(
    equipment_id: str,
    file: UploadFile = File(...),
    settings: Settings = Depends(get_settings),
    repository: EquipmentRepository = Depends(get_repository)
) -> dict:
    """Upload equipment image (WebP only)."""
    # Validate file extension
    if not file.filename or not file.filename.lower().endswith('.webp'):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only WebP format is supported"
        )
    
    # Ensure equipment exists
    try:
        equipment = repository.get(equipment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {equipment_id} not found"
        )
    
    # Create assets directory if it doesn't exist (save directly to assets root)
    assets_dir = settings.assets_dir
    assets_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the file with eq- prefix
    filename = f"eq-{equipment_id}.webp"
    file_path = assets_dir / filename
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)
    
    # Update equipment artwork field
    if equipment.artwork != filename:
        equipment.artwork = filename
        repository.upsert(equipment)
    
    return {"path": filename, "filename": filename}


@router.delete("/{equipment_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment_image(
    equipment_id: str,
    settings: Settings = Depends(get_settings),
    repository: EquipmentRepository = Depends(get_repository)
) -> Response:
    """Delete equipment image."""
    try:
        equipment = repository.get(equipment_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Equipment {equipment_id} not found"
        )
    
    # Try to delete image with eq- prefix
    webp_filename = f"eq-{equipment_id}.webp"
    image_path = settings.assets_dir / webp_filename
    
    if image_path.exists():
        os.remove(image_path)
    elif equipment.artwork:
        # Fall back to artwork field
        alt_path = settings.assets_dir / equipment.artwork
        if alt_path.exists():
            os.remove(alt_path)
    
    # Clear the artwork field
    equipment.artwork = None
    repository.upsert(equipment)
    
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/convert", response_model=ConversionResult)
def convert_equipment_images(settings: Settings = Depends(get_settings)) -> ConversionResult:
    """Convert PNG equipment images to WebP format using the conversion script."""
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
