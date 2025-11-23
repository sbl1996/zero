from __future__ import annotations

from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, ConfigDict


class MonsterBlueprint(BaseModel):
    """Representation of the monster blueprint stored in JSON."""

    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    realmTier: int
    hp: int
    bp: int
    specialization: str
    rewards: Dict[str, Any] = Field(default_factory=dict)


class AssetStatus(BaseModel):
    png: bool
    webp: bool
    mp4: bool


class ConversionResult(BaseModel):
    succeeded: bool
    stdout: Optional[str] = None
    stderr: Optional[str] = None


MonsterList = List[MonsterBlueprint]


# Map models
class Position(BaseModel):
    x: float
    y: float


class BGM(BaseModel):
    ambient: Optional[str] = None
    battle: Optional[str] = None


class MonsterSpawn(BaseModel):
    id: str
    weight: int


class SpawnConfig(BaseModel):
    min: int
    max: int
    intervalSeconds: int
    respawnSeconds: int
    monsters: List[MonsterSpawn] = Field(default_factory=list)


class Destination(BaseModel):
    mapId: str
    nodeId: Optional[str] = None


class MapNode(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    label: str
    type: str  # "battle", "portal"
    position: Position
    connections: List[str] = Field(default_factory=list)
    spawn: Optional[SpawnConfig] = None
    destination: Optional[Destination] = None
    npcs: Optional[List[str]] = None
    description: Optional[str] = None


class MapLocation(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    position: Position
    description: Optional[str] = None
    routeName: Optional[str] = None
    routeParams: Optional[Dict[str, Any]] = None
    destinationMapId: Optional[str] = None


class MapMetadata(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    name: str
    image: str
    description: str
    category: str  # "city", "wild"
    bgm: Optional[BGM] = None
    defaultNodeId: Optional[str] = None
    nodes: Optional[List[MapNode]] = None
    locations: Optional[List[MapLocation]] = None


class MapMetadataFile(BaseModel):
    defaultMapId: str
    maps: List[MapMetadata]


MapList = List[MapMetadata]


# Equipment models
class EquipmentStat(BaseModel):
    """Equipment stat (main or sub)."""
    type: str
    value: float
    value_type: Optional[str] = None


class EquipmentPrice(BaseModel):
    """Equipment price information."""
    buy: Optional[int] = None
    sell: Optional[int] = None


class EnhanceMaterial(BaseModel):
    """Material required for enhancement."""
    id: str
    quantity: Optional[int] = 1


class EnhanceMaterialRequirement(BaseModel):
    """Enhancement material requirement for a specific level."""
    target_level: Optional[int] = None
    materials: Optional[List[EnhanceMaterial]] = Field(default_factory=list)


class EquipmentItem(BaseModel):
    """Representation of equipment item stored in JSON."""
    
    model_config = ConfigDict(extra="allow")
    
    id: str
    name: str
    description: Optional[str] = None
    artwork: Optional[str] = None
    slot: str
    base_quality: str
    required_tier: Optional[int] = None
    base_main: EquipmentStat
    substats: Optional[List[EquipmentStat]] = Field(default_factory=list)
    price: Optional[EquipmentPrice] = None
    flags: Optional[List[str]] = Field(default_factory=list)
    exclusive: Optional[str] = None
    flatCapMultiplier: Optional[float] = None
    enhance_materials: Optional[List[EnhanceMaterialRequirement]] = Field(default_factory=list)


EquipmentList = List[EquipmentItem]
