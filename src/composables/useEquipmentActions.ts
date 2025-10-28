import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import type { EquipSlotKey, Equipment } from '@/types/domain'

export type EquipFailureReason = 'not-found' | 'already-equipped' | 'apply-error'

export interface EquipSuccess {
  ok: true
  slot: EquipSlotKey
  equipped: Equipment
  unequipped: Equipment[]
}

export interface EquipFailure {
  ok: false
  reason: EquipFailureReason
  slot?: EquipSlotKey
  equipment?: Equipment
}

export type EquipResult = EquipSuccess | EquipFailure

export type UnequipFailureReason = 'empty-slot'

export interface UnequipSuccess {
  ok: true
  slot: EquipSlotKey
  equipment: Equipment
}

export interface UnequipFailure {
  ok: false
  reason: UnequipFailureReason
  slot: EquipSlotKey
}

export type UnequipResult = UnequipSuccess | UnequipFailure

function resolveSlotsToClear(slot: EquipSlotKey, equipment: Equipment): EquipSlotKey[] {
  const slots = new Set<EquipSlotKey>([slot])
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

  function resolveTargetSlot(equipment: Equipment): EquipSlotKey | null {
    if (equipment.slot === 'ring') {
      if (!player.equips.ring1) return 'ring1'
      if (!player.equips.ring2) return 'ring2'
      return 'ring1'
    }
    return equipment.slot
  }

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
      return { ok: false, reason: 'apply-error' }
    }

    const targetSlot = resolveTargetSlot(removedFromInventory)
    if (!targetSlot) {
      inventory.addEquipment(removedFromInventory)
      return { ok: false, reason: 'apply-error' }
    }

    const slotsToClear = resolveSlotsToClear(targetSlot, removedFromInventory)
    const unequipped: Equipment[] = []

    slotsToClear
      .filter((candidate) => candidate !== targetSlot)
      .forEach((candidate) => {
        const removed = player.unequip(candidate)
        if (removed) {
          unequipped.push(removed)
          inventory.addEquipment(removed)
        }
      })

    const displaced = player.unequip(targetSlot)
    if (displaced) {
      unequipped.push(displaced)
      inventory.addEquipment(displaced)
    }

    player.equip(targetSlot, removedFromInventory)

    const equippedNow = player.equips[targetSlot]
    if (!equippedNow) {
      // extremely unlikely, but revert to avoid losing item
      inventory.addEquipment(removedFromInventory)
      return { ok: false, reason: 'apply-error', slot: targetSlot }
    }

    return { ok: true, slot: targetSlot, equipped: equippedNow, unequipped }
  }

  function requestUnequip(slot: EquipSlotKey): UnequipResult {
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
