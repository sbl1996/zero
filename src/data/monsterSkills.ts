import type {
  Monster,
  MonsterAISelector,
  MonsterSkillDefinition,
  MonsterSkillProfile,
} from '@/types/domain'

const DEFAULT_SKILL_ID = 'monster.normal_attack'
const GOLDEN_SHEEP_ID = 'boss-golden-sheep'
const GOLDEN_SHEEP_DOUBLE_STAB_ID = 'monster.golden_sheep_double_stab'
const WIND_RAPTOR_ID = 'boss-wind-raptor'
const WIND_RAPTOR_BLADE_DANCE_ID = 'monster.wind_raptor_blade_dance'

function cloneSkillDefinition(definition: MonsterSkillDefinition): MonsterSkillDefinition {
  return {
    ...definition,
    hits: definition.hits.map((hit) => ({ ...hit })),
  }
}

const BASIC_MONSTER_ATTACK: MonsterSkillDefinition = {
  id: DEFAULT_SKILL_ID,
  name: '普通攻击',
  cooldown: 1.6,
  aftercast: 0.4,
  hits: [
    {
      delay: 0,
      multiplier: 1,
    },
  ],
}

const GOLDEN_SHEEP_DOUBLE_STAB: MonsterSkillDefinition = {
  id: GOLDEN_SHEEP_DOUBLE_STAB_ID,
  name: '二连突刺',
  cooldown: 10,
  aftercast: 0.6,
  hits: [
    {
      delay: 0,
      multiplier: 0.6,
    },
    {
      delay: 0.25,
      multiplier: 0.6,
    },
  ],
  comboLabel: '×2',
}

const WIND_RAPTOR_BLADE_DANCE: MonsterSkillDefinition = {
  id: WIND_RAPTOR_BLADE_DANCE_ID,
  name: '风刃乱舞',
  cooldown: 10,
  aftercast: 1,
  hits: [
    {
      delay: 0,
      multiplier: 0.5,
    },
    {
      delay: 0.15,
      multiplier: 0.5,
    },
    {
      delay: 0.3,
      multiplier: 0.5,
    },
  ],
  comboLabel: '×3',
}

const extraSkillMap: Record<string, MonsterSkillDefinition[]> = {
  [GOLDEN_SHEEP_ID]: [GOLDEN_SHEEP_DOUBLE_STAB],
  [WIND_RAPTOR_ID]: [WIND_RAPTOR_BLADE_DANCE],
}

export function resolveMonsterSkillProfile(monster: Monster): MonsterSkillProfile {
  const extras = (extraSkillMap[monster.id] ?? []).map(cloneSkillDefinition)
  const basic = cloneSkillDefinition(BASIC_MONSTER_ATTACK)
  const attackInterval = monster.attackInterval > 0 ? monster.attackInterval : BASIC_MONSTER_ATTACK.cooldown
  basic.cooldown = attackInterval
  return {
    basic,
    extras,
  }
}

function isSkillReady(skillId: string, skillStates: Record<string, number>): boolean {
  return (skillStates[skillId] ?? 0) <= 0
}

const monsterAiMap: Record<string, MonsterAISelector> = {
  [GOLDEN_SHEEP_ID]: ({ skillStates, rng }) => {
    const doubleStabReady = isSkillReady(GOLDEN_SHEEP_DOUBLE_STAB_ID, skillStates)
    const basicReady = isSkillReady(DEFAULT_SKILL_ID, skillStates)
    if (!basicReady && !doubleStabReady) return null
    if (doubleStabReady && rng() < 0.2) {
      return GOLDEN_SHEEP_DOUBLE_STAB_ID
    }
    return basicReady ? DEFAULT_SKILL_ID : null
  },
  [WIND_RAPTOR_ID]: ({ skillStates }) => {
    const bladeDanceReady = isSkillReady(WIND_RAPTOR_BLADE_DANCE_ID, skillStates)
    const basicReady = isSkillReady(DEFAULT_SKILL_ID, skillStates)
    if (!bladeDanceReady && !basicReady) return null
    if (bladeDanceReady) return WIND_RAPTOR_BLADE_DANCE_ID
    return basicReady ? DEFAULT_SKILL_ID : null
  },
}

export function resolveMonsterSkillSelector(monster: Monster): MonsterAISelector {
  return monsterAiMap[monster.id] ?? (({ skillStates }) => {
    const basicReady = isSkillReady(DEFAULT_SKILL_ID, skillStates)
    return basicReady ? DEFAULT_SKILL_ID : null
  })
}
