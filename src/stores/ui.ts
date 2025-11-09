import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', {
  state: () => ({
    showAttributes: false,
    showEquipment: false,
    showCheatPanel: false,
    autoRematchAfterVictory: false,
    enableHoldAutoCast: false,
    showSkillCooldownGrayscale: true,
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
    toggleAutoRematch(value?: boolean) {
      this.autoRematchAfterVictory = value ?? !this.autoRematchAfterVictory
    },
    toggleCooldownGrayscale(value?: boolean) {
      this.showSkillCooldownGrayscale = value ?? !this.showSkillCooldownGrayscale
    },
  },
})
