<template>
  <div class="map-editor">
    <!-- Left: Map List -->
    <aside class="map-editor__sidebar">
      <MapList
        :maps="mapStore.maps"
        :current-map-id="currentMapId"
        @select="handleSelectMap"
        @create="handleCreateMap"
      />
    </aside>

    <!-- Main Content Area -->
    <div class="map-editor__main">
      <div v-if="currentMap">
        <!-- Toolbar Row -->
        <div class="map-editor__toolbar">
          <!-- Edit Mode Buttons -->
          <div class="toolbar-group">
            <el-button
              :type="editMode === 'select' ? 'primary' : 'default'"
              size="small"
              @click="editMode = 'select'"
            >
              选择
            </el-button>
            <el-button
              :type="editMode === 'move' ? 'primary' : 'default'"
              size="small"
              @click="editMode = 'move'"
            >
              移动
            </el-button>
            <el-button
              :type="editMode === 'connect' ? 'primary' : 'default'"
              size="small"
              @click="editMode = 'connect'"
            >
              连接
            </el-button>
            <el-divider direction="vertical" />
            <el-button
              v-if="currentMap.category === 'wild'"
              :type="editMode === 'add-battle' ? 'primary' : 'default'"
              size="small"
              @click="editMode = 'add-battle'"
            >
              ⚔️ 战斗
            </el-button>
            <el-button
              v-if="currentMap.category === 'wild'"
              :type="editMode === 'add-portal' ? 'primary' : 'default'"
              size="small"
              @click="editMode = 'add-portal'"
            >
              🌀 传送门
            </el-button>
            <el-button
              v-if="currentMap.category === 'city'"
              :type="editMode === 'add-location' ? 'primary' : 'default'"
              size="small"
              @click="editMode = 'add-location'"
            >
              📍 地点
            </el-button>
          </div>

          <!-- Undo/Redo Buttons -->
          <div class="toolbar-group">
            <el-button size="small" :disabled="!historyState.canUndo" @click="handleUndo" title="撤销 (Ctrl+Z)">↶</el-button>
            <el-button size="small" :disabled="!historyState.canRedo" @click="handleRedo" title="重做 (Ctrl+Y)">↷</el-button>
          </div>

          <!-- Zoom Controls -->
          <div class="toolbar-group">
            <el-input-number
              v-model="canvasZoom"
              :min="50"
              :max="200"
              :step="10"
              size="small"
              style="width: 100px"
            />
            <span style="margin-left: 4px">%</span>
          </div>

          <!-- Grid Options -->
          <div class="toolbar-group">
            <el-checkbox v-model="showGrid" size="small">网格</el-checkbox>
            <el-checkbox v-model="snapToGrid" size="small">吸附</el-checkbox>
          </div>

          <!-- Save Button -->
          <div class="toolbar-group ml-auto">
            <el-button type="success" size="small" :loading="mapStore.saving" @click="handleSave">
              💾 保存
            </el-button>
            <div class="save-status-indicator">
              <span v-if="historyState.isAtSaveCheckpoint" class="saved-indicator">
                <el-icon><Check /></el-icon>
                已保存
              </span>
              <span v-else class="unsaved-indicator">
                <el-icon><Warning /></el-icon>
                未保存
              </span>
            </div>
          </div>
        </div>

        <!-- Canvas and Properties Row -->
        <div class="map-editor__content">
          <!-- Canvas Area -->
          <section class="map-editor__canvas">
            <MapCanvas
              :map="currentMap"
              :image-url="mapImageUrl"
              :saving="mapStore.saving"
              :edit-mode="editMode"
              :canvas-zoom="canvasZoom"
              :show-grid="showGrid"
              :snap-to-grid="snapToGrid"
              :can-undo="historyState.canUndo"
              :can-redo="historyState.canRedo"
              :is-at-save-checkpoint="historyState.isAtSaveCheckpoint"
              @save="handleSave"
              @undo="handleUndo"
              @redo="handleRedo"
              @update:editMode="editMode = $event"
              @update:canvasZoom="canvasZoom = $event"
              @update:showGrid="showGrid = $event"
              @update:snapToGrid="snapToGrid = $event"
              @select-node="handleSelectNode"
              @select-location="handleSelectLocation"
              @deselect-all="handleDeselectAll"
              @update-node="handleUpdateNode"
              @update-location="handleUpdateLocation"
              @delete-node="handleDeleteNode"
              @delete-location="handleDeleteLocation"
              @create-node="handleCreateNode"
              @create-location="handleCreateLocation"
            />
          </section>

          <!-- Right: Property Panel -->
          <aside class="map-editor__properties">
            <PropertyPanel
              :current-map="currentMap"
              :selected-node="selectedNode"
              :selected-location="selectedLocation"
              :maps="mapStore.maps"
              :monsters="monsterStore.monsters"
              @update="handlePropertyUpdate"
              @update-map="handleMapUpdate"
              @delete="handleDelete"
            />
          </aside>
        </div>
      </div>

      <!-- Empty State -->
      <div v-else class="empty-canvas">
        <div class="empty-content">
          <p>请从左侧选择一个地图开始编辑</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, onUnmounted } from 'vue'
