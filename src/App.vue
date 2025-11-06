<template>
  <div class="app-shell">
    <header class="app-header">
      <h1 class="app-title">零 ZERO</h1>
      <nav class="app-nav">
        <RouterLink to="/map" class="nav-link" active-class="active">地图</RouterLink>
        <RouterLink to="/meditation" class="nav-link" active-class="active">修炼</RouterLink>
        <RouterLink to="/skills" class="nav-link" active-class="active">功法</RouterLink>
        <RouterLink to="/equipment" class="nav-link" active-class="active">装备</RouterLink>
        <RouterLink to="/backpack" class="nav-link" active-class="active">背包</RouterLink>
        <RouterLink to="/quests" class="nav-link" active-class="active">任务</RouterLink>
      </nav>
    </header>
    <main class="app-main">
      <RouterView />
    </main>
  </div>
  <button
    class="cheat-toggle"
    type="button"
    :class="{ active: showCheatPanel }"
    :aria-pressed="showCheatPanel"
    @click="toggleCheatPanel"
  >
    金手指
  </button>
  <CheatPanel />
</template>

<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { storeToRefs } from 'pinia'
import CheatPanel from '@/components/CheatPanel.vue'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const { showCheatPanel } = storeToRefs(ui)

function toggleCheatPanel() {
  ui.toggleCheatPanel()
}
</script>
