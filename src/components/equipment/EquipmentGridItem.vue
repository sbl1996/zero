<script setup lang="ts">
import { computed } from 'vue'
import SheenLayer from '@/components/effects/SheenLayer.vue'
import type { EquipmentGridEntry } from '@/types/equipment-ui'

const props = withDefaults(
  defineProps<{
    entry: EquipmentGridEntry
    selected?: boolean
  }>(),
  {
    selected: false,
  },
)

const emit = defineEmits<{
  (e: 'select', entry: EquipmentGridEntry): void
}>()

const styleVars = computed(() => ({
  '--equip-border': props.entry.qualityVisual.borderGradient,
  '--equip-background': props.entry.qualityVisual.background,
  '--equip-shadow': props.entry.qualityVisual.glowShadow,
  '--equip-icon': props.entry.qualityVisual.iconBackground,
  '--equip-accent': props.entry.qualityColor,
}))

const showRealmLock = computed(() => Boolean(props.entry.requiredRealmTier && !props.entry.realmRequirementMet))

function handleClick() {
  emit('select', props.entry)
}
</script>

<template>
  <button
    class="grid-card"
    type="button"
    :class="{
      'grid-card--selected': props.selected,
      'grid-card--equipped': props.entry.source === 'equipped',
    }"
    :style="styleVars"
    @click="handleClick"
  >
    <div class="grid-card__icon-area">
      <div class="grid-card__equipped-flag" v-if="props.entry.source === 'equipped'">穿</div>
      <div class="grid-card__new-flag" v-if="props.entry.isNew">NEW</div>
      <div class="grid-card__icon-frame" :class="props.entry.enhanceAura">
        <span v-if="props.entry.icon.type === 'text'" class="grid-card__icon-text">{{ props.entry.icon.text }}</span>
        <img
          v-else
          class="grid-card__icon-img"
          :src="props.entry.icon.src"
          :alt="props.entry.icon.alt || props.entry.name"
        >
        <SheenLayer :color="props.entry.qualityVisual.sheenTint" />
      </div>
      <div class="grid-card__badge" :class="props.entry.enhanceBadge.className">
        <span v-if="props.entry.enhanceBadge.icon" class="grid-card__badge-icon">{{ props.entry.enhanceBadge.icon }}</span>
        <span>{{ props.entry.enhanceBadge.text }}</span>
      </div>
      <div v-if="showRealmLock" class="grid-card__lock">
        境界不足
      </div>
    </div>
    <div class="grid-card__info">
      <p class="grid-card__name" :style="{ color: props.entry.qualityColor }">
        {{ props.entry.name }}
      </p>
      <p class="grid-card__meta">
        {{ props.entry.slotLabel }}
        <span class="grid-card__quality-tag">{{ props.entry.qualityLabel }}</span>
      </p>
    </div>
  </button>
</template>

<style scoped>
.grid-card {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 10px;
  border-radius: 16px;
  border: 2px solid transparent;
  background: var(--equip-background, rgba(0, 0, 0, 0.5));
  box-shadow: var(--equip-shadow, 0 0 10px rgba(0, 0, 0, 0.4));
  cursor: pointer;
  color: inherit;
  text-align: left;
  transition:
    border-color 0.2s ease,
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.grid-card:hover {
  transform: translateY(-2px);
  border-color: rgba(255, 255, 255, 0.3);
}

.grid-card--equipped {
  border-color: rgba(255, 255, 255, 0.35);
}

.grid-card--selected {
  border-color: var(--equip-accent, rgba(255, 255, 255, 0.35));
  box-shadow:
    0 0 20px rgba(255, 255, 255, 0.12),
    inset 0 0 12px rgba(255, 255, 255, 0.08);
}

.grid-card__icon-area {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grid-card__icon-frame {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: 20px;
  background: var(--equip-icon, rgba(255, 255, 255, 0.08));
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.08);
}

.grid-card__icon-text {
  font-size: 40px;
}

.grid-card__icon-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.grid-card__badge {
  position: absolute;
  bottom: -6px;
  right: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  box-shadow: 0 0 10px rgba(0, 0, 0, 0.4);
}

.grid-card__badge-icon {
  font-size: 9px;
}

.grid-card__new-flag,
.grid-card__equipped-flag {
  position: absolute;
  top: 4px;
  left: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
  color: #0c0c12;
}

.grid-card__new-flag {
  background: linear-gradient(135deg, #ff5f6d, #ffc371);
  color: #fff;
}

.grid-card__equipped-flag {
  background: rgba(255, 255, 255, 0.85);
  color: #111;
}

.grid-card__lock {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: rgba(8, 8, 12, 0.76);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  color: #ffc107;
  backdrop-filter: blur(2px);
  z-index: 2;
}

.grid-card__info {
  margin-top: 10px;
}

.grid-card__name {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
}

.grid-card__meta {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  display: flex;
  align-items: center;
  gap: 6px;
}

.grid-card__quality-tag {
  padding: 1px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  font-size: 10px;
  opacity: 0.85;
}
</style>
