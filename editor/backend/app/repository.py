from __future__ import annotations

import json
from pathlib import Path
from typing import List, Dict, Any

from .models import MonsterBlueprint, MonsterList


def _sort_key(monster: Dict[str, Any]) -> tuple[int, str]:
    return (int(monster.get("bp", 0)), monster.get("id", ""))


class MonsterRepository:
    """Handles persistence of monster blueprints."""

    def __init__(self, data_file: Path):
        self.data_file = data_file
        self.data_file.parent.mkdir(parents=True, exist_ok=True)

    def _load_raw(self) -> List[Dict[str, Any]]:
        if not self.data_file.exists():
            return []
        with self.data_file.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    def _save_raw(self, monsters: List[Dict[str, Any]]) -> None:
        with self.data_file.open("w", encoding="utf-8") as fp:
            json.dump(monsters, fp, ensure_ascii=False, indent=2)
            fp.write("\n")

    def list(self) -> MonsterList:
        records = sorted(self._load_raw(), key=_sort_key)
        return [MonsterBlueprint(**record) for record in records]

    def upsert(self, monster: MonsterBlueprint) -> MonsterBlueprint:
        records = self._load_raw()
        mapping = {record["id"]: record for record in records}
        payload = monster.model_dump()
        mapping[monster.id] = payload
        ordered = sorted(mapping.values(), key=_sort_key)
        self._save_raw(ordered)
        return MonsterBlueprint(**payload)

    def delete(self, monster_id: str) -> None:
        records = self._load_raw()
        if not any(record["id"] == monster_id for record in records):
            raise KeyError(monster_id)
        remaining = [record for record in records if record["id"] != monster_id]
        ordered = sorted(remaining, key=_sort_key)
        self._save_raw(ordered)
