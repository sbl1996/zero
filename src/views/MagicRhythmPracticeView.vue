<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RHYTHM_PHRASES } from '@/data/rhythmPhrases'
import type { RhythmKey, RhythmNote } from '@/types/rhythm'
import { beatMs, buildNoteTimings, normalizeScore, resolveNoteDurationBeats, scoreOffset } from '@/utils/rhythm'
import { clamp } from '@/utils/math'
import MagicRhythmTrack, { type TrackNote, type TrackDivider, type TrackLeadTick } from '@/components/MagicRhythmTrack.vue'
import * as Tone from 'tone'

interface NoteState {
  note: RhythmNote
  index: number
  status: 'pending' | 'hit' | 'miss' | 'wrong'
  score: number
  hitTime?: number
  inputKey?: string
  offsetMs?: number
}

interface QueuedInput {
  key: RhythmKey
  pitch: string | number
  time: number
}

const allKeys: RhythmKey[] = [
  '0',
  '.',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '+',
  'insert',
  '/',
  '*',
  '-',
  'z',
  'x',
  'c',
  'v',
  'b',
  'n',
  'm',
  'j',
  'k',
  'l',
  ';',
  'arrowright',
  'pagedown',
]
const allKeySet = new Set(allKeys)
const defaultKeyBindingText = '0 . 1 arrowright 2 3 4 5 6 7 8 pagedown 9 + insert / * -'
const pitchSequence = ['A,', 'B,', 'C', '^C', 'D', 'E', 'F', 'G', 'A', 'B', "C'", "^C'", "D'", "E'", "F'", "G'", "A'", "B'"]
const defaultKeyBindings = defaultKeyBindingText.split(/[\s,]+/).filter(Boolean) as RhythmKey[]
const phrases = RHYTHM_PHRASES

const phraseId = ref(phrases[0]?.id ?? '')
const phrase = computed(() => phrases.find((item) => item.id === phraseId.value) ?? phrases[0]!)
const FLOW_IN_BEATS = 4
const judgeLinePercent = 45


const bpm = ref(phrase.value.bpm ?? 100)
const timeSignature = computed(() => phrase.value.timeSignature ?? { numerator: 4, denominator: 4 })
const leadInBeats = ref(phrase.value.leadInBeats ?? 1)
const trailInBeats = ref(phrase.value.trailInBeats ?? 1)
const judgeWindowRatio = ref(0.3)
const perfectWindowRatio = ref(0.2)
const inputOffsetMs = ref(0)
const volumePercent = ref(100)

const session = reactive({
  playing: false,
  finished: false,
  startAt: 0,
  elapsed: 0,
  combo: 0,
  maxCombo: 0,
  failReason: '',
})

const noteStates = ref<NoteState[]>([])
const inputQueue = ref<QueuedInput[]>([])
let rafId: number | null = null
let toneCtx: Tone.Context | null = null
let toneReverb: Tone.Reverb | null = null
let tonePlayers: Tone.Players | null = null
let demoTimers: number[] = []
const pitchToToneNote: Record<string, string> = {
  'A,': 'A3',
  'B,': 'B3',
  'C': 'C4',
  '^C': 'Db4',
  '_D': 'Db4',
  'D': 'D4',
  'E': 'E4',
  'F': 'F4',
  'G': 'G4',
  'A': 'A4',
  'B': 'B4',
  "C'": 'C5',
  "^C'": 'Db5',
  "_D'": 'Db5',
  "D'": 'D5',
  "E'": 'E5',
  "F'": 'F5',
  "G'": 'G5',
  "A'": 'A5',
  "B'": 'B5',
}
const toneNotes = Array.from(new Set(Object.values(pitchToToneNote)))
let audioGestureHandler: ((event: PointerEvent) => void) | null = null
let warnedAudioBlocked = false
let tonePlayersReady = false

function canonicalizeKey(raw: string): RhythmKey | null {
  const key = raw.trim().toLowerCase()
  if (!key) return null
  if (allKeySet.has(key as RhythmKey)) return key as RhythmKey
  return null
}



