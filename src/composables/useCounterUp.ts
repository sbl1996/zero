import { ref, watch, type Ref } from 'vue'

export interface CounterUpOptions {
  duration?: number
  easing?: (progress: number) => number
  initialValue?: number
}

export interface CounterUpAnimateOptions {
  duration?: number
  immediate?: boolean
}

export type CounterUpTrackOptions = CounterUpAnimateOptions

export interface CounterUpController {
  value: Ref<number>
  target: Ref<number>
  animateTo: (next: number, options?: CounterUpAnimateOptions) => void
  stop: () => void
  track: (source: Ref<number>, options?: CounterUpTrackOptions) => void
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

export function useCounterUp(options: CounterUpOptions = {}): CounterUpController {
  const duration = Math.max(120, options.duration ?? 600)
  const easing = options.easing ?? easeOutCubic
  const value = ref(options.initialValue ?? 0)
  const target = ref(value.value)

  let raf: number | null = null
  let startTime: number | null = null
  let fromValue = value.value
  let activeDuration = duration

  function stop() {
    if (raf !== null) {
      cancelAnimationFrame(raf)
      raf = null
    }
    startTime = null
  }

  function step(timestamp: number) {
    if (startTime === null) {
      startTime = timestamp
    }
    const elapsed = timestamp - startTime
    const progress = Math.min(1, elapsed / activeDuration)
    const eased = easing(progress)
    value.value = fromValue + (target.value - fromValue) * eased

    if (progress < 1) {
      raf = requestAnimationFrame(step)
    } else {
      raf = null
      startTime = null
      value.value = target.value
    }
  }

  function animateTo(next: number, animateOptions?: CounterUpAnimateOptions) {
    const immediate = animateOptions?.immediate ?? false
    const requestedDuration = animateOptions?.duration ?? duration
    activeDuration = Math.max(120, requestedDuration)
    fromValue = value.value
    target.value = next

    if (immediate || fromValue === next) {
      stop()
      value.value = next
      return
    }

    stop()
    raf = requestAnimationFrame(step)
  }

  function track(source: Ref<number>, trackOptions?: CounterUpTrackOptions) {
    watch(
      source,
      (next) => {
        if (typeof next !== 'number' || Number.isNaN(next)) return
        animateTo(next, trackOptions)
      },
      { immediate: true },
    )
  }

  return {
    value,
    target,
    animateTo,
    stop,
    track,
  }
}
