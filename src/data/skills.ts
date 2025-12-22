import { computeDamage, getDefRefForRealm, resolveWeaknessDamage, toRollMultiplier } from '@/composables/useDamage'
import { computeRhythmDamageMultiplier } from '@/utils/rhythm'
import { randRange } from '@/composables/useRng'
import { resolveAssetUrl } from '@/utils/assetUrls'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
import type { MechanicTag, Monster, SkillDefinition, SkillResult } from '@/types/domain'
// Magic Skills (Manually defined for now, later can be in metadata)
const GALE_BLADE_ID = 'gale_blade'


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
const GALE_BLADE_BASE_MULTIPLIER = 3.0
const GALE_BLADE_PER_LEVEL = 0.10

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

function describeGaleBlade(_level: number): string {
  return '通过旋律施放风刃。根据演奏评分造成伤害。'
}


export const SKILLS: SkillDefinition[] = [
  {
    id: 'dragon_shadow_dash',
    name: '龙影闪',
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'attack',
    aftercastTime: 0.3,
    icon: resolveSkillIcon('dragon_shadow_dash'),
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
    getDescription: () => '以龙影之姿急速侧移。成功闪避则返还4%斗气上限。',
    execute: () => ({ hit: false }),
  },
  {
    id: 'dragon_breath_slash',
    name: '龙息斩',
    cost: { type: 'qi', percentOfQiMax: 0.02 },
    flash: 'attack',
    aftercastTime: 0.2,
    icon: resolveSkillIcon('dragon_breath_slash'),
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
      const weaknessBonus = level >= 3 ? 0.05 : 0
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      let totalDamage = Math.round(weakness.damage)
      if (weakness.triggered && weaknessBonus > 0) {
        const mult = 1 + weaknessBonus
        totalDamage = Math.round(totalDamage * mult)
      }
      const hit = totalDamage > 0
      const cooldownBonus = level >= 10 && hit
        ? {
          targetSkillId: 'fallen_dragon_smash',
          reductionPercent: 0.25,
          durationMs: 2000,
        }
        : undefined
      return { damage: totalDamage, weaknessTriggered: weakness.triggered, hit, cooldownBonus }
    },
  },
  {
    id: 'fallen_dragon_smash',
    name: '陨龙击',
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'attack',
    chargeTime: 0.2,
    aftercastTime: 0.2,
    icon: resolveSkillIcon('fallen_dragon_smash'),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      let totalDamage = Math.round(weakness.damage)
      const hit = totalDamage > 0
      return {
        damage: totalDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        monsterStunMs: 100,
      }
    },
  },
  {
    id: 'star_realm_dragon_blood_break',
    name: '星界龙血破',
    cost: { type: 'qi', percentOfQiMax: 0.1 },
    flash: 'attack',
    chargeTime: 0.5,
    aftercastTime: 0.2,
    icon: resolveSkillIcon('star_realm_dragon_blood_break'),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
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
        weaknessTriggered: weakness.triggered,
        hit,
        superArmorMs: 500,
        applyVulnerability,
      }
    },
  },
  {
    id: 'tiger_shadow_step',
    name: '虎影步',
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon('tiger_shadow_step'),
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
    getDescription: () => '化作疾影的步法。成功闪避则返还4%斗气上限。',
    execute: () => ({ hit: false }),
  },
  {
    id: 'rending_void_claw',
    name: '裂空爪',
    cost: { type: 'qi', percentOfQiMax: 0.015 },
    flash: 'attack',
    aftercastTime: 0.15,
    icon: resolveSkillIcon('rending_void_claw'),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      let totalDamage = Math.round(weakness.damage)
      let weaknessTriggered = weakness.triggered
      let bonusGainQi = 0
      if (level >= 3 && weaknessTriggered) {
        bonusGainQi = Math.max(resources.qiMax * 0.005, 0)
      }

      const tigerFuryStacks = battle?.tigerFuryStacks ?? 0
      if (level >= 10 && tigerFuryStacks >= 8 && totalDamage > 0) {
        const extraDamageMultiplier = damageMultiplier * 0.5
        const extraBaseDamage = computeDamage(atk, def, extraDamageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
          defRef,
          defenderTough: resolveMonsterTough(monster),
        })
        const extraWeakness = resolveWeaknessDamage(extraBaseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
        const extraDamage = Math.round(extraWeakness.damage)
        totalDamage += extraDamage
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
        weaknessTriggered,
        hit: totalDamage > 0,
        gainQi: bonusGainQi > 0 ? bonusGainQi : undefined,
        applyPlayerAgiBuff,
      }
    },
  },
  {
    id: 'phantom_instant_kill',
    name: '绝影·瞬杀',
    cost: { type: 'qi', percentOfQiMax: 0.05 },
    flash: 'attack',
    aftercastTime: 0.4,
    icon: resolveSkillIcon('phantom_instant_kill'),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const totalDamage = Math.round(weakness.damage)
      return {
        damage: totalDamage,
        weaknessTriggered: weakness.triggered,
        hit: totalDamage > 0,
        superArmorMs: 200,
        superArmorLabel: '绝影',
        delayedDamage: {
          delayMs: 200,
          damage: totalDamage,
          weaknessTriggered: weakness.triggered,
        },
      }
    },
  },
  {
    id: 'white_tiger_massacre',
    name: '白虎森罗杀',
    cost: { type: 'qi', percentOfQiMax: 0.12 },
    flash: 'ult',
    chargeTime: 0.8,
    aftercastTime: 0.5,
    icon: resolveSkillIcon('white_tiger_massacre'),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const totalDamage = Math.round(weakness.damage)
      const setTigerFuryStacks = tigerFuryStacks <= 0 ? 3 : undefined
      return {
        damage: totalDamage,
        weaknessTriggered: weakness.triggered,
        hit: totalDamage > 0,
        setTigerFuryStacks,
      }
    },
  },
  {
    id: 'fire_feather_flash',
    name: '火羽闪',
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon('fire_feather_flash'),
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
    getDescription: () => '灼热的羽翎闪身，成功躲避时有50%概率为敌附加【劫灰】。',
    execute: () => ({ hit: false }),
  },
  {
    id: 'vermilion_seal',
    name: '朱雀印',
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'attack',
    aftercastTime: 0.3,
    icon: resolveSkillIcon('vermilion_seal'),
    maxLevel: 10,
    mechanics: [
      CALAMITY_ASH_MECHANIC,
    ],
    getCooldown: (level) => resolvePerLevelCooldown(2.0, level, 0.7),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const totalDamage = Math.round(weakness.damage)
      const hit = totalDamage > 0
      return {
        damage: totalDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        applyCalamityAshStacks: hit ? 1 : undefined,
      }
    },
  },
  {
    id: 'violet_shroud',
    name: '神火罩',
    cost: { type: 'qi', percentOfQiMax: 0.05 },
    flash: 'skill',
    aftercastTime: 0.2,
    icon: resolveSkillIcon('violet_shroud'),
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
    id: 'nirvana_end_of_calamity',
    name: '涅槃·劫尽',
    cost: { type: 'qi', percentOfQiMax: 0.15 },
    flash: 'ult',
    chargeTime: 0.6,
    aftercastTime: 0.4,
    icon: resolveSkillIcon('nirvana_end_of_calamity'),
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
      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const agiAtt = stats.totals.AGI ?? 0
      const agiDef = resolveMonsterAgi(monster)

      const baseDamage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster),
      })
      const weakness = resolveWeaknessDamage(baseDamage, agiAtt, agiDef, randRange(rng, 0, 1))
      const totalDamage = Math.round(weakness.damage)
      const hit = totalDamage > 0
      const stacks = Math.max(battle?.calamityAshStacks ?? 0, 0)
      return {
        damage: totalDamage,
        weaknessTriggered: weakness.triggered,
        hit,
        triggerCalamityExplosion: stacks > 0 ? { multiplier: 1.2 } : undefined,
      }
    },
  },
  {
    id: 'qi_dodge',
    name: '斗气闪避',
    cost: { type: 'qi', percentOfQiMax: 0.06 },
    flash: 'skill',
    aftercastTime: 0.3,
    icon: resolveSkillIcon('qi_dodge'),
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
    getDescription: () => '进入斗气闪避姿态，成功闪避则返还4%斗气上限。',
    execute: () => ({ hit: false }),
  },
  {
    id: GALE_BLADE_ID,
    name: '风刃',
    cost: { type: 'qi', percentOfQiMax: 0.04 },
    flash: 'skill',
    aftercastTime: 0,
    icon: resolveSkillIcon(GALE_BLADE_ID),
    maxLevel: 10,
    mechanics: [
      { id: 'magic', label: '魔法', kind: 'utility' },
    ],
    rhythmConfig: {
      phraseId: 'wind_blade',
      baseDamageMultiplier: 0.5,
    },
    getCooldown: () => 0.1,
    getDamageMultiplier: (level) => resolveDamageMultiplier(GALE_BLADE_BASE_MULTIPLIER, GALE_BLADE_PER_LEVEL, level),
    getDescription: describeGaleBlade,
    execute: ({ stats, monster, rng, rhythmResult, progress }) => {
      const level = Math.max(progress?.level ?? 1, 1)
      const score = rhythmResult?.score ?? 0
      const damageMultiplier = computeRhythmDamageMultiplier(score) * resolveDamageMultiplier(GALE_BLADE_BASE_MULTIPLIER, GALE_BLADE_PER_LEVEL, level)

      const atk = stats.totals.ATK
      const def = resolveMonsterDef(monster)
      const defRef = resolveMonsterDefRef(monster)
      const damage = computeDamage(atk, def, damageMultiplier, toRollMultiplier(randRange(rng, 0, 1)), {
        defRef,
        defenderTough: resolveMonsterTough(monster)
      })

      return {
        damage,
        weaknessTriggered: false,
        hit: damageMultiplier > 0
      }
    }
  }
]


export const SKILL_MAP = new Map(SKILLS.map(skill => [skill.id, skill]))

export function getSkillDefinition(skillId: string | null | undefined) {
  if (!skillId) return null
  return SKILL_MAP.get(skillId) ?? null
}

export function getSkillDescription(definition: SkillDefinition, level = 1): string {
  return definition.getDescription(level)
}
