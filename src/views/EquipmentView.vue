<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import PaperDollCanvas from '@/components/equipment/PaperDollCanvas.vue'
import EquipmentDetailPanel from '@/components/equipment/EquipmentDetailPanel.vue'
import AttributeOverviewPanel from '@/components/equipment/AttributeOverviewPanel.vue'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEquipmentSelection } from '@/composables/useEquipmentSelection'
import { useEquipmentActions } from '@/composables/useEquipmentActions'
import { createEquipmentGridEntry, type EquipmentEntryBuilderContext } from '@/utils/equipmentEntry'
import { iconForEquipSlot } from '@/utils/equipmentIcons'
import { ITEMS, getItemEffectText, quickConsumableIds } from '@/data/items'
import { maps } from '@/data/maps'
import type { EquipSlot, EquipSlotKey } from '@/types/domain'
import type { EquipmentGridEntry } from '@/types/equipment-ui'
import type { PaperDollSlotState } from '@/types/paperDoll'

const player = usePlayerStore()
const inventory = useInventoryStore()
const router = useRouter()
const { requestUnequip } = useEquipmentActions()
const {
  attributeOverview,
  getSlotLabel,
  getSlotKeyLabel,
  formatMainStatLine,
  getMainStatTooltip,
  formatSubstatsList,
  getEquipmentRequiredRealmTier,
  isRealmRequirementMet,
  requirementLabel,
} = useEquipmentSelection()

const entryContext: EquipmentEntryBuilderContext = {
  getSlotLabel,
  formatMainStatLine,
  getMainStatTooltip,
  formatSubstatsList,
  getEquipmentRequiredRealmTier,
  isRealmRequirementMet,
  requirementLabel,
}

const SLOT_LAYOUT: Array<{ key: EquipSlotKey; label: string; baseSlot: EquipSlot }> = [
  { key: 'helmet', label: '头盔', baseSlot: 'helmet' },
  { key: 'shieldL', label: '盾牌', baseSlot: 'shieldL' },
  { key: 'weaponR', label: '武器', baseSlot: 'weaponR' },
  { key: 'armor', label: '铠甲', baseSlot: 'armor' },
  { key: 'boots', label: '靴子', baseSlot: 'boots' },
  { key: 'ring1', label: '戒指 1', baseSlot: 'ring' },
  { key: 'ring2', label: '戒指 2', baseSlot: 'ring' },
]

const paperDollSlots = computed<PaperDollSlotState[]>(() =>
  SLOT_LAYOUT.map((definition) => {
    let equipment = player.equips[definition.key] ?? null
    let actualSlotKey = definition.key

    // Special handling for weapon slot to show 2H weapon if equipped
    if (definition.key === 'weaponR' && player.equips.weapon2H) {
      equipment = player.equips.weapon2H
      actualSlotKey = 'weapon2H'
    }

    const entry = equipment
      ? createEquipmentGridEntry(equipment, entryContext, {
          source: 'equipped',
          slotKey: actualSlotKey,
        })
      : null
    return {
      key: definition.key,
      label: definition.label,
      placeholderIcon: iconForEquipSlot(definition.baseSlot),
      entry,
    }
  }),
)

const selectedSlotKey = ref<EquipSlotKey | null>(null)

watch(
  paperDollSlots,
  (slots) => {
    if (selectedSlotKey.value && slots.some((slot) => slot.key === selectedSlotKey.value)) {
      return
    }
    const fallback = slots.find((slot) => slot.entry)?.key ?? slots[0]?.key ?? null
    selectedSlotKey.value = fallback
  },
  { immediate: true },
)

const selectedEntry = computed(() => {
  if (!selectedSlotKey.value) return null
  return paperDollSlots.value.find((slot) => slot.key === selectedSlotKey.value)?.entry ?? null
})

const quickSlotOptions = ITEMS.filter((item) => quickConsumableIds.has(item.id))
const mapNameLookup = new Map(maps.map((map) => [map.id, map.name]))

function handleSlotSelect(key: EquipSlotKey) {
  selectedSlotKey.value = key
}

function enhanceEntryKey(entry: EquipmentGridEntry) {
  const slotId = entry.slotKey ?? entry.slot
  return `equipped-${slotId}`
}

function goEnhance(entry: EquipmentGridEntry | null) {
  if (!entry) return
  const entryKey = enhanceEntryKey(entry)
  router.push({ name: 'enhance', params: { entryKey } })
}

function goBackpack() {
  router.push({ name: 'backpack' })
}

function handleQuickSlotChange(index: number, value: string) {
  inventory.setQuickSlot(index, value.length > 0 ? value : null)
}

function quickSlotEffectText(itemId: string | null) {
  if (!itemId) return ''
  const item = quickSlotOptions.find((option) => option.id === itemId)
  return getItemEffectText(item, { mapNameLookup })
}

function quickSlotName(itemId: string | null) {
  if (!itemId) return '空'
  const item = quickSlotOptions.find((option) => option.id === itemId)
  return item?.name ?? itemId
}

const actionLocked = ref(false)
const feedbackMessage = ref('')
const feedbackSuccess = ref(true)
let lockTimer: number | null = null
let feedbackTimer: number | null = null

function withActionLock(run: () => void) {
  if (actionLocked.value) return
  actionLocked.value = true
  run()
  lockTimer = window.setTimeout(() => {
    actionLocked.value = false
    lockTimer = null
  }, 500)
}

