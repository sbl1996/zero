import { defineStore } from 'pinia'
import { ITEMS, quickConsumableIds } from '@/data/items'
import { applyEquipmentTemplateMetadata } from '@/data/equipment'
import type { ItemDefinition, Equipment, EquipmentInventoryMetaEntry, InventorySave } from '@/types/domain'

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

function cloneEquipmentMeta(meta: Record<string, EquipmentMetaState>) {
  return Object.fromEntries(
    Object.entries(meta).map(([id, entry]) => [id, { ...entry } satisfies EquipmentMetaState]),
  )
}

interface EquipmentMetaState extends EquipmentInventoryMetaEntry {}

interface AddEquipmentOptions {
  markNew?: boolean
  acquiredAt?: number
}

export const useInventoryStore = defineStore('inventory', {
  state: () => ({
    stacks: defaultStacks() as StackRecord,
    equipment: [] as Equipment[],
    quickSlots: defaultQuickSlots() as (string | null)[],
    equipmentMeta: {} as Record<string, EquipmentMetaState>,
    lastEquipmentAcquiredAt: null as number | null,
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
        equipment: state.equipment.map((equipment) => {
          const { description: _desc, artwork: _artwork, ...rest } = equipment
          return { ...rest }
        }),
        equipmentMeta: cloneEquipmentMeta(state.equipmentMeta),
        lastEquipmentAcquiredAt: state.lastEquipmentAcquiredAt,
      }
    },
  },
  actions: {
    hydrate(save?: Partial<InventorySave> | null) {
      const stacks = save?.stacks ?? {}
      const equipment = save?.equipment ?? []
      const meta = save?.equipmentMeta ?? {}
      this.stacks = { ...defaultStacks(), ...stacks }
      this.equipmentMeta = {}
      this.equipment = equipment.map((item) => {
        const copy = applyEquipmentTemplateMetadata({ ...item })
        const entry = meta[item.id]
        this.equipmentMeta[item.id] = entry
          ? { ...entry }
          : {
              acquiredAt: Date.now(),
              seenAt: Date.now(),
              isNew: false,
            }
        return copy
      })
      this.lastEquipmentAcquiredAt = save?.lastEquipmentAcquiredAt ?? null
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
    addEquipment(equipment: Equipment, options: AddEquipmentOptions = {}) {
      const copy = { ...equipment }
      this.equipment.push(copy)
      const existingMeta = this.equipmentMeta[copy.id]
      const markNew = Boolean(options.markNew)
      const acquiredAt = options.acquiredAt ?? existingMeta?.acquiredAt ?? Date.now()
      const seenAt = markNew ? null : existingMeta?.seenAt ?? Date.now()
      this.equipmentMeta[copy.id] = {
        acquiredAt,
        seenAt,
        isNew: markNew ? true : existingMeta?.isNew ?? false,
      }
      if (markNew) {
        this.lastEquipmentAcquiredAt = Date.now()
      }
      return copy
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
      delete this.equipmentMeta[equipmentId]
      return true
    },
    markEquipmentSeen(equipmentId: string) {
      const meta = this.equipmentMeta[equipmentId]
      if (!meta) return
      meta.isNew = false
      meta.seenAt = Date.now()
    },
    markEquipmentsSeen(equipmentIds: string[]) {
      equipmentIds.forEach((id) => {
        this.markEquipmentSeen(id)
      })
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
