import type { RealmStage, SkillDefinition, SkillProgress } from '@/types/domain'
import { resolveRealmTierValue } from '@/utils/realm'

const XP_BASE = 1.0
const XP_COOLDOWN_WEIGHT = 0.15
const XP_HIT_BONUS = 0.5
const XP_MIN = 1
const XP_MAX = 10
const SPAM_DECAY = 0.95

const BREAK_BASE = 0.06
const BREAK_STACK = 0.03
const BREAK_LIMIT = 0.35

export function createDefaultSkillProgress(skillId: string): SkillProgress {
  return {
    skillId,
    level: 1,
    xp: 0,
    atCap: false,
    btStack: 0,
    lastUsedAt: null,
  }
}

export function getSkillXpCap(level: number): number {
  const safeLevel = Math.max(1, Math.floor(level))
  return Math.round(80 * Math.pow(1.25, safeLevel - 1))
}

export function getSkillMaxLevel(definition: SkillDefinition | null | undefined): number {
  const value = definition?.maxLevel
  if (Number.isFinite(value) && typeof value === 'number' && value > 0) {
    return Math.floor(value)
  }
  return 1
}

export function getRealmSkillLevelCap(realm: RealmStage): number {
  const tier = resolveRealmTierValue(realm)
  if (!tier) return 3
  if (tier === 'sanctuary') return 10
  if (tier <= 3) return 3
  if (tier <= 6) return 5
  if (tier <= 9) return 7
  return 3
}

export interface SkillUsageOptions {
  progress: SkillProgress
  definition: SkillDefinition
  realm: RealmStage
  rng: () => number
  baseCooldown: number
  hit: boolean
  streak: number
  timestamp?: number
}

export interface SkillUsageResult {
  xpGained: number
  leveledUp: boolean
  breakthrough: boolean
  blockedByRealm: boolean
  reachedCap: boolean
}

export function applySkillUsage(options: SkillUsageOptions): SkillUsageResult {
  const { progress, definition, realm, rng } = options
  const baseCooldown = Number.isFinite(options.baseCooldown) ? Math.max(options.baseCooldown, 0) : 0
  const hit = Boolean(options.hit)
  const streak = Math.max(1, Math.floor(options.streak))
  const timestamp = options.timestamp ?? Date.now()

  progress.lastUsedAt = timestamp

  const skillMax = getSkillMaxLevel(definition)
  const realmCap = getRealmSkillLevelCap(realm)
  const allowedMax = Math.min(skillMax, realmCap)

  const blockedByRealm = progress.level >= allowedMax && skillMax > realmCap

  if (progress.level >= allowedMax) {
    progress.atCap = false
    progress.btStack = 0
    return {
      xpGained: 0,
      leveledUp: false,
      breakthrough: false,
      blockedByRealm,
      reachedCap: true,
    }
  }

  if (progress.atCap) {
    if (progress.level < allowedMax) {
      const baseChance = BREAK_BASE + BREAK_STACK * progress.btStack
      const chance = Math.min(BREAK_LIMIT, baseChance)
      const roll = Math.max(0, Math.min(1, rng()))
      if (roll < chance) {
        progress.level = Math.min(allowedMax, progress.level + 1)
        progress.xp = 0
        progress.atCap = false
        progress.btStack = 0
        return {
          xpGained: 0,
          leveledUp: true,
          breakthrough: true,
          blockedByRealm: false,
          reachedCap: progress.level >= allowedMax,
        }
      }
      progress.btStack += 1
    }
    return {
      xpGained: 0,
      leveledUp: false,
      breakthrough: false,
      blockedByRealm: false,
      reachedCap: true,
    }
  }

  const baseGainRaw = XP_BASE + XP_COOLDOWN_WEIGHT * baseCooldown + (hit ? XP_HIT_BONUS : 0)
  const baseGainRounded = Math.round(baseGainRaw)
  const clampedGain = Math.max(XP_MIN, Math.min(XP_MAX, baseGainRounded))
  const penalty = Math.pow(SPAM_DECAY, Math.max(streak - 1, 0))
  const gain = clampedGain * penalty

  progress.xp += gain

  const xpCap = getSkillXpCap(progress.level)
  let reachedCap = false

  if (progress.xp >= xpCap) {
    progress.xp = xpCap
    progress.atCap = true
    progress.btStack = 0
    reachedCap = true
  }

  return {
    xpGained: gain,
    leveledUp: false,
    breakthrough: false,
    blockedByRealm: false,
    reachedCap,
  }
}

export function resolveSkillCooldown(definition: SkillDefinition, level: number, fallback: number): number {
  const base = Number.isFinite(definition.cooldown) ? Math.max(definition.cooldown ?? fallback, 0) : Math.max(fallback, 0)
  if (typeof definition.getCooldown === 'function') {
    const resolved = definition.getCooldown(level)
    if (Number.isFinite(resolved)) {
      return Math.max(resolved, 0)
    }
  }
  return base
}

export function resolveSkillChargeTime(definition: SkillDefinition, level: number): number {
  const base = Math.max(definition.chargeTime ?? 0, 0)
  if (typeof definition.getChargeTime === 'function') {
    const resolved = definition.getChargeTime(level)
    if (Number.isFinite(resolved)) {
      return Math.max(resolved, 0)
    }
  }
  return base
}

export function resolveSkillAftercast(definition: SkillDefinition, level: number): number {
  const base = Math.max(definition.aftercastTime ?? 0, 0)
  if (typeof definition.getAftercastTime === 'function') {
    const resolved = definition.getAftercastTime(level)
    if (Number.isFinite(resolved)) {
      return Math.max(resolved, 0)
    }
  }
  return base
}

export function resolveQiCost(definition: SkillDefinition, level: number, qiMax: number): number {
  if (definition.cost.type !== 'qi') return 0
  const amount = Math.max(definition.cost.amount ?? 0, 0)
  const percent = Math.max(definition.cost.percentOfQiMax ?? 0, 0)
  const multiplier = typeof definition.getCostMultiplier === 'function'
    ? Math.max(definition.getCostMultiplier(level), 0)
    : 1
  const baseCost = amount + percent * Math.max(qiMax, 0)
  return Math.max(0, baseCost * multiplier)
}
