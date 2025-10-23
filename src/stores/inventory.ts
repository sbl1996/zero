import { defineStore } from 'pinia'
import { ITEMS, quickConsumableIds } from '@/data/items'
import type { ItemDefinition, Equipment, InventorySave } from '@/types/domain'

type StackRecord = Record<string, number>

function defaultStacks(): StackRecord {
  return {
    potionHP: 5,
    potionQi: 3,
    potionQiPlus: 1,
  }
}

function defaultQuickSlots(): (string | null)[] {
  return ['potionHP', 'potionQi', 'potionQiPlus', null]
}

export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    stacks: defaultStacks() as StackRecord,
    equipment: [] as Equipment[],
    quickSlots: defaultQuickSlots() as (string | null)[],
  }),
  getters: {
    all(state): Array<ItemDefinition & { quantity: number }> {
      return ITEMS.map((def) => ({ ...def, quantity: state.stacks[def.id] ?? 0 }))
    },
    allEquipment(): Equipment[] {
      return this.equipment
    },
    snapshot(state): InventorySave {
      return {
        stacks: { ...state.stacks },
        equipment: state.equipment.map((equipment) => ({ ...equipment })),
      }
    },
  },
  actions: {
    hydrate(save?: Partial<InventorySave> | null) {
      const stacks = save?.stacks ?? {}
      const equipment = save?.equipment ?? []
      this.stacks = { ...defaultStacks(), ...stacks }
      this.equipment = equipment.map((item) => ({ ...item }))
    },
    hydrateQuickSlots(slots: Array<string | null | undefined>) {
      const base = defaultQuickSlots()
      this.quickSlots = base.map((fallback, index) => {
        const candidate = slots[index]
        if (typeof candidate === 'string' && candidate.length > 0 && quickConsumableIds.has(candidate)) {
          return candidate
        }
        return fallback ?? null
      })
    },
    quantity(id: string) {
      return this.stacks[id] ?? 0
    },
    add(id: string, amount: number) {
      const current = this.stacks[id] ?? 0
      this.stacks[id] = current + amount
    },
    addItem(id: string, amount: number) {
      this.add(id, amount)
    },
    spend(id: string, amount: number) {
      const current = this.quantity(id)
      if (current < amount) return false
      this.stacks[id] = current - amount
      return true
    },
    addEquipment(equipment: Equipment) {
      this.equipment.push({ ...equipment })
    },
    removeEquipment(equipmentId: string) {
      const index = this.equipment.findIndex((eq) => eq.id === equipmentId)
      if (index === -1) return null
      const [removed] = this.equipment.splice(index, 1)
      return removed
    },
    discardEquipment(equipmentId: string) {
      const index = this.equipment.findIndex((eq) => eq.id === equipmentId)
      if (index === -1) return false
      this.equipment.splice(index, 1)
      return true
    },
    getEquipment(equipmentId: string) {
      return this.equipment.find((eq) => eq.id === equipmentId) ?? null
    },
    updateEquipment(equipmentId: string, changes: Partial<Equipment>) {
      const index = this.equipment.findIndex((eq) => eq.id === equipmentId)
      if (index === -1) return false
      const current = this.equipment[index]!
      this.equipment.splice(index, 1, { ...current, ...changes })
      return true
    },
    setQuickSlot(index: number, itemId: string | null) {
      if (index < 0 || index >= this.quickSlots.length) return
      const nextId = itemId && quickConsumableIds.has(itemId) ? itemId : null
      this.quickSlots.splice(index, 1, nextId)
    },
    serialize(): InventorySave {
      return this.snapshot
    },
  },
})
