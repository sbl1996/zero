<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import EquipmentGrid from '@/components/equipment/EquipmentGrid.vue'
import AttributeOverviewPanel from '@/components/equipment/AttributeOverviewPanel.vue'
import EquipmentDetailPanel from '@/components/equipment/EquipmentDetailPanel.vue'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useEquipmentActions } from '@/composables/useEquipmentActions'
import { useEquipmentSelection } from '@/composables/useEquipmentSelection'
import { ITEMS, consumableIds } from '@/data/items'
import { CORE_SHARD_BASE_ID } from '@/data/cultivationCores'
import { resolveItemIcon, textIcon } from '@/utils/itemIcon'
import { createEquipmentGridEntry, type EquipmentEntryBuilderContext } from '@/utils/equipmentEntry'
import type { ItemIcon } from '@/utils/itemIcon'
import type { EquipSlotKey, Equipment } from '@/types/domain'
import type { EquipmentGridEntry, EquipmentSubType } from '@/types/equipment-ui'

const inventory = useInventoryStore()
const player = usePlayerStore()
const router = useRouter()
const { requestEquip, requestUnequip } = useEquipmentActions()
const {
  attributeOverviewForEquipment,
  getSlotLabel,
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

type BackpackEntryType = 'potion' | 'coreShard' | 'material' | 'unknown'

interface BackpackStackEntry {
  id: string
  type: BackpackEntryType
  name: string
  quantity: number
  icon: ItemIcon
  detail: string
}

const itemMeta = ITEMS.reduce<Record<string, { type: BackpackEntryType; name: string; detail?: string }>>((acc, def) => {
  const type: BackpackEntryType = (() => {
    if (consumableIds.has(def.id)) return 'potion'
    if (def.id.startsWith(CORE_SHARD_BASE_ID)) return 'coreShard'
    return 'material'
  })()
  const detail = 'description' in def && def.description ? def.description : 'usage' in def ? def.usage : undefined
  acc[def.id] = { type, name: def.name, detail }
  return acc
}, {})

function iconForStack(id: string): ItemIcon {
  const icon = resolveItemIcon(id)
  if (icon.type === 'text' && icon.text === '⬜') {
    return textIcon('📦')
  }
  return icon
}

const stackEntries = computed<BackpackStackEntry[]>(() =>
  Object.entries(inventory.stacks)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => {
      const meta = itemMeta[id]
      const type = meta?.type ?? 'unknown'
      return {
        id,
        type,
        name: meta?.name ?? id,
        quantity,
        icon: iconForStack(id),
        detail: meta?.detail ?? '暂无描述',
      }
    }),
)

type EquipmentFilterId = 'all-equipment' | 'equipped' | EquipmentSubType
type StackFilterId = 'potion' | 'coreShard' | 'material'
type InventoryFilterId = EquipmentFilterId | StackFilterId

const inventoryFilterOptions: Array<{ value: InventoryFilterId; label: string; kind: 'equipment' | 'stack' }> = [
  { value: 'all-equipment', label: '全部装备', kind: 'equipment' },
  { value: 'equipped', label: '已穿戴', kind: 'equipment' },
  { value: 'weapon', label: '武器', kind: 'equipment' },
  { value: 'armor', label: '防具', kind: 'equipment' },
  { value: 'accessory', label: '饰品', kind: 'equipment' },
  { value: 'shield', label: '盾牌', kind: 'equipment' },
  { value: 'potion', label: '药水', kind: 'stack' },
  { value: 'coreShard', label: '晶核', kind: 'stack' },
  { value: 'material', label: '材料', kind: 'stack' },
]

const inventoryFilter = ref<InventoryFilterId>('all-equipment')
const viewingStacks = computed(() => inventoryFilter.value === 'potion' || inventoryFilter.value === 'coreShard' || inventoryFilter.value === 'material')
const activeStackFilter = computed<StackFilterId | null>(() => (viewingStacks.value ? (inventoryFilter.value as StackFilterId) : null))
const activeEquipmentFilter = computed<EquipmentFilterId>(() =>
  viewingStacks.value ? 'all-equipment' : (inventoryFilter.value as EquipmentFilterId),
)