const keyBindings = computed<RhythmKey[]>(() => {
  return defaultKeyBindings.slice(0, pitchSequence.length)
})

const keyToPitch = computed<Record<string, string | number>>(() => {
  const map: Record<string, string | number> = {}
  keyBindings.value.forEach((key, idx) => {
    const pitch = pitchSequence[idx]
    if (pitch !== undefined) {
      map[key] = pitch
    }
  })
  return map
})



const beatDurationMs = computed(() => beatMs(bpm.value))
const noteTimings = computed(() => buildNoteTimings(phrase.value.notes, leadInBeats.value, bpm.value))
const totalBeats = computed(() =>
  Math.max(leadInBeats.value, 0) +
  phrase.value.notes.reduce((sum, note) => sum + resolveNoteDurationBeats(note.durationBeats), 0) +
  Math.max(trailInBeats.value, 0),
)
// 每小节拍数
const beatsPerMeasure = computed(() => {
  const ts = timeSignature.value
  return (ts.numerator * 4) / ts.denominator
})

const trackDurationMs = computed(() => {
  if (noteTimings.value.length === 0) return beatDurationMs.value * totalBeats.value
  const last = noteTimings.value[noteTimings.value.length - 1]
  if (!last) return beatDurationMs.value * totalBeats.value
  // 以最后一个音符的命中点 (startMs) 为基准，往后顺延 trailInBeats
  return last.startMs + Math.max(trailInBeats.value, 0) * beatDurationMs.value
})
const timelinePercent = computed(() => clamp((session.elapsed / trackDurationMs.value) * 100, 0, 100))
const judgeWindowMs = computed(() => beatDurationMs.value * judgeWindowRatio.value)
const judgeWindowPercent = computed({
  get: () => Math.round(judgeWindowRatio.value * 1000) / 10,
  set: (val: number) => {
    judgeWindowRatio.value = clamp(val / 100, 0.05, 0.6)
  },
})
const perfectWindowPercent = computed({
  get: () => Math.round(perfectWindowRatio.value * 1000) / 10,
  set: (val: number) => {
    perfectWindowRatio.value = clamp(val / 100, 0.05, 0.9)
  },
})
const perfectWindowMs = computed(() => judgeWindowMs.value * perfectWindowRatio.value)
const judgeWindowTotalMs = computed(() => judgeWindowMs.value * 2)
const judgeWindowTotalPercent = computed(() => Math.round(judgeWindowRatio.value * 2000) / 10)
const flowInMs = computed(() => Math.max(beatDurationMs.value * FLOW_IN_BEATS, 30))
const flowOutMs = computed(() => {
  const speedMsPerPercent = flowInMs.value / (100 - judgeLinePercent)
  return Math.max(speedMsPerPercent * judgeLinePercent, 30)
})
const audioReady = ref(false)
const volumeDb = computed(() => {
  const pct = clamp(volumePercent.value, 0, 100)
  return -36 + (pct / 100) * 36
})
const maxPossibleScore = computed(() => phrase.value.notes.filter((note) => note.pitch !== null).length)

const totalRawScore = computed(() =>
  noteStates.value.reduce((sum, state) => {
    if (state.note.pitch === null) return sum
    return sum + state.score
  }, 0),
)

const normalizedScore = computed(() => normalizeScore(totalRawScore.value, maxPossibleScore.value))

const damageMultiplier = computed(() => {
  const s = normalizedScore.value
  if (s <= 90) {
    return s / 90
  } else {
    // 90分后使用二次方增长公式：1.0 + 0.015 * (s - 90)^2 -> 满分250%
    return 1.0 + 0.015 * Math.pow(s - 90, 2)
  }
})

const success = computed(() => {
  return !noteStates.value.some(
    (state) =>
      state.note.pitch !== null &&
      state.note.required !== false &&
      (state.status === 'miss' || state.status === 'pending'),
  )
})

const statusText = computed(() => {
  if (session.playing) return '演奏中'
  if (session.finished) return success.value ? '施法成功' : '施法失败'
  return '未开始'
})

