<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useBattleStore } from '@/stores/battle'
import { usePlayerStore } from '@/stores/player'
import { useUiStore } from '@/stores/ui'
import { getSkillDefinition } from '@/data/skills'
import { getMonsterMap } from '@/data/monsters'
import type { FloatText, LootResult } from '@/types/domain'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import QuickItemBar from '@/components/QuickItemBar.vue'

const router = useRouter()
const battle = useBattleStore()
const playerStore = usePlayerStore()
const uiStore = useUiStore()

const { res } = storeToRefs(playerStore)
const { enableHoldAutoCast } = storeToRefs(uiStore)

const monster = computed(() => battle.monster)
const lastOutcome = computed(() => battle.lastOutcome)
const lootList = computed(() => battle.loot)
const hpRate = computed(() => (monster.value ? Math.max(0, battle.monsterHp) / monster.value.hpMax : 0))
const monsterAttackCountdownLabel = computed(() => {
  if (!battle.monster || battle.concluded !== 'idle') return '—'
  return `${Math.max(0, battle.monsterTimer).toFixed(2)}s`
})

// Auto-cast state
const autoCastTimers = ref<Map<number, ReturnType<typeof setInterval>>>(new Map())
const autoCastHoldStart = ref<Map<number, number>>(new Map())
const isLongPress = ref<Map<number, boolean>>(new Map())
const AUTO_CAST_DELAY = 1000 // 1 second hold to start auto-casting
const AUTO_CAST_INTERVAL = 200 // 200ms interval between casts

const skillSlots = computed(() => {
  const inBattle = battle.inBattle
  const concluded = battle.concluded
  const { sp, xp } = res.value
  return playerStore.skills.loadout.map((skillId, index) => {
    const skill = getSkillDefinition(skillId)
    const cost = skill?.cost
    const label = skill?.name ?? '空槽'
    const iconSrc = skill?.icon ?? null
    const costLabel = (() => {
      if (!skill) return '未装备'
      if (!cost || cost.type === 'none') return '无消耗'
      const amount = cost.amount ?? 0
      return `${cost.type.toUpperCase()} ${amount}`
    })()

    const cooldown = skill ? (battle.skillCooldowns[index] ?? 0) : 0
    const cooldownDuration = skill?.cooldown ?? 0
    const cooldownPercent = cooldownDuration > 0 ? Math.min(Math.max(cooldown / cooldownDuration, 0), 1) : 0
    const cooldownAngle = Math.round(cooldownPercent * 360 * 100) / 100
    const cooldownDisplay = cooldown > 0 ? `${cooldown.toFixed(1)}s` : ''
    const cooldownStyle = cooldownPercent > 0 ? {
      '--cooldown-angle': `${cooldownAngle}deg`,
      '--cooldown-progress': `${cooldownPercent}`,
    } : undefined

    let disabled = false
    let reason = ''
    if (!inBattle || concluded !== 'idle') {
      disabled = true
      reason = '未在战斗'
    } else if (!skill) {
      disabled = true
      reason = '未装备技能'
    } else if (cooldown > 0) {
      disabled = true
      reason = `冷却中 ${cooldown.toFixed(1)}s`
    } else if (cost?.type === 'sp' && (cost.amount ?? 0) > sp) {
      disabled = true
      reason = 'SP不足'
    } else if (cost?.type === 'xp' && (cost.amount ?? 0) > xp) {
      disabled = true
      reason = 'XP不足'
    }

    // Check if auto-casting is active for this slot
    const isAutoCasting = autoCastTimers.value.has(index)
    const isHolding = autoCastHoldStart.value.has(index) && !isLongPress.value.has(index)

    return {
      index,
      id: skillId,
      label,
      costLabel,
      cooldown,
      cooldownLabel: cooldown > 0 ? `冷却：${cooldown.toFixed(1)}s` : '',
      cooldownDisplay,
      cooldownStyle,
      cooldownPercent,
      isOnCooldown: cooldown > 0,
      disabled,
      reason,
      isEmpty: !skill,
      isAutoCasting,
      isHolding,
      hasImage: Boolean(iconSrc),
      imageSrc: iconSrc,
    }
  })
})
const defaultPlayerPortrait = '/main.webp'
const attackPlayerPortrait = '/main_attack.webp'
const playerPortraitSrc = ref(defaultPlayerPortrait)
let portraitTimer: ReturnType<typeof setTimeout> | null = null

