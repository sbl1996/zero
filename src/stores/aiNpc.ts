import { defineStore } from 'pinia'
import type { ChatCompletionMessageParam, ChatCompletionTool } from 'openai/resources/chat/completions'
import { NPC_MAP } from '@/data/npcs'
import { maps } from '@/data/maps'
import { streamAiNpcResponse } from '@/services/aiNpcClient'
import type {
  AiNpcMessage,
  AiNpcSettings,
  AiNpcStatusSnapshot,
  AiNpcToolCall,
  AiNpcToolResult,
  AiQuestStatus,
} from '@/types/ai-npc'
import { ITEMS } from '@/data/items'
import { QUEST_ITEM_DEFINITIONS } from '@/data/quests'
import type { QuestReward, QuestRuntimeStatus } from '@/types/domain'
import { useQuestStore } from './quests'
import { usePlayerStore } from './player'
import { useQuestOverlayStore } from './questOverlay'

interface AiNpcSessionState {
  npcId: string
  messages: AiNpcMessage[]
  statusSnapshot: AiNpcStatusSnapshot | null
  loading: boolean
  error: string | null
  streamAbort?: AbortController | null
}

const SETTINGS_STORAGE_KEY = 'ai-npc-settings'

function numberOr<T extends number>(value: unknown, fallback: T): T {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed === 'number' && Number.isFinite(parsed)) return parsed as T
  return fallback
}

function normalizeSettings(partial: Partial<AiNpcSettings>, fallback: AiNpcSettings): AiNpcSettings {
  return {
    apiKey: partial.apiKey?.trim() ?? fallback.apiKey,
    baseUrl: partial.baseUrl?.trim() ?? fallback.baseUrl,
    model: partial.model?.trim() ?? fallback.model,
    temperature: Math.max(0, numberOr(partial.temperature, fallback.temperature)),
    timeoutMs: Math.max(1000, numberOr(partial.timeoutMs, fallback.timeoutMs)),
    historyLimit: Math.max(6, numberOr(partial.historyLimit, fallback.historyLimit)),
    maxRetries: Math.max(0, numberOr(partial.maxRetries, fallback.maxRetries)),
  }
}

function loadDefaultSettings(): AiNpcSettings {
  const env = import.meta.env
  const defaults: AiNpcSettings = {
    apiKey: env.VITE_AI_NPC_API_KEY || '',
    baseUrl: env.VITE_AI_NPC_BASE_URL || '',
    model: env.VITE_AI_NPC_MODEL || 'deepseek-chat',
    temperature: numberOr(env.VITE_AI_NPC_TEMPERATURE, 1),
    timeoutMs: numberOr(env.VITE_AI_NPC_TIMEOUT_MS, 20000),
    historyLimit: numberOr(env.VITE_AI_NPC_HISTORY_LIMIT, 18),
    maxRetries: numberOr(env.VITE_AI_NPC_MAX_RETRIES, 1),
  }

  if (typeof window === 'undefined') return defaults
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!stored) return defaults
    const parsed = JSON.parse(stored) as Partial<AiNpcSettings>
    return normalizeSettings(parsed, defaults)
  } catch (err) {
    console.warn('[ai-npc] Failed to parse stored settings', err)
    return defaults
  }
}

function persistSettings(settings: AiNpcSettings) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (err) {
    console.warn('[ai-npc] Failed to persist settings', err)
  }
}

let messageSequence = 1
function nextMessageId(prefix = 'm'): string {
  messageSequence += 1
  return `${prefix}-${Date.now()}-${messageSequence}`
}

const QUEST_ITEM_NAME_MAP = QUEST_ITEM_DEFINITIONS.reduce(
  (acc, item) => {
    acc[item.id] = item.name
    return acc
  },
  {} as Record<string, string>,
)

function resolveItemName(itemId: string): string {
  const found = ITEMS.find(item => item.id === itemId)
  return found?.name ?? QUEST_ITEM_NAME_MAP[itemId] ?? itemId
}

