import { defineStore } from 'pinia'
import { MONSTERS } from '@/data/monsters'
import { maps, defaultMapId } from '@/data/maps'
import type { UnlockState } from '@/types/domain'

function defaultUnlocks(): UnlockState {
  const unlockedMaps: Record<string, boolean> = {}
  maps.forEach(map => {
    unlockedMaps[map.id] = map.category === 'city' || map.id === 'fringe' // 默认解锁所有城市地图和第一个野外地图
  })
  return {
    clearedMonsters: {},
    unlockedMaps,
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
    setCurrentMap(mapId: string) {
      if (this.isMapUnlocked(mapId)) {
        this.currentMapId = mapId
      }
    },
    unlockAllMaps() {
      maps.forEach(map => {
        this.data.unlockedMaps[map.id] = true
      })
    },
    clearAllMonsters() {
      // Mark all monsters as cleared
      MONSTERS.forEach(monster => {
        this.data.clearedMonsters[monster.id] = true
      })
      // Also unlock all maps
      this.unlockAllMaps()
    },
  },
})
