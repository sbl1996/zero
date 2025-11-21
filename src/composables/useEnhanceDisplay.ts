export type EnhanceBadgeVariant = 'base' | 'charged' | 'radiant' | 'mythic'

export interface EnhanceBadgeMeta {
  level: number
  text: string
  variant: EnhanceBadgeVariant
  className: string
  background: string
  color: string
  glowShadow: string
  icon?: string
}

interface BadgeRule extends Omit<EnhanceBadgeMeta, 'text'> {
  min: number
  max: number
}

const BADGE_RULES: BadgeRule[] = [
  {
    min: 0,
    max: 4,
    level: 0,
    variant: 'base',
    className: 'enhance-badge--base',
    background: 'linear-gradient(135deg, rgba(160,160,160,0.2), rgba(60,60,60,0.6))',
    color: '#f5f5f5',
    glowShadow: '0 0 8px rgba(255,255,255,0.18)',
  },
  {
    min: 5,
    max: 9,
    level: 5,
    variant: 'charged',
    className: 'enhance-badge--charged',
    background: 'linear-gradient(140deg, #5de17b, #18794c)',
    color: '#eaffef',
    glowShadow: '0 0 12px rgba(93,225,123,0.5)',
    icon: '◆',
  },
  {
    min: 10,
    max: 14,
    level: 10,
    variant: 'radiant',
    className: 'enhance-badge--radiant',
    background: 'linear-gradient(140deg, #74f0ff, #7f3dff)',
    color: '#f9f6ff',
    glowShadow: '0 0 16px rgba(116,240,255,0.65)',
    icon: '✦',
  },
  {
    min: 15,
    max: 99,
    level: 15,
    variant: 'mythic',
    className: 'enhance-badge--mythic',
    background: 'linear-gradient(145deg, #ffb347, #ff512f)',
    color: '#fff9e6',
    glowShadow: '0 0 18px rgba(255,179,71,0.8)',
    icon: '★',
  },
]

const DEFAULT_BADGE = BADGE_RULES[0]!

export function enhanceBadgeMeta(level: number): EnhanceBadgeMeta {
  const rule = BADGE_RULES.find((entry) => level >= entry.min && level <= entry.max) ?? DEFAULT_BADGE
  return {
    ...rule,
    level,
    text: `+${level}`,
  }
}

interface AuraRule {
  min: number
  max: number
  className: string
}

const AURA_RULES: AuraRule[] = [
  { min: 0, max: 4, className: 'enhance-aura-none' },
  { min: 5, max: 9, className: 'enhance-aura-sheen' },
  { min: 10, max: 14, className: 'enhance-aura-breath' },
  { min: 15, max: 99, className: 'enhance-aura-mythic' },
]

export function enhanceAuraClass(level: number): string {
  const rule = AURA_RULES.find((entry) => level >= entry.min && level <= entry.max)
  return rule?.className ?? 'enhance-aura-none'
}
