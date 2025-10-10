<script setup lang="ts">
import { computed } from 'vue'
import { ITEMS } from '@/data/items'
import { useBattleStore } from '@/stores/battle'
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

    return {
      index,
      id,
      item,
      quantity,
      icon: getIcon(typeof id === 'string' ? id : null),
      label: item?.name ?? '空槽位',
      effectText: effects.join(' '),
      disabled:
        !battle.inBattle ||
        battle.concluded !== 'idle' ||
        battle.turn !== 'player' ||
        !item ||
        quantity <= 0,
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
      :class="{ disabled: slot.disabled }"
      type="button"
      @click="handleUse(slot.index)"
    >
      <div class="quick-item-info">
        <span>{{ slot.label }}</span>
        <span v-if="slot.effectText" class="quick-item-quantity">{{ slot.effectText }}</span>
        <span class="quick-item-quantity">库存：{{ slot.quantity }}</span>
      </div>
      <span class="quick-item-icon">{{ slot.icon }}</span>
    </button>
  </div>
</template>
