<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { useEquipmentActions } from '@/composables/useEquipmentActions'
import { resolveMainStatBreakdown } from '@/composables/useEnhance'
import { ITEMS, consumableIds } from '@/data/items'
import { BASE_EQUIPMENT_TEMPLATES } from '@/data/equipment'
import { resolveItemIcon, textIcon } from '@/utils/itemIcon'
import type { ItemIcon } from '@/utils/itemIcon'
import type { EquipSlot, EquipSubStats, Equipment } from '@/types/domain'

const inventory = useInventoryStore()
const player = usePlayerStore()
const { requestEquip, requestUnequip } = useEquipmentActions()
const router = useRouter()

type BackpackEntryType = 'consumable' | 'material' | 'equipment' | 'unknown'
type EquipmentSubType = 'weapon' | 'armor' | 'accessory' | 'shield'

interface BackpackStackEntry {
  kind: 'stack'
  type: BackpackEntryType
  id: string
  name: string
  quantity: number
  icon: ItemIcon
  detail: string
}

interface BackpackEquipmentEntry {
  kind: 'equipment'
  type: 'equipment'
  subType: EquipmentSubType
  source: 'inventory' | 'equipped'
  id: string
  name: string
  icon: ItemIcon
  level: number
  slot: EquipSlot
  slotLabel: string
  mainDetail: string
  subDetails: string[]
  requiredLevel?: number
  equipment: Equipment
}

type BackpackEntry = BackpackStackEntry | BackpackEquipmentEntry

const slotLabels: Record<EquipSlot, string> = {
  helmet: '头盔',
  shieldL: '左手盾牌',
  weaponR: '右手武器',
  weapon2H: '双手武器',
  armor: '铠甲',
  gloves: '手套',
  belt: '腰带',
  ring: '戒指',
  boots: '鞋子',
}

function iconForStack(id: string): ItemIcon {
  const icon = resolveItemIcon(id)
  if (icon.type === 'text' && icon.text === '⬜') {
    return textIcon('📦')
  }
  return icon
}

function getEquipmentSubType(slot: EquipSlot): EquipmentSubType {
  switch (slot) {
    case 'weaponR':
    case 'weapon2H':
      return 'weapon'
    case 'helmet':
    case 'armor':
    case 'gloves':
    case 'boots':
      return 'armor'
    case 'ring':
    case 'belt':
      return 'accessory'
    case 'shieldL':
      return 'shield'
    default:
      return 'armor' // 默认归类为防具
  }
}

function getEquipmentSubTypeLabel(subType: EquipmentSubType): string {
  switch (subType) {
    case 'weapon':
      return '武器'
    case 'armor':
      return '防具'
    case 'accessory':
      return '饰品'
    case 'shield':
      return '盾牌'
    default:
      return '其他'
  }
}

function iconForSlot(slot: EquipSlot): ItemIcon {
  switch (slot) {
    case 'helmet':
      return textIcon('🎩')
    case 'shieldL':
      return textIcon('🛡️')
    case 'weaponR':
    case 'weapon2H':
      return textIcon('⚔️')
    case 'armor':
      return textIcon('🦺')
    case 'gloves':
      return textIcon('🧤')
    case 'belt':
      return textIcon('👔')
    case 'ring':
      return textIcon('💍')
    case 'boots':
      return textIcon('👢')
    default:
      return textIcon('📦')
  }
}

const itemMeta = ITEMS.reduce<Record<string, { type: BackpackEntryType; name: string; detail?: string }>>((acc, def) => {
  const type: BackpackEntryType = consumableIds.has(def.id) ? 'consumable' : 'material'
  const detail = 'description' in def && def.description ? def.description : 'usage' in def ? def.usage : undefined
  acc[def.id] = { type, name: def.name, detail }
  return acc
}, {})

function formatMainStat(equipment: Equipment): string {
  const breakdowns = resolveMainStatBreakdown(equipment)
  if (breakdowns.length === 0) return '主要属性 —'

  const breakdown = breakdowns[0]!
  const statLabel = breakdown.key === 'ATK' ? '攻击力' : breakdown.key === 'DEF' ? '防御力' : '生命值'
  const increase = breakdown.total - breakdown.base

  return `${statLabel} ${breakdown.total} (+${increase})`
}

