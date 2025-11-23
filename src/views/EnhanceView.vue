<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import EnhanceAltar from '@/components/enhance/EnhanceAltar.vue'
import EnhanceLevelBadge from '@/components/enhance/EnhanceLevelBadge.vue'
import { useCounterUp } from '@/composables/useCounterUp'
import { useEnhanceFeedback } from '@/composables/useEnhanceFeedback'
import { useEnhanceActions } from '@/composables/useEnhanceActions'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import {
  mainEnhanceChance,
  mainEnhanceCost,
  mainEnhanceTier,
  MAX_EQUIP_LEVEL,
  resolveMainStatBreakdown,
} from '@/composables/useEnhance'
import { useEquipmentSelection } from '@/composables/useEquipmentSelection'
import { createEquipmentGridEntry } from '@/utils/equipmentEntry'
import { getEquipmentStatLabel } from '@/utils/equipmentStats'
import type { Equipment, EquipSlotKey } from '@/types/domain'
import type { EquipmentGridEntry } from '@/types/equipment-ui'
import { resolveItemIcon, textIcon } from '@/utils/itemIcon'
import { ITEMS } from '@/data/items'

const player = usePlayerStore()
const inventory = useInventoryStore()
const { attemptMainEnhance } = useEnhanceActions()
const route = useRoute()
const feedback = useEnhanceFeedback()
const counter = useCounterUp({ duration: 900, initialValue: 0 })

const lastMessage = ref<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null)
const toastTimer = ref<number | null>(null)

const itemNameMap = ITEMS.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.name
  return acc
}, {})

type EnhanceEntry = {
  key: string
  equipment: Equipment
  source: 'equipped' | 'inventory'
  slotKey?: EquipSlotKey
}

const { getSlotLabel, formatMainStatLine, getMainStatTooltip, formatSubstatsList, getEquipmentRequiredRealmTier, isRealmRequirementMet, requirementLabel } = useEquipmentSelection()

const entryContext = {
  getSlotLabel,
  formatMainStatLine,
  getMainStatTooltip,
  formatSubstatsList,
  getEquipmentRequiredRealmTier,
  isRealmRequirementMet,
  requirementLabel,
}

const enhanceEntries = computed<EnhanceEntry[]>(() => {
  const entries: EnhanceEntry[] = []
  Object.entries(player.equips).forEach(([slot, equip]) => {
    if (!equip) return
    entries.push({ key: `equipped-${slot}`, equipment: equip, source: 'equipped', slotKey: slot as EquipSlotKey })
  })
  inventory.equipment.forEach((equipment, index) => {
    entries.push({ key: `inventory-${index}`, equipment, source: 'inventory' })
  })
  return entries
})

const selectedKey = computed<string | null>(() => {
  const raw = route.params.entryKey
  if (Array.isArray(raw)) return raw[0] ?? null
  return typeof raw === 'string' && raw.length > 0 ? raw : null
})

watch(selectedKey, () => {
  lastMessage.value = null
})

function clearToastTimer() {
  if (toastTimer.value) {
    window.clearTimeout(toastTimer.value)
    toastTimer.value = null
  }
}

watch(lastMessage, (val) => {
  clearToastTimer()
  if (val) {
    toastTimer.value = window.setTimeout(() => {
      lastMessage.value = null
      toastTimer.value = null
    }, 3200)
  }
})

onBeforeUnmount(clearToastTimer)

const selected = computed(() => {
  const key = selectedKey.value
  if (!key) return null
  return enhanceEntries.value.find((entry) => entry.key === key) ?? null
})

const selectedEntry = computed<EquipmentGridEntry | null>(() => {
  if (!selected.value) return null
  const meta = selected.value.source === 'inventory' ? inventory.equipmentMeta[selected.value.equipment.id] : undefined
  return createEquipmentGridEntry(selected.value.equipment, entryContext, {
    source: selected.value.source,
    slotKey: selected.value.slotKey,
    meta,
  })
})

