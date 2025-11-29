import { ITEMS } from '@/data/items'
import type { ItemIconDefinition } from '@/types/domain'

export type ItemIcon = ItemIconDefinition

const DEFAULT_TEXT_ICON: ItemIcon = { type: 'text', text: '⬜' }
const ICON_MAP = new Map(ITEMS.map((item) => [item.id, item.icon]))

export function textIcon(text: string): ItemIcon {
  return { type: 'text', text }
}

export function resolveItemIcon(itemId: string | null | undefined): ItemIcon {
  if (!itemId) {
    return DEFAULT_TEXT_ICON
  }

  const icon = ICON_MAP.get(itemId)
  const definition = ITEMS.find((item) => item.id === itemId)

  if (icon?.type === 'image') {
    return {
      type: 'image',
      src: icon.src,
      alt: icon.alt ?? definition?.name ?? itemId,
    }
  }

  if (icon?.type === 'text') {
    return { type: 'text', text: icon.text }
  }

  return DEFAULT_TEXT_ICON
}
