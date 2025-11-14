import type { Monster } from '@/types/domain'

export interface MonsterOpeningAction {
  at: number
  skillId: string
}

export type MonsterOpeningStrategy = MonsterOpeningAction[]

const monsterOpeningStrategies: Record<string, MonsterOpeningStrategy> = {
  'boss-dragon-whelp': [
    {
      at: 0.5,
      skillId: 'monster.dragon_flame',
    },
  ],
}

export function resolveMonsterOpeningStrategy(monster: Monster): MonsterOpeningStrategy | null {
  const strategy = monsterOpeningStrategies[monster.id]
  if (!strategy || strategy.length === 0) return null
  return strategy
}
