<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { ITEMS, quickConsumableIds } from '@/data/items'
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

const getNowMs = () => {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

const slots = computed(() => {
  const { hp, hpMax, qi, qiMax } = res.value
  const needsHp = hp < hpMax
  const needsQi = qi < qiMax
  const actionLockUntil = battle.actionLockUntil
  const nowMs = getNowMs()
  const isActionLocked = actionLockUntil !== null && actionLockUntil > nowMs

  return inventory.quickSlots.map((id, index) => {
    const itemId = typeof id === 'string' && quickConsumableIds.has(id) ? id : null
    const item = itemId ? ITEMS.find(def => def.id === itemId) : undefined
    const quantity = itemId ? inventory.quantity(itemId) : 0
    const effects: string[] = []

    if (item) {
      if ('heal' in item && item.heal) {
        effects.push(`HP+${item.heal}`)
      }
      if ('restoreQi' in item && item.restoreQi) {
        effects.push(`斗气+${item.restoreQi}`)
      }
    }

    let healsHp = false
    let restoresQi = false
    if (item) {
      if ('heal' in item && typeof item.heal === 'number' && item.heal > 0) {
        healsHp = true
      }
      if ('restoreQi' in item && typeof item.restoreQi === 'number' && item.restoreQi > 0) {
        restoresQi = true
      }
    }
    const hasResourceEffect = healsHp || restoresQi
    const effectApplies = !!(
      (healsHp && needsHp) ||
      (restoresQi && needsQi)
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
    } else if (isActionLocked) {
      disabled = true
      reason = '动作硬直中'
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
      id: itemId,
      item,
      quantity,
      hotkey: props.hotkeys[index] ?? null,
      hotkeyLabel: props.hotkeyLabels[index] ?? null,
      icon: resolveItemIcon(itemId),
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
  battle.useItem(slot.item.id).catch(() => {})
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
