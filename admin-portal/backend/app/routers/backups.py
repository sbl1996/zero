from __future__ import annotations

from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status

from ..auth import get_api_key
from ..schemas import BackupListResponse, BackupFileInfo, BackupRestoreResponse
from ..services.storage import list_backups, restore_from_backup, delete_backup

router = APIRouter(prefix="/api/backups", tags=["backups"])


@router.get("/{asset_key}.{extension}", response_model=BackupListResponse)
def list_asset_backups(asset_key: str, extension: str, _: str = Depends(get_api_key)):
    """List all backup files for a given asset."""
    # Ensure extension starts with dot
    if not extension.startswith('.'):
        extension = f".{extension}"

    backup_files = list_backups(asset_key, extension)

    backups = []
    for backup_path in backup_files:
        # Extract timestamp from filename (format: basename-timestamp.extension)
        stem = backup_path.stem
        if '-' in stem:
            timestamp = stem.split('-')[-1]
        else:
            continue

        stat = backup_path.stat()
        backup_info = BackupFileInfo(
            file_name=backup_path.name,
            file_size=stat.st_size,
            created_at=datetime.fromtimestamp(stat.st_mtime),
            backup_timestamp=timestamp
        )
        backups.append(backup_info)

    return BackupListResponse(
        asset_key=asset_key,
        extension=extension,
        backups=backups
    )


@router.post("/{asset_key}.{extension}/restore/{backup_timestamp}", response_model=BackupRestoreResponse)
def restore_asset_backup(asset_key: str, extension: str, backup_timestamp: str, _: str = Depends(get_api_key)):
    """Restore a file from backup."""
    from ..config import settings

    if settings.read_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Backend is running in read-only mode."
        )

    # Ensure extension starts with dot
    if not extension.startswith('.'):
        extension = f".{extension}"

    success = restore_from_backup(asset_key, extension, backup_timestamp)

    if success:
        return BackupRestoreResponse(
            success=True,
            message=f"Successfully restored {asset_key}{extension} from backup {backup_timestamp}"
        )
    else:
        return BackupRestoreResponse(
            success=False,
            message=f"Failed to restore {asset_key}{extension} from backup {backup_timestamp}. Backup file not found."
        )


@router.delete("/{asset_key}.{extension}/{backup_timestamp}", response_model=BackupRestoreResponse)
def delete_asset_backup(asset_key: str, extension: str, backup_timestamp: str, _: str = Depends(get_api_key)):
    """Delete a specific backup file."""
    from ..config import settings

    if settings.read_only:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Backend is running in read-only mode."
        )

    # Ensure extension starts with dot
    if not extension.startswith('.'):
        extension = f".{extension}"

    success = delete_backup(asset_key, extension, backup_timestamp)

    if success:
        return BackupRestoreResponse(
            success=True,
            message=f"Successfully deleted backup {backup_timestamp} for {asset_key}{extension}"
        )
    else:
        return BackupRestoreResponse(
            success=False,
            message=f"Failed to delete backup {backup_timestamp} for {asset_key}{extension}. Backup file not found."
        )