function getMainStatTooltip(equipment: Equipment): string {
  const breakdowns = resolveMainStatBreakdown(equipment)
  if (breakdowns.length === 0) return ''

  const breakdown = breakdowns[0]!
  const increase = breakdown.total - breakdown.base
  const percentIncrease = Math.round((increase / breakdown.base) * 100)

  return `基础: ${breakdown.base}, 强化加成: +${increase} (+${percentIncrease}%)`
}

function formatSubs(subs: EquipSubStats): string[] {
  const entries: string[] = []
  if (subs.addATK) entries.push(`追加攻击力 +${subs.addATK}`)
  if (subs.addDEF) entries.push(`追加防御力 +${subs.addDEF}`)
  if (subs.addHP) entries.push(`追加生命值 +${subs.addHP}`)
  return entries.length > 0 ? entries : ['无']
}

function getEquipmentRequiredLevel(equipment: Equipment): number | undefined {
  // 先尝试直接用装备ID查找模板（适用于起始装备等基础装备）
  let template = BASE_EQUIPMENT_TEMPLATES.find(t => t.id === equipment.id)

  // 如果找不到，说明可能是带时间戳和索引的装备ID，需要提取基础模板ID
  if (!template) {
    const parts = equipment.id.split('-')

    // 处理BOSS掉落装备的ID格式：templateId-drop-timestamp-index
    // 需要移除 "-drop-timestamp-index" 部分
    const dropIndex = parts.indexOf('drop')
    if (dropIndex !== -1 && parts.length >= dropIndex + 3) {
      const baseId = parts.slice(0, dropIndex).join('-')
      template = BASE_EQUIPMENT_TEMPLATES.find(t => t.id === baseId)
    }
    // 如果不是BOSS掉落格式，尝试原来的逻辑（templateId-timestamp-index）
    else if (parts.length >= 3) {
      const baseId = parts.slice(0, -2).join('-')
      template = BASE_EQUIPMENT_TEMPLATES.find(t => t.id === baseId)
    }
  }

  // 如果仍然找不到模板，返回undefined（这样就不会显示需求等级）
  if (!template) {
    console.warn(`Equipment template not found for ID: ${equipment.id}`)
    return undefined
  }

  return template.requiredLevel
}

const stackEntries = computed<BackpackStackEntry[]>(() =>
  Object.entries(inventory.stacks)
    .filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => {
      const meta = itemMeta[id]
      const type = meta?.type ?? 'unknown'
      return {
        kind: 'stack' as const,
        type,
        id,
        name: meta?.name ?? id,
        quantity,
        icon: iconForStack(id),
        detail: meta?.detail ?? '暂无描述',
      }
    }),
)

const equipmentEntries = computed<BackpackEquipmentEntry[]>(() =>
  inventory.equipment.map((equipment) => ({
    kind: 'equipment' as const,
    type: 'equipment' as const,
    subType: getEquipmentSubType(equipment.slot),
    source: 'inventory' as const,
    id: equipment.id,
    name: equipment.name,
    icon: iconForSlot(equipment.slot),
    level: equipment.level,
    slot: equipment.slot,
    slotLabel: slotLabels[equipment.slot] ?? equipment.slot,
    mainDetail: formatMainStat(equipment),
    subDetails: formatSubs(equipment.subs),
    requiredLevel: getEquipmentRequiredLevel(equipment),
    equipment,
  })),
)

const equippedEntries = computed<BackpackEquipmentEntry[]>(() =>
  Object.values(player.equips)
    .filter((equipment): equipment is Equipment => Boolean(equipment))
    .map((equipment) => ({
      kind: 'equipment' as const,
      type: 'equipment' as const,
      subType: getEquipmentSubType(equipment.slot),
      source: 'equipped' as const,
      id: equipment.id,
      name: equipment.name,
      icon: iconForSlot(equipment.slot),
      level: equipment.level,
      slot: equipment.slot,
      slotLabel: slotLabels[equipment.slot] ?? equipment.slot,
      mainDetail: formatMainStat(equipment),
      subDetails: formatSubs(equipment.subs),
      requiredLevel: getEquipmentRequiredLevel(equipment),
      equipment,
    })),
)

