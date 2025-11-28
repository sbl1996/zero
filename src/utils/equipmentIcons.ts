import { resolveAssetUrl } from '@/utils/assetUrls'
import { textIcon } from '@/utils/itemIcon'
import type { Equipment, EquipSlot } from '@/types/domain'
import type { ItemIcon } from '@/utils/itemIcon'

const SLOT_ICON_MAP: Record<EquipSlot, ItemIcon> = {
  helmet: textIcon('🎩'),
  shieldL: textIcon('🛡️'),
  weaponR: textIcon('⚔️'),
  weapon2H: textIcon('🗡️'),
  armor: textIcon('🦺'),
  boots: textIcon('🥾'),
  ring: textIcon('💍'),
}

export function iconForEquipSlot(slot: EquipSlot): ItemIcon {
  return SLOT_ICON_MAP[slot] ?? textIcon('📦')
}

function artworkIconForEquipment(equipment: Equipment): ItemIcon | null {
  const artwork = equipment.artwork?.trim()
  if (!artwork) return null
  return {
    type: 'image',
    src: resolveAssetUrl(artwork),
    alt: `${equipment.name}立绘`,
  }
}

export function resolveEquipmentIcon(equipment: Equipment): ItemIcon {
  const artworkIcon = artworkIconForEquipment(equipment)
  if (artworkIcon) return artworkIcon
  return iconForEquipSlot(equipment.slot)
}
