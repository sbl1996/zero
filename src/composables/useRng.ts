export function makeRng(seed: number) {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const randRange = (rng: () => number, min: number, max: number) => min + (max - min) * rng()

export const randBool = (rng: () => number, chance: number) => rng() < chance

export const randInt = (rng: () => number, min: number, max: number) => Math.floor(randRange(rng, min, max + 1))
