export type MapCategory = 'city' | 'wild'

export interface MapLocation {
  id: string
  name: string
  position: {
    x: number
    y: number
  }
  description?: string | null
  routeName?: string
  routeParams?: Record<string, string | number> | null
  routeQuery?: Record<string, string | number> | null
  destinationMapId?: string | null
}

export type MapNodeType = 'battle' | 'functional' | 'mixed' | 'portal'

export interface MapBgmConfig {
  ambient?: string | null
  battle?: string | null
}

export interface MapNodeSpawnMonster {
  id: string
  weight?: number
}

export interface MapNodeSpawnConfig {
  min: number
  max: number
  intervalSeconds?: number
  respawnSeconds?: number
  monsters: MapNodeSpawnMonster[]
}

export interface MapNodeDestination {
  mapId: string
  nodeId?: string
}

export interface MapNode {
  id: string
  label: string
  type: MapNodeType
  position: {
    x: number
    y: number
  }
  connections: string[]
  description?: string | null
  spawn?: MapNodeSpawnConfig | null
  npcs?: string[] | null
  destination?: MapNodeDestination | null
}

export interface GameMap {
  id: string
  name: string
  image: string
  description: string
  locations: MapLocation[]
  category: MapCategory
  defaultNodeId?: string | null
  nodes?: MapNode[] | null
  bgm?: MapBgmConfig
}
