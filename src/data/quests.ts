import type { QuestDefinition, QuestItemDefinition } from '@/types/domain'

export const QUEST_ITEM_DEFINITIONS: QuestItemDefinition[] = [
  {
    id: 'quest-wolf-fang',
    name: '野狼利齿',
    description: '锋利的狼牙，沾染矿粉后变得异常坚硬。',
  },
  {
    id: 'quest-frost-core-shard',
    name: '寒岩碎核',
    description: '寒岩巨像体内震荡的晶核碎片，触感冰冷。',
  },
]

export const QUEST_DEFINITIONS: QuestDefinition[] = [
  {
    id: 'quest-slime-menace',
    name: '青苔原的黏液祸患',
    giver: '青苔原生态管理员',
    location: '翡冷翠任务板',
    description:
      '“最近青苔原遍布史莱姆的粘液印记，路过的行人被它们缠得寸步难行。帮忙清理一批吧，别让那些软泥团以为这片草地是它们的王国。”',
    summary: '在青苔原击杀 10 只史莱姆。',
    recommendedRealmTier: 1,
    difficultyLabel: '★',
    objectives: [
      {
        id: 'kill-slimes',
        type: 'kill',
        monsterIds: ['m-slime'],
        amount: 10,
        description: '在青苔原击杀 10 只史莱姆。',
      },
    ],
    rewards: {
      gold: 100,
      items: [
        { itemId: 'potionHP', quantity: 1 },
        { itemId: 'potionQi', quantity: 1 },
      ],
    },
    allowAbandon: true,
    repeatable: true,
    tags: ['starter'],
  },
  {
    id: 'quest-wolf-teeth',
    name: '野狼利齿样本',
    giver: '铁匠罗恩',
    location: '翡冷翠任务板',
    description:
      '“那些在夜里嚎叫的野狼总是在铁矿道附近徘徊，我想看看它们的牙齿是不是被矿粉磨得更锋利。帮我带些利齿回来，我可以给你打折——当然，只是一点点。”',
    summary: '收集 5 个『野狼利齿』任务物品。',
    recommendedRealmTier: 1,
    difficultyLabel: '★☆',
    objectives: [
      {
        id: 'collect-wolf-fangs',
        type: 'killCollect',
        monsterIds: ['m-wolf'],
        itemId: 'quest-wolf-fang',
        dropRate: 0.5,
        maxPerKill: 1,
        amount: 5,
        description: '击败野狼并收集 5 个野狼利齿。',
      },
    ],
    rewards: {
      gold: 200,
      items: [{ itemId: 'potionQi', quantity: 2 }],
      skillUnlocks: [],
      notes: '完成后铁匠罗恩会对你另眼相看。',
    },
    allowAbandon: true,
    repeatable: true,
    tags: ['collection'],
  },
  {
    id: 'quest-frost-core-investigation',
    name: '寒岩碎核调查',
    giver: '远行学者米洛',
    location: '翡冷翠任务板',
    description:
      '“熔冰之脊的寒岩巨像似乎不是天然形成的岩石，它们体内有一种奇特的晶核，在冰与火之间不断震荡。帮我敲下一些碎核，我想研究它们与晶核修炼之间的关系。”',
    summary: '收集 3 个『寒岩碎核』任务物品。',
    recommendedRealmTier: 2,
    difficultyLabel: '★★',
    prerequisites: {
      minRealmTier: 2,
    },
    objectives: [
      {
        id: 'collect-frost-core-shards',
        type: 'killCollect',
        monsterIds: ['m-froststone-colossus'],
        itemId: 'quest-frost-core-shard',
        dropRate: 0.5,
        maxPerKill: 1,
        amount: 3,
        description: '击败寒岩巨像并收集 3 个寒岩碎核。',
      },
    ],
    rewards: {
      gold: 500,
      items: [{ itemId: 'potionQiPlus', quantity: 1 }],
      notes: '碎核可为学术研究提供珍贵样本。',
    },
    allowAbandon: true,
    repeatable: true,
    tags: ['collection', 'tier2'],
  },
]

export const QUEST_DEFINITION_MAP: Record<string, QuestDefinition> = QUEST_DEFINITIONS.reduce(
  (acc, quest) => {
    acc[quest.id] = quest
    return acc
  },
  {} as Record<string, QuestDefinition>,
)
