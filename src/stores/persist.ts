import { watch } from 'vue'
import { setActivePinia } from 'pinia'
import type { Pinia } from 'pinia'
import type { SaveData } from '@/types/domain'
import { load, save } from '@/utils/persist'
import { useInventoryStore } from './inventory'
import { usePlayerStore } from './player'
import { useProgressStore } from './progress'
import { useQuestStore } from './quests'

const SAVE_VERSION = 3
const SAVE_INTERVAL_MS = 60_000

class SaveScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null
  private pending: SaveData | null = null

  queue(next: SaveData) {
    this.pending = next
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.flush()
    }, SAVE_INTERVAL_MS)
  }

  flush(next?: SaveData) {
    if (next) {
      this.pending = next
    }
    if (!this.pending) return
    save(this.pending)
    this.pending = null
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}

export function setupPersistence(pinia: Pinia) {
  setActivePinia(pinia)
  const player = usePlayerStore()
  const inventory = useInventoryStore()
  const progress = useProgressStore()
  const quests = useQuestStore()

  const saved = load<SaveData | null>(null)

  if (saved) {
    if (saved.version === SAVE_VERSION) {
      if (saved.player) player.hydrate(saved.player)
      if (saved.inventory) inventory.hydrate(saved.inventory)
      if (saved.quickSlots) inventory.hydrateQuickSlots(saved.quickSlots)
      if (saved.unlocks) progress.hydrate(saved.unlocks)
      if (saved.quests) quests.hydrate(saved.quests)
    }
  }

  quests.initWatchers()
  quests.refreshAvailability()

  const scheduler = new SaveScheduler()

  const collectSaveData = (): SaveData => ({
    version: SAVE_VERSION,
    player: player.$state,
    inventory: inventory.snapshot,
    quickSlots: [...inventory.quickSlots],
    unlocks: progress.data,
    quests: quests.serialize(),
  })

  const queueSave = (payload: SaveData) => {
    scheduler.queue(payload)
  }

  const flushSave = () => {
    scheduler.flush(collectSaveData())
  }

  watch(
    collectSaveData,
    (payload) => {
      queueSave(payload)
    },
    { deep: true },
  )

  watch(
    () => player.gold,
    () => {
      flushSave()
    },
  )

  watch(
    () => player.equips,
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => player.skills,
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => player.cultivation,
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => inventory.snapshot,
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => [...inventory.quickSlots],
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => progress.data,
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => quests.serialize(),
    () => {
      queueSave(collectSaveData())
    },
    { deep: true },
  )

  watch(
    () => ({ active: [...quests.active], ready: [...quests.readyToTurnIn], completed: [...quests.completed] }),
    () => {
      flushSave()
    },
    { deep: true },
  )

  watch(
    () => quests.questItems,
    () => {
      flushSave()
    },
    { deep: true },
  )
}
