import { dmgAttack, dmgSkill, dmgUlt, getDefRefForRealm, resolveWeaknessDamage } from '@/composables/useDamage'
import { randRange } from '@/composables/useRng'
import { resolveAssetUrl } from '@/utils/assetUrls'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
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

function resolvePerLevelCooldown(base: number, level: number, minimum: number): number {
  const l = Math.max(level ?? 1, 1)
  const multiplier = Math.max(0.2, 1 - 0.02 * l)
  return Math.max(minimum, base * multiplier)
}

const META_DRAGON_BREATH = getSkillMeta('dragon_breath_slash')
const META_FALLEN_DRAGON = getSkillMeta('fallen_dragon_smash')
const META_STAR_REALM = getSkillMeta('star_realm_dragon_blood_break')
const META_DRAGON_SHADOW_DASH = getSkillMeta('dragon_shadow_dash')
const META_TIGER_SHADOW_STEP = getSkillMeta('tiger_shadow_step')
const META_QI_DODGE = getSkillMeta('qi_dodge')
const META_RENDING_VOID_CLAW = getSkillMeta('rending_void_claw')
const META_PHANTOM_INSTANT_KILL = getSkillMeta('phantom_instant_kill')
const META_WHITE_TIGER_MASSACRE = getSkillMeta('white_tiger_massacre')

const DRAGON_BREATH_BASE_MULTIPLIER = 1
const DRAGON_BREATH_PER_LEVEL = 0.02
const FALLEN_DRAGON_BASE_MULTIPLIER = 1.6
const FALLEN_DRAGON_PER_LEVEL = 0.04
const STAR_REALM_BASE_MULTIPLIER = 4.5
const STAR_REALM_PER_LEVEL = 0.15
const RENDING_VOID_BASE_MULTIPLIER = 0.75
const RENDING_VOID_PER_LEVEL = 0.03
const PHANTOM_KILL_BASE_MULTIPLIER = 2.2
const PHANTOM_KILL_PER_LEVEL = 0.05
const WHITE_TIGER_MASSACRE_BASE_MULTIPLIER = 5.2
const WHITE_TIGER_MASSACRE_PER_LEVEL = 0.18
const WHITE_TIGER_STACK_SKILL_BONUS = 0.03

function resolveDamageMultiplier(base: number, perLevelIncrease: number, level: number): number {
  const lvl = Math.max(level, 1)
  return base + perLevelIncrease * lvl
}

function formatMultiplier(multiplier: number): string {
  const percent = multiplier * 100
  const rounded = Math.round(percent * 10) / 10
  return Number.isInteger(rounded) ? `${Math.round(rounded)}%` : `${rounded.toFixed(1)}%`
}

function describeDragonBreath(level: number): string {
  const multiplier = formatMultiplier(resolveDamageMultiplier(DRAGON_BREATH_BASE_MULTIPLIER, DRAGON_BREATH_PER_LEVEL, level))
  const segments = [`基础单体斩击（倍率 ${multiplier}），包含 0.2s 后摇。`]
  if (level >= 3) {
    segments.push('弱点击破时额外造成 5% 总伤害。')
  }
  if (level >= 10) {
    segments.push('Lv.10：命中后使《陨龙击》冷却缩短 25%，持续 2 秒。')
  }
  return segments.join(' ')
}

function describeFallenDragon(level: number): string {
  const multiplier = formatMultiplier(resolveDamageMultiplier(FALLEN_DRAGON_BASE_MULTIPLIER, FALLEN_DRAGON_PER_LEVEL, level))
  const segments = [`蓄力 0.2s 后施放的重击（倍率 ${multiplier}），包含 0.2s 后摇。`]
  if (level >= 3) {
    segments.push('弱点击破时额外造成 10% 总伤害。')
  }
  return segments.join(' ')
}

