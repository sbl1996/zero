import { useBgmStore } from '@/stores/bgm'
import pcmWorkerUrl from './pcmPlayerWorklet?worker&url'
import type { PcmChunk } from './aiNpcTtsClient'

export interface PlayPcmStreamOptions {
  npcId: string
  stream: AsyncIterable<PcmChunk>
  cacheKey?: string
  sampleRate?: number
  signal?: AbortSignal
  onStart?: () => void
  onStop?: () => void
  onError?: (err: unknown) => void
}

interface CachedAudio {
  cacheKey: string
  audio: Float32Array
  sampleRate: number
}

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') return new DOMException('Aborted', 'AbortError')
  return new Error('Aborted')
}

function int16ToFloat32(data: Int16Array): Float32Array {
  const floatData = new Float32Array(data.length)
  for (let i = 0; i < data.length; i += 1) {
    const sample = data[i] ?? 0
    floatData[i] = Math.max(-1, Math.min(1, sample / 32768))
  }
  return floatData
}

function resampleIfNeeded(data: Float32Array, fromRate: number, targetRate: number): Float32Array {
  if (fromRate === targetRate || !fromRate || !targetRate) return data
  const ratio = targetRate / fromRate
  const outLength = Math.max(1, Math.floor(data.length * ratio))
  const out = new Float32Array(outLength)
  for (let i = 0; i < outLength; i += 1) {
    const pos = i / ratio
    const idx = Math.floor(pos)
    const frac = pos - idx
    const nextIdx = Math.min(idx + 1, data.length - 1)
    const v0 = data[idx] ?? 0
    const v1 = data[nextIdx] ?? 0
    out[i] = v0 + (v1 - v0) * frac
  }
  return out
}

function mergeFloat32Chunks(chunks: Float32Array[]): Float32Array {
  if (!chunks.length) return new Float32Array(0)
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const merged = new Float32Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.length
  }
  return merged
}

type MessageHandler = (event: MessageEvent) => void

interface MessagePortLike {
  postMessage(data: any, transfer?: Transferable[]): void
  addEventListener(type: 'message', listener: MessageHandler): void
  removeEventListener(type: 'message', listener: MessageHandler): void
}

class LocalMessagePort implements MessagePortLike {
  private listeners = new Set<MessageHandler>()

  private readonly onPost?: (data: any) => void

  constructor(onPost?: (data: any) => void) {
    this.onPost = onPost
  }

  postMessage(data: any, _transfer?: Transferable[]) {
    this.onPost?.(data)
  }

  addEventListener(type: 'message', listener: MessageHandler) {
    if (type !== 'message') return
    this.listeners.add(listener)
  }

  removeEventListener(type: 'message', listener: MessageHandler) {
    if (type !== 'message') return
    this.listeners.delete(listener)
  }

  emitMessage(data: any) {
    const event = { data } as MessageEvent
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}

export class AiNpcTtsPlayer {
  private audioContext: AudioContext | null = null

  private currentSource: AudioBufferSourceNode | null = null

  private currentWorklet: AudioWorkletNode | ScriptProcessorNode | null = null

  private currentWorkletPort: MessagePortLike | null = null

  private workletReadyForContext: AudioContext | null = null

  private playbackToken = 0

  private cache = new Map<string, CachedAudio>()

  private ducked: { audio: HTMLAudioElement } | null = null

  stop() {
    this.playbackToken += 1
    this.clearCurrentSource()
    this.clearCurrentWorklet()
    this.restoreBgm()
  }

  private nextToken(): number {
    this.playbackToken += 1
    this.clearCurrentSource()
    this.clearCurrentWorklet()
    this.restoreBgm()
    return this.playbackToken
  }