function summarizeReward(reward: QuestReward | undefined) {
  if (!reward) return '奖励未知'
  const parts: string[] = []
  if (reward.gold) parts.push(`${reward.gold} 金币`)
  if (reward.items?.length) {
    reward.items.forEach((item) => {
      parts.push(`${resolveItemName(item.itemId)} x${item.quantity}`)
    })
  }
  if (reward.equipmentTemplates?.length) {
    parts.push(`装备图纸 x${reward.equipmentTemplates.length}`)
  }
  if (reward.skillUnlocks?.length) {
    parts.push(`技能解锁 x${reward.skillUnlocks.length}`)
  }
  return parts.length ? parts.join('，') : '无额外物资'
}

function formatUserPrompt(status: AiNpcStatusSnapshot, input: string) {
  return [
    '[Status Info]:',
    JSON.stringify(status),
    '',
    '<user_input>',
    input,
    '</user_input>',
  ].join('\n')
}

function mapQuestStatus(status: QuestRuntimeStatus): AiQuestStatus {
  if (status === 'active') return 'active'
  if (status === 'readyToTurnIn') return 'can_submit'
  return 'not_started'
}

function toChatMessage(message: AiNpcMessage): ChatCompletionMessageParam | null {
  if (message.role === 'system') return null
  if (message.role === 'assistant' && message.toolCalls?.length) {
    return {
      role: 'assistant',
      content: message.content || null,
      tool_calls: message.toolCalls.map(call => ({
        id: call.id,
        type: 'function' as const,
        function: {
          name: call.name,
          arguments: call.arguments,
        },
      })),
      ...(message.reasoningContent ? { reasoning_content: message.reasoningContent } : {}),
    } as ChatCompletionMessageParam
  }
  if (message.role === 'tool') {
    return {
      role: 'tool',
      content: message.content,
      tool_call_id: message.toolCallId ?? message.toolCalls?.[0]?.id,
    }
  }
  return {
    role: message.role,
    content: message.content,
  }
}

function cleanContext(messages: ChatCompletionMessageParam[]): ChatCompletionMessageParam[] {
  const keyword = '<user_input>'
  let keepFull = false
  const sanitized: ChatCompletionMessageParam[] = []

  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i]
    if (m.role === 'user' && typeof m.content === 'string') {
      if (!keepFull) {
        keepFull = true
        sanitized.push(m)
      } else {
        const idx = m.content.indexOf(keyword)
        sanitized.push({
          ...m,
          content: idx >= 0 ? m.content.slice(idx) : m.content,
        })
      }
    } else {
      sanitized.push(m)
    }
  }

  const reversed = sanitized.reverse()
  let endIndex = reversed.length
  if (
    reversed.length >= 2 &&
    reversed[endIndex - 1]?.role === 'tool' &&
    reversed[endIndex - 2]?.role === 'assistant' &&
    (reversed[endIndex - 2] as any).tool_calls
  ) {
    endIndex -= 2
  } else if (
    reversed[endIndex - 1]?.role === 'assistant' &&
    (reversed[endIndex - 1] as any).tool_calls
  ) {
    endIndex -= 1
  }

  const filtered: ChatCompletionMessageParam[] = []
  for (let i = 0; i < endIndex; i += 1) {
    const m = reversed[i]
    if (m.role === 'tool') continue
    if (m.role === 'assistant' && (m as any).tool_calls) continue
    filtered.push(m)
  }
  return filtered.concat(reversed.slice(endIndex))
}

function trimHistory(
  messages: ChatCompletionMessageParam[],
  limit: number,
): ChatCompletionMessageParam[] {
  if (messages.length <= limit) return messages
  return messages.slice(messages.length - limit)
}

