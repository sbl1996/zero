import { dmgAttack, dmgSkill, dmgUlt, getDefRefForRealm, resolveWeaknessDamage } from '@/composables/useDamage'
import { randRange } from '@/composables/useRng'
import { resolveAssetUrl } from '@/utils/assetUrls'
import type { Monster, SkillDefinition, SkillResult } from '@/types/domain'
import skillMetadata from './skill-metadata.json'

type SkillMetadata = {
  id: string
  name: string
  description: string
}

const SKILL_METADATA = new Map((skillMetadata as SkillMetadata[]).map(meta => [meta.id, meta]))

function getSkillMeta(id: string): SkillMetadata {
  const meta = SKILL_METADATA.get(id)
  if (!meta) {
    throw new Error(`Missing skill metadata for ${id}`)
  }
  return meta
}

function resolveMonsterDef(monster: Monster): number {
  return monster.stats.DEF
}

function resolveMonsterTough(monster: Monster): number {
  return monster.toughness
}

function resolveMonsterDefRef(monster: Monster): number {
  return getDefRefForRealm(monster.realmTier)
}

function resolveMonsterAgi(monster: Monster): number {
  return monster.stats.AGI
}

function resolveSkillIcon(skillId: string): string {
  return resolveAssetUrl(`skill-${skillId.replace(/_/g, '-')}.webp`)
}

const META_DRAGON_BREATH = getSkillMeta('dragon_breath_slash')
const META_FALLEN_DRAGON = getSkillMeta('fallen_dragon_smash')
const META_STAR_REALM = getSkillMeta('star_realm_dragon_blood_break')
const META_QI_DODGE = getSkillMeta('qi_dodge')

export const SKILLS: SkillDefinition[] = [
  {
    id: META_DRAGON_BREATH.id,
    name: META_DRAGON_BREATH.name,
    description: META_DRAGON_BREATH.description,
    cost: { type: 'qi', percentOfQiMax: 0.02 },
    flash: 'attack',
    cooldown: 2,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_DRAGON_BREATH.id),
    maxLevel: 10,
    getCooldown: (level) => {
      const l = Math.max(level, 1)
      const reduction = 0.02 * (l - 1)
      const multiplier = Math.max(0.2, 1 - reduction)
      return Math.max(0.5, 2 * multiplier)
    },
    getCostMultiplier: (level) => (level >= 6 ? 0.8 : 1),
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageScale = 1 + 0.02 * (level - 1)
      const weaknessBonus = level >= 3 ? 0.05 : 0
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const result = dmgAttack(atk, def, randRange(rng, 0, 1), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)
      const baseDamage = Math.max(result.damage * damageScale, 0)
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const coreBase = Math.max(result.coreDamage * damageScale, 0)
      let coreDamage = Math.round(weakness.triggered ? coreBase * 1.5 : coreBase)
      let totalDamage = Math.round(weakness.damage)
      if (weakness.triggered && weaknessBonus > 0) {
        const mult = 1 + weaknessBonus
        totalDamage = Math.round(totalDamage * mult)
        coreDamage = Math.round(coreDamage * mult)
      }
      const hit = totalDamage > 0
      const cooldownBonus = level >= 10 && hit
        ? {
            targetSkillId: 'fallen_dragon_smash',
            reductionPercent: 0.25,
            durationMs: 2000,
          }
        : undefined
      return { damage: totalDamage, coreDamage, weaknessTriggered: weakness.triggered, hit, cooldownBonus }
    },
  },
  {
    id: META_FALLEN_DRAGON.id,
    name: META_FALLEN_DRAGON.name,
    description: META_FALLEN_DRAGON.description,
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'skill',
    cooldown: 5,
    chargeTime: 0.2,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_FALLEN_DRAGON.id),
    maxLevel: 10,
    getCooldown: (level) => {
      const l = Math.max(level, 1)
      const reduction = 0.02 * (l - 1)
      const multiplier = Math.max(0.2, 1 - reduction)
      return Math.max(1, 5 * multiplier)
    },
    getCostMultiplier: (level) => (level >= 6 ? 0.8 : 1),
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageScale = 1 + 0.04 * (level - 1)
      const weaknessBonus = level >= 3 ? 0.10 : 0
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const result = dmgSkill(atk, def, randRange(rng, 0, 1), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)
      const baseDamage = Math.max(result.damage * damageScale, 0)
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const coreBase = Math.max(result.coreDamage * damageScale, 0)
      let coreDamage = Math.round(weakness.triggered ? coreBase * 1.5 : coreBase)
      let totalDamage = Math.round(weakness.damage)
      if (weakness.triggered && weaknessBonus > 0) {
        const mult = 1 + weaknessBonus
        totalDamage = Math.round(totalDamage * mult)
        coreDamage = Math.round(coreDamage * mult)
      }
      const hit = totalDamage > 0
      return { damage: totalDamage, coreDamage, weaknessTriggered: weakness.triggered, hit }
    },
  },
  {
    id: META_STAR_REALM.id,
    name: META_STAR_REALM.name,
    description: META_STAR_REALM.description,
    cost: { type: 'qi', percentOfQiMax: 0.1 },
    flash: 'ult',
    cooldown: 20,
    chargeTime: 0.5,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_STAR_REALM.id),
    maxLevel: 10,
    getCooldown: (level) => {
      const l = Math.max(level, 1)
      const reduction = 0.02 * (l - 1)
      const multiplier = Math.max(0.2, 1 - reduction)
      return Math.max(5, 20 * multiplier)
    },
    getCostMultiplier: (level) => (level >= 6 ? 0.8 : 1),
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageScale = 1 + 0.08 * (level - 1)
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const result = dmgUlt(atk, def, randRange(rng, 0, 1), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)
      const baseDamage = Math.max(result.damage * damageScale, 0)
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const coreBase = Math.max(result.coreDamage * damageScale, 0)
      let coreDamage = Math.round(weakness.triggered ? coreBase * 1.5 : coreBase)
      const totalDamage = Math.round(weakness.damage)
      const hit = totalDamage > 0
      let applyVulnerability: SkillResult['applyVulnerability'] = undefined
      if (level >= 10 && hit) {
        const roll = randRange(rng, 0, 1)
        if (roll <= 0.5) {
          applyVulnerability = {
            percent: 0.10,
            durationMs: 10000,
          }
        }
      }
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        superArmorMs: level >= 3 ? 500 : undefined,
        applyVulnerability,
      }
    },
  },
  {
    id: META_QI_DODGE.id,
    name: META_QI_DODGE.name,
    description: META_QI_DODGE.description,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    cooldown: 0.7,
    aftercastTime: 0.3,
    icon: resolveSkillIcon(META_QI_DODGE.id),
    tags: ['utility'],
    maxLevel: 1,
    execute: () => ({ hit: false }),
  },
]


export const SKILL_MAP = new Map(SKILLS.map(skill => [skill.id, skill]))

export function getSkillDefinition(skillId: string | null | undefined) {
  if (!skillId) return null
  return SKILL_MAP.get(skillId) ?? null
}
