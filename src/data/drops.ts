import type { Monster } from '@/types/domain'

export type EquipmentTier =
  | 'iron'
  | 'steel'
  | 'knight'
  | 'mithril'
  | 'rune'
  | 'dragon'
  | 'celestial'

interface BaseDropEntry {
  weight: number
}

export interface ItemDropEntry extends BaseDropEntry {
  kind: 'item'
  itemId: string
  quantity?: number
}

export interface EquipmentDropEntry extends BaseDropEntry {
  kind: 'equipment'
  tier: EquipmentTier
}

export interface GoldDropEntry extends BaseDropEntry {
  kind: 'gold'
  multiplier: number
}

export type DropEntry = ItemDropEntry | EquipmentDropEntry | GoldDropEntry

interface PotionWeights {
  hp: number
  qi: number
  qiPlus: number
}

interface GoldWeight {
  multiplier: number
  weight: number
}

interface LevelBand {
  min: number
  max: number
  currentTier: EquipmentTier
  nextTier: EquipmentTier | null
  normal: {
    potions: PotionWeights
    equipmentWeight: number
  }
  boss: {
    gemId: string | null
    gold: GoldWeight[]
  }
}

const BOSS_SLOT_WEIGHTS = {
  equipment: 55,
  gem: 25,
  gold: 20,
} as const

const LEVEL_BANDS: LevelBand[] = [
  {
    min: 1,
    max: 10,
    currentTier: 'iron',
    nextTier: 'steel',
    normal: {
      potions: { hp: 60, qi: 20, qiPlus: 10 },
      equipmentWeight: 10,
    },
    boss: {
      gemId: 'blessGem',
      gold: [
        { multiplier: 2, weight: 15 },
        { multiplier: 3, weight: 5 },
      ],
    },
  },
  {
    min: 11,
    max: 20,
    currentTier: 'steel',
    nextTier: 'knight',
    normal: {
      potions: { hp: 50, qi: 20, qiPlus: 10 },
      equipmentWeight: 12,
    },
    boss: {
      gemId: 'blessGem',
      gold: [
        { multiplier: 2, weight: 15 },
        { multiplier: 3, weight: 5 },
      ],
    },
  },
  {
    min: 21,
    max: 30,
    currentTier: 'knight',
    nextTier: 'mithril',
    normal: {
      potions: { hp: 45, qi: 20, qiPlus: 15 },
      equipmentWeight: 12,
    },
    boss: {
      gemId: 'blessGem',
      gold: [
        { multiplier: 2, weight: 15 },
        { multiplier: 3, weight: 5 },
      ],
    },
  },
  {
    min: 31,
    max: 40,
    currentTier: 'mithril',
    nextTier: 'rune',
    normal: {
      potions: { hp: 40, qi: 25, qiPlus: 15 },
      equipmentWeight: 14,
    },
    boss: {
      gemId: 'soulGem',
      gold: [
        { multiplier: 2, weight: 15 },
        { multiplier: 3, weight: 5 },
      ],
    },
  },
  {
    min: 41,
    max: 50,
    currentTier: 'rune',
    nextTier: 'dragon',
    normal: {
      potions: { hp: 35, qi: 25, qiPlus: 17 },
      equipmentWeight: 16,
    },
    boss: {
      gemId: 'soulGem',
      gold: [
        { multiplier: 2, weight: 15 },
        { multiplier: 3, weight: 5 },
      ],
    },
  },
  {
    min: 51,
    max: 59,
    currentTier: 'dragon',
    nextTier: 'celestial',
    normal: {
      potions: { hp: 30, qi: 25, qiPlus: 20 },
      equipmentWeight: 17,
    },
    boss: {
      gemId: 'soulGem',
      gold: [
        { multiplier: 2, weight: 15 },
        { multiplier: 3, weight: 5 },
      ],
    },
  },
  {
    min: 60,
    max: 60,
    currentTier: 'celestial',
    nextTier: null,
    normal: {
      potions: { hp: 25, qi: 25, qiPlus: 24 },
      equipmentWeight: 18,
    },
    boss: {
      gemId: 'miracleGem',
      gold: [
        { multiplier: 2, weight: 10 },
        { multiplier: 3, weight: 10 },
      ],
    },
  },
  {
    min: 61,
    max: 65,
    currentTier: 'dragon',
    nextTier: null,
    normal: {
      potions: { hp: 25, qi: 25, qiPlus: 24 },
      equipmentWeight: 18,
    },
    boss: {
      gemId: 'miracleGem',
      gold: [
        { multiplier: 2, weight: 10 },
        { multiplier: 3, weight: 10 },
      ],
    },
  },
]

