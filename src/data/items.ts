import type { ItemDefinition } from '@/types/domain'
import { CORE_SHARD_CONFIGS } from './cultivationCores'

const baseItems: ItemDefinition[] = [
  { id: 'potionHP', name: '生命药水Ⅰ', heal: 100, price: 50, description: '回复100点生命值', useDurationMs: 1000 },
  { id: 'potionQi', name: '斗气药水Ⅰ', restoreQi: 100, price: 120, description: '回复100点斗气', useDurationMs: 1000 },
  { id: 'potionQiPlus', name: '斗气药水Ⅱ', restoreQi: 200, price: 240, description: '回复200点斗气', useDurationMs: 1000 },
  { id: 'breakScrollTreasure', name: '破境符（至宝）', price: 1800, breakthroughMethod: 'treasure', description: '借助奇物突破当前瓶颈' },
  { id: 'blessGem', name: '祝福宝石', price: 1000, usage: '装备1-5级强化耗材' },
  { id: 'soulGem', name: '灵魂宝石', price: 2000, usage: '装备6-10级强化耗材' },
  { id: 'miracleGem', name: '奇迹宝石', price: 5000, usage: '装备11-15级强化耗材' },
]

const coreShardItems: ItemDefinition[] = CORE_SHARD_CONFIGS.map(config => ({
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

export const coreShardIds = new Set(coreShardItems.map(item => item.id))

export const consumableIds = new Set([
  'potionHP',
  'potionQi',
  'potionQiPlus',
  'breakScrollTreasure',
  ...Array.from(coreShardIds),
])
export const quickConsumableIds = new Set(['potionHP', 'potionQi', 'potionQiPlus'])
