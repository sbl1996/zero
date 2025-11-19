<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useBgmStore } from '@/stores/bgm'

const ui = useUiStore()
const bgm = useBgmStore()

const { showSettings, autoRematchAfterVictory } = storeToRefs(ui)
const { volume, muted } = storeToRefs(bgm)

const volumePercent = computed(() => Math.round(volume.value * 100))

function close() {
  ui.toggleSettings(false)
}

function handleVolumeInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const nextValue = Number(target.value)
  if (!Number.isFinite(nextValue)) return
  bgm.setVolume(nextValue / 100)
}

function handleAutoRematchToggle(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  ui.toggleAutoRematch(target.checked)
}

function handleMuteToggle(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  bgm.setMuted(target.checked)
}
</script>

<template>
  <Teleport to="body">
    <div v-if="showSettings" class="settings-overlay" @click.self="close">
      <div class="settings-panel">
        <header class="settings-header">
          <h2 class="section-title" style="margin-bottom: 0;">设置</h2>
          <button type="button" class="settings-close" @click="close">×</button>
        </header>

        <div class="settings-section">
          <label class="settings-toggle">
            <input
              class="settings-toggle__checkbox"
              type="checkbox"
              :checked="muted"
              @change="handleMuteToggle"
            >
            <div>
              <p class="settings-section__title" style="margin: 0;">静音</p>
              <p class="text-small text-muted" style="margin: 4px 0 0;">暂停播放背景音乐；再次取消静音会恢复静音前的音量。</p>
            </div>
          </label>
        </div>

        <div class="settings-section">
          <div class="settings-section__head">
            <div>
              <h3 class="settings-section__title">背景音乐音量</h3>
              <p class="text-small text-muted" style="margin: 4px 0 0;">调整当前背景音乐的播放音量。</p>
            </div>
            <span class="settings-volume-label">{{ volumePercent }}%</span>
          </div>
          <input
            class="settings-slider"
            type="range"
            min="0"
            max="100"
            :value="volumePercent"
            @input="handleVolumeInput"
          >
        </div>

        <div class="settings-section">
          <label class="settings-toggle">
            <input
              class="settings-toggle__checkbox"
              type="checkbox"
              :checked="autoRematchAfterVictory"
              @change="handleAutoRematchToggle"
            >
            <div>
              <p class="settings-section__title" style="margin: 0;">胜利后自动重赛</p>
              <p class="text-small text-muted" style="margin: 4px 0 0;">普通战斗胜利后立即重新匹配下一场战斗（BOSS除外）。</p>
            </div>
          </label>
        </div>
      </div>
    </div>
  </Teleport>
</template>