function showAttackPortrait(duration = 800) {
  if (portraitTimer) {
    clearTimeout(portraitTimer)
    portraitTimer = null
  }
  playerPortraitSrc.value = attackPlayerPortrait
  portraitTimer = setTimeout(() => {
    playerPortraitSrc.value = defaultPlayerPortrait
    portraitTimer = null
  }, duration)
}
const monsterPortraitSrc = ref('')
const monsterPortraitError = ref(false)

const updateMonsterPortrait = (monster: any) => {
  if (!monster) {
    monsterPortraitSrc.value = ''
    monsterPortraitError.value = false
    return
  }

  // First try gif, then fallback to webp
  const portrait = `${monster.id}.gif`
  const src = portrait.startsWith('/') ? portrait : `/${portrait}`

  // Store both gif and webp attempts for proper fallback handling
  monsterPortraitSrc.value = src
  monsterPortraitError.value = false
}

const onMonsterPortraitError = () => {
  if (!monster.value || monsterPortraitError.value) return

  // If current image failed, try the alternative format
  if (monsterPortraitSrc.value.endsWith('.gif')) {
    const webpSrc = monsterPortraitSrc.value.replace(/\.gif$/, '.webp')
    monsterPortraitSrc.value = webpSrc
  } else if (monsterPortraitSrc.value.endsWith('.webp')) {
    // If both gif and webp failed, mark as error
    monsterPortraitError.value = true
  }
}

// Watch for monster changes
watch(() => monster.value, (newMonster) => {
  updateMonsterPortrait(newMonster)
}, { immediate: true })

type StyleMap = Record<string, string>

const missFloatStyle: StyleMap = {
  left: '50%',
  top: '50%',
  animation: 'none',
  transform: 'translate(-50%, -50%)',
  fontSize: '26px',
}

function floatTextStyle(text: FloatText): StyleMap {
  if (text.kind === 'miss') {
    return missFloatStyle
  }
  return {
    left: `${text.x * 100}%`,
    top: `${text.y * 100}%`,
  }
}

function lootEntryKey(entry: LootResult, index: number) {
  if (entry.kind === 'equipment') return `equip-${entry.equipment.id}`
  if (entry.kind === 'item') return `item-${entry.itemId}`
  return `gold-${index}-${entry.amount}`
}

function formatLootEntry(entry: LootResult) {
  if (entry.kind === 'item') {
    return `${entry.name} x${entry.quantity}`
  }
  if (entry.kind === 'equipment') {
    const level = entry.equipment.level
    return level > 0 ? `${entry.name} +${level}` : entry.name
  }
  return `${entry.name} +${entry.amount}`
}

function getGoldBonus(lootList: LootResult[]): boolean {
  return lootList.some(entry => entry.kind === 'gold' && entry.hasBonus)
}

function getTotalGold(lootList: LootResult[]): number | null {
  const goldEntry = lootList.find(entry => entry.kind === 'gold')
  return goldEntry ? goldEntry.amount : null
}

function getFilteredLootList(lootList: LootResult[]): LootResult[] {
  return lootList.filter(entry => entry.kind !== 'gold')
}

watch(
  () => battle.flashEffects[battle.flashEffects.length - 1]?.kind,
  (kind) => {
    if (kind === 'attack' || kind === 'skill' || kind === 'ult') {
      showAttackPortrait()
    }
  },
)

// Stop auto-casting when battle ends
watch(
  () => battle.concluded,
  (concluded) => {
    if (concluded !== 'idle') {
      stopAllAutoCast()
    }
  },
)

watch(enableHoldAutoCast, (enabled) => {
  if (!enabled) {
    stopAllAutoCast()
  }
})

function useSkill(slotIndex: number) {
  // Don't use skill if this was a long press that's already being handled
  if (isLongPress.value.has(slotIndex)) {
    // Clear the long press flag after a short delay
    setTimeout(() => {
      isLongPress.value.delete(slotIndex)
    }, 100)
    return
  }
  battle.playerUseSkill(slotIndex)
}

// Auto-cast functions
function startSkillHold(slotIndex: number, event?: MouseEvent | TouchEvent) {
  const slot = skillSlots.value[slotIndex]
  if (!slot || slot.disabled || slot.isEmpty) return

  if (!enableHoldAutoCast.value) return

  // Record when the hold started
  autoCastHoldStart.value.set(slotIndex, Date.now())

  // Set up timer to start auto-casting after delay and prevent default only for long holds
  setTimeout(() => {
    // Check if we're still holding this skill
    if (autoCastHoldStart.value.has(slotIndex)) {
      // Mark this as a long press
      isLongPress.value.set(slotIndex, true)

      // Only prevent default behavior when we're actually starting auto-cast (long hold)
      if (event) {
        event.preventDefault()
      }
      startAutoCast(slotIndex)
    }
  }, AUTO_CAST_DELAY)
}

