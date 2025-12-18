<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RHYTHM_PHRASES } from '@/data/rhythmPhrases'
import type { RhythmKey, RhythmNote } from '@/types/rhythm'
import { normalizeScore, scoreOffset } from '@/utils/rhythm'
import { clamp } from '@/utils/math'

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
  key: string
  pitch: number
  time: number
}

const allKeys: RhythmKey[] = ['1', '2', '3', '4', '5', '6', '7', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'j', 'k', 'l', ';']
const phrases = RHYTHM_PHRASES

const phraseId = ref(phrases[0]?.id ?? '')
const phrase = computed(() => phrases.find((item) => item.id === phraseId.value) ?? phrases[0]!)

const keyBindingsText = ref('1 2 3 4 5 6 7')
const leadInCells = ref(phrase.value.leadInCells)
const tempoMsPerCell = ref(phrase.value.intervalMs ?? (phrase.value.bpm ? 60000 / phrase.value.bpm : 600))
const judgeWindowRatio = ref(0.3)
const perfectWindowRatio = ref(0.2)
const inputOffsetMs = ref(0)

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
const strayInputs = ref<{ key: string; time: number; message: string }[]>([])
const inputQueue = ref<QueuedInput[]>([])
let rafId: number | null = null
const audioCtx = ref<AudioContext | null>(null)
const audioGain = ref<GainNode | null>(null)
const audioBuffers = ref<Record<string, AudioBuffer>>({})
const pitchToToneNote = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4']
let audioGestureHandler: ((event: PointerEvent) => void) | null = null
let warnedAudioBlocked = false
let buffersLoading: Record<string, Promise<AudioBuffer>> = {}

async function loadBuffer(note: string) {
  if (audioBuffers.value[note]) return audioBuffers.value[note]
  if (!buffersLoading[note]) {
    buffersLoading[note] = fetch(noteUrl(note))
      .then((res) => res.arrayBuffer())
      .then((arr) => {
        if (!audioCtx.value) throw new Error('AudioContext missing')
        return audioCtx.value.decodeAudioData(arr)
      })
      .then((buf) => {
        audioBuffers.value[note] = buf
        return buf
      })
      .catch((err) => {
        delete buffersLoading[note]
        throw err
      })
  }
  return buffersLoading[note]
}

const keyBindings = computed<RhythmKey[]>(() => {
  const parsed = keyBindingsText.value
    .toLowerCase()
    .split(/[\s,]+/)
    .map((k) => k.trim())
    .filter(Boolean) as RhythmKey[]
  const filtered = parsed.filter((k) => allKeys.includes(k)).slice(0, 7)
  if (filtered.length >= 7) return filtered
  return ['1', '2', '3', '4', '5', '6', '7']
})

const keyToPitch = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  keyBindings.value.forEach((key, idx) => {
    map[key] = idx + 1
  })
  return map
})

const allowedKeys = computed<RhythmKey[]>(() => Object.keys(keyToPitch.value) as RhythmKey[])

const totalCells = computed(() => leadInCells.value + phrase.value.notes.length)
const trackDurationMs = computed(() => tempoMsPerCell.value * totalCells.value)
const timelinePercent = computed(() => clamp((session.elapsed / trackDurationMs.value) * 100, 0, 100))
const judgeWindowMs = computed(() => tempoMsPerCell.value * judgeWindowRatio.value)
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
const audioReady = ref(false)
const maxPossibleScore = computed(() => phrase.value.notes.filter((note) => note.pitch !== null).length)

const totalRawScore = computed(() =>
  noteStates.value.reduce((sum, state) => {
    if (state.note.pitch === null) return sum
    return sum + state.score
  }, 0),
)

const normalizedScore = computed(() => normalizeScore(totalRawScore.value, maxPossibleScore.value))

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
  strayInputs.value = []
}