import { ElMessage } from 'element-plus'
import { Check, Warning } from '@element-plus/icons-vue'
import { useMapStore } from '@/stores/maps'
import { useMonsterStore } from '@/stores/monsters'
import MapList from '@/components/MapList.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import PropertyPanel from '@/components/PropertyPanel.vue'
import type { MapNode, MapLocation } from '@/types/map'

const mapStore = useMapStore()
const monsterStore = useMonsterStore()

const currentMapId = ref<string | null>(null)
const selectedNodeId = ref<string | null>(null)
const selectedLocationId = ref<string | null>(null)

// Toolbar state
const editMode = ref<'select' | 'move' | 'connect' | 'add-battle' | 'add-portal' | 'add-location'>('select')
const canvasZoom = ref(100)
const showGrid = ref(false)
const snapToGrid = ref(false)

const currentMap = computed(() => mapStore.currentMap)

// History state for undo/redo
const historyState = computed(() => mapStore.getHistoryState())

const mapImageUrl = computed(() => {
  if (!currentMap.value) return ''
  return `/api/maps/${currentMap.value.id}/image`
})

const selectedNode = computed(() => {
  if (!selectedNodeId.value || !currentMap.value?.nodes) return null
  return currentMap.value.nodes.find(n => n.id === selectedNodeId.value) || null
})

const selectedLocation = computed(() => {
  if (!selectedLocationId.value || !currentMap.value?.locations) return null
  return currentMap.value.locations.find(l => l.id === selectedLocationId.value) || null
})

onMounted(async () => {
  await Promise.all([mapStore.loadMaps(), monsterStore.loadMonsters()])
  if (mapStore.maps.length > 0) {
    await handleSelectMap(mapStore.maps[0].id)
  }
})

async function handleSelectMap(mapId: string) {
  currentMapId.value = mapId
  selectedNodeId.value = null
  selectedLocationId.value = null
  await mapStore.loadMap(mapId)
}

function handleSelectNode(nodeId: string) {
  selectedNodeId.value = nodeId
  selectedLocationId.value = null
}

function handleSelectLocation(locationId: string) {
  selectedLocationId.value = locationId
  selectedNodeId.value = null
}

function handleDeselectAll() {
  selectedNodeId.value = null
  selectedLocationId.value = null
}

function handleUpdateNode(node: MapNode) {
  if (!currentMap.value || !currentMap.value.nodes) return

  const nodes = [...currentMap.value.nodes]
  const index = nodes.findIndex(n => n.id === node.id)

  if (index !== -1) {
    nodes[index] = node
    const updatedMap = { ...currentMap.value, nodes }
    mapStore.updateCurrentMap(updatedMap, '更新节点')
  }
}

function handleUpdateLocation(location: MapLocation) {
  if (!currentMap.value || !currentMap.value.locations) return

  const locations = [...currentMap.value.locations]
  const index = locations.findIndex(l => l.id === location.id)

  if (index !== -1) {
    locations[index] = location
    const updatedMap = { ...currentMap.value, locations }
    mapStore.updateCurrentMap(updatedMap, '更新地点')
  }
}

function handleDeleteNode(nodeId: string) {
  if (!currentMap.value || !currentMap.value.nodes) return

  const nodes = currentMap.value.nodes.filter(n => n.id !== nodeId)

  // Also remove connections to this node
  nodes.forEach(node => {
    node.connections = node.connections.filter(id => id !== nodeId)
  })

  const updatedMap = { ...currentMap.value, nodes }
  mapStore.updateCurrentMap(updatedMap, '删除节点')
  selectedNodeId.value = null
  ElMessage.success('节点已删除')
}

function handleDeleteLocation(locationId: string) {
  if (!currentMap.value || !currentMap.value.locations) return

  const locations = currentMap.value.locations.filter(l => l.id !== locationId)
  const updatedMap = { ...currentMap.value, locations }
  mapStore.updateCurrentMap(updatedMap, '删除地点')
  selectedLocationId.value = null
  ElMessage.success('地点已删除')
}