function resetNotes() {
  noteStates.value = phrase.value.notes.map((note, index) => ({
    note,
    index,
    status: 'pending',
    score: 0,
  }))
}

function resetSession() {
  session.playing = false
  session.finished = false
  session.elapsed = 0
  session.combo = 0
  session.maxCombo = 0
  session.failReason = ''
  inputQueue.value = []
  clearDemoTimers()
  resetNotes()
  cancelLoop()
}

function setDefaultsFromPhrase() {
  leadInBeats.value = phrase.value.leadInBeats ?? 0
  trailInBeats.value = phrase.value.trailInBeats ?? 1
  bpm.value = phrase.value.bpm ?? 100
  resetSession()
}

watch(phrase, setDefaultsFromPhrase)

async function startPractice() {
  resetSession()
  session.playing = true
  session.startAt = performance.now()
  await initAudio()
  startLoop()
}

async function startDemo() {
  resetSession()
  session.playing = true
  session.startAt = performance.now()
  await initAudio()
  scheduleDemoNotes()
  startLoop()
}

function scheduleDemoNotes() {
  clearDemoTimers()
  noteTimings.value.forEach((timing, index) => {
    const note = phrase.value.notes[index]
    if (!note || note.pitch === null) return
    const key = keyForPitch(note.pitch)
    if (!key) return
    const delay = Math.max(0, timing.startMs)
    const timer = window.setTimeout(() => {
      if (!session.playing) return
      inputQueue.value.push({
        key,
        pitch: note.pitch as string | number,
        time: session.startAt + timing.startMs,
      })
      void playNoteByPitch(note.pitch as string | number)
    }, delay)
    demoTimers.push(timer)
  })
}

function clearDemoTimers() {
  demoTimers.forEach((timer) => {
    clearTimeout(timer)
  })
  demoTimers = []
}

function startLoop() {
  cancelLoop()
  const step = () => {
    if (!session.playing) return
    const now = performance.now()
    session.elapsed = now - session.startAt
    processInputQueue()
    processMisses(now)
    if (session.elapsed >= trackDurationMs.value) {
      finishSession()
      return
    }
    rafId = requestAnimationFrame(step)
  }
  rafId = requestAnimationFrame(step)
}

function cancelLoop() {
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
}

function finishSession() {
  session.playing = false
  session.finished = true
  session.elapsed = trackDurationMs.value
  clearDemoTimers()
  cancelLoop()
  // 确保未判定的必按音符转 Miss
  noteStates.value = noteStates.value.map((state) => {
    if (state.status === 'pending' && state.note.pitch !== null) {
      return { ...state, status: 'miss', score: 0 }
    }
    return state
  })
  if (!success.value) {
    session.failReason = '存在未命中的必按音符'
  }
}

function processMisses(now: number) {
  const updated = [...noteStates.value]
  updated.forEach((state, index) => {
    if (state.status !== 'pending' || state.note.pitch === null) return
    const timing = noteTimings.value[index]
    if (!timing) return
    const deadline = session.startAt + timing.startMs + judgeWindowMs.value
    if (now > deadline) {
      updated[index] = { ...state, status: 'miss', score: 0 }
      session.combo = 0
    }
  })
  noteStates.value = updated
}

function normalizeInputKey(event: KeyboardEvent): RhythmKey | null {
  const code = event.code
  if (code === 'Insert') return 'insert'
  if (code === 'PageDown') return 'pagedown'
  if (code === 'ArrowRight') return 'arrowright'
  if (code.startsWith('Numpad')) {
    const lower = code.toLowerCase()
    const digit = lower.match(/^numpad([0-9])$/)
    if (digit) return digit[1] as RhythmKey
    switch (lower) {
      case 'numpaddecimal':
        return '.'
      case 'numpadadd':
        return '+'
      case 'numpadsubtract':
        return '-'
      case 'numpadmultiply':
        return '*'
      case 'numpaddivide':
        return '/'
    }
  }
  return canonicalizeKey(event.key)
}

