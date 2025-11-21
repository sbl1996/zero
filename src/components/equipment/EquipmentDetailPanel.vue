<script setup lang="ts">
import { computed, watch } from 'vue'
import { useEquipmentSelection } from '@/composables/useEquipmentSelection'
import { useCounterUp } from '@/composables/useCounterUp'
import { resolveMainStatBreakdown } from '@/composables/useEnhance'
import { getEquipmentStatLabel } from '@/utils/equipmentStats'
import type { EquipmentGridEntry } from '@/types/equipment-ui'

const props = withDefaults(
  defineProps<{
    entry: EquipmentGridEntry | null
    actionLocked?: boolean
    feedbackMessage?: string
    feedbackSuccess?: boolean
    showComparison?: boolean
    equippedAction?: 'unequip' | 'replace'
    emptyTitle?: string
    emptyActionLabel?: string
  }>(),
  {
    actionLocked: false,
    feedbackMessage: '',
    feedbackSuccess: true,
    showComparison: true,
    equippedAction: 'unequip',
    emptyTitle: '左侧选择一件装备以查看详细信息',
    emptyActionLabel: '',
  },
)

const emit = defineEmits<{
  (e: 'equip', entry: EquipmentGridEntry): void
  (e: 'unequip', entry: EquipmentGridEntry): void
  (e: 'enhance', entry: EquipmentGridEntry): void
  (e: 'discard', entry: EquipmentGridEntry): void
  (e: 'replace', entry: EquipmentGridEntry): void
  (e: 'empty-action'): void
}>()

const { diffAgainstEquipped } = useEquipmentSelection()
const counterController = useCounterUp({ duration: 800, initialValue: 0 })
const counterValue = counterController.value

const mainStatBreakdown = computed(() => {
  if (!props.entry) return null
  const breakdown = resolveMainStatBreakdown(props.entry.equipment)
  return breakdown[0] ?? null
})

const mainStatValue = computed(() => mainStatBreakdown.value?.total ?? 0)
const mainStatLabel = computed(() => {
  if (!mainStatBreakdown.value) return '主要属性'
  return getEquipmentStatLabel(mainStatBreakdown.value.key)
})

const descriptionText = computed(() => props.entry?.equipment.description ?? '')

watch(
  () => [props.entry?.id ?? 'none', mainStatValue.value] as const,
  ([, value]) => {
    counterController.animateTo(value ?? 0, { immediate: !props.entry })
  },
  { immediate: true },
)

const diffEntries = computed(() => {
  if (!props.entry || !props.showComparison) return []
  return diffAgainstEquipped(props.entry.equipment)
})

const mainStatDelta = computed(() => {
  if (!props.showComparison) return null
  const [primary] = diffEntries.value
  return primary?.delta ?? null
})

function emitAction(type: 'equip' | 'unequip' | 'enhance' | 'discard' | 'replace') {
  if (!props.entry) return
  if (type === 'equip') {
    emit('equip', props.entry)
  } else if (type === 'unequip') {
    emit('unequip', props.entry)
  } else if (type === 'enhance') {
    emit('enhance', props.entry)
  } else if (type === 'discard') {
    emit('discard', props.entry)
  } else if (type === 'replace') {
    emit('replace', props.entry)
  }
}
</script>