function handleCreateNode(nodeData: Partial<MapNode>) {
  if (!currentMap.value) return

  const nodes = currentMap.value.nodes || []
  const maxNum = nodes
    .map(n => {
      const match = n.id.match(/-(\d+)$/)
      return match ? parseInt(match[1]) : 0
    })
    .reduce((max, num) => Math.max(max, num), 0)

  const newNode: MapNode = {
    id: `${currentMap.value.id}-${String(maxNum + 1).padStart(2, '0')}`,
    label: nodeData.label || '新节点',
    type: nodeData.type as any,
    position: nodeData.position!,
    connections: [],
    ...nodeData,
  }

  const updatedMap = {
    ...currentMap.value,
    nodes: [...nodes, newNode],
  }

  mapStore.updateCurrentMap(updatedMap, '创建节点')
  selectedNodeId.value = newNode.id
  ElMessage.success('节点已创建')
}

function handleCreateLocation(locationData: Partial<MapLocation>) {
  if (!currentMap.value) return

  const locations = currentMap.value.locations || []
  const maxNum = locations
    .map(l => {
      const match = l.id.match(/-(\d+)$/)
      return match ? parseInt(match[1]) : 0
    })
    .reduce((max, num) => Math.max(max, num), 0)

  const newLocation: MapLocation = {
    id: `${currentMap.value.id}-location-${maxNum + 1}`,
    name: locationData.name || '新地点',
    position: locationData.position!,
    ...locationData,
  }

  const updatedMap = {
    ...currentMap.value,
    locations: [...locations, newLocation],
  }

  mapStore.updateCurrentMap(updatedMap, '创建地点')
  selectedLocationId.value = newLocation.id
  ElMessage.success('地点已创建')
}

function handlePropertyUpdate(item: MapNode | MapLocation) {
  if ('type' in item) {
    handleUpdateNode(item)
  } else {
    handleUpdateLocation(item)
  }
}

function handleMapUpdate(updatedMap: any) {
  mapStore.updateCurrentMap(updatedMap, '更新地图属性')
}

function handleDelete() {
  if (selectedNodeId.value) {
    handleDeleteNode(selectedNodeId.value)
  } else if (selectedLocationId.value) {
    handleDeleteLocation(selectedLocationId.value)
  }
}

async function handleSave() {
  if (!currentMap.value) return

  try {
    await mapStore.saveMap(currentMap.value)
    ElMessage.success('保存成功')
  } catch (error) {
    console.error(error)
    ElMessage.error('保存失败')
  }
}

function handleCreateMap() {
  ElMessage.info('创建地图功能待实现')
}

// Undo/Redo handlers
function handleUndo() {
  if (mapStore.undo()) {
    ElMessage.success('撤销成功')
  }
}

function handleRedo() {
  if (mapStore.redo()) {
    ElMessage.success('重做成功')
  }
}

// Keyboard shortcuts for undo/redo
function handleKeyDown(event: KeyboardEvent) {
  if (!currentMap.value) return

  // Only handle shortcuts when not in input fields
  if (event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement) {
    return
  }

  // Ctrl+Z for undo
  if (event.ctrlKey && event.key === 'z' && !event.shiftKey) {
    event.preventDefault()
    handleUndo()
  }

  // Ctrl+Y or Ctrl+Shift+Z for redo
  if ((event.ctrlKey && event.key === 'y') ||
      (event.ctrlKey && event.shiftKey && event.key === 'z')) {
    event.preventDefault()
    handleRedo()
  }
}

// Add keyboard event listener
onMounted(() => {
  document.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
.map-editor {
  display: flex;
  height: 100vh;
  padding: 0 0px 0px 0px;
  gap: 16px;
}

.map-editor__sidebar {
  flex-shrink: 0;
  width: 180px;
  padding-top: 12px;
}

.map-editor__main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.map-editor__toolbar {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  gap: 16px;
  flex-shrink: 0;
  margin-bottom: 16px;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-group.ml-auto {
  margin-left: auto;
}

.save-status-indicator {
  display: flex;
  align-items: center;
  font-size: 13px;
}

.saved-indicator,
.unsaved-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
}

.saved-indicator {
  color: #67c23a;
}

.unsaved-indicator {
  color: #e6a23c;
}

.map-info {
  display: flex;
  gap: 8px;
}

.map-editor__content {
  display: grid;
  grid-template-columns: 2fr 480px;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.map-editor__sidebar {
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  padding: 16px;
  overflow-y: auto;
}

.map-editor__properties {
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  padding: 16px;
  overflow-y: auto;
}

.map-editor__canvas {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.empty-canvas {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  color: #909399;
}

@media (max-width: 1400px) {
  .map-editor {
    flex-direction: column;
  }

  .map-editor__sidebar {
    width: 100%;
    max-height: 200px;
  }
}

@media (max-width: 1200px) {
  .map-editor__content {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
}
</style>
