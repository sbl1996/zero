export interface Position {
  x: number
  y: number
}

export interface BGM {
  ambient?: string
  battle?: string
}

export interface MonsterSpawn {
  id: string
  weight: number
}

export interface SpawnConfig {
  min: number
  max: number
  intervalSeconds: number
  respawnSeconds: number
  monsters: MonsterSpawn[]
}

export interface Destination {
  mapId: string
  nodeId?: string
}

export interface MapNode {
  id: string
  label: string
  type: 'battle' | 'portal'
  position: Position
  connections: string[]
  spawn?: SpawnConfig
  destination?: Destination
  npcs?: string[]
  description?: string
}

export interface MapLocation {
  id: string
  name: string
  position: Position
  description?: string
  routeName?: string
  routeParams?: Record<string, any>
  destinationMapId?: string
}

export interface MapMetadata {
  id: string
  name: string
  image: string
  description: string
  category: 'city' | 'wild'
  bgm?: BGM
  defaultNodeId?: string
  nodes?: MapNode[]
  locations?: MapLocation[]
}

export interface Edge {
  id: string
  from: MapNode
  to: MapNode
}

export type EditMode = 'select' | 'move' | 'connect' | 'add-battle' | 'add-portal' | 'add-location'
