interface DamageOptions {
  multiplier?: number
  penFlat?: number
  penPct?: number
}

function toRollMultiplier(input: number) {
  return 0.8 + 0.4 * input
}

function clampPenPct(value = 0) {
  if (!Number.isFinite(value)) return 0
  return Math.min(Math.max(value, 0), 0.95)
}

function computeDamage(atk: number, def: number, mult: number, roll: number, options: DamageOptions = {}) {
  const { penFlat = 0, penPct = 0 } = options
  const raw = atk * mult * roll
  const effectiveDef = Math.max(0, def - penFlat) * (1 - clampPenPct(penPct))
  const mitigation = 100 / (100 + effectiveDef)
  const damage = Math.floor(raw * mitigation)
  const minFloor = Math.max(1, Math.floor(0.04 * atk))
  return Math.max(damage, minFloor)
}

export function dmgAttack(ATK: number, DEF: number, roll: number, options?: DamageOptions) {
  return computeDamage(ATK, DEF, 1, toRollMultiplier(roll), options)
}

export function dmgSkill(ATK: number, DEF: number, r1: number, r2: number, options?: DamageOptions) {
  const multiplier = 1.15 + 0.2 * r1
  return computeDamage(ATK, DEF, multiplier, toRollMultiplier(r2), options)
}

export function dmgUlt(ATK: number, DEF: number, r1: number, r2: number, options?: DamageOptions) {
  const multiplier = 2 + 0.5 * r1
  return computeDamage(ATK, DEF, multiplier, toRollMultiplier(r2), options)
}

export function dmgCustom(
  ATK: number,
  DEF: number,
  multiplier: number,
  roll: number,
  options?: Omit<DamageOptions, 'multiplier'>,
) {
  return computeDamage(ATK, DEF, multiplier, toRollMultiplier(roll), options)
}
