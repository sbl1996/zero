from __future__ import annotations

import json
from pathlib import Path
from typing import List, Dict, Any

from .models import MonsterBlueprint, MonsterList, EquipmentItem, EquipmentList


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


def _equipment_sort_key(equipment: Dict[str, Any]) -> tuple[str, int, str]:
    """Sort equipment by slot, tier, and ID."""
    slot_order = {"helmet": 0, "shieldL": 1, "weaponR": 2, "weapon2H": 3, "armor": 4, "ring": 5}
    slot = equipment.get("slot", "")
    tier = equipment.get("required_tier", 0)
    return (str(slot_order.get(slot, 999)), tier, equipment.get("id", ""))


class EquipmentRepository:
    """Handles persistence of equipment items."""
    
    def __init__(self, data_file: Path):
        self.data_file = data_file
        self.data_file.parent.mkdir(parents=True, exist_ok=True)
    
    def _load_raw(self) -> List[Dict[str, Any]]:
        if not self.data_file.exists():
            return []
        with self.data_file.open("r", encoding="utf-8") as fp:
            return json.load(fp)
    
    def _save_raw(self, equipment_list: List[Dict[str, Any]]) -> None:
        with self.data_file.open("w", encoding="utf-8") as fp:
            json.dump(equipment_list, fp, ensure_ascii=False, indent=4)
            fp.write("\n")
    
    def list(self) -> EquipmentList:
        records = sorted(self._load_raw(), key=_equipment_sort_key)
        return [EquipmentItem(**record) for record in records]
    
    def get(self, equipment_id: str) -> EquipmentItem:
        records = self._load_raw()
        for record in records:
            if record["id"] == equipment_id:
                return EquipmentItem(**record)
        raise KeyError(equipment_id)
    
    def upsert(self, equipment: EquipmentItem) -> EquipmentItem:
        records = self._load_raw()
        mapping = {record["id"]: record for record in records}
        payload = equipment.model_dump(exclude_none=True)
        mapping[equipment.id] = payload
        ordered = sorted(mapping.values(), key=_equipment_sort_key)
        self._save_raw(ordered)
        return EquipmentItem(**payload)
    
    def delete(self, equipment_id: str) -> None:
        records = self._load_raw()
        if not any(record["id"] == equipment_id for record in records):
            raise KeyError(equipment_id)
        remaining = [record for record in records if record["id"] != equipment_id]
        ordered = sorted(remaining, key=_equipment_sort_key)
        self._save_raw(ordered)
