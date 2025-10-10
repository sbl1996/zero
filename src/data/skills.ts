import { dmgAttack, dmgCustom, dmgSkill, dmgUlt } from '@/composables/useDamage'
import { randRange } from '@/composables/useRng'
import type { SkillDefinition } from '@/types/domain'

export const SKILLS: SkillDefinition[] = [
  {
    id: 'basic_strike',
    name: '随手一击',
    description: '基础单体斩击（倍率 100%）。',
    cost: { type: 'none' },
    flash: 'attack',
    execute: ({ stats, monster, rng }) => {
      const dmg = dmgAttack(stats.ATK, monster.def, randRange(rng, 0, 1))
      return { damage: dmg }
    },
  },
  {
    id: 'charged_cleave',
    name: '蓄力劈砍',
    description: '蓄力斩击敌人（倍率 115%-135%）。',
    cost: { type: 'sp', amount: 15 },
    flash: 'skill',
    execute: ({ stats, monster, rng }) => {
      const dmg = dmgSkill(stats.ATK, monster.def, randRange(rng, 0, 1), randRange(rng, 0, 1))
      return { damage: dmg }
    },
  },
  {
    id: 'destiny_slash',
    name: '命运斩击',
    description: '终极爆发斩击（倍率 200%-250%）。',
    cost: { type: 'xp', amount: 30 },
    flash: 'ult',
    execute: ({ stats, monster, rng }) => {
      const dmg = dmgUlt(stats.ATK, monster.def, randRange(rng, 0, 1), randRange(rng, 0, 1))
      return { damage: dmg }
    },
  },
  {
    id: 'focus_breath',
    name: '气息调整',
    description: '半倍率斩击并恢复 SP +10（倍率 50%）。',
    cost: { type: 'none' },
    flash: 'attack',
    execute: ({ stats, monster, rng }) => {
      const dmg = dmgCustom(stats.ATK, monster.def, 0.5, randRange(rng, 0, 1))
      return { damage: dmg, gainSp: 10 }
    },
  },
]

export const SKILL_MAP = new Map(SKILLS.map(skill => [skill.id, skill]))

export function getSkillDefinition(skillId: string | null | undefined) {
  if (!skillId) return null
  return SKILL_MAP.get(skillId) ?? null
}
