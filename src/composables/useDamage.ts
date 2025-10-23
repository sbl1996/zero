import type { RealmStage, RealmTier } from '@/types/domain'

export interface DamageOptions {
  penFlat?: number
  penPct?: number
  defenderTough?: number
  // Preferred: absolute DEF_ref constant from target realm (see getDefRefForRealm)
  defRef?: number
  // Back-compat fallback when DEF_ref is unavailable
  contentLevel?: number
  defRefFactor?: number
  desiredRetention?: number
}

export interface DamageResult {
  damage: number
  coreDamage: number
}

function toRollMultiplier(input: number) {
  return 0.8 + 0.4 * input
}

function clampPenPct(value = 0) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 0.6)
}

function clamp01(x: number) {
  return Math.min(Math.max(x, 0), 1)
}

// DEF_ref lookup per BATTLE.md §5.1
export function getDefRefForRealm(realm?: RealmStage | null): number {
  if (!realm) return 0
  const tier = realm.tier
  const phase = realm.phase

  // Base at major tier start (1..9, sanctuary)
  const baseByTier: Record<Exclude<RealmTier, 'sanctuary'>, number> = {
    1: 60,
    2: 120,
    3: 240,
    4: 480,
    5: 960,
    6: 1920,
    7: 3840,
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

function computeDamage(
  atk: number,
  def: number,
  mult: number,
  rollMultiplier: number,
  options: DamageOptions = {},
): DamageResult {
  const {
    penFlat = 0,
    penPct = 0,
    defenderTough = 1,
    defRef,
    contentLevel = 0,
    defRefFactor = 1.7,
    desiredRetention = 0.5,
  } = options

  const raw = atk * mult * rollMultiplier

  let effectiveDef = Math.max(0, def - penFlat) * (1 - clampPenPct(penPct)) * Math.max(defenderTough, 0)

  let mitigation = 1
  const retention = clamp01(desiredRetention)
  const defRefConstant = Math.max(0, defRef ?? defRefFactor * Math.max(contentLevel, 0))
  if (defRefConstant > 0 && retention > 0 && retention < 1) {
    const armorConstant = (retention / (1 - retention)) * defRefConstant
    const denominator = armorConstant + effectiveDef
    mitigation = denominator > 0 ? armorConstant / denominator : 1
  } else if (effectiveDef > 0) {
    mitigation = 0
  }

  const core = raw * mitigation
  const damage = Math.round(Math.max(0, core))

  return { damage, coreDamage: Math.round(core) }
}

export function dmgAttack(ATK: number, DEF: number, roll: number, options?: DamageOptions): DamageResult {
  return computeDamage(ATK, DEF, 1.0, toRollMultiplier(roll), options)
}

export function dmgSkill(ATK: number, DEF: number, roll: number, options?: DamageOptions): DamageResult {
  return computeDamage(ATK, DEF, 1.6, toRollMultiplier(roll), options)
}

export function dmgUlt(ATK: number, DEF: number, roll: number, options?: DamageOptions): DamageResult {
  return computeDamage(ATK, DEF, 3.5, toRollMultiplier(roll), options)
}

export function dmgCustom(
  ATK: number,
  DEF: number,
  multiplier: number,
  roll: number,
  options?: DamageOptions,
): DamageResult {
  return computeDamage(ATK, DEF, multiplier, toRollMultiplier(roll), options)
}
