<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useInventoryStore } from '@/stores/inventory'
import { useBattleStore } from '@/stores/battle'
import { ITEMS, consumableIds } from '@/data/items'
import { resolveItemIcon } from '@/utils/itemIcon'

const props = withDefaults(
  defineProps<{
    allowAllocation?: boolean
  }>(),
  {
    allowAllocation: false,
  },
)

const emit = defineEmits<{
  (e: 'open-allocate'): void
}>()

const playerStore = usePlayerStore()
const inventory = useInventoryStore()
const battle = useBattleStore()

const { res, finalStats, expRequired, lv, exp, unspentPoints, gold, equipStats } = storeToRefs(playerStore)

const hpRate = computed(() => (res.value.hpMax > 0 ? res.value.hp / res.value.hpMax : 0))
const spRate = computed(() => (res.value.spMax > 0 ? res.value.sp / res.value.spMax : 0))
const xpRate = computed(() => (res.value.xpMax > 0 ? res.value.xp / res.value.xpMax : 0))
const expProgress = computed(() => (expRequired.value === 0 ? 0 : Math.min(1, exp.value / expRequired.value)))

const attributeRows = computed(() => {
  const entries = [
    { key: 'ATK', label: '攻击力', equipKey: 'addATK' },
    { key: 'DEF', label: '防御力', equipKey: 'addDEF' },
  ] as const

  return entries.map(({ key, label, equipKey }) => {
    const finalValue = finalStats.value[key]
    const equipBonus = equipKey ? equipStats.value[equipKey] ?? 0 : 0
    return {
      key,
      label,
      finalValue,
      equipBonus,
    }
  })
})

function handleOpenAllocate() {
  if (!props.allowAllocation || unspentPoints.value <= 0) return
  emit('open-allocate')
}

// 计算可用的消耗品道具
const availableConsumables = computed(() => {
  const { hp, hpMax, sp, spMax, xp, xpMax } = res.value
  const needsHp = hp < hpMax
  const needsSp = sp < spMax
  const needsXp = xp < xpMax

  return ITEMS.filter(item => consumableIds.has(item.id)).map(item => {
    const quantity = inventory.quantity(item.id)
    const healsHp = 'heal' in item && typeof item.heal === 'number' && item.heal > 0 && needsHp
    const restoresSp = 'restoreSp' in item && typeof item.restoreSp === 'number' && item.restoreSp > 0 && needsSp
    const restoresXp = 'restoreXp' in item && typeof item.restoreXp === 'number' && item.restoreXp > 0 && needsXp
    const effectApplies = healsHp || restoresSp || restoresXp
    const canUse = quantity > 0 && effectApplies && !battle.inBattle

    return {
      ...item,
      quantity,
      canUse,
      disabled: !canUse,
      icon: resolveItemIcon(item.id),
    }
  })
})

// 使用道具函数（仅在非战斗状态使用）
function useItem(itemId: string) {
  const item = availableConsumables.value.find(i => i.id === itemId)
  if (!item || item.disabled) return

  // 非战斗状态下的道具使用逻辑
  const used = inventory.spend(itemId, 1)
  if (!used) return

  const consumable = item as any
  if (consumable.heal) {
    playerStore.heal(consumable.heal)
  }
  if (consumable.restoreSp) {
    playerStore.restoreSp(consumable.restoreSp)
  }
  if (consumable.restoreXp) {
    playerStore.restoreXp(consumable.restoreXp)
  }
}

// 获取道具效果描述
function getItemEffect(item: any) {
  const effects = []
  const consumable = item as any
  if (consumable.heal) effects.push(`HP+${consumable.heal}`)
  if (consumable.restoreSp) effects.push(`SP+${consumable.restoreSp}`)
  if (consumable.restoreXp) effects.push(`XP+${consumable.restoreXp}`)
  return effects.join(' ')
}
</script>

