import type { Equipment, EquipSlot } from '@/types/domain'
import { randBool } from './useRng'

export type MainEnhanceGem = 'blessGem' | 'soulGem' | 'miracleGem'

export const MAX_EQUIP_LEVEL = 15

interface MainEnhanceTier {
  id: MainEnhanceGem
  minLevel: number
  maxLevel: number
  successChance: number
  dropOnFail: number
  goldCost: number
  floor?: number
}

const MAIN_ENHANCE_TABLE: MainEnhanceTier[] = [
  { id: 'blessGem', minLevel: 0, maxLevel: 4, successChance: 0.95, dropOnFail: 0, goldCost: 500 },
  { id: 'soulGem', minLevel: 5, maxLevel: 9, successChance: 0.8, dropOnFail: 1, goldCost: 2000 },
  {
    id: 'miracleGem',
    minLevel: 10,
    maxLevel: 14,
    successChance: 0.5,
    dropOnFail: 2,
    goldCost: 10000,
    floor: 10,
  },
]

export function mainEnhanceTier(level: number): MainEnhanceTier {
  const tier = MAIN_ENHANCE_TABLE.find((entry) => level >= entry.minLevel && level <= entry.maxLevel)
  return tier ?? MAIN_ENHANCE_TABLE[MAIN_ENHANCE_TABLE.length - 1]!
}

export function mainEnhanceChance(level: number) {
  return mainEnhanceTier(level).successChance
}

export function mainEnhanceCost(level: number) {
  const tier = mainEnhanceTier(level)
  return {
    gemId: tier.id,
    gold: tier.goldCost,
  }
}

export function mainBonusPercent(level: number) {
  let bonus = 0
  for (let i = 1; i <= level; i += 1) {
    if (i <= 5) bonus += 0.01
    else if (i <= 10) bonus += 0.02
    else bonus += 0.03
  }
  return bonus
}

const FLAT_PROGRESS: number[] = [
  0,
  0.07,
  0.15,
  0.22,
  0.3,
  0.38,
  0.48,
  0.58,
  0.68,
  0.78,
  0.86,
  0.92,
  0.96,
  0.98,
  0.99,
  1,
]

const MAX_FLAT_PROGRESS = FLAT_PROGRESS[FLAT_PROGRESS.length - 1] ?? 1

const SLOT_FLAT_CAP: Record<EquipSlot, number> = {
  weaponR: 0.25,
  weapon2H: 0.25,
  shieldL: 0.18,
  armor: 0.18,
  helmet: 0.15,
  ring: 0.15,
}

export function mainFlatCap(slot: EquipSlot, override?: number) {
  if (typeof override === 'number') return override
  return SLOT_FLAT_CAP[slot] ?? 0.15
}

export function mainFlatProgress(level: number): number {
  if (level <= 0) return 0
  const index = Math.max(1, Math.floor(level))
  const clamped = Math.min(index, FLAT_PROGRESS.length - 1)
  const value: number | undefined = FLAT_PROGRESS[clamped]
  return typeof value === 'number' ? value : MAX_FLAT_PROGRESS
}

export function mainFlatBonus(baseMain: number, slot: EquipSlot, level: number, overrideCap?: number) {
  if (baseMain <= 0 || level <= 0) return 0
  const capMultiplier = mainFlatCap(slot, overrideCap)
  const cap = capMultiplier * baseMain
  const progress = mainFlatProgress(level)
  const raw = Math.round(cap * progress)
  return Math.max(1, raw)
}

export type MainStatKey = 'ATK' | 'DEF' | 'HP'

export interface MainStatBreakdownEntry {
  key: MainStatKey
  base: number
  flat: number
  percent: number
  total: number
}

export function resolveMainStatBreakdown(
  equipment: Equipment,
  level = equipment.level,
): MainStatBreakdownEntry[] {
  const percent = mainBonusPercent(level)
  const breakdowns: MainStatBreakdownEntry[] = []
  const mainEntries = Object.entries(equipment.mainStat).map(([key, value]) => [
    key as MainStatKey,
    typeof value === 'number' ? value : undefined,
  ]) as Array<[MainStatKey, number | undefined]>

  mainEntries.forEach(([key, value]) => {
    if (!value) return
    const flat = mainFlatBonus(value, equipment.slot, level, equipment.flatCapMultiplier)
    const total = Math.round((value + flat) * (1 + percent))
    breakdowns.push({ key, base: value, flat, percent, total })
  })

  return breakdowns
}

export function enhanceRoll(level: number, rng: () => number) {
  const tier = mainEnhanceTier(level)
  const ok = randBool(rng, tier.successChance)
  return { ok, drop: ok ? 0 : tier.dropOnFail, floor: ok ? undefined : tier.floor }
}
