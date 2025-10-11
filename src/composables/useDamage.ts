export interface DamageOptions {
  penFlat?: number
  penPct?: number
  contentLevel?: number
  attackerLevel?: number
  defenderTough?: number
  floorRatio?: number
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
    contentLevel = 1,
    attackerLevel,
    defenderTough = 1,
    floorRatio = 0.04,
    defRefFactor = 1.7,
    desiredRetention = 0.5,
  } = options

  const raw = atk * mult * rollMultiplier
  const sanitizedContentLevel = Number.isFinite(contentLevel) ? Math.max(contentLevel, 0) : 0
  const normalizedAttackerLevel = Number.isFinite(attackerLevel ?? NaN) ? (attackerLevel as number) : null
  const sanitizedAttackerLevel =
    normalizedAttackerLevel !== null ? Math.max(1, Math.floor(normalizedAttackerLevel)) : null

  let effectiveDef = Math.max(0, def - penFlat) * (1 - clampPenPct(penPct)) * Math.max(defenderTough, 0)
  if (sanitizedAttackerLevel !== null) {
    const gapFactor = Math.max(0.2, sanitizedContentLevel / sanitizedAttackerLevel)
    effectiveDef *= gapFactor
  }

  let mitigation = 1
  const retention = Math.min(Math.max(desiredRetention, 0.05), 0.95)
  const defRef = Math.max(0, defRefFactor * sanitizedContentLevel)
  if (defRef > 0 && retention > 0 && retention < 1) {
    const armorConstant = (retention / (1 - retention)) * defRef
    const denominator = armorConstant + effectiveDef
    mitigation = denominator > 0 ? armorConstant / denominator : 1
  } else if (effectiveDef > 0) {
    mitigation = 0
  }

  const coreDamage = Math.floor(raw * mitigation)
  const minFloor = Math.max(1, Math.floor(Math.max(floorRatio, 0) * atk))
  const damage = Math.max(coreDamage, minFloor)

  return {
    damage,
    coreDamage,
  }
}

export function dmgAttack(ATK: number, DEF: number, roll: number, options?: DamageOptions): DamageResult {
  return computeDamage(ATK, DEF, 1, toRollMultiplier(roll), options)
}

export function dmgSkill(ATK: number, DEF: number, roll: number, options?: DamageOptions): DamageResult {
  return computeDamage(ATK, DEF, 1.25, toRollMultiplier(roll), options)
}

export function dmgUlt(ATK: number, DEF: number, roll: number, options?: DamageOptions): DamageResult {
  return computeDamage(ATK, DEF, 2.2, toRollMultiplier(roll), options)
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
