import type {
  Monster,
  MonsterAISelector,
  MonsterSkillDefinition,
  MonsterSkillProfile,
} from '@/types/domain'

const DEFAULT_SKILL_ID = 'monster.normal_attack'
const GOLDEN_SHEEP_ID = 'boss-golden-sheep'
const GOLDEN_SHEEP_DOUBLE_STAB_ID = 'monster.golden_sheep_double_stab'

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
}

const extraSkillMap: Record<string, MonsterSkillDefinition[]> = {
  [GOLDEN_SHEEP_ID]: [GOLDEN_SHEEP_DOUBLE_STAB],
}

export function resolveMonsterSkillProfile(monster: Monster): MonsterSkillProfile {
  const extras = extraSkillMap[monster.id] ?? []
  return {
    basic: BASIC_MONSTER_ATTACK,
    extras: [...extras],
  }
}

const monsterAiMap: Record<string, MonsterAISelector> = {
  [GOLDEN_SHEEP_ID]: ({ skillStates, rng }) => {
    const doubleStabReady = (skillStates[GOLDEN_SHEEP_DOUBLE_STAB_ID] ?? 0) <= 0
    const basicReady = (skillStates[DEFAULT_SKILL_ID] ?? 0) <= 0
    if (!basicReady && !doubleStabReady) return null
    if (doubleStabReady && rng() < 0.2) {
      return GOLDEN_SHEEP_DOUBLE_STAB_ID
    }
    return basicReady ? DEFAULT_SKILL_ID : null
  },
}

export function resolveMonsterSkillSelector(monster: Monster): MonsterAISelector {
  return monsterAiMap[monster.id] ?? (({ skillStates }) => {
    const basicReady = (skillStates[DEFAULT_SKILL_ID] ?? 0) <= 0
    return basicReady ? DEFAULT_SKILL_ID : null
  })
}

export const MONSTER_SKILL_IDS = {
  BASIC: DEFAULT_SKILL_ID,
  GOLDEN_SHEEP_DOUBLE_STAB: GOLDEN_SHEEP_DOUBLE_STAB_ID,
} as const