watch(selectedEntry, (entry) => {
  if (entry?.source === 'inventory') {
    inventory.markEquipmentSeen(entry.id)
  }
})

const hasAnyEquipment = computed(() => enhanceEntries.value.length > 0)

const mainInfo = computed(() => {
  const entry = selected.value
  if (!entry) return null
  const { equipment } = entry
  const [currentBreakdown] = resolveMainStatBreakdown(equipment)
  if (!currentBreakdown) return null
  const nextBreakdowns = equipment.level >= MAX_EQUIP_LEVEL
    ? [currentBreakdown]
    : resolveMainStatBreakdown(equipment, equipment.level + 1)
  const nextBreakdown = nextBreakdowns[0] ?? currentBreakdown
  const diffFlat = nextBreakdown.flat - currentBreakdown.flat
  const diffPercent = nextBreakdown.percent - currentBreakdown.percent
  const diffTotal = nextBreakdown.total - currentBreakdown.total
  const cost = mainEnhanceCost(equipment)
  const chance = mainEnhanceChance(equipment.level)
  const materials = cost.materials.map((material) => ({
    ...material,
    owned: inventory.quantity(material.id),
  }))
  const lackingMaterial = materials.find((material) => material.owned < material.quantity)
  const blockReason = (() => {
    if (equipment.level >= MAX_EQUIP_LEVEL) return '已达最大强化等级'
    if (player.gold < cost.gold) return '金币不足'
    if (lackingMaterial) return `${itemName(lackingMaterial.id)}不足`
    return null
  })()

  return {
    isMax: equipment.level >= MAX_EQUIP_LEVEL,
    current: currentBreakdown,
    next: nextBreakdown,
    diff: { flat: diffFlat, percent: diffPercent, total: diffTotal },
    chance,
    cost,
    materials,
    lackingMaterial,
    blockReason,
  }
})

const mainStatLabel = computed(() => {
  const key = mainInfo.value?.current.key
  return key ? getEquipmentStatLabel(key) : '主要属性'
})

const tierDetails = computed(() => {
  if (!selected.value) return null
  return mainEnhanceTier(selected.value.equipment.level)
})

const dangerLevel = computed(() => {
  const level = selected.value?.equipment.level ?? 0
  if (level >= 10) return 'danger' as const
  if (level >= 5) return 'risky' as const
  return 'safe' as const
})

const counterValue = counter.value

const penaltyDetail = computed(() => {
  if (!selectedEntry.value || !tierDetails.value) return ''
  const drop = tierDetails.value.dropOnFail ?? 0
  if (!drop) return '失败不降级'
  const currentLevel = selectedEntry.value.equipment.level
  if (currentLevel >= MAX_EQUIP_LEVEL) return '无'
  const floor = tierDetails.value.floor ?? 0
  const target = Math.max(floor, currentLevel - drop)
  if (target === currentLevel) return '失败不降级'
  return `+${currentLevel} 降至 +${target}`
})

watch(
  () => mainInfo.value?.current.total ?? 0,
  (value) => {
    counter.animateTo(value ?? 0, { immediate: !selectedEntry.value })
  },
  { immediate: true },
)

function itemName(id: string) {
  return itemNameMap[id] ?? id
}

function makeMessage(text: string, kind: 'success' | 'error' | 'info') {
  lastMessage.value = { text, kind }
}

function handleMainEnhance() {
  const entry = selectedEntry.value
  if (!entry) return
  const result = attemptMainEnhance(entry.equipment.id)

  if (!result.ok) {
    const reason = (() => {
      switch (result.reason) {
        case 'max-level':
          return '该装备已经达到最大强化等级。'
        case 'insufficient-gold':
          return '金币不足，无法进行强化。'
        case 'insufficient-material': {
          const missingId = result.missingMaterialId ?? result.cost?.materials?.[0]?.id ?? ''
          return `${itemName(missingId)}不足。`
        }
        case 'not-found':
          return '未找到目标装备。'
        default:
          return '强化失败，发生未知错误。'
      }
    })()
    feedback.triggerFailure()
    makeMessage(reason, 'error')
    return
  }

  if (result.success) {
    feedback.triggerSuccess()
    makeMessage(`强化成功！等级从 +${result.levelBefore} 提升到 +${result.levelAfter}。`, 'success')
  } else {
    feedback.triggerFailure()
    makeMessage(`强化失败，等级下降至 +${result.levelAfter}.`, 'error')
  }
}