  async playPcmStream(options: PlayPcmStreamOptions): Promise<void> {
    const token = this.nextToken()
    const ctx = await this.ensureAudioContext(options.sampleRate)
    await this.resumeContext(ctx)

    const { node, port } = await this.createPcmPlayer(ctx)
    this.currentWorklet = node
    this.currentWorkletPort = port
    this.clearCurrentSource()
    node.connect(ctx.destination)

    let started = false
    let audioReceived = false
    let chunkCount = 0
    let finished = false
    let totalSamples = 0
    const cacheChunks: Float32Array[] = []

    let finishCleanup: (() => void) | undefined
    let finishPromiseSetTimer: ((ms: number) => void) | undefined
    let setExpectedEndTime: ((time: number) => void) | undefined
    const finishPromise = new Promise<void>((resolve, reject) => {
      let timerHandle: number | undefined
      let heartbeatHandle: number | undefined
      let settled = false
      let expectedEndTime = 0
      
      const resolveOnce = () => {
        if (settled) return
        settled = true
        resolve()
      }
      const onAbort = () => {
        cleanup()
        reject(createAbortError())
      }
      const onMessage = (event: MessageEvent) => {
        const payload = event.data as { type?: string } | undefined
        if (payload?.type === 'ended') {
          cleanup()
          resolveOnce()
        }
      }
      const cleanup = () => {
        port.removeEventListener('message', onMessage)
        options.signal?.removeEventListener('abort', onAbort)
        finishCleanup = undefined
        if (timerHandle !== undefined) {
          clearTimeout(timerHandle)
          timerHandle = undefined
        }
        if (heartbeatHandle !== undefined) {
          clearInterval(heartbeatHandle)
          heartbeatHandle = undefined
        }
      }
      finishCleanup = cleanup
      port.addEventListener('message', onMessage)
      options.signal?.addEventListener('abort', onAbort, { once: true })

      finishPromiseSetTimer = (ms: number) => {
        if (timerHandle !== undefined) {
          clearTimeout(timerHandle)
        }
        timerHandle = window.setTimeout(() => {
          console.warn('[ai-npc][tts][worklet] timeout reached, forcing completion')
          cleanup()
          resolveOnce()
        }, ms)
        
        // 启动心跳检测：每 200ms 检查一次播放进度
        if (heartbeatHandle !== undefined) {
          clearInterval(heartbeatHandle)
        }
        heartbeatHandle = window.setInterval(() => {
          // 如果当前时间已超过预期结束时间 + 100ms 缓冲
          if (expectedEndTime > 0 && ctx.currentTime >= expectedEndTime + 0.1) {
            cleanup()
            resolveOnce()
          }
        }, 200)
      }
      
      // 暴露设置预期结束时间的方法
      setExpectedEndTime = (time: number) => {
        expectedEndTime = time
      }
    })

    this.duckBgm()

    try {
      for await (const chunk of options.stream) {
        if (options.signal?.aborted || token !== this.playbackToken) {
          throw createAbortError()
        }
        if (!chunk?.data || chunk.data.length === 0) {
          continue
        }
        const floatData = resampleIfNeeded(int16ToFloat32(chunk.data), chunk.sampleRate, ctx.sampleRate)
        const cacheCopy = new Float32Array(floatData)
        cacheChunks.push(cacheCopy)
        const playbackCopy = cacheCopy.slice(0)
        const sampleCount = cacheCopy.length
        port.postMessage({ type: 'chunk', payload: playbackCopy }, [playbackCopy.buffer])
        audioReceived = audioReceived || sampleCount > 0
        chunkCount += 1
        totalSamples += sampleCount
        if (!started) {
          options.onStart?.()
          started = true
        }
      }

      if (!audioReceived && chunkCount === 0) {
        throw new Error('TTS 未返回音频数据')
      }

      port.postMessage({ type: 'done' })
      
      // 记录开始播放的时间点，用于计算实际播放时长
      const playbackStartTime = ctx.currentTime
      const expectedDurationSec = totalSamples / ctx.sampleRate
      const expectedEndTime = playbackStartTime + expectedDurationSec

      // 设置超时为预期时长的 150% + 2秒安全裕度（覆盖极端情况）
      const maxTimeoutMs = Math.ceil(expectedDurationSec * 1000 * 1.5) + 2000
      if (typeof finishPromiseSetTimer === 'function') {
        finishPromiseSetTimer(maxTimeoutMs)
      }
      // 设置预期结束时间供心跳检测使用
      if (typeof setExpectedEndTime === 'function') {
        setExpectedEndTime(expectedEndTime)
      }
      
      await finishPromise

      if (token === this.playbackToken) {
        const merged = mergeFloat32Chunks(cacheChunks)
        this.cache.set(options.npcId, {
          cacheKey: options.cacheKey || '',
          audio: merged,
          sampleRate: ctx.sampleRate,
        })
        options.onStop?.()
        finished = true
      }
    } catch (err) {
      options.onError?.(err)
      throw err
    } finally {
      if (typeof finishCleanup === 'function') {
        finishCleanup()
      }
      this.restoreBgm()
      this.clearCurrentWorklet(node)
      if (token === this.playbackToken && started && !finished && !options.signal?.aborted) {
        console.warn('[ai-npc][tts] playback finished without worklet ended, forcing stop')
        options.onStop?.()
      }
    }
  }

