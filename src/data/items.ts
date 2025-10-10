import type { ItemDefinition } from '@/types/domain'
import { PRICES } from './constants'

export const ITEMS: ItemDefinition[] = [
  { id: 'potionHP', name: '生命药水', heal: 200, price: PRICES.potionHP, description: '回复200点生命值' },
  { id: 'potionSP', name: '技能药水', restoreSp: 50, price: PRICES.potionSP, description: '回复50点SP' },
  { id: 'potionXP', name: '必杀药水', restoreXp: 100, price: PRICES.potionXP, description: '回复100点XP' },
  { id: 'blessGem', name: '祝福宝石', price: PRICES.blessGem, usage: '装备1-5级强化耗材' },
  { id: 'soulGem', name: '灵魂宝石', price: PRICES.soulGem, usage: '装备6-10级强化耗材' },
  { id: 'miracleGem', name: '奇迹宝石', price: PRICES.miracleGem, usage: '装备11-15级强化耗材' },
]

export const consumableIds = new Set(['potionHP', 'potionSP', 'potionXP'])
