import type { Equipment, EquipSlot, EquipSlotKey, EquipmentQuality, RealmTier } from '@/types/domain'
import type { EquipmentQualityVisual } from '@/constants/equipmentVisuals'
import type { EnhanceBadgeMeta } from '@/composables/useEnhanceDisplay'
import type { ItemIcon } from '@/utils/itemIcon'

export type EquipmentEntrySource = 'inventory' | 'equipped'
export type EquipmentSubType = 'weapon' | 'armor' | 'accessory' | 'shield'

export interface EquipmentGridEntry {
  id: string
  name: string
  slot: EquipSlot
  slotKey?: EquipSlotKey
  slotLabel: string
  subType: EquipmentSubType
  quality: EquipmentQuality
  qualityLabel: string
  qualityColor: string
  qualityVisual: EquipmentQualityVisual
  icon: ItemIcon
  level: number
  mainDetail: string
  mainStatTooltip: string
  subDetails: string[]
  source: EquipmentEntrySource
  requiredRealmTier?: RealmTier
  realmRequirementMet: boolean
  requirementLabel: string
  enhanceBadge: EnhanceBadgeMeta
  enhanceAura: string
  isNew: boolean
  acquiredAt?: number
  equipment: Equipment
}
