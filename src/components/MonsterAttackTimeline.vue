<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
import type { MonsterFollowupStage, PendingDodgeState } from '@/types/domain'

const HALF_SPAN_SECONDS = 3
const TOTAL_SPAN_SECONDS = HALF_SPAN_SECONDS * 2
const DODGE_JUDGE_SECONDS = DODGE_WINDOW_MS / 1000
const ATTACK_RESET_THRESHOLD = 0.25
const HALF_SPAN_MS = HALF_SPAN_SECONDS * 1000

const props = defineProps<{
  active: boolean
  timeToAttack: number | null
  pendingDodge: PendingDodgeState | null
  actionLockUntil: number | null
  followup: { time: number, label?: string, phase?: MonsterFollowupStage, delay?: number, hits?: number[] } | null
}>()

const getNowMs = () => (typeof performance !== 'undefined' && typeof performance.now === 'function'
  ? performance.now()
  : Date.now())

const nowMs = ref(getNowMs())
let rafId: number | null = null
const hasWindow = typeof window !== 'undefined'
const hasRAF = hasWindow && typeof window.requestAnimationFrame === 'function'
const hasCancelRAF = hasWindow && typeof window.cancelAnimationFrame === 'function'
const lastAttackAt = ref<number | null>(null)
const previousTimer = ref<number | null>(null)

const shouldAnimate = computed(() => {
  if (props.active) return true
  if (props.actionLockUntil !== null && props.actionLockUntil > nowMs.value) return true
  if (props.pendingDodge?.attemptedAt && props.pendingDodge.attemptedAt + DODGE_JUDGE_SECONDS * 1000 > nowMs.value) return true
  if (lastAttackAt.value !== null && nowMs.value - lastAttackAt.value <= HALF_SPAN_MS) return true
  return false
})

function tick() {
  nowMs.value = getNowMs()
  if (!hasRAF) return
  rafId = window.requestAnimationFrame(tick)
}

function startLoop() {
  if (!hasRAF) return
  if (rafId !== null) return
  rafId = window.requestAnimationFrame(tick)
}

function stopLoop() {
  if (!hasCancelRAF) {
    rafId = null
    return
  }
  if (rafId === null) return
  window.cancelAnimationFrame(rafId)
  rafId = null
}

watch(shouldAnimate, (animate) => {
  if (!hasRAF) return
  if (animate) {
    startLoop()
  } else {
    stopLoop()
  }
}, { immediate: true })

onMounted(() => {
  if (!hasRAF) return
  if (shouldAnimate.value) {
    startLoop()
  }
})

onBeforeUnmount(() => {
  stopLoop()
})

watch(() => props.active, (nextActive) => {
  if (!nextActive) {
    previousTimer.value = null
  }
})

watch(() => props.timeToAttack, (currentSeconds) => {
  const prev = previousTimer.value
  if (currentSeconds === null || !Number.isFinite(currentSeconds)) {
    previousTimer.value = currentSeconds
    return
  }

  if (props.active && prev !== null && Number.isFinite(prev)) {
    if (currentSeconds > prev + ATTACK_RESET_THRESHOLD) {
      lastAttackAt.value = getNowMs()
    }
  }

  previousTimer.value = currentSeconds
}, { immediate: true })

const formattedCountdown = computed(() => {
  if (!props.active || props.timeToAttack === null) return '—'
  const remaining = Math.max(0, props.timeToAttack)
  return `${remaining.toFixed(2)}s`
})

function clampToSpan(seconds: number) {
  if (seconds > HALF_SPAN_SECONDS) return HALF_SPAN_SECONDS
  if (seconds < -HALF_SPAN_SECONDS) return -HALF_SPAN_SECONDS
  return seconds
}

function timeToPercent(seconds: number) {
  const clamped = clampToSpan(seconds)
  return ((clamped + HALF_SPAN_SECONDS) / TOTAL_SPAN_SECONDS) * 100
}

function segmentToStyle(startSeconds: number, endSeconds: number) {
  const leftSeconds = clampToSpan(startSeconds)
  const rightSeconds = clampToSpan(endSeconds)
  if (rightSeconds <= -HALF_SPAN_SECONDS || leftSeconds >= HALF_SPAN_SECONDS) return null
  const leftPercent = timeToPercent(leftSeconds)
  const rightPercent = timeToPercent(rightSeconds)
  const width = rightPercent - leftPercent
  if (width <= 0) return null
  return {
    left: `${leftPercent}%`,
    width: `${width}%`,
  }
}

const attackMarkerStyle = computed(() => {
  if (!props.active || props.timeToAttack === null) return null
  const positionPercent = timeToPercent(props.timeToAttack)
  return {
    left: `${positionPercent}%`,
  }
})

const followupLabel = computed(() => props.followup?.label ?? '追击')

const followupPhase = computed<MonsterFollowupStage | null>(() => props.followup?.phase ?? null)

const followupAttackClasses = computed(() => {
  const phase = followupPhase.value
  return {
    'timeline-rail__attack': true,
    'timeline-rail__attack--followup': true,
    'is-telegraph': phase === 'telegraph',
    'is-active': phase === 'active',
  }
})

