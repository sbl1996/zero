<script setup lang="ts">

export interface TrackNoteDisplay {
  text: string
  dot: 'above' | 'below' | null
  beatText: string
}

export interface TrackNote {
  key: string | number
  left: number
  status: 'pending' | 'hit' | 'miss' | 'wrong'
  required: boolean
  isPendingActive: boolean // pending && in window
  hitTier: string // 'perfect' | 'good' | 'ok' | ''
  display: TrackNoteDisplay
  pitch: string | number | null // Used to determine if beat info should be shown
}

export interface TrackDivider {
  beatIndex: number
  left: number
}

export interface TrackLeadTick {
  idx: number
  left: number
  label: number
}

const props = defineProps<{
  title?: string
  description?: string
  timelinePercent: number // 0-100
  judgeWindowMs: number
  judgeLinePercent: number // 0-100
  visibleMeasures: TrackDivider[]
  visibleLeadTicks: TrackLeadTick[]
  visibleNotes: TrackNote[]
}>()

</script>

<template>
  <div class="panel track-panel">
    <div class="track-head" v-if="title || description">
      <div>
        <div class="section-title" v-if="title">{{ title }}</div>
        <p class="text-muted" v-if="description">{{ description }}</p>
      </div>
      <div class="text-muted">
        时间线 {{ Math.round(timelinePercent) }}% ｜ 窗口 {{ Math.round(judgeWindowMs) }}ms
      </div>
    </div>
    <div class="resonance-bar">
      <div class="resonance-bg"></div>
      <div class="track-line"></div>
      <div class="measure-divider" v-for="m in visibleMeasures" :key="`measure-${m.beatIndex}`"
        :style="{ left: `${m.left}%` }"></div>
      <div class="lead-tick" v-for="tick in visibleLeadTicks" :key="`lead-${tick.idx}`"
        :style="{ left: `${tick.left}%` }">
        <span class="tick-dot"></span>
      </div>
      <div v-for="note in visibleNotes" :key="note.key" class="note-node" :class="[
        note.status,
        { optional: !note.required, active: note.isPendingActive },
        note.hitTier ? `acc-${note.hitTier}` : '',
      ]" :style="{ left: `${note.left}%` }">
        <div class="note-glow"></div>
        <div class="note-core">
          <span class="note-text">{{ note.display.text }}</span>
          <span v-if="note.display.dot" class="note-dot" :class="`dot-${note.display.dot}`"></span>
        </div>
      </div>
      <div class="playhead" :style="{ left: `${judgeLinePercent}%` }"></div>
    </div>
  </div>
</template>

<style scoped>
/* Copied and adapted styles from MagicRhythmPracticeView */
.track-panel {
  position: relative;
  /* Ensure it takes full width if needed */
  width: 100%;
}

.track-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.section-title {
  /* Inherit global or define if standalone */
  font-size: 1.25rem;
  font-weight: bold;
  color: #fff;
  margin: 0;
}

.text-muted {
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.875rem;
  margin: 0;
}

.resonance-bar {
  position: relative;
  min-height: 100px;
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
  top: 45%;
  display: flex;
  flex-direction: column;
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

.measure-divider {
  position: absolute;
  top: 20%;
  bottom: 20%;
  width: 2px;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 1px;
  z-index: 1;
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(0, 0, 0, 0.3);
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
  width: 80px;
  height: 52px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
  background: #171b33;
  border: 2px solid rgba(255, 255, 255, 0.24);
  color: #f5f7ff;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.05),
    inset 0 0 10px rgba(255, 255, 255, 0.08);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  z-index: 1;
}

.note-text {
  position: relative;
  z-index: 1;
}

.note-dot {
  position: absolute;
  left: 50%;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(245, 247, 255, 0.9);
  box-shadow: 0 0 6px rgba(245, 247, 255, 0.4);
  transform: translateX(-50%);
  z-index: 2;
}

.note-dot.dot-above {
  top: 8px;
}

.note-dot.dot-below {
  bottom: 8px;
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

/* Status Styles */
.note-node.active .note-core {
  border-color: rgba(76, 201, 240, 0.9);
  box-shadow:
    0 0 18px rgba(76, 201, 240, 0.55),
    0 0 0 2px rgba(186, 247, 210, 0.18);
  transform: translateZ(0) scale(1.08);
}

.note-node.pending .note-core {
  opacity: 1;
}

.note-node.hit .note-core {
  background: radial-gradient(circle, rgba(93, 225, 123, 0.32), rgba(76, 201, 240, 0.18));
  border-color: rgba(93, 225, 123, 0.8);
  box-shadow:
    0 0 22px rgba(93, 225, 123, 0.55),
    0 0 0 3px rgba(93, 225, 123, 0.15);
}

.note-node.hit.acc-perfect .note-core {
  box-shadow:
    0 0 26px rgba(245, 208, 111, 0.55),
    0 0 0 4px rgba(245, 208, 111, 0.25),
    0 0 0 6px rgba(93, 225, 123, 0.2);
  transform: translateZ(0) scale(1.12);
}

.note-node.hit.acc-good .note-core {
  box-shadow:
    0 0 22px rgba(76, 201, 240, 0.5),
    0 0 0 3px rgba(76, 201, 240, 0.18);
}

.note-node.hit.acc-ok .note-core {
  box-shadow:
    0 0 16px rgba(93, 225, 123, 0.4),
    0 0 0 2px rgba(93, 225, 123, 0.15);
}

.note-node.miss .note-core {
  border-color: #ff6392;
  color: #ffbdd4;
  opacity: 0.5;
  transform: scale(0.9);
}

.note-node.wrong .note-core {
  border-color: #ff4757;
  background: rgba(255, 71, 87, 0.2);
  animation: shake 0.3s ease-in-out;
}

.note-node.optional .note-core {
  border-style: dashed;
  opacity: 0.7;
}

.playhead {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 4px;
  background: linear-gradient(180deg, #baf8d2, #4cc9f0);
  box-shadow:
    0 0 20px rgba(124, 247, 189, 0.6),
    0 0 0 8px rgba(76, 201, 240, 0.1);
  transform: translateX(-2px);
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

.playhead::after {
  content: none;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }

  25% {
    transform: translateX(-4px);
  }

  75% {
    transform: translateX(4px);
  }
}
</style>