<template>
  <section
    class="detail-panel"
    :class="{
      'detail-panel--compact': !props.showComparison,
      'detail-panel--empty': !props.entry,
    }"
  >
    <template v-if="props.entry">
      <header class="detail-panel__header">
        <h3 class="detail-panel__name" :style="{ color: props.entry.qualityColor }">
          {{ props.entry.name }}
        </h3>
        <div class="detail-panel__slot">
          <span>{{ props.entry.slotLabel }}</span>
          <span class="enhance-level">
            <span 
              class="enhance-level__badge"
              :class="[
                `enhance-level__badge--tier${Math.floor(props.entry.equipment.level / 5)}`,
                { 'enhance-level__badge--max': props.entry.equipment.level >= 15 }
              ]"
            >
              <span class="enhance-level__number">+{{ props.entry.equipment.level }}</span>
              <span class="enhance-level__stars">
                <span 
                  v-for="star in (props.entry.equipment.level || 0)" 
                  :key="star"
                  class="enhance-level__star"
                  :style="{ animationDelay: `${star * 0.1}s` }"
                >★</span>
              </span>
            </span>
          </span>
        </div>
      </header>

      <div class="detail-panel__visual">
        <div class="detail-panel__icon-wrapper" :style="{ boxShadow: props.entry.qualityVisual.glowShadow }">
          <div class="detail-panel__icon" :class="props.entry.enhanceAura">
            <span v-if="props.entry.icon.type === 'text'">{{ props.entry.icon.text }}</span>
            <img
              v-else
              :src="props.entry.icon.src"
              :alt="props.entry.icon.alt || props.entry.name"
            >
          </div>
        </div>

        <div class="detail-panel__description">
          <h4>装备描述</h4>
          <p>{{ descriptionText || '暂无描述' }}</p>
        </div>
      </div>

      <div class="detail-panel__stats">
        <section class="detail-panel__main">
          <p class="detail-panel__main-label">{{ mainStatLabel }}</p>
          <div class="detail-panel__main-value">
            <span class="detail-panel__counter">{{ counterValue.toFixed(0) }}</span>
            <span
              v-if="props.showComparison && mainStatDelta !== null"
              class="detail-panel__delta"
              :class="{
                'detail-panel__delta--up': mainStatDelta > 0,
                'detail-panel__delta--down': mainStatDelta < 0,
              }"
            >
              {{ mainStatDelta > 0 ? '↑' : mainStatDelta < 0 ? '↓' : '' }}{{ mainStatDelta }}
            </span>
          </div>
          <p class="detail-panel__requirement">
            {{ props.entry.requirementLabel }}
            <span v-if="props.entry.requiredRealmTier && !props.entry.realmRequirementMet" class="detail-panel__requirement-warn">
              (当前境界不足)
            </span>
          </p>
        </section>

        <section class="detail-panel__substats">
          <h4>额外属性</h4>
          <ul>
            <li v-for="line in props.entry.subDetails" :key="line">
              {{ line }}
            </li>
          </ul>
        </section>
      </div>

      <section v-if="props.showComparison" class="detail-panel__compare">
        <h4>当前已穿戴装备</h4>
        <article v-for="diff in diffEntries" :key="diff.slotKey" class="compare-card">
          <div>
            <p class="compare-card__slot">{{ diff.slotLabel }}</p>
            <p class="compare-card__name">
              {{ diff.equipped ? `${diff.equipped.name} (+${diff.equipped.level})` : '未装备' }}
            </p>
          </div>
          <div class="compare-card__stat" v-if="diff.equippedMain || diff.candidateMain">
            <span class="compare-card__value">{{ diff.equippedMain?.total ?? 0 }}</span>
            <span class="compare-card__arrow">→</span>
            <span class="compare-card__value">{{ diff.candidateMain?.total ?? 0 }}</span>
            <span
              class="compare-card__delta"
              :class="{
                'compare-card__delta--up': (diff.delta ?? 0) > 0,
                'compare-card__delta--down': (diff.delta ?? 0) < 0,
              }"
            >
              {{ diff.delta ?? 0 }}
            </span>
          </div>
        </article>
      </section>

      <section class="detail-panel__actions">
        <button
          v-if="props.entry.source === 'inventory'"
          class="detail-panel__btn detail-panel__btn--primary"
          type="button"
          :disabled="props.actionLocked || (props.entry.requiredRealmTier && !props.entry.realmRequirementMet)"
          @click="emitAction('equip')"
        >
          穿戴
        </button>
        <button
          v-else
          class="detail-panel__btn"
          type="button"
          :disabled="props.actionLocked || !props.entry.slotKey"
          @click="emitAction(props.equippedAction === 'replace' ? 'replace' : 'unequip')"
        >
          {{ props.equippedAction === 'replace' ? '替换' : '卸下' }}
        </button>
        <button
          class="detail-panel__btn"
          type="button"
          :disabled="props.actionLocked"
          @click="emitAction('enhance')"
        >
          强化
        </button>
        <button
          v-if="props.entry.source === 'inventory'"
          class="detail-panel__btn detail-panel__btn--danger"
          type="button"
          :disabled="props.actionLocked"
          @click="emitAction('discard')"
        >
          丢弃
        </button>
      </section>
    </template>

    <div v-else class="detail-panel__placeholder">
      <p>{{ props.emptyTitle }}</p>
      <button
        v-if="props.emptyActionLabel"
        class="detail-panel__btn detail-panel__btn--ghost detail-panel__btn--compact"
        type="button"
        @click="emit('empty-action')"
      >
        {{ props.emptyActionLabel }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.detail-panel {
  --detail-panel-min-height: 480px;
  flex: 1;
  padding: 16px 20px;
  border-radius: 24px;
  background: linear-gradient(145deg, rgba(12, 16, 28, 0.95), rgba(6, 8, 14, 0.92));
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: var(--detail-panel-min-height);
}

.detail-panel--compact {
  gap: 12px;
  flex: 0 0 auto;
}

.detail-panel--empty {
  height: 100%;
  min-height: var(--detail-panel-min-height);
}

.detail-panel__feedback {
  min-height: 32px;
}

.detail-panel__feedback--ok {
  color: #9be7c4;
}

.detail-panel__feedback--err {
  color: #ff8a80;
}

.detail-panel__feedback--placeholder {
  color: rgba(255, 255, 255, 0.4);
}

.detail-panel__header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 8px;
}

.detail-panel__quality {
  font-size: 12px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
}

.detail-panel__name {
  font-size: 24px;
  margin: 4px 0;
}