const typeOrder: Record<BackpackEntryType, number> = {
  consumable: 0,
  material: 1,
  equipment: 2,
  unknown: 3,
}

function compareBackpackEntries(a: BackpackEntry, b: BackpackEntry): number {
  const typeDelta = typeOrder[a.type] - typeOrder[b.type]
  if (typeDelta !== 0) return typeDelta

  if (a.kind === 'equipment' && b.kind === 'equipment') {
    const sourceDelta = a.source === b.source ? 0 : a.source === 'equipped' ? -1 : 1
    if (sourceDelta !== 0) return sourceDelta

    const requiredA = a.requiredLevel ?? -1
    const requiredB = b.requiredLevel ?? -1
    if (requiredA !== requiredB) return requiredB - requiredA

    if (a.level !== b.level) return b.level - a.level
  }

  return a.name.localeCompare(b.name, 'zh-CN')
}

const allEntries = computed<BackpackEntry[]>(() => {
  const combinedEquipment = [...equippedEntries.value, ...equipmentEntries.value]
  return [...stackEntries.value, ...combinedEquipment].sort(compareBackpackEntries)
})

const filterOptions = [
  { value: 'all', label: '全部' },
  { value: 'consumable', label: '消耗品' },
  { value: 'material', label: '宝石' },
  { value: 'equipment', label: '装备' },
  { value: 'weapon', label: '武器' },
  { value: 'armor', label: '防具' },
  { value: 'accessory', label: '饰品' },
  { value: 'shield', label: '盾牌' },
] as const

type FilterId = typeof filterOptions[number]['value']

const filter = ref<FilterId>('all')

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

onBeforeUnmount(() => {
  if (lockTimer) {
    window.clearTimeout(lockTimer)
  }
  if (feedbackTimer) {
    window.clearTimeout(feedbackTimer)
  }
})

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

function enhanceEntryKey(entry: BackpackEquipmentEntry): string {
  if (entry.source === 'equipped') {
    return `equipped-${entry.slot}`
  }
  const index = inventory.equipment.indexOf(entry.equipment)
  const suffix = index >= 0 ? index : entry.equipment.id
  return `inventory-${suffix}`
}

function goEnhance(entry: BackpackEquipmentEntry) {
  const key = enhanceEntryKey(entry)
  router.push({ name: 'enhance', params: { entryKey: key } })
}

function handleEquip(equipment: Equipment) {
  withActionLock(() => {
    const result = requestEquip(equipment.id)
    if (result.ok) {
      const replacedNames = result.unequipped.map((item) => item.name)
      const replacedText = replacedNames.length > 0 ? `（替换：${replacedNames.join('、')}）` : ''
      showFeedback(`已穿戴 ${result.equipped.name}${replacedText}`, true)
    } else {
      if (result.reason === 'level-too-low') {
        showFeedback(`等级不足，需求 LV${result.requiredLevel}`, false)
      } else if (result.reason === 'already-equipped' && result.slot) {
        showFeedback('该装备已穿戴', false)
      } else {
        showFeedback('装备失败，请稍后再试', false)
      }
    }
  })
}