function createEquipmentEntry(
  equipment: Equipment,
  source: 'inventory' | 'equipped',
  slotKey?: EquipSlotKey,
): EquipmentGridEntry {
  const meta = inventory.equipmentMeta[equipment.id]
  return createEquipmentGridEntry(equipment, entryContext, {
    source,
    slotKey,
    meta,
  })
}

const inventoryEquipmentEntries = computed(() => inventory.equipment.map((equipment) => createEquipmentEntry(equipment, 'inventory')))
const equippedEquipmentEntries = computed(() =>
  Object.entries(player.equips)
    .filter((entry): entry is [EquipSlotKey, Equipment] => Boolean(entry[1]))
    .map(([slotKey, equipment]) => createEquipmentEntry(equipment, 'equipped', slotKey)),
)

const qualityRank: Record<string, number> = {
  epic: 4,
  excellent: 3,
  rare: 2,
  fine: 1,
  normal: 0,
}

function sortEquipmentEntries(entries: EquipmentGridEntry[]): EquipmentGridEntry[] {
  return [...entries].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'equipped' ? -1 : 1
    }
    if (a.level !== b.level) {
      return b.level - a.level
    }
    const qualityDelta = (qualityRank[b.quality] ?? 0) - (qualityRank[a.quality] ?? 0)
    if (qualityDelta !== 0) return qualityDelta
    return b.name.localeCompare(a.name, 'zh-CN')
  })
}

const sortedEquipmentEntries = computed(() =>
  sortEquipmentEntries([...equippedEquipmentEntries.value, ...inventoryEquipmentEntries.value]),
)

const filteredEquipmentEntries = computed(() => {
  if (viewingStacks.value) return []
  const list = sortedEquipmentEntries.value
  if (activeEquipmentFilter.value === 'all-equipment') return list
  if (activeEquipmentFilter.value === 'equipped') return list.filter((entry) => entry.source === 'equipped')
  return list.filter((entry) => entry.subType === activeEquipmentFilter.value)
})

const selectedEntryId = ref<string | null>(null)

watch(
  filteredEquipmentEntries,
  (entries) => {
    if (!entries.length) {
      selectedEntryId.value = null
      return
    }
    if (!entries.some((entry) => entry.id === selectedEntryId.value)) {
      const first = entries[0]
      selectedEntryId.value = first ? first.id : null
    }
  },
  { immediate: true },
)

const selectedEntry = computed(() => filteredEquipmentEntries.value.find((entry) => entry.id === selectedEntryId.value) ?? null)

watch(selectedEntry, (entry) => {
  if (entry?.source === 'inventory') {
    inventory.markEquipmentSeen(entry.id)
  }
})

const stackByFilter = computed(() => {
  return stackEntries.value.reduce<Record<StackFilterId, BackpackStackEntry[]>>(
    (acc, entry) => {
      if (entry.type === 'potion') acc.potion.push(entry)
      else if (entry.type === 'coreShard') acc.coreShard.push(entry)
      else acc.material.push(entry)
      return acc
    },
    { potion: [], coreShard: [], material: [] },
  )
})

const visibleStacks = computed(() => {
  const filter = activeStackFilter.value
  if (!filter) return []
  return stackByFilter.value[filter]
})

const viewingEquipment = computed(() => !viewingStacks.value)
const activeFilterLabel = computed(() => inventoryFilterOptions.find((option) => option.value === inventoryFilter.value)?.label ?? '')

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

onBeforeUnmount(() => {
  if (lockTimer) {
    window.clearTimeout(lockTimer)
  }
  if (feedbackTimer) {
    window.clearTimeout(feedbackTimer)
  }
})

