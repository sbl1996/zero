import type { GameMap } from '@/types/map'
import { resolveAssetUrl } from '@/utils/assetUrls'
import mapMetadataRaw from './map-metadata.json'
import monsterPositionsRaw from './monster-positions.json'

type MapMetadata = Omit<GameMap, 'image'> & { image: string }

interface MapMetadataFile {
  defaultMapId: string
  maps: MapMetadata[]
}

const MAP_METADATA = mapMetadataRaw as MapMetadataFile

export const monsterPositions = monsterPositionsRaw as Record<
  string,
  Record<string, { x: number; y: number }>
>

export function getMonsterPosition(mapId: string, monsterId: string): { x: number; y: number } {
  return monsterPositions[mapId]?.[monsterId] || { x: 50, y: 50 }
}

export const defaultMapId = MAP_METADATA.defaultMapId

export const maps: GameMap[] = MAP_METADATA.maps.map((map) => ({
  ...map,
  image: resolveAssetUrl(map.image),
}))
