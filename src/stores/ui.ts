import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    showAttributes: false,
    showEquipment: false,
    showCheatPanel: false,
    showSettings: false,
    autoRematchAfterVictory: false,
    showShopEquipment: false,
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
    toggleSettings(value?: boolean) {
      this.showSettings = value ?? !this.showSettings
    },
    toggleAutoRematch(value?: boolean) {
      this.autoRematchAfterVictory = value ?? !this.autoRematchAfterVictory
    },
    toggleShopEquipment(value?: boolean) {
      this.showShopEquipment = value ?? !this.showShopEquipment
    },
  },
})