function startAutoCast(slotIndex: number) {
  if (!enableHoldAutoCast.value) return

  const attempt = (silent = true) => {
    const slot = skillSlots.value[slotIndex]
    if (!slot || slot.isEmpty) {
      stopAutoCast(slotIndex)
      return
    }
    if (battle.concluded !== 'idle') {
      stopAutoCast(slotIndex)
      return
    }
    if (slot.isOnCooldown) {
      return
    }
    if (slot.disabled) {
      stopAutoCast(slotIndex)
      return
    }
    battle.playerUseSkill(slotIndex, { silent })
  }

  // Don't start if there's already an auto-cast timer for this slot
  if (autoCastTimers.value.has(slotIndex)) return

  // Cast the skill immediately (silent to avoid浮动提示)
  attempt(true)

  // Set up interval for repeated casting
  const timer = setInterval(() => {
    attempt(true)
  }, AUTO_CAST_INTERVAL)

  autoCastTimers.value.set(slotIndex, timer)
}

function stopAutoCast(slotIndex: number) {
  // Clear the hold start time
  autoCastHoldStart.value.delete(slotIndex)

  // Clear the long press flag
  isLongPress.value.delete(slotIndex)

  // Clear the auto-cast timer if it exists
  const timer = autoCastTimers.value.get(slotIndex)
  if (timer) {
    clearInterval(timer)
    autoCastTimers.value.delete(slotIndex)
  }
}

function stopAllAutoCast() {
  // Clear all hold start times
  autoCastHoldStart.value.clear()

  // Clear all long press flags
  isLongPress.value.clear()

  // Clear all auto-cast timers
  autoCastTimers.value.forEach((timer) => {
    clearInterval(timer)
  })
  autoCastTimers.value.clear()
}

function backToSelect() {
  stopAllAutoCast()

  // 获取当前战斗的怪物所属的地图
  let targetRoute = '/'
  if (monster.value) {
    const mapId = getMonsterMap(monster.value.id)
    if (mapId) {
      targetRoute = `/map/${mapId}`
    }
  }

  battle.exitBattle()
  router.push(targetRoute)
}

function handleBossPortraitClick() {
  if (!monster.value || !monster.value.isBoss) return
  if (battle.concluded !== 'victory') return

  // Get the current monster before resetting
  const currentMonster = monster.value

  // Reset battle state without restoring resources
  battle.clearRematchTimer()
  battle.start(currentMonster)
}

onBeforeUnmount(() => {
  battle.exitBattle()
  stopAllAutoCast()
  if (portraitTimer) {
    clearTimeout(portraitTimer)
    portraitTimer = null
  }
  playerPortraitSrc.value = defaultPlayerPortrait
})
</script>

