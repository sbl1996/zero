import type { QuestDefinition, QuestProgressEntry, QuestRuntimeStatus } from '@/types/domain'
import type { useQuestStore } from '@/stores/quests'

export type NpcMode = 'script' | 'ai'

export interface AiNpcToolDefinition {
  name: 'accept_quest' | 'submit_quest'
  description: string
}

export interface AiNpcProfile {
  questId: string
  systemPrompt: string
  tools: AiNpcToolDefinition[]
}

export interface DialogueLine {
  id: string
  speaker?: string
  text: string
}

export interface DialogueOption {
  id: string
  label: string
  hint?: string
  disabled?: boolean
  kind?: 'quest'
  nextViewId?: string
  action?: DialogueActionHandler
}

export interface DialoguePage {
  id: string
  title?: string
  lines: DialogueLine[]
  options: DialogueOption[]
}

export type DialogueActionResult = { type: 'none' } | { type: 'view'; viewId: string } | { type: 'close' }

export type DialogueActionHandler = (context: DialogueContext) => DialogueActionResult | void

export interface DialogueState {
  viewId: string
  payload?: Record<string, unknown>
}

export interface DialogueContext {
  state: DialogueState
  setState: (state: DialogueState) => void
  close: () => void
  quests: ReturnType<typeof useQuestStore>
}

export interface NpcDefinition {
  id: string
  name: string
  title?: string
  description?: string
  portrait?: {
    image?: string
    variant?: 'default' | 'silhouette'
  }
  mode?: NpcMode
  aiProfile?: AiNpcProfile
  script?: (context: DialogueScriptContext) => DialoguePage
}

export interface DialogueScriptContext extends DialogueContext {
  questStatus: (questId: string) => QuestRuntimeStatus
  questDefinition: (questId: string) => QuestDefinition | undefined
  questProgress: (questId: string) => QuestProgressEntry | null
}
