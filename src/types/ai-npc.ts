export type AiQuestStatus = 'not_started' | 'active' | 'can_submit'

export interface AiNpcStatusSnapshot {
  quest_id: string
  status: AiQuestStatus
  progress: number
  target: number
  quest_item?: string
  location?: string
  player_name?: string
}

export type AiNpcMessageRole = 'user' | 'assistant' | 'tool' | 'system'

export interface AiNpcToolCall {
  id: string
  name: 'accept_quest' | 'submit_quest'
  arguments: string
}

export interface AiNpcMessage {
  id: string
  role: AiNpcMessageRole
  content: string
  displayContent: string
  reasoningContent?: string
  toolCalls?: AiNpcToolCall[]
  toolCallId?: string
  isStreaming?: boolean
  toolCallPending?: boolean
  error?: boolean
}

export interface AiNpcToolResult {
  ok: boolean
  message: string
  rewardsSummary?: string
}

export interface AiNpcSettings {
  apiKey: string
  baseUrl: string
  model: string
  temperature: number
  timeoutMs: number
  historyLimit: number
  maxRetries: number
}
