import { defineStore } from 'pinia'
import type { QuestReward } from '@/types/domain'

type OverlayKind = 'accepted' | 'reward'

export interface QuestOverlayNotice {
  kind: OverlayKind
  questId: string
  questName: string
  message?: string
  rewards?: QuestReward
}

const DEFAULT_DURATION = 6000

export const useQuestOverlayStore = defineStore('quest-overlay', {
  state: () => ({
    notice: null as QuestOverlayNotice | null,
    timeoutId: null as ReturnType<typeof setTimeout> | null,
  }),
  actions: {
    showAccepted(questId: string, questName: string, message?: string) {
      this.setNotice({
        kind: 'accepted',
        questId,
        questName,
        message: message ?? '任务已记录至日志。',
      })
    },
    showReward(questId: string, questName: string, rewards: QuestReward, message?: string) {
      this.setNotice({
        kind: 'reward',
        questId,
        questName,
        rewards,
        message,
      })
    },
    setNotice(notice: QuestOverlayNotice | null) {
      this.notice = notice
      if (this.timeoutId) {
        clearTimeout(this.timeoutId)
        this.timeoutId = null
      }
      if (notice) {
        this.timeoutId = setTimeout(() => {
          this.clear()
        }, DEFAULT_DURATION)
      }
    },
    clear() {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId)
        this.timeoutId = null
      }
      this.notice = null
    },
  },
})
