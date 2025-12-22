import { clamp } from '@/utils/math'

export interface RhythmScoreResult {
  normalizedScore: number
  totalRaw: number
  maxPossible: number
}

export interface NoteTiming {
  index: number
  startMs: number
  centerMs: number
  endMs: number
  durationBeats: number
}

export function beatMs(bpm: number): number {
  const safeBpm = bpm > 0 ? bpm : 60
  return 60000 / safeBpm
}

/**
 * 中心满分，中心向两侧 30%（可调）线性插值，超出记 0。
 */
export function scoreOffset(offsetMs: number, beatDurationMs: number, windowRatio: number): number {
  const windowMs = beatDurationMs * windowRatio
  const absOffset = Math.abs(offsetMs)
  if (absOffset > windowMs) return 0
  const score = 1 - absOffset / windowMs
  return clamp(score, 0, 1)
}

export function normalizeScore(totalRaw: number, maxPossible: number): number {
  if (maxPossible <= 0) return 0
  return clamp((totalRaw / maxPossible) * 100, 0, 100)
}

/**
 * 将节奏得分（0-100）转换为伤害倍率。
 * 规则：
 * - 0-90分：线性增长 (score / 90) -> 90分达 1.0x
 * - 90-100分：二次方增长 1.0 + 0.015 * (score - 90)^2 -> 满分达 2.5x
 */
export function computeRhythmDamageMultiplier(score: number): number {
  const s = clamp(score, 0, 100)
  if (s <= 90) {
    return s / 90
  } else {
    return 1.0 + 0.015 * Math.pow(s - 90, 2)
  }
}

export function resolveNoteDurationBeats(durationBeats?: number): number {
  if (!durationBeats || durationBeats <= 0) return 1
  return durationBeats
}

export function buildNoteTimings(
  notes: { durationBeats?: number }[],
  leadInBeats: number,
  bpm: number,
): NoteTiming[] {
  const beatDuration = beatMs(bpm)
  const timings: NoteTiming[] = []
  let cursorMs = Math.max(leadInBeats, 0) * beatDuration
  notes.forEach((note, idx) => {
    const durationBeats = resolveNoteDurationBeats(note.durationBeats)
    const durationMs = durationBeats * beatDuration
    const startMs = cursorMs
    const centerMs = startMs + durationMs / 2
    const endMs = startMs + durationMs
    timings.push({ index: idx, startMs, centerMs, endMs, durationBeats })
    cursorMs = endMs
  })
  return timings
}
