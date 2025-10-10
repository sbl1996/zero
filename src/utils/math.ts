export function clamp(value: number, min: number, max: number): number {
  if (value < min) return min
  if (value > max) return max
  return value
}

export function round(value: number, precision = 0): number {
  const factor = Math.pow(10, precision)
  return Math.round(value * factor) / factor
}

export function weightedRandom<T>(entries: Array<{ item: T; weight: number }>, rng: () => number): T {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0)
  let pick = rng() * total
  for (const entry of entries) {
    pick -= entry.weight
    if (pick <= 0) return entry.item
  }
  return entries[entries.length - 1]!.item
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}