function handleUnequip(slot: EquipSlot) {
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

function currentEquipmentName(slot: EquipSlot) {
  const equipped = player.equips[slot]
  return equipped ? `${equipped.name}（+${equipped.level}）` : '未装备'
}

function handleUseItem(itemId: string, itemName: string) {
  withActionLock(() => {
    const used = inventory.spend(itemId, 1)
    if (!used) {
      showFeedback('库存不足', false)
      return
    }

    const effectApplied = player.useItem(itemId)
    if (!effectApplied) {
      // Return the item if no effect was applied
      inventory.add(itemId, 1)
      showFeedback('状态已满，无需使用', false)
      return
    }

    showFeedback(`已使用 ${itemName}`, true)
  })
}

function canUseConsumable(itemId: string): boolean {
  const def = ITEMS.find(item => item.id === itemId)
  if (!def) return false

  // Check if item has any restorative effects
  if ('heal' in def && def.heal && def.heal > 0 && player.res.hp < player.res.hpMax) {
    return true
  }
  if ('restoreSp' in def && def.restoreSp && def.restoreSp > 0 && player.res.sp < player.res.spMax) {
    return true
  }
  if ('restoreXp' in def && def.restoreXp && def.restoreXp > 0 && player.res.xp < player.res.xpMax) {
    return true
  }

  return false
}

const filteredEntries = computed(() => {
  if (filter.value === 'all') return allEntries.value

  // 处理主要类型筛选
  if (['consumable', 'material', 'equipment'].includes(filter.value)) {
    return allEntries.value.filter((entry) => entry.type === filter.value)
  }

  // 处理装备子类型筛选
  return allEntries.value.filter((entry) => {
    if (entry.kind === 'equipment') {
      return entry.subType === filter.value
    }
    return false
  })
})

function entryTypeLabel(type: BackpackEntryType): string {
  switch (type) {
    case 'consumable':
      return '消耗品'
    case 'material':
      return '宝石'
    case 'equipment':
      return '装备'
    default:
      return '其他'
  }
}
</script>

<template>
  <section class="panel">
    <h2 class="section-title">背包</h2>
    <p class="text-muted text-small">查看当前持有的道具、宝石与备用装备，可用于战斗、强化或后续换装。</p>

    <div class="panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <div class="filter-row">
        <span class="text-small text-muted">按类型筛选：</span>
        <div class="filter-buttons">
          <button
            v-for="option in filterOptions"
            :key="option.value"
            class="filter-button"
            :class="{ active: filter === option.value }"
            type="button"
            @click="filter = option.value"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div
        class="feedback-banner"
        :class="[
          feedbackMessage ? (feedbackSuccess ? 'feedback-success' : 'feedback-error') : 'feedback-empty',
          !feedbackMessage && 'feedback-placeholder'
        ]"
      >
        {{ feedbackMessage }}
      </div>

      <div v-if="filteredEntries.length > 0" class="inventory-grid">
        <article v-for="entry in filteredEntries" :key="entry.id" class="inventory-card">
          <header class="inventory-card__header">
            <div class="inventory-card__icon">
              <img
                v-if="entry.icon.type === 'image'"
                :src="entry.icon.src"
                :alt="entry.icon.alt || entry.name"
              >
              <span v-else>{{ entry.icon.text }}</span>
            </div>
            <div>
              <div class="inventory-card__name">{{ entry.name }}</div>
              <div class="inventory-card__meta text-small text-muted">
                <template v-if="entry.kind === 'equipment' && entry.source === 'equipped'">已穿戴装备</template>
                <template v-else-if="entry.kind === 'equipment'">{{ getEquipmentSubTypeLabel(entry.subType) }}</template>
                <template v-else>{{ entryTypeLabel(entry.type) }}</template>
              </div>
            </div>
          </header>

          <template v-if="entry.kind === 'stack'">
            <div class="inventory-card__body">
              <div class="text-small">库存：{{ entry.quantity }}</div>
              <div class="text-small text-muted" style="margin-top: 4px;">{{ entry.detail }}</div>
              <div v-if="entry.type === 'consumable'" class="inventory-card__actions">
                <button
                  class="use-button"
                  type="button"
                  :disabled="actionLocked || entry.quantity <= 0 || !canUseConsumable(entry.id)"
                  @click="handleUseItem(entry.id, entry.name)"
                >使用</button>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="inventory-card__body">
              <div class="text-small">部位：{{ entry.slotLabel }}</div>
              <div v-if="entry.requiredLevel && entry.requiredLevel > 0" class="text-small" :class="{ 'text-warning': player.lv < entry.requiredLevel }">
                需求等级：{{ entry.requiredLevel }}
              </div>
              <div class="text-small">等级：+{{ entry.level }}</div>
              <div class="text-small" style="margin-top: 6px;" :title="getMainStatTooltip(entry.equipment)">
                {{ entry.mainDetail }}
              </div>
              <ul class="inventory-card__list">
                <li v-for="line in entry.subDetails" :key="line" class="text-small text-muted">{{ line }}</li>
              </ul>
              <div v-if="entry.source === 'inventory'" class="inventory-card__current text-small text-muted">
                当前：{{ currentEquipmentName(entry.slot) }}
              </div>
              <div v-else class="inventory-card__state text-small text-muted">状态：已穿戴</div>
              <div class="inventory-card__actions">
                <button
                  class="enhance-button"
                  type="button"
                  @click="goEnhance(entry)"
                >强化</button>
                <template v-if="entry.source === 'inventory'">
                  <button
                    class="equip-button"
                    type="button"
                    :disabled="actionLocked || (entry.requiredLevel !== undefined && player.lv < entry.requiredLevel)"
                    @click="handleEquip(entry.equipment)"
                  >穿戴</button>
                  <button
                    class="discard-button"
                    type="button"
                    :disabled="actionLocked"
                    @click="handleDiscard(entry.equipment)"
                  >丢弃</button>
                </template>
                <template v-else>
                  <button
                    class="unequip-button"
                    type="button"
                    :disabled="actionLocked"
                    @click="handleUnequip(entry.slot)"
                  >卸下</button>
                </template>
              </div>
            </div>
          </template>
        </article>
      </div>
      <div v-else class="text-small text-muted" style="padding: 12px; text-align: center;">背包暂时为空，快去冒险或商店补给吧！</div>
    </div>
  </section>
