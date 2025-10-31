from __future__ import annotations

import hashlib
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException, UploadFile, status

from ..config import settings

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".mp4"}


class StorageError(RuntimeError):
    pass


@dataclass(slots=True)
class StoredFile:
    file_name: str
    relative_path: str
    absolute_path: Path
    file_size: int
    checksum: str
    content_type: str | None


def _safe_asset_key(asset_key: str) -> str:
    return asset_key.replace("/", "-")


def _filename_for_revision(asset_key: str, extension: str, existing: Iterable[str] = ()) -> str:
    base = _safe_asset_key(asset_key)
    candidate = f"{base}{extension}"

    # If the original filename doesn't exist, use it
    if candidate not in existing:
        return candidate

    # If the file exists, we need to backup the old one and use timestamp
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    candidate = f"{base}-{timestamp}{extension}"
    if candidate not in existing:
        return candidate
    # Extremely unlikely, but just in case we collide within a single second.
    counter = 1
    while True:
        candidate = f"{base}-{timestamp}-{counter}{extension}"
        if candidate not in existing:
            return candidate
        counter += 1


def _backup_file_if_exists(file_path: Path, backup_dir: Path) -> bool:
    """Backup an existing file to the backup directory with timestamp.

    Returns True if backup was created, False if file didn't exist.
    """
    if not file_path.exists():
        return False

    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
    backup_name = f"{file_path.stem}-{timestamp}{file_path.suffix}"
    backup_path = backup_dir / backup_name

    # Move the file to backup directory
    import shutil
    shutil.move(str(file_path), str(backup_path))

    # Clean up old backups (keep only max_backup_versions)
    _cleanup_old_backups(file_path.stem, file_path.suffix, backup_dir)

    return True


def _cleanup_old_backups(base_name: str, extension: str, backup_dir: Path) -> None:
    """Clean up old backup files, keeping only the most recent ones."""
    if not backup_dir.exists():
        return

    from ..config import settings

    # Find all backup files for this base name and extension
    backup_pattern = f"{base_name}-*{extension}"
    backup_files = list(backup_dir.glob(backup_pattern))

    # Sort by modification time (newest first)
    backup_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)

    # Remove excess backups
    for old_backup in backup_files[settings.max_backup_versions:]:
        old_backup.unlink()


def _find_existing_file(asset_key: str, extension: str, asset_dir: Path) -> Path | None:
    """Find an existing file with the given asset key and extension."""
    filename = f"{_safe_asset_key(asset_key)}{extension}"
    file_path = asset_dir / filename
    return file_path if file_path.exists() else None


async def save_revision(asset_key: str, upload: UploadFile, existing_files: Iterable[str] = ()) -> StoredFile:
    if not upload.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file must have a filename.")
    extension = Path(upload.filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file extension '{extension}'. Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )
    asset_dir = settings.raw_assets_dir
    asset_dir.mkdir(parents=True, exist_ok=True)

    # Check if there's an existing file with the same name and extension
    existing_file = _find_existing_file(asset_key, extension, asset_dir)

    # Backup the existing file if it exists and backup is enabled
    if existing_file and settings.enable_backup:
        _backup_file_if_exists(existing_file, settings.backup_assets_dir)

    final_name = _filename_for_revision(asset_key, extension, existing_files)
    destination = asset_dir / final_name

    hasher = hashlib.sha256()
    size = 0
    await upload.seek(0)
    with destination.open("wb") as buffer:
        while True:
            chunk = await upload.read(1024 * 1024)
            if not chunk:
                break
            buffer.write(chunk)
            hasher.update(chunk)
            size += len(chunk)
    await upload.close()

    os.utime(destination, None)

    return StoredFile(
        file_name=final_name,
        relative_path=final_name,
        absolute_path=destination,
        file_size=size,
        checksum=hasher.hexdigest(),
        content_type=upload.content_type,
    )


def resolve_public_path(relative_path: str) -> str:
    return f"/files/raw/{relative_path}"


def list_backups(asset_key: str, extension: str) -> list[Path]:
    """List all backup files for a given asset key and extension."""
    from ..config import settings

    backup_dir = settings.backup_assets_dir
    if not backup_dir.exists():
        return []

    base_name = _safe_asset_key(asset_key)
    backup_pattern = f"{base_name}-*{extension}"
    backup_files = list(backup_dir.glob(backup_pattern))

    # Sort by modification time (newest first)
    backup_files.sort(key=lambda f: f.stat().st_mtime, reverse=True)
    return backup_files


def restore_from_backup(asset_key: str, extension: str, backup_timestamp: str) -> bool:
    """Restore a file from backup.

    Args:
        asset_key: The asset key
        extension: The file extension
        backup_timestamp: The timestamp part of the backup filename

    Returns:
        True if restore was successful, False otherwise
    """
    from ..config import settings

    backup_dir = settings.backup_assets_dir
    base_name = _safe_asset_key(asset_key)
    backup_filename = f"{base_name}-{backup_timestamp}{extension}"
    backup_path = backup_dir / backup_filename

    if not backup_path.exists():
        return False

    asset_dir = settings.raw_assets_dir
    asset_dir.mkdir(parents=True, exist_ok=True)
    target_path = asset_dir / f"{base_name}{extension}"

    # Backup current file if it exists
    if target_path.exists() and settings.enable_backup:
        _backup_file_if_exists(target_path, backup_dir)

    # Restore from backup
    import shutil
    shutil.move(str(backup_path), str(target_path))

    return True


def delete_backup(asset_key: str, extension: str, backup_timestamp: str) -> bool:
    """Delete a specific backup file."""
    from ..config import settings

    backup_dir = settings.backup_assets_dir
    base_name = _safe_asset_key(asset_key)
    backup_filename = f"{base_name}-{backup_timestamp}{extension}"
    backup_path = backup_dir / backup_filename

    if backup_path.exists():
        backup_path.unlink()
        return True
    return False