function mainButtonDisabled() {
  if (!selected.value) return true
  return Boolean(mainInfo.value?.blockReason)
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatFlatDelta(value: number) {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value}`
}

function formatChance(chance: number | undefined) {
  if (chance === undefined) return '-'
  return `${Math.round(chance * 100)}%`
}

const BASE_MATERIAL_IDS = ['blessGem', 'soulGem', 'miracleGem']

const materialOverview = computed(() => {
  return BASE_MATERIAL_IDS.map((id) => ({
    id,
    name: itemName(id),
    qty: inventory.quantity(id),
  }))
})

const goldIcon = textIcon('🪙')

const costEntries = computed(() => {
  if (!mainInfo.value) return []
  const entries = [
    {
      id: 'gold',
      required: mainInfo.value.cost.gold,
      owned: player.gold,
      icon: goldIcon,
      label: '金币',
      showOwned: false,
    },
    ...mainInfo.value.materials.map((material) => ({
      id: material.id,
      required: material.quantity,
      owned: material.owned,
      icon: resolveItemIcon(material.id),
      label: itemName(material.id),
      showOwned: true,
    })),
  ]

  return entries.map((entry) => ({
    ...entry,
    lacking: entry.showOwned ? entry.owned < entry.required : entry.owned < entry.required,
  }))
})
</script>

<template>
  <section class="enhance-page">
    <header class="enhance__header">
      <h2 class="section-title">强化祭坛</h2>
      <div class="enhance__toast-slot">
        <transition name="enhance-toast">
          <div
            v-if="lastMessage"
            class="enhance__toast"
            :class="{
              'enhance__toast--success': lastMessage.kind === 'success',
              'enhance__toast--error': lastMessage.kind === 'error',
            }"
            role="status"
          >
            {{ lastMessage.text }}
          </div>
        </transition>
      </div>
      <div class="enhance__resources">
        <span class="enhance__resource" title="金币">
          <span class="enhance__resource-icon">🪙</span>
          <strong>{{ player.gold }}</strong>
        </span>
        <span
          v-for="item in materialOverview"
          :key="item.id"
          class="enhance__resource enhance__resource--muted"
          :title="item.name"
        >
          <span class="enhance__resource-dot" :data-id="item.id" />
          <strong>{{ item.qty }}</strong>
        </span>
      </div>
    </header>

    <template v-if="selectedEntry && mainInfo">
      <div class="enhance__layout">
          <EnhanceAltar
            :entry="selectedEntry"
            :danger-level="dangerLevel"
            :feedback-state="feedback.feedbackState.value"
            :feedback-key="feedback.flashKey.value"
          />

        <div class="enhance__right">
          <div class="enhance__stat-card">
            <header class="enhance__stat-head">
              <p class="enhance__stat-title" :style="{ color: selectedEntry.qualityColor }">
                {{ selectedEntry.name }}
              </p>
              <EnhanceLevelBadge :level="selectedEntry.equipment.level" />
            </header>

            <div class="enhance__stat-main">
              <p class="enhance__stat-label">{{ mainStatLabel }}</p>
              <div class="enhance__stat-compare">
                <span class="enhance__value enhance__value--current">{{ counterValue.toFixed(0) }}</span>
                <span class="enhance__arrow">→</span>
                <span class="enhance__value enhance__value--next">{{ mainInfo.next.total }}</span>
                <span class="enhance__delta" :class="{ 'enhance__delta--up': mainInfo.diff.total > 0 }">
                  {{ formatFlatDelta(mainInfo.diff.total) }}
                </span>
              </div>
            </div>

            <p class="enhance__stat-detail">
              基础 {{ mainInfo.current.base }} · 固定 {{ mainInfo.current.flat }} · 百分比 {{ formatPercent(mainInfo.current.percent) }}
            </p>
            <p v-if="!mainInfo.isMax" class="enhance__stat-detail enhance__stat-detail--muted">
              下一等级：固定 {{ formatFlatDelta(mainInfo.diff.flat) }} · 百分比 {{ formatPercent(mainInfo.next.percent) }}
            </p>
            <p v-else class="enhance__stat-detail enhance__stat-detail--muted">已达最大强化等级</p>
          </div>

          <div class="enhance__risk-row">
            <div class="enhance__risk">
              <span class="enhance__risk-label">成功率</span>
              <span class="enhance__risk-value">{{ formatChance(mainInfo.chance) }}</span>
            </div>
            <div class="enhance__risk">
              <span class="enhance__risk-label">失败惩罚</span>
              <span class="enhance__risk-warning">{{ penaltyDetail }}</span>
            </div>
          </div>

          <div class="enhance__actions">
            <div class="enhance__costs">
              <div
                v-for="cost in costEntries"
                :key="cost.id"
                class="enhance__cost-card"
                :class="{ 'enhance__cost-card--lack': cost.lacking }"
                :aria-label="cost.label"
              >
                <div class="enhance__cost-icon">
                  <img
                    v-if="cost.icon.type === 'image'"
                    :src="cost.icon.src"
                    :alt="cost.label"
                  >
                  <span v-else>{{ cost.icon.text }}</span>
                </div>
                <p class="enhance__cost-label">{{ cost.label }}</p>
                <p class="enhance__cost-amount">
                  <template v-if="cost.showOwned">
                    {{ cost.required }} / {{ cost.owned }}
                  </template>
                  <template v-else>
                    {{ cost.required }}
                  </template>
                </p>
              </div>
            </div>

            <button
              class="enhance__cta"
              type="button"
              :disabled="mainButtonDisabled()"
              @click="handleMainEnhance"
            >
              {{ mainInfo?.blockReason || '开始强化' }}
            </button>
          </div>
        </div>
      </div>
    </template>
    <template v-else-if="!hasAnyEquipment">
      <div class="enhance__empty">暂无装备可供强化，请先收集装备。</div>
    </template>
    <template v-else-if="!selectedKey">
      <div class="enhance__empty">请返回背包，选择装备后点击“强化”进入此界面。</div>
    </template>
    <template v-else>
      <div class="enhance__empty">未找到目标装备，可能已被出售、拆解或卸下。</div>
    </template>
  </section>
</template>

<style scoped>
.enhance-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
  position: relative;
}

.enhance__header {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-areas: 'title toast resources';
  align-items: center;
  gap: 12px;
}

.section-title {
  grid-area: title;
}

.enhance__toast-slot {
  grid-area: toast;
  display: flex;
  justify-content: center;
}

.enhance__resources {
  grid-area: resources;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-self: end;
}

.enhance__resource {
  padding: 8px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.enhance__resource--muted {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.82);
}

.enhance__resource-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.enhance__resource-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  background: linear-gradient(135deg, #9edcff, #4aa1ff);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14);
}

.enhance__resource-dot[data-id='soulGem'] {
  background: linear-gradient(135deg, #ffdba3, #ffae43);
}

.enhance__resource-dot[data-id='miracleGem'] {
  background: linear-gradient(135deg, #ffbcd2, #ff5f8a);
}

.enhance__resource-dot[data-id='goldenFleece'] {
  background: linear-gradient(135deg, #ffe8a3, #f7c430);
}

.enhance__layout {
  display: grid;
  grid-template-columns: minmax(320px, 46%) 1fr;
  gap: 16px;
  align-items: stretch;
}

.enhance__right {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.enhance__stat-card {
  background: linear-gradient(140deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.35);
}

.enhance__stat-head {
  display: flex;
  justify-content: flex-start;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.enhance__stat-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.enhance__stat-label {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.64);
  letter-spacing: 0.5px;
}

.enhance__stat-title {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.enhance__chip {
  padding: 6px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.9);
}

.enhance__stat-compare {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.enhance__value {
  font-weight: 800;
  letter-spacing: 0.4px;
}

.enhance__value--current {
  font-size: 32px;
}

.enhance__value--next {
  font-size: 34px;
  color: #7fe094;
}

.enhance__arrow {
  color: rgba(255, 255, 255, 0.7);
}

.enhance__delta {
  font-size: 14px;
  color: rgba(127, 224, 148, 0.85);
  padding: 4px 8px;
  border-radius: 10px;
  background: rgba(127, 224, 148, 0.1);
}

.enhance__delta--up {
  color: #7fe094;
}

.enhance__stat-detail {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.82);
}

.enhance__stat-detail--muted {
  color: rgba(255, 255, 255, 0.66);
}

.enhance__risk-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
}

.enhance__risk {
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.enhance__risk-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
}

.enhance__risk-value {
  font-size: 20px;
  font-weight: 800;
  color: #7fe094;
}

.enhance__risk-warning {
  font-size: 16px;
  color: #ff9b71;
  font-weight: 700;
}

.enhance__actions {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 16px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.enhance__costs {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: stretch;
  justify-content: flex-start;
}

.enhance__cost-card {
  width: 108px;
  padding: 10px 10px 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  min-height: 96px;
}

.enhance__cost-card--lack {
  border-color: rgba(255, 155, 113, 0.55);
  box-shadow: 0 6px 20px rgba(255, 134, 98, 0.15);
}

.enhance__cost-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.07);
  display: grid;
  place-items: center;
  font-size: 22px;
  overflow: hidden;
}

.enhance__cost-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.enhance__cost-amount {
  margin: 0;
  font-weight: 700;
  letter-spacing: 0.4px;
  color: rgba(255, 255, 255, 0.92);
}

.enhance__cost-label {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.78);
  text-align: center;
}

.enhance__cta {
  width: 100%;
  padding: 14px 16px;
  border-radius: 14px;
  border: none;
  cursor: pointer;
  background: linear-gradient(120deg, #ffdd9d, #f78c5c);
  color: #2b1a03;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 1px;
  box-shadow:
    0 12px 28px rgba(0, 0, 0, 0.35),
    0 0 28px rgba(247, 140, 92, 0.35);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.4);
  animation: enhance-pulse 2.4s ease-in-out infinite;
  transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.2s ease;
}

.enhance__cta:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow:
    0 14px 30px rgba(0, 0, 0, 0.4),
    0 0 32px rgba(247, 140, 92, 0.45);
}

.enhance__cta:active:not(:disabled) {
  transform: translateY(0);
}

.enhance__cta:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  animation: none;
}

.enhance__hint {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.76);
}

.enhance__hint--warning {
  color: #ffb48c;
}

.enhance__empty {
  padding: 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.75);
}

.enhance__toast {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(20, 24, 34, 0.9);
  color: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.35);
  width: auto;
  max-width: min(420px, 90vw);
}

.enhance__toast--success {
  border-color: rgba(127, 224, 148, 0.6);
  box-shadow: 0 0 24px rgba(127, 224, 148, 0.25);
}

.enhance__toast--error {
  border-color: rgba(255, 155, 113, 0.7);
  box-shadow: 0 0 24px rgba(255, 155, 113, 0.3);
}

.enhance-toast-enter-active,
.enhance-toast-leave-active {
  transition: all 0.22s ease;
}

.enhance-toast-enter-from,
.enhance-toast-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

@keyframes enhance-pulse {
  0%, 100% {
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.35),
      0 0 18px rgba(247, 140, 92, 0.35);
  }
  50% {
    box-shadow:
      0 10px 24px rgba(0, 0, 0, 0.3),
      0 0 32px rgba(247, 140, 92, 0.45);
  }
}

@media (max-width: 960px) {
  .enhance__layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .enhance__header {
    grid-template-columns: 1fr;
    grid-template-areas:
      'title'
      'toast'
      'resources';
  }

  .enhance__stat-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
