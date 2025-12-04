import type { CultivationMethodId, QiFocusProfile } from '@/types/domain'
import { resolveAssetUrl } from '@/utils/assetUrls'

export interface CultivationMethodDefinition {
  id: CultivationMethodId
  name: string
  icon?: string
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
    icon: resolveAssetUrl('cult-dragon-blood.webp'),
    focus: toFocus({ atk: 0.4, def: 0.4, agi: 0.2 }),
    description: '引动体内沉睡的“青龙”血脉，使血液如奔腾河流般在血管中轰鸣。修炼至深处，体表将覆盖细密的青色龙鳞，肉体力量与防御力呈几何级数暴增，不仅能免疫大部分低阶魔法，更能以纯粹的蛮力粉碎一切阻碍。',
    effects: [
      '【龙战于野】：每消耗一定斗气就会获得可叠加的【血怒】状态，增强攻击、防御与斗气恢复。',
    ],
  },
  {
    id: 'vajra',
    name: '金刚斗气',
    icon: resolveAssetUrl('cult-vajra.webp'),
    focus: toFocus({ atk: 0.45, def: 0.5, agi: 0.05 }),
    description: '源自“玄武”血脉的苦修法门，通过特殊的呼吸吐纳，将斗气凝练得如同水银般沉重。它并不追求花哨的技巧，而是极致地强化骨骼密度与内脏韧性，让身躯化为战场上不可撼动的移动堡垒，生命气息悠长深厚。',
    effects: [
      '【金刚不坏】：免疫破绽额外伤害，斗气防御显著加强',
    ],
  },
  {
    id: 'tiger_stripe',
    name: '虎纹斗气',
    icon: resolveAssetUrl('cult-tiger-stripe.webp'),
    focus: toFocus({ atk: 0.5, def: 0.1, agi: 0.4 }),
    description: '激发“白虎”血脉中原始的杀戮本能，斗气呈锐利的白金色。该功法极度压榨肌肉纤维的爆发力，使攻击带有天然的撕裂效果。修炼者往往攻势如狂风骤雨，在敌人反应过来之前，便已用武器撕开了对方的喉咙。',
    effects: [
      '【虎煞·绝影】：每次闪避成功后获得可叠加的【虎煞】状态，提升最终伤害，受到伤害时移除所有层数。',
    ],
  },
  {
    id: 'purple_flame',
    name: '紫焰斗气',
    icon: resolveAssetUrl('cult-purple-flame.webp'),
    focus: toFocus({ atk: 0.3, def: 0.3, agi: 0.15, recovery: 0.25 }),
    description: '唤醒“朱雀”血脉中的不死特性，将斗气转化为一种拥有奇特治愈力的紫色热流。它能极大程度激活细胞活性，使伤口以肉眼可见的速度愈合。战斗时全身血液如熔岩般灼热，每一次呼吸都在为身体重新注入勃勃生机。',
    effects: [
      '【不灭紫焰】：斗气恢复速度大幅加快。',
    ],
  },
]

export const CULTIVATION_METHOD_MAP = new Map(CULTIVATION_METHODS.map(method => [method.id, method]))

export function getCultivationMethodDefinition(id: CultivationMethodId | null | undefined): CultivationMethodDefinition | null {
  if (!id) return null
  return CULTIVATION_METHOD_MAP.get(id) ?? null
}
