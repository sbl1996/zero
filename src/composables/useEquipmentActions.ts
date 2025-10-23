import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import type { EquipSlot, Equipment } from '@/types/domain'

export type EquipFailureReason = 'not-found' | 'already-equipped' | 'apply-error'

export interface EquipSuccess {
  ok: true
  slot: EquipSlot
  equipped: Equipment
  unequipped: Equipment[]
}

export interface EquipFailure {
  ok: false
  reason: EquipFailureReason
  slot?: EquipSlot
  equipment?: Equipment
}

export type EquipResult = EquipSuccess | EquipFailure

export type UnequipFailureReason = 'empty-slot'

export interface UnequipSuccess {
  ok: true
  slot: EquipSlot
  equipment: Equipment
}

export interface UnequipFailure {
  ok: false
  reason: UnequipFailureReason
  slot: EquipSlot
}

export type UnequipResult = UnequipSuccess | UnequipFailure

function resolveSlotsToClear(slot: EquipSlot, equipment: Equipment): EquipSlot[] {
  const slots = new Set<EquipSlot>([slot])
  if (slot === 'weapon2H' || equipment.exclusive === '2H') {
    slots.add('weaponR')
    slots.add('shieldL')
  }
  if (slot === 'weaponR' || slot === 'shieldL') {
    slots.add('weapon2H')
  }
  return [...slots]
}

export function useEquipmentActions() {
  const inventory = useInventoryStore()
  const player = usePlayerStore()

  function requestEquip(equipmentId: string): EquipResult {
    const equipment = inventory.getEquipment(equipmentId)
    if (!equipment) {
      const equipped = player.getEquipmentById(equipmentId)
      if (equipped) {
        return { ok: false, reason: 'already-equipped', slot: equipped.slot, equipment: equipped.equip }
      }
      return { ok: false, reason: 'not-found' }
    }

    const removedFromInventory = inventory.removeEquipment(equipmentId)
    if (!removedFromInventory) {
      return { ok: false, reason: 'apply-error', slot: equipment.slot }
    }

    const slotsToClear = resolveSlotsToClear(removedFromInventory.slot, removedFromInventory)
    const unequipped: Equipment[] = []

    slotsToClear
      .filter((candidate) => candidate !== removedFromInventory.slot)
      .forEach((candidate) => {
        const removed = player.unequip(candidate)
        if (removed) {
          unequipped.push(removed)
          inventory.addEquipment(removed)
        }
      })

    const displaced = player.unequip(removedFromInventory.slot)
    if (displaced) {
      unequipped.push(displaced)
      inventory.addEquipment(displaced)
    }

    player.equip(removedFromInventory.slot, removedFromInventory)

    const equippedNow = player.equips[removedFromInventory.slot]
    if (!equippedNow) {
      // extremely unlikely, but revert to avoid losing item
      inventory.addEquipment(removedFromInventory)
      return { ok: false, reason: 'apply-error', slot: removedFromInventory.slot }
    }

    return { ok: true, slot: removedFromInventory.slot, equipped: equippedNow, unequipped }
  }

  function requestUnequip(slot: EquipSlot): UnequipResult {
    const removed = player.unequip(slot)
    if (!removed) {
      return { ok: false, reason: 'empty-slot', slot }
    }
    inventory.addEquipment(removed)
    return { ok: true, slot, equipment: removed }
  }

  return {
    requestEquip,
    requestUnequip,
  }
}
