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