<template>
  <aside class="panel">
    <h2 class="section-title">角色状态</h2>
    <div class="flex flex-between gap-sm">
      <div>
        <div>LV {{ lv }}</div>
        <template v-if="allowAllocation">
          <div
            v-if="unspentPoints > 0"
            class="unspent-points"
            role="button"
            tabindex="0"
            @click="handleOpenAllocate"
            @keyup.enter="handleOpenAllocate"
          >
            可分配点数：{{ unspentPoints }}
          </div>
          <div v-else class="text-muted text-small">可分配点数：{{ unspentPoints }}</div>
        </template>
        <div v-else class="text-muted text-small">可分配点数：{{ unspentPoints }}</div>
      </div>
      <div class="text-right">
        <div>{{ gold }} G</div>
      </div>
    </div>
    <div style="margin-top: 16px;">
      <div class="resource-bar" style="margin-bottom: 10px;">
        <span class="resource-hp" :style="{ width: `${Math.floor(hpRate * 100)}%` }" />
      </div>
      <div class="text-small text-muted">HP {{ res.hp }} / {{ res.hpMax }}</div>

      <div class="resource-bar" style="margin: 14px 0 10px;">
        <span class="resource-sp" :style="{ width: `${Math.floor(spRate * 100)}%` }" />
      </div>
      <div class="text-small text-muted">SP {{ res.sp }} / {{ res.spMax }}</div>

      <div class="resource-bar" style="margin: 14px 0 10px;">
        <span class="resource-xp" :style="{ width: `${Math.floor(xpRate * 100)}%` }" />
      </div>
      <div class="text-small text-muted">XP {{ res.xp }} / {{ res.xpMax }}</div>

      <div class="resource-bar" style="margin: 14px 0 10px;">
        <span class="resource-exp" :style="{ width: `${Math.floor(expProgress * 100)}%` }" />
      </div>
      <div class="text-small text-muted">经验值 {{ exp }} / {{ expRequired }}</div>
    </div>

    <div class="attribute-section">
      <h3 class="section-title attribute-title">属性详情</h3>
      <table class="stat-table">
        <tbody>
          <tr v-for="stat in attributeRows" :key="stat.key">
            <td>{{ stat.label }}</td>
            <td class="stat-value">
              <span class="stat-final">{{ stat.finalValue }}</span>
              <span
                class="stat-equip"
                :class="{
                  'stat-equip--positive': stat.equipBonus > 0,
                  'stat-equip--negative': stat.equipBonus < 0,
                  'stat-equip--zero': stat.equipBonus === 0,
                }"
              >
                ({{ stat.equipBonus >= 0 ? `+${stat.equipBonus}` : stat.equipBonus }})
              </span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="panel" style="margin-top: 20px; background: rgba(255,255,255,0.04);">
      <h3 class="section-title" style="font-size: 16px; margin-top: 0;">快速道具栏</h3>
      <div class="quick-items-grid">
        <button
          v-for="item in availableConsumables"
          :key="item.id"
          class="quick-item-button"
          :class="{ disabled: item.disabled }"
          type="button"
          :disabled="item.disabled"
          @click="useItem(item.id)"
          :title="`${item.name} - ${(item as any).description || ''} ${getItemEffect(item)}`"
        >
          <div class="quick-item-content">
            <span class="quick-item-icon">
              <img
                v-if="item.icon.type === 'image'"
                :src="item.icon.src"
                :alt="item.icon.alt || item.name"
              >
              <span v-else>{{ item.icon.text }}</span>
            </span>
            <div class="quick-item-info">
              <div class="quick-item-name">{{ item.name }}</div>
              <div class="quick-item-effect">{{ getItemEffect(item) }}</div>
            </div>
          </div>
          <div class="quick-item-quantity">×{{ item.quantity }}</div>
        </button>
      </div>
    </div>

    <slot />
  </aside>
</template>

<style scoped>
.stat-value {
  display: flex;
  justify-content: flex-end;
  align-items: baseline;
  gap: 6px;
  font-variant-numeric: tabular-nums;
}

.stat-equip {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.stat-equip--positive {
  color: #5ad398;
}

.stat-equip--negative {
  color: #ff7b7b;
}

.stat-equip--zero {
  color: rgba(255, 255, 255, 0.45);
}

/* 快速道具栏样式 */
.quick-items-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.quick-item-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 8px 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
  font-size: 14px;
}

.quick-item-button:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.quick-item-button:active:not(.disabled) {
  transform: translateY(0);
  background: rgba(255, 255, 255, 0.15);
}

.quick-item-button.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.quick-item-content {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.quick-item-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 26px;
  line-height: 1;
}

.quick-item-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.quick-item-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.quick-item-name {
  font-weight: 600;
  font-size: 15px;
}

.quick-item-effect {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  font-weight: 500;
}

.quick-item-quantity {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: static;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(255, 255, 255, 0.1);
  padding: 3px 6px;
  border-radius: 12px;
  min-width: 32px;
  text-align: center;
  flex-shrink: 0;
  opacity: 1;
  visibility: visible;
  margin-left: 8px;
}

.quick-items-hint {
  text-align: center;
  font-style: italic;
}

.attribute-section {
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.attribute-title {
  font-size: 16px;
  margin-bottom: 12px;
}

/* 响应式调整 */
@media (max-width: 768px) {
  .quick-item-button {
    padding: 8px;
  }

  .quick-item-icon {
    width: 28px;
    height: 28px;
    font-size: 22px;
  }

  .quick-item-name {
    font-size: 14px;
  }

  .quick-item-effect {
    font-size: 11px;
  }
}
</style>