<style scoped>
.auto-casting {
  background: linear-gradient(45deg, #ff6b7a, #ff8e53) !important;
  animation: pulse 0.5s infinite alternate;
  transform: scale(1.05);
  box-shadow: 0 0 20px rgba(255, 107, 122, 0.6);
}

.holding {
  background: linear-gradient(45deg, #4ecdc4, #44a3aa) !important;
  animation: pulse 0.3s infinite alternate;
}

.auto-cast-indicator {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 14px;
  animation: spin 1s linear infinite;
}

.hold-indicator {
  position: absolute;
  top: 2px;
  right: 4px;
  font-size: 14px;
}

@keyframes pulse {
  from {
    opacity: 1;
  }
  to {
    opacity: 0.8;
  }
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.battle-actions button {
  position: relative;
  overflow: hidden;
}

.battle-actions button::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: conic-gradient(
    from 0deg,
    rgba(88, 184, 255, 0) 0deg,
    rgba(88, 184, 255, 0) calc(360deg - var(--cooldown-angle, 0deg)),
    rgba(88, 184, 255, 0.82) calc(360deg - var(--cooldown-angle, 0deg)),
    rgba(88, 184, 255, 0.82) 360deg
  );
  opacity: 0;
  transition: opacity 160ms ease, background 120ms linear;
  z-index: 0;
  mix-blend-mode: screen;
}

.battle-actions button.on-cooldown::before {
  opacity: 1;
}

.battle-actions button.on-cooldown {
  border-color: rgba(154, 224, 255, 0.95);
  filter: saturate(1.15) brightness(1.05);
}

.battle-actions button > * {
  position: relative;
  z-index: 1;
}

.skill-cooldown {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 18px;
  font-weight: 600;
  color: #f6fbff;
  text-shadow: 0 0 12px rgba(16, 28, 66, 0.8), 0 0 2px rgba(255, 255, 255, 0.7);
  letter-spacing: 1px;
  pointer-events: none;
}

.boss-portrait {
  cursor: pointer;
  transition: transform 0.2s ease, filter 0.2s ease;
  z-index: 10;
  position: relative;
}

.boss-portrait:hover {
  transform: scale(1.05);
  filter: brightness(1.1) drop-shadow(0 0 8px rgba(255, 215, 0, 0.6));
}

.boss-portrait:active {
  transform: scale(0.98);
}

.boss-portrait.victory-state {
  animation: victory-pulse 2s infinite alternate;
  filter: brightness(1.2) drop-shadow(0 0 12px rgba(255, 215, 0, 0.8));
}

@keyframes victory-pulse {
  from {
    filter: brightness(1.2) drop-shadow(0 0 12px rgba(255, 215, 0, 0.8));
  }
  to {
    filter: brightness(1.4) drop-shadow(0 0 20px rgba(255, 215, 0, 1));
  }
}

.loot-equipment {
  color: #ff6b35 !important;
  font-weight: 700 !important;
  text-shadow: 0 0 8px rgba(255, 107, 53, 0.8) !important;
  animation: equipment-glow 1.5s ease-in-out infinite alternate !important;
}

.loot-normal {
  color: #ffd166;
}

.loot-gold-bonus {
  color: #ff6b35 !important;
  font-weight: 700 !important;
  text-shadow: 0 0 10px rgba(255, 215, 0, 0.9) !important;
  animation: gold-bonus-glow 1.2s ease-in-out infinite alternate !important;
}

@keyframes equipment-glow {
  from {
    text-shadow: 0 0 8px rgba(255, 107, 53, 0.8);
    transform: scale(1);
  }
  to {
    text-shadow: 0 0 16px rgba(255, 107, 53, 1);
    transform: scale(1.05);
  }
}

@keyframes gold-bonus-glow {
  from {
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.9);
    transform: scale(1);
  }
  to {
    text-shadow: 0 0 20px rgba(255, 215, 0, 1);
    transform: scale(1.08);
  }
}
</style>

<template>
  <section v-if="!monster" class="panel" style="text-align: center;">
    <p v-if="battle.concluded === 'victory'">
      战斗胜利！成功击败 {{ lastOutcome?.monsterName ?? '敌人' }}。
    </p>
      <p v-else-if="battle.concluded === 'defeat'">
      战斗失败……未能击败 {{ lastOutcome?.monsterName ?? '敌人' }}。<br>
      <span style="color: #ff6b7a;">死亡惩罚：失去全部经验值和1/3金币，已满状态复活</span>
    </p>
    <p v-else>请选择一名怪物开始战斗。</p>
    <button class="btn" @click="backToSelect">返回怪物列表</button>
  </section>
  <div v-else class="battle-layout">
    <PlayerStatusPanel />

    <section class="panel" style="display: flex; flex-direction: column; gap: 20px;">
      <header class="flex flex-between flex-center">
        <div>
          <h2 class="section-title" style="margin-bottom: 4px;">{{ monster.name }}</h2>
          <div class="text-muted text-small">LV {{ monster.lv }} ｜ 攻击力 {{ monster.atk }} ｜ 防御力 {{ monster.def }}</div>
        </div>
        <div class="text-right">
          <div class="text-small text-muted">奖励：{{ monster.rewardExp }} EXP ・ {{ monster.rewardGold }} GOLD</div>
          <div class="resource-bar" style="width: 200px; margin-top: 8px;">
            <span class="resource-hp" :style="{ width: `${Math.floor(hpRate * 100)}%` }" />
          </div>
          <div class="text-small text-muted" style="margin-top: 4px;">HP {{ battle.monsterHp }} / {{ monster.hpMax }}</div>
        </div>
      </header>

      <div class="float-area">
        <div
          class="battle-portraits"
          :class="{
            'battle-portraits--interactive': monster.isBoss && battle.concluded === 'victory'
          }"
        >
          <img class="battle-portrait player" :src="playerPortraitSrc" alt="主角立绘" />
          <img
            class="battle-portrait enemy"
            :class="{
              'boss-portrait': monster.isBoss,
              'victory-state': monster.isBoss && battle.concluded === 'victory'
            }"
            :src="monsterPortraitSrc"
            :alt="monster.name"
            @error="onMonsterPortraitError"
            @click="handleBossPortraitClick"
          />
        </div>
        <div
          v-for="flash in battle.flashEffects"
          :key="flash.id"
          class="flash-effect"
          :class="`flash-${flash.kind}`"
        >
          <span class="flash-layer flash-layer--core" />
          <span class="flash-layer flash-layer--ring" />
          <span class="flash-layer flash-layer--burst" />
        </div>
        <div
          v-for="text in battle.floatTexts"
          :key="text.id"
          class="float-text"
          :class="text.kind"
          :style="floatTextStyle(text)"
        >
          {{ text.value }}
        </div>
        <div
          v-if="battle.concluded === 'victory'"
          class="float-text"
          style="left: 50%; top: 50%; animation: none; transform: translate(-50%, -50%); font-size: 26px; text-align: center; pointer-events: none;"
        >
          <div>胜利</div>
          <div class="text-small" style="margin-top: 6px;">+ EXP {{ monster?.rewardExp ?? 0 }}</div>
          <div
            class="text-small"
            :class="getGoldBonus(lootList) ? 'loot-gold-bonus' : ''"
            style="margin-top: 6px;"
          >
            + GOLD {{ getTotalGold(lootList) ?? monster?.rewardGold ?? 0 }}
          </div>
          <div v-if="getFilteredLootList(lootList).length" class="text-small" style="margin-top: 8px;">
            <div style="font-weight: 600;">掉落</div>
            <div
              v-for="(entry, index) in getFilteredLootList(lootList)"
              :key="`loot-${lootEntryKey(entry, index)}`"
              :class="entry.kind === 'equipment' ? 'loot-equipment' : 'loot-normal'"
              style="margin-top: 2px;"
            >
              {{ formatLootEntry(entry) }}
            </div>
          </div>
        </div>
        <div v-else-if="battle.concluded === 'defeat'" class="float-text" style="left: 50%; top: 50%; animation: none; transform: translate(-50%, -50%); font-size: 26px; color: #ff6b7a;">
          战败
        </div>
      </div>

      <div class="battle-action-row">
        <div class="battle-actions">
          <button
            v-for="slot in skillSlots"
            :key="slot.index"
            :disabled="slot.disabled"
            :class="{
              empty: slot.isEmpty,
              'auto-casting': slot.isAutoCasting,
              'holding': slot.isHolding,
              'on-cooldown': slot.isOnCooldown,
              'has-image': slot.hasImage
            }"
            :title="slot.reason || undefined"
            :style="slot.cooldownStyle"
            @click="useSkill(slot.index)"
            @mousedown="startSkillHold(slot.index, $event)"
            @mouseup="stopAutoCast(slot.index)"
            @mouseleave="stopAutoCast(slot.index)"
            @touchstart="startSkillHold(slot.index, $event)"
            @touchend="stopAutoCast(slot.index)"
            @touchcancel="stopAutoCast(slot.index)"
          >
            <template v-if="slot.hasImage">
              <div class="skill-image-container">
                <img
                  v-if="slot.imageSrc"
                  :src="slot.imageSrc"
                  :alt="slot.label"
                  class="skill-image"
                >
              </div>
            </template>
            <template v-else>
              <span class="skill-name">{{ slot.label }}</span>
              <span class="skill-cost">{{ slot.costLabel }}</span>
            </template>
            <span v-if="slot.cooldown > 0" class="skill-cooldown">{{ slot.cooldownDisplay }}</span>
            <span v-if="slot.isAutoCasting" class="auto-cast-indicator">🔄</span>
            <span v-else-if="slot.isHolding" class="hold-indicator">⏱️</span>
          </button>
        </div>

        <QuickItemBar class="battle-quick-items" />
      </div>

      <footer class="flex flex-between flex-center">
        <button class="btn" @click="backToSelect">退出战斗</button>
        <div class="text-small text-muted">敌方下一次攻击：{{ monsterAttackCountdownLabel }}</div>
      </footer>
    </section>

    </div>
</template>
