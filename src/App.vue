<template>
  <div class="app-shell">
    <header v-if="hasCharacter" class="app-header">
      <h1 class="app-title">零 ZERO</h1>
      <nav class="app-nav">
        <RouterLink to="/map" class="nav-link" active-class="active">地图</RouterLink>
        <RouterLink to="/meditation" class="nav-link" active-class="active">修炼</RouterLink>
        <RouterLink to="/skills" class="nav-link" active-class="active">功法</RouterLink>
        <RouterLink to="/equipment" class="nav-link" active-class="active">装备</RouterLink>
        <RouterLink to="/backpack" class="nav-link" active-class="active">背包</RouterLink>
        <RouterLink to="/quests" class="nav-link" active-class="active">任务</RouterLink>
        <button
          v-if="hasCharacter"
          type="button"
          class="nav-link"
          active-class="active"
          @click="toggleSettings"
        >
          设置
        </button>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
  <button
    v-if="hasCharacter"
    class="cheat-toggle"
    type="button"
    :class="{ active: showCheatPanel }"
    :aria-pressed="showCheatPanel"
    @click="toggleCheatPanel"
  >
    金手指
  </button>
  <CheatPanel v-if="hasCharacter" />
  <SettingsPanel v-if="hasCharacter" />
</template>

<script setup lang="ts">
import { watch } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { storeToRefs } from 'pinia'
import CheatPanel from '@/components/CheatPanel.vue'
import SettingsPanel from '@/components/SettingsPanel.vue'
import { useUiStore } from '@/stores/ui'
import { usePlayerStore } from '@/stores/player'
import { useProgressStore } from '@/stores/progress'
import { useBgmStore } from '@/stores/bgm'

const ui = useUiStore()
const player = usePlayerStore()
const progress = useProgressStore()
const bgm = useBgmStore()
const route = useRoute()

const { showCheatPanel, showSettings } = storeToRefs(ui)
const { hasCharacter } = storeToRefs(player)

function toggleCheatPanel() {
  ui.toggleCheatPanel()
}

function toggleSettings() {
  ui.toggleSettings()
}

watch(
  () => progress.currentMapId,
  (mapId) => {
    bgm.setActiveMap(mapId)
  },
  { immediate: true },
)

watch(
  () => route.name,
  (routeName) => {
    bgm.setScene(routeName === 'battle' ? 'battle' : 'ambient')
  },
  { immediate: true },
)

watch(
  () => showSettings.value,
  (open) => {
    if (open) {
      ui.toggleCheatPanel(false)
    }
  },
)

watch(
  () => showCheatPanel.value,
  (open) => {
    if (open) {
      ui.toggleSettings(false)
    }
  },
)
</script>