async function handleKeydown(event: KeyboardEvent) {
  try {
    const target = event.target as HTMLElement | null
    if (target && ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())) return
    if (event.repeat) return
    if (event.key.toLowerCase() === 'z') {
      if (!session.playing) {
        void startPractice()
      } else {
        resetSession()
      }
      return
    }
    const key = normalizeInputKey(event)
    if (!key) return
    const pitch = keyToPitch.value[key]
    if (pitch === undefined) return
    const time = performance.now() + inputOffsetMs.value
    inputQueue.value.push({ key, pitch, time })
    await playNoteByPitch(pitch)
  } catch (err) {
    console.error('handleKeydown error', err)
  }
}

function processInputQueue() {
  if (!session.playing) {
    inputQueue.value = []
    return
  }
  if (inputQueue.value.length === 0) return
  const queue = [...inputQueue.value]
  inputQueue.value = []
  const updated = [...noteStates.value]
  for (const input of queue) {
    const { key, time } = input
    const match = findClosestPendingNote(time)
    if (!match || match.distance > judgeWindowMs.value) {
      continue
    }
    const state = updated[match.index]
    if (!state) continue
    const note = state.note
    if (!note || note.pitch === null) continue
    const offset = time - match.judgeTime
    if (input.pitch === note.pitch) {
      const score = scoreOffset(offset, beatDurationMs.value, judgeWindowRatio.value)
      updated[match.index] = {
        ...state,
        status: 'hit',
        hitTime: time,
        inputKey: key,
        offsetMs: offset,
        score,
      }
      session.combo += 1
      session.maxCombo = Math.max(session.maxCombo, session.combo)
    } else {
      updated[match.index] = {
        ...state,
        status: 'wrong',
        hitTime: time,
        inputKey: key,
        offsetMs: offset,
        score: 0,
      }
      session.combo = 0
    }
  }
  noteStates.value = updated
}

function findClosestPendingNote(inputTime: number) {
  let best:
    | {
        index: number
        distance: number
        judgeTime: number
      }
    | null = null
  for (const state of noteStates.value) {
    if (state.status !== 'pending') continue
    if (state.note.pitch === null) continue
    const timing = noteTimings.value[state.index]
    if (!timing) continue
    const judgeTime = session.startAt + timing.startMs
    const distance = Math.abs(inputTime - judgeTime)
    if (best === null || distance < best.distance) {
      best = { index: state.index, distance, judgeTime }
    }
  }
  return best
}

function flowPositionPercent(centerTimeMs: number) {
  const before = flowInMs.value
  const after = flowOutMs.value
  const now = session.elapsed
  const appearAt = centerTimeMs - before
  const exitAt = centerTimeMs + after
  if (now < appearAt || now > exitAt) return null
  if (now <= centerTimeMs) {
    const phase = before === 0 ? 1 : (now - appearAt) / before
    return clamp(100 - phase * (100 - judgeLinePercent), 0, 100)
  }
  const phase = after === 0 ? 1 : (now - centerTimeMs) / after
  return clamp(judgeLinePercent - phase * judgeLinePercent, 0, 100)
}


const visibleNotes = computed<TrackNote[]>(() =>
  noteStates.value
    .map((state) => {
      const timing = noteTimings.value[state.index]
      if (!timing) return null
      const left = flowPositionPercent(timing.startMs)
      if (left === null) return null
      return {
        key: state.index,
        left,
        status: state.status,
        required: state.note.required !== false,
        isPendingActive: isInJudgeWindow(state) && state.status === 'pending',
        hitTier: hitTier(state),
        display: noteDisplay(state.note, state.index),
        pitch: state.note.pitch,
      }
    })
    .filter((item): item is TrackNote => Boolean(item)),
)