function enhanceEntryKey(entry: EquipmentGridEntry): string {
  if (entry.source === 'equipped') {
    const slotId = entry.slotKey ?? entry.slot
    return `equipped-${slotId}`
  }
  const index = inventory.equipment.findIndex((candidate) => candidate.id === entry.id)
  const suffix = index >= 0 ? index : entry.id
  return `inventory-${suffix}`
}

function goEnhance(entry: EquipmentGridEntry) {
  const key = enhanceEntryKey(entry)
  router.push({ name: 'enhance', params: { entryKey: key } })
}

function handleEquip(equipment: Equipment) {
  if (!isRealmRequirementMet(getEquipmentRequiredRealmTier(equipment))) {
    showFeedback('境界不足，无法穿戴', false)
    return
  }
  withActionLock(() => {
    const result = requestEquip(equipment.id)
    if (result.ok) {
      const replacedNames = result.unequipped.map((item) => item.name)
      const replacedText = replacedNames.length > 0 ? `（替换：${replacedNames.join('、')}）` : ''
      showFeedback(`已穿戴 ${result.equipped.name}${replacedText}`, true)
    } else if (result.reason === 'already-equipped' && result.slot) {
      showFeedback('该装备已穿戴', false)
    } else {
      showFeedback('装备失败，请稍后再试', false)
    }
  })
}

function handleUnequip(slot: EquipSlotKey) {
  withActionLock(() => {
    const result = requestUnequip(slot)
    if (result.ok) {
      showFeedback(`已卸下 ${result.equipment.name}`, true)
    } else {
      showFeedback('该槽位没有装备', false)
    }
  })
}

function handleDiscard(equipment: Equipment) {
  if (actionLocked.value) return
  if (window.confirm(`确定要丢弃 ${equipment.name}？此操作无法撤销。`)) {
    withActionLock(() => {
      const success = inventory.discardEquipment(equipment.id)
      if (success) {
        showFeedback(`已丢弃 ${equipment.name}`, true)
      }
    })
  }
}

function handleStackUse(itemId: string, itemName: string) {
  withActionLock(async () => {
    if (!consumableIds.has(itemId)) return
    const used = inventory.spend(itemId, 1)
    if (!used) {
      showFeedback('库存不足', false)
      return
    }

    const effectApplied = await player.useItem(itemId)
    if (!effectApplied) {
      inventory.add(itemId, 1)
      showFeedback('状态已满，无需使用', false)
      return
    }

    showFeedback(`已使用 ${itemName}`, true)
  })
}

function canUsePotion(itemId: string): boolean {
  if (!consumableIds.has(itemId)) return false
  const def = ITEMS.find((item) => item.id === itemId)
  if (!def) return false
  if ('heal' in def && def.heal && def.heal > 0 && player.res.hp < player.res.hpMax) return true
  if ('restoreQi' in def && def.restoreQi && def.restoreQi > 0 && player.res.qi < player.res.qiMax) return true
  if ('breakthroughMethod' in def && def.breakthroughMethod) return true
  return false
}

function handleGridEnter(entry: EquipmentGridEntry | null) {
  if (!entry) return
  if (entry.source === 'inventory') {
    handleEquip(entry.equipment)
  } else if (entry.slotKey) {
    handleUnequip(entry.slotKey)
  }
}

function handleEntryUnequip(entry: EquipmentGridEntry) {
  if (!entry.slotKey) return
  handleUnequip(entry.slotKey)
}

const displayAttributeOverview = computed(() =>
  attributeOverviewForEquipment(selectedEntry.value?.equipment ?? null, { slotKey: selectedEntry.value?.slotKey }),
)
</script>

