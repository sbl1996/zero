import { defineStore } from 'pinia'
import { ref, computed, readonly } from 'vue'
import type { MapMetadata } from '@/types/map'

interface HistoryState {
  mapState: MapMetadata
  action: string
  timestamp: number
  isSaveCheckpoint?: boolean
}

export const useHistoryStore = defineStore('history', () => {
  const history = ref<HistoryState[]>([])
  const currentIndex = ref(-1)
  const maxHistorySize = 50

  // Computed properties for undo/redo availability
  const canUndo = computed(() => currentIndex.value > 0 && !isAtSaveCheckpoint.value)
  const canRedo = computed(() => currentIndex.value < history.value.length - 1)

  // Check if we're at a save checkpoint (can't undo past this)
  const isAtSaveCheckpoint = computed(() => {
    if (currentIndex.value <= 0) return true
    return history.value[currentIndex.value - 1]?.isSaveCheckpoint === true
  })

  // Get current state
  const currentState = computed(() => {
    return currentIndex.value >= 0 ? history.value[currentIndex.value]?.mapState : null
  })

  // Add a new state to history
  function pushState(mapState: MapMetadata, action: string, isSaveCheckpoint = false) {
    // Remove any future states if we're not at the end
    if (currentIndex.value < history.value.length - 1) {
      history.value = history.value.slice(0, currentIndex.value + 1)
    }

    // Add new state
    const newState: HistoryState = {
      mapState: JSON.parse(JSON.stringify(mapState)), // Deep clone
      action,
      timestamp: Date.now(),
      isSaveCheckpoint
    }

    history.value.push(newState)
    currentIndex.value = history.value.length - 1

    // Limit history size
    if (history.value.length > maxHistorySize) {
      const removeCount = history.value.length - maxHistorySize
      history.value = history.value.slice(removeCount)
      currentIndex.value -= removeCount
    }
  }

  // Create save checkpoint (clears undo history before this point)
  function createSaveCheckpoint(mapState: MapMetadata) {
    pushState(mapState, '保存', true)
  }

  // Undo operation
  function undo(): MapMetadata | null {
    if (!canUndo.value) return null

    currentIndex.value--
    return currentState.value
  }

  // Redo operation
  function redo(): MapMetadata | null {
    if (!canRedo.value) return null

    currentIndex.value++
    return currentState.value
  }

  // Clear history (called when loading a new map)
  function clearHistory() {
    history.value = []
    currentIndex.value = -1
  }

  // Initialize with a map state
  function initialize(mapState: MapMetadata) {
    clearHistory()
    pushState(mapState, '初始状态', true)
  }

  return {
    history: readonly(history),
    currentIndex: readonly(currentIndex),
    canUndo,
    canRedo,
    isAtSaveCheckpoint,
    currentState,
    pushState,
    createSaveCheckpoint,
    undo,
    redo,
    clearHistory,
    initialize
  }
})