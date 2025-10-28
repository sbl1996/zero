const assetModules = import.meta.glob<string>('@/assets/**/*.webp', {
  eager: true,
  import: 'default',
})

const assetUrlMap = new Map<string, string>()

for (const [modulePath, url] of Object.entries(assetModules)) {
  const fileName = modulePath.split('/').pop()
  if (!fileName) continue
  assetUrlMap.set(fileName.toLowerCase(), url)
}

function normalizeFilename(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const withoutPrefix = trimmed.startsWith('/')
    ? trimmed.slice(1)
    : trimmed
  return withoutPrefix.toLowerCase()
}

export function resolveAssetUrl(input: string): string {
  if (typeof input !== 'string') return ''
  const trimmed = input.trim()
  if (!trimmed) return ''

  if (/^[a-z]+:\/\//i.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed
  }

  if (trimmed.startsWith('/assets/')) {
    return trimmed
  }

  if (trimmed.startsWith('assets/')) {
    return `/${trimmed}`
  }

  const normalized = normalizeFilename(trimmed)
  if (!normalized) return ''

  if (normalized.startsWith('assets/')) {
    return `/${normalized}`
  }

  const resolved = assetUrlMap.get(normalized)
  if (resolved) {
    return resolved
  }

  // Fall back to root-relative path so existing references keep working in dev.
  return `/${normalized}`
}

export function resolveAssetUrls(inputs: readonly string[]): string[] {
  return inputs.map(resolveAssetUrl).filter((value) => value.length > 0)
}