  async playCached(
    npcId: string,
    cacheKey?: string,
    callbacks?: Omit<PlayPcmStreamOptions, 'npcId' | 'stream' | 'sampleRate'>,
  ): Promise<boolean> {
    const cached = this.cache.get(npcId)
    if (!cached) return false
    if (cacheKey && cached.cacheKey !== cacheKey) return false
    const token = this.nextToken()
    try {
      await this.playFloat32Buffer({
        npcId,
        cacheKey: cached.cacheKey,
        data: cached.audio.slice(0),
        sampleRate: cached.sampleRate,
        signal: callbacks?.signal,
        onStart: callbacks?.onStart,
        onStop: callbacks?.onStop,
        onError: callbacks?.onError,
        token,
      })
      return true
    } catch (err) {
      callbacks?.onError?.(err)
      throw err
    }
  }

  private async playFloat32Buffer(
    options: {
      npcId: string
      cacheKey?: string
      data: Float32Array
      sampleRate: number
      signal?: AbortSignal
      onStart?: () => void
      onStop?: () => void
      onError?: (err: unknown) => void
      token: number
    },
  ): Promise<void> {
    this.playbackToken = options.token
    const ctx = await this.ensureAudioContext(options.sampleRate)
    await this.resumeContext(ctx)

    if (options.signal?.aborted || options.token !== this.playbackToken) {
      throw createAbortError()
    }

    const floatData =
      options.sampleRate === ctx.sampleRate ? options.data : resampleIfNeeded(options.data, options.sampleRate, ctx.sampleRate)
    const buffer = ctx.createBuffer(1, floatData.length, ctx.sampleRate)
    buffer.getChannelData(0).set(floatData)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    this.clearCurrentWorklet()
    this.currentSource = source
    this.duckBgm()
    options.onStart?.()

    try {
      await new Promise<void>((resolve, reject) => {
        const onAbort = () => {
          cleanup()
          reject(createAbortError())
        }
        const cleanup = () => {
          source.onended = null
          options.signal?.removeEventListener('abort', onAbort)
        }
        source.onended = () => {
          cleanup()
          resolve()
        }
        options.signal?.addEventListener('abort', onAbort, { once: true })

        try {
          source.start()
        } catch (err) {
          cleanup()
          reject(err)
        }
      })
    } finally {
      this.restoreBgm()
      this.currentSource = null
    }

    if (options.token === this.playbackToken) {
      options.onStop?.()
      this.cache.set(options.npcId, {
        cacheKey: options.cacheKey || '',
        audio: floatData.slice(0),
        sampleRate: ctx.sampleRate,
      })
    }
  }

  private async createPcmPlayer(ctx: AudioContext): Promise<{
    node: AudioWorkletNode | ScriptProcessorNode
    port: MessagePortLike
  }> {
    if (ctx.audioWorklet) {
      try {
        await this.ensureWorklet(ctx)
        const workletNode = new AudioWorkletNode(ctx, 'pcm-player')
        return { node: workletNode, port: workletNode.port }
      } catch (err) {
        console.warn('[ai-npc][tts] AudioWorklet unavailable, falling back to ScriptProcessorNode', err)
      }
    }
    return this.createScriptProcessorFallback(ctx)
  }

