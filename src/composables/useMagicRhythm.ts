import { computed, reactive, ref, shallowRef, watch } from 'vue'
import * as Tone from 'tone'
import { RHYTHM_PHRASES } from '@/data/rhythmPhrases'
import type { RhythmKey, RhythmNote } from '@/types/rhythm'
import { beatMs, buildNoteTimings, normalizeScore, resolveNoteDurationBeats, scoreOffset } from '@/utils/rhythm'
import { clamp } from '@/utils/math'
import type { TrackDivider, TrackLeadTick, TrackNote } from '@/components/MagicRhythmTrack.vue'

// --- Types ---
export interface NoteState {
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

// --- Constants ---
const allKeys: RhythmKey[] = [
    '0', '.', '1', '2', '3', '4', '5', '6', '7', '8', '9', '+', 'insert', '/', '*', '-',
    'z', 'x', 'c', 'v', 'b', 'n', 'm', 'j', 'k', 'l', ';', 'arrowright', 'pagedown',
]
const allKeySet = new Set(allKeys)
const defaultKeyBindingText = '0 . 1 arrowright 2 3 4 5 6 7 8 pagedown 9 + insert / * -'
const pitchSequence = ['A,', 'B,', 'C', '^C', 'D', 'E', 'F', 'G', 'A', 'B', "C'", "^C'", "D'", "E'", "F'", "G'", "A'", "B'"]
const defaultKeyBindings = defaultKeyBindingText.split(/[\s,]+/).filter(Boolean) as RhythmKey[]

const pitchToToneNote: Record<string, string> = {
    'A,': 'A3', 'B,': 'B3', 'C': 'C4', '^C': 'Db4', '_D': 'Db4', 'D': 'D4', 'E': 'E4', 'F': 'F4', 'G': 'G4', 'A': 'A4', 'B': 'B4',
    "C'": 'C5', "^C'": 'Db5', "_D'": 'Db5', "D'": 'D5', "E'": 'E5', "F'": 'F5', "G'": 'G5', "A'": 'A5', "B'": 'B5',
}

const FLOW_IN_BEATS = 4
const JUDGE_LINE_PERCENT = 45

export function useMagicRhythm() {
    // --- State ---
    const phraseId = ref(RHYTHM_PHRASES[0]?.id ?? '')
    const phrase = computed(() => RHYTHM_PHRASES.find((item) => item.id === phraseId.value) ?? RHYTHM_PHRASES[0]!)

    const bpm = ref(100)
    const leadInBeats = ref(1)
    const trailInBeats = ref(1)
    const inputOffsetMs = ref(0)
    const volumePercent = ref(100)

    // Scoring Params
    const judgeWindowRatio = ref(0.3)
    const perfectWindowRatio = ref(0.2)

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

    // Audio
    const toneCtx = shallowRef<Tone.Context | null>(null)
    const toneReverb = shallowRef<Tone.Reverb | null>(null)
    const tonePlayers = shallowRef<Tone.Players | null>(null)
    let rafId: number | null = null
    let demoTimers: number[] = []

    // --- Computed ---
    const beatDurationMs = computed(() => beatMs(bpm.value))
    const noteTimings = computed(() => buildNoteTimings(phrase.value.notes, leadInBeats.value, bpm.value))
    const totalBeats = computed(() =>
        Math.max(leadInBeats.value, 0) +
        phrase.value.notes.reduce((sum, note) => sum + resolveNoteDurationBeats(note.durationBeats), 0) +
        Math.max(trailInBeats.value, 0),
    )
    const trackDurationMs = computed(() => {
        if (noteTimings.value.length === 0) return beatDurationMs.value * totalBeats.value
        const last = noteTimings.value[noteTimings.value.length - 1]
        if (!last) return beatDurationMs.value * totalBeats.value
        return last.startMs + Math.max(trailInBeats.value, 0) * beatDurationMs.value
    })

    const timelinePercent = computed(() => clamp((session.elapsed / trackDurationMs.value) * 100, 0, 100))
    const judgeWindowMs = computed(() => beatDurationMs.value * judgeWindowRatio.value)

    // Scoring
    const maxPossibleScore = computed(() => phrase.value.notes.filter((note) => note.pitch !== null).length)
    const totalRawScore = computed(() =>
        noteStates.value.reduce((sum, state) => {
            if (state.note.pitch === null) return sum
            return sum + state.score
        }, 0),
    )
    const normalizedScore = computed(() => normalizeScore(totalRawScore.value, maxPossibleScore.value))

    // Note Display
    const keyBindings = computed<RhythmKey[]>(() => defaultKeyBindings.slice(0, pitchSequence.length))
    const keyToPitch = computed<Record<string, string | number>>(() => {
        const map: Record<string, string | number> = {}
        keyBindings.value.forEach((key, idx) => {
            const pitch = pitchSequence[idx]
            if (pitch !== undefined) map[key] = pitch
        })
        return map
    })

    const displayNotes = computed<TrackNote[]>(() => {
        return noteStates.value.map((state, index): TrackNote | null => {
            const timing = noteTimings.value[index]
            if (!timing) return null

            const ms = timing.startMs
            const duration = trackDurationMs.value

            const timeUntilHit = ms - session.elapsed
            const flowInMs = Math.max(beatDurationMs.value * FLOW_IN_BEATS, 30)
            const judgeLine = JUDGE_LINE_PERCENT

            const flowOutMs = Math.max((flowInMs / (100 - JUDGE_LINE_PERCENT)) * JUDGE_LINE_PERCENT, 30)

            const relativeMs = ms - session.elapsed
            let left = 0
            if (relativeMs >= 0) {
                const ratio = relativeMs / flowInMs
                left = JUDGE_LINE_PERCENT + ratio * (100 - JUDGE_LINE_PERCENT)
            } else {
                const ratio = -relativeMs / flowOutMs
                left = JUDGE_LINE_PERCENT - ratio * JUDGE_LINE_PERCENT
            }

            if (left < -10 || left > 110) return null

            const note = state.note
            const pitchIndex = pitchSequence.indexOf(String(note.pitch))
            const boundKey = pitchIndex !== -1 ? keyBindings.value[pitchIndex] : '?'
            let displayKey = boundKey?.toUpperCase() || ''
            if (displayKey === 'ARROWRIGHT') displayKey = '→'
            if (displayKey === 'PAGEDOWN') displayKey = 'PgDn'
            if (displayKey === 'INSERT') displayKey = 'Ins'

            return {
                key: index,
                left,
                status: state.status,
                required: note.required !== false,
                isPendingActive: state.status === 'pending' && Math.abs(relativeMs) <= judgeWindowMs.value,
                hitTier: state.score >= 0.8 ? 'perfect' : state.score >= 0.4 ? 'good' : state.score > 0 ? 'ok' : '',
                pitch: note.pitch,
                display: {
                    text: renderNoteLabel(note.pitch),
                    dot: getOctaveDot(note.pitch),
                    beatText: displayKey
                }
            }
        }).filter((n): n is TrackNote => n !== null)
    })

    // Measures and Ticks logic similar to View
    const visibleMeasures = computed<TrackDivider[]>(() => {
        // ... Simplified implementation
        return [] // TODO: Implement if needed for visuals
    })

    const visibleLeadTicks = computed<TrackLeadTick[]>(() => {
        // ... Simplified implementation
        return [] // TODO: Implement if needed for visuals
    })

    // --- Audio ---
    // --- Audio ---

    // Derived from pitchToToneNote values
    const toneNotes = Array.from(new Set(Object.values(pitchToToneNote)))

    function noteUrl(note: string) {
        return new URL(`../assets/acoustic_grand_piano/${note}.mp3`, import.meta.url).toString()
    }

    async function initAudio() {
        if (toneCtx.value && toneCtx.value.state === 'running' && tonePlayers.value?.loaded) return

        if (!toneCtx.value) {
            await Tone.start()
            const ctx = Tone.getContext()
            toneCtx.value = ctx as any
        }

        if (toneCtx.value?.state !== 'running') {
            await toneCtx.value?.resume()
        }

        if (!toneReverb.value) {
            toneReverb.value = new Tone.Reverb({
                decay: 3,
                wet: 0.35,
                preDelay: 0.01,
            }).toDestination()
        }

        if (!tonePlayers.value) {
            const urls = toneNotes.reduce<Record<string, string>>((acc, note) => {
                acc[note] = noteUrl(note)
                return acc
            }, {})

            await new Promise<void>((resolve) => {
                const players = new Tone.Players(
                    urls,
                    () => {
                        resolve()
                    }
                ).connect(toneReverb.value!)
                players.fadeOut = 0.8
                players.volume.value = -2 // Increased volume
                tonePlayers.value = players
            })
        }
    }

    async function playNoteByPitch(pitch: string | number) {
        if (!pitch) return
        const toneNote = pitchToToneNote[String(pitch)]
        if (!toneNote) return

        // Ensure audio is initialized (lazy load if needed, though usually initAudio is called on start)
        if (!tonePlayers.value || !tonePlayers.value.loaded) {
            void initAudio()
            return
        }

        try {
            if (toneCtx.value?.state !== 'running') {
                await toneCtx.value?.resume()
            }

            const player = tonePlayers.value.player(toneNote)
            if (player) {
                player.stop()
                player.start()
            }
        } catch (err) {
            console.warn('Audio playback failed', err)
        }
    }

    // --- Logic ---
    function resetSession() {
        session.playing = false
        session.finished = false
        session.elapsed = 0
        session.combo = 0
        session.maxCombo = 0
        noteStates.value = phrase.value.notes.map((note, index) => ({
            note,
            index,
            status: 'pending',
            score: 0,
        }))
        inputQueue.value = []
        if (rafId) cancelAnimationFrame(rafId)
    }

    let onSessionComplete: ((result: { score: number; combo: number }) => void) | null = null

    function start(newPhraseId?: string, onComplete?: (result: { score: number; combo: number }) => void) {
        if (newPhraseId) {
            phraseId.value = newPhraseId
            bpm.value = phrase.value.bpm ?? 100
            leadInBeats.value = phrase.value.leadInBeats ?? 1
            trailInBeats.value = phrase.value.trailInBeats ?? 1
        }
        onSessionComplete = onComplete || null
        resetSession()
        session.playing = true
        session.startAt = performance.now()
        void initAudio()

        const loop = () => {
            if (!session.playing) return
            const now = performance.now()
            session.elapsed = now - session.startAt

            processInputQueue()
            processMisses(now)

            if (session.elapsed >= trackDurationMs.value) {
                finish()
                return
            }
            rafId = requestAnimationFrame(loop)
        }
        rafId = requestAnimationFrame(loop)
    }

    function stop() {
        resetSession()
        onSessionComplete = null
    }

    function finish() {
        session.playing = false
        session.finished = true
        session.elapsed = trackDurationMs.value
        // Cleanup pending
        noteStates.value.forEach(s => {
            if (s.status === 'pending' && s.note.pitch !== null) {
                s.status = 'miss'
            }
        })

        if (onSessionComplete) {
            onSessionComplete({
                score: normalizedScore.value,
                combo: session.maxCombo
            })
        }
    }

    function handleInput(event: KeyboardEvent) {
        if (!session.playing) return
        if (event.repeat) return
        const code = event.code
        let key: RhythmKey | null = null
        // Normalize logic (simplified)
        if (code === 'Insert') key = 'insert'
        else if (code === 'PageDown') key = 'pagedown'
        else if (code === 'ArrowRight') key = 'arrowright'
        else if (code.startsWith('Numpad')) {
            const lower = code.toLowerCase()
            const digit = lower.match(/^numpad([0-9])$/)
            if (digit) {
                key = digit[1] as RhythmKey
            } else {
                switch (lower) {
                    case 'numpaddecimal': key = '.'; break;
                    case 'numpadadd': key = '+'; break;
                    case 'numpadsubtract': key = '-'; break;
                    case 'numpadmultiply': key = '*'; break;
                    case 'numpaddivide': key = '/'; break;
                }
            }
        }
        else {
            const k = event.key.toLowerCase()
            if (allKeySet.has(k as RhythmKey)) key = k as RhythmKey
        }

        if (!key) return

        // Check pitch mapping
        const pitch = keyToPitch.value[key]
        if (pitch === undefined) return

        const time = performance.now() + inputOffsetMs.value
        inputQueue.value.push({ key, pitch, time })
        playNoteByPitch(pitch)
    }

    function processInputQueue() {
        if (!session.playing) return
        const queue = [...inputQueue.value]
        inputQueue.value = []
        const updated = [...noteStates.value]

        for (const input of queue) {
            // Find closest pending note
            let bestMatch: { index: number, diff: number } | null = null

            for (let idx = 0; idx < updated.length; idx++) {
                const state = updated[idx]
                if (!state) continue
                if (state.status !== 'pending' || state.note.pitch === null) continue
                const timing = noteTimings.value[idx]
                if (!timing) continue
                const judgeTime = session.startAt + timing.startMs
                const diff = Math.abs(input.time - judgeTime)
                if (diff <= judgeWindowMs.value) {
                    if (!bestMatch || diff < bestMatch.diff) {
                        bestMatch = { index: idx, diff }
                    }
                }
            }

            if (bestMatch) {
                const idx = bestMatch.index
                const state = updated[idx]
                if (state && state.note.pitch == input.pitch) {
                    const score = scoreOffset(bestMatch.diff, beatDurationMs.value, judgeWindowRatio.value)
                    updated[idx] = { ...state, status: 'hit', score }
                    session.combo++
                } else if (state) {
                    updated[idx] = { ...state, status: 'wrong', score: 0 }
                    session.combo = 0
                }
            }
        }
        noteStates.value = updated
    }

    function processMisses(now: number) {
        const updated = [...noteStates.value]
        updated.forEach((state, idx) => {
            if (state.status !== 'pending' || state.note.pitch === null) return
            const timing = noteTimings.value[idx]
            if (!timing) return
            const deadline = session.startAt + timing.startMs + judgeWindowMs.value
            if (now > deadline) {
                updated[idx] = { ...state, status: 'miss', score: 0 }
                session.combo = 0
            }
        })
        noteStates.value = updated
    }

    // Helpers for display
    const abcToNumbered: Record<string, string> = {
        'C': '1', 'D': '2', 'E': '3', 'F': '4', 'G': '5', 'A': '6', 'B': '7'
    }

    function renderNoteLabel(pitch: string | number | null) {
        if (!pitch) return ''
        let p = String(pitch)

        // Convert ABC to Numbered
        p = p.replace(/[CDEFGAB]/g, (match) => abcToNumbered[match] || match)
        p = p.replace(/\^/g, '#').replace(/_/g, 'b')

        // Remove octave markers as they are handled by the dot
        p = p.replace(/['+,]/g, '')

        return p
    }

    function getOctaveDot(pitch: string | number | null): 'above' | 'below' | null {
        if (!pitch) return null
        const s = String(pitch)
        if (s.includes("'")) return 'above'
        if (s.includes(",")) return 'below'
        return null
    }

    return {
        start,
        stop,
        handleInput,
        session,
        normalizedScore,
        trackProps: reactive({
            timelinePercent,
            judgeWindowMs,
            judgeLinePercent: JUDGE_LINE_PERCENT,
            visibleNotes: displayNotes,
            visibleMeasures,
            visibleLeadTicks
        })
    }
}
