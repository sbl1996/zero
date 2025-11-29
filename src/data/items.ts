import type { ItemDefinition, ItemIconDefinition } from '@/types/domain'
import { CORE_SHARD_CONFIGS } from '@/data/cultivationCores'
import { resolveAssetUrl } from '@/utils/assetUrls'

function imageIcon(filename: string): ItemIconDefinition {
  return {
    type: 'image',
    src: resolveAssetUrl(filename),
  }
}

function textIcon(text: string): ItemIconDefinition {
  return { type: 'text', text }
}

const baseItems: ItemDefinition[] = [
  {
    id: 'teleportStone',
    name: '传送石',
    description: '可瞬间传送回翡冷翠',
    price: 0,
    consumedOnUse: false,
    teleportToMapId: 'florence',
    useDurationMs: 0,
    icon: imageIcon('item-teleport-stone.webp'),
  },
  {
    id: 'potionHP',
    name: '生命药水Ⅰ',
    heal: 100,
    price: 50,
    description: '回复100点生命',
    useDurationMs: 1000,
    icon: imageIcon('item-potion-hp-1.webp'),
  },
  {
    id: 'potionQi',
    name: '斗气药水Ⅰ',
    restoreQi: 30,
    price: 120,
    description: '回复30点斗气',
    useDurationMs: 1000,
    icon: imageIcon('item-potion-sp-1.webp'),
  },
  {
    id: 'potionQiPlus',
    name: '斗气药水Ⅱ',
    restoreQi: 60,
    price: 240,
    description: '回复60点斗气',
    useDurationMs: 1000,
    icon: imageIcon('item-potion-xp-1.webp'),
  },
  { id: 'blessGem', name: '祝福宝石', price: 1000, usage: '装备1-5级强化耗材', icon: textIcon('💎') },
  { id: 'soulGem', name: '灵魂宝石', price: 2000, usage: '装备6-10级强化耗材', icon: textIcon('💗') },
  { id: 'miracleGem', name: '奇迹宝石', price: 5000, usage: '装备11-15级强化耗材', icon: textIcon('💧') },
  { id: 'goldenFleece', name: '金羊毛', price: 500, usage: '黄金绵羊的稀有材料', icon: textIcon('🧶') },
]

const coreShardItems: ItemDefinition[] = CORE_SHARD_CONFIGS.map((config) => ({
  id: config.id,
  name: config.name,
  description: config.description,
  price: config.price,
  coreShardTier: config.tier,
  meditationBoost: {
    bonusPerSecond: config.bonusPerSecond,
    durationMs: config.durationMs,
  },
}))

export const ITEMS: ItemDefinition[] = [...baseItems, ...coreShardItems]

export function getItemDefinition(itemId: string): ItemDefinition | undefined {
  return ITEMS.find((item) => item.id === itemId)
}

export function isItemConsumedOnUse(def: ItemDefinition | undefined): boolean {
  if (!def) return true
  return def.consumedOnUse !== false
}

export function isTeleportItem(def: ItemDefinition | undefined): def is ItemDefinition & { teleportToMapId: string } {
  return Boolean(def && 'teleportToMapId' in def && def.teleportToMapId)
}

type ItemEffectTextOptions = {
  mapNameLookup?: Map<string, string>
}

export function getItemEffectSegments(def: ItemDefinition | undefined, options: ItemEffectTextOptions = {}) {
  if (!def) return []
  const effects: string[] = []
  if ('heal' in def && def.heal) {
    effects.push(`生命+${def.heal}`)
  }
  if ('restoreQi' in def && def.restoreQi) {
    effects.push(`斗气+${def.restoreQi}`)
  }
  if (isTeleportItem(def) && def.teleportToMapId) {
    const mapName = options.mapNameLookup?.get(def.teleportToMapId) ?? def.teleportToMapId
    effects.push(`传送：${mapName}`)
  }
  return effects
}

export function getItemEffectText(def: ItemDefinition | undefined, options: ItemEffectTextOptions = {}) {
  return getItemEffectSegments(def, options).join(' ')
}

export const consumableIds = new Set([
  'teleportStone',
  'potionHP',
  'potionQi',
  'potionQiPlus',
])
export const quickConsumableIds = new Set(['teleportStone', 'potionHP', 'potionQi', 'potionQiPlus'])