  private createScriptProcessorFallback(ctx: AudioContext): { node: ScriptProcessorNode; port: MessagePortLike } {
    if (typeof ctx.createScriptProcessor !== 'function') {
      throw new Error('当前浏览器不支持音频播放')
    }

    const bufferSize = 2048
    const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
    let buffers: Float32Array[] = []
    let current: Float32Array | null = null
    let offset = 0
    let done = false
    let endedNotified = false

    const reset = () => {
      buffers = []
      current = null
      offset = 0
      done = false
      endedNotified = false
    }

    const port = new LocalMessagePort((data) => {
      if (data?.type === 'chunk' && data.payload instanceof Float32Array) {
        buffers.push(data.payload)
        return
      }
      if (data?.type === 'done') {
        done = true
        if (!current && buffers.length === 0 && !endedNotified) {
          endedNotified = true
          port.emitMessage({ type: 'ended' })
        }
        return
      }
      if (data?.type === 'reset') {
        reset()
      }
    })

    processor.onaudioprocess = (event) => {
      const output = event.outputBuffer.getChannelData(0)
      let written = 0
      while (written < output.length) {
        if (!current || offset >= current.length) {
          if (buffers.length === 0) {
            for (let i = written; i < output.length; i += 1) {
              output[i] = 0
            }
            if (done && !endedNotified) {
              endedNotified = true
              port.emitMessage({ type: 'ended' })
            }
            return
          }
          current = buffers.shift() ?? null
          offset = 0
          continue
        }

        const copyCount = Math.min(current.length - offset, output.length - written)
        output.set(current.subarray(offset, offset + copyCount), written)
        offset += copyCount
        written += copyCount
      }
    }

    return { node: processor, port }
  }

  private async ensureAudioContext(preferredSampleRate?: number): Promise<AudioContext> {
    if (typeof window === 'undefined' || typeof AudioContext === 'undefined') {
      throw new Error('当前环境不支持音频播放')
    }
    const desiredRate = preferredSampleRate && preferredSampleRate > 0 ? preferredSampleRate : undefined
    if (!this.audioContext) {
      this.audioContext = desiredRate ? new AudioContext({ sampleRate: desiredRate }) : new AudioContext()
      this.workletReadyForContext = null
      return this.audioContext
    }
    if (desiredRate && Math.abs(this.audioContext.sampleRate - desiredRate) > 1) {
      try {
        await this.audioContext.close()
      } catch {
        // ignore close failure
      }
      this.audioContext = desiredRate ? new AudioContext({ sampleRate: desiredRate }) : new AudioContext()
      this.workletReadyForContext = null
    }
    return this.audioContext
  }

  private async resumeContext(ctx: AudioContext) {
    try {
      if (ctx.state === 'suspended') {
        await ctx.resume()
      }
    } catch {
      // ignore resume failure; playback start will retry
    }
  }

  private async ensureWorklet(ctx: AudioContext) {
    if (this.workletReadyForContext === ctx) return
    if (!ctx.audioWorklet) {
      throw new Error('当前浏览器不支持 AudioWorklet')
    }
    await ctx.audioWorklet.addModule(pcmWorkerUrl)
    this.workletReadyForContext = ctx
  }

  private duckBgm() {
    const bgm = useBgmStore()
    const audio = bgm.ensureAudioElement?.()
    if (!audio || bgm.muted) {
      this.ducked = null
      return
    }
    this.ducked = { audio }
    const target = Math.max(0, Math.min(audio.volume, bgm.volume * 0.35))
    audio.volume = target
  }

  private restoreBgm() {
    if (!this.ducked) return
    const bgm = useBgmStore()
    const audio = this.ducked.audio
    if (!bgm.muted) {
      audio.volume = bgm.volume
    }
    this.ducked = null
  }

  private clearCurrentSource() {
    if (!this.currentSource) return
    try {
      this.currentSource.stop()
    } catch {
      // ignore
    }
    try {
      this.currentSource.disconnect()
    } catch {
      // ignore
    }
    this.currentSource = null
  }

  private clearCurrentWorklet(target?: AudioWorkletNode | ScriptProcessorNode, portOverride?: MessagePortLike) {
    const node = target ?? this.currentWorklet
    const port = portOverride ?? this.currentWorkletPort
    if (!node) return
    try {
      port?.postMessage({ type: 'reset' })
    } catch {
      // ignore
    }
    try {
      node.disconnect()
    } catch {
      // ignore
    }
    if (!target || node === this.currentWorklet) {
      this.currentWorklet = null
      this.currentWorkletPort = null
    }
  }
}
