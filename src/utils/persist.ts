const SAVE_KEY = 'zero.save'

function storage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch (error) {
    console.warn('[persist] localStorage unavailable', error)
    return null
  }
}

function clone<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value)
  }
  return JSON.parse(JSON.stringify(value))
}

export function load<T>(fallback: T): T {
  const store = storage()
  if (!store) return clone(fallback)
  try {
    const raw = store.getItem(SAVE_KEY)
    if (!raw) return clone(fallback)
    const parsed = JSON.parse(raw)
    if (fallback === null || typeof fallback !== 'object') {
      return parsed as T
    }
    return { ...clone(fallback), ...parsed }
  } catch (error) {
    console.warn('[persist] load failed', error)
    return clone(fallback)
  }
}

export function save<T extends object>(data: T): void {
  const store = storage()
  if (!store) return
  try {
    store.setItem(SAVE_KEY, JSON.stringify(data))
  } catch (error) {
    console.warn('[persist] save failed', error)
  }
}

export function clear(): void {
  storage()?.removeItem(SAVE_KEY)
}
