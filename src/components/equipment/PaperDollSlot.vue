<script setup lang="ts">
import { computed } from 'vue'
import SheenLayer from '@/components/effects/SheenLayer.vue'
import type { PaperDollSlotState } from '@/types/paperDoll'

const props = withDefaults(
  defineProps<{
    slot: PaperDollSlotState
    selected?: boolean
  }>(),
  {
    selected: false,
  },
)

const emit = defineEmits<{
  (e: 'select', key: PaperDollSlotState['key']): void
  (e: 'hover', key: PaperDollSlotState['key']): void
  (e: 'leave'): void
}>()

const hasEquipment = computed(() => Boolean(props.slot.entry))
const displayIcon = computed(() => props.slot.entry?.icon ?? props.slot.placeholderIcon)
const auraClass = computed(() => props.slot.entry?.enhanceAura ?? '')
const badgeClass = computed(() => (props.slot.entry ? props.slot.entry.enhanceBadge.className : 'paper-slot__badge--empty'))
const badgeText = computed(() => (props.slot.entry ? props.slot.entry.enhanceBadge.text : ''))
const qualityColor = computed(() => props.slot.entry?.qualityColor ?? 'rgba(255, 255, 255, 0.85)')
const qualityBadgeVars = computed(() => {
  const accent = props.slot.entry?.qualityColor
  if (!accent) return {}
  return {
    '--quality-accent': accent,
    '--quality-accent-soft': withAlpha(accent, 'c8'),
    '--quality-accent-faint': withAlpha(accent, '66'),
  }
})

function withAlpha(hex: string, alphaHex: string) {
  if (!hex.startsWith('#')) return hex
  if (hex.length !== 7) return hex
  return `${hex}${alphaHex}`
}

const styleVars = computed(() => {
  const visual = props.slot.entry?.qualityVisual
  return {
    '--paper-slot-bg': visual?.iconBackground ?? 'rgba(255, 255, 255, 0.04)',
    '--paper-slot-shadow': visual?.glowShadow ?? '0 0 12px rgba(0, 0, 0, 0.35)',
    '--paper-slot-accent': props.slot.entry?.qualityColor ?? 'rgba(255, 255, 255, 0.45)',
  }
})

function handleClick() {
  emit('select', props.slot.key)
}

function handleMouseEnter() {
  emit('hover', props.slot.key)
}

function handleMouseLeave() {
  emit('leave')
}
</script>

<template>
  <button
    class="paper-slot"
    type="button"
    :class="{
      'paper-slot--selected': props.selected,
      'paper-slot--empty': !hasEquipment,
    }"
    :style="styleVars"
    @click="handleClick"
    @mouseenter="handleMouseEnter"
    @focus="handleMouseEnter"
    @mouseleave="handleMouseLeave"
    @blur="handleMouseLeave"
  >
    <span class="paper-slot__label">{{ slot.label }}</span>
    <div class="paper-slot__icon-wrapper" :class="[auraClass]">
      <div class="paper-slot__icon">
        <span
          v-if="displayIcon.type === 'text'"
          class="paper-slot__icon-text"
        >
          {{ displayIcon.text }}
        </span>
        <img
          v-else
          class="paper-slot__icon-img"
          :src="displayIcon.src"
          :alt="displayIcon.alt || slot.label"
        >
        <SheenLayer />
      </div>
      <span class="paper-slot__badge" :class="badgeClass">
        {{ badgeText }}
      </span>
    </div>
    <p class="paper-slot__name" :style="{ color: qualityColor }">
      {{ slot.entry?.name ?? '未装备' }}
    </p>
    <p class="paper-slot__meta">
      <span
        v-if="slot.entry"
        class="paper-slot__quality-badge"
        :style="qualityBadgeVars"
      >
        {{ slot.entry.qualityLabel }}
      </span>
      <span v-else class="paper-slot__quality-placeholder">品质</span>
    </p>
  </button>
</template>

<style scoped>
.paper-slot {
  width: 150px;
  padding: 10px 12px;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(8, 10, 18, 0.6);
  color: inherit;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
  box-shadow: 0 0 12px rgba(0, 0, 0, 0.2);
}

.paper-slot--selected {
  border-color: var(--paper-slot-accent, rgba(255, 255, 255, 0.45));
  box-shadow:
    0 0 20px rgba(255, 255, 255, 0.2),
    inset 0 0 20px rgba(255, 255, 255, 0.08);
  transform: translateY(-4px);
}

.paper-slot__label {
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.6);
}

.paper-slot__icon-wrapper {
  position: relative;
  width: 86px;
  height: 86px;
  border-radius: 20px;
}

.paper-slot__icon {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: 20px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  background: var(--paper-slot-bg);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--paper-slot-shadow);
  overflow: hidden;
}

.paper-slot__icon-text {
  font-size: 42px;
}

.paper-slot__icon-img {
  width: 60px;
  height: 60px;
  object-fit: contain;
}

.paper-slot__badge {
  position: absolute;
  bottom: -8px;
  right: 50%;
  transform: translateX(50%);
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(0, 0, 0, 0.65);
}

.paper-slot__badge--empty {
  border-color: rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.7);
}

.paper-slot__name {
  margin: 4px 0 0;
  font-weight: 600;
  font-size: 14px;
  text-align: center;
}

.paper-slot__meta {
  margin: 2px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  min-height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.paper-slot--empty {
  opacity: 0.85;
}

.paper-slot__icon-wrapper.enhance-aura-sheen {
  box-shadow:
    inset 0 0 12px rgba(255, 255, 255, 0.22),
    0 0 0 1px rgba(255, 255, 255, 0.16);
}

.paper-slot__icon-wrapper.enhance-aura-breath {
  box-shadow:
    inset 0 0 14px rgba(58, 152, 255, 0.45),
    0 0 0 1px rgba(58, 152, 255, 0.3);
}

.paper-slot__icon-wrapper.enhance-aura-mythic {
  box-shadow:
    inset 0 0 16px rgba(255, 179, 71, 0.55),
    0 0 0 1px rgba(255, 115, 34, 0.36);
}

.paper-slot__quality-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 5px 12px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.3px;
  background: linear-gradient(
    135deg,
    var(--quality-accent),
    var(--quality-accent-soft, rgba(255, 255, 255, 0.14))
  );
  color: #0c0c12;
  border: 1px solid var(--quality-accent-faint, rgba(255, 255, 255, 0.24));
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 8px 20px var(--quality-accent-faint, rgba(0, 0, 0, 0.45));
  text-shadow: 0 1px 4px rgba(255, 255, 255, 0.28);
}

.paper-slot__quality-placeholder {
  opacity: 0.25;
}
</style>
