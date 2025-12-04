import type { CultivationMethodId } from '@/types/domain'

export const DEFAULT_DODGE_SKILL_ID = 'qi_dodge'

const METHOD_DODGE_SKILL: Partial<Record<CultivationMethodId, string>> = {
  dragon_blood: 'dragon_shadow_dash',
  tiger_stripe: 'tiger_shadow_step',
}

export function resolveMethodDodgeSkillId(methodId: CultivationMethodId | null | undefined): string {
  if (!methodId) return DEFAULT_DODGE_SKILL_ID
  return METHOD_DODGE_SKILL[methodId] ?? DEFAULT_DODGE_SKILL_ID
}

export function listDodgeSkillIds(): string[] {
  const ids = new Set<string>([DEFAULT_DODGE_SKILL_ID])
  Object.values(METHOD_DODGE_SKILL).forEach((id) => {
    if (id) ids.add(id)
  })
  return Array.from(ids)
}
