import { Buffer } from 'buffer'
import type { AiNpcTtsSettings } from '@/types/ai-npc'
export const DEFAULT_RESOURCE_ID = 'seed-tts-1.0'
export const DEFAULT_TTS_ENDPOINT = 'https://openspeech.bytedance.com/api/v3/tts/unidirectional'
export const DEFAULT_SAMPLE_RATE = 24000
const FIXED_FORMAT = 'pcm'

export interface PcmChunk {
  data: Int16Array
  sampleRate: number
}

export interface StreamOnceParams {
  text: string
  voiceId?: string
  settings: AiNpcTtsSettings
  signal?: AbortSignal
}

function voiceToResourceId(voiceId: string | undefined): string {
  if (!voiceId) return DEFAULT_RESOURCE_ID
  if (voiceId.startsWith('S_')) {
    return 'volc.megatts.default'
  }
  return DEFAULT_RESOURCE_ID
}

function buildHeaders(settings: AiNpcTtsSettings, resourceId: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (settings.appId) {
    headers['X-Api-App-Key'] = settings.appId
  }
  if (settings.accessKey) headers['X-Api-Access-Key'] = settings.accessKey
  if (resourceId) headers['X-Api-Resource-Id'] = resourceId
  return headers
}

function buildPayload(params: StreamOnceParams, voiceId: string, sampleRate: number) {
  return {
    user: { uid: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : 'ai-npc-tts' },
    req_params: {
      speaker: voiceId,
      text: params.text,
      audio_params: {
        format: FIXED_FORMAT,
        sample_rate: sampleRate,
        enable_timestamp: true,
      },
      additions: JSON.stringify({ disable_markdown_filter: true }),
    },
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  try {
    if (typeof atob === 'function') {
      const binary = atob(base64)
      const len = binary.length
      const bytes = new Uint8Array(len)
      for (let i = 0; i < len; i += 1) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    }
  } catch {
    // fall through to Buffer path
  }
  return Uint8Array.from(Buffer.from(base64, 'base64'))
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError')
  return new Error('Aborted')
}

export function streamOnce(params: StreamOnceParams): AsyncIterable<PcmChunk> {
  async function* run() {
    const voice = params.voiceId?.trim() || params.settings.defaultVoiceId || ''
    if (!voice) throw new Error('缺少 TTS 音色配置')
    const resourceId = params.settings.resourceId?.trim() || voiceToResourceId(voice)
    const endpoint = params.settings.endpoint?.trim() || DEFAULT_TTS_ENDPOINT
    const sampleRate = params.settings.sampleRate && params.settings.sampleRate > 0 ? params.settings.sampleRate : DEFAULT_SAMPLE_RATE
    const payload = buildPayload(params, voice, sampleRate)
    const headers = buildHeaders(params.settings, resourceId)

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: params.signal,
    })
    if (!resp.ok) {
      throw new Error(`TTS HTTP 调用失败：${resp.status} ${resp.statusText}`)
    }
    if (!resp.body) {
      throw new Error('TTS 响应无流数据')
    }

    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let audioReceived = false
    let aborted = false

    params.signal?.addEventListener(
      'abort',
      () => {
        aborted = true
      },
      { once: true },
    )

    const flushLine = (line: string) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed[0] !== '{') return { chunk: null as Uint8Array | null, done: false }
      try {
        const data = JSON.parse(trimmed) as { code?: number; data?: string; message?: string }
        if (data.data) {
          const bin = base64ToUint8Array(data.data)
          audioReceived = audioReceived || bin.byteLength > 0
          return { chunk: bin, done: false }
        }
        if (data.code === 20000000) {
          return { chunk: null, done: true }
        }
        if (data.code && data.code !== 0) {
          throw new Error(`TTS 返回错误：${data.code}${data.message ? ` ${data.message}` : ''}`)
        }
      } catch (err) {
        console.error('[ai-npc][tts] parse line failed', err, trimmed.slice(0, 120))
      }
      return { chunk: null, done: false }
    }

    while (true) {
      if (aborted) throw createAbortError()
      const { value, done } = await reader.read()
      if (done) break
      if (!value) continue
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
      const { chunk, done: lineDone } = flushLine(line)
      if (chunk && chunk.length) {
        yield { data: new Int16Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)), sampleRate }
      }
      if (lineDone) {
        if (!audioReceived) throw new Error('TTS 未返回音频数据')
        return
      }
      }
    }

    if (buffer.trim().length) {
      const { chunk, done } = flushLine(buffer)
      if (chunk && chunk.length) {
        yield { data: new Int16Array(chunk.buffer.slice(chunk.byteOffset, chunk.byteOffset + chunk.byteLength)), sampleRate }
        audioReceived = true
      }
      if (done && !audioReceived) {
        throw new Error('TTS 未返回音频数据')
      }
    }

    if (!audioReceived) {
      console.error('[ai-npc][tts][http] stream ended without audio')
      throw new Error('TTS 未返回音频数据')
    }
  }

  return run()
}
