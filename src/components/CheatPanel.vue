<script setup lang="ts">
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '@/stores/player'
import { useProgressStore } from '@/stores/progress'
import { useUiStore } from '@/stores/ui'

const playerStore = usePlayerStore()
const progressStore = useProgressStore()
const ui = useUiStore()
const { showCheatPanel, enableHoldAutoCast, autoRematchAfterVictory } = storeToRefs(ui)

const goldAmount = ref(1000)
const upgradingRealm = ref(false)

const sanitizedGold = computed(() => {
  const value = Math.floor(goldAmount.value)
  return Number.isFinite(value) && value > 0 ? value : 0
})

const isRealmMaxed = computed(() => {
  const realm = playerStore.cultivation.realm
  return realm.tier === 'sanctuary' && realm.phase === 'limit'
})

function close() {
  ui.toggleCheatPanel(false)
}

function restoreFull() {
  playerStore.restoreFull()
}

function grantGold() {
  if (sanitizedGold.value <= 0) return
  playerStore.gainGold(sanitizedGold.value)
}

function unlockAllMonsters() {
  progressStore.clearAllMonsters()
}

function deleteSave() {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.clear()
  } catch (error) {
    console.warn('[cheat] failed to clear localStorage', error)
  }
  window.location.reload()
}

function handleAutoCastToggle(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  ui.toggleHoldAutoCast(target.checked)
}

function handleAutoRematchToggle(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  ui.toggleAutoRematch(target.checked)
}

async function advanceRealmDirectly() {
  if (upgradingRealm.value || isRealmMaxed.value) return
  upgradingRealm.value = true
  try {
    await playerStore.cheatAdvanceRealm()
  } finally {
    upgradingRealm.value = false
  }
}

function fillBasePower() {
  playerStore.cheatFillBasePower()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="showCheatPanel" class="cheat-overlay" @click.self="close">
      <div class="cheat-panel">
        <header class="cheat-header">
          <h2 class="section-title" style="margin-bottom: 0;">金手指</h2>
          <button class="cheat-close" type="button" @click="close">×</button>
        </header>

        <p class="text-muted text-small" style="margin-top: 0;">调试用：快速调整玩家状态</p>

        <div class="cheat-actions">
          <button class="btn" type="button" @click="restoreFull">回复全满</button>
          <button class="btn" type="button" @click="unlockAllMonsters">解锁全部地图</button>
          <button class="btn" type="button" @click="fillBasePower">斗气本源拉满</button>
          <button
            class="btn"
            type="button"
            :disabled="upgradingRealm || isRealmMaxed"
            @click="advanceRealmDirectly"
          >
            直接突破下一境界
          </button>
        </div>
        <p v-if="isRealmMaxed" class="text-small text-muted" style="margin: 6px 0 0;">已达最高境界。</p>

        <div class="cheat-settings">
          <label class="cheat-settings-toggle">
            <input
              class="cheat-settings-checkbox"
              type="checkbox"
              :checked="enableHoldAutoCast"
              @change="handleAutoCastToggle"
            >
            长按技能自动施法
          </label>
          <p class="text-small text-muted" style="margin-top: 6px;">关闭后长按技能不会自动连发。</p>
        </div>

        <div class="cheat-settings">
          <label class="cheat-settings-toggle">
            <input
              class="cheat-settings-checkbox"
              type="checkbox"
              :checked="autoRematchAfterVictory"
              @change="handleAutoRematchToggle"
            >
            胜利后自动重赛
          </label>
          <p class="text-small text-muted" style="margin-top: 6px;">开启后战斗胜利会自动开始下一场（不包括BOSS）。</p>
        </div>

        <div class="cheat-danger">
          <button class="btn btn-danger" type="button" @click="deleteSave">删除存档</button>
          <p class="text-small text-muted" style="margin: 6px 0 0;">清空本地存档并刷新页面</p>
        </div>

        <div class="cheat-gold">
          <label for="cheat-gold-input">获得 GOLD</label>
          <div class="cheat-gold-controls">
            <input
              id="cheat-gold-input"
              v-model.number="goldAmount"
              class="cheat-input"
              type="number"
              min="1"
              step="100"
            >
            <button class="btn" type="button" :disabled="sanitizedGold <= 0" @click="grantGold">增加</button>
          </div>
          <div class="text-small text-muted">当前 GOLD：{{ playerStore.gold }}</div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
