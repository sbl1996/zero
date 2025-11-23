<script setup lang="ts">
import { computed } from 'vue'
import SheenLayer from '@/components/effects/SheenLayer.vue'
import type { EquipmentGridEntry } from '@/types/equipment-ui'

const props = withDefaults(
  defineProps<{
    entry: EquipmentGridEntry | null
    dangerLevel?: 'safe' | 'risky' | 'danger'
    feedbackState?: 'idle' | 'success' | 'failure'
    feedbackKey?: number
  }>(),
  {
    dangerLevel: 'safe',
    feedbackState: 'idle',
    feedbackKey: 0,
  },
)

const qualityVisual = computed(() => props.entry?.qualityVisual)
const auraClass = computed(() => props.entry?.enhanceAura ?? '')
const badge = computed(() => props.entry?.enhanceBadge)
const accentColor = computed(() => qualityVisual.value?.accentColor ?? '#8ea0b3')

const altarStyle = computed(() => ({
  '--altar-border': qualityVisual.value?.borderGradient ?? 'linear-gradient(135deg, rgba(255,255,255,0.2), rgba(255,255,255,0.08))',
  '--altar-glow': qualityVisual.value?.glowShadow ?? '0 0 12px rgba(255,255,255,0.12)',
  '--altar-background': qualityVisual.value?.background ?? 'radial-gradient(circle at 40% 30%, rgba(255,255,255,0.06), rgba(10,12,16,0.96))',
  '--altar-icon-bg': qualityVisual.value?.iconBackground ?? 'linear-gradient(135deg, rgba(255,255,255,0.08), rgba(10,12,16,0.9))',
  '--altar-accent': accentColor.value,
}))

const badgeStyle = computed(() => ({
  background: badge.value?.background,
  color: badge.value?.color,
  boxShadow: badge.value?.glowShadow,
}))

const feedbackClass = computed(() => {
  if (props.feedbackState === 'success') return 'altar__flash--success'
  if (props.feedbackState === 'failure') return 'altar__flash--failure'
  return ''
})
</script>

<template>
  <section
    class="altar"
    :class="[`altar--${props.dangerLevel}`, auraClass]"
    :style="altarStyle"
  >
    <div class="altar__backdrop" />
    <div class="altar__frame">
      <div class="altar__icon-wrapper">
        <div v-if="entry" class="altar__icon" :class="`altar__icon--${feedbackState}`">
          <SheenLayer :active="true" :color="entry.qualityVisual.sheenTint" :duration="2200" :blur="2" />
          <div class="altar__icon-core">
            <span v-if="entry.icon.type === 'text'" class="altar__icon-text">{{ entry.icon.text }}</span>
            <img
              v-else
              :src="entry.icon.src"
              :alt="entry.icon.alt || entry.name"
            >
          </div>
          <div
            v-if="feedbackState !== 'idle'"
            :key="feedbackKey"
            class="altar__flash"
            :class="feedbackClass"
            aria-hidden="true"
          />
        </div>
        <div v-else class="altar__placeholder">
          <p>选择一件装备</p>
          <p class="altar__placeholder-sub">放入熔炉以开启强化仪式</p>
        </div>

        <span
          v-if="badge"
          class="altar__badge"
          :class="badge.className"
          :style="badgeStyle"
        >
          <span v-if="badge.icon" class="altar__badge-icon">{{ badge.icon }}</span>
          {{ badge.text }}
        </span>
      </div>

      <div class="altar__info">
        <p class="altar__name" :style="{ color: accentColor }">{{ entry?.name ?? '等待祭品' }}</p>
        <p v-if="entry" class="altar__meta">
          {{ entry.qualityLabel }} · {{ entry.slotLabel }}
        </p>
        <p v-else class="altar__meta">从左侧选择装备后开始强化</p>
      </div>
    </div>
  </section>
</template>