function showFeedback(message: string, success: boolean) {
  if (feedbackTimer) {
    window.clearTimeout(feedbackTimer)
  }
  feedbackMessage.value = message
  feedbackSuccess.value = success
  feedbackTimer = window.setTimeout(() => {
    feedbackMessage.value = ''
    feedbackTimer = null
  }, 2000)
}

function handleUnequip(entry: EquipmentGridEntry) {
  if (!entry.slotKey) return
  withActionLock(() => {
    const result = requestUnequip(entry.slotKey as EquipSlotKey)
    if (result.ok) {
      showFeedback(`已卸下 ${result.equipment.name}`, true)
    } else {
      showFeedback('该槽位没有装备', false)
    }
  })
}

function handleDetailEnhance(entry: EquipmentGridEntry) {
  goEnhance(entry)
}

const quickSlotCards = computed(() =>
  inventory.quickSlots.map((slotId, index) => ({
    index,
    itemId: slotId,
    name: quickSlotName(slotId),
    effect: quickSlotEffectText(slotId) || '—',
    quantity: slotId ? inventory.quantity(slotId) : 0,
  })),
)

const selectedSlotLabel = computed(() => {
  if (!selectedSlotKey.value) return ''
  return getSlotKeyLabel(selectedSlotKey.value)
})

watch(
  () => selectedEntry.value?.id ?? null,
  () => {
    feedbackMessage.value = ''
  },
)

function formatQuickSlotOptionLabel(itemId: string) {
  const item = quickSlotOptions.find((option) => option.id === itemId)
  if (!item) return itemId
  return `${item.name}（库存 ${inventory.quantity(item.id)}）`
}

onBeforeUnmount(() => {
  if (lockTimer) window.clearTimeout(lockTimer)
  if (feedbackTimer) window.clearTimeout(feedbackTimer)
})
</script>

<template>
  <section class="panel equipment-shell">
    <div class="equipment-stage">
      <div class="equipment-main">
        <div class="equipment-main__left">
          <div class="paper-doll-wrapper">
            <PaperDollCanvas
              :slots="paperDollSlots"
              :selected-key="selectedSlotKey"
              @select="handleSlotSelect"
            />
          </div>
        </div>

        <div class="equipment-main__right">
          <AttributeOverviewPanel :attributes="attributeOverview" />
          <EquipmentDetailPanel
            :entry="selectedEntry"
            :action-locked="actionLocked"
            :feedback-message="feedbackMessage"
            :feedback-success="feedbackSuccess"
            :show-comparison="false"
            equipped-action="replace"
            :empty-title="selectedSlotLabel ? `${selectedSlotLabel} 未装备` : '未选择装备槽位'"
            empty-action-label="从背包选择装备"
            @unequip="handleUnequip"
            @enhance="handleDetailEnhance"
            @replace="goBackpack"
            @empty-action="goBackpack"
          />
        </div>
      </div>

      <section class="quick-slot-panel">
        <header>
          <h3>战斗中物品</h3>
          <p>战斗中可使用的物品，相同物品会共享冷却时间。</p>
        </header>
        <div class="quick-slot-panel__grid">
          <article
            v-for="slot in quickSlotCards"
            :key="slot.index"
            class="quick-slot-card"
            :class="{ 'quick-slot-card--armed': slot.itemId }"
          >
            <div class="quick-slot-card__head">
              <p class="quick-slot-card__label">槽位 {{ slot.index + 1 }}</p>
              <span class="quick-slot-card__qty">库存 {{ slot.quantity }}</span>
            </div>
            <select
              class="quick-slot-card__select"
              :value="slot.itemId ?? ''"
              @change="handleQuickSlotChange(slot.index, ($event.target as HTMLSelectElement).value)"
            >
              <option value="">空</option>
              <option
                v-for="item in quickSlotOptions"
                :key="item.id"
                :value="item.id"
              >
                {{ formatQuickSlotOptionLabel(item.id) }}
              </option>
            </select>
            <p class="quick-slot-card__effect">效果：{{ slot.effect }}</p>
          </article>
        </div>
      </section>
    </div>
  </section>
</template>

<style scoped>
.equipment-shell {
  padding: 20px;
  border-radius: 28px;
  background: rgba(6, 8, 16, 0.92);
}

.equipment-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}

.equipment-head__meta {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.75);
}

.equipment-stage {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.equipment-main {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  align-items: stretch;
}

.equipment-main__left {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.paper-doll-wrapper {
  height: 100%;
}

.paper-doll-wrapper :deep(.paper-doll) {
  height: 100%;
}

.equipment-main__right {
  display: grid;
  grid-template-rows: auto 1fr;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.quick-slot-panel {
  padding: 16px 20px;
  border-radius: 20px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.quick-slot-panel header h3 {
  margin: 0;
  font-size: 16px;
}

.quick-slot-panel header p {
  margin: 4px 0 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.quick-slot-panel__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.quick-slot-card {
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.quick-slot-card--armed {
  border-color: rgba(123, 220, 158, 0.4);
  background: rgba(123, 220, 158, 0.08);
}

.quick-slot-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.quick-slot-card__label {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
}

.quick-slot-card__qty {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.quick-slot-card__select {
  width: 100%;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
}

.quick-slot-card__name {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.quick-slot-card__effect {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

@media (max-width: 1024px) {
  .equipment-main {
    grid-template-columns: 1fr;
  }
}
</style>
