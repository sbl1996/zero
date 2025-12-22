import type { RealmPhase, RealmStage, RealmTier } from '@/types/domain'

export interface DamageOptions {
  penFlat?: number
  penPct?: number
  defenderTough?: number
  // Absolute DEF_ref constant from target realm (see getDefRefForRealm)
  defRef?: number
}

export interface WeaknessResolution {
  damage: number
  triggered: boolean
  chance: number
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0
  if (value <= 0) return 0
  if (value >= 1) return 1
  return value
}

export function toRollMultiplier(input: number) {
  return 0.8 + 0.4 * input
}

function clampPenPct(value = 0) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 0.6)
}

// DEF_ref lookup per BATTLE.md §5.1
export function getDefRefForRealm(realm?: RealmStage | RealmTier): number {
  if (!realm) return 0
  const { tier, phase } = typeof realm === 'number' || realm === 'sanctuary'
    ? { tier: realm, phase: 'none' as RealmPhase }
    : realm

  // Base at major tier start (1..9, sanctuary)
  const baseByTier: Record<Exclude<RealmTier, 'sanctuary'>, number> = {
    1: 25,
    2: 45,
    3: 75,
    4: 127,
    5: 224,
    6: 405,
    7: 750,
    8: 7680,
    9: 15360,
  }

  if (tier === 'sanctuary') {
    // Sanctuary phases: initial/middle/high/peak; limit uses peak value
    const table = {
      initial: 30720,
      middle: 40960,
      high: 51200,
      peak: 61440,
      limit: 61440,
      none: 30720,
    } as const
    return table[phase] ?? 30720
  }

  if (typeof tier === 'number') {
    if (tier >= 1 && tier <= 6) {
      return baseByTier[tier as Exclude<RealmTier, 'sanctuary'>]
    }
    // 7-9 have sub-phases; use fixed table from docs
    if (tier === 7) {
      const table = { initial: 3840, middle: 4800, high: 5760, peak: 6720, limit: 6720, none: 3840 } as const
      return table[phase] ?? 3840
    }
    if (tier === 8) {
      const table = { initial: 7680, middle: 10240, high: 12800, peak: 15360, limit: 15360, none: 7680 } as const
      return table[phase] ?? 7680
    }
    if (tier === 9) {
      const table = { initial: 15360, middle: 21760, high: 28160, peak: 34560, limit: 34560, none: 15360 } as const
      return table[phase] ?? 15360
    }
  }

  return 0
}

export function computeDamage(
  atk: number,
  def: number,
  mult: number,
  rollMultiplier: number,
  options: DamageOptions = {},
): number {
  const {
    penFlat = 0,
    penPct = 0,
    defenderTough = 1,
    defRef,
  } = options

  const raw = atk * mult * rollMultiplier

  let effectiveDef = Math.max(0, def - penFlat) * (1 - clampPenPct(penPct)) * Math.max(defenderTough, 0)

  let mitigation = 1
  const defRefConstant = Math.max(0, defRef ?? 0)
  const retention = 0.5
  if (defRefConstant > 0) {
    const armorConstant = (retention / (1 - retention)) * defRefConstant
    const denominator = armorConstant + effectiveDef
    mitigation = denominator > 0 ? armorConstant / denominator : 1
  } else if (effectiveDef > 0) {
    mitigation = 0
  }

  const core = raw * mitigation
  const damage = Math.round(Math.max(0, core))

  return damage
}

export function resolveWeaknessDamage(
  baseDamage: number,
  attackerAgi: number,
  defenderAgi: number,
  roll: number,
): WeaknessResolution {
  const safeBase = Math.max(0, Math.round(baseDamage))
  const att = Math.max(0, Number.isFinite(attackerAgi) ? attackerAgi : 0)
  const def = Math.max(0, Number.isFinite(defenderAgi) ? defenderAgi : 0)
  let chance = 0.05
  if (att > 0) {
    const ratio = def / att
    const gap = clamp01(1 - ratio)
    chance = clamp01(0.05 + 0.75 * Math.pow(gap, 1.3))
  }
  const rollValue = clamp01(roll)
  const triggered = rollValue < chance
  const finalDamage = triggered ? Math.round(safeBase * 1.5) : safeBase
  return {
    damage: finalDamage,
    triggered,
    chance,
  }
}
