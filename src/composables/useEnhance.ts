import type {
  Equipment,
  EquipSlot,
  EquipmentMainStatType,
  EquipmentEnhanceRequirement,
  EnhanceMaterialCost,
} from '@/types/domain'
import { EQUIPMENT_TEMPLATE_MAP } from '@/data/equipment'
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

export interface EnhanceCost {
  gold: number
  gemId: MainEnhanceGem
  materials: EnhanceMaterialCost[]
}

const MAIN_ENHANCE_TABLE: MainEnhanceTier[] = [
  { id: 'blessGem', minLevel: 0, maxLevel: 4, successChance: 0.95, dropOnFail: 0, goldCost: 500 },
  {
    id: 'soulGem',
    minLevel: 5,
    maxLevel: 9,
    successChance: 0.8,
    dropOnFail: 1,
    goldCost: 2000,
    floor: 5,
  },
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

function findTemplateRequirements(equipment: Equipment): EquipmentEnhanceRequirement[] {
  const templateId = equipment.templateId ?? equipment.id
  const template = templateId ? EQUIPMENT_TEMPLATE_MAP.get(templateId) : undefined
  return template?.enhanceMaterials ?? []
}

function mergeMaterialCosts(entries: EnhanceMaterialCost[]): EnhanceMaterialCost[] {
  const acc = new Map<string, number>()
  entries.forEach((entry) => {
    if (!entry?.id) return
    const qty = Math.max(0, Math.round(entry.quantity ?? 0))
    if (!qty) return
    const current = acc.get(entry.id) ?? 0
    acc.set(entry.id, current + qty)
  })
  return Array.from(acc.entries()).map(([id, quantity]) => ({ id, quantity }))
}

function specialMaterialsForLevel(equipment: Equipment, targetLevel: number): EnhanceMaterialCost[] {
  const requirements = findTemplateRequirements(equipment)
  const matches = requirements.filter((entry) => entry.targetLevel === targetLevel)
  const materials = matches.flatMap((entry) => entry.materials)
  return mergeMaterialCosts(materials)
}

export function mainEnhanceCost(equipment: Equipment): EnhanceCost {
  const level = equipment.level
  const tier = mainEnhanceTier(level)
  const targetLevel = Math.min(level + 1, MAX_EQUIP_LEVEL)
  const baseMaterials: EnhanceMaterialCost[] = [{ id: tier.id, quantity: 1 }]
  const special = specialMaterialsForLevel(equipment, targetLevel)
  return {
    gemId: tier.id,
    gold: tier.goldCost,
    materials: mergeMaterialCosts([...baseMaterials, ...special]),
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

export type MainStatKey = EquipmentMainStatType

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
  const main = equipment.mainStat
  if (!main) return breakdowns
  const value = typeof main.value === 'number' ? main.value : 0
  if (value <= 0) return breakdowns
  const flat = mainFlatBonus(value, equipment.slot, level, equipment.flatCapMultiplier)
  const total = Math.round((value + flat) * (1 + percent))
  breakdowns.push({ key: main.type, base: value, flat, percent, total })

  return breakdowns
}

export function enhanceRoll(level: number, rng: () => number) {
  const tier = mainEnhanceTier(level)
  const ok = randBool(rng, tier.successChance)
  return { ok, drop: ok ? 0 : tier.dropOnFail, floor: ok ? undefined : tier.floor }
}
