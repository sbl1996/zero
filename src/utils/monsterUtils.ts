import { formatRealmTierLabel } from '@/utils/realm'
import type { Monster } from '@/types/domain'
import { numberToChinese } from './format'

/**
 * 格式化怪物奖励显示
 * @param monster 怪物对象
 * @returns 格式化后的奖励字符串
 */
export function formatMonsterRewards(monster: Monster | null | undefined): string {
  if (!monster) return ''
  const rewards = monster.rewards
  const parts: string[] = []
  if (rewards.coreDrop && rewards.coreDrop.tier > 0) {
    parts.push(`晶核 ${numberToChinese(rewards.coreDrop.tier)}级`)
  }
  parts.push(`GOLD ${rewards.gold}`)
  return parts.join(' ・ ')
}

/**
 * 描述怪物境界等级
 * @param monster 怪物对象
 * @returns 境界描述字符串
 */
export function describeMonsterRealm(monster: Monster | null | undefined): string {
  if (!monster?.realmTier) return '未知'
  return formatRealmTierLabel(monster.realmTier)
}