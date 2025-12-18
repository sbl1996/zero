<script setup lang="ts">
import { computed, ref, watch } from 'vue'

type StatTone = 'cost' | 'cooldown' | 'multiplier'
type TagKind = 'timing' | 'defense' | 'debuff' | 'resource' | 'utility'

const props = defineProps<{
  id: string
  name: string
  icon: string | null
  level: number
  allowedMax: number
  description: string
  stats: Array<{ label: string; value: string; tone: StatTone }>
  tags: Array<{ label: string; kind: TagKind; value?: string; tooltip?: string }>
  xpPercent: number
  xpLabel: string
  xpCapLabel: string
  blockedByRealm: boolean
  equippedSlots: number[]
  slotOccupancy: Array<string | null>
}>()

const emit = defineEmits<{
  equip: [slotIndex: number]
  unequip: []
}>()

const HOTKEY_LABELS = ['Z', 'X', 'C', 'V'] as const
const isEquipped = computed(() => props.equippedSlots.length > 0)
const progressWidth = computed(() => `${Math.round(Math.max(0, Math.min(1, props.xpPercent)) * 100)}%`)
const equippedHotkeys = computed(() => {
  if (!isEquipped.value) return []
  return props.equippedSlots.map((index) => HOTKEY_LABELS[index] ?? `槽位 ${index + 1}`)
})

const isChoosingSlot = ref(false)

function handleAction() {
  if (isEquipped.value) {
    emit('unequip')
  } else {
    isChoosingSlot.value = !isChoosingSlot.value
  }
}

function handleChooseSlot(slotIndex: number) {
  emit('equip', slotIndex)
  isChoosingSlot.value = false
}

watch(isEquipped, (equipped) => {
  if (equipped) {
    isChoosingSlot.value = false
  }
})
</script>

<template>
  <article class="skill-card">
    <div class="skill-card-layout">
      <div class="skill-card-figure">
        <div class="skill-card-img-wrap">
          <img
            v-if="icon"
            :src="icon"
            :alt="`${name} 图标`"
            class="skill-card-img"
          >
          <div v-else class="skill-card-img placeholder">
            <span class="skill-card-placeholder-text">{{ name.charAt(0) }}</span>
          </div>
          <div v-if="equippedHotkeys.length" class="skill-card-hotkeys">
            <span
              v-for="hotkey in equippedHotkeys"
              :key="hotkey"
              class="skill-card-hotkey-chip"
            >
              {{ hotkey }}
            </span>
          </div>
        </div>
        <div class="skill-card-level-badge">
          Lv.{{ level }}/{{ allowedMax }}
        </div>
        <div class="skill-card-progress-compact">
          <div class="skill-progress-bar">
            <div class="skill-progress-bar-value" :style="{ width: progressWidth }" />
          </div>
          <div class="skill-progress-meta">
            <span>熟练度 {{ xpLabel }} / {{ xpCapLabel }}</span>
            <span v-if="blockedByRealm" class="text-warning">境界不足</span>
          </div>
        </div>
      </div>
      <div class="skill-card-main">
        <header class="skill-card-header">
          <div class="skill-card-heading">
            <div class="skill-card-title-row">
              <h4 class="skill-card-title">{{ name }}</h4>
            </div>
          </div>
          <div class="skill-card-actions">
            <button
              v-if="isEquipped"
              class="skill-card-action"
              type="button"
              @click="handleAction"
            >
              卸下
            </button>
            <div v-else class="skill-card-slot-picker">
              <button
                v-if="!isChoosingSlot"
                class="skill-card-action"
                type="button"
                @click="handleAction"
              >
                装备
              </button>
              <div v-else class="slot-pill-group" role="group" aria-label="选择技能栏">
                <button
                  v-for="(label, index) in HOTKEY_LABELS"
                  :key="label"
                  class="slot-pill"
                  :class="{ 'slot-pill-occupied': Boolean(slotOccupancy?.[index]) }"
                  type="button"
                  @click="handleChooseSlot(index)"
                >
                  <span class="slot-pill-key">{{ label }}</span>
                </button>
              </div>
            </div>
          </div>
        </header>

        <div class="skill-card-dashboard">
          <div
            v-for="stat in stats"
            :key="`${id}-${stat.label}`"
            class="stat-block"
            :class="`stat-${stat.tone}`"
          >
            <div class="stat-value">{{ stat.value }}</div>
            <div class="stat-label">{{ stat.label }}</div>
          </div>
        </div>

        <div v-if="tags.length" class="skill-card-tags">
          <span
            v-for="tag in tags"
            :key="`${id}-${tag.label}`"
            class="skill-tag"
            :class="`skill-tag-${tag.kind}`"
            :title="tag.tooltip || undefined"
          >
            <span>{{ tag.label }}</span>
            <span v-if="tag.value" class="skill-tag-value">{{ tag.value }}</span>
          </span>
        </div>

        <p class="skill-card-description">{{ description }}</p>

      </div>
    </div>
  </article>