const visibleLeadTicks = computed<TrackLeadTick[]>(() =>
  Array.from({ length: Math.ceil(Math.max(leadInBeats.value, 0)) }, (_, idx) => {
    const centerTime = beatDurationMs.value * (idx + 0.5)
    const left = flowPositionPercent(centerTime)
    if (left === null) return null
    return {
      idx,
      left,
      label: Math.ceil(Math.max(leadInBeats.value, 0)) - idx,
    }
  }).filter((item): item is TrackLeadTick => Boolean(item)),
)

const visibleMeasures = computed<TrackDivider[]>(() => {
  const bpmValue = beatsPerMeasure.value
  const leadIn = leadInBeats.value
  const total = totalBeats.value
  const dividers: TrackDivider[] = []

  // 智能小节线定位：根据前后音符位置动态调整，避免视觉重叠
  const safetyMargin = 0.25 // 拍
  const noteBeats = phrase.value.notes
    .map((n, i) => {
      if (n.pitch === null) return null
      const t = noteTimings.value[i]
      return t ? t.startMs / beatDurationMs.value : null
    })
    .filter((b): b is number => b !== null)
    .sort((a, b) => a - b) // 确保有序

  for (let b = leadIn + bpmValue; b <= total - trailInBeats.value; b += bpmValue) {
    let pos = b
    
    // 找到边界后第一个音符（Next）
    const nextNoteIdx = noteBeats.findIndex(nb => nb >= b - 0.001)
    
    // 1. 尝试避让 Next Note
    if (nextNoteIdx !== -1) {
      const nextBeat = noteBeats[nextNoteIdx]
      if (nextBeat !== undefined && Math.abs(nextBeat - pos) < safetyMargin) {
        pos = nextBeat - safetyMargin
      }
    }

    // 2. 检查是否撞上了 Prev Note
    const prevNoteIdx = nextNoteIdx === -1 ? noteBeats.length - 1 : nextNoteIdx - 1
    if (prevNoteIdx >= 0) {
      const prevBeat = noteBeats[prevNoteIdx]
      if (prevBeat !== undefined && pos - prevBeat < safetyMargin) {
        // 如果避让导致撞上特别是密集音符（如 8 分音符间隔 0.5，margin 0.25 会导致刚好贴死）
        // 此时取绝对中点最安全
        if (nextNoteIdx !== -1) {
          const nextBeat = noteBeats[nextNoteIdx]
          if (nextBeat !== undefined) {
            pos = (prevBeat + nextBeat) / 2
          }
        } else {
          pos = prevBeat + safetyMargin
        }
      }
    }

    const centerTime = beatDurationMs.value * pos
    const left = flowPositionPercent(centerTime)
    if (left !== null) {
      dividers.push({ beatIndex: b, left })
    }
  }
  return dividers
})

function isInJudgeWindow(state: NoteState) {
  const timing = noteTimings.value[state.index]
  if (!timing) return false
  const distance = Math.abs(session.elapsed - timing.startMs)
  return distance <= judgeWindowMs.value
}

const abcToNumbered: Record<string, string> = {
  'C': '1', 'D': '2', 'E': '3', 'F': '4', 'G': '5', 'A': '6', 'B': '7'
}

function noteLabel(note: RhythmNote) {

  if (note.pitch === null) return '-'
  
  let p = String(note.pitch)
  // 转换 ABC 记谱法到简谱显示
  // 例如: C -> 1, G -> 5, ^C -> #1, A, -> 6,
  let result = p
    .replace(/[CDEFGAB]/g, (match) => abcToNumbered[match] || match)
    .replace(/\^/g, '#')
    .replace(/_/g, 'b')
    
  return result
}

