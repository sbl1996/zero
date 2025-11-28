<script setup lang="ts">
import { computed, ref, watch } from 'vue'
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

interface ActiveHoldState {
  pointerId: number
  slotIndex: number
  itemId: string
  element: HTMLElement | null
}

const activeHold = ref<ActiveHoldState | null>(null)

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
  const nowMs = getNowMs()
  const actionLockUntil = battle.actionLockUntil
  const isActionLocked = actionLockUntil !== null && actionLockUntil > nowMs
  const pending = battle.pendingItemUse
  const pendingItemId = pending?.itemId ?? null
  const pendingProgress = pending?.progress ?? 0

  return inventory.quickSlots.map((id, index) => {
    const itemId = typeof id === 'string' && quickConsumableIds.has(id) ? id : null
    const item = itemId ? ITEMS.find(def => def.id === itemId) : undefined
    const quantity = itemId ? inventory.quantity(itemId) : 0

    const isChanneling = Boolean(pending && itemId && pendingItemId === itemId)
    const lockedByItem = Boolean(pending && !isChanneling)

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
    const cooldownDisplay = cooldown > 0 ? `${cooldown.toFixed(1)}s` : ''

    const styleVars: Record<string, string> = {}
    if (cooldownPercent > 0) {
      const cooldownAngle = Math.round(cooldownPercent * 360 * 100) / 100
      styleVars['--cooldown-angle'] = `${cooldownAngle}deg`
      styleVars['--cooldown-progress'] = `${cooldownPercent}`
    }

    const channelPercent = isChanneling ? Math.max(Math.min(pendingProgress, 1), 0) : 0
    if (isChanneling) {
      styleVars['--channel-progress'] = `${channelPercent}`
    }

    let disabled = false
    let buttonDisabled = false
    let reason = ''
    if (!battle.inBattle || battle.concluded !== 'idle') {
      disabled = true
      buttonDisabled = true
      reason = '未在战斗'
    } else if (!item) {
      disabled = true
      buttonDisabled = true
      reason = '未装备道具'
    } else if (lockedByItem) {
      disabled = true
      buttonDisabled = true
      reason = '正在使用其他道具'
    } else if (isActionLocked) {
      disabled = true
      buttonDisabled = true
      reason = '动作硬直中'
    } else if (quantity <= 0) {
      disabled = true
      buttonDisabled = true
      reason = '库存不足'
    } else if (hasResourceEffect && !effectApplies) {
      disabled = true
      buttonDisabled = true
      reason = '状态已满'
    } else if (cooldown > 0) {
      disabled = true
      buttonDisabled = true
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
    const style = Object.keys(styleVars).length > 0 ? styleVars : undefined

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
      styleVars: style,
      isOnCooldown: cooldown > 0,
      disabled,
      buttonDisabled,
      reason,
      isEmpty: !item,
      tooltip,
      isChanneling,
      lockedByItem,
      channelPercent,
    }
  })
})

function cleanupHold(pointerId?: number, cancel = false) {
  const hold = activeHold.value
  if (!hold) return
  if (typeof pointerId === 'number' && hold.pointerId !== pointerId) return
  if (hold.element && typeof hold.element.releasePointerCapture === 'function') {
    try {
      hold.element.releasePointerCapture(hold.pointerId)
    } catch {
      // Ignore release errors
    }
  }
  activeHold.value = null
  if (cancel) {
    battle.cancelItemUse('cancelled')
  }
}

async function handlePointerDown(event: PointerEvent, slotIndex: number) {
  const slot = slots.value[slotIndex]
  if (!slot || slot.buttonDisabled || !slot.item) return
  if (activeHold.value) return
  event.preventDefault()
  const element = event.currentTarget instanceof HTMLElement ? event.currentTarget : null
  if (element && typeof element.setPointerCapture === 'function') {
    element.setPointerCapture(event.pointerId)
  }
  activeHold.value = {
    pointerId: event.pointerId,
    slotIndex,
    itemId: slot.item.id,
    element,
  }
  try {
    const started = await battle.useItem(slot.item.id)
    if (!started) {
      cleanupHold(event.pointerId, false)
    }
  } catch {
    cleanupHold(event.pointerId, false)
  }
}

function handlePointerUp(event: PointerEvent) {
  cleanupHold(event.pointerId, true)
}

function handlePointerCancel(event: PointerEvent) {
  cleanupHold(event.pointerId, true)
}

watch(
  () => battle.pendingItemUse,
  (pending) => {
    if (pending) return
    cleanupHold(undefined, false)
  },
)
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
        'on-cooldown': slot.isOnCooldown,
        channeling: slot.isChanneling,
        'locked-by-item': slot.lockedByItem
      }"
      type="button"
      :title="slot.tooltip || undefined"
      :style="slot.styleVars"
      :disabled="slot.buttonDisabled"
      @pointerdown="handlePointerDown($event, slot.index)"
      @pointerup="handlePointerUp($event)"
      @pointercancel="handlePointerCancel($event)"
      @pointerleave="handlePointerCancel($event)"
    >
      <template v-if="!slot.isEmpty">
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
          class="quick-item-quantity"
        >
          ×{{ slot.quantity }}
        </span>
      </template>
      <span v-if="slot.cooldown > 0" class="skill-cooldown">{{ slot.cooldownDisplay }}</span>
    </button>
  </div>
</template>
