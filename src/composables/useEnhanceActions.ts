import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import {
  enhanceRoll,
  mainEnhanceChance,
  mainEnhanceCost,
  mainEnhanceTier,
  MAX_EQUIP_LEVEL,
  type EnhanceCost,
  type EnhanceMaterialCost,
} from './useEnhance'
import type { Equipment, EquipSlotKey } from '@/types/domain'

export type EnhanceSource = 'equipped' | 'inventory'

interface ResolvedEquipment {
  source: EnhanceSource
  equipment: Equipment
  slot?: EquipSlotKey
}

export interface MainEnhanceFeedback {
  ok: boolean
  reason?:
    | 'not-found'
    | 'max-level'
    | 'insufficient-gold'
    | 'insufficient-material'
    | 'apply-error'
  success?: boolean
  levelBefore?: number
  levelAfter?: number
  chance?: number
  cost?: EnhanceCost
  gemConsumed?: boolean
  materialsConsumed?: EnhanceMaterialCost[]
  missingMaterialId?: string
  goldConsumed?: boolean
  floorApplied?: number
  equipment?: Equipment
}


function resolveEquipment(player = usePlayerStore(), inventory = useInventoryStore(), id: string): ResolvedEquipment | null {
  const equipped = player.getEquipmentById(id)
  if (equipped) {
    return { source: 'equipped', equipment: equipped.equip, slot: equipped.slot }
  }
  const stored = inventory.getEquipment(id)
  if (stored) {
    return { source: 'inventory', equipment: stored }
  }
  return null
}

function applyEquipmentUpdate(
  player: ReturnType<typeof usePlayerStore>,
  inventory: ReturnType<typeof useInventoryStore>,
  resolved: ResolvedEquipment,
  changes: Partial<Equipment>,
) {
  if (resolved.source === 'equipped') {
    return player.updateEquippedEquipment(resolved.equipment.id, changes)
  }
  return inventory.updateEquipment(resolved.equipment.id, changes)
}

export function useEnhanceActions() {
  const player = usePlayerStore()
  const inventory = useInventoryStore()

  function attemptMainEnhance(id: string, rng: () => number = Math.random): MainEnhanceFeedback {
    const resolved = resolveEquipment(player, inventory, id)
    if (!resolved) return { ok: false, reason: 'not-found' }

    const equipment = resolved.equipment
    const currentLevel = equipment.level
    if (currentLevel >= MAX_EQUIP_LEVEL) {
      return { ok: false, reason: 'max-level', levelBefore: currentLevel, equipment }
    }

    const cost = mainEnhanceCost(equipment)
    if (player.gold < cost.gold) {
      return { ok: false, reason: 'insufficient-gold', cost, equipment }
    }
    const lackingMaterial = cost.materials.find((material) => inventory.quantity(material.id) < material.quantity)
    if (lackingMaterial) {
      return {
        ok: false,
        reason: 'insufficient-material',
        cost,
        missingMaterialId: lackingMaterial.id,
        equipment,
      }
    }

    const goldDeducted = player.spendGold(cost.gold)
    const spentMaterials: EnhanceMaterialCost[] = []
    let materialError: EnhanceMaterialCost | null = null
    cost.materials.forEach((material) => {
      if (materialError) return
      const ok = inventory.spend(material.id, material.quantity)
      if (!ok) {
        materialError = material
        return
      }
      spentMaterials.push(material)
    })

    if (!goldDeducted || materialError) {
      if (goldDeducted) player.gainGold(cost.gold)
      spentMaterials.forEach((material) => {
        inventory.addItem(material.id, material.quantity)
      })
      return { ok: false, reason: 'apply-error', cost, equipment }
    }

    const chance = mainEnhanceChance(currentLevel)
    const roll = enhanceRoll(currentLevel, rng)
    const tier = mainEnhanceTier(currentLevel)

    const newLevel = roll.ok
      ? Math.min(currentLevel + 1, MAX_EQUIP_LEVEL)
      : Math.max(currentLevel - roll.drop, tier.floor ?? 0)

    const applied = applyEquipmentUpdate(player, inventory, resolved, { level: newLevel })
    if (!applied) {
      // attempt to revert resource consumption if update failed
      player.gainGold(cost.gold)
      spentMaterials.forEach((material) => {
        inventory.addItem(material.id, material.quantity)
      })
      return { ok: false, reason: 'apply-error', cost, equipment }
    }

    const updated = resolveEquipment(player, inventory, id)?.equipment ?? equipment

    return {
      ok: true,
      success: roll.ok,
      chance,
      levelBefore: currentLevel,
      levelAfter: newLevel,
      cost,
      gemConsumed: Boolean(cost.materials.find((material) => material.id === cost.gemId)),
      materialsConsumed: spentMaterials,
      goldConsumed: true,
      floorApplied: roll.ok ? undefined : tier.floor,
      equipment: updated,
    }
  }

  return {
    attemptMainEnhance,
  }
}