function noteDisplay(note: RhythmNote, index: number) {
  const label = noteLabel(note)
  let beatText = ''

  if (note.pitch !== null) {
    const timing = noteTimings.value[index]
    if (timing) {
      const leadIn = leadInBeats.value
      const bpmValue = beatsPerMeasure.value
      // 计算自乐句开始后的总拍数
      const totalBeat = timing.startMs / beatDurationMs.value
      // 修复浮点数精度问题，防止 1.9999 变成 3 (2/4拍)
      const beatInPhrase = Math.round(Math.max(0, totalBeat - leadIn) * 100) / 100
      // 计算在小节内的拍数 (1-based)
      const beatInMeasure = (beatInPhrase % bpmValue) + 1

      // 格式化输出，处理精度问题并去掉多余的小数点（例如 1.5, 2 等）
      beatText = Number(beatInMeasure.toFixed(2)).toString()
    }
  }

  let text = label
  let dot: 'above' | 'below' | null = null

  if (text.length > 1 && text.endsWith("'")) {
    text = text.slice(0, -1)
    dot = 'above'
  } else if (text.length > 1 && text.endsWith(",")) {
    text = text.slice(0, -1)
    dot = 'below'
  }
  return { text, dot, beatText }
}

function noteUrl(note: string) {
  return new URL(`../assets/acoustic_grand_piano/${note}.mp3`, import.meta.url).toString()
}

function keyForPitch(pitch: string | number | null): RhythmKey | null {
  if (pitch === null) return null
  const idx = pitchSequence.indexOf(String(pitch))
  if (idx < 0) return null
  return keyBindings.value[idx] ?? null
}

async function ensureAudioReady() {
  try {
    if (!toneCtx) {
      const rawCtx = new AudioContext({ latencyHint: 'interactive' })
      await rawCtx.resume()
      toneCtx = new Tone.Context(rawCtx)
      Tone.setContext(toneCtx)
    }
    if (Tone.getContext().state !== 'running') {
      await Tone.getContext().resume()
    }
    if (!toneReverb) {
      toneReverb = new Tone.Reverb({
        decay: 3,
        wet: 0.35,
        preDelay: 0.01,
      }).toDestination()
    }
    if (!tonePlayers) {
      const urls = toneNotes.reduce<Record<string, string>>((acc, note) => {
        acc[note] = noteUrl(note)
        return acc
      }, {})
      tonePlayersReady = false
      tonePlayers = new Tone.Players(
        urls,
        () => {
          tonePlayersReady = true
        },
      ).connect(toneReverb)
      tonePlayers.fadeOut = 0.8
      tonePlayers.volume.value = volumeDb.value
    } else if (tonePlayers.loaded) {
      tonePlayersReady = true
      tonePlayers.volume.value = volumeDb.value
    }
    audioReady.value = tonePlayersReady
    return tonePlayersReady
  } catch (err) {
    console.error('Tone init failed', err)
    audioReady.value = false
    tonePlayersReady = false
    return false
  }
}

async function initAudio() {
  return ensureAudioReady()
}

async function playNoteByPitch(pitch: string | number) {
  try {
    const note = pitchToToneNote[String(pitch)]
    if (!note) return
    const ready = await initAudio()
    const player = tonePlayers?.player(note)
    if (!ready || !player) {
      if (!warnedAudioBlocked) {
        console.warn('音频未解锁或采样未加载，请点击界面或先点击开始练习以启用声音')
        warnedAudioBlocked = true
      }
      return
    }
    await Tone.getContext().resume()
    player.stop()
    player.start()
  } catch (err) {
    console.error('[audio] trigger error', err, { state: Tone.getContext().state })
  }
}

const GOOD_THRESHOLD_RATIO = 0.6

function hitTier(state?: NoteState) {
  if (!state || state.status !== 'hit') return ''
  const offset = Math.abs(state.offsetMs ?? 0)
  if (offset <= judgeWindowMs.value * perfectWindowRatio.value) return 'perfect'
  if (offset <= judgeWindowMs.value * GOOD_THRESHOLD_RATIO) return 'good'
  return 'ok'
}

function bindAudioGesture() {
  if (audioGestureHandler) return
  audioGestureHandler = async () => {
    const ok = await initAudio()
    if (ok && audioGestureHandler) {
      window.removeEventListener('pointerdown', audioGestureHandler)
      audioGestureHandler = null
    }
  }
  window.addEventListener('pointerdown', audioGestureHandler)
}

