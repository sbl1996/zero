import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    showAttributes: false,
    showEquipment: false,
    showCheatPanel: false,
  }),
  actions: {
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