export const useAiNpcStore = defineStore('ai-npc', {
  state: () => ({
    isOpen: false,
    activeNpcId: null as string | null,
    sessions: {} as Record<string, AiNpcSessionState>,
    settings: loadDefaultSettings(),
    playerName: '',
  }),
  getters: {
    activeSession(state): AiNpcSessionState | null {
      if (!state.activeNpcId) return null
      return state.sessions[state.activeNpcId] ?? null
    },
    activeNpc() {
      if (!this.activeNpcId) return null
      return NPC_MAP[this.activeNpcId] ?? null
    },
  },
  actions: {
    setPlayerName(name: string) {
      this.playerName = name
    },
    open(npcId: string) {
      this.activeNpcId = npcId
      this.isOpen = true
      this.ensureSession(npcId)
    },
    close() {
      this.isOpen = false
      this.activeNpcId = null
    },
    ensureSession(npcId: string): AiNpcSessionState {
      if (!this.sessions[npcId]) {
        this.sessions[npcId] = {
          npcId,
          messages: [],
          statusSnapshot: null,
          loading: false,
          error: null,
          streamAbort: null,
        }
      }
      return this.sessions[npcId]
    },
    setSettings(next: Partial<AiNpcSettings>) {
      const merged = normalizeSettings({ ...this.settings, ...next }, this.settings)
      this.settings = merged
      persistSettings(merged)
    },
    resetSession(npcId: string) {
      this.sessions[npcId] = {
        npcId,
        messages: [],
        statusSnapshot: null,
        loading: false,
        error: null,
        streamAbort: null,
      }
    },
    buildStatusSnapshot(npcId: string, questId: string): AiNpcStatusSnapshot {
      const quests = useQuestStore()
      const player = usePlayerStore()
      const status = mapQuestStatus(quests.getStatus(questId))
      const questDef = quests.definitionMap[questId]
      const progressEntry = quests.progressOf(questId)
      const objective = questDef?.objectives?.[0]
      const target = objective && 'amount' in objective ? objective.amount : 0
      let progress = 0
      if (objective && progressEntry) {
        const p = progressEntry.objectives?.[objective.id]
        progress = p?.current ?? 0
        if (status === 'can_submit' && target > 0) {
          progress = target
        }
      }

      const questItem = objective && 'itemId' in objective ? QUEST_ITEM_NAME_MAP[objective.itemId] ?? objective.itemId : undefined
      const location = this.resolveNpcLocationLabel(npcId) ?? questDef?.location

      return {
        quest_id: questId,
        status,
        progress,
        target,
        quest_item: questItem,
        location: location ?? undefined,
        player_name: player.name || '冒险者',
      }
    },
    resolveNpcLocationLabel(npcId: string): string | null {
      for (const map of maps) {
        if (map.category === 'city') {
          for (const loc of map.locations) {
            if (loc.npcs?.includes(npcId)) return loc.name
          }
        }
        if (map.nodes) {
          const node = map.nodes.find(entry => entry.npcs?.includes(npcId))
          if (node) return node.label
        }
      }
      return null
    },
    buildRequestMessages(npcId: string) {
      const npc = NPC_MAP[npcId]
      if (!npc?.aiProfile) return []
      let session = this.ensureSession(npcId)
      const contextMessages = session.messages
        .filter(msg => !msg.isStreaming)
        .map(toChatMessage)
        .filter((msg): msg is ChatCompletionMessageParam => !!msg)
      const cleaned = cleanContext(contextMessages)
      const trimmed = trimHistory(cleaned, this.settings.historyLimit)
      return [
        { role: 'system', content: npc.aiProfile.systemPrompt },
        ...trimmed,
      ] as ChatCompletionMessageParam[]
    },
    buildTools(npcId: string): ChatCompletionTool[] {
      const npc = NPC_MAP[npcId]
      if (!npc?.aiProfile) return []
      return npc.aiProfile.tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: 'object',
            properties: {
              player_id: { type: 'string' },
            },
            required: ['player_id'],
          },
        },
      }))
    },
    touchMessages(session: AiNpcSessionState): AiNpcSessionState {
      const nextSession: AiNpcSessionState = {
        ...session,
        messages: session.messages.slice(),
      }
      this.sessions = { ...this.sessions, [session.npcId]: nextSession }
      return nextSession
    },
    appendMessage(session: AiNpcSessionState, message: AiNpcMessage) {
      session.messages.push(message)
      const maxStored = Math.max(this.settings.historyLimit + 6, 24)
      if (session.messages.length > maxStored) {
        session.messages.splice(0, session.messages.length - maxStored)
      }
    },
    async dispatchToolCall(npcId: string, toolCall: AiNpcToolCall): Promise<AiNpcToolResult> {
      const npc = NPC_MAP[npcId]
      const questId = npc?.aiProfile?.questId
      if (!questId) return { ok: false, message: '未知任务，无法执行工具。' }
      const quests = useQuestStore()
      const questOverlay = useQuestOverlayStore()
      const questDef = quests.definitionMap[questId]
      if (toolCall.name === 'accept_quest') {
        const status = quests.getStatus(questId)
        if (status !== 'available' && status !== 'completed') {
          return { ok: false, message: '接取失败：任务当前不可领取。' }
        }
        const accepted = quests.accept(questId)
        if (!accepted) {
          return { ok: false, message: '接取失败：状态不满足或已接取。' }
        }
        questOverlay.showAccepted(questId, questDef?.name ?? '任务', '任务已记录，可在任务页查看进度。')
        return { ok: true, message: '任务已接受。' }
      }

      if (toolCall.name === 'submit_quest') {
        const status = quests.getStatus(questId)
        if (status !== 'readyToTurnIn') {
          return { ok: false, message: '提交失败：任务尚未完成。' }
        }
        const rewards = quests.submit(questId)
        if (!rewards) {
          return { ok: false, message: '提交失败：背包或状态异常。' }
        }
        questOverlay.showReward(
          questId,
          questDef?.name ?? '任务',
          rewards,
          rewards.notes ?? '奖励已发放。',
        )
        return {
          ok: true,
          message: '任务已提交，奖励发放完毕。',
          rewardsSummary: summarizeReward(questDef?.rewards),
        }
      }

      return { ok: false, message: '未知工具调用，已忽略。' }
    },
    async sendUserMessage(input: string) {
      if (!this.activeNpcId) return
      const npcId = this.activeNpcId
      const npc = NPC_MAP[npcId]
      if (!npc || npc.mode !== 'ai' || !npc.aiProfile) return

      let session = this.ensureSession(npcId)
      if (session.loading) return
      if (!this.settings.apiKey) {
        session.error = '（系统暂时不可用：缺少 API Key）'
        return
      }

      session.error = null
      const status = this.buildStatusSnapshot(npcId, npc.aiProfile.questId)
      session.statusSnapshot = status

      const userMessage: AiNpcMessage = {
        id: nextMessageId('user'),
        role: 'user',
        content: formatUserPrompt(status, input),
        displayContent: input,
      }
      this.appendMessage(session, userMessage)

      await this.runAssistantTurn(npcId, { toolChoice: 'auto' })
    },
    async runAssistantTurn(
      npcId: string,
      options: { toolChoice?: 'auto' | 'none' } = {},
    ) {
      const npc = NPC_MAP[npcId]
      if (!npc?.aiProfile) return
      let session = this.ensureSession(npcId)
      const status = this.buildStatusSnapshot(npcId, npc.aiProfile.questId)
      session.statusSnapshot = status

      const assistantMessage: AiNpcMessage = {
        id: nextMessageId('assistant'),
        role: 'assistant',
        content: '',
        displayContent: '',
        reasoningContent: '',
        isStreaming: true,
        toolCallPending: false,
      }
      this.appendMessage(session, assistantMessage)
      let streamingMessage = session.messages[session.messages.length - 1]
      if (!streamingMessage) return

      const controller = new AbortController()
      let timeout: ReturnType<typeof setTimeout> | null = null
      if (typeof window !== 'undefined') {
        timeout = window.setTimeout(() => {
          controller.abort()
        }, this.settings.timeoutMs)
      }
      session.streamAbort = controller
      session.loading = true

      const messages = this.buildRequestMessages(npcId)
      const tools = this.buildTools(npcId)

      let sawToolCall = false
      try {
        const result = await streamAiNpcResponse({
          settings: this.settings,
          messages,
          tools,
          toolChoice: options.toolChoice ?? 'auto',
          signal: controller.signal,
          callbacks: {
            onReasoningDelta: (text) => {
              if (streamingMessage.toolCallPending) return
              streamingMessage.displayContent += text
              streamingMessage.reasoningContent = (streamingMessage.reasoningContent ?? '') + text
              session = this.touchMessages(session)
              streamingMessage = session.messages[session.messages.length - 1] ?? streamingMessage
            },
            onContentDelta: (text) => {
              if (streamingMessage.toolCallPending) return
              streamingMessage.displayContent += text
              streamingMessage.content += text
              session = this.touchMessages(session)
              streamingMessage = session.messages[session.messages.length - 1] ?? streamingMessage
            },
            onToolCallDelta: (delta) => {
              sawToolCall = true
              streamingMessage.toolCallPending = true
              streamingMessage.displayContent = '…'
              const existing = streamingMessage.toolCalls ?? []
              const nextCalls = [...existing]
              nextCalls[delta.index] = {
                id: delta.id ?? `call-${delta.index}`,
                name: (delta.name as AiNpcToolCall['name']) ?? 'accept_quest',
                arguments: delta.arguments ?? '',
              }
              streamingMessage.toolCalls = nextCalls
              session = this.touchMessages(session)
              streamingMessage = session.messages[session.messages.length - 1] ?? streamingMessage
            },
          },
        })

        streamingMessage.isStreaming = false
        streamingMessage.reasoningContent = result.reasoningContent
        streamingMessage.content = result.content
        // Ensure we don't leave the placeholder ellipsis when the model
        // returns both tool calls and a content string in the same turn.
        streamingMessage.displayContent = result.content?.trim()
          ? result.content
          : streamingMessage.displayContent
        streamingMessage.toolCalls = result.toolCalls.map(call => ({
          id: call.id,
          name: call.function.name as AiNpcToolCall['name'],
          arguments: call.function.arguments,
        }))
        streamingMessage.toolCallPending = sawToolCall
        session = this.touchMessages(session)

        if (result.toolCalls.length > 0) {
          await this.handleToolCalls(npcId, streamingMessage, result.toolCalls)
          // Sync latest session state after nested turn and clear loading.
          session = this.sessions[npcId] ?? session
          session.loading = false
        } else {
          session.loading = false
        }
      } catch (err) {
        console.error('[ai-npc] stream failed', err)
        streamingMessage.isStreaming = false
        streamingMessage.toolCallPending = false
        streamingMessage.displayContent = '（调用失败，可重试）'
        streamingMessage.error = true
        session.error = '（系统暂时不可用）'
        session.loading = false
        session = this.touchMessages(session)
      } finally {
        if (timeout) {
          window.clearTimeout(timeout)
        }
        session.streamAbort = null
        this.sessions = { ...this.sessions, [npcId]: session }
      }
    },
    async handleToolCalls(
      npcId: string,
      assistantMessage: AiNpcMessage,
      toolCalls: { id: string; function: { name: string; arguments: string } }[],
    ) {
      const npc = NPC_MAP[npcId]
      if (!npc?.aiProfile) return
      const session = this.ensureSession(npcId)
      for (const tc of toolCalls) {
        const result = await this.dispatchToolCall(npcId, {
          id: tc.id,
          name: tc.function.name as AiNpcToolCall['name'],
          arguments: tc.function.arguments,
        })
        const toolMessage: AiNpcMessage = {
          id: nextMessageId('tool'),
          role: 'tool',
          content: JSON.stringify({
            ok: result.ok,
            message: result.message,
            rewards: result.rewardsSummary,
          }),
          displayContent: result.rewardsSummary
            ? `${result.message} (${result.rewardsSummary})`
            : result.message,
          toolCallId: tc.id,
        }
        this.appendMessage(session, toolMessage)
        session.statusSnapshot = this.buildStatusSnapshot(npcId, npc.aiProfile.questId)
      }

      assistantMessage.toolCallPending = false

      // Follow-up response to let the model explain the result.
      await this.runAssistantTurn(npcId, { toolChoice: 'none' })
    },
    async retryLastMessage() {
      if (!this.activeNpcId) return
      const session = this.ensureSession(this.activeNpcId)
      const lastUser = [...session.messages].reverse().find(msg => msg.role === 'user')
      if (!lastUser) return
      await this.sendUserMessage(lastUser.displayContent)
    },
  },
})
