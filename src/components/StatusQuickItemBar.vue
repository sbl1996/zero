<script setup lang="ts">
import type { ItemIconDefinition } from '@/types/domain'

type StatusConsumable = {
  id: string
  name: string
  icon: ItemIconDefinition
  quantity: number
  quantityLabel?: string
  consumedOnUse: boolean
  showQuantity: boolean
  disabled: boolean
  locked: boolean
  description?: string
}

const props = defineProps<{
  items: StatusConsumable[]
  locked: boolean
}>()

const emit = defineEmits<{
  (e: 'use', itemId: string): void
}>()

function handleUse(itemId: string) {
  emit('use', itemId)
}

function formatTitle(item: StatusConsumable) {
  const parts = [item.name]
  if (item.description) parts.push(item.description)
  if (item.locked) parts.push('冥想中无法使用')
  return parts.join(' · ')
}
</script>

<template>
  <div class="status-quick-items">
    <div class="status-quick-items__grid">
      <button
        v-for="item in props.items"
        :key="item.id"
        class="status-quick-item"
        :class="{ disabled: item.disabled }"
        type="button"
        :disabled="item.disabled"
        :title="formatTitle(item)"
        @click="handleUse(item.id)"
      >
        <span class="status-quick-item__icon">
          <img
            v-if="item.icon.type === 'image'"
            :src="item.icon.src"
            :alt="item.icon.alt || item.name"
          >
          <span v-else>{{ item.icon.text }}</span>
        </span>
        <div
          v-if="item.showQuantity"
          class="status-quick-item__quantity"
        >
          {{ item.quantityLabel ?? `×${item.quantity}` }}
        </div>
      </button>
    </div>
  </div>
</template>

<style scoped>
.status-quick-items__grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.status-quick-item {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  padding: 1px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: white;
  font-size: 13px;
  aspect-ratio: 1;
  min-height: 46px;
}

.status-quick-item:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.25);
  transform: translateY(-1px);
}

.status-quick-item:active:not(.disabled) {
  transform: translateY(0);
  background: rgba(255, 255, 255, 0.15);
}

.status-quick-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
}

.status-quick-item__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: calc(100% - 10px);
  height: calc(100% - 10px);
  font-size: 26px;
  line-height: 1;
}

.status-quick-item__icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.status-quick-item__quantity {
  position: absolute;
  right: 4px;
  bottom: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 5px;
  border-radius: 9px;
  min-width: 22px;
  text-align: center;
}

@media (max-width: 768px) {
  .status-quick-item {
    padding: 4px;
    min-height: 44px;
  }

  .status-quick-item__icon {
    width: calc(100% - 10px);
    height: calc(100% - 10px);
    font-size: 22px;
  }
}
</style>
