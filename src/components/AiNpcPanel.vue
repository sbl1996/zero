<template>
  <Transition name="npc-dialog-fade">
    <div v-if="isOpen && npc" class="ai-npc-layer">
      <div v-if="showPortrait" class="ai-npc-portrait" :class="`ai-npc-portrait--${portraitVariant}`">
        <img :src="npcPortraitSrc" :alt="portraitAlt">
        <div class="ai-npc-portrait__label">
          <span class="ai-npc-portrait__name">{{ npc.name }}</span>
          <span v-if="npc.title" class="ai-npc-portrait__title">{{ npc.title }}</span>
        </div>
      </div>
      <div class="ai-npc-panel" role="dialog" aria-modal="true">
        <div v-if="isUnavailable" class="ai-unavailable">
          <p>{{ unavailableMessage }}</p>
          <button type="button" class="retry-button" @click="handleRetry">重新发送</button>
        </div>
        <div v-else class="ai-body">
          <div ref="messageListEl" class="ai-single">
            <template v-if="displayMessages.length">
              <div
                v-for="message in displayMessages"
                :key="message.id"
                class="ai-single__block"
              >
                <p
                  class="ai-single__text"
                  :class="{
                    pending: message.toolCallPending,
                    error: message.error
                  }"
                >
                  {{ displayText(message) }}
                  <span v-if="message.error" class="ai-single__hint ai-single__hint--error">调用失败，可重试</span>
                </p>
              </div>
            </template>
            <p v-else class="ai-single__text">
              {{ initialDescription }}
            </p>
          </div>

          <div class="ai-input">
            <input
              v-model="inputValue"
              class="ai-input__field"
              type="text"
              name="ai-chat"
              autocomplete="off"
              placeholder="输入想说的话，Enter 发送"
              :disabled="sending"
              @keydown.enter.prevent="handleSend"
            >
            <div class="ai-input__actions">
              <button
                type="button"
                class="history-button"
                @click="openHistory"
              >
                历史对话
              </button>
              <div class="ai-input__actions-right">
                <button
                  v-if="showRetry"
                  type="button"
                  class="retry-button"
                  :disabled="sending"
                  @click="handleRetry"
              >
                重新发送
              </button>
              <button
                type="button"
                class="leave-button"
                :disabled="sending"
                @click="handleLeave"
              >
                离开
              </button>
              <button
                type="button"
                class="send-button"
                :disabled="!canSend"
                @click="handleSend"
              >
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Teleport to="body">
        <div v-if="showHistory" class="history-overlay" @click.self="closeHistory">
          <div class="history-panel">
            <header class="history-header">
              <h4 class="history-title">历史对话</h4>
              <button type="button" class="history-close" @click="closeHistory">×</button>
            </header>
            <div class="ai-messages">
              <div v-if="historyMessages.length === 0" class="ai-bubble ai-bubble--system">
                <p class="ai-bubble__text">{{ initialDescription }}</p>
              </div>
              <div
                v-for="message in historyMessages"
                :key="message.id"
                class="ai-bubble"
                :class="{
                  'ai-bubble--user': message.role === 'user',
                  'ai-bubble--assistant': message.role === 'assistant',
                  'ai-bubble--system': message.role === 'tool' || message.role === 'system',
                  'ai-bubble--pending': message.toolCallPending,
                  'ai-bubble--error': message.error
                }"
              >
                <div class="ai-bubble__meta">
                  <span class="ai-badge">{{ bubbleLabel(message) }}</span>
                  <span v-if="message.error" class="ai-hint ai-hint--error">调用失败</span>
                </div>
                <p class="ai-bubble__text">
                  {{ displayText(message) }}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useAiNpcStore } from '@/stores/aiNpc'
import { resolveAssetUrl } from '@/utils/assetUrls'
import type { AiNpcMessage } from '@/types/ai-npc'

const aiNpc = useAiNpcStore()

const { isOpen, settings } = storeToRefs(aiNpc)

const npc = computed(() => aiNpc.activeNpc)
const session = computed(() => aiNpc.activeSession)
const messages = computed(() => session.value?.messages ?? [])
const historyMessages = computed(() =>
  messages.value.filter((msg) => {
    if (msg.role === 'tool') return false
    if (msg.role === 'assistant' && (msg.toolCallPending || (msg.toolCalls?.length && !msg.content))) return false
    return true
  }),
)
const sending = computed(() => session.value?.loading ?? false)
const npcPortraitSrc = computed(() => npc.value?.portrait?.image ? resolveAssetUrl(npc.value.portrait.image) : '')
const showPortrait = computed(() => npcPortraitSrc.value.length > 0)
const portraitVariant = computed(() => npc.value?.portrait?.variant ?? 'default')
const portraitAlt = computed(() => `${npc.value?.name ?? 'NPC'}立绘`)
const inputValue = ref('')
const messageListEl = ref<HTMLElement | null>(null)
const showHistory = ref(false)

