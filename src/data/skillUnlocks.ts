import type { CultivationMethodId } from '@/types/domain'
import { resolveMethodDodgeSkillId } from './dodgeSkills'

export type SkillUnlockKind = 'initial' | 'realm' | 'purchase'

export interface SkillUnlockDefinition {
  kind: SkillUnlockKind
  skillId?: string
  resolveSkillId?: (context: { methodId: CultivationMethodId | null | undefined }) => string
  methodId?: CultivationMethodId
  tier?: number
  price?: number
  requiredTier?: number
  courseId?: string
  unlockMessage?: string
}

export interface ResolvedUnlock {
  skillId: string
  unlockMessage?: string
}

export interface PurchaseCourseDefinition extends ResolvedUnlock {
  courseId: string
  price: number
  requiredTier: number
}

const UNLOCKS: SkillUnlockDefinition[] = [
  {
    kind: 'initial',
    methodId: 'dragon_blood',
    skillId: 'dragon_breath_slash',
  },
  {
    kind: 'realm',
    tier: 2,
    methodId: 'dragon_blood',
    skillId: 'dragon_shadow_dash',
  },
  {
    kind: 'realm',
    tier: 3,
    methodId: 'dragon_blood',
    skillId: 'fallen_dragon_smash',
  },
  {
    kind: 'realm',
    tier: 4,
    methodId: 'dragon_blood',
    skillId: 'star_realm_dragon_blood_break',
  },
  {
    kind: 'initial',
    methodId: 'tiger_stripe',
    skillId: 'rending_void_claw',
  },
  {
    kind: 'realm',
    tier: 2,
    methodId: 'tiger_stripe',
    skillId: 'tiger_shadow_step',
  },
  {
    kind: 'realm',
    tier: 3,
    methodId: 'tiger_stripe',
    skillId: 'phantom_instant_kill',
  },
  {
    kind: 'realm',
    tier: 4,
    methodId: 'tiger_stripe',
    skillId: 'white_tiger_massacre',
  },
  {
    kind: 'purchase',
    courseId: 'guild_dodge',
    resolveSkillId: ({ methodId }) => resolveMethodDodgeSkillId(methodId),
    price: 1000,
    requiredTier: 2,
    unlockMessage: '你习得了新的闪避技巧。',
  },
]

function matchesMethod(unlock: SkillUnlockDefinition, methodId: CultivationMethodId | null | undefined): boolean {
  if (!unlock.methodId) return true
  return unlock.methodId === methodId
}

function resolveSkillId(unlock: SkillUnlockDefinition, methodId: CultivationMethodId | null | undefined): string | null {
  if (typeof unlock.resolveSkillId === 'function') {
    return unlock.resolveSkillId({ methodId })
  }
  return unlock.skillId ?? null
}

function uniqueSkillIds(ids: string[]): string[] {
  return Array.from(new Set(ids.filter(Boolean)))
}

export function getInitialSkillIds(methodId: CultivationMethodId | null | undefined): string[] {
  const ids = UNLOCKS.filter(unlock => unlock.kind === 'initial' && matchesMethod(unlock, methodId))
    .map(unlock => resolveSkillId(unlock, methodId))
    .filter((id): id is string => Boolean(id))
  return uniqueSkillIds(ids)
}

export function getRealmUnlocks(
  tier: number | null | undefined,
  methodId: CultivationMethodId | null | undefined,
): ResolvedUnlock[] {
  if (!Number.isFinite(tier)) return []
  const t = tier as number
  const results: ResolvedUnlock[] = []
  UNLOCKS.forEach((unlock) => {
    if (unlock.kind !== 'realm') return
    if (!matchesMethod(unlock, methodId)) return
    if (!Number.isFinite(unlock.tier) || (unlock.tier as number) > t) return
    const skillId = resolveSkillId(unlock, methodId)
    if (!skillId) return
    results.push({ skillId, unlockMessage: unlock.unlockMessage })
  })
  return results
}

export function getPurchaseCourses(methodId: CultivationMethodId | null | undefined): PurchaseCourseDefinition[] {
  const courses: PurchaseCourseDefinition[] = []
  UNLOCKS.forEach((unlock) => {
    if (unlock.kind !== 'purchase') return
    if (!matchesMethod(unlock, methodId)) return
    const skillId = resolveSkillId(unlock, methodId)
    if (!skillId || !unlock.courseId || !Number.isFinite(unlock.price) || !Number.isFinite(unlock.requiredTier)) {
      return
    }
    courses.push({
      courseId: unlock.courseId,
      skillId,
      price: unlock.price as number,
      requiredTier: unlock.requiredTier as number,
      unlockMessage: unlock.unlockMessage,
    })
  })
  return courses
}
