declare const registerProcessor: (name: string, processorCtor: any) => void

interface SimpleAudioWorkletProcessor {
  readonly port: MessagePort
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean
}

declare const AudioWorkletProcessor: {
  prototype: SimpleAudioWorkletProcessor
  new(): SimpleAudioWorkletProcessor
}

class PcmPlayerProcessor extends AudioWorkletProcessor {
  private buffers: Float32Array[] = []

  private current: Float32Array | null = null

  private offset = 0

  private done = false

  private endedNotified = false

  constructor() {
    super()
    this.port.onmessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; payload?: Float32Array }
      if (data?.type === 'chunk' && data.payload instanceof Float32Array) {
        this.buffers.push(data.payload)
        return
      }
      if (data?.type === 'done') {
        this.done = true
        if (!this.current && this.buffers.length === 0 && !this.endedNotified) {
          this.endedNotified = true
          this.port.postMessage({ type: 'ended' })
        }
        return
      }
      if (data?.type === 'reset') {
        this.buffers = []
        this.current = null
        this.offset = 0
        this.done = false
        this.endedNotified = false
      }
    }
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const output = outputs?.[0]?.[0]
    if (!output) return true
    
    // 检查是否已完成且所有数据已播放
    if (this.done && !this.current && this.buffers.length === 0) {
      if (!this.endedNotified) {
        this.endedNotified = true
        this.port.postMessage({ type: 'ended' })
      }
      for (let i = 0; i < output.length; i += 1) output[i] = 0
      return false
    }
    
    let written = 0

    while (written < output.length) {
      if (!this.current || this.offset >= (this.current?.length ?? 0)) {
        if (this.buffers.length === 0) {
          // 填充剩余静音
          for (let i = written; i < output.length; i += 1) {
            output[i] = 0
          }
          // 如果已标记完成且缓冲区为空，在下一轮 process 发送 ended
          return true
        }
        this.current = this.buffers.shift() || null
        this.offset = 0
        continue
      }

      const currentLength = this.current.length
      const remaining = currentLength - this.offset
      const space = output.length - written
      const copyCount = Math.min(remaining, space)
      output.set(this.current.subarray(this.offset, this.offset + copyCount), written)
      this.offset += copyCount
      written += copyCount
    }

    return true
  }
}

registerProcessor('pcm-player', PcmPlayerProcessor)