</template>

<style scoped>
.filter-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.filter-buttons {
  display: flex;
  gap: 8px;
}

.filter-button {
  padding: 6px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.2);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.filter-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.filter-button.active {
  background: rgba(255, 255, 255, 0.18);
  border-color: rgba(255, 255, 255, 0.4);
}

.inventory-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

@media (max-width: 768px) {
  .inventory-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 480px) {
  .inventory-grid {
    grid-template-columns: 1fr;
  }
}

.inventory-card {
  background: rgba(0, 0, 0, 0.25);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 12px;
}

.inventory-card__header {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

.inventory-card__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 24px;
  line-height: 1;
}

.inventory-card__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.inventory-card__name {
  font-weight: 600;
}

.inventory-card__body {
  line-height: 1.6;
}

.inventory-card__list {
  margin: 8px 0 0;
  padding-left: 18px;
}

.inventory-card__list li {
  margin-bottom: 4px;
}

.inventory-card__current {
  margin-top: 8px;
}

.inventory-card__state {
  margin-top: 8px;
}

.inventory-card__actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

.equip-button,
.unequip-button,
.enhance-button,
.use-button {
  flex: 1;
  padding: 6px 0;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s ease;
}

.equip-button:hover,
.unequip-button:hover,
.enhance-button:hover,
.use-button:hover {
  background: rgba(255, 255, 255, 0.12);
}

.equip-button:disabled,
.unequip-button:disabled,
.enhance-button:disabled,
.use-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.enhance-button {
  border-color: rgba(255, 215, 0, 0.35);
  background: rgba(255, 215, 0, 0.2);
  color: #fff6d5;
}

.enhance-button:hover {
  background: rgba(255, 215, 0, 0.28);
}

.use-button {
  border-color: rgba(76, 175, 80, 0.35);
  background: rgba(76, 175, 80, 0.2);
  color: #e8f5e8;
}

.use-button:hover {
  background: rgba(76, 175, 80, 0.32);
}

.discard-button {
  border-color: rgba(244, 67, 54, 0.35);
  background: rgba(244, 67, 54, 0.2);
  color: #ffcdd2;
}

.discard-button:hover {
  background: rgba(244, 67, 54, 0.32);
}

.feedback-banner {
  margin-bottom: 12px;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  min-height: 37px; /* 固定高度防止跳动 */
  display: flex;
  align-items: center;
  transition: all 0.3s ease;
}

.feedback-success {
  background: rgba(76, 175, 80, 0.2);
  border: 1px solid rgba(76, 175, 80, 0.35);
  color: #e8f5e8;
}

.feedback-error {
  background: rgba(244, 67, 54, 0.2);
  border: 1px solid rgba(244, 67, 54, 0.35);
  color: #ffcdd2;
}

.feedback-empty {
  background: transparent;
  border: 1px solid transparent;
  color: transparent;
}

.text-warning {
  color: #ffc107;
}

.text-tiny {
  font-size: 11px;
  opacity: 0.8;
}
</style>
