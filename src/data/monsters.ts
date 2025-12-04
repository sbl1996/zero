import type { Monster, MonsterAttackInterval, MonsterRank, MonsterSpecialization } from '@/types/domain'
import {
  resolveMonsterSkillProfile,
  resolveMonsterSkillSelector,
} from '@/data/monsterSkills'
import monsterBlueprintsRaw from './monster-blueprints.json'

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

const SPECIALIZATION_COEFFICIENTS: Record<
  MonsterSpecialization,
  { ATK: number; DEF: number; AGI: number }
> = {
  balanced: { ATK: 0.4, DEF: 0.4, AGI: 0.2 },
  attacker: { ATK: 0.55, DEF: 0.25, AGI: 0.2 },
  defender: { ATK: 0.3, DEF: 0.55, AGI: 0.15 },
  agile: { ATK: 0.35, DEF: 0.2, AGI: 0.45 },
  bruiser: { ATK: 0.5, DEF: 0.4, AGI: 0.1 },
  skirmisher: { ATK: 0.4, DEF: 0.2, AGI: 0.4 },
  mystic: { ATK: 0.35, DEF: 0.4, AGI: 0.25 },
  crazy: { ATK: 0.65, DEF: 0.1, AGI: 0.25 },
}

const DEFAULT_ATTACK_INTERVAL: MonsterAttackInterval = [1.4, 1.8]
const DEFAULT_CORE_DROP_CHANCE = 0.2
const BOSS_CORE_DROP_CHANCE = 0.9

interface RankConfig {
  fluxRange: [number, number]
  hpMultiplier: number
  toughness: number
  rewardMultiplier: number
}

const MONSTER_RANK_CONFIGS: Record<MonsterRank, RankConfig> = {
  normal: {
    fluxRange: [0.95, 1.05],
    hpMultiplier: 1.0,
    toughness: 1.0,
    rewardMultiplier: 1.0,
  },
  strong: {
    fluxRange: [1.06, 1.15],
    hpMultiplier: 1.2,
    toughness: 1.1,
    rewardMultiplier: 1.5,
  },
  elite: {
    fluxRange: [1.16, 1.30],
    hpMultiplier: 1.3,
    toughness: 1.2,
    rewardMultiplier: 3.0,
  },
  calamity: {
    fluxRange: [1.35, 1.6],
    hpMultiplier: 1.5,
    toughness: 1.3,
    rewardMultiplier: 8.0,
  },
  boss: {
    fluxRange: [1, 1],
    hpMultiplier: 1.0,
    toughness: 1.5,
    rewardMultiplier: 1.0,
  },
}

const RANK_BUCKETS: Array<{ rank: MonsterRank; min: number; max: number }> = [
  { rank: 'normal', min: 0, max: 70 },
  { rank: 'strong', min: 70, max: 90 },
  { rank: 'elite', min: 90, max: 99 },
  { rank: 'calamity', min: 99, max: 100 },
]

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

type GenerateMonsterInstanceOptions = {
  rng?: () => number
  rankOverride?: MonsterRank
}

export const MONSTER_BLUEPRINTS = monsterBlueprintsRaw as MonsterBlueprint[]
const MONSTER_BLUEPRINT_MAP: Record<string, MonsterBlueprint> = MONSTER_BLUEPRINTS.reduce(
  (acc, blueprint) => {
    acc[blueprint.id] = blueprint
    return acc
  },
  {} as Record<string, MonsterBlueprint>,
)

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

function pickNonBossRank(rng: () => number): MonsterRank {
  const roll = rng() * 100
  for (const bucket of RANK_BUCKETS) {
    if (roll >= bucket.min && roll < bucket.max) {
      return bucket.rank
    }
  }
  return 'calamity'
}

function sampleFlux(range: [number, number], rng: () => number) {
  const [min, max] = range
  const span = Math.max(0, max - min)
  return min + rng() * span
}

function resolveFinalRank(
  blueprint: MonsterBlueprint,
  rng: () => number,
  options?: GenerateMonsterInstanceOptions,
): MonsterRank {
  if (blueprint.rank === 'boss') {
    return 'boss'
  }
  const override = options?.rankOverride
  if (override && override !== 'boss') {
    return override
  }
  if (blueprint.rank) {
    return blueprint.rank
  }
  return pickNonBossRank(rng)
}

function resolveCoreDropChance(
  blueprint: MonsterBlueprint,
  rank: MonsterRank,
  multiplier: number,
): number {
  const baseChance =
    rank === 'boss'
      ? blueprint.rewards.coreDropChance ?? BOSS_CORE_DROP_CHANCE
      : blueprint.rewards.coreDropChance ?? DEFAULT_CORE_DROP_CHANCE
  if (rank === 'boss') {
    return Math.min(1, Math.max(0, baseChance))
  }
  return Math.min(1, Math.max(0, baseChance * multiplier))
}

export function generateMonsterInstance(
  blueprint: MonsterBlueprint,
  options?: GenerateMonsterInstanceOptions,
): Monster {
  const rng = options?.rng ?? Math.random
  const rank = resolveFinalRank(blueprint, rng, options)
  const config = MONSTER_RANK_CONFIGS[rank]
  const isBoss = rank === 'boss'
  const flux = isBoss ? 1 : sampleFlux(config.fluxRange, rng)
  const finalBp = isBoss ? blueprint.bp : Math.max(1, Math.round(blueprint.bp * flux))
  const finalHp = isBoss
    ? blueprint.hp
    : Math.max(1, Math.round(blueprint.hp * flux * config.hpMultiplier))
  const stats = computeDerivedStats(finalBp, blueprint.specialization)
  const rewards = {
    gold: Math.max(0, Math.round(blueprint.rewards.gold * config.rewardMultiplier)),
    coreDrop: {
      tier: typeof blueprint.realmTier === 'number' ? blueprint.realmTier : 9,
      chance: resolveCoreDropChance(blueprint, rank, config.rewardMultiplier),
    },
  }
  const monster: Monster = {
    id: blueprint.id,
    name: blueprint.name,
    realmTier: blueprint.realmTier,
    rank,
    bp: finalBp,
    specialization: blueprint.specialization,
    hp: finalHp,
    stats,
    rewards,
    toughness: blueprint.toughness ?? config.toughness,
    attackInterval: sanitizeAttackInterval(blueprint.attackInterval),
    isBoss,
    baseBp: blueprint.bp,
    baseHp: blueprint.hp,
    flux,
    rankHpMultiplier: config.hpMultiplier,
    rewardMultiplier: config.rewardMultiplier,
    portraits: blueprint.portraits,
  }
  monster.skillProfile = resolveMonsterSkillProfile(monster)
  monster.skillSelector = resolveMonsterSkillSelector(monster)
  return monster
}

export function generateMonsterInstanceById(
  id: string,
  options?: GenerateMonsterInstanceOptions,
): Monster | null {
  const blueprint = MONSTER_BLUEPRINT_MAP[id]
  if (!blueprint) return null
  return generateMonsterInstance(blueprint, options)
}