.detail-panel__slot {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.enhance-level {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.enhance-level__label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.enhance-level__badge {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(100, 200, 255, 0.15), rgba(100, 150, 255, 0.1));
  border: 1px solid rgba(100, 200, 255, 0.3);
  box-shadow: 0 2px 8px rgba(100, 200, 255, 0.2);
  transition: all 0.3s ease;
}

.enhance-level__badge--tier1 {
  background: linear-gradient(135deg, rgba(100, 255, 150, 0.2), rgba(50, 200, 100, 0.15));
  border-color: rgba(100, 255, 150, 0.4);
  box-shadow: 0 2px 12px rgba(100, 255, 150, 0.3);
}

.enhance-level__badge--tier2 {
  background: linear-gradient(135deg, rgba(200, 100, 255, 0.25), rgba(150, 50, 255, 0.2));
  border-color: rgba(200, 100, 255, 0.5);
  box-shadow: 0 3px 16px rgba(200, 100, 255, 0.4);
}

.enhance-level__badge--tier3 {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.3), rgba(255, 165, 0, 0.25));
  border-color: rgba(255, 215, 0, 0.6);
  box-shadow: 0 4px 20px rgba(255, 215, 0, 0.5);
}

.enhance-level__badge--max {
  background: linear-gradient(135deg, rgba(255, 100, 255, 0.35), rgba(255, 50, 150, 0.3));
  border-color: rgba(255, 100, 255, 0.7);
  box-shadow: 0 4px 24px rgba(255, 100, 255, 0.6);
  animation: enhance-pulse 2s ease-in-out infinite;
}

@keyframes enhance-pulse {
  0%, 100% {
    box-shadow: 0 4px 24px rgba(255, 100, 255, 0.6);
  }
  50% {
    box-shadow: 0 4px 32px rgba(255, 100, 255, 0.9);
  }
}

.enhance-level__number {
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.enhance-level__stars {
  display: inline-flex;
  gap: 1px;
}

.enhance-level__star {
  font-size: 10px;
  color: rgba(255, 215, 0, 0.9);
  text-shadow: 
    0 0 2px rgba(255, 215, 0, 0.8),
    0 0 4px rgba(255, 215, 0, 0.5);
  animation: star-twinkle 1.5s ease-in-out infinite;
  display: inline-block;
}

@keyframes star-twinkle {
  0%, 100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.6;
    transform: scale(0.9);
  }
}

.detail-panel__visual {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}

.detail-panel__icon-wrapper {
  display: flex;
  border-radius: 20px;
  justify-content: center;
  align-items: center;
  flex: 0 0 auto;
}

.detail-panel__icon {
  width: 140px;
  height: 140px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.04);
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255, 255, 255, 0.15);
  font-size: 72px;
  overflow: hidden;
}

.detail-panel__icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.detail-panel__description {
  flex: 1;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px 16px;
  color: rgba(255, 255, 255, 0.78);
  line-height: 1.6;
  min-height: 140px;
}

.detail-panel__description h4 {
  margin: 0 0 6px;
  font-size: 14px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.75);
}

.detail-panel__description p {
  margin: 0;
  white-space: pre-wrap;
}

.detail-panel__stats {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.detail-panel__main {
  background: rgba(255, 255, 255, 0.04);
  padding: 12px 16px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-panel__main-label {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.detail-panel__main-value {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.detail-panel__counter {
  font-size: 36px;
  font-weight: 700;
}

.detail-panel__delta {
  font-size: 16px;
  font-weight: 600;
}

.detail-panel__delta--up {
  color: #7fe094;
}

.detail-panel__delta--down {
  color: #ff8a80;
}

.detail-panel__requirement {
  margin: 8px 0 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.detail-panel__requirement-warn {
  color: #ffc371;
}

.detail-panel__substats {
  background: rgba(255, 255, 255, 0.02);
  border-radius: 16px;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.detail-panel__substats h4,
.detail-panel__compare h4 {
  margin: 0 0 8px;
  font-size: 14px;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.75);
}

.detail-panel__substats ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.75);
}

.detail-panel__substats ul li {
  color: #1adc5e;
}

@media (max-width: 900px) {
  .detail-panel__stats {
    grid-template-columns: 1fr;
  }

  .detail-panel__visual {
    flex-direction: column;
  }
}

.detail-panel__compare {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.compare-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.compare-card__slot {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.compare-card__name {
  margin: 4px 0 0;
  font-size: 14px;
}

.compare-card__stat {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.compare-card__value {
  font-weight: 600;
}

.compare-card__delta {
  font-weight: 600;
}

.compare-card__delta--up {
  color: #7fe094;
}

.compare-card__delta--down {
  color: #ff8a80;
}

.detail-panel__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-panel__btn {
  flex: 1;
  min-width: 120px;
  padding: 10px 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: transparent;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.detail-panel__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.detail-panel__btn--primary {
  border-color: rgba(125, 224, 148, 0.4);
  background: rgba(125, 224, 148, 0.16);
}

.detail-panel__btn--danger {
  border-color: rgba(255, 138, 128, 0.4);
  background: rgba(255, 138, 128, 0.16);
}

.detail-panel__btn--ghost {
  border-style: dashed;
  border-color: rgba(255, 255, 255, 0.3);
}

.detail-panel__btn--compact {
  flex: 0;
  padding: 6px 14px;
  min-width: auto;
}

.detail-panel__placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
