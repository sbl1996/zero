import type { RealmStage, SkillDefinition, SkillProgress } from '@/types/domain'
import { resolveRealmTierValue } from '@/utils/realm'

const XP_BASE = 1.0 // X0
const XP_COOLDOWN_WEIGHT = 0.25 // B
const XP_HIT_MULTIPLIER = 0.5 // C
const XP_SCALE = 0.2
const XP_MIN = 0
const XP_MAX = 10
const SPAM_DECAY = 0.8
const SKILL_XP_CAP_TABLE = [10, 30, 80, 150, 300, 500, 800, 1200, 2000]

export function createDefaultSkillProgress(skillId: string): SkillProgress {
  return {
    skillId,
    level: 1,
    xp: 0,
    lastUsedAt: null,
  }
}

export function getSkillXpCap(level: number): number {
  const index = Math.max(1, Math.floor(level)) - 1
  const cappedIndex = Math.min(index, SKILL_XP_CAP_TABLE.length - 1)
  const value = SKILL_XP_CAP_TABLE[cappedIndex]
  return typeof value === 'number' ? value : SKILL_XP_CAP_TABLE[SKILL_XP_CAP_TABLE.length - 1]!
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
  xpWholeGained: number
  leveledUp: boolean
  breakthrough: boolean
  blockedByRealm: boolean
  reachedCap: boolean
}

export function applySkillUsage(options: SkillUsageOptions): SkillUsageResult {
  const { progress, definition, realm } = options
  const baseCooldown = Number.isFinite(options.baseCooldown) ? Math.max(options.baseCooldown, 0) : 0
  const hit = Boolean(options.hit)
  const streak = Math.max(1, Math.floor(options.streak))
  const timestamp = options.timestamp ?? Date.now()
  const xpBefore = Number.isFinite(progress.xp) ? progress.xp : 0

  progress.lastUsedAt = timestamp

  const skillMax = getSkillMaxLevel(definition)
  const realmCap = getRealmSkillLevelCap(realm)
  const allowedMax = Math.min(skillMax, realmCap)

  const blockedByRealm = skillMax > realmCap

  if (progress.level >= allowedMax) {
    return {
      xpGained: 0,
      xpWholeGained: 0,
      leveledUp: false,
      breakthrough: false,
      blockedByRealm,
      reachedCap: true,
    }
  }

  const hitBonus = hit ? 1 : 0
  const baseGainRaw = (XP_BASE + XP_COOLDOWN_WEIGHT * baseCooldown) * (XP_HIT_MULTIPLIER * hitBonus) * XP_SCALE
  const baseGain = Math.min(XP_MAX, Math.max(XP_MIN, baseGainRaw))
  const penalty = Math.pow(SPAM_DECAY, Math.max(streak - 1, 0))
  const gain = baseGain * penalty

  progress.xp += gain

  const wholeBefore = Math.floor(xpBefore)
  const wholeAfterGain = Math.floor(progress.xp ?? 0)
  const xpWholeGained = Math.max(0, wholeAfterGain - wholeBefore)

  let leveledUp = false
  let xpCap = getSkillXpCap(progress.level)

  while (progress.level < allowedMax && progress.xp >= xpCap) {
    progress.xp -= xpCap
    progress.level = Math.min(allowedMax, progress.level + 1)
    leveledUp = true
    if (progress.level >= allowedMax) {
      progress.xp = Math.min(progress.xp, getSkillXpCap(progress.level))
      break
    }
    xpCap = getSkillXpCap(progress.level)
  }

  const reachedCap = progress.level >= allowedMax

  return {
    xpGained: gain,
    xpWholeGained,
    leveledUp,
    breakthrough: false,
    blockedByRealm: reachedCap && blockedByRealm,
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
