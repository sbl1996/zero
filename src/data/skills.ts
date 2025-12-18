import { dmgAttack, dmgSkill, dmgUlt, getDefRefForRealm, resolveWeaknessDamage } from '@/composables/useDamage'
import { randRange } from '@/composables/useRng'
import { resolveAssetUrl } from '@/utils/assetUrls'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
import type { MechanicTag, Monster, SkillDefinition, SkillResult } from '@/types/domain'
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
const META_FIRE_FEATHER_FLASH = getSkillMeta('fire_feather_flash')
const META_VERMILION_SEAL = getSkillMeta('vermilion_seal')
const META_VIOLET_SHROUD = getSkillMeta('violet_shroud')
const META_NIRVANA_END_OF_CALAMITY = getSkillMeta('nirvana_end_of_calamity')

const DRAGON_BREATH_BASE_MULTIPLIER = 1
const DRAGON_BREATH_PER_LEVEL = 0.02
const FALLEN_DRAGON_BASE_MULTIPLIER = 1.6
const FALLEN_DRAGON_PER_LEVEL = 0.04
const STAR_REALM_BASE_MULTIPLIER = 4.5
const STAR_REALM_PER_LEVEL = 0.15
const RENDING_VOID_BASE_MULTIPLIER = 0.75
const RENDING_VOID_PER_LEVEL = 0.02
const PHANTOM_KILL_BASE_MULTIPLIER = 2.2
const PHANTOM_KILL_PER_LEVEL = 0.05
const WHITE_TIGER_MASSACRE_BASE_MULTIPLIER = 5.2
const WHITE_TIGER_MASSACRE_PER_LEVEL = 0.18
const WHITE_TIGER_STACK_SKILL_BONUS = 0.03
const VERMILION_SEAL_BASE_MULTIPLIER = 0.6
const VERMILION_SEAL_PER_LEVEL = 0.03
const NIRVANA_BASE_MULTIPLIER = 2.0
const NIRVANA_PER_LEVEL = 0.10

const CALAMITY_ASH_MECHANIC: MechanicTag = {
  id: 'calamity_ash',
  label: '劫灰',
  kind: 'debuff',
  value: '',
  tooltip: '每秒造成 10% 倍率的真实伤害（无视防御，不触发破绽），持续 8s，最高叠加 8 层。',
}

function resolveDamageMultiplier(base: number, perLevelIncrease: number, level: number): number {
  const lvl = Math.max(level, 1)
  return base + perLevelIncrease * lvl
}

function describeDragonBreath(level: number): string {
  const segments = [`基础单体斩击。`]
  if (level >= 3) {
    segments.push('弱点击破时额外造成 5% 总伤害。')
  }
  if (level >= 10) {
    segments.push('命中后使【陨龙击】冷却缩短 25%，持续 2 秒。')
  }
  return segments.join(' ')
}

function describeFallenDragon(level: number): string {
  const segments = [`蓄力施放重击。`]
  if (level >= 3) {
    segments.push('弱点击破时额外造成 10% 总伤害。')
  }
  return segments.join(' ')
}

function describeStarRealm(_level: number): string {
  const segments = [`蓄力爆发斩击。施放后获得霸体。命中目标施加 8s 易伤。`]
  return segments.join(' ')
}

