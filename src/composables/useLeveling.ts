import type { Player, Stats } from '@/types/domain'

export const needExp = (lv: number) => Math.round(100 * Math.pow(1.18, lv + 1))

export function baseHpMax(lv: number) {
  return 200 + 30 * lv
}

export function baseSpMax(lv: number) {
  return 115 + 5 * lv
}

export function baseXpMax(lv: number) {
  return 35 + 2 * lv
}

export function expFromAttack(expReward: number) {
  return Math.round(expReward / 3)
}

export function createDefaultPlayer(): Player {
  const baseStats: Stats = { ATK: 10, DEF: 10 }
  const lv = 1
  const hpMax = baseHpMax(lv)
  const spMax = baseSpMax(lv)
  const xpMax = baseXpMax(lv)
  return {
    lv,
    exp: 0,
    unspentPoints: 0,
    gold: 0,
    baseStats,
    equips: {},
    res: {
      hp: hpMax,
      hpMax,
      sp: spMax,
      spMax,
      xp: xpMax,
      xpMax,
    },
    skills: {
      known: ['basic_strike', 'charged_cleave', 'destiny_slash', 'focus_breath'],
      loadout: ['basic_strike', 'charged_cleave', 'destiny_slash', null],
    },
  }
}
