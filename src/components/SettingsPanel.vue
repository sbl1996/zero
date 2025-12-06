<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useUiStore } from '@/stores/ui'
import { useBgmStore } from '@/stores/bgm'
import { useAiNpcStore } from '@/stores/aiNpc'

const ui = useUiStore()
const bgm = useBgmStore()
const aiNpc = useAiNpcStore()

const { showSettings, autoRematchAfterVictory } = storeToRefs(ui)
const { volume, muted } = storeToRefs(bgm)
const { settings: aiSettings } = storeToRefs(aiNpc)

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

function handleAiTextInput(event: Event, key: 'apiKey' | 'baseUrl' | 'model') {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  aiNpc.setSettings({ [key]: target.value.trim() })
}

function handleTemperatureInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const value = Number(target.value)
  if (!Number.isFinite(value)) return
  aiNpc.setSettings({ temperature: Math.max(0, value) })
}

function handleTimeoutInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const value = Number(target.value)
  if (!Number.isFinite(value)) return
  aiNpc.setSettings({ timeoutMs: Math.max(1000, Math.round(value)) })
}

function handleHistoryLimitInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const value = Number(target.value)
  if (!Number.isFinite(value)) return
  aiNpc.setSettings({ historyLimit: Math.max(6, Math.round(value)) })
}

function handleRetryCountInput(event: Event) {
  const target = event.target as HTMLInputElement | null
  if (!target) return
  const value = Number(target.value)
  if (!Number.isFinite(value)) return
  aiNpc.setSettings({ maxRetries: Math.max(0, Math.round(value)) })
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

        <div class="settings-layout">
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

          <div class="settings-section settings-section--wide">
            <div class="settings-section__head">
              <div>
                <h3 class="settings-section__title">AI NPC 接口</h3>
                <p class="text-small text-muted" style="margin: 4px 0 0;">默认读取 VITE_AI_NPC_* 环境变量，可在此覆盖 baseURL、模型与 API Key。</p>
              </div>
            </div>
            <label class="settings-field">
              <span class="settings-field__label">Base URL</span>
              <input
                class="settings-input"
                type="text"
                placeholder="https://api.openai.com"
                :value="aiSettings.baseUrl"
                @input="(event) => handleAiTextInput(event, 'baseUrl')"
              >
            </label>
            <label class="settings-field">
              <span class="settings-field__label">模型</span>
              <input
                class="settings-input"
                type="text"
                placeholder="deepseek-chat"
                :value="aiSettings.model"
                @input="(event) => handleAiTextInput(event, 'model')"
              >
            </label>
            <label class="settings-field">
              <span class="settings-field__label">API Key</span>
              <input
                class="settings-input"
                type="password"
                placeholder="输入你的API Key"
                :value="aiSettings.apiKey"
                @input="(event) => handleAiTextInput(event, 'apiKey')"
              >
            </label>
          </div>

          <div class="settings-section settings-section--wide">
            <div class="settings-section__head">
              <div>
                <h3 class="settings-section__title">AI NPC 运行参数</h3>
                <p class="text-small text-muted" style="margin: 4px 0 0;">温度、超时、历史长度与重试次数全局复用。</p>
              </div>
            </div>
            <div class="settings-grid">
              <label class="settings-field">
                <span class="settings-field__label">温度</span>
                <input
                  class="settings-input"
                  type="number"
                  min="0"
                  max="2"
                  step="0.1"
                  :value="aiSettings.temperature"
                  @input="handleTemperatureInput"
                >
              </label>
              <label class="settings-field">
                <span class="settings-field__label">超时 (ms)</span>
                <input
                  class="settings-input"
                  type="number"
                  min="1000"
                  step="500"
                  :value="aiSettings.timeoutMs"
                  @input="handleTimeoutInput"
                >
              </label>
              <label class="settings-field">
                <span class="settings-field__label">历史长度</span>
                <input
                  class="settings-input"
                  type="number"
                  min="6"
                  step="1"
                  :value="aiSettings.historyLimit"
                  @input="handleHistoryLimitInput"
                >
              </label>
              <label class="settings-field">
                <span class="settings-field__label">重试次数</span>
                <input
                  class="settings-input"
                  type="number"
                  min="0"
                  step="1"
                  :value="aiSettings.maxRetries"
                  @input="handleRetryCountInput"
                >
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-layout {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 14px;
  margin-top: 12px;
}
.settings-layout .settings-section {
  margin-top: 0;
  height: 100%;
}
.settings-section--wide {
  grid-column: 1 / -1;
}
.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.65rem;
}
.settings-field__label {
  font-size: 0.9rem;
  color: rgba(248, 250, 252, 0.8);
}
.settings-input {
  width: 100%;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(10, 16, 26, 0.9);
  color: #f8fafc;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 0.75rem;
}
</style>