onMounted(() => {
  setDefaultsFromPhrase()
  bindAudioGesture()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  cancelLoop()
  clearDemoTimers()
  window.removeEventListener('keydown', handleKeydown)
  if (audioGestureHandler) {
    window.removeEventListener('pointerdown', audioGestureHandler)
  }
  tonePlayers?.dispose()
  toneReverb?.dispose()
})

watch(volumeDb, (val) => {
  if (tonePlayers) {
    tonePlayers.volume.value = val
  }
})

</script>

<template>
  <div class="practice-layout">
    <div class="panel practice-top">
      <div class="practice-meta">
        <div class="meta-head">
          <div>
            <h2 class="section-title">魔法节奏练习</h2>
            <p class="text-muted">
              按节奏敲击键位：90分达成100%威力，突破90分将获得<strong>共鸣伤害加成（最高250%）</strong>。
            </p>
          </div>
          <div class="status-chip" :class="{ danger: session.finished && !success, success: success }">
            {{ statusText }}
          </div>
        </div>
        <div class="control-row">
          <label class="control">
            <span>乐句</span>
            <select v-model="phraseId">
              <option v-for="item in phrases" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <label class="control">
            <span>速度 (BPM)</span>
            <input v-model.number="bpm" type="number" min="30" max="240" step="1" />
            <small class="text-muted">一拍 ≈ {{ Math.round(beatDurationMs) }}ms</small>
          </label>
          <label class="control">
            <span>判定窗口半径（单拍 ±%）</span>
            <div class="input-with-suffix">
              <input v-model.number="judgeWindowPercent" type="number" min="5" max="60" step="1" />
              <span class="suffix">%</span>
            </div>
            <small class="text-muted">
              总窗 ≈ {{ Math.round(judgeWindowTotalMs) }}ms（{{ judgeWindowTotalPercent }}%）
            </small>
          </label>
          <label class="control">
            <span>Perfect 阈值（占窗口 %）</span>
            <div class="input-with-suffix">
              <input v-model.number="perfectWindowPercent" type="number" min="5" max="90" step="1" />
              <span class="suffix">%</span>
            </div>
            <small class="text-muted">
              Perfect 窗口 ≈ {{ Math.round(perfectWindowMs) }}ms（占判定窗 {{ perfectWindowPercent }}%）
            </small>
          </label>
          <label class="control">
            <span>起拍（拍）</span>
            <input v-model.number="leadInBeats" type="number" min="0" max="8" step="0.25" />
          </label>
          <label class="control">
            <span>收尾空白（拍）</span>
            <input v-model.number="trailInBeats" type="number" min="0" max="8" step="0.25" />
          </label>
          <label class="control">
            <span>输入偏移（ms）</span>
            <input v-model.number="inputOffsetMs" type="number" min="-200" max="200" step="5" />
          </label>
          <label class="control">
            <span>音量</span>
            <div class="slider-row">
              <input v-model.number="volumePercent" class="range-input" type="range" min="0" max="100" step="1" />
              <span class="text-muted">{{ volumePercent }}%</span>
            </div>
            <small class="text-muted">调节采样响度，范围 -36dB 至 0dB</small>
          </label>

        </div>
        <div class="control-row actions">
          <button class="btn" type="button" @click="startPractice" :disabled="session.playing">
            开始练习 (Z)
          </button>

          <button class="btn" type="button" @click="startDemo" :disabled="session.playing">演示</button>
          <button class="btn btn-danger" type="button" @click="resetSession">重置 (Z)</button>
          <div class="text-muted">
            BPM: {{ Math.round(bpm) }} ｜ 拍号: {{ timeSignature.numerator }}/{{ timeSignature.denominator }} ｜ 时长:
            {{ Math.round(trackDurationMs / 1000 * 10) / 10 }}s
          </div>
        </div>
      </div>
      <div class="score-card">
        <div class="score-group">
          <div class="score-item">
            <div class="score-number">{{ normalizedScore.toFixed(1) }}</div>
            <div class="score-label">评分 (0-100)</div>
          </div>
          <div class="score-divider"></div>
          <div class="score-item highlight">
            <div class="score-number damage">{{ (damageMultiplier * 100).toFixed(0) }}%</div>
            <div class="score-label">魔法伤害倍率</div>
          </div>
        </div>
        <div class="score-row">
          <span>连击</span>
          <strong>{{ session.combo }}/{{ session.maxCombo }}</strong>
        </div>
        <div class="score-row">
          <span>必按漏判</span>
          <strong :class="{ danger: !success && session.finished }">
            {{
              noteStates.filter(
                (state) => state.note.pitch !== null && state.note.required !== false && state.status === 'miss',
              ).length
            }}
          </strong>
        </div>
        <div v-if="session.finished" class="score-row">
          <span>结果</span>
          <strong :class="{ danger: !success, success: success }">{{ success ? '成功' : '失败' }}</strong>
        </div>
      </div>
    </div>

    <MagicRhythmTrack
      class="track-panel"
      :title="phrase.name"
      :description="phrase.description"
      :timeline-percent="timelinePercent"
      :judge-window-ms="judgeWindowMs"
      :judge-line-percent="judgeLinePercent"
      :visible-measures="visibleMeasures"
      :visible-lead-ticks="visibleLeadTicks"
      :visible-notes="visibleNotes"
    />

  </div>
