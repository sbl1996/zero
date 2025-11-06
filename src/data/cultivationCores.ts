export interface CoreShardConfig {
  tier: number
  id: string
  name: string
  bonusPerSecond: number
  durationMs: number
  price: number
  description: string
}

import { numberToChinese } from '../utils/format'

export const CORE_SHARD_BASE_ID = 'coreShardTier'
export const CORE_SHARD_DURATION_MS = 10_000
export const CORE_SHARD_BASE_BONUS = 1
export const CORE_SHARD_BASE_PRICE = 100

function computeBonusPerSecond(tier: number): number {
  const baseTier = Math.max(1, Math.floor(tier))
  return CORE_SHARD_BASE_BONUS * Math.pow(2, baseTier - 1)
}

function computePrice(tier: number): number {
  const baseTier = Math.max(1, Math.floor(tier))
  return CORE_SHARD_BASE_PRICE * Math.pow(2, baseTier - 1)
}

function createName(tier: number): string {
  return `${numberToChinese(tier)}级晶核`
}

function createDescription(bonus: number): string {
  return `冥想时额外 +${bonus.toFixed(1)} BP/s，持续 10 秒。`
}

function createCoreShardConfig(tier: number): CoreShardConfig {
  const bonus = computeBonusPerSecond(tier)
  return {
    tier,
    id: `${CORE_SHARD_BASE_ID}${tier}`,
    name: createName(tier),
    bonusPerSecond: bonus,
    durationMs: CORE_SHARD_DURATION_MS,
    price: computePrice(tier),
    description: createDescription(bonus),
  }
}

export const CORE_SHARD_CONFIGS: CoreShardConfig[] = Array.from({ length: 9 }, (_, index) =>
  createCoreShardConfig(index + 1),
)

export function getCoreShardConfig(tier: number): CoreShardConfig | undefined {
  return CORE_SHARD_CONFIGS.find(config => config.tier === tier)
}
