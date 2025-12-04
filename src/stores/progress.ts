import { defineStore } from 'pinia'
import { MONSTER_BLUEPRINTS } from '@/data/monsters'
import { maps, defaultMapId } from '@/data/maps'
import type { UnlockState } from '@/types/domain'

function getDefaultNodeId(mapId: string): string | null {
  const map = maps.find(entry => entry.id === mapId)
  if (!map || !map.nodes || !map.nodes.length) {
    return null
  }
  return map.defaultNodeId ?? map.nodes[0]?.id ?? null
}

function defaultUnlocks(): UnlockState {
  const unlockedMaps: Record<string, boolean> = {}
  const currentNodes: Record<string, string | null> = {}
  maps.forEach(map => {
    unlockedMaps[map.id] = map.category === 'city' || map.id === 'fringe' // 默认解锁所有城市地图和第一个野外地图
    currentNodes[map.id] = getDefaultNodeId(map.id)
  })
  return {
    clearedMonsters: {},
    unlockedMaps,
    currentNodes,
  }
}

export const useProgressStore = defineStore('progress', {
  state: () => ({
    data: defaultUnlocks(),
    currentMapId: defaultMapId,
  }),
  getters: {
    isMonsterCleared: (state) => (id: string) => !!state.data.clearedMonsters[id],
    isMapUnlocked: (state) => (mapId: string) => !!state.data.unlockedMaps[mapId],
    currentNodeId: (state) => (mapId: string | undefined) => {
      if (!mapId) return null
      return state.data.currentNodes[mapId] ?? null
    },
  },
  actions: {
    hydrate(data: UnlockState) {
      this.data = { ...defaultUnlocks(), ...data }
    },
    markMonsterCleared(id: string) {
      this.data.clearedMonsters[id] = true
    },
    unlockMap(mapId: string) {
      this.data.unlockedMaps[mapId] = true
    },
    setCurrentMap(mapId: string, nodeId?: string) {
      if (this.isMapUnlocked(mapId)) {
        this.currentMapId = mapId
        const nextNode = nodeId
          ?? this.data.currentNodes[mapId]
          ?? getDefaultNodeId(mapId)
        if (nextNode) {
          this.data.currentNodes[mapId] = nextNode
        }
      }
    },
    setCurrentNode(mapId: string, nodeId: string) {
      if (!nodeId) return
      this.data.currentNodes[mapId] = nodeId
    },
    unlockAllMaps() {
      maps.forEach(map => {
        this.data.unlockedMaps[map.id] = true
      })
    },
    clearAllMonsters() {
      // Mark all monsters as cleared
      MONSTER_BLUEPRINTS.forEach(monster => {
        this.data.clearedMonsters[monster.id] = true
      })
      // Also unlock all maps
      this.unlockAllMaps()
    },
  },
})