</template>

<style scoped>
.practice-layout {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.practice-top {
  display: grid;
  grid-template-columns: 1fr 260px;
  gap: 16px;
  align-items: stretch;
}

.practice-meta .meta-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.control-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 12px;
}

.control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 140px;
  color: #fff;
}

.control.wide {
  flex: 1 1 260px;
}

.control input,
.control select {
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.05);
  color: inherit;
}

.control select option,
.control select optgroup {
  background: #0b1024;
  color: #f7f8ff;
}

.control input:focus,
.control select:focus {
  outline: none;
  border-color: rgba(245, 208, 111, 0.6);
  box-shadow: 0 0 0 2px rgba(245, 208, 111, 0.25);
}

.input-with-suffix {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-with-suffix .suffix {
  min-width: 18px;
  color: rgba(255, 255, 255, 0.8);
}

.slider-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.range-input {
  flex: 1;
  min-width: 180px;
  width: 100%;
  padding: 0;
  margin: 0;
  background: transparent;
  border: none;
  appearance: none;
  accent-color: #f5d06f;
}

.range-input::-webkit-slider-runnable-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
}

.range-input::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #f5d06f;
  margin-top: -4px;
  box-shadow: 0 0 6px rgba(245, 208, 111, 0.5);
}

.range-input::-moz-range-track {
  height: 6px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 999px;
}

.range-input::-moz-range-thumb {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: none;
  background: #f5d06f;
  box-shadow: 0 0 6px rgba(245, 208, 111, 0.5);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.status-chip {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.status-chip.success {
  border-color: rgba(93, 225, 123, 0.6);
  color: #adf7c8;
}

.status-chip.danger {
  border-color: rgba(255, 99, 146, 0.6);
  color: #ffbdd4;
}

.score-card {
  border-radius: 14px;
  padding: 16px;
  background: linear-gradient(145deg, rgba(29, 42, 78, 0.8), rgba(23, 18, 44, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: stretch;
  min-width: 220px;
}

.score-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.score-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.score-divider {
  width: 1px;
  height: 40px;
  background: rgba(255, 255, 255, 0.1);
}

.score-number {
  font-size: 32px;
  font-weight: 800;
  color: #f5d06f;
  line-height: 1;
}

.score-number.damage {
  color: #4cc9f0;
  text-shadow: 0 0 15px rgba(76, 201, 240, 0.4);
}

.score-item.highlight .score-label {
  color: #4cc9f0;
  font-weight: bold;
}

.score-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
  text-align: center;
}

.score-row {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 14px;
}

.score-row strong {
  color: #fff;
}

.score-row .danger {
  color: #ff9ab5;
}

.score-row .success {
  color: #baf8d2;
}

@media (max-width: 960px) {
  .practice-top {
    grid-template-columns: 1fr;
  }
}
</style>