function findLevelBand(level: number): LevelBand | null {
  for (const band of LEVEL_BANDS) {
    if (level >= band.min && level <= band.max) {
      return band
    }
  }
  if (LEVEL_BANDS.length === 0) return null
  return LEVEL_BANDS[LEVEL_BANDS.length - 1] ?? null
}

function normalizePotionEntries(
  weights: PotionWeights,
  totalWeight: number | null,
): ItemDropEntry[] {
  const entries: ItemDropEntry[] = [
    { kind: 'item', itemId: 'potionHP', weight: Math.max(0, weights.hp) },
    { kind: 'item', itemId: 'potionQi', weight: Math.max(0, weights.qi) },
    { kind: 'item', itemId: 'potionQiPlus', weight: Math.max(0, weights.qiPlus) },
  ]
  const positiveEntries = entries.filter((entry) => entry.weight > 0)
  if (!positiveEntries.length) return []
  if (typeof totalWeight !== 'number' || totalWeight <= 0) {
    return positiveEntries
  }
  const sum = positiveEntries.reduce((acc, entry) => acc + entry.weight, 0)
  if (sum <= 0) return []
  const scale = totalWeight / sum
  return positiveEntries.map((entry) => ({ ...entry, weight: entry.weight * scale }))
}

function normalizeGoldEntries(weights: GoldWeight[], totalWeight: number): GoldDropEntry[] {
  const entries = weights
    .map<GoldDropEntry | null>((entry) => {
      const weight = Math.max(0, entry.weight)
      if (weight <= 0) return null
      return { kind: 'gold', multiplier: entry.multiplier, weight }
    })
    .filter((entry): entry is GoldDropEntry => entry !== null)

  if (!entries.length || totalWeight <= 0) return []
  const sum = entries.reduce((acc, entry) => acc + entry.weight, 0)
  if (sum <= 0) return []
  const scale = totalWeight / sum
  return entries.map((entry) => ({ ...entry, weight: entry.weight * scale }))
}

export function getDropEntries(monster: Monster): DropEntry[] {
  const band = findLevelBand(monster.lv ?? 1)
  if (!band) return []

  if (!monster.isBoss) {
    const entries: DropEntry[] = [
      ...normalizePotionEntries(band.normal.potions, null),
    ]
    if (band.normal.equipmentWeight > 0) {
      entries.push({
        kind: 'equipment',
        tier: band.currentTier,
        weight: Math.max(0, band.normal.equipmentWeight),
      })
    }
    return entries
  }

  const entries: DropEntry[] = []
  const upgradeChance = band.nextTier ? 0.3 : 0

  const equipmentWeight = Math.max(0, BOSS_SLOT_WEIGHTS.equipment)
  if (equipmentWeight > 0) {
    const nextTier = band.nextTier
    if (nextTier) {
      const baseWeight = equipmentWeight * Math.max(0, 1 - upgradeChance)
      const upgradedWeight = equipmentWeight * Math.max(0, Math.min(1, upgradeChance))
      if (baseWeight > 0) {
        entries.push({ kind: 'equipment', tier: band.currentTier, weight: baseWeight })
      }
      if (upgradedWeight > 0) {
        entries.push({ kind: 'equipment', tier: nextTier, weight: upgradedWeight })
      }
    } else {
      entries.push({ kind: 'equipment', tier: band.currentTier, weight: equipmentWeight })
    }
  }

  if (band.boss.gemId) {
    entries.push({
      kind: 'item',
      itemId: band.boss.gemId,
      weight: Math.max(0, BOSS_SLOT_WEIGHTS.gem),
    })
  }

  entries.push(...normalizeGoldEntries(band.boss.gold, BOSS_SLOT_WEIGHTS.gold))

  return entries
}

export function rollDropCount(monster: Monster, rng: () => number): number {
  if (monster.isBoss) {
    let count = 2
    if (rng() < 0.3) count += 1
    if (rng() < 0.1) count += 1
    return count
  }
  const roll = rng()
  if (roll < 0.7) return 0
  if (roll < 0.95) return 1
  return 2
}

export function weightedPick<T extends DropEntry>(entries: T[], rng: () => number): T | null {
  if (!entries.length) return null
  const totalWeight = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0)
  if (totalWeight <= 0) return null
  let threshold = rng() * totalWeight
  for (const entry of entries) {
    threshold -= Math.max(0, entry.weight)
    if (threshold <= 0) {
      return entry
    }
  }
  return entries[entries.length - 1] ?? null
}
