export type ItemIcon =
  | { type: 'image'; src: string; alt?: string }
  | { type: 'text'; text: string }

const IMAGE_ICON_MAP: Record<string, { src: string; alt: string }> = {
  potionHP: { src: '/potion-hp-1.webp', alt: '生命药水' },
  potionQi: { src: '/potion-sp-1.webp', alt: '斗气药水' },
  potionQiPlus: { src: '/potion-xp-1.webp', alt: '精制斗气药水' },
}

const TEXT_ICON_MAP: Record<string, string> = {
  potionHP: '🧪',
  potionQi: '✨',
  potionQiPlus: '💥',
  blessGem: '💎',
  soulGem: '💗',
  miracleGem: '💧',
  voidGem: '⚪',
  skillGem: '🟪',
  ultGem: '🛡️',
}

const DEFAULT_TEXT_ICON: ItemIcon = { type: 'text', text: '⬜' }

export function textIcon(text: string): ItemIcon {
  return { type: 'text', text }
}

export function resolveItemIcon(itemId: string | null | undefined): ItemIcon {
  if (!itemId) {
    return DEFAULT_TEXT_ICON
  }

  const imageIcon = IMAGE_ICON_MAP[itemId]
  if (imageIcon) {
    return { type: 'image', ...imageIcon }
  }

  const fallback = TEXT_ICON_MAP[itemId]
  if (fallback) {
    return textIcon(fallback)
  }

  return DEFAULT_TEXT_ICON
}