function describeStarRealm(level: number): string {
  const multiplier = formatMultiplier(resolveDamageMultiplier(STAR_REALM_BASE_MULTIPLIER, STAR_REALM_PER_LEVEL, level))
  const segments = [`蓄力0.5s的终极爆发斩击（倍率 ${multiplier}），包含0.2s后摇。`]
  segments.push('施放时获得0.5s霸体（免疫伤害）。')
  segments.push('命中时使目标受到10%易伤，持续8秒。')
  return segments.join(' ')
}

function describeRendingVoidClaw(level: number): string {
  const multiplier = formatMultiplier(
    resolveDamageMultiplier(RENDING_VOID_BASE_MULTIPLIER, RENDING_VOID_PER_LEVEL, level),
  )
  const segments = [`迅捷撕裂攻击（倍率 ${multiplier}），包含0.15s后摇。`]
  if (level >= 3) {
    segments.push('弱点击破时返还 0.5% 斗气上限。')
  }
  if (level >= 6) {
    segments.push('命中后 3 秒内敏捷提升 10%。')
  }
  if (level >= 10) {
    segments.push('【虎煞】层数 ≥ 8 时，会追加一次 50% 倍率的额外伤害。')
  }
  return segments.join(' ')
}

function describePhantomInstantKill(level: number): string {
  const multiplier = formatMultiplier(
    resolveDamageMultiplier(PHANTOM_KILL_BASE_MULTIPLIER, PHANTOM_KILL_PER_LEVEL, level),
  )
  const segments = [`瞬息突进刺杀（倍率 ${multiplier}），施放后 0.2s 内处于【绝影】状态（不可被选中，免疫所有伤害），结束后再对敌方造成伤害，包含0.4s后摇。`]
  return segments.join(' ')
}

function describeWhiteTigerMassacre(level: number): string {
  const multiplier = formatMultiplier(
    resolveDamageMultiplier(WHITE_TIGER_MASSACRE_BASE_MULTIPLIER, WHITE_TIGER_MASSACRE_PER_LEVEL, level),
  )
  const segments = [`蓄力0.8s的终极爆发斩击（倍率 ${multiplier}），包含0.5s后摇。`]
  segments.push('若施放时【虎煞】层数为 0，则直接获得 3 层【虎煞】。若已有【虎煞】，本次伤害每层额外提升 3%。')
  return segments.join(' ')
}

