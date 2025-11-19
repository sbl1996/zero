from __future__ import annotations

import json
from pathlib import Path
from typing import Dict, List

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, Response

from ..config import Settings, get_settings
from ..models import MapList, MapMetadata, MapMetadataFile

router = APIRouter(prefix="/api/maps", tags=["maps"])


class MapRepository:
    """Handles persistence of map metadata."""

    def __init__(self, data_file: Path):
        self.data_file = data_file
        self.data_file.parent.mkdir(parents=True, exist_ok=True)

    def _load_raw(self) -> MapMetadataFile:
        if not self.data_file.exists():
            return MapMetadataFile(defaultMapId="florence", maps=[])
        with self.data_file.open("r", encoding="utf-8") as fp:
            data = json.load(fp)
            return MapMetadataFile(**data)

    def _save_raw(self, metadata: MapMetadataFile) -> None:
        with self.data_file.open("w", encoding="utf-8") as fp:
            json.dump(
                metadata.model_dump(exclude_none=False),
                fp,
                ensure_ascii=False,
                indent=2,
            )
            fp.write("\n")

    def list(self) -> MapList:
        metadata = self._load_raw()
        return metadata.maps

    def get(self, map_id: str) -> MapMetadata:
        metadata = self._load_raw()
        for map_data in metadata.maps:
            if map_data.id == map_id:
                return map_data
        raise KeyError(map_id)

    def upsert(self, map_data: MapMetadata) -> MapMetadata:
        metadata = self._load_raw()
        existing_index = None
        for idx, existing_map in enumerate(metadata.maps):
            if existing_map.id == map_data.id:
                existing_index = idx
                break

        if existing_index is not None:
            metadata.maps[existing_index] = map_data
        else:
            metadata.maps.append(map_data)

        self._save_raw(metadata)
        return map_data

    def delete(self, map_id: str) -> None:
        metadata = self._load_raw()
        if not any(map_data.id == map_id for map_data in metadata.maps):
            raise KeyError(map_id)
        metadata.maps = [m for m in metadata.maps if m.id != map_id]
        self._save_raw(metadata)


def get_repository(settings: Settings = Depends(get_settings)) -> MapRepository:
    return MapRepository(settings.map_metadata_file)


@router.get("", response_model=MapList)
def list_maps(repository: MapRepository = Depends(get_repository)) -> MapList:
    return repository.list()


@router.get("/{map_id}", response_model=MapMetadata)
def get_map(map_id: str, repository: MapRepository = Depends(get_repository)) -> MapMetadata:
    try:
        return repository.get(map_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Map {map_id} not found"
        )


@router.post("", response_model=MapMetadata, status_code=status.HTTP_201_CREATED)
def upsert_map(
    map_data: MapMetadata, repository: MapRepository = Depends(get_repository)
) -> MapMetadata:
    return repository.upsert(map_data)


@router.put("/{map_id}", response_model=MapMetadata)
def update_map(
    map_id: str,
    map_data: MapMetadata,
    repository: MapRepository = Depends(get_repository),
) -> MapMetadata:
    if map_id != map_data.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Map ID in path and body must match",
        )
    return repository.upsert(map_data)


@router.delete("/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_map(map_id: str, repository: MapRepository = Depends(get_repository)) -> Response:
    try:
        repository.delete(map_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Map {map_id} not found"
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{map_id}/image")
def get_map_image(map_id: str, settings: Settings = Depends(get_settings)) -> FileResponse:
    """Get map background image."""
    repository = MapRepository(settings.map_metadata_file)
    try:
        map_data = repository.get(map_id)
    except KeyError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=f"Map {map_id} not found"
        )

    image_path = settings.map_images_dir / map_data.image
    if not image_path.exists():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Image {map_data.image} not found",
        )

    return FileResponse(image_path, media_type="image/webp")
