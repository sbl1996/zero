import { defineStore } from 'pinia'
import { PAGES } from '@/data/monsters'

export const useUiStore = defineStore('ui', {
  state: () => ({
    monsterPage: PAGES[0] ?? 1,
    showAttributes: false,
    showEquipment: false,
    showCheatPanel: false,
  }),
  actions: {
    setMonsterPage(page: number) {
      this.monsterPage = page
    },
    toggleAttributes(value?: boolean) {
      this.showAttributes = value ?? !this.showAttributes
    },
    toggleEquipment(value?: boolean) {
      this.showEquipment = value ?? !this.showEquipment
    },
    toggleCheatPanel(value?: boolean) {
      this.showCheatPanel = value ?? !this.showCheatPanel
    },
  },
})
