export type MapCategory = 'city' | 'wild'

export interface MapLocation {
  id: string
  name: string
  position: {
    x: number
    y: number
  }
  description?: string
  routeName?: string
  routeParams?: Record<string, string | number>
  routeQuery?: Record<string, string | number>
  destinationMapId?: string
}

export interface GameMap {
  id: string
  name: string
  image: string
  description: string
  locations: MapLocation[]
  category: MapCategory
}
