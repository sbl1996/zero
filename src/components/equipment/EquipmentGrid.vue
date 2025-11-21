<script setup lang="ts">
import { computed, ref } from 'vue'
import EquipmentGridItem from '@/components/equipment/EquipmentGridItem.vue'
import type { EquipmentGridEntry } from '@/types/equipment-ui'

export interface EquipmentFilterOption {
  value: string
  label: string
}

const props = defineProps<{
  items: EquipmentGridEntry[]
  filters: EquipmentFilterOption[]
  filter: string
  selectedId: string | null
}>()

const emit = defineEmits<{
  (e: 'update:filter', value: string): void
  (e: 'select', value: string | null): void
  (e: 'enter', entry: EquipmentGridEntry | null): void
}>()

const gridRef = ref<HTMLDivElement | null>(null)
const COLUMNS = 5

const selectedIndex = computed(() => props.items.findIndex((item) => item.id === props.selectedId))

function updateFilter(value: string) {
  emit('update:filter', value)
}

function handleSelect(entry: EquipmentGridEntry) {
  emit('select', entry.id)
}

function moveSelection(delta: number) {
  if (!props.items.length) return
  const current = selectedIndex.value === -1 ? 0 : selectedIndex.value
  const nextIndex = Math.min(props.items.length - 1, Math.max(0, current + delta))
  const next = props.items[nextIndex]
  if (next) {
    emit('select', next.id)
  }
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.items.length) return
  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      moveSelection(-1)
      break
    case 'ArrowRight':
      event.preventDefault()
      moveSelection(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveSelection(-COLUMNS)
      break
    case 'ArrowDown':
      event.preventDefault()
      moveSelection(COLUMNS)
      break
    case 'Enter':
      event.preventDefault()
      emit('enter', props.items[selectedIndex.value] ?? null)
      break
    default:
      break
  }
}
</script>

<template>
  <section class="grid-panel">
    <div class="grid-panel__filters">
      <button
        v-for="option in props.filters"
        :key="option.value"
        class="grid-filter"
        type="button"
        :class="{ 'grid-filter--active': props.filter === option.value }"
        @click="updateFilter(option.value)"
      >
        {{ option.label }}
      </button>
    </div>

    <div
      ref="gridRef"
      class="grid-panel__list"
      tabindex="0"
      role="grid"
      @keydown="handleKeydown"
    >
      <template v-if="props.items.length > 0">
        <EquipmentGridItem
          v-for="entry in props.items"
          :key="entry.id"
          :entry="entry"
          :selected="entry.id === props.selectedId"
          class="grid-panel__item"
          role="gridcell"
          @select="handleSelect"
        />
      </template>
      <p v-else class="grid-panel__empty">暂无可用装备</p>
    </div>
  </section>
</template>

<style scoped>
.grid-panel {
  padding: 12px 12px 4px;
  border-radius: 18px;
  background: rgba(8, 10, 18, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid-panel__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.grid-filter {
  padding: 4px 12px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 13px;
  cursor: pointer;
  transition:
    background 0.2s ease,
    color 0.2s ease;
}

.grid-filter--active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.grid-panel__list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
  min-height: 240px;
  outline: none;
}

.grid-panel__empty {
  grid-column: 1 / -1;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  padding: 40px 0;
}
</style>
