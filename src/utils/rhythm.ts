import { clamp } from '@/utils/math'

export interface RhythmScoreResult {
  normalizedScore: number
  totalRaw: number
  maxPossible: number
}

/**
 * 中心满分，中心向两侧 30%（可调）线性插值，超出记 0。
 */
export function scoreOffset(offsetMs: number, intervalMs: number, windowRatio: number): number {
  const windowMs = intervalMs * windowRatio
  const absOffset = Math.abs(offsetMs)
  if (absOffset > windowMs) return 0
  const score = 1 - absOffset / windowMs
  return clamp(score, 0, 1)
}

export function normalizeScore(totalRaw: number, maxPossible: number): number {
  if (maxPossible <= 0) return 0
  return clamp((totalRaw / maxPossible) * 100, 0, 100)
}
