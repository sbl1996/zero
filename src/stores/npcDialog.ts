import { defineStore } from 'pinia'
import { NPC_MAP } from '@/data/npcs'
import type { DialoguePage, DialogueScriptContext, DialogueState } from '@/types/npc'
import { useQuestStore } from './quests'

interface ScriptEnvironment {
  page: DialoguePage
  context: DialogueScriptContext
}

function defaultDialogueState(): DialogueState {
  return {
    viewId: 'root',
    payload: undefined,
  }
}

export const useNpcDialogStore = defineStore('npc-dialog', {
  state: () => ({
    isOpen: false,
    activeNpcId: null as string | null,
    dialogueState: defaultDialogueState(),
  }),
  getters: {
    activeNpc(state) {
      if (!state.activeNpcId) return null
      return NPC_MAP[state.activeNpcId] ?? null
    },
  },
  actions: {
    open(npcId: string) {
      this.activeNpcId = npcId
      this.dialogueState = defaultDialogueState()
      this.isOpen = true
    },
    close() {
      this.isOpen = false
      this.activeNpcId = null
      this.dialogueState = defaultDialogueState()
    },
    setDialogueState(state: DialogueState) {
      this.dialogueState = {
        viewId: state.viewId,
        payload: state.payload,
      }
    },
    setView(viewId: string) {
      this.setDialogueState({ viewId })
    },
    selectOption(optionId: string) {
      const env = this.createScriptEnvironment()
      if (!env) return
      const option = env.page.options.find(entry => entry.id === optionId)
      if (!option) return
      let result = option.action?.(env.context)
      if (!result && option.nextViewId) {
        result = { type: 'view', viewId: option.nextViewId }
      }
      if (!result || result.type === 'none') return
      if (result.type === 'close') {
        this.close()
      } else if (result.type === 'view') {
        this.setView(result.viewId)
      }
    },
    getCurrentPage(): DialoguePage | null {
      const env = this.createScriptEnvironment()
      return env?.page ?? null
    },
    createScriptEnvironment(): ScriptEnvironment | null {
      if (!this.isOpen || !this.activeNpcId) return null
      const npc = NPC_MAP[this.activeNpcId]
      if (!npc) return null
      const quests = useQuestStore()
      const context: DialogueScriptContext = {
        state: this.dialogueState,
        setState: (state: DialogueState) => {
          this.setDialogueState(state)
        },
        close: () => this.close(),
        quests,
        questStatus: (questId: string) => quests.getStatus(questId),
        questDefinition: (questId: string) => quests.definitionMap[questId],
        questProgress: (questId: string) => quests.progressOf(questId),
      }
      const page = npc.script(context)
      return { page, context }
    },
  },
})
