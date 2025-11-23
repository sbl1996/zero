import { computed, ref } from 'vue'

type FeedbackState = 'idle' | 'success' | 'failure'

interface EnhanceFeedbackOptions {
  flashDuration?: number
  enableVibrate?: boolean
}

function playTone(state: Exclude<FeedbackState, 'idle'>) {
  if (typeof window === 'undefined' || typeof AudioContext === 'undefined') return

  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = state === 'success' ? 520 : 180
    const now = ctx.currentTime
    gain.gain.setValueAtTime(state === 'success' ? 0.08 : 0.12, now)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(now + 0.5)
  } catch (err) {
    console.warn('Enhance feedback tone error', err)
  }
}

export function useEnhanceFeedback(options?: EnhanceFeedbackOptions) {
  const state = ref<FeedbackState>('idle')
  const flashKey = ref(0)
  const pulseKey = ref(0)
  const flashDuration = Math.max(400, options?.flashDuration ?? 1200)
  const vibrateEnabled = options?.enableVibrate ?? true

  function trigger(stateName: Exclude<FeedbackState, 'idle'>) {
    state.value = stateName
    flashKey.value += 1
    pulseKey.value += 1
    playTone(stateName)
    if (vibrateEnabled && typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.(stateName === 'success' ? [12, 50, 12] : [40, 30, 40])
    }
    window.setTimeout(() => {
      state.value = 'idle'
    }, flashDuration)
  }

  return {
    feedbackState: computed(() => state.value),
    flashKey,
    pulseKey,
    triggerSuccess: () => trigger('success'),
    triggerFailure: () => trigger('failure'),
  }
}
