import type { RealmPhase, RealmStage, RealmTier } from '@/types/domain'

export type NumericRealmTier = Exclude<RealmTier, 'sanctuary'>
export type RealmSnapshot = Pick<RealmStage, 'tier' | 'phase'>
export type RealmLike = RealmStage | RealmSnapshot | RealmTier | null | undefined

export const REALM_TIER_LABELS: Record<NumericRealmTier | 'sanctuary', string> = {
  1: '一级',
  2: '二级',
  3: '三级',
  4: '四级',
  5: '五级',
  6: '六级',
  7: '七级',
  8: '八级',
  9: '九级',
  sanctuary: '圣域',
}

export const REALM_PHASE_LABELS: Record<RealmPhase, string> = {
  none: '',
  initial: '初阶',
  middle: '中阶',
  high: '高阶',
  peak: '巅峰',
  limit: '极限',
}

function isRealmSnapshot(value: RealmLike): value is RealmSnapshot {
  return Boolean(value && typeof value === 'object' && 'tier' in value)
}

export function resolveRealmTierValue(realm?: RealmLike): RealmTier | null {
  if (!realm) return null
  if (typeof realm === 'number' || realm === 'sanctuary') return realm
  if (isRealmSnapshot(realm)) {
    const tier = realm.tier
    if (typeof tier === 'number' || tier === 'sanctuary') return tier
  }
  return null
}

export function formatRealmTierLabel(tier?: RealmTier | null): string {
  if (!tier) return '未知'
  return REALM_TIER_LABELS[tier] ?? `${tier}`
}

export function formatRealmPhaseLabel(phase?: RealmPhase | null): string {
  if (!phase || phase === 'none') return ''
  return REALM_PHASE_LABELS[phase] ?? phase
}

export function formatRealmStageLabel(realm?: RealmLike): string {
  const tier = resolveRealmTierValue(realm)
  if (!tier) return '未知'
  const tierLabel = formatRealmTierLabel(tier)
  const phaseLabel = isRealmSnapshot(realm) ? formatRealmPhaseLabel(realm.phase) : ''
  return phaseLabel ? `${tierLabel}·${phaseLabel}` : tierLabel
}

export function realmTierIndex(tier?: RealmTier | null): number {
  if (tier === 'sanctuary') return 10
  if (typeof tier === 'number') return tier
  return 0
}

export function realmTierContentLevel(tier?: RealmTier | null): number {
  const index = realmTierIndex(tier)
  if (index <= 0) return 1
  return index * 10
}