function describeRendingVoidClaw(level: number): string {
  const segments = [`迅捷撕裂攻击。`]
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

function describePhantomInstantKill(_level: number): string {
  const segments = [`瞬息突进刺杀。施放后获得霸体，结束后再对敌方造成伤害。`]
  return segments.join(' ')
}

function describeWhiteTigerMassacre(_level: number): string {
  const segments = [`引动白虎杀意的一击。`]
  segments.push('若施放时【虎煞】层数为0，则直接获得 3 层【虎煞】。若已有【虎煞】，本次伤害每层额外提升 3%。')
  return segments.join(' ')
}

function describeVermilionSeal(_level: number): string {
  const segments = [
    `以朱雀印记镇压敌人，命中后附加 1 层【劫灰】。`,
  ]
  return segments.join(' ')
}

function describeVioletShroud(_level: number): string {
  return '开启后提升斗气防御比例至 90%，消耗 2% 斗气/s，每次被命中时对敌方造成伤害。'
}

function describeNirvanaEndOfCalamity(_level: number): string {
  return `天劫降世，清算罪恶。若目标有【劫灰】，引爆全部剩余伤害并额外造成 1.2x 引爆伤害，清除层数。`
}

export const SKILLS: SkillDefinition[] = [
  {
    id: META_DRAGON_SHADOW_DASH.id,
    name: META_DRAGON_SHADOW_DASH.name,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'attack',
    aftercastTime: 0.3,
    icon: resolveSkillIcon(META_DRAGON_SHADOW_DASH.id),
    mechanics: [
      { id: 'dodge', label: '闪避', kind: 'defense' },
      { id: 'aftercast', label: '后摇', kind: 'timing', value: '0.3s' },
    ],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.04,
      successText: '龙影闪!',
    },
    getDamageMultiplier: () => 0,
    getCooldown: () => 0.7,
    getDescription: () => META_DRAGON_SHADOW_DASH.description,
    execute: () => ({ hit: false }),
  },
  {
    id: META_DRAGON_BREATH.id,
    name: META_DRAGON_BREATH.name,
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
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'attack',
    chargeTime: 0.2,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_FALLEN_DRAGON.id),
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(5, level, 1),
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
    cost: { type: 'qi', percentOfQiMax: 0.1 },
    flash: 'attack',
    chargeTime: 0.5,
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_STAR_REALM.id),
    maxLevel: 10,
    mechanics: [
      { id: 'charge', label: '蓄力', kind: 'timing', value: '0.5s' },
      { id: 'aftercast', label: '后摇', kind: 'timing', value: '0.2s' },
      { id: 'super-armor', label: '霸体', kind: 'defense', value: '0.5s' },
      { id: 'vulnerability', label: '易伤', kind: 'debuff', value: '10%' },
    ],
    getCooldown: (level) => resolvePerLevelCooldown(16, level, 5),
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
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_TIGER_SHADOW_STEP.id),
    mechanics: [
      { id: 'dodge', label: '闪避', kind: 'defense' },
      { id: 'aftercast', label: '后摇', kind: 'timing', value: '0.2s' },
    ],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.04,
      successText: '虎影步!',
    },
    getDamageMultiplier: () => 0,
    getCooldown: () => 0.6,
    getDescription: () => META_TIGER_SHADOW_STEP.description,
    execute: () => ({ hit: false }),
  },
  {
    id: META_RENDING_VOID_CLAW.id,
    name: META_RENDING_VOID_CLAW.name,
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
    cost: { type: 'qi', percentOfQiMax: 0.05 },
    flash: 'attack',
    aftercastTime: 0.4,
    icon: resolveSkillIcon(META_PHANTOM_INSTANT_KILL.id),
    maxLevel: 10,
    mechanics: [
      { id: 'super-armor', label: '霸体', kind: 'defense', value: '0.2s' },
      { id: 'aftercast', label: '后摇', kind: 'timing', value: '0.4s' },
    ],
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
    id: META_FIRE_FEATHER_FLASH.id,
    name: META_FIRE_FEATHER_FLASH.name,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_FIRE_FEATHER_FLASH.id),
    mechanics: [
      { id: 'dodge', label: '闪避', kind: 'defense' },
      CALAMITY_ASH_MECHANIC,
      { id: 'aftercast', label: '后摇', kind: 'timing', value: '0.2s' },
    ],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.03,
      successText: '火羽闪!',
    },
    getDamageMultiplier: () => 0,
    getCooldown: () => 0.6,
    getDescription: () => META_FIRE_FEATHER_FLASH.description,
    execute: () => ({ hit: false }),
  },
  {
    id: META_VERMILION_SEAL.id,
    name: META_VERMILION_SEAL.name,
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'attack',
    aftercastTime: 0.3,
    icon: resolveSkillIcon(META_VERMILION_SEAL.id),
    maxLevel: 10,
    mechanics: [
      CALAMITY_ASH_MECHANIC,
    ],
    getCooldown: (level) => resolvePerLevelCooldown(3.0, level, 0.7),
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(VERMILION_SEAL_BASE_MULTIPLIER, VERMILION_SEAL_PER_LEVEL, level),
    getDescription: describeVermilionSeal,
    execute: ({ stats, monster, rng, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        VERMILION_SEAL_BASE_MULTIPLIER,
        VERMILION_SEAL_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / VERMILION_SEAL_BASE_MULTIPLIER
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
      const coreDamage = Math.round(weakness.triggered ? coreBase * 1.5 : coreBase)
      const totalDamage = Math.round(weakness.damage)
      const hit = totalDamage > 0
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        applyCalamityAshStacks: hit ? 1 : undefined,
      }
    },
  },
  {
    id: META_VIOLET_SHROUD.id,
    name: META_VIOLET_SHROUD.name,
    cost: { type: 'qi', percentOfQiMax: 0.05 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon(META_VIOLET_SHROUD.id),
    mechanics: [{ id: 'debuff', label: '开关', kind: 'timing', value: '' }],
    maxLevel: 10,
    getCooldown: () => 3,
    getDamageMultiplier: () => 0.5,
    getDescription: describeVioletShroud,
    execute: ({ battle }) => {
      const active = battle?.violetShroudActive ?? false
      return {
        hit: false,
        toggleVioletShroud: !active,
      }
    },
  },
  {
    id: META_NIRVANA_END_OF_CALAMITY.id,
    name: META_NIRVANA_END_OF_CALAMITY.name,
    cost: { type: 'qi', percentOfQiMax: 0.15 },
    flash: 'ult',
    chargeTime: 0.6,
    aftercastTime: 0.4,
    icon: resolveSkillIcon(META_NIRVANA_END_OF_CALAMITY.id),
    mechanics: [],
    maxLevel: 10,
    getCooldown: (level) => resolvePerLevelCooldown(20, level, 5),
    getDamageMultiplier: (level) =>
      resolveDamageMultiplier(NIRVANA_BASE_MULTIPLIER, NIRVANA_PER_LEVEL, level),
    getDescription: describeNirvanaEndOfCalamity,
    execute: ({ stats, monster, rng, progress, battle }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const damageMultiplier = resolveDamageMultiplier(
        NIRVANA_BASE_MULTIPLIER,
        NIRVANA_PER_LEVEL,
        level,
      )
      const damageScale = damageMultiplier / NIRVANA_BASE_MULTIPLIER
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
      const hit = totalDamage > 0
      const stacks = Math.max(battle?.calamityAshStacks ?? 0, 0)
      return {
        damage: totalDamage,
        coreDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        triggerCalamityExplosion: stacks > 0 ? { multiplier: 1.2 } : undefined,
      }
    },
  },
  {
    id: META_QI_DODGE.id,
    name: META_QI_DODGE.name,
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.3,
    icon: resolveSkillIcon(META_QI_DODGE.id),
    mechanics: [
      { id: 'dodge', label: '闪避', kind: 'defense' },
      { id: 'aftercast', label: '后摇', kind: 'timing', value: '0.3s' },
    ],
    maxLevel: 1,
    dodgeConfig: {
      windowMs: DODGE_WINDOW_MS,
      refundPercentOfQiMax: 0.04,
      successText: '闪避!',
    },
    getDamageMultiplier: () => 0,
    getCooldown: () => 0.7,
    getDescription: () => META_QI_DODGE.description,
    execute: () => ({ hit: false }),
  },
]


export const SKILL_MAP = new Map(SKILLS.map(skill => [skill.id, skill]))

export function getSkillDefinition(skillId: string | null | undefined) {
  if (!skillId) return null
  return SKILL_MAP.get(skillId) ?? null
}

export function getSkillDescription(definition: SkillDefinition, level = 1): string {
  return definition.getDescription(level)
}
