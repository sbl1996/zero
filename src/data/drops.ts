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

interface DropTable {
  entries: DropEntry[]
}

interface DropLevelRange {
  min: number
  max: number
  normal: DropTable
  boss: DropTable
}

const DROP_TABLES: DropLevelRange[] = [
  {
    min: 1,
    max: 10,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 60 },
        { kind: 'item', itemId: 'potionSP', weight: 20 },
        { kind: 'item', itemId: 'potionXP', weight: 5 },
        { kind: 'equipment', tier: 'iron', weight: 10 },
        { kind: 'item', itemId: 'blessGem', weight: 5 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'iron', weight: 40 },
        { kind: 'item', itemId: 'blessGem', weight: 35 },
        { kind: 'gold', multiplier: 2, weight: 20 },
        { kind: 'equipment', tier: 'steel', weight: 5 },
      ],
    },
  },
  {
    min: 11,
    max: 20,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 50 },
        { kind: 'item', itemId: 'potionSP', weight: 25 },
        { kind: 'item', itemId: 'potionXP', weight: 10 },
        { kind: 'equipment', tier: 'steel', weight: 12 },
        { kind: 'item', itemId: 'blessGem', weight: 8 },
        { kind: 'item', itemId: 'soulGem', weight: 5 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'steel', weight: 45 },
        { kind: 'item', itemId: 'soulGem', weight: 30 },
        { kind: 'gold', multiplier: 2, weight: 19 },
        { kind: 'equipment', tier: 'knight', weight: 6 },
      ],
    },
  },
  {
    min: 21,
    max: 30,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 45 },
        { kind: 'item', itemId: 'potionSP', weight: 25 },
        { kind: 'item', itemId: 'potionXP', weight: 12 },
        { kind: 'equipment', tier: 'knight', weight: 14 },
        { kind: 'item', itemId: 'soulGem', weight: 9 },
        { kind: 'item', itemId: 'miracleGem', weight: 4 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'knight', weight: 48 },
        { kind: 'item', itemId: 'miracleGem', weight: 28 },
        { kind: 'gold', multiplier: 2, weight: 17 },
        { kind: 'equipment', tier: 'mithril', weight: 7 },
      ],
    },
  },
  {
    min: 31,
    max: 40,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 40 },
        { kind: 'item', itemId: 'potionSP', weight: 25 },
        { kind: 'item', itemId: 'potionXP', weight: 15 },
        { kind: 'equipment', tier: 'mithril', weight: 15 },
        { kind: 'item', itemId: 'miracleGem', weight: 10 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'mithril', weight: 50 },
        { kind: 'item', itemId: 'miracleGem', weight: 30 },
        { kind: 'gold', multiplier: 2, weight: 12 },
        { kind: 'equipment', tier: 'rune', weight: 8 },
      ],
    },
  },
  {
    min: 41,
    max: 50,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 35 },
        { kind: 'item', itemId: 'potionSP', weight: 25 },
        { kind: 'item', itemId: 'potionXP', weight: 18 },
        { kind: 'equipment', tier: 'rune', weight: 16 },
        { kind: 'item', itemId: 'miracleGem', weight: 10 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'rune', weight: 52 },
        { kind: 'item', itemId: 'miracleGem', weight: 30 },
        { kind: 'gold', multiplier: 2, weight: 9 },
        { kind: 'equipment', tier: 'dragon', weight: 9 },
      ],
    },
  },
  {
    min: 51,
    max: 59,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 30 },
        { kind: 'item', itemId: 'potionSP', weight: 25 },
        { kind: 'item', itemId: 'potionXP', weight: 20 },
        { kind: 'equipment', tier: 'dragon', weight: 17 },
        { kind: 'item', itemId: 'miracleGem', weight: 10 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'dragon', weight: 55 },
        { kind: 'item', itemId: 'miracleGem', weight: 30 },
        { kind: 'gold', multiplier: 2, weight: 5 },
        { kind: 'equipment', tier: 'celestial', weight: 10 },
      ],
    },
  },
  {
    min: 60,
    max: 60,
    normal: {
      entries: [
        { kind: 'item', itemId: 'potionHP', weight: 25 },
        { kind: 'item', itemId: 'potionSP', weight: 25 },
        { kind: 'item', itemId: 'potionXP', weight: 25 },
        { kind: 'equipment', tier: 'celestial', weight: 18 },
        { kind: 'item', itemId: 'miracleGem', weight: 12 },
      ],
    },
    boss: {
      entries: [
        { kind: 'equipment', tier: 'celestial', weight: 60 },
        { kind: 'item', itemId: 'miracleGem', weight: 30 },
        { kind: 'gold', multiplier: 3, weight: 10 },
      ],
    },
  },
]

function findLevelRange(level: number): DropLevelRange | null {
  for (const range of DROP_TABLES) {
    if (level >= range.min && level <= range.max) {
      return range
    }
  }
  if (DROP_TABLES.length === 0) return null
  return DROP_TABLES[DROP_TABLES.length - 1] ?? null
}

export function getDropEntries(monster: Monster): DropEntry[] {
  const range = findLevelRange(monster.lv)
  if (!range) return []
  return monster.isBoss ? range.boss.entries : range.normal.entries
}

export function rollDropCount(monster: Monster, rng: () => number): number {
  if (monster.isBoss) {
    const roll = rng()
    if (roll < 0.6) return 1
    if (roll < 0.9) return 2
    return 3
  }
  return rng() < 0.3 ? 1 : 0
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
