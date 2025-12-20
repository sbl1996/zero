<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DODGE_WINDOW_MS } from '@/constants/dodge'
import type { PendingDodgeState } from '@/types/domain'

const HALF_SPAN_SECONDS = 3
const TOTAL_SPAN_SECONDS = HALF_SPAN_SECONDS * 2
const ATTACK_RESET_THRESHOLD = 0.25
const HALF_SPAN_MS = HALF_SPAN_SECONDS * 1000

const props = defineProps<{
  active: boolean
  timeToAttack: number | null
  pendingDodge: PendingDodgeState | null
  actionLockUntil: number | null
  attackTimes?: { key: string, seconds: number, label?: string, special?: string }[]
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
const lastAttackWasCharge = ref(false)
const nextAttackIsCharge = ref(false)
const previousTimer = ref<number | null>(null)

const dodgeJudgeSeconds = computed(() => {
  const pending = props.pendingDodge
  if (pending) {
    const durationMs = pending.invincibleUntil - pending.attemptedAt
    if (Number.isFinite(durationMs) && durationMs > 0) {
      return durationMs / 1000
    }
  }
  return DODGE_WINDOW_MS / 1000
})

const shouldAnimate = computed(() => {
  if (props.active) return true
  if (props.actionLockUntil !== null && props.actionLockUntil > nowMs.value) return true
  const judgeMs = dodgeJudgeSeconds.value * 1000
  if (props.pendingDodge?.attemptedAt && props.pendingDodge.attemptedAt + judgeMs > nowMs.value) return true
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
      // 记录刚刚发生的攻击是否是蓄力攻击
      lastAttackWasCharge.value = nextAttackIsCharge.value
      // 重置下一次攻击标志
      nextAttackIsCharge.value = false
    }
  }

  previousTimer.value = currentSeconds
}, { immediate: true })


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
  // 只要右边界在可视范围内，就显示矩形
  if (rightSeconds <= -HALF_SPAN_SECONDS) return null
  // 只要左边界在可视范围内，就显示矩形
  if (leftSeconds >= HALF_SPAN_SECONDS) return null
  const leftPercent = timeToPercent(leftSeconds)
  const rightPercent = timeToPercent(rightSeconds)
  const width = rightPercent - leftPercent
  if (width <= 0) return null
  return {
    left: `${leftPercent}%`,
    width: `${width}%`,
  }
}

type TimelineAttackMarker = {
  key: string
  style: Record<string, string>
  severity: string
  label?: string
  special?: string
}

type TimelineChargeSegment = {
  key: string
  style: Record<string, string>
  startLabel?: string
  endLabel?: string
}

function resolveAttackSeverity(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return 'is-idle'
  if (seconds <= 0.3) return 'is-danger'
  if (seconds <= 0.6) return 'is-warning'
  return 'is-ready'
}

const chargeSegments = computed<TimelineChargeSegment[]>(() => {
  if (!props.active) return []
  const segments: TimelineChargeSegment[] = []
  
  const attackSources = Array.isArray(props.attackTimes) ? props.attackTimes : []
  const chargeStarts = attackSources.filter(a => a.special === 'charge')
  
  chargeStarts.forEach(start => {
    // 提取前缀：处理 'charging-charge-start' -> 'charging' 和 'plan-0-charge-start' -> 'plan-0'
    let keyPrefix = start.key
    if (keyPrefix.endsWith('-charge-start')) {
      keyPrefix = keyPrefix.slice(0, -13) // 移除 '-charge-start'
    }
    const end = attackSources.find(a => a.key === `${keyPrefix}-attack`)
    
    if (end && Number.isFinite(start.seconds) && Number.isFinite(end.seconds)) {
      const style = segmentToStyle(start.seconds, end.seconds)
      if (style) {
        segments.push({
          key: start.key,
          style,
          startLabel: start.label,
          endLabel: end.label,
        })
      }
    }
  })
  
  return segments
})

const chargePairs = computed(() => {
  if (!props.active) return new Set<string>()
  const pairs = new Set<string>()
  
  const attackSources = Array.isArray(props.attackTimes) ? props.attackTimes : []
  const chargeStarts = attackSources.filter(a => a.special === 'charge')
  
  // 检查第一个计划的攻击（最接近现在的）是否是蓄力攻击
  // 只有 plan-0-charge-start 或 charging-charge-start 才表示即将到来的是蓄力攻击
  const nextIsCharge = chargeStarts.some(s => 
    s.key === 'plan-0-charge-start' || s.key === 'charging-charge-start'
  )
  nextAttackIsCharge.value = nextIsCharge
  
  chargeStarts.forEach(start => {
    // 提取前缀：处理 'charging-charge-start' -> 'charging' 和 'plan-0-charge-start' -> 'plan-0'
    let keyPrefix = start.key
    if (keyPrefix.endsWith('-charge-start')) {
      keyPrefix = keyPrefix.slice(0, -13) // 移除 '-charge-start'
    }
    const end = attackSources.find(a => a.key === `${keyPrefix}-attack`)
    
    if (end) {
      pairs.add(start.key)
      pairs.add(`${keyPrefix}-attack`)
    }
  })
  
  return pairs
})

