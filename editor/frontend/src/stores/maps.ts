import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { MapMetadata } from '@/types/map'
import { fetchMaps, fetchMap, updateMap as apiUpdateMap, deleteMap as apiDeleteMap } from '@/api'
import { useHistoryStore } from './history'

export const useMapStore = defineStore('maps', () => {
  const maps = ref<MapMetadata[]>([])
  const currentMap = ref<MapMetadata | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const historyStore = useHistoryStore()

  async function loadMaps() {
    loading.value = true
    try {
      maps.value = await fetchMaps()
    } finally {
      loading.value = false
    }
  }

  async function loadMap(id: string) {
    loading.value = true
    try {
      const map = await fetchMap(id)
      currentMap.value = map
      historyStore.initialize(map)
    } finally {
      loading.value = false
    }
  }

  async function saveMap(map: MapMetadata) {
    saving.value = true
    try {
      const updated = await apiUpdateMap(map.id, map)
      const index = maps.value.findIndex(m => m.id === map.id)
      if (index !== -1) {
        maps.value[index] = updated
      }
      if (currentMap.value?.id === map.id) {
        currentMap.value = updated
        historyStore.createSaveCheckpoint(updated)
      }
      return updated
    } finally {
      saving.value = false
    }
  }

  async function removeMap(id: string) {
    await apiDeleteMap(id)
    maps.value = maps.value.filter(m => m.id !== id)
    if (currentMap.value?.id === id) {
      currentMap.value = null
    }
  }

  // Update current map and track history
  function updateCurrentMap(updatedMap: MapMetadata, action: string) {
    currentMap.value = updatedMap
    historyStore.pushState(updatedMap, action)
  }

  // Undo current map state
  function undo(): boolean {
    const previousState = historyStore.undo()
    if (previousState) {
      currentMap.value = previousState
      return true
    }
    return false
  }

  // Redo current map state
  function redo(): boolean {
    const nextState = historyStore.redo()
    if (nextState) {
      currentMap.value = nextState
      return true
    }
    return false
  }

  // Get undo/redo state from history store
  function getHistoryState() {
    return {
      canUndo: historyStore.canUndo,
      canRedo: historyStore.canRedo,
      isAtSaveCheckpoint: historyStore.isAtSaveCheckpoint
    }
  }

  return {
    maps,
    currentMap,
    loading,
    saving,
    loadMaps,
    loadMap,
    saveMap,
    removeMap,
    updateCurrentMap,
    undo,
    redo,
    getHistoryState,
    historyStore
  }
})
