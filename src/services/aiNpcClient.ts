import OpenAI from 'openai'
import type {
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
} from 'openai/resources/chat/completions'
import type { AiNpcSettings } from '@/types/ai-npc'

export interface ToolCallDelta {
  index: number
  id?: string
  name?: string
  arguments?: string
}

export interface StreamCallbacks {
  onReasoningDelta?: (text: string) => void
  onContentDelta?: (text: string) => void
  onToolCallDelta?: (delta: ToolCallDelta) => void
}

export interface StreamResult {
  content: string
  reasoningContent: string
  toolCalls: FunctionToolCall[]
  finishReason?: string | null
}

type FunctionToolCall = Extract<ChatCompletionMessageToolCall, { type: 'function' }>

type StreamParams = {
  settings: AiNpcSettings
  messages: ChatCompletionMessageParam[]
  tools?: ChatCompletionTool[]
  toolChoice?: 'auto' | 'none'
  signal?: AbortSignal
  callbacks?: StreamCallbacks
}

async function streamOnce(params: StreamParams): Promise<StreamResult> {
  const { settings, messages, tools, signal, callbacks } = params
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseUrl || undefined,
    dangerouslyAllowBrowser: true,
    timeout: settings.timeoutMs,
    maxRetries: 0,
  })

  const resp = await client.chat.completions.create(
    {
      model: settings.model,
      messages,
      tools,
      tool_choice: params.toolChoice ?? (tools?.length ? 'auto' : undefined),
      temperature: settings.temperature,
      stream: true,
    },
    { signal },
  )
  console.log(messages)

  const toolCallsBuffer: Record<number, { id?: string; name?: string; arguments: string }> = {}
  let content = ''
  let reasoningContent = ''
  let finishReason: string | null | undefined

  for await (const chunk of resp) {
    const choice = chunk.choices?.[0]
    const delta = choice?.delta
    finishReason = choice?.finish_reason ?? finishReason

    const reasoning = (delta as any)?.reasoning_content as string | undefined
    if (reasoning) {
      callbacks?.onReasoningDelta?.(reasoning)
      reasoningContent += reasoning
    }

    if (delta?.content) {
      callbacks?.onContentDelta?.(delta.content)
      content += delta.content
    }

    if (delta?.tool_calls) {
      delta.tool_calls.forEach((call) => {
        const index = call.index ?? 0
        const existing = toolCallsBuffer[index] ?? { arguments: '' }
        if (call.id) existing.id = call.id
        const fn = call.function as { name?: string; arguments?: string } | undefined
        if (fn?.name) existing.name = fn.name
        if (fn?.arguments) {
          existing.arguments += fn.arguments
        }
        toolCallsBuffer[index] = existing
        callbacks?.onToolCallDelta?.({
          index,
          id: existing.id,
          name: existing.name,
          arguments: existing.arguments,
        })
      })
    }
  }

  const toolCalls: FunctionToolCall[] = Object.keys(toolCallsBuffer)
    .map(key => Number(key))
    .sort((a, b) => a - b)
    .map((key) => {
      const call = toolCallsBuffer[key] ?? { arguments: '' }
      return {
        id: call.id ?? `call-${key}`,
        type: 'function' as const,
        function: {
          name: call.name ?? '',
          arguments: call.arguments ?? '',
        },
      }
    })

  return { content, reasoningContent, toolCalls, finishReason }
}

export async function streamAiNpcResponse(params: StreamParams): Promise<StreamResult> {
  const retries = Math.max(0, params.settings.maxRetries ?? 0)
  let attempt = 0
  let lastError: unknown

  while (attempt <= retries) {
    try {
      return await streamOnce(params)
    } catch (err) {
      lastError = err
      if (params.signal?.aborted) throw err
      attempt += 1
      if (attempt > retries) break
    }
  }

  throw lastError ?? new Error('AI NPC request failed')
}
