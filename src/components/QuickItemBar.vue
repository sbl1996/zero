<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ITEMS } from '@/data/items'
import { useBattleStore, ITEM_COOLDOWN } from '@/stores/battle'
import { useInventoryStore } from '@/stores/inventory'
import { usePlayerStore } from '@/stores/player'
import { resolveItemIcon } from '@/utils/itemIcon'

const battle = useBattleStore()
const inventory = useInventoryStore()
const playerStore = usePlayerStore()
const { res } = storeToRefs(playerStore)
const props = withDefaults(defineProps<{
  hotkeys?: readonly string[]
  hotkeyLabels?: readonly string[]
}>(), {
  hotkeys: () => ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4'],
  hotkeyLabels: () => ['NUM1', 'NUM2', 'NUM3', 'NUM4'],
})

const slots = computed(() => {
  const { hp, hpMax, sp, spMax, xp, xpMax } = res.value
  const needsHp = hp < hpMax
  const needsSp = sp < spMax
  const needsXp = xp < xpMax

  return inventory.quickSlots.map((id, index) => {
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

    let healsHp = false
    let restoresSp = false
    let restoresXp = false
    if (item) {
      if ('heal' in item && typeof item.heal === 'number' && item.heal > 0) {
        healsHp = true
      }
      if ('restoreSp' in item && typeof item.restoreSp === 'number' && item.restoreSp > 0) {
        restoresSp = true
      }
      if ('restoreXp' in item && typeof item.restoreXp === 'number' && item.restoreXp > 0) {
        restoresXp = true
      }
    }
    const hasResourceEffect = healsHp || restoresSp || restoresXp
    const effectApplies = !!(
      (healsHp && needsHp) ||
      (restoresSp && needsSp) ||
      (restoresXp && needsXp)
    )

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
    } else if (hasResourceEffect && !effectApplies) {
      disabled = true
      reason = '状态已满'
    } else if (cooldown > 0) {
      disabled = true
      reason = `冷却中 ${cooldown.toFixed(1)}s`
    }

    const label = item?.name ?? '空槽位'
    const effectText = effects.join(' ')
    const tooltipSegments = item
      ? [label, effectText].filter(Boolean)
      : [label]
    if (disabled && reason) {
      tooltipSegments.push(reason)
    }
    const tooltip = tooltipSegments.join(' • ')

    return {
      index,
      id,
      item,
      quantity,
      hotkey: props.hotkeys[index] ?? null,
      hotkeyLabel: props.hotkeyLabels[index] ?? null,
      icon: resolveItemIcon(typeof id === 'string' ? id : null),
      label,
      cooldown,
      cooldownDisplay,
      cooldownStyle,
      isOnCooldown: cooldown > 0,
      disabled,
      reason,
      isEmpty: !item,
      tooltip,
    }
  })
})

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
      :title="slot.tooltip || undefined"
      :style="slot.cooldownStyle"
      :disabled="slot.disabled"
      @click="handleUse(slot.index)"
    >
      <span
        class="quick-item-icon"
        :class="{ 'quick-item-icon--text': slot.icon.type === 'text' }"
      >
        <img
          v-if="slot.icon.type === 'image'"
          :src="slot.icon.src"
          :alt="slot.icon.alt || slot.label"
        >
        <span
          v-else
          class="quick-item-icon__text"
        >
          {{ slot.icon.text }}
        </span>
      </span>
      <span
        v-if="!slot.isEmpty"
        class="quick-item-quantity"
      >
        ×{{ slot.quantity }}
      </span>
      <span v-if="slot.cooldown > 0" class="skill-cooldown">{{ slot.cooldownDisplay }}</span>
    </button>
  </div>
</template>
