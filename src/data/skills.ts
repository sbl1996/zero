import { dmgAttack, dmgCustom, dmgSkill, dmgUlt, getDefRefForRealm } from '@/composables/useDamage'
import { randRange } from '@/composables/useRng'
import type { Monster, SkillDefinition } from '@/types/domain'

function resolveMonsterDef(monster: Monster): number {
  if (monster.attributes?.totals.DEF !== undefined) return monster.attributes.totals.DEF
  return monster.def ?? 0
}

function resolveMonsterTough(monster: Monster): number {
  if (typeof monster.toughness === 'number') return monster.toughness
  if (typeof monster.tough === 'number') return monster.tough
  return monster.isBoss ? 1.5 : 1
}

function resolveMonsterLevel(monster: Monster): number {
  return monster.lv ?? 1
}

function resolveMonsterDefRef(monster: Monster): number | undefined {
  if (monster.realm) return getDefRefForRealm(monster.realm)
  return undefined
}

export const SKILLS: SkillDefinition[] = [
  {
    id: 'basic_strike',
    name: '随手一击',
    description: '基础单体斩击（倍率 100%）。',
    cost: { type: 'qi', amount: 3 },
    flash: 'attack',
    cooldown: 2,
    icon: '/skill-basic-strike.webp',
    execute: ({ stats, monster, rng }) => {
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const level = resolveMonsterLevel(monster)
      const result = dmgAttack(atk, def, randRange(rng, 0, 1), {
        defRef,
        contentLevel: defRef ? 0 : level,
        defenderTough: resolveMonsterTough(monster),
      })
      return { damage: result.damage, coreDamage: result.coreDamage }
    },
  },
  {
    id: 'charged_cleave',
    name: '蓄力劈砍',
    description: '蓄力斩击敌人（倍率 160%）。',
    cost: { type: 'qi', amount: 10 },
    flash: 'skill',
    cooldown: 2,
    icon: '/skill-charged-cleave.webp',
    execute: ({ stats, monster, rng }) => {
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const level = resolveMonsterLevel(monster)
      const result = dmgSkill(atk, def, randRange(rng, 0, 1), {
        defRef,
        contentLevel: defRef ? 0 : level,
        defenderTough: resolveMonsterTough(monster),
      })
      return { damage: result.damage, coreDamage: result.coreDamage }
    },
  },
  {
    id: 'destiny_slash',
    name: '命运斩击',
    description: '终极爆发斩击（倍率 350%）。',
    cost: { type: 'qi', amount: 20, percentOfQiMax: 0.2 },
    flash: 'ult',
    cooldown: 10,
    icon: '/skill-destiny-slash.webp',
    execute: ({ stats, monster, rng }) => {
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const level = resolveMonsterLevel(monster)
      const result = dmgUlt(atk, def, randRange(rng, 0, 1), {
        defRef,
        contentLevel: defRef ? 0 : level,
        defenderTough: resolveMonsterTough(monster),
      })
      return { damage: result.damage, coreDamage: result.coreDamage }
    },
  },
  {
    id: 'focus_breath',
    name: '气息调整',
    description: '半倍率斩击并回收斗气（倍率 50%）。',
    cost: { type: 'qi', amount: 5 },
    flash: 'attack',
    cooldown: 2,
    execute: ({ stats, monster, rng, resources }) => {
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const level = resolveMonsterLevel(monster)
      const result = dmgCustom(atk, def, 0.5, randRange(rng, 0, 1), {
        defRef,
        contentLevel: defRef ? 0 : level,
        defenderTough: resolveMonsterTough(monster),
      })
      const qiGain = Math.round(resources.qiMax * 0.03)
      return { damage: result.damage, coreDamage: result.coreDamage, gainQi: qiGain }
    },
  },
  {
    id: 'qi_dodge',
    name: '斗气闪避',
    description: '进入斗气闪避姿态，命中前 0.2s 判定闪避，成功则免疫伤害并返还 50% 消耗；发动后 0.4s 内不可使用技能与道具。',
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    cooldown: 0.7,
    icon: '/skill-qi-dodge.webp',
    tags: ['utility'],
    execute: () => ({})
  },
]


export const SKILL_MAP = new Map(SKILLS.map(skill => [skill.id, skill]))

export function getSkillDefinition(skillId: string | null | undefined) {
  if (!skillId) return null
  return SKILL_MAP.get(skillId) ?? null
}