</template>

<style scoped>
.skill-card {
  background: linear-gradient(90deg, #1e1e24, #252530);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.35);
}

.skill-card-layout {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 16px;
}

.skill-card-figure {
  width: 96px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skill-card-img-wrap {
  height: 96px;
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.skill-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 20px;
  background: rgba(255, 255, 255, 0.04);
}

.skill-card-placeholder-text {
  font-weight: 700;
}

.skill-card-progress-compact {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.skill-card-main {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.skill-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.skill-card-heading {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.skill-card-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-height: 36px;
}

.skill-card-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.skill-card-title {
  margin: 0;
  font-size: 18px;
}

.skill-card-action {
  padding: 6px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.06);
  color: #fff;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.skill-card-action:hover {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.28);
}

.skill-card-slot-picker {
  display: flex;
  align-items: center;
  justify-content: flex-end;
}

.slot-pill-group {
  display: inline-grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
}

.slot-pill {
  background: transparent;
  color: #fff;
  border: none;
  padding: 6px 10px;
  min-width: 54px;
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease;
}

.slot-pill + .slot-pill {
  border-left: 1px solid rgba(255, 255, 255, 0.12);
}

.slot-pill:hover {
  background: rgba(255, 255, 255, 0.08);
}

.slot-pill-occupied {
  background: rgba(255, 255, 255, 0.08);
  color: #ffd54f;
}

.slot-pill-occupied:hover {
  background: rgba(255, 213, 79, 0.14);
  color: #ffe082;
}

.slot-pill-key {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.6px;
}

.slot-pill-label {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.75);
}

.skill-card-dashboard {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  gap: 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.stat-block:first-of-type {
  border-left: none;
  padding-left: 0;
}

.stat-value {
  font-family: 'Roboto Condensed', 'Noto Sans SC', 'Helvetica Neue', Arial, sans-serif;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.1;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.stat-cost .stat-value {
  color: #4dabff;
}

.stat-cooldown .stat-value {
  color: #00e676;
}

.stat-multiplier .stat-value {
  color: #ff9f43;
  text-shadow: 0 0 12px rgba(255, 159, 67, 0.35);
  font-size: 20px;
}

.skill-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.skill-tag {
  display: inline-flex;
  align-items: center;
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  color: #fff;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  gap: 4px;
}

.skill-tag-timing {
  background: rgba(255, 214, 79, 0.1);
  border-color: rgba(255, 214, 79, 0.35);
  color: #ffd54f;
}

.skill-tag-defense {
  background: rgba(64, 196, 255, 0.1);
  border-color: rgba(64, 196, 255, 0.4);
  color: #64c8ff;
}

.skill-tag-debuff {
  background: rgba(186, 104, 200, 0.1);
  border-color: rgba(186, 104, 200, 0.4);
  color: #ba68c8;
}

.skill-tag-resource {
  background: rgba(41, 121, 255, 0.12);
  border-color: rgba(41, 121, 255, 0.35);
  color: #82b1ff;
}

.skill-tag-value {
  color: rgba(255, 255, 255, 0.75);
  font-size: 11px;
}

.skill-card-description {
  margin: 0;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.85);
}

.skill-progress-bar {
  position: relative;
  width: 100%;
  height: 4px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
}

.skill-progress-bar-value {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: linear-gradient(90deg, rgba(148, 197, 255, 0.85), rgba(64, 124, 255, 0.95));
  transition: width 0.2s ease-out;
}

.skill-progress-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.skill-card-level-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(34, 38, 48, 0.85), rgba(48, 54, 68, 0.9));
  border: 1px solid rgba(255, 214, 79, 0.32);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: #ffda7a;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.36);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.28);
}

.skill-card-hotkeys {
  position: absolute;
  left: 6px;
  bottom: 6px;
  display: inline-flex;
  gap: 6px;
  z-index: 2;
}

.skill-card-hotkey-chip {
  padding: 2px 6px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.65);
  border: 1px solid rgba(255, 255, 255, 0.3);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.92);
  text-transform: uppercase;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
}

.text-warning {
  color: #ffb74d;
}
</style>
