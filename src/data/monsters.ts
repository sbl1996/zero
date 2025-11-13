import type { Monster, MonsterAttackInterval, MonsterRank, MonsterSpecialization } from '@/types/domain'
import { monsterPositions } from '@/data/maps'
import {
  resolveMonsterSkillProfile,
  resolveMonsterSkillSelector,
} from '@/data/monsterSkills'
import monsterBlueprintsRaw from './monster-blueprints.json'

// 怪物到地图的映射
export function getMonsterMap(monsterId: string): string | null {
  for (const [mapId, positions] of Object.entries(monsterPositions)) {
    if (positions[monsterId]) {
      return mapId
    }
  }
  return null
}

// BOSS击败后的地图解锁顺序
export const bossUnlockMap: Record<string, string> = {
  'boss-golden-sheep': 'spine-of-frostfire',
  'boss-wind-raptor': 'thunderveil-keep',
  'boss-dragon-whelp': 'bogroot-expanse',
  'boss-treant': 'duskfang-rift',
  'boss-priest': 'gloomlit-arcanum',
  'boss-archmage': 'obsidian-windscar',
  'boss-knight': 'frostfire-maelstrom',
  'boss-warlord': 'astral-crown',
  'boss-dragon': 'green-elysium',
}

const K_MONSTER_BP_TO_UNIT = 5

const STAT_SCALE = {
  ATK: 1.2,
  DEF: 1.0,
  AGI: 1.0,
} as const

const SPECIALIZATION_COEFFICIENTS: Record<MonsterSpecialization, { ATK: number; DEF: number; AGI: number }> = {
  balanced: { ATK: 0.4, DEF: 0.4, AGI: 0.2 },
  attacker: { ATK: 0.55, DEF: 0.25, AGI: 0.2 },
  defender: { ATK: 0.3, DEF: 0.55, AGI: 0.15 },
  agile: { ATK: 0.35, DEF: 0.2, AGI: 0.45 },
  bruiser: { ATK: 0.5, DEF: 0.4, AGI: 0.1 },
  skirmisher: { ATK: 0.4, DEF: 0.2, AGI: 0.4 },
  mystic: { ATK: 0.35, DEF: 0.4, AGI: 0.25 },
  crazy: { ATK: 0.65, DEF: 0.1, AGI: 0.25 },
}

interface MonsterBlueprint {
  id: Monster['id']
  name: Monster['name']
  realmTier: Monster['realmTier']
  hp: number
  bp: number
  specialization: MonsterSpecialization
  rewards: {
    gold: number
    coreDropChance?: number
  }
  rank?: MonsterRank
  toughness?: number
  attackInterval?: MonsterAttackInterval
  portraits?: Monster['portraits']
}

const MONSTER_BLUEPRINTS = monsterBlueprintsRaw as MonsterBlueprint[]
const DEFAULT_ATTACK_INTERVAL: MonsterAttackInterval = [1.4, 1.8]
const CORE_DROP_CHANCE_BY_RANK: Record<MonsterRank, number> = {
  normal: 0.2,
  elite: 0.45,
  boss: 0.9,
}

function sanitizeAttackInterval(interval?: MonsterAttackInterval): MonsterAttackInterval {
  if (!interval || !Array.isArray(interval)) {
    return DEFAULT_ATTACK_INTERVAL
  }
  if (interval.length === 1) {
    return interval
  }
  const [first, second] = interval
  const min = Math.min(first, second)
  const max = Math.max(first, second)
  if (max <= 0) {
    return DEFAULT_ATTACK_INTERVAL
  }
  if (min === max) {
    return [min]
  }
  return [min, max]
}

function computeDerivedStats(bp: number, specialization: MonsterSpecialization) {
  const unit = bp / K_MONSTER_BP_TO_UNIT
  const coefficients = SPECIALIZATION_COEFFICIENTS[specialization]
  const ATK = Math.round(unit * coefficients.ATK * STAT_SCALE.ATK)
  const DEF = Math.round(unit * coefficients.DEF * STAT_SCALE.DEF)
  const AGI = Math.round(unit * coefficients.AGI * STAT_SCALE.AGI)
  return { ATK, DEF, AGI }
}

function buildMonster(blueprint: MonsterBlueprint): Monster {
  const rank: MonsterRank = blueprint.rank ?? 'normal'
  const isBoss = rank === 'boss'
  const stats = computeDerivedStats(blueprint.bp, blueprint.specialization)
  const attackInterval = sanitizeAttackInterval(blueprint.attackInterval)
  const toughness = blueprint.toughness ?? (isBoss ? 1.2 : 1.0)
  const coreDropTier = typeof blueprint.realmTier === 'number' ? blueprint.realmTier : 9
  const baseChance = CORE_DROP_CHANCE_BY_RANK[rank] ?? CORE_DROP_CHANCE_BY_RANK.normal
  const coreDropChance =
    typeof blueprint.rewards.coreDropChance === 'number'
      ? blueprint.rewards.coreDropChance
      : baseChance
  const clampedChance = Math.max(0, Math.min(coreDropChance, 1))
  const rewards = {
    gold: blueprint.rewards.gold,
    coreDrop: {
      tier: coreDropTier,
      chance: clampedChance,
    },
  }
  const monster: Monster = {
    id: blueprint.id,
    name: blueprint.name,
    realmTier: blueprint.realmTier,
    rank,
    bp: blueprint.bp,
    specialization: blueprint.specialization,
    hp: blueprint.hp,
    stats,
    rewards,
    toughness,
    attackInterval,
    isBoss,
    penetration: undefined,
    portraits: blueprint.portraits,
  }
  monster.skillProfile = resolveMonsterSkillProfile(monster)
  monster.skillSelector = resolveMonsterSkillSelector(monster)
  return monster
}

export const MONSTERS: Monster[] = MONSTER_BLUEPRINTS.map(buildMonster)
