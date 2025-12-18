import type { GameMap, MapNode } from '@/types/map'
import { resolveAssetUrl } from '@/utils/assetUrls'
import mapMetadataRaw from './map-metadata.json'

type MapBgmMetadata = {
  ambient?: string | null
  battle?: string | null
}

type MapMetadata = Omit<GameMap, 'image' | 'bgm'> & {
  image: string
  bgm?: MapBgmMetadata
  battleBackground?: string | null
}

interface MapMetadataFile {
  defaultMapId: string
  maps: MapMetadata[]
}

const MAP_METADATA = mapMetadataRaw as MapMetadataFile

export const defaultMapId = MAP_METADATA.defaultMapId

export const maps: GameMap[] = MAP_METADATA.maps.map((map) => {
  const { image, bgm, battleBackground, ...rest } = map
  const resolvedBgm = bgm
    ? {
        ambient: bgm.ambient ? resolveAssetUrl(bgm.ambient) : undefined,
        battle: bgm.battle ? resolveAssetUrl(bgm.battle) : undefined,
      }
    : undefined
  const resolvedBattleBackground = battleBackground ? resolveAssetUrl(battleBackground) : undefined
  return {
    ...rest,
    image: resolveAssetUrl(image),
    battleBackground: resolvedBattleBackground,
    bgm: resolvedBgm,
  }
})

const mapLookup = new Map<string, GameMap>()
const nodeLookup = new Map<string, MapNode & { mapId: string }>()

maps.forEach((map) => {
  mapLookup.set(map.id, map)
  map.nodes?.forEach((node) => {
    nodeLookup.set(node.id, { ...node, mapId: map.id })
  })
})

export function getGameMap(mapId: string): GameMap | undefined {
  return mapLookup.get(mapId)
}

export function getMapNode(nodeId: string): (MapNode & { mapId: string }) | undefined {
  return nodeLookup.get(nodeId)
}
