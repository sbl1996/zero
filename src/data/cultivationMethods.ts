import type { CultivationMethodId, QiFocusProfile } from '@/types/domain'

export interface CultivationMethodDefinition {
  id: CultivationMethodId
  name: string
  focus: QiFocusProfile
  description: string
  effects: string[]
}

const toFocus = (focus: QiFocusProfile): QiFocusProfile => ({
  atk: focus.atk ?? 0,
  def: focus.def ?? 0,
  agi: focus.agi ?? 0,
  recovery: focus.recovery ?? 0,
})

export const CULTIVATION_METHODS: CultivationMethodDefinition[] = [
  {
    id: 'dragon_blood',
    name: '龙血斗气',
    focus: toFocus({ atk: 0.4, def: 0.4, agi: 0.2 }),
    description: '龙血一脉的基础功法，侧重兼顾攻防的斗气运转。',
    effects: [
      '均衡流派，为前期稳固根基的常见选择。',
    ],
  },
  {
    id: 'undying',
    name: '不死斗气',
    focus: toFocus({ atk: 0.45, def: 0.5, agi: 0.05 }),
    description: '以护躯强横著称，牺牲速度换取更强的防御承受力。',
    effects: [
      '偏向防御的运转方式，提升持久战表现。',
    ],
  },
  {
    id: 'tiger_stripe',
    name: '虎纹斗气',
    focus: toFocus({ atk: 0.5, def: 0.1, agi: 0.4 }),
    description: '猛虎般的爆发式斗气，强调攻击与敏捷的双重突击。',
    effects: [
      '爆发型功法，适合迅猛连击与快速收割。',
    ],
  },
  {
    id: 'purple_flame',
    name: '紫焰斗气',
    focus: toFocus({ atk: 0.3, def: 0.3, agi: 0.15, recovery: 0.25 }),
    description: '紫焰淬体，兼顾攻防与恢复的混合流派。',
    effects: [
      '紫焰被动：基础恢复 +20，运转时斗气回复随预热增强。',
    ],
  },
]

export const CULTIVATION_METHOD_MAP = new Map(CULTIVATION_METHODS.map(method => [method.id, method]))

export function getCultivationMethodDefinition(id: CultivationMethodId | null | undefined): CultivationMethodDefinition | null {
  if (!id) return null
  return CULTIVATION_METHOD_MAP.get(id) ?? null
}
