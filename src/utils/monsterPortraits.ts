import { resolveAssetUrl } from '@/utils/assetUrls'

const portraitModules = import.meta.glob('@/assets/*.webp', {
  eager: true,
  import: 'default',
}) as Record<string, string>

type PortraitEntry = {
  path: string
  order: number
}

const autoPortraitMap: Record<string, PortraitEntry[]> = {}

const portraitFilePattern = /^(.+?)(?:-(\d+))?\.webp$/i

for (const specifier of Object.keys(portraitModules)) {
  const separatorIndex = specifier.indexOf('?', 1)
  const cleanedPath =
    separatorIndex > -1 ? specifier.slice(0, separatorIndex) : specifier
  const fileName = cleanedPath.split('/').pop()
  if (!fileName) continue

  const match = portraitFilePattern.exec(fileName)
  if (!match) continue

  const monsterId = match[1]
  if (!monsterId) continue

  const orderStr = match[2]

  const portraitList =
    autoPortraitMap[monsterId] ?? (autoPortraitMap[monsterId] = [])

  const order = orderStr ? Number.parseInt(orderStr, 10) : 0
  if (Number.isNaN(order)) continue

  const resolvedPath = resolveAssetUrl(fileName)
  if (resolvedPath) {
    portraitList.push({
      path: resolvedPath,
      order,
    })
  }
}

for (const entries of Object.values(autoPortraitMap)) {
  entries.sort((a, b) => a.order - b.order)
}

const autoPortraitCache = new Map<string, string[]>()

export function getAutoMonsterPortraits(monsterId: string): string[] {
  if (autoPortraitCache.has(monsterId)) {
    return autoPortraitCache.get(monsterId)!
  }

  const entries = autoPortraitMap[monsterId]
  if (!entries || entries.length === 0) {
    autoPortraitCache.set(monsterId, [])
    return []
  }

  const portraits = entries.map(entry => entry.path)
  autoPortraitCache.set(monsterId, portraits)
  return portraits
}
