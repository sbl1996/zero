import type { QuestReward, QuestRuntimeStatus } from '@/types/domain'
import type { DialoguePage, DialogueScriptContext, NpcDefinition } from '@/types/npc'
import { ITEMS } from '@/data/items'

const QUEST_SLIME_MENACE = 'quest-slime-menace'

function getItemName(itemId: string): string {
  const item = ITEMS.find(item => item.id === itemId)
  return item?.name || itemId
}

function formatRewardSummary(reward?: QuestReward | null): string {
  if (!reward) return '奖励未知。'
  const parts: string[] = []
  if (reward.gold) {
    parts.push(`${reward.gold} 金币`)
  }
  if (reward.items?.length) {
    reward.items.forEach((item) => {
      parts.push(`${getItemName(item.itemId)} x${item.quantity}`)
    })
  }
  return parts.length ? `奖励：${parts.join('，')}。` : '奖励：无额外物资。'
}

function resolveQuestEntryView(status: QuestRuntimeStatus): string {
  if (status === 'readyToTurnIn') return 'questReady'
  if (status === 'active') return 'questActive'
  if (status === 'available' || status === 'completed') return 'questOffer'
  return 'questLocked'
}

function guardZhenxiangScript(context: DialogueScriptContext): DialoguePage {
  const questStatus = context.questStatus(QUEST_SLIME_MENACE)
  const questDefinition = context.questDefinition(QUEST_SLIME_MENACE)
  const questProgress = context.questProgress(QUEST_SLIME_MENACE)
  const view = context.state.viewId

  if (view === 'chat') {
    return {
      id: 'chat',
      lines: [
        {
          id: 'chat-1',
          speaker: '振翔',
          text: '青苔原这片地貌本该干爽，可最近雾气稠得像霜，都是史莱姆拖出来的湿气。',
        },
        {
          id: 'chat-2',
          speaker: '振翔',
          text: '往北几步有个断裂的石柱，如果你被困住，就朝那边跑，那些软泥不喜欢粗糙的石头。',
        },
      ],
      options: [
        {
          id: 'chat-back',
          label: '回到主菜单',
          action: () => ({ type: 'view', viewId: 'root' }),
        },
      ],
    }
  }

  if (view === 'questOffer') {
    return {
      id: 'quest-offer',
      title: questDefinition?.name ?? '青苔原的黏液祸患',
      lines: [
        {
          id: 'quest-offer-1',
          speaker: '振翔',
          text: questDefinition?.description ?? '',
        }
      ],
      options: [
        {
          id: 'quest-accept',
          label: '接受任务',
          action: () => {
            const accepted = context.quests.accept(QUEST_SLIME_MENACE)
            if (!accepted) {
              return { type: 'view', viewId: resolveQuestEntryView(context.questStatus(QUEST_SLIME_MENACE)) }
            }
            return { type: 'view', viewId: 'close' }
          },
        },
        {
          id: 'quest-decline',
          label: '稍后再说',
          action: () => ({ type: 'view', viewId: 'questDecline' }),
        },
      ],
    }
  }

  if (view === 'questActive') {
    const target = questDefinition?.objectives?.[0]
    const current = questProgress?.objectives?.[target?.id ?? '']?.current ?? 0
    const total = target?.amount ?? 10
    return {
      id: 'quest-active',
      title: questDefinition?.name,
      lines: [
        {
          id: 'quest-active-1',
          speaker: '振翔',
          text: `泥沼区的史莱姆最粘人，你已经解决了 ${current}/${total} 只。`,
        },
        {
          id: 'quest-active-2',
          text: '别被它们的慢动作骗了，停下来就会被缠住，保持移动。',
        },
      ],
      options: [
        {
          id: 'quest-active-back',
          label: '我知道了',
          action: () => ({ type: 'view', viewId: 'root' }),
        },
      ],
    }
  }

  if (view === 'questReady') {
    const rewardSummary = formatRewardSummary(questDefinition?.rewards)
    return {
      id: 'quest-ready',
      title: questDefinition?.name,
      lines: [
        {
          id: 'quest-ready-1',
          speaker: '振翔',
          text: '干得漂亮，那些史莱姆的踪迹已经淡了许多。',
        },
        {
          id: 'quest-ready-2',
          text: rewardSummary,
        },
      ],
      options: [
        {
          id: 'quest-turn-in',
          label: '提交任务',
          action: () => {
            const rewards = context.quests.submit(QUEST_SLIME_MENACE)
            if (!rewards) {
              return { type: 'view', viewId: resolveQuestEntryView(context.questStatus(QUEST_SLIME_MENACE)) }
            }
            return { type: 'view', viewId: 'root' }
          },
        },
        {
          id: 'quest-ready-back',
          label: '等会儿再说',
          action: () => ({ type: 'view', viewId: 'root' }),
        },
      ],
    }
  }

  if (view === 'questDecline') {
    return {
      id: 'quest-decline',
      lines: [
        {
          id: 'quest-decline-1',
          speaker: '振翔',
          text: '明白，你若改变主意随时来找我。',
        },
      ],
      options: [
        {
          id: 'quest-decline-back',
          label: '回到主菜单',
          action: () => ({ type: 'view', viewId: 'root' }),
        },
      ],
    }
  }

  if (view === 'questLocked') {
    return {
      id: 'quest-locked',
      lines: [
        {
          id: 'quest-locked-1',
          speaker: '振翔',
          text: '现在还不适合深入青苔原，等你准备好再来。',
        },
      ],
      options: [
        {
          id: 'quest-locked-back',
          label: '回到主菜单',
          action: () => ({ type: 'view', viewId: 'root' }),
        },
      ],
    }
  }

  return {
    id: 'root',
    title: '卫兵 振翔',
    lines: [
    ],
    options: [
      {
        id: 'opt-chat',
        label: '闲聊',
        action: () => ({ type: 'view', viewId: 'chat' }),
      },
      {
        id: 'opt-quest',
        label: questDefinition?.name ?? '青苔原的黏液祸患',
        hint: questStatus === 'readyToTurnIn' ? '可提交' : ('active' === questStatus ? '进行中' : (questStatus === 'available' ? '可接受' : '')),
        kind: 'quest',
        action: () => ({ type: 'view', viewId: resolveQuestEntryView(questStatus) }),
      },
      {
        id: 'opt-leave',
        label: '离开',
        action: () => ({ type: 'close' }),
      },
    ],
  }
}

export const NPC_DEFINITIONS: NpcDefinition[] = [
  {
    id: 'guard-zhenxiang',
    name: '卫兵 振翔',
    title: '青苔原驻防',
    description: '负责记录青苔原生态状况的卫兵，性格依旧严谨。',
    portrait: {
      image: 'npc-guard-zhenxiang.webp',
    },
    script: guardZhenxiangScript,
  },
]

export const NPC_MAP = NPC_DEFINITIONS.reduce(
  (acc, npc) => {
    acc[npc.id] = npc
    return acc
  },
  {} as Record<string, NpcDefinition>,
)
