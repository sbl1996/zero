export type ItemIcon =
  | { type: 'image'; src: string; alt?: string }
  | { type: 'text'; text: string }

const IMAGE_ICON_MAP: Record<string, { src: string; alt: string }> = {
  potionHP: { src: '/potion-hp-1.webp', alt: '生命药水' },
  potionSP: { src: '/potion-sp-1.webp', alt: '技能药水' },
  potionXP: { src: '/potion-xp-1.webp', alt: '必杀药水' },
}

const TEXT_ICON_MAP: Record<string, string> = {
  potionHP: '🧪',
  potionSP: '✨',
  potionXP: '💥',
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