const hasApiKey = computed(() => Boolean(settings.value.apiKey && settings.value.apiKey.trim().length > 0))
const isUnavailable = computed(() => !hasApiKey.value || Boolean(session.value?.error))
const unavailableMessage = computed(() => {
  if (!hasApiKey.value) return '（系统暂时不可用：未配置 API Key）'
  return session.value?.error ?? '（系统暂时不可用）'
})

const canSend = computed(() => {
  const text = inputValue.value.trim()
  return text.length > 0 && !sending.value && !isUnavailable.value
})

const showRetry = computed(() => Boolean(session.value?.error || messages.value.some(msg => msg.error)))
const initialDescription = computed(() => '（托马斯握着长矛，在青苔原哨点百无聊赖地打着哈欠。）')
const latestMessage = computed<AiNpcMessage | null>(() => {
  const streaming = messages.value.find(msg => msg.isStreaming)
  if (streaming) return streaming
  for (let i = messages.value.length - 1; i >= 0; i -= 1) {
    const msg = messages.value[i]
    if (msg.role !== 'user') return msg
  }
  return null
})
const displayMessages = computed(() => (latestMessage.value ? [latestMessage.value] : []))
const animatedEllipsis = ref('…')
const streamingPlaceholderActive = computed(() =>
  messages.value.some(msg => msg.isStreaming && !msg.displayContent?.trim() && !msg.content?.trim()),
)

let ellipsisTimer: ReturnType<typeof setInterval> | null = null

watch(
  streamingPlaceholderActive,
  (active) => {
    if (active && !ellipsisTimer && typeof window !== 'undefined') {
      const frames = ['.', '..', '...']
      let idx = 0
      animatedEllipsis.value = frames[idx]
      ellipsisTimer = window.setInterval(() => {
        idx = (idx + 1) % frames.length
        animatedEllipsis.value = frames[idx]
      }, 420)
    } else if (!active && ellipsisTimer) {
      clearInterval(ellipsisTimer)
      ellipsisTimer = null
      animatedEllipsis.value = '…'
    }
  },
  { immediate: true },
)

watch(messages, async () => {
  await nextTick()
  const el = messageListEl.value
  if (!el) return
  el.scrollTop = el.scrollHeight
})

function handleSend() {
  const text = inputValue.value.trim()
  if (!text || !canSend.value) return
  aiNpc.sendUserMessage(text)
  inputValue.value = ''
}

function handleRetry() {
  aiNpc.retryLastMessage()
}

function handleLeave() {
  aiNpc.close()
}

function openHistory() {
  showHistory.value = true
}

function closeHistory() {
  showHistory.value = false
}

function bubbleLabel(message: AiNpcMessage) {
  if (message.role === 'user') {
    return aiNpc.playerName ?? '你'
  }
  if (message.role === 'assistant') return npc.value?.name ?? 'AI'
  return '系统'
}

function displayText(message: AiNpcMessage) {
  const text = message.displayContent || message.content
  if (text && text.trim().length) return text
  if (message.isStreaming) return animatedEllipsis.value
  return '…'
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && isOpen.value) {
    aiNpc.close()
  }
}

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', handleKeydown)
  }
})

onBeforeUnmount(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('keydown', handleKeydown)
  }
  if (ellipsisTimer) {
    clearInterval(ellipsisTimer)
    ellipsisTimer = null
  }
})
</script>

<style scoped>
.npc-dialog-fade-enter-active,
.npc-dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}
.npc-dialog-fade-enter-from,
.npc-dialog-fade-leave-to {
  opacity: 0;
}
.ai-npc-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 6;
}
.ai-npc-portrait {
  position: absolute;
  top: 1rem;
  left: 1rem;
  width: clamp(200px, 26vw, 260px);
  aspect-ratio: 3 / 4;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: linear-gradient(165deg, rgba(7, 12, 20, 0.95), rgba(17, 30, 48, 0.85));
  overflow: hidden;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}
