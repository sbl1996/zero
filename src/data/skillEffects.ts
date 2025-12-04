export type SkillEffectDefinition = {
  skillId: string
  assetKey: string
  durationMs: number
  className?: string
}

const SKILL_EFFECTS: Record<string, SkillEffectDefinition> = {
  dragon_breath_slash: {
    skillId: 'dragon_breath_slash',
    assetKey: 'skill-dragon-breath-slash-anime.webp',
    durationMs: 1200,
    className: 'skill-effect--dragon_breath_slash',
  },
  fallen_dragon_smash: {
    skillId: 'fallen_dragon_smash',
    assetKey: 'skill-fallen-dragon-smash-anime.webp',
    durationMs: 1200,
    className: 'skill-effect--fallen_dragon_smash',
  },
  star_realm_dragon_blood_break: {
    skillId: 'star_realm_dragon_blood_break',
    assetKey: 'skill-star-realm-dragon-blood-break-anime.webp',
    durationMs: 1200,
    className: 'skill-effect--star_realm_dragon_blood_break',
  },
}

export function getSkillEffectDefinition(skillId: string): SkillEffectDefinition | null {
  return SKILL_EFFECTS[skillId] ?? null
}