<template>
  <section class="panel inventory-shell">
    <div class="inventory-stage">
      <div class="inventory-stage__left">
        <div class="inventory-nav">
          <button
            v-for="option in inventoryFilterOptions"
            :key="option.value"
            class="inventory-tab"
            type="button"
            :class="{ 'inventory-tab--active': inventoryFilter === option.value }"
            @click="inventoryFilter = option.value"
          >
            {{ option.label }}
          </button>
        </div>

        <EquipmentGrid
          v-if="viewingEquipment"
          :items="filteredEquipmentEntries"
          :filters="[]"
          :filter="activeEquipmentFilter"
          :selected-id="selectedEntryId"
          @select="selectedEntryId = $event"
          @enter="handleGridEnter"
        />

        <section v-else class="stack-panel">
          <header class="stack-panel__header">
            <div>
              <p class="stack-panel__title">{{ activeFilterLabel }}</p>
            </div>
          </header>

          <div class="stack-panel__body stack-panel__body--inline">
            <div v-if="visibleStacks.length > 0" class="stack-grid">
              <article v-for="entry in visibleStacks" :key="entry.id" class="stack-card">
                <div class="stack-card__header">
                  <div class="stack-card__icon">
                    <img
                      v-if="entry.icon.type === 'image'"
                      :src="entry.icon.src"
                      :alt="entry.icon.alt || entry.name"
                    >
                    <span v-else>{{ entry.icon.text }}</span>
                  </div>
                  <p class="stack-card__name">{{ entry.name }}</p>
                </div>
                <p class="stack-card__detail">{{ entry.detail }}</p>
                <div class="stack-card__footer">
                  <p class="stack-card__quantity">库存：{{ entry.quantity }}</p>
                  <button
                    v-if="entry.type === 'potion'"
                    class="stack-card__button"
                    type="button"
                    :disabled="actionLocked || entry.quantity <= 0 || !canUsePotion(entry.id)"
                    @click="handleStackUse(entry.id, entry.name)"
                  >
                    使用
                  </button>
                </div>
              </article>
            </div>
            <p v-else class="stack-panel__empty">当前筛选下暂无物品</p>
          </div>
        </section>
      </div>

      <div v-if="viewingEquipment" class="inventory-stage__right">
        <AttributeOverviewPanel :attributes="displayAttributeOverview" />
        <EquipmentDetailPanel
          :entry="selectedEntry"
          :action-locked="actionLocked"
          :feedback-message="feedbackMessage"
          :feedback-success="feedbackSuccess"
          @equip="handleEquip($event.equipment)"
          @unequip="handleEntryUnequip($event)"
          @enhance="goEnhance($event)"
          @discard="handleDiscard($event.equipment)"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.inventory-shell {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.inventory-stage {
  display: flex;
  flex-direction: row;
  gap: 20px;
}

.inventory-stage__left {
  flex: 1.1;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.inventory-nav {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.inventory-tab {
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  font-size: 13px;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.inventory-tab--active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.inventory-stage__right {
  flex: 0.9;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.stack-panel {
  padding: 16px;
  border-radius: 20px;
  background: rgba(6, 8, 14, 0.8);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.stack-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.stack-panel__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.stack-panel__subtitle {
  margin: 4px 0 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
}

.stack-panel__body {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stack-panel__body--inline {
  padding-top: 4px;
}

.stack-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}

.stack-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  min-height: 168px;
}

.stack-card__header {
  display: flex;
  gap: 10px;
  align-items: center;
}

.stack-card__icon {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
}

.stack-card__icon img {
  width: 34px;
  height: 34px;
  object-fit: contain;
}

.stack-card__name {
  margin: 0;
  font-size: 15px;
}

.stack-card__detail {
  margin: 0;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  flex: 1;
}

.stack-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.stack-card__quantity {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.stack-card__button {
  border-radius: 999px;
  border: 1px solid rgba(125, 224, 148, 0.4);
  padding: 6px 16px;
  background: rgba(125, 224, 148, 0.16);
  color: #fff;
  cursor: pointer;
}

.stack-panel__empty {
  text-align: center;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

@media (max-width: 960px) {
  .inventory-stage {
    flex-direction: column;
  }

  .stack-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }
}
</style>
