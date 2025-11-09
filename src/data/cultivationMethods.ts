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
    id: 'star_soul',
    name: '星魂斗气',
    focus: toFocus({ atk: 0.4, def: 0.4, agi: 0.2 }),
    description: '星魂一脉的古老传承，凝聚星辰之力运转斗气，攻守兼备，如星辉般稳定而坚韧。',
    effects: [
      '均衡流派，进可攻退可守。',
    ],
  },
  {
    id: 'vajra',
    name: '金刚斗气',
    focus: toFocus({ atk: 0.45, def: 0.5, agi: 0.05 }),
    description: '传承自北方玄武神兽的不世绝学，取其长寿不灭、固若金汤之神髓，成就万劫不磨之身。',
    effects: [
      '防御大师的选择，拥有惊人的耐受力。',
    ],
  },
  {
    id: 'tiger_stripe',
    name: '虎纹斗气',
    focus: toFocus({ atk: 0.5, def: 0.1, agi: 0.4 }),
    description: '传承自西方白虎神兽的杀伐绝学，取其庚金之锐利、白虎之威猛，剑锋所指，所向披靡。',
    effects: [
      '爆发流的极致，擅长快速突进与连击爆发。',
    ],
  },
  {
    id: 'purple_flame',
    name: '紫焰斗气',
    focus: toFocus({ atk: 0.3, def: 0.3, agi: 0.15, recovery: 0.25 }),
    description: '传承自南方朱雀神兽的不灭神火，取其浴火重生之玄妙，焚尽万邪，生生不息。',
    effects: [
      '不灭紫焰：斗气恢复速度翻倍。',
    ],
  },
]

export const CULTIVATION_METHOD_MAP = new Map(CULTIVATION_METHODS.map(method => [method.id, method]))

export function getCultivationMethodDefinition(id: CultivationMethodId | null | undefined): CultivationMethodDefinition | null {
  if (!id) return null
  return CULTIVATION_METHOD_MAP.get(id) ?? null
}
