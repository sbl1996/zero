<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { ITEMS, quickConsumableIds } from '@/data/items'
import { resolveMainStatBreakdown } from '@/composables/useEnhance'
import { getEquipmentStatLabel, formatEquipmentSubstats, getEquipmentQualityMeta } from '@/utils/equipmentStats'
import type { EquipmentSubStat } from '@/types/domain'

const player = usePlayerStore()
const inventory = useInventoryStore()
const router = useRouter()

const slots = [
  ['helmet', '头盔'],
  ['shieldL', '左手盾牌'],
  ['weaponR', '右手武器'],
  ['weapon2H', '双手武器'],
  ['armor', '铠甲'],
  ['ring1', '戒指 1'],
  ['ring2', '戒指 2'],
] as const

const equipList = computed(() =>
  slots.map(([key, label]) => {
    const item = player.equips[key]
    const breakdown = item ? resolveMainStatBreakdown(item)[0] ?? null : null
    const qualityMeta = item ? getEquipmentQualityMeta(item.quality) : null
    return { key, label, item, breakdown, qualityMeta }
  }),
)

const quickSlotOptions = ITEMS.filter(item => quickConsumableIds.has(item.id))

function handleQuickSlotChange(index: number, value: string) {
  inventory.setQuickSlot(index, value.length > 0 ? value : null)
}

function formatPercent(value: number | undefined | null) {
  if (value === null || value === undefined) return ''
  return `${Math.round(value * 100)}%`
}

function quickSlotEffectText(itemId: string | null) {
  if (!itemId) return ''
  const item = quickSlotOptions.find(option => option.id === itemId)
  if (!item) return ''
  const effects: string[] = []
  if ('heal' in item && item.heal) effects.push(`HP+${item.heal}`)
  if ('restoreQi' in item && item.restoreQi) effects.push(`斗气+${item.restoreQi}`)
  return effects.join(' ')
}

function formatSubStats(substats: EquipmentSubStat[] | undefined | null) {
  if (!substats) return '无'
  const stats = formatEquipmentSubstats(substats)
  return stats.length > 0 ? stats.join(', ') : '无'
}

function goEnhance(slotKey: typeof slots[number][0]) {
  router.push({ name: 'enhance', params: { entryKey: `equipped-${slotKey}` } })
}
</script>

<template>
  <section class="panel">
    <h2 class="section-title">装备</h2>
    <p class="text-muted text-small">当前穿戴的装备与其属性加成，后续换装功能将从背包中选择装备进行替换。</p>

    <div class="panel equipment-table-panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <div class="equipment-table-wrapper">
        <table class="stat-table equipment-table">
        <thead>
          <tr>
            <th>部位</th>
            <th>名称</th>
            <th>强化等级</th>
            <th>主属性</th>
            <th>副属性</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="slot in equipList" :key="slot.key">
            <td>{{ slot.label }}</td>
            <td>
              <template v-if="slot.item">
                <div class="equip-name-cell">
                  <div class="equip-name">
                    <span class="equip-name__text" :style="{ color: slot.qualityMeta?.color }">
                      {{ slot.item.name }}
                    </span>
                  </div>
                  <button
                    class="btn btn-secondary enhance-button"
                    type="button"
                    @click="goEnhance(slot.key)"
                  >
                    强化
                  </button>
                </div>
              </template>
              <template v-else>未装备</template>
            </td>
            <td>{{ slot.item ? `+${slot.item.level}` : '-' }}</td>
            <td>
              <template v-if="slot.item && slot.breakdown">
                <span>{{ getEquipmentStatLabel(slot.breakdown.key) }} {{ slot.breakdown.total }}</span>
                <span class="text-muted text-tiny" style="display: block;">
                  基础 {{ slot.breakdown.base }} + 固定 {{ slot.breakdown.flat }}，百分比 {{ formatPercent(slot.breakdown.percent) }}
                </span>
              </template>
              <template v-else-if="slot.item && slot.item.mainStat">
                <span>{{ getEquipmentStatLabel(slot.item.mainStat.type) }} {{ slot.item.mainStat.value }}</span>
              </template>
              <template v-else>-</template>
            </td>
            <td>
              <template v-if="slot.item">
                <span class="text-small">{{ formatSubStats(slot.item.substats) }}</span>
              </template>
              <template v-else>-</template>
            </td>
          </tr>
        </tbody>
        </table>
      </div>
    </div>

    <div class="panel" style="margin-top: 16px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px;">快捷物品栏</h3>
      <div
        v-for="(slotId, index) in inventory.quickSlots"
        :key="index"
        class="quick-slot-row"
      >
        <label :for="`quick-slot-${index}`" class="text-small quick-slot-label">槽位 {{ index + 1 }}</label>
        <select
          :id="`quick-slot-${index}`"
          class="quick-slot-select"
          :value="slotId ?? ''"
          @change="handleQuickSlotChange(index, ($event.target as HTMLSelectElement).value)"
        >
          <option value="">空</option>
          <option v-for="item in quickSlotOptions" :key="item.id" :value="item.id">
            {{ item.name }}（库存 {{ inventory.quantity(item.id) }}）
          </option>
        </select>
        <div class="text-small text-muted quick-slot-meta">效果 {{ quickSlotEffectText(slotId) || '—' }}</div>
        <div class="text-small text-muted quick-slot-meta">当前 {{ slotId ? inventory.quantity(slotId) : 0 }}</div>
      </div>
      <div class="text-small text-muted">提示：可在此处预设战斗中使用的药水，空槽位将不会在战斗界面显示。</div>
    </div>
  </section>
</template>

<style scoped>
.equipment-table-wrapper {
  overflow-x: auto;
}

.equipment-table {
  min-width: 520px;
}

.equip-name-cell {
  display: flex;
  align-items: center;
  gap: 12px;
}

.equip-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
}

.equip-name__text {
  font-weight: inherit;
}

.equip-quality-tag {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.05);
}

.enhance-button {
  padding: 6px 12px;
  font-size: 12px;
}

.quick-slot-row {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 12px;
}

.quick-slot-label {
  font-weight: 600;
}

.quick-slot-select {
  padding: 6px 8px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(0, 0, 0, 0.35);
  color: #fff;
}

.quick-slot-meta {
  text-align: right;
}

@media (max-width: 640px) {
  .equipment-table {
    min-width: 100%;
  }

  .quick-slot-row {
    grid-template-columns: 1fr;
    gap: 8px;
    align-items: stretch;
  }

  .quick-slot-meta {
    text-align: left;
  }
}
</style>
