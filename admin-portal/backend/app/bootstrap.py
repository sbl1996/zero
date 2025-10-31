from __future__ import annotations

import hashlib
import logging
import mimetypes
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Iterable

from sqlalchemy.orm import Session

from . import models
from .catalog import load_catalog_by_type, get_monster_enriched_metadata
from .config import settings
from .database import SessionLocal
from .services.storage import ALLOWED_EXTENSIONS

logger = logging.getLogger(__name__)

def _generate_monster_tags(asset_id: str) -> list[str]:
    """Generate monster tags from enriched metadata."""
    enriched = get_monster_enriched_metadata(asset_id)
    tags = []

    if enriched:
        # Add realm tier tag
        realm_tier = enriched.get("realmTier")
        if realm_tier is not None:
            realm_map = {
                1: "一级", 2: "二级", 3: "三级", 4: "四级", 5: "五级",
                6: "六级", 7: "七级", 8: "八级", 9: "九级"
            }
            realm_text = realm_map.get(realm_tier, f"境界 {realm_tier}")
            tags.append(realm_text)

        # Add map name tags
        map_names = enriched.get("mapNames", [])
        tags.extend(map_names)

    return sorted(list(set(tags)))  # Remove duplicates and sort


def _infer_asset_type(asset_key: str, lookups: dict[str, dict[str, str]] | None = None) -> str:
    if lookups:
        for asset_type in ("monster", "map", "skill"):
            if asset_key in lookups.get(asset_type, {}):
                return asset_type
    key = asset_key.lower()
    if key.startswith(("m-", "boss-")):
        return "monster"
    if key.startswith("map-"):
        return "map"
    if key.startswith("skill-"):
        return "skill"
    return "misc"


def _load_title_lookup() -> dict[str, dict[str, str]]:
    lookups: dict[str, dict[str, str]] = {}
    for asset_type in ("monster", "map", "skill"):
        try:
            catalog = load_catalog_by_type(asset_type)
        except FileNotFoundError:
            logger.warning(
                "Catalog source files not found when bootstrapping assets; proceeding without titles for '%s'.",
                asset_type,
            )
            catalog = []
        except Exception as exc:  # pragma: no cover - defensive fallback
            logger.warning("Failed to load catalog for '%s': %s", asset_type, exc)
            catalog = []
        lookups[asset_type] = {item.id: item.label for item in catalog}
    return lookups


def _guess_title(asset_key: str, asset_type: str, lookups: dict[str, dict[str, str]]) -> str:
    lookup = lookups.get(asset_type, {})
    if asset_key in lookup:
        return lookup[asset_key]
    if asset_type == "map" and asset_key.startswith("map-"):
        candidate = asset_key[len("map-") :]
        if candidate in lookup:
            return lookup[candidate]
    if asset_type == "skill":
        normalized = asset_key
        if normalized.startswith("skill-"):
            normalized = normalized[len("skill-") :]
        normalized = normalized.replace("-", "_")
        if normalized in lookup:
            return lookup[normalized]
    for values in lookups.values():
        if asset_key in values:
            return values[asset_key]
    # Handle common suffix variants such as m-faerie-1 where catalog only contains m-faerie.
    base, dash, suffix = asset_key.rpartition("-")
    if dash and suffix.isdigit() and base in lookup:
        return f"{lookup[base]} {suffix}"
    # Fallback to a simple human-readable title.
    return asset_key.replace("-", " ").title()


def _hash_file(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            if not chunk:
                break
            hasher.update(chunk)
    return hasher.hexdigest()


def _gather_files(raw_dir: Path) -> dict[str, list[Path]]:
    groups: dict[str, list[Path]] = defaultdict(list)
    for entry in raw_dir.iterdir():
        if not entry.is_file():
            continue
        if entry.name.startswith("."):
            continue
        if entry.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        groups[entry.stem].append(entry)
    return groups


def _attach_revisions(asset: models.Asset, files: Iterable[Path]) -> None:
    revision_times: list[datetime] = []
    for file_path in sorted(files, key=lambda p: p.stat().st_mtime):
        stats = file_path.stat()
        created_at = datetime.utcfromtimestamp(stats.st_mtime)
        checksum = _hash_file(file_path)
        content_type, _ = mimetypes.guess_type(file_path.name)
        revision = models.AssetRevision(
            file_name=file_path.name,
            file_path=file_path.name,
            content_type=content_type,
            file_size=stats.st_size,
            checksum=checksum,
            created_at=created_at,
        )
        asset.revisions.append(revision)
        revision_times.append(created_at)

    if revision_times:
        asset.created_at = min(revision_times)
        asset.updated_at = max(revision_times)
    else:
        now = datetime.utcnow()
        asset.created_at = now
        asset.updated_at = now


def populate_initial_assets() -> None:
    """Populate the database with the files that already exist under raw_assets_dir."""
    raw_dir = settings.raw_assets_dir
    if not raw_dir.exists():
        logger.warning("Raw asset directory does not exist: %s", raw_dir)
        return

    session: Session = SessionLocal()
    try:
        existing = session.query(models.Asset).count()
        if existing > 0:
            logger.debug("Skipping bootstrap: database already contains %s assets.", existing)
            return

        files_by_asset = _gather_files(raw_dir)
        if not files_by_asset:
            logger.info("No raw asset files found under %s; skipping bootstrap.", raw_dir)
            return

        title_lookup = _load_title_lookup()
        created_assets = 0

        for asset_key in sorted(files_by_asset.keys()):
            asset_type = _infer_asset_type(asset_key, title_lookup)
            title = _guess_title(asset_key, asset_type, title_lookup)

            # Generate auto tags for monsters
            if asset_type == "monster":
                tags = _generate_monster_tags(asset_key)
            else:
                tags = []

            asset = models.Asset(
                asset_key=asset_key,
                asset_type=asset_type,
                title=title,
                tags=tags,
            )
            _attach_revisions(asset, files_by_asset[asset_key])
            session.add(asset)
            created_assets += 1

        session.commit()
        logger.info("Bootstrapped %s assets from %s.", created_assets, raw_dir)
    except Exception:  # pragma: no cover - defensive logging
        session.rollback()
        logger.exception("Failed to bootstrap assets from %s.", raw_dir)
    finally:
        session.close()