function resetSession() {
  session.playing = false
  session.finished = false
  session.elapsed = 0
  session.combo = 0
  session.maxCombo = 0
  session.failReason = ''
  inputQueue.value = []
  resetNotes()
  cancelLoop()
}

function setDefaultsFromPhrase() {
  leadInCells.value = phrase.value.leadInCells
  tempoMsPerCell.value = phrase.value.intervalMs ?? (phrase.value.bpm ? 60000 / phrase.value.bpm : 600)
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

function startLoop() {
  cancelLoop()
  const step = () => {
    if (!session.playing) return
    const now = performance.now()
    session.elapsed = now - session.startAt
    processInputQueue()
    processMisses(now)
    if (session.elapsed >= trackDurationMs.value + judgeWindowMs.value) {
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
  cancelLoop()
  // 确保未判定的必按格子转 Miss
  noteStates.value = noteStates.value.map((state) => {
    if (state.status === 'pending' && state.note.pitch !== null) {
      return { ...state, status: 'miss', score: 0 }
    }
    return state
  })
  if (!success.value) {
    session.failReason = '存在未命中的必按格子'
  }
}

function processMisses(now: number) {
  const updated = [...noteStates.value]
  updated.forEach((state, index) => {
    if (state.status !== 'pending' || state.note.pitch === null) return
    const deadline = session.startAt + noteCenterMs(index) + judgeWindowMs.value
    if (now > deadline) {
      updated[index] = { ...state, status: 'miss', score: 0 }
      session.combo = 0
    }
  })
  noteStates.value = updated
}

function noteCenterMs(noteIndex: number) {
  const cellIndex = leadInCells.value + noteIndex
  return tempoMsPerCell.value * (cellIndex + 0.5)
}

async function handleKeydown(event: KeyboardEvent) {
  try {
    const target = event.target as HTMLElement | null
    if (target && ['input', 'textarea', 'select'].includes(target.tagName.toLowerCase())) return
    if (event.repeat) return
    const key = event.key.toLowerCase()
    const pitch = keyToPitch.value[key]
    if (!pitch) return
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
      strayInputs.value.unshift({
        key,
        time,
        message: '不在判定窗口',
      })
      continue
    }
    const state = updated[match.index]
    if (!state) continue
    const note = state.note
    if (!note || note.pitch === null) continue
    const offset = time - match.centerTime
    if (input.pitch === note.pitch) {
      const score = scoreOffset(offset, tempoMsPerCell.value, judgeWindowRatio.value)
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
        centerTime: number
      }
    | null = null
  for (const state of noteStates.value) {
    if (state.status !== 'pending') continue
    if (state.note.pitch === null) continue
    const centerTime = session.startAt + noteCenterMs(state.index)
    const distance = Math.abs(inputTime - centerTime)
    if (best === null || distance < best.distance) {
      best = { index: state.index, distance, centerTime }
    }
  }
  return best
}

function notePositionPercent(noteIndex: number) {
  if (totalCells.value === 0) return 0
  const cellIndex = leadInCells.value + noteIndex
  return clamp(((cellIndex + 0.5) / totalCells.value) * 100, 0, 100)
}

function leadTickPercent(index: number) {
  if (totalCells.value === 0) return 0
  return clamp((((index + 0.5) / totalCells.value) * 100), 0, 100)
}

function isInJudgeWindow(state: NoteState) {
  const distance = Math.abs(session.elapsed - noteCenterMs(state.index))
  return distance <= judgeWindowMs.value
}

function noteUrl(note: string) {
  return new URL(`../assets/acoustic_grand_piano/${note}.mp3`, import.meta.url).toString()
}

async function setupPlayers() {
  // noop; audio buffers are lazy loaded per note
}

async function ensureAudioReady() {
  const ctx = (audioCtx.value ?? new AudioContext({ latencyHint: 'interactive' }))
  audioCtx.value = ctx
  if (!audioGain.value) {
    audioGain.value = ctx.createGain()
    audioGain.value.gain.value = 0.9
    audioGain.value.connect(ctx.destination)
  }
  if (ctx.state === 'running') {
    audioReady.value = true
    return true
  }
  try {
    await ctx.resume()
    audioReady.value = ctx.state === 'running'
    console.log('[audio] after resume state=', ctx.state)
    return audioReady.value
  } catch (err) {
    console.error('AudioContext start failed', err)
    audioReady.value = false
    return false
  }
}

async function initAudio() {
  const ready = await ensureAudioReady()
  if (!ready) return false
  return true
}

async function playNoteByPitch(pitch: number) {
  try {
    const note = pitchToToneNote[pitch - 1]
    if (!note) return
    const ready = await initAudio()
    const buffer = await loadBuffer(note)
    console.log('[audio] playNote', { note, ready, bufferLoaded: Boolean(buffer), ctx: audioCtx.value?.state })
    if (!ready || !buffer || !audioCtx.value || !audioGain.value) {
      if (!warnedAudioBlocked) {
        console.warn('音频未解锁或采样未加载，请点击界面或先点击开始练习以启用声音')
        warnedAudioBlocked = true
      }
      return
    }
    const source = audioCtx.value.createBufferSource()
    source.buffer = buffer
    source.connect(audioGain.value)
    source.start()
  } catch (err) {
    console.error('[audio] trigger error', err, { state: audioCtx.value?.state })
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

const displayedInputs = computed(() => strayInputs.value.slice(0, 4))

function bindAudioGesture() {
  if (audioGestureHandler) return
  audioGestureHandler = async () => {
    try {
      console.log('[audio] pointerdown gesture detected')
      const ok = await initAudio()
      if (ok && audioGestureHandler) {
        window.removeEventListener('pointerdown', audioGestureHandler)
        audioGestureHandler = null
      }
    } catch (err) {
      console.error('[audio] gesture init error', err)
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
  window.removeEventListener('keydown', handleKeydown)
  if (audioGestureHandler) {
    window.removeEventListener('pointerdown', audioGestureHandler)
  }
  Object.values(audioBuffers.value).forEach(() => {})
  if (audioCtx.value && audioCtx.value.state !== 'closed') {
    audioCtx.value.close()
  }
})

function logAudioStatus() {
  console.log('[audio] status', {
    ctx: audioCtx.value?.state,
    gain: audioGain.value?.gain.value,
    buffers: Object.keys(audioBuffers.value).length,
  })
}
</script>

<template>
  <div class="practice-layout">
    <div class="panel practice-top">
      <div class="practice-meta">
        <div class="meta-head">
          <div>
            <h2 class="section-title">魔法节奏练习</h2>
            <p class="text-muted">
              按节奏敲下指定键位，窗口默认 ±{{ Math.round(judgeWindowRatio * 100) }}%，错键 0 分但不中断后续
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
            <span>速度（ms / 格）</span>
            <input v-model.number="tempoMsPerCell" type="number" min="120" max="1800" step="20" />
          </label>
          <label class="control">
            <span>判定窗口半径（单格 ±%）</span>
            <div class="input-with-suffix">
              <input v-model.number="judgeWindowPercent" type="number" min="5" max="60" step="1" />
              <span class="suffix">%</span>
            </div>
            <small class="text-muted">
              半窗 ≈ {{ Math.round(judgeWindowMs) }}ms（±{{ judgeWindowPercent }}%），总窗 ≈
              {{ Math.round(judgeWindowTotalMs) }}ms（{{ judgeWindowTotalPercent }}%）
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
            <span>起拍空格</span>
            <input v-model.number="leadInCells" type="number" min="0" max="8" />
          </label>
          <label class="control">
            <span>输入偏移（ms）</span>
            <input v-model.number="inputOffsetMs" type="number" min="-200" max="200" step="5" />
          </label>
          <label class="control wide">
            <span>键位映射（1-7）</span>
            <input v-model="keyBindingsText" type="text" placeholder="例如：1 2 3 4 5 6 7 或 z x c v b n m" />
            <small class="text-muted">
              顺序对应音符 1-7，仅监听出现的键：{{ allowedKeys.join(', ') }}
            </small>
          </label>
        </div>
        <div class="control-row actions">
          <button class="btn" type="button" @click="startPractice" :disabled="session.playing">开始练习</button>
          <button class="btn btn-danger" type="button" @click="resetSession">重置</button>
          <div class="text-muted">
            BPM: {{ phrase.bpm ?? Math.round(60000 / tempoMsPerCell) }}｜时长:
            {{ Math.round(trackDurationMs / 1000 * 10) / 10 }}s
          </div>
        </div>
      </div>
      <div class="score-card">
        <div class="score-number">{{ normalizedScore.toFixed(1) }}</div>
        <div class="score-label">总分 (0 - 100)</div>
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

    <div class="panel track-panel">
      <div class="track-head">
        <div>
          <div class="section-title">{{ phrase.name }}</div>
          <p class="text-muted">{{ phrase.description }}</p>
        </div>
        <div class="text-muted">
          时间线 {{ Math.round(timelinePercent) }}% ｜ 窗口 {{ Math.round(judgeWindowMs) }}ms
        </div>
      </div>
      <div class="resonance-bar">
        <div class="resonance-bg"></div>
        <div class="track-line"></div>
        <div class="lead-tick" v-for="idx in leadInCells" :key="`lead-${idx}`" :style="{ left: `${leadTickPercent(idx - 1)}%` }">
          <span class="tick-dot"></span>
          <span class="tick-count">{{ leadInCells - idx + 1 }}</span>
        </div>
        <div
          v-for="state in noteStates"
          :key="state.index"
          class="note-node"
          :class="[
            state.status,
            { optional: state.note.required === false, active: isInJudgeWindow(state) && state.status === 'pending' },
            hitTier(state) ? `acc-${hitTier(state)}` : '',
          ]"
          :style="{ left: `${notePositionPercent(state.index)}%` }"
        >
          <div class="note-glow"></div>
          <div class="note-core">
            {{ state.note.label ?? state.note.pitch ?? '·' }}
          </div>
          <div v-if="state.note.hint" class="note-hint">{{ state.note.hint }}</div>
        </div>
        <div class="playhead" :style="{ left: `${timelinePercent}%` }"></div>
      </div>
      <div class="track-foot">
        <div>音符序列：{{ phrase.notes.map((n) => (n.pitch ?? '·')).join(' ') }}</div>
        <div v-if="displayedInputs.length" class="stray-log">
          <span class="text-muted">最近未判定输入：</span>
          <span v-for="input in displayedInputs" :key="input.time" class="stray-entry">
            {{ input.key }} · {{ input.message }}
          </span>
        </div>
      </div>
    </div>

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
  gap: 6px;
  align-items: flex-start;
}

.score-number {
  font-size: 40px;
  font-weight: 800;
  color: #f5d06f;
}

.score-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.7);
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

.track-panel {
  position: relative;
}

.track-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.resonance-bar {
  position: relative;
  min-height: 160px;
  padding: 24px 20px;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(135deg, rgba(9, 11, 26, 0.7), rgba(27, 20, 54, 0.9));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow:
    inset 0 0 40px rgba(76, 201, 240, 0.08),
    0 12px 30px rgba(0, 0, 0, 0.35);
}

.resonance-bg {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 20% 40%, rgba(124, 247, 189, 0.12), transparent 32%),
    radial-gradient(circle at 80% 60%, rgba(76, 201, 240, 0.12), transparent 30%);
  pointer-events: none;
  z-index: 0;
}

.track-line {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  box-shadow: 0 0 10px rgba(124, 247, 189, 0.35);
  transform: translateY(-50%);
  z-index: 1;
}

.lead-tick {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 2;
}

.tick-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.25);
  box-shadow: 0 0 10px rgba(245, 208, 111, 0.4);
  animation: tickPulse 1s ease-in-out infinite;
}

