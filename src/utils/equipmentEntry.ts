import { getQualityVisuals } from '@/constants/equipmentVisuals'
import { enhanceAuraClass, enhanceBadgeMeta } from '@/composables/useEnhanceDisplay'
import { resolveEquipmentIcon } from '@/utils/equipmentIcons'
import type { Equipment, EquipSlot, EquipSlotKey, RealmTier } from '@/types/domain'
import type { EquipmentGridEntry, EquipmentEntrySource, EquipmentSubType } from '@/types/equipment-ui'

export interface EquipmentEntryMeta {
  isNew?: boolean
  acquiredAt?: number
}

export interface EquipmentEntryBuilderContext {
  getSlotLabel: (slot: EquipSlot, slotKey?: EquipSlotKey) => string
  formatMainStatLine: (equipment: Equipment) => string
  getMainStatTooltip: (equipment: Equipment) => string
  formatSubstatsList: (source: Equipment | Equipment['substats'] | undefined | null) => string[]
  getEquipmentRequiredRealmTier: (equipment: Equipment) => RealmTier | undefined
  isRealmRequirementMet: (required?: RealmTier) => boolean
  requirementLabel: (required?: RealmTier) => string
}

function resolveEquipmentSubType(slot: EquipSlot): EquipmentSubType {
  switch (slot) {
    case 'weaponR':
    case 'weapon2H':
      return 'weapon'
    case 'helmet':
    case 'armor':
    case 'boots':
      return 'armor'
    case 'shieldL':
      return 'shield'
    case 'ring':
      return 'accessory'
    default:
      return 'armor'
  }
}

export function createEquipmentGridEntry(
  equipment: Equipment,
  context: EquipmentEntryBuilderContext,
  options: {
    source: EquipmentEntrySource
    slotKey?: EquipSlotKey
    meta?: EquipmentEntryMeta
  },
): EquipmentGridEntry {
  const qualityVisual = getQualityVisuals(equipment.quality)
  const requiredRealmTier = context.getEquipmentRequiredRealmTier(equipment)

  return {
    id: equipment.id,
    name: equipment.name,
    slot: equipment.slot,
    slotKey: options.slotKey,
    slotLabel: context.getSlotLabel(equipment.slot, options.slotKey),
    subType: resolveEquipmentSubType(equipment.slot),
    quality: equipment.quality,
    qualityLabel: qualityVisual.label,
    qualityColor: qualityVisual.accentColor,
    qualityVisual,
    icon: resolveEquipmentIcon(equipment),
    level: equipment.level,
    mainDetail: context.formatMainStatLine(equipment),
    mainStatTooltip: context.getMainStatTooltip(equipment),
    subDetails: context.formatSubstatsList(equipment.substats),
    source: options.source,
    requiredRealmTier,
    realmRequirementMet: context.isRealmRequirementMet(requiredRealmTier),
    requirementLabel: context.requirementLabel(requiredRealmTier),
    enhanceBadge: enhanceBadgeMeta(equipment.level),
    enhanceAura: enhanceAuraClass(equipment.level),
    isNew: options.source === 'inventory' ? Boolean(options.meta?.isNew) : false,
    acquiredAt: options.meta?.acquiredAt,
    equipment,
  }
}
