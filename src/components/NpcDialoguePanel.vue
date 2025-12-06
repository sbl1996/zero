<template>
  <Transition name="npc-dialog-fade">
    <div v-if="isOpen && page && npc" class="npc-dialog-layer">
      <div v-if="showPortrait" class="npc-dialog-portrait" :class="`npc-dialog-portrait--${portraitVariant}`">
        <img :src="npcPortraitSrc" :alt="portraitAlt" />
        <div class="npc-portrait__label">
          <span class="npc-portrait__name">{{ npc.name }}</span>
          <span v-if="npc.title" class="npc-portrait__title">{{ npc.title }}</span>
        </div>
      </div>
      <div class="npc-dialog-panel" role="dialog" aria-modal="true">
        <div v-if="page.lines.length" class="npc-dialog__lines">
          <p v-for="line in page.lines" :key="line.id" class="npc-dialog__line">
            <span>{{ line.text }}</span>
          </p>
        </div>
        <div class="npc-dialog__options" :class="{ 'npc-dialog__options--inline': inlineOptions }">
          <button
            v-for="option in page.options"
            :key="option.id"
            type="button"
            class="npc-dialog__option"
            :disabled="option.disabled"
            @click="handleOption(option.id)"
          >
            <div class="option-header">
              <span class="option-label">{{ option.label }}</span>
              <span v-if="option.hint" class="option-hint">{{ option.hint }}</span>
              <span v-if="option.kind === 'quest'" class="option-badge option-badge--quest">任务</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useNpcDialogStore } from '@/stores/npcDialog'
import { resolveAssetUrl } from '@/utils/assetUrls'

const npcDialog = useNpcDialogStore()
const { isOpen, activeNpc: npc } = storeToRefs(npcDialog)
const page = computed(() => npcDialog.getCurrentPage())
const npcPortraitSrc = computed(() => {
  const image = npc.value?.portrait?.image
  if (!image) return ''
  return resolveAssetUrl(image)
})
const showPortrait = computed(() => npcPortraitSrc.value.length > 0)
const portraitVariant = computed(() => npc.value?.portrait?.variant ?? 'default')
const portraitAlt = computed(() => `${npc.value?.name ?? 'NPC'}立绘`)
const inlineOptionPages = new Set(['quest-ready', 'quest-offer'])
const inlineOptions = computed(() => {
  if (!page.value) return false
  return inlineOptionPages.has(page.value.id) && page.value.options.length === 2
})

function handleOption(optionId: string) {
  npcDialog.selectOption(optionId)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && npcDialog.isOpen) {
    event.preventDefault()
    npcDialog.close()
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
.npc-dialog-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 5;
}
.npc-dialog-portrait {
  position: absolute;
  top: 1rem;
  left: 1rem;
  width: clamp(200px, 26vw, 260px);
  aspect-ratio: 3 / 4;
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: linear-gradient(165deg, rgba(6, 10, 18, 0.95), rgba(24, 35, 58, 0.9));
  overflow: hidden;
  box-shadow: 0 20px 45px rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}
.npc-dialog-portrait img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.npc-dialog-portrait--silhouette img {
  filter: grayscale(1) brightness(0.6);
  opacity: 0.9;
}
.npc-portrait__label {
  position: absolute;
  inset: auto 0 0 0;
  padding: 0.65rem 0.85rem 0.85rem;
  background: linear-gradient(180deg, rgba(3, 5, 12, 0), rgba(3, 5, 12, 0.9));
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}
.npc-portrait__name {
  font-size: 1.05rem;
  font-weight: 600;
  color: #f8fafc;
}
.npc-portrait__title {
  font-size: 0.85rem;
  color: rgba(248, 250, 252, 0.75);
}
.npc-dialog-panel {
  position: absolute;
  left: 2%;
  right: 2%;
  bottom: 1rem;
  width: auto;
  max-height: 55%;
  background: rgba(6, 10, 18, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 16px;
  box-shadow: 0 15px 50px rgba(0, 0, 0, 0.45);
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  backdrop-filter: blur(6px);
  pointer-events: auto;
}
.npc-dialog__lines {
  flex: 1;
  background: rgba(3, 5, 12, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 1rem;
  overflow-y: auto;
}
.npc-dialog__line {
  font-size: 1rem;
  line-height: 1.6;
  color: #e2e8f0;
  margin: 0 0 0.75rem;
}
.npc-dialog__line:last-child {
  margin-bottom: 0;
}
.npc-dialog__speaker {
  font-weight: 600;
  color: #f1f5f9;
}
.npc-dialog__options {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.npc-dialog__options--inline {
  flex-direction: row;
  flex-wrap: wrap;
}
.npc-dialog__options--inline .npc-dialog__option {
  flex: 1 1 calc(50% - 0.5rem);
}
.npc-dialog__option {
  width: 100%;
  text-align: left;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.05);
  color: #f8fafc;
  transition: background 0.15s ease, transform 0.15s ease;
}
.npc-dialog__option:hover:enabled {
  background: rgba(76, 156, 255, 0.15);
  transform: translateX(4px);
}
.npc-dialog__option:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.option-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.option-label {
  display: inline-block;
  font-size: 1rem;
  font-weight: 600;
  flex: none;
  min-width: 0;
}
.option-hint {
  display: inline-block;
  font-size: 0.85rem;
  color: rgba(248, 250, 252, 0.75);
  margin-left: 0.5rem;
}
.option-badge {
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: rgba(248, 250, 252, 0.85);
  background: rgba(15, 23, 42, 0.25);
  text-transform: uppercase;
  margin-left: auto;
}
.option-badge--quest {
  border-color: rgba(59, 130, 246, 0.65);
  color: #cfe1ff;
  background: rgba(59, 130, 246, 0.25);
  box-shadow: 0 0 12px rgba(59, 130, 246, 0.2);
}
.npc-dialog__footer {
  font-size: 0.85rem;
  color: rgba(241, 245, 249, 0.65);
  text-align: right;
}
@media (max-width: 1000px) {
  .npc-dialog-portrait {
    left: 1rem;
    width: auto;
    aspect-ratio: 3 / 4;
    height: 45%;
  }
  .npc-portrait__label {
    inset: 0 0 auto 0;
    background: linear-gradient(180deg, rgba(3, 5, 12, 0.88), rgba(3, 5, 12, 0));
  }
  .npc-dialog-panel {
    left: 1rem;
    right: 1rem;
    max-height: 55%;
  }
}
@media (max-width: 540px) {
  .npc-dialog-portrait {
    top: 0.65rem;
    width: min(65vw, 220px);
  }
  .npc-dialog-panel {
    left: 0.75rem;
    right: 0.75rem;
  }
}
</style>