.tick-count {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

@keyframes tickPulse {
  0% {
    transform: scale(0.9);
    opacity: 0.6;
  }
  50% {
    transform: scale(1.08);
    opacity: 1;
  }
  100% {
    transform: scale(0.9);
    opacity: 0.6;
  }
}

.note-node {
  position: absolute;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 140px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
  pointer-events: none;
  z-index: 2;
}

.note-core {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  font-weight: 800;
  letter-spacing: 0.3px;
  background: rgba(255, 255, 255, 0.06);
  border: 2px solid rgba(255, 255, 255, 0.24);
  color: #f5f7ff;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.05),
    inset 0 0 10px rgba(255, 255, 255, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  z-index: 1;
}

.note-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 90px;
  height: 90px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(76, 201, 240, 0.18), transparent 55%);
  filter: blur(8px);
  opacity: 0.85;
  animation: glowFloat 3s ease-in-out infinite;
  z-index: 0;
}

@keyframes glowFloat {
  0% {
    transform: translate(-50%, -50%) scale(0.96);
  }
  50% {
    transform: translate(-50%, -50%) scale(1.04);
  }
  100% {
    transform: translate(-50%, -50%) scale(0.96);
  }
}

.note-node .note-hint {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.note-node.active .note-core {
  border-color: rgba(76, 201, 240, 0.9);
  box-shadow:
    0 0 18px rgba(76, 201, 240, 0.55),
    0 0 0 2px rgba(186, 247, 210, 0.18);
  transform: translateZ(0) scale(1.08);
}

.note-node.hit .note-core {
  background: radial-gradient(circle, rgba(93, 225, 123, 0.32), rgba(76, 201, 240, 0.18));
  border-color: rgba(93, 225, 123, 0.8);
  box-shadow:
    0 0 22px rgba(93, 225, 123, 0.55),
    0 0 0 3px rgba(93, 225, 123, 0.15);
}

.note-node.acc-perfect .note-core {
  box-shadow:
    0 0 26px rgba(245, 208, 111, 0.55),
    0 0 0 4px rgba(245, 208, 111, 0.25),
    0 0 0 6px rgba(93, 225, 123, 0.2);
  transform: translateZ(0) scale(1.12);
}

.note-node.acc-good .note-core {
  box-shadow:
    0 0 22px rgba(76, 201, 240, 0.5),
    0 0 0 3px rgba(76, 201, 240, 0.18);
}

.note-node.acc-ok .note-core {
  box-shadow:
    0 0 16px rgba(93, 225, 123, 0.4),
    0 0 0 2px rgba(93, 225, 123, 0.14);
}

.note-node.wrong .note-core {
  background: radial-gradient(circle, rgba(255, 123, 156, 0.28), rgba(245, 208, 111, 0.12));
  border-color: rgba(255, 123, 156, 0.7);
  box-shadow:
    0 0 18px rgba(255, 123, 156, 0.45),
    0 0 0 2px rgba(255, 123, 156, 0.16);
}

.note-node.miss .note-core {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.6);
}

.note-node.optional .note-core {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.45);
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, #baf8d2, #4cc9f0);
  box-shadow:
    0 0 16px rgba(124, 247, 189, 0.55),
    0 0 0 6px rgba(76, 201, 240, 0.08);
  transform: translateX(-1.5px);
  animation: playheadSweep 1.4s ease-in-out infinite;
  z-index: 3;
}

@keyframes playheadSweep {
  0% {
    opacity: 0.82;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.82;
  }
}

.track-foot {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.stray-log {
  display: flex;
  gap: 8px;
  align-items: center;
}

.stray-entry {
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  font-size: 12px;
}

@media (max-width: 960px) {
  .practice-top {
    grid-template-columns: 1fr;
  }

  .resonance-bar {
    min-height: 140px;
    padding: 18px 14px;
  }
}
</style>
