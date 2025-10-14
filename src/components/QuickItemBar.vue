<script setup lang="ts">
import { computed } from 'vue'
import { ITEMS } from '@/data/items'
import { useBattleStore, ITEM_COOLDOWN } from '@/stores/battle'
import { useInventoryStore } from '@/stores/inventory'

const battle = useBattleStore()
const inventory = useInventoryStore()

function getIcon(id: string | null) {
  switch (id) {
    case 'potionHP':
      return '🧪'
    case 'potionSP':
      return '✨'
    case 'potionXP':
      return '💥'
    default:
      return '⬜'
  }
}

const slots = computed(() =>
  inventory.quickSlots.map((id, index) => {
    const item = typeof id === 'string' ? ITEMS.find(def => def.id === id) : undefined
    const quantity = item ? inventory.quantity(item.id) : 0
    const effects: string[] = []

    if (item) {
      if ('heal' in item && item.heal) {
        effects.push(`HP+${item.heal}`)
      }
      if ('restoreSp' in item && item.restoreSp) {
        effects.push(`SP+${item.restoreSp}`)
      }
      if ('restoreXp' in item && item.restoreXp) {
        effects.push(`XP+${item.restoreXp}`)
      }
    }

    const cooldown = item ? (battle.itemCooldowns[item.id] ?? 0) : 0
    const cooldownPercent = ITEM_COOLDOWN > 0 ? Math.min(Math.max(cooldown / ITEM_COOLDOWN, 0), 1) : 0
    const cooldownAngle = Math.round(cooldownPercent * 360 * 100) / 100
    const cooldownDisplay = cooldown > 0 ? `${cooldown.toFixed(1)}s` : ''
    const cooldownStyle = cooldownPercent > 0
      ? {
          '--cooldown-angle': `${cooldownAngle}deg`,
          '--cooldown-progress': `${cooldownPercent}`,
        }
      : undefined

    let disabled = false
    let reason = ''
    if (!battle.inBattle || battle.concluded !== 'idle') {
      disabled = true
      reason = '未在战斗'
    } else if (!item) {
      disabled = true
      reason = '未装备道具'
    } else if (quantity <= 0) {
      disabled = true
      reason = '库存不足'
    } else if (cooldown > 0) {
      disabled = true
      reason = `冷却中 ${cooldown.toFixed(1)}s`
    }

    return {
      index,
      id,
      item,
      quantity,
      icon: getIcon(typeof id === 'string' ? id : null),
      label: item?.name ?? '空槽位',
      effectText: effects.join(' '),
      cooldown,
      cooldownDisplay,
      cooldownStyle,
      isOnCooldown: cooldown > 0,
      disabled,
      reason,
      isEmpty: !item,
    }
  }),
)

function handleUse(slotIndex: number) {
  const slot = slots.value[slotIndex]
  if (!slot || slot.disabled || !slot.item) return
  battle.useItem(slot.item.id)
}
</script>

<template>
  <div class="quick-item-bar">
    <button
      v-for="slot in slots"
      :key="slot.index"
      class="quick-item-slot"
      :class="{
        disabled: slot.disabled,
        empty: slot.isEmpty,
        'on-cooldown': slot.isOnCooldown
      }"
      type="button"
      :title="slot.reason || undefined"
      :style="slot.cooldownStyle"
      :disabled="slot.disabled"
      @click="handleUse(slot.index)"
    >
      <span class="quick-item-icon">{{ slot.icon }}</span>
      <span class="quick-item-name">{{ slot.label }}</span>
      <span v-if="slot.effectText" class="quick-item-effect">{{ slot.effectText }}</span>
      <span class="quick-item-stock">库存：{{ slot.quantity }}</span>
      <span v-if="slot.cooldown > 0" class="skill-cooldown">{{ slot.cooldownDisplay }}</span>
    </button>
  </div>
</template>
