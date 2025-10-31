from __future__ import annotations

import json
from functools import lru_cache
from typing import Callable

from .config import settings
from .schemas import CatalogItem

REPO_ROOT = settings.raw_assets_dir.parents[2]


def _read(repo_relative: str) -> str:
    path = REPO_ROOT / repo_relative
    return path.read_text(encoding="utf-8")


def _load_json(repo_relative: str):
    raw = _read(repo_relative)
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:  # pragma: no cover - defensive fallback
        raise ValueError(f"Failed to parse {repo_relative}") from exc


def _unique(items: list[CatalogItem]) -> list[CatalogItem]:
    seen = {}
    for item in items:
        seen[item.id] = item
    return sorted(seen.values(), key=lambda i: i.id)


def _merge_default_map(items: list[CatalogItem], default_id: str | None) -> list[CatalogItem]:
    if not default_id:
        return items
    if any(item.id == default_id for item in items):
        return items
    items.append(CatalogItem(id=default_id, label=default_id.replace("-", " ").title()))
    return items


Extractor = Callable[[object], list[CatalogItem]]
PostProcessor = Callable[[list[CatalogItem], object], list[CatalogItem]]


CATALOG_SPECS: dict[str, tuple[str, Extractor, PostProcessor | None]] = {
    "monster": (
        "src/data/monster-blueprints.json",
        lambda data: [
            CatalogItem(id=entry["id"], label=entry["name"])
            for entry in (data if isinstance(data, list) else [])
            if isinstance(entry, dict)
            and isinstance(entry.get("id"), str)
            and isinstance(entry.get("name"), str)
            and entry["id"].startswith(("m-", "boss-"))
        ],
        None,
    ),
    "skill": (
        "src/data/skill-metadata.json",
        lambda data: [
            CatalogItem(id=entry["id"], label=entry["name"])
            for entry in (data if isinstance(data, list) else [])
            if isinstance(entry, dict)
            and isinstance(entry.get("id"), str)
            and isinstance(entry.get("name"), str)
        ],
        None,
    ),
    "map": (
        "src/data/map-metadata.json",
        lambda data: [
            CatalogItem(id=entry["id"], label=entry["name"])
            for entry in (data.get("maps", []) if isinstance(data, dict) else [])
            if isinstance(entry, dict)
            and isinstance(entry.get("id"), str)
            and isinstance(entry.get("name"), str)
        ],
        lambda items, data: _merge_default_map(
            items,
            data.get("defaultMapId") if isinstance(data, dict) else None,
        ),
    ),
}


@lru_cache(maxsize=16)
def load_catalog_by_type(asset_type: str) -> list[CatalogItem]:
    asset_type = asset_type.lower()
    spec = CATALOG_SPECS.get(asset_type)
    if not spec:
        return []

    path, extractor, post = spec
    data = _load_json(path)
    items = extractor(data)
    if post:
        items = post(items, data)
    return _unique(items)


# ---- Enriched metadata helpers ----
from functools import lru_cache as _lru_cache
from typing import Any, Dict


@_lru_cache(maxsize=1)
def _monster_realm_lookup() -> dict[str, int]:
    data = _load_json("src/data/monster-blueprints.json")
    base_lookup: dict[str, int] = {}
    if isinstance(data, list):
        for entry in data:
            if isinstance(entry, dict):
                mid = entry.get("id")
                tier = entry.get("realmTier")
                if isinstance(mid, str) and isinstance(tier, int):
                    base_lookup[mid] = tier

    # Generate extended lookup for IDs with numeric suffixes
    lookup: dict[str, int] = {}
    for base_id, tier in base_lookup.items():
        # Add the base ID itself
        lookup[base_id] = tier

        # Add variants with numeric suffixes
        for suffix in ["-1", "-2", "-3", "-4", "-5"]:
            variant_id = base_id + suffix
            lookup[variant_id] = tier

    return lookup


@_lru_cache(maxsize=1)
def _map_name_lookup() -> dict[str, str]:
    data = _load_json("src/data/map-metadata.json")
    names: dict[str, str] = {}
    maps = data.get("maps", []) if isinstance(data, dict) else []
    for m in maps:
        if isinstance(m, dict):
            mid = m.get("id")
            name = m.get("name")
            if isinstance(mid, str) and isinstance(name, str):
                names[mid] = name
    # also include defaultMapId if missing name
    default_id = data.get("defaultMapId") if isinstance(data, dict) else None
    if isinstance(default_id, str) and default_id not in names:
        names[default_id] = default_id.replace("-", " ").title()
    return names


@_lru_cache(maxsize=1)
def _monster_maps_lookup() -> dict[str, list[str]]:
    data = _load_json("src/data/monster-positions.json")
    base_result: dict[str, set[str]] = {}
    if isinstance(data, dict):
        for map_id, entries in data.items():
            if not isinstance(entries, dict):
                continue
            for monster_id in entries.keys():
                if not isinstance(monster_id, str):
                    continue
                base_result.setdefault(monster_id, set()).add(map_id)

    # Generate extended lookup for IDs with numeric suffixes
    result: dict[str, set[str]] = {}
    for base_id, map_ids in base_result.items():
        # Add the base ID itself
        result[base_id] = map_ids.copy()

        # Add variants with numeric suffixes
        for suffix in ["-1", "-2", "-3", "-4", "-5"]:
            variant_id = base_id + suffix
            result[variant_id] = map_ids.copy()

    # normalize to sorted lists
    return {k: sorted(v) for k, v in result.items()}


def get_monster_enriched_metadata(asset_id: str) -> Dict[str, Any] | None:
    if not asset_id or not isinstance(asset_id, str):
        return None
    realm = _monster_realm_lookup().get(asset_id)
    map_ids = _monster_maps_lookup().get(asset_id, [])
    if realm is None and not map_ids:
        return None
    map_names_index = _map_name_lookup()
    map_names = [map_names_index.get(m, m) for m in map_ids]
    return {
        "realmTier": realm,
        "mapIds": map_ids,
        "mapNames": map_names,
        "_source": "computed",
    }
