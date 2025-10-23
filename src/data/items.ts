import type { ItemDefinition } from '@/types/domain'
import { PRICES } from './constants'

export const ITEMS: ItemDefinition[] = [
  { id: 'potionHP', name: '生命药水Ⅰ', heal: 100, price: PRICES.potionHP, description: '回复100点生命值' },
  { id: 'potionQi', name: '斗气药水Ⅰ', restoreQi: 120, price: PRICES.potionQi, description: '回复120点斗气' },
  { id: 'potionQiPlus', name: '斗气药水Ⅱ', restoreQi: 240, price: PRICES.potionQiPlus, description: '回复240点斗气' },
  { id: 'breakScrollForce', name: '破境符（强压）', price: 800, breakthroughMethod: 'force', description: '尝试强行突破当前瓶颈' },
  { id: 'breakScrollTreasure', name: '破境符（至宝）', price: 1800, breakthroughMethod: 'treasure', description: '借助奇物突破当前瓶颈' },
  { id: 'blessGem', name: '祝福宝石', price: PRICES.blessGem, usage: '装备1-5级强化耗材' },
  { id: 'soulGem', name: '灵魂宝石', price: PRICES.soulGem, usage: '装备6-10级强化耗材' },
  { id: 'miracleGem', name: '奇迹宝石', price: PRICES.miracleGem, usage: '装备11-15级强化耗材' },
]

export const consumableIds = new Set(['potionHP', 'potionQi', 'potionQiPlus', 'breakScrollForce', 'breakScrollTreasure'])
export const quickConsumableIds = new Set(['potionHP', 'potionQi', 'potionQiPlus'])
