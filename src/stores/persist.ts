import { watch } from 'vue'
import { setActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import { SAVE_VERSION } from '@/data/constants'
import type { LegacySaveDataV1, SaveData } from '@/types/domain'
import { load, save } from '@/utils/persist'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'

export function setupPersistence(pinia: Pinia) {
  setActivePinia(pinia)
  const player = usePlayerStore()
  const inventory = useInventoryStore()
  const progress = useProgressStore()

  const saved = load<SaveData | LegacySaveDataV1 | null>(null)

  if (saved) {
    if (saved.version === SAVE_VERSION) {
      if (saved.player) player.hydrate(saved.player)
      if (saved.inventory) inventory.hydrate(saved.inventory)
      if (saved.quickSlots) inventory.hydrateQuickSlots(saved.quickSlots)
      if (saved.unlocks) progress.hydrate(saved.unlocks)
    }
  }

  watch(
    () => ({
      version: SAVE_VERSION,
      player: player.$state,
      inventory: inventory.snapshot,
      quickSlots: [...inventory.quickSlots],
      unlocks: progress.data,
    }),
    (payload) => {
      save(payload as SaveData)
    },
    { deep: true },
  )
}