export const SKILLS: SkillDefinition[] = [
  {
    id: META_DRAGON_SHADOW_DASH.id,
    name: META_DRAGON_SHADOW_DASH.name,
    description: META_DRAGON_SHADOW_DASH.description,
    cooldown: 0.7,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'attack',
    aftercastTime: 0.3,
    icon: resolveSkillIcon(META_DRAGON_SHADOW_DASH.id),
    tags: ['utility', 'dodge'],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.04,
      successText: '龙影闪!',
    },
    getCooldown: () => 0.7,
    execute: () => ({ hit: false }),
  },
  {
    id: META_DRAGON_BREATH.id,
    name: META_DRAGON_BREATH.name,
    description: describeDragonBreath(1),
    cooldown: 2,
    cost: { type: 'qi', percentOfQiMax: 0.02 },
    flash: 'attack',
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_DRAGON_BREATH.id),
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(2, level, 0.5),
    getCostMultiplier: (level) => (level >= 6 ? 0.8 : 1),
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(DRAGON_BREATH_BASE_MULTIPLIER, DRAGON_BREATH_PER_LEVEL, level),
    getDescription: describeDragonBreath,
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        DRAGON_BREATH_BASE_MULTIPLIER,
        DRAGON_BREATH_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / DRAGON_BREATH_BASE_MULTIPLIER
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
    description: describeFallenDragon(1),
    cooldown: 5,
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'attack',
    chargeTime: 0.2,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_FALLEN_DRAGON.id),
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(5, level, 1),
    getCostMultiplier: (_level) => 1.0,
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(FALLEN_DRAGON_BASE_MULTIPLIER, FALLEN_DRAGON_PER_LEVEL, level),
    getDescription: describeFallenDragon,
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        FALLEN_DRAGON_BASE_MULTIPLIER,
        FALLEN_DRAGON_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / FALLEN_DRAGON_BASE_MULTIPLIER
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
      const hit = totalDamage > 0
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        monsterStunMs: 100,
      }
    },
  },
  {
    id: META_STAR_REALM.id,
    name: META_STAR_REALM.name,
    description: describeStarRealm(1),
    cooldown: 16,
    cost: { type: 'qi', percentOfQiMax: 0.1 },
    flash: 'attack',
    chargeTime: 0.5,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_STAR_REALM.id),
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(16, level, 5),
    getCostMultiplier: (_level) => 1.0,
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(STAR_REALM_BASE_MULTIPLIER, STAR_REALM_PER_LEVEL, level),
    getDescription: describeStarRealm,
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        STAR_REALM_BASE_MULTIPLIER,
        STAR_REALM_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / STAR_REALM_BASE_MULTIPLIER
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
      if (hit) {
        applyVulnerability = {
          percent: 0.10,
          durationMs: 8000,
        }
      }
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        superArmorMs: 500,
        applyVulnerability,
      }
    },
  },
  {
    id: META_TIGER_SHADOW_STEP.id,
    name: META_TIGER_SHADOW_STEP.name,
    description: META_TIGER_SHADOW_STEP.description,
    cooldown: 0.6,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_TIGER_SHADOW_STEP.id),
    tags: ['utility', 'dodge'],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.04,
      successText: '虎影步!',
    },
    getCooldown: () => 0.6,
    execute: () => ({ hit: false }),
  },
  {
    id: META_RENDING_VOID_CLAW.id,
    name: META_RENDING_VOID_CLAW.name,
    description: describeRendingVoidClaw(1),
    cooldown: 1.2,
    cost: { type: 'qi', percentOfQiMax: 0.015 },
    flash: 'attack',
    aftercastTime: 0.15,
    icon: resolveSkillIcon(META_RENDING_VOID_CLAW.id),
    maxLevel: 10,
    getCooldown: () => 1.2,
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(RENDING_VOID_BASE_MULTIPLIER, RENDING_VOID_PER_LEVEL, level),
    getDescription: describeRendingVoidClaw,
    execute: ({ stats, monster, rng, resources, progress, battle }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        RENDING_VOID_BASE_MULTIPLIER,
        RENDING_VOID_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / RENDING_VOID_BASE_MULTIPLIER
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
      const baseCore = Math.max(result.coreDamage * damageScale, 0)
      let coreDamage = Math.round(weakness.triggered ? baseCore * 1.5 : baseCore)
      let totalDamage = Math.round(weakness.damage)
      let weaknessTriggered = weakness.triggered
      let bonusGainQi = 0
      if (level >= 3 && weaknessTriggered) {
        bonusGainQi = Math.max(resources.qiMax * 0.005, 0)
      }

      const tigerFuryStacks = battle?.tigerFuryStacks ?? 0
      if (level >= 10 && tigerFuryStacks >= 8 && totalDamage > 0) {
        const extraBaseDamage = Math.max(result.damage * damageScale * 0.5, 0)
        const extraWeakness = resolveWeaknessDamage(extraBaseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
        const extraCoreBase = Math.max(result.coreDamage * damageScale * 0.5, 0)
        const extraCoreDamage = Math.round(extraWeakness.triggered ? extraCoreBase * 1.5 : extraCoreBase)
        const extraDamage = Math.round(extraWeakness.damage)
        totalDamage += extraDamage
        coreDamage += extraCoreDamage
        weaknessTriggered = weaknessTriggered || extraWeakness.triggered
        if (level >= 3 && bonusGainQi <= 0 && extraWeakness.triggered) {
          bonusGainQi = Math.max(resources.qiMax * 0.005, 0)
        }
      }

      const applyPlayerAgiBuff =
        level >= 6 && totalDamage > 0
          ? { percent: 0.10, durationMs: 3000 }
          : undefined

      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered,
        hit: totalDamage > 0,
        gainQi: bonusGainQi > 0 ? bonusGainQi : undefined,
        applyPlayerAgiBuff,
      }
    },
  },
  {
    id: META_PHANTOM_INSTANT_KILL.id,
    name: META_PHANTOM_INSTANT_KILL.name,
    description: describePhantomInstantKill(1),
    cooldown: 6,
    cost: { type: 'qi', percentOfQiMax: 0.05 },
    flash: 'attack',
    aftercastTime: 0.4,
    icon: resolveSkillIcon(META_PHANTOM_INSTANT_KILL.id),
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(6, level, 1.5),
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(PHANTOM_KILL_BASE_MULTIPLIER, PHANTOM_KILL_PER_LEVEL, level),
    getDescription: describePhantomInstantKill,
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        PHANTOM_KILL_BASE_MULTIPLIER,
        PHANTOM_KILL_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / PHANTOM_KILL_BASE_MULTIPLIER
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
      const coreDamage = Math.round(weakness.triggered ? coreBase * 1.5 : coreBase)
      const totalDamage = Math.round(weakness.damage)
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit: totalDamage > 0,
        superArmorMs: 200,
        superArmorLabel: '绝影',
        delayedDamage: {
          delayMs: 200,
          damage: totalDamage,
          coreDamage,
          weaknessTriggered: weakness.triggered,
        },
      }
    },
  },
  {
    id: META_WHITE_TIGER_MASSACRE.id,
    name: META_WHITE_TIGER_MASSACRE.name,
    description: describeWhiteTigerMassacre(1),
    cooldown: 20,
    cost: { type: 'qi', percentOfQiMax: 0.12 },
    flash: 'ult',
    chargeTime: 0.8,
    aftercastTime: 0.5,
    icon: resolveSkillIcon(META_WHITE_TIGER_MASSACRE.id),
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(20, level, 5),
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(WHITE_TIGER_MASSACRE_BASE_MULTIPLIER, WHITE_TIGER_MASSACRE_PER_LEVEL, level),
    getDescription: describeWhiteTigerMassacre,
    execute: ({ stats, monster, rng, progress, battle }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const baseMultiplier = resolveDamageMultiplier(
        WHITE_TIGER_MASSACRE_BASE_MULTIPLIER,
        WHITE_TIGER_MASSACRE_PER_LEVEL,
        level,
      )
      const tigerFuryStacks = Math.max(battle?.tigerFuryStacks ?? 0, 0)
      const stackBonusMultiplier = tigerFuryStacks > 0 ? 1 + tigerFuryStacks * WHITE_TIGER_STACK_SKILL_BONUS : 1
      const damageMultiplier = baseMultiplier * stackBonusMultiplier
      const damageScale = damageMultiplier / WHITE_TIGER_MASSACRE_BASE_MULTIPLIER
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
      const coreDamage = Math.round(weakness.triggered ? coreBase * 1.5 : coreBase)
      const totalDamage = Math.round(weakness.damage)
      const setTigerFuryStacks = tigerFuryStacks <= 0 ? 3 : undefined
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit: totalDamage > 0,
        setTigerFuryStacks,
      }
    },
  },
  {
    id: META_QI_DODGE.id,
    name: META_QI_DODGE.name,
    description: META_QI_DODGE.description,
    cooldown: 0.7,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.3,
    icon: resolveSkillIcon(META_QI_DODGE.id),
    tags: ['utility', 'dodge'],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.04,
      successText: '闪避!',
    },
    getCooldown: () => 0.7,
    execute: () => ({ hit: false }),
  },
]


export const SKILL_MAP = new Map(SKILLS.map(skill => [skill.id, skill]))

export function getSkillDefinition(skillId: string | null | undefined) {
  if (!skillId) return null
  return SKILL_MAP.get(skillId) ?? null
}

export function getSkillDescription(definition: SkillDefinition, level = 1): string {
  if (typeof definition.getDescription === 'function') {
    return definition.getDescription(level)
  }
  return definition.description
}