<style scoped>
.altar {
  position: relative;
  background: var(--altar-background);
  border-radius: 28px;
  padding: 20px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 12px 38px rgba(0, 0, 0, 0.35), var(--altar-glow);
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.altar--risky::after,
.altar--danger::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(circle at 50% 10%, rgba(255, 176, 58, 0.08), transparent 55%);
  mix-blend-mode: screen;
}

.altar--danger::after {
  background: radial-gradient(circle at 50% 10%, rgba(255, 88, 88, 0.15), transparent 60%);
}

.altar__backdrop {
  position: absolute;
  inset: 0;
  opacity: 0.25;
  background: repeating-conic-gradient(
    from 45deg,
    rgba(255, 255, 255, 0.02) 0deg 8deg,
    transparent 8deg 12deg
  );
  mask-image: radial-gradient(circle at 50% 50%, rgba(0, 0, 0, 0.7), transparent 65%);
}

.altar__frame {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  width: 100%;
}

.altar__icon-wrapper {
  position: relative;
  width: 200px;
  height: 200px;
  border-radius: 28px;
  padding: 14px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(10, 12, 16, 0.85));
  border: 2px solid transparent;
  border-image: var(--altar-border);
  border-image-slice: 1;
  box-shadow:
    0 10px 30px rgba(0, 0, 0, 0.45),
    inset 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.altar__icon {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 22px;
  display: grid;
  place-items: center;
  background: var(--altar-icon-bg);
  overflow: hidden;
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 0.06),
    inset 0 0 18px rgba(255, 255, 255, 0.08);
}

.altar__icon--success {
  animation: altar-pop 0.6s ease;
}

.altar__icon--failure {
  animation: altar-shake 0.6s ease;
}

.altar__icon-core {
  width: 92%;
  height: 92%;
  border-radius: 18px;
  background: radial-gradient(circle at 40% 30%, rgba(255, 255, 255, 0.08), transparent 60%);
  display: grid;
  place-items: center;
  color: #fff;
  font-size: 84px;
  overflow: hidden;
}

.altar__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(1.05);
}

.altar__icon-text {
  filter: drop-shadow(0 6px 12px rgba(0, 0, 0, 0.35));
}

.altar__flash {
  position: absolute;
  inset: -10%;
  border-radius: 30px;
  mix-blend-mode: screen;
  opacity: 0;
}

.altar__flash--success {
  background: radial-gradient(circle at 50% 40%, rgba(112, 255, 197, 0.4), rgba(120, 186, 255, 0.15), transparent 65%);
  animation: altar-flash 0.9s ease;
}

.altar__flash--failure {
  background: radial-gradient(circle at 50% 40%, rgba(255, 110, 110, 0.5), rgba(255, 196, 120, 0.2), transparent 60%);
  animation: altar-flash 1s ease;
}

.altar__placeholder {
  width: 100%;
  height: 100%;
  border-radius: 22px;
  border: 1px dashed rgba(255, 255, 255, 0.3);
  display: grid;
  place-items: center;
  text-align: center;
  color: rgba(255, 255, 255, 0.65);
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
}

.altar__placeholder-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
}

.altar__badge {
  position: absolute;
  left: 12px;
  top: 12px;
  padding: 6px 10px;
  border-radius: 12px;
  font-weight: 700;
  letter-spacing: 0.4px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.altar__badge-icon {
  font-size: 14px;
}

.altar__info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.altar__name {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 0.3px;
}

.altar__meta {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}

@keyframes altar-pop {
  0% {
    transform: scale(0.96);
  }
  60% {
    transform: scale(1.05);
  }
  100% {
    transform: scale(1);
  }
}

@keyframes altar-shake {
  0%, 100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-6px);
  }
  50% {
    transform: translateX(6px);
  }
  75% {
    transform: translateX(-4px);
  }
}

@keyframes altar-flash {
  0% {
    opacity: 0;
    transform: scale(0.92);
  }
  20% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1.08);
  }
}

@media (max-width: 860px) {
  .altar {
    padding: 16px;
  }

  .altar__frame {
    gap: 10px;
  }
}
</style>