const attackSeverityClass = computed(() => {
  if (!props.active || props.timeToAttack === null) return 'is-idle'
  if (props.timeToAttack <= 0.3) return 'is-danger'
  if (props.timeToAttack <= 0.6) return 'is-warning'
  return 'is-ready'
})

const dodgeHintSegmentStyle = computed(() => {
  if (!props.active) return null
  return segmentToStyle(0, DODGE_JUDGE_SECONDS)
})

const dodgeHintClasses = computed(() => {
  const classes: Record<string, boolean> = {
    'is-available': props.active,
  }
  if (!props.active) return classes
  const time = props.timeToAttack
  if (time === null) return classes
  if (time > 0 && time <= DODGE_JUDGE_SECONDS) {
    classes['is-imminent'] = true
  } else if (time > DODGE_JUDGE_SECONDS && time <= DODGE_JUDGE_SECONDS * 2) {
    classes['is-approaching'] = true
  } else if (time <= 0 && time >= -DODGE_JUDGE_SECONDS) {
    classes['is-past'] = true
  } else {
    classes['is-distant'] = true
  }
  return classes
})

const followupMarkers = computed(() => {
  if (!props.active) return []
  const hint = props.followup
  if (!hint) return []
  const rawTimes = Array.isArray(hint.hits) && hint.hits.length > 0
    ? hint.hits
    : (Number.isFinite(hint.time) ? [hint.time] : [])
  return rawTimes
    .map((value) => Math.max(0, Number(value)))
    .filter((value) => Number.isFinite(value))
    .map((time, index) => ({
      key: `followup-${index}`,
      style: {
        left: `${timeToPercent(time)}%`,
      },
      showLabel: index === 0,
    }))
})

const recentAttackStyle = computed(() => {
  const occurredAt = lastAttackAt.value
  if (occurredAt === null) return null
  const elapsed = (nowMs.value - occurredAt) / 1000
  if (elapsed < 0 || elapsed > HALF_SPAN_SECONDS) return null
  const leftPercent = timeToPercent(-elapsed)
  return {
    left: `${leftPercent}%`,
  }
})

watch(nowMs, () => {
  const occurredAt = lastAttackAt.value
  if (occurredAt !== null && nowMs.value - occurredAt > HALF_SPAN_MS) {
    lastAttackAt.value = null
  }
})

const timelineClasses = computed(() => ({
  'is-inactive': !props.active,
}))
</script>

<template>
  <div class="monster-attack-timeline" :class="timelineClasses">
    <div class="timeline-header">
      <span class="timeline-title">怪物攻击</span>
      <span class="timeline-countdown">{{ formattedCountdown }}</span>
    </div>
    <div class="timeline-rail">
      <div class="timeline-rail__fill" />
      <div class="timeline-rail__ticks" />
      <div class="timeline-rail__center" />
      <div
        v-if="dodgeHintSegmentStyle"
        class="timeline-rail__hint"
        :class="dodgeHintClasses"
        :style="dodgeHintSegmentStyle"
      />
      <div
        v-if="attackMarkerStyle"
        class="timeline-rail__attack"
        :class="attackSeverityClass"
        :style="attackMarkerStyle"
      >
        <span class="timeline-rail__attack-glow" />
      </div>
      <div
        v-for="marker in followupMarkers"
        :key="marker.key"
        :class="followupAttackClasses"
        :style="marker.style"
      >
        <span v-if="marker.showLabel" class="timeline-rail__attack-label">{{ followupLabel }}</span>
        <span class="timeline-rail__attack-glow" />
      </div>
      <div
        v-if="recentAttackStyle"
        class="timeline-rail__attack timeline-rail__attack--past"
        :style="recentAttackStyle"
      >
        <span class="timeline-rail__attack-glow" />
      </div>
    </div>
    <div class="timeline-scale">
      <span>-3s</span>
      <span>现在</span>
      <span>+3s</span>
    </div>
  </div>
</template>

<style scoped>
.monster-attack-timeline {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 10px;
  background: linear-gradient(180deg, rgba(28, 34, 46, 0.65), rgba(21, 24, 32, 0.6));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
  transition: opacity 0.2s ease, filter 0.2s ease;
}

.monster-attack-timeline.is-inactive {
  opacity: 0.6;
  filter: grayscale(25%);
}

.timeline-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
}

.timeline-title {
  letter-spacing: 0.06em;
}

.timeline-countdown {
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  color: rgba(250, 250, 250, 0.9);
}

.timeline-rail {
  position: relative;
  height: 32px;
  border-radius: 999px;
  overflow: hidden;
}

.timeline-rail__fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(38, 46, 60, 0.85), rgba(18, 26, 34, 0.85));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: inherit;
}

.timeline-rail__ticks {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(90deg, transparent 0, transparent calc(100% / 12 - 1px), rgba(255, 255, 255, 0.05) calc(100% / 12 - 1px), rgba(255, 255, 255, 0.05) calc(100% / 12));
  mix-blend-mode: screen;
  pointer-events: none;
}

.timeline-rail__center {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 50%;
  width: 2px;
  border-radius: 1px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0));
  transform: translateX(-50%);
}

