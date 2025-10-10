<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useEnhanceActions } from '@/composables/useEnhanceActions'
import {
  mainEnhanceChance,
  mainEnhanceCost,
  MAX_EQUIP_LEVEL,
  resolveMainStatBreakdown,
} from '@/composables/useEnhance'
import type { Equipment } from '@/types/domain'
import { ITEMS } from '@/data/items'

const player = usePlayerStore()
const inventory = useInventoryStore()
const { attemptMainEnhance } = useEnhanceActions()
const route = useRoute()

const lastMessage = ref<{ text: string; kind: 'success' | 'error' | 'info' } | null>(null)

const itemNameMap = ITEMS.reduce<Record<string, string>>((acc, item) => {
  acc[item.id] = item.name
  return acc
}, {})


type EnhanceEntry = {
  key: string
  equipment: Equipment
  source: 'equipped' | 'inventory'
}
const enhanceEntries = computed<EnhanceEntry[]>(() => {
  const entries: EnhanceEntry[] = []
  Object.entries(player.equips).forEach(([slot, equip]) => {
    if (!equip) return
    entries.push({ key: `equipped-${slot}`, equipment: equip, source: 'equipped' })
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

const selected = computed(() => {
  const key = selectedKey.value
  if (!key) return null
  return enhanceEntries.value.find((entry) => entry.key === key) ?? null
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
  const cost = mainEnhanceCost(equipment.level)
  const chance = mainEnhanceChance(equipment.level)
  const gemStock = inventory.quantity(cost.gemId)
  const blockReason = (() => {
    if (equipment.level >= MAX_EQUIP_LEVEL) return '已达最大强化等级'
    if (player.gold < cost.gold) return '金币不足'
    if (gemStock < 1) return `${itemNameMap[cost.gemId] ?? '宝石'}不足`
    return null
  })()

  return {
    isMax: equipment.level >= MAX_EQUIP_LEVEL,
    current: currentBreakdown,
    next: nextBreakdown,
    diff: { flat: diffFlat, percent: diffPercent, total: diffTotal },
    chance,
    cost,
    gemStock,
    blockReason,
  }
})


function gemName(id: string) {
  return itemNameMap[id] ?? id
}

function makeMessage(text: string, kind: 'success' | 'error' | 'info') {
  lastMessage.value = { text, kind }
}

function handleMainEnhance() {
  const entry = selected.value
  if (!entry) return
  const result = attemptMainEnhance(entry.equipment.id)

  if (!result.ok) {
    const reason = (() => {
      switch (result.reason) {
        case 'max-level':
          return '该装备已经达到最大强化等级。'
        case 'insufficient-gold':
          return '金币不足，无法进行强化。'
        case 'insufficient-gem':
          return `${gemName(result.cost?.gemId ?? '')}不足。`
        case 'not-found':
          return '未找到目标装备。'
        default:
          return '强化失败，发生未知错误。'
      }
    })()
    makeMessage(reason, 'error')
    return
  }

  if (result.success) {
    makeMessage(`强化成功！等级从 +${result.levelBefore} 提升到 +${result.levelAfter}。`, 'success')
  } else {
    makeMessage(`强化失败，等级下降至 +${result.levelAfter}.`, 'error')
  }
}


function mainButtonDisabled() {
  if (!selected.value) return true
  return Boolean(mainInfo.value?.blockReason)
}

function mainButtonHint() {
  if (!selected.value) return '请选择装备后进行强化。'
  return mainInfo.value?.blockReason ?? ''
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`
}

function formatPercentDelta(value: number) {
  const percent = Math.round(value * 100)
  const prefix = percent >= 0 ? '+' : ''
  return `${prefix}${percent}%`
}

function formatFlatDelta(value: number) {
  const prefix = value >= 0 ? '+' : ''
  return `${prefix}${value}`
}

function formatChance(chance: number | undefined) {
  if (chance === undefined) return '-'
  return `${Math.round(chance * 100)}%`
}

const materialOverview = computed(() => [
  { id: 'blessGem', name: gemName('blessGem'), qty: inventory.quantity('blessGem') },
  { id: 'soulGem', name: gemName('soulGem'), qty: inventory.quantity('soulGem') },
  { id: 'miracleGem', name: gemName('miracleGem'), qty: inventory.quantity('miracleGem') },
])
</script>

<template>
  <section class="panel">
    <h2 class="section-title">装备强化</h2>
    <p class="text-muted text-small">使用宝石与金币强化装备主属性。</p>

    <div class="panel" style="margin-top: 12px; background: rgba(255,255,255,0.04);">
      <div class="flex flex-between flex-center" style="gap: 16px;">
        <div class="text-small">当前 GOLD：<strong>{{ player.gold }}</strong></div>
        <div class="flex" style="gap: 16px; flex-wrap: wrap;">
          <span v-for="item in materialOverview" :key="item.id" class="text-small text-muted">
            {{ item.name }}：{{ item.qty }}
          </span>
        </div>
      </div>
    </div>

    <div class="panel" style="background: rgba(255,255,255,0.04); margin-top: 20px; min-height: 320px;">
      <template v-if="selected && mainInfo">
        <header style="display: flex; justify-content: space-between; align-items: baseline; gap: 12px;">
          <div>
            <h3 class="section-title" style="font-size: 18px; margin-bottom: 4px;">{{ selected.equipment.name }}</h3>
            <p class="text-small text-muted" style="margin: 0;">
              来源：{{ selected.source === 'equipped' ? '已装备' : '仓库物品' }}
            </p>
          </div>
        </header>

        <p class="text-small text-muted" style="margin: 12px 0 0;">
          若需更换强化目标，请返回背包选择其他装备后点击“强化”。
        </p>

        <div class="enhance-stats-grid">
          <section class="enhance-stats-card">
            <h4 class="text-small enhance-stats-title">主属性</h4>
            <div class="panel enhance-stats-panel">
              <div class="enhance-main-header">
                <span class="badge">当前 +{{ selected.equipment.level }}</span>
              </div>
              <div class="enhance-main-grid text-small">
                <span>
                  当前值：<strong>{{ mainInfo.current.total }}</strong>
                  <span class="text-muted" style="margin-left: 8px;">
                    基础 {{ mainInfo.current.base }} + 固定 {{ mainInfo.current.flat }}，百分比 {{ formatPercent(mainInfo.current.percent) }}
                  </span>
                </span>
                <span class="text-muted">
                  下级预览：{{ mainInfo.next.total }}
                  <template v-if="!mainInfo.isMax">
                    （固定 {{ formatFlatDelta(mainInfo.diff.flat) }}，百分比 {{ formatPercentDelta(mainInfo.diff.percent) }}，总值 {{ formatFlatDelta(mainInfo.diff.total) }}，成功率 {{ formatChance(mainInfo.chance) }}）
                  </template>
                  <template v-else>
                    （已达最大强化等级）
                  </template>
                </span>
                <span v-if="!mainInfo.isMax" class="text-muted">
                  下一等级固定值 {{ mainInfo.next.flat }}，百分比 {{ formatPercent(mainInfo.next.percent) }}
                </span>
                <span class="text-muted">
                  消耗：{{ mainInfo.cost.gold }} G + {{ gemName(mainInfo.cost.gemId) }} ×1
                </span>
              </div>
              <button
                class="btn enhance-stats-action"
                :class="{ disabled: mainButtonDisabled() }"
                :disabled="mainButtonDisabled()"
                @click="handleMainEnhance"
              >
                强化主属性
              </button>
              <p v-if="mainButtonDisabled()" class="text-small text-muted" style="margin-top: 4px;">
                {{ mainButtonHint() }}
              </p>
            </div>
          </section>
        </div>
      </template>
      <template v-else-if="!hasAnyEquipment">
        <p class="text-small text-muted" style="margin: 0;">暂无装备可供强化，请先收集装备。</p>
      </template>
      <template v-else-if="!selectedKey">
        <p class="text-small text-muted" style="margin: 0;">请返回背包，选择装备后点击“强化”进入此界面。</p>
      </template>
      <template v-else>
        <p class="text-small text-muted" style="margin: 0;">未找到目标装备，可能已被出售、拆解或卸下。</p>
      </template>
    </div>

    <div class="panel" style="margin-top: 20px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px;">强化记录</h3>
      <div v-if="lastMessage" :class="['text-small', lastMessage.kind === 'success' ? 'text-success' : lastMessage.kind === 'error' ? 'text-danger' : 'text-muted']">
        {{ lastMessage.text }}
      </div>
      <div v-else class="text-small text-muted">尚无强化记录。</div>
    </div>
  </section>
</template>

<style scoped>
.enhance-stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 20px;
  margin-top: 16px;
  align-items: start;
}

.enhance-stats-card {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.enhance-stats-title {
  margin: 0;
}

.enhance-stats-panel {
  background: rgba(0, 0, 0, 0.2);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.enhance-main-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.enhance-main-header {
  display: flex;
  justify-content: flex-start;
  margin-bottom: 4px;
}

.enhance-stats-action {
  align-self: flex-start;
}


@media (max-width: 640px) {
  .enhance-stats-grid {
    grid-template-columns: 1fr;
  }

  .enhance-main-grid {
    grid-template-columns: 1fr;
  }

  .enhance-main-header {
    justify-content: flex-start;
  }
}
</style>