.ai-npc-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ai-npc-portrait--silhouette img {
  filter: grayscale(1) brightness(0.6);
}
.ai-npc-portrait__label {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0.65rem 0.85rem 0.85rem;
  background: linear-gradient(180deg, rgba(3, 5, 12, 0), rgba(3, 5, 12, 0.9));
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.ai-npc-portrait__name {
  font-size: 1.05rem;
  font-weight: 600;
  color: #f8fafc;
}
.ai-npc-portrait__title {
  font-size: 0.85rem;
  color: rgba(248, 250, 252, 0.7);
}
.ai-npc-panel {
  position: absolute;
  left: 2%;
  right: 2%;
  bottom: 1rem;
  max-height: 65%;
  background: rgba(6, 10, 18, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.45);
  padding: 1.1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}
.ai-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
}
.ai-header__title {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.ai-header__actions {
  margin-left: auto;
}
.history-button {
  padding: 0.4rem 0.65rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  cursor: pointer;
}
.history-button:hover {
  background: rgba(255, 255, 255, 0.14);
}
.ai-name {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 700;
  color: #f8fafc;
}
.ai-subtitle {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(248, 250, 252, 0.75);
}
.ai-body {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}
.ai-single {
  min-height: 160px;
  padding: 0.75rem 0.25rem 0.25rem;
  color: #e2e8f0;
  line-height: 1.6;
}
.ai-single__block {
  margin-bottom: 0.25rem;
}
.ai-single__text {
  margin: 0;
  font-size: 1rem;
  white-space: pre-wrap;
}
.ai-single__text.pending {
  opacity: 0.85;
}
.ai-single__text.error {
  color: #f87171;
}
.ai-single__hint {
  margin-left: 0.35rem;
  font-size: 0.9rem;
  color: rgba(226, 232, 240, 0.75);
}
.ai-single__hint--error {
  color: #fca5a5;
}
.ai-bubble {
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.ai-bubble--user {
  align-self: flex-end;
  background: rgba(68, 158, 255, 0.15);
  border-color: rgba(68, 158, 255, 0.35);
}
.ai-bubble--assistant {
  background: rgba(255, 255, 255, 0.03);
}
.ai-bubble--system {
  background: rgba(255, 255, 255, 0.06);
  border-style: dashed;
}
.ai-bubble--pending {
  border-color: rgba(255, 255, 255, 0.25);
}
.ai-bubble--error {
  border-color: rgba(239, 68, 68, 0.65);
  background: rgba(239, 68, 68, 0.12);
}
.ai-bubble__meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}
.ai-badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.78rem;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(248, 250, 252, 0.9);
}
.ai-hint {
  font-size: 0.8rem;
  color: rgba(226, 232, 240, 0.75);
}
.ai-hint--error {
  color: rgba(248, 113, 113, 0.95);
}
.ai-bubble__text {
  margin: 0;
  font-size: 0.98rem;
  color: #e2e8f0;
  line-height: 1.5;
  white-space: pre-wrap;
}
.ai-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.ai-input__field {
  width: 100%;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 0.65rem 0.75rem;
  background: rgba(10, 16, 26, 0.9);
  color: #f8fafc;
}
.ai-input__field:disabled {
  opacity: 0.6;
}
.ai-input__actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ai-input__actions-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.send-button,
.retry-button,
.leave-button {
  padding: 0.5rem 0.85rem;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(68, 158, 255, 0.15);
  color: #e7f0ff;
  cursor: pointer;
}
.retry-button {
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
}
.leave-button {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}
.send-button:disabled,
.retry-button:disabled,
.leave-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.ai-unavailable {
  min-height: 220px;
  display: grid;
  place-items: center;
  gap: 0.75rem;
  background: rgba(8, 10, 14, 0.85);
  border: 1px dashed rgba(255, 255, 255, 0.2);
  border-radius: 12px;
  color: rgba(226, 232, 240, 0.9);
}
.history-overlay {
  position: fixed;
  inset: 0;
  z-index: 20;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 1rem;
  transform: translateX(2.5%);
}
.history-panel {
  height: min(600px, 80vh);
  width: min(720px, 95vw);
  max-height: 80vh;
  background: rgba(6, 10, 18, 0.95);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 14px;
  padding: 1rem;
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.ai-messages {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 0.35rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.history-title {
  margin: 0;
  font-size: 1.1rem;
  color: #f8fafc;
}
.history-close {
  background: transparent;
  border: none;
  color: rgba(248, 250, 252, 0.8);
  font-size: 1.5rem;
  cursor: pointer;
  line-height: 1;
}
.history-close:hover {
  color: #fff;
}
@media (max-width: 768px) {
  .ai-npc-portrait {
    left: 1rem;
    width: min(55vw, 260px);
  }
  .ai-npc-panel {
    left: 1rem;
    right: 1rem;
  }
}
@media (max-width: 540px) {
  .ai-npc-portrait {
    top: 0.65rem;
    width: min(65vw, 220px);
  }
  .ai-npc-panel {
    left: 0.75rem;
    right: 0.75rem;
  }
}
</style>
