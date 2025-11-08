const DODGE_SUCCESS_BASE = 1.0
const DODGE_RATIO_THRESHOLD = 1.5
// k 使用 ratio=2.0 时 0.8 成功率，从而 ratio 超过 1.5 后按指数衰减
const DODGE_DECAY_K = Math.log(0.8) / (2.0 - DODGE_RATIO_THRESHOLD)

function clampChance(value: number) {
  return Math.max(0, Math.min(1, value))
}

export function resolveDodgeSuccessChance(attackerAgi: number, defenderAgi: number): number {
  if (defenderAgi <= 0) {
    return attackerAgi <= 0 ? 1 : 0
  }

  const ratio = attackerAgi / defenderAgi
  const excess = Math.max(0, ratio - DODGE_RATIO_THRESHOLD)
  const rawChance = DODGE_SUCCESS_BASE * Math.exp(DODGE_DECAY_K * excess)
  return clampChance(rawChance)
}