.timeline-rail__hint {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 14px;
  background: linear-gradient(90deg, rgba(143, 204, 255, 0.22), rgba(180, 229, 255, 0.34), rgba(143, 204, 255, 0.22));
  border: 1px solid rgba(156, 219, 255, 0.35);
  box-shadow: 0 0 16px rgba(120, 206, 255, 0.28);
  mix-blend-mode: screen;
  pointer-events: none;
  z-index: 0;
  opacity: var(--hint-opacity, 0.55);
  filter: saturate(var(--hint-saturation, 1)) brightness(var(--hint-brightness, 1));
  transition: opacity 0.18s ease, filter 0.18s ease, transform 0.18s ease;
}

.timeline-rail__hint::before {
  content: '';
  position: absolute;
  inset: -5px;
  border-radius: inherit;
  background: radial-gradient(circle at 0% 50%, rgba(190, 230, 255, 0.65) 0%, rgba(190, 230, 255, 0.08) 55%, transparent 75%);
  opacity: 0.4;
  transition: opacity 0.18s ease;
}

.timeline-rail__hint::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background:
    linear-gradient(120deg, rgba(255, 255, 255, 0.15) 0%, rgba(255, 255, 255, 0) 40%),
    linear-gradient(0deg, rgba(255, 255, 255, 0.2) 0%, rgba(255, 255, 255, 0) 60%);
  opacity: 0.3;
  mix-blend-mode: screen;
  transition: opacity 0.18s ease;
}

.timeline-rail__hint.is-approaching {
  --hint-opacity: 0.68;
  --hint-saturation: 1.15;
  --hint-brightness: 1.05;
}

.timeline-rail__hint.is-imminent {
  --hint-opacity: 0.95;
  --hint-saturation: 1.35;
  --hint-brightness: 1.1;
  transform: scaleY(1.05);
  box-shadow:
    0 0 18px rgba(168, 226, 255, 0.45),
    0 0 28px rgba(86, 201, 255, 0.35);
  animation: dodge-hint-shimmer 0.6s ease-in-out infinite alternate;
}

.timeline-rail__hint.is-imminent::before {
  opacity: 0.75;
}

.timeline-rail__hint.is-imminent::after {
  opacity: 0.55;
}

.timeline-rail__hint.is-past {
  --hint-opacity: 0.35;
  --hint-saturation: 0.85;
  --hint-brightness: 0.9;
}

.timeline-rail__hint.is-distant {
  --hint-opacity: 0.42;
}

.timeline-rail__attack {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 8px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  z-index: 3;
}

.timeline-rail__attack-label {
  position: absolute;
  top: -16px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 224, 151, 0.95);
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
}

.timeline-rail__attack-glow {
  display: block;
  width: 3px;
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.85), rgba(255, 255, 255, 0.3));
  box-shadow: 0 0 12px rgba(255, 255, 255, 0.6);
}

.timeline-rail__attack.is-ready .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(120, 255, 176, 0.9), rgba(76, 226, 143, 0.4));
  box-shadow: 0 0 16px rgba(76, 226, 143, 0.6);
}

.timeline-rail__attack.is-warning .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 214, 102, 0.95), rgba(255, 172, 76, 0.5));
  box-shadow: 0 0 18px rgba(255, 188, 76, 0.65);
}

.timeline-rail__attack.is-danger .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 92, 92, 0.98), rgba(255, 50, 50, 0.58));
  box-shadow: 0 0 20px rgba(255, 80, 80, 0.75);
}

.timeline-rail__attack.is-idle .timeline-rail__attack-glow {
  opacity: 0.4;
  box-shadow: none;
}

.timeline-rail__attack--followup {
  z-index: 4;
}

.timeline-rail__attack--followup .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 227, 150, 0.95), rgba(255, 181, 70, 0.55));
  box-shadow:
    0 0 18px rgba(255, 186, 90, 0.7),
    -4px 0 12px rgba(255, 225, 170, 0.45),
    4px 0 12px rgba(255, 185, 120, 0.35);
  position: relative;
}

.timeline-rail__attack--followup.is-active .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 120, 120, 0.98), rgba(255, 80, 80, 0.6));
  box-shadow:
    0 0 20px rgba(255, 106, 106, 0.75),
    -4px 0 14px rgba(255, 180, 180, 0.5),
    4px 0 14px rgba(255, 142, 142, 0.4);
}

.timeline-rail__attack--past .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(180, 200, 255, 0.2));
  box-shadow: 0 0 12px rgba(180, 200, 255, 0.35);
  opacity: 0.7;
}

.timeline-scale {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  font-variant-numeric: tabular-nums;
}

@keyframes dodge-hint-shimmer {
  from {
    filter: saturate(1.1) brightness(1.02);
    box-shadow:
      0 0 16px rgba(168, 226, 255, 0.4),
      0 0 24px rgba(86, 201, 255, 0.3);
  }
  to {
    filter: saturate(1.35) brightness(1.12);
    box-shadow:
      0 0 22px rgba(190, 236, 255, 0.6),
      0 0 30px rgba(86, 201, 255, 0.45);
  }
}
</style>