const attackMarkers = computed<TimelineAttackMarker[]>(() => {
  if (!props.active) return []
  const markers: TimelineAttackMarker[] = []

  const addMarker = (key: string, seconds: number | null | undefined, label?: string, special?: string) => {
    if (seconds === null || seconds === undefined) return
    const numeric = Number(seconds)
    if (!Number.isFinite(numeric)) return
    
    // 过滤掉属于蓄力段的标记（包括未来和过去的），它们会通过 chargeSegments 显示
    if (chargePairs.value.has(key)) {
      return
    }
    
    // 如果是过去的 charge-start 或包含 -charge-start 或 -attack 的标记，也过滤掉
    if (key.includes('-charge-start') || (key.includes('-attack') && special === undefined && label === '伤害')) {
      return
    }
    
    const style = {
      left: `${timeToPercent(numeric)}%`,
    }
    markers.push({
      key,
      style,
      severity: resolveAttackSeverity(numeric),
      label,
      special,
    })
  }

  if (props.timeToAttack !== null) {
    // 如果正在蓄力，current 标记会与蓄力矩形的结束位置重合，不需要显示
    const isCharging = chargePairs.value.size > 0
    if (!isCharging) {
      addMarker('current', props.timeToAttack)
    }
  }

  const attackSources = Array.isArray(props.attackTimes) ? props.attackTimes : []
  attackSources.forEach((entry) => {
    addMarker(entry.key, entry.seconds, entry.label, entry.special)
  })

  return markers
})

const dodgeHintSegmentStyle = computed(() => {
  if (!props.active) return null
  return segmentToStyle(0, dodgeJudgeSeconds.value)
})

const dodgeHintClasses = computed(() => {
  const classes: Record<string, boolean> = {
    'is-available': props.active,
  }
  if (!props.active) return classes
  const time = props.timeToAttack
  if (time === null) return classes
  const judge = dodgeJudgeSeconds.value
  if (time > 0 && time <= judge) {
    classes['is-imminent'] = true
  } else if (time > judge && time <= judge * 2) {
    classes['is-approaching'] = true
  } else if (time <= 0 && time >= -judge) {
    classes['is-past'] = true
  } else {
    classes['is-distant'] = true
  }
  return classes
})

const recentAttackStyle = computed(() => {
  const occurredAt = lastAttackAt.value
  if (occurredAt === null) return null
  // 如果最近的攻击是蓄力攻击，不显示竖条（由矩形框代替）
  if (lastAttackWasCharge.value) return null
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
    lastAttackWasCharge.value = false
  }
})

const timelineClasses = computed(() => ({
  'is-inactive': !props.active,
}))
</script>

<template>
  <div class="monster-attack-timeline" :class="timelineClasses">
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
        v-for="segment in chargeSegments"
        :key="segment.key"
        class="timeline-rail__charge-segment"
        :style="segment.style"
      >
        <span v-if="segment.startLabel" class="timeline-rail__charge-label timeline-rail__charge-label--start">{{ segment.startLabel }}</span>
        <span v-if="segment.endLabel" class="timeline-rail__charge-label timeline-rail__charge-label--end">{{ segment.endLabel }}</span>
      </div>
      <div
        v-for="marker in attackMarkers"
        :key="marker.key"
        class="timeline-rail__attack"
        :class="[marker.severity, marker.special ? `is-${marker.special}` : '']"
        :style="marker.style"
      >
        <span v-if="marker.label" class="timeline-rail__attack-label">{{ marker.label }}</span>
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
  padding: 6px 10px;
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


.timeline-rail {
  position: relative;
  height: 32px;
  border-radius: 999px;
  overflow: visible;
  margin-top: 18px;
}

.timeline-rail__fill {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, rgba(38, 46, 60, 0.85), rgba(18, 26, 34, 0.85));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: inherit;
  z-index: 0;
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
  left: 50%;
  transform: translateX(-50%);
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 224, 151, 0.95);
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
}

.timeline-rail__charge-segment {
  position: absolute;
  top: 6px;
  bottom: 6px;
  border-radius: 10px;
  background: linear-gradient(90deg, 
    rgba(255, 200, 100, 0.2) 0%,
    rgba(255, 210, 110, 0.4) 20%,
    rgba(255, 180, 80, 0.55) 50%,
    rgba(255, 160, 70, 0.4) 80%,
    rgba(255, 140, 60, 0.2) 100%
  );
  border: none;
  box-shadow: 
    0 0 16px rgba(255, 180, 80, 0.25),
    0 0 24px rgba(255, 160, 60, 0.12),
    inset 0 1px 2px rgba(255, 255, 255, 0.15);
  pointer-events: none;
  z-index: 4;
  animation: charge-segment-pulse 1.5s ease-in-out infinite alternate;
}

.timeline-rail__charge-segment::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: linear-gradient(90deg,
    rgba(255, 255, 255, 0.15) 0%,
    rgba(255, 255, 255, 0.25) 50%,
    rgba(255, 255, 255, 0.15) 100%
  );
  mix-blend-mode: overlay;
}

.timeline-rail__charge-label {
  position: absolute;
  top: -22px;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(255, 200, 100, 0.95);
  text-shadow: 0 0 6px rgba(0, 0, 0, 0.65);
  white-space: nowrap;
  font-weight: 600;
  transform: translateX(-50%);
}

.timeline-rail__charge-label--start {
  left: 0;
}

.timeline-rail__charge-label--end {
  left: 100%;
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

.timeline-rail__attack--past .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.6), rgba(180, 200, 255, 0.2));
  box-shadow: 0 0 12px rgba(180, 200, 255, 0.35);
  opacity: 0.7;
}

.timeline-rail__attack.is-charge .timeline-rail__attack-glow {
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.5));
  box-shadow: 0 0 14px rgba(255, 255, 255, 0.7);
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

@keyframes charge-segment-pulse {
  from {
    box-shadow: 
      0 0 10px rgba(255, 180, 80, 0.35),
      0 0 18px rgba(255, 160, 60, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.25);
  }
  to {
    box-shadow: 
      0 0 16px rgba(255, 180, 80, 0.5),
      0 0 24px rgba(255, 160, 60, 0.35),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }
}
</style>
