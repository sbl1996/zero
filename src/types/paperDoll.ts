import type { EquipSlotKey } from '@/types/domain'
import type { EquipmentGridEntry } from '@/types/equipment-ui'
import type { ItemIcon } from '@/utils/itemIcon'

export interface PaperDollSlotState {
  key: EquipSlotKey
  label: string
  placeholderIcon: ItemIcon
  entry: EquipmentGridEntry | null
}
