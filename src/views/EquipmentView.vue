<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { ITEMS, consumableIds } from '@/data/items'
import { resolveMainStatBreakdown } from '@/composables/useEnhance'

const player = usePlayerStore()
const inventory = useInventoryStore()

const slots = [
  ['helmet', '头盔'],
  ['shieldL', '左手盾牌'],
  ['weaponR', '右手武器'],
  ['weapon2H', '双手武器'],
  ['armor', '铠甲'],
  ['gloves', '手套'],
  ['belt', '腰带'],
  ['ring', '戒指'],
  ['boots', '鞋子'],
] as const

const statLabels = {
  ATK: '攻击力',
  DEF: '防御力',
  HP: '生命值',
} as const

const equipList = computed(() =>
  slots.map(([key, label]) => {
    const item = player.equips[key]
    const breakdown = item ? resolveMainStatBreakdown(item)[0] ?? null : null
    return { key, label, item, breakdown }
  }),
)

const quickSlotOptions = ITEMS.filter(item => consumableIds.has(item.id))

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
  if ('restoreSp' in item && item.restoreSp) effects.push(`SP+${item.restoreSp}`)
  if ('restoreXp' in item && item.restoreXp) effects.push(`XP+${item.restoreXp}`)
  return effects.join(' ')
}

function formatSubStats(subs: Record<string, number>) {
  const stats: string[] = []
  if (subs.addATK) stats.push(`攻击力 +${subs.addATK}`)
  if (subs.addDEF) stats.push(`防御力 +${subs.addDEF}`)
  if (subs.addHP) stats.push(`生命值 +${subs.addHP}`)
  return stats.length > 0 ? stats.join(', ') : '无'
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
            <th>等级</th>
            <th>主属性</th>
            <th>副属性</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="slot in equipList" :key="slot.key">
            <td>{{ slot.label }}</td>
            <td>{{ slot.item ? slot.item.name : '未装备' }}</td>
            <td>{{ slot.item ? `+${slot.item.level}` : '-' }}</td>
            <td>
              <template v-if="slot.item && slot.breakdown">
                <span>{{ statLabels[slot.breakdown.key] }} {{ slot.breakdown.total }}</span>
                <span class="text-muted text-tiny" style="display: block;">
                  基础 {{ slot.breakdown.base }} + 固定 {{ slot.breakdown.flat }}，百分比 {{ formatPercent(slot.breakdown.percent) }}
                </span>
              </template>
              <template v-else-if="slot.item">
                <span v-if="slot.item.mainStat.ATK">攻击力 {{ slot.item.mainStat.ATK }}</span>
                <span v-else-if="slot.item.mainStat.DEF">防御力 {{ slot.item.mainStat.DEF }}</span>
                <span v-else-if="slot.item.mainStat.HP">HP {{ slot.item.mainStat.HP }}</span>
              </template>
              <template v-else>-</template>
            </td>
            <td>
              <template v-if="slot.item">
                <span class="text-small">{{ formatSubStats(slot.item.subs) }}</span>
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
