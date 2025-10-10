import { defineStore } from 'pinia'
import { MONSTERS, PAGES } from '@/data/monsters'
import type { UnlockState } from '@/types/domain'

function defaultUnlocks(): UnlockState {
  const unlockedPages: Record<number, boolean> = {}
  PAGES.forEach((page, index) => {
    unlockedPages[page] = index === 0
  })
  return {
    clearedMonsters: {},
    unlockedPages,
  }
}

export const useProgressStore = defineStore('progress', {
  state: () => ({
    data: defaultUnlocks(),
  }),
  getters: {
    isMonsterCleared: (state) => (id: string) => !!state.data.clearedMonsters[id],
    isPageUnlocked: (state) => (page: number) => !!state.data.unlockedPages[page],
  },
  actions: {
    hydrate(data: UnlockState) {
      this.data = { ...defaultUnlocks(), ...data }
    },
    markMonsterCleared(id: string) {
      this.data.clearedMonsters[id] = true
    },
    unlockPage(page: number) {
      this.data.unlockedPages[page] = true
    },
    unlockAllMonsters() {
      // Clear all monsters
      PAGES.forEach(page => {
        this.data.unlockedPages[page] = true
      })
    },
    clearAllMonsters() {
      // Mark all monsters as cleared
      MONSTERS.forEach(monster => {
        this.data.clearedMonsters[monster.id] = true
      })
      // Also unlock all pages
      PAGES.forEach(page => {
        this.data.unlockedPages[page] = true
      })
    },
  },
})
