<template>
  <div class="map-canvas-container">

    <!-- Canvas -->
    <div
      class="editor-map-canvas"
      :style="{ transform: `scale(${canvasZoom / 100})` }"
      @click="handleCanvasClick"
    >
      <!-- Background image -->
      <img
        v-if="imageUrl"
        class="map-image"
        :src="imageUrl"
        :alt="map.name"
      />

      <!-- Grid overlay -->
      <svg
        v-if="showGrid"
        class="grid-overlay"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="grid" width="5" height="5" patternUnits="userSpaceOnUse">
            <path
              d="M 5 0 L 0 0 0 5"
              fill="none"
              stroke="rgba(255,255,255,0.1)"
              stroke-width="0.1"
            />
          </pattern>
        </defs>
        <rect width="100" height="100" fill="url(#grid)" />
        <line
          v-for="i in 10"
          :key="`v${i}`"
          :x1="i * 10"
          y1="0"
          :x2="i * 10"
          y2="100"
          stroke="rgba(255,255,255,0.2)"
          stroke-width="0.15"
        />
        <line
          v-for="i in 10"
          :key="`h${i}`"
          x1="0"
          :y1="i * 10"
          x2="100"
          :y2="i * 10"
          stroke="rgba(255,255,255,0.2)"
          stroke-width="0.15"
        />
      </svg>

      <!-- Connection lines (SVG) -->
      <svg class="node-graph" viewBox="0 0 100 100" preserveAspectRatio="none">
        <line
          v-for="edge in edges"
          :key="edge.id"
          class="graph-edge"
          :class="{
            editing: connectingFrom === edge.from.id,
            selected: selectedEdge?.id === edge.id,
          }"
          :x1="edge.from.position.x"
          :y1="edge.from.position.y"
          :x2="edge.to.position.x"
          :y2="edge.to.position.y"
          @click.stop="handleEdgeClick(edge)"
        />
        
        <!-- Temporary connection line when connecting -->
        <line
          v-if="connectingFrom && tempConnectionTarget"
          class="graph-edge editing"
          :x1="connectingNode!.position.x"
          :y1="connectingNode!.position.y"
          :x2="tempConnectionTarget.x"
          :y2="tempConnectionTarget.y"
        />
      </svg>

      <!-- Wild map nodes -->
      <button
        v-for="node in nodes"
        :key="node.id"
        class="node-marker"
        :class="[
          `node-type-${node.type}`,
          {
            active: node.id === selectedNodeId,
            dragging: node.id === draggingNodeId,
            connectable: isConnectMode && connectingFrom !== node.id,
          },
        ]"
        :style="nodeStyle(node)"
        @mousedown="handleNodeMouseDown(node, $event)"
        @click.stop="handleNodeClick(node)"
      >
        <span class="node-label">{{ node.label }}</span>
      </button>

      <!-- City map locations -->
      <button
        v-for="location in locations"
        :key="location.id"
        class="map-location"
        :class="{ active: location.id === selectedNodeId }"
        :style="locationStyle(location)"
        @mousedown="handleLocationMouseDown(location, $event)"
        @click.stop="handleLocationClick(location)"
      >
        <span class="location-label">{{ location.name }}</span>
      </button>
    </div>

    <!-- Hint text -->
    <div v-if="hintText" class="canvas-hint">
      {{ hintText }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { MapMetadata, MapNode, MapLocation, Edge, EditMode } from '@/types/map'

const props = defineProps<{
  map: MapMetadata
  imageUrl: string
  saving: boolean
  editMode: 'select' | 'move' | 'connect' | 'add-battle' | 'add-portal' | 'add-location'
  canvasZoom: number
  showGrid: boolean
  snapToGrid: boolean
  canUndo: boolean
  canRedo: boolean
  isAtSaveCheckpoint: boolean
}>()

const emit = defineEmits<{
  save: []
  undo: []
  redo: []
  'update:editMode': [mode: 'select' | 'move' | 'connect' | 'add-battle' | 'add-portal' | 'add-location']
  'update:canvasZoom': [zoom: number]
  'update:showGrid': [show: boolean]
  'update:snapToGrid': [snap: boolean]
  selectNode: [id: string]
  selectLocation: [id: string]
  deselectAll: []
  updateNode: [node: MapNode]
  updateLocation: [location: MapLocation]
  deleteNode: [id: string]
  deleteLocation: [id: string]
  createNode: [node: Partial<MapNode>]
  createLocation: [location: Partial<MapLocation>]
}>()

// Use props for toolbar state
const mode = computed(() => props.editMode)
const canvasZoom = computed(() => props.canvasZoom)
const showGrid = computed(() => props.showGrid)
const snapToGrid = computed(() => props.snapToGrid)
const selectedNodeId = ref<string | null>(null)
const selectedEdge = ref<Edge | null>(null)
const draggingNodeId = ref<string | null>(null)
const connectingFrom = ref<string | null>(null)
const tempConnectionTarget = ref<{ x: number; y: number } | null>(null)


const nodes = computed(() => props.map.nodes || [])
const locations = computed(() => props.map.locations || [])

const isConnectMode = computed(() => mode.value === 'connect')
const connectingNode = computed(() =>
  connectingFrom.value ? nodes.value.find(n => n.id === connectingFrom.value) : null
)

const edges = computed(() => {
  const result: Edge[] = []
  nodes.value.forEach(node => {
    node.connections.forEach(targetId => {
      const target = nodes.value.find(n => n.id === targetId)
      if (target) {
        result.push({
          id: `${node.id}->${targetId}`,
          from: node,
          to: target,
        })
      }
    })
  })
  return result
})

const hintText = computed(() => {
  if (mode.value === 'connect' && connectingFrom.value) {
    return '点击目标节点建立连接，或点击 ESC 取消'
  }
  if (mode.value.startsWith('add-')) {
    return '点击画布添加节点'
  }
  return ''
})

function nodeStyle(node: MapNode) {
  return {
    left: `${node.position.x}%`,
    top: `${node.position.y}%`,
  }
}

function locationStyle(location: MapLocation) {
  return {
    left: `${location.position.x}%`,
    top: `${location.position.y}%`,
  }
}

function handleNodeMouseDown(node: MapNode, event: MouseEvent) {
  if (mode.value === 'connect') {
    return
  }

  if (mode.value !== 'move' && mode.value !== 'select') return

  event.preventDefault()
  event.stopPropagation()

  selectedNodeId.value = node.id
  emit('selectNode', node.id)

  if (mode.value !== 'move') return

  draggingNodeId.value = node.id

  const canvas = (event.target as HTMLElement).closest('.editor-map-canvas')
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()

  const handleMouseMove = (e: MouseEvent) => {
    let x = ((e.clientX - rect.left) / rect.width) * 100
    let y = ((e.clientY - rect.top) / rect.height) * 100

    if (snapToGrid.value) {
      x = Math.round(x / 5) * 5
      y = Math.round(y / 5) * 5
    }

    x = Math.max(0, Math.min(100, x))
    y = Math.max(0, Math.min(100, y))

    const updated = { ...node, position: { x, y } }
    emit('updateNode', updated)
  }

  const handleMouseUp = () => {
    draggingNodeId.value = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

function handleLocationMouseDown(location: MapLocation, event: MouseEvent) {
  if (mode.value !== 'move' && mode.value !== 'select') return

  event.preventDefault()
  event.stopPropagation()

  selectedNodeId.value = location.id
  emit('selectLocation', location.id)

  if (mode.value !== 'move') return

  draggingNodeId.value = location.id

  const canvas = (event.target as HTMLElement).closest('.editor-map-canvas')
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()

  const handleMouseMove = (e: MouseEvent) => {
    let x = ((e.clientX - rect.left) / rect.width) * 100
    let y = ((e.clientY - rect.top) / rect.height) * 100

    if (snapToGrid.value) {
      x = Math.round(x / 5) * 5
      y = Math.round(y / 5) * 5
    }

    x = Math.max(0, Math.min(100, x))
    y = Math.max(0, Math.min(100, y))

    const updated = { ...location, position: { x, y } }
    emit('updateLocation', updated)
  }

  const handleMouseUp = () => {
    draggingNodeId.value = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', handleMouseUp)
  }

  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseup', handleMouseUp)
}

function handleNodeClick(node: MapNode) {
  if (mode.value === 'connect') {
    if (!connectingFrom.value) {
      connectingFrom.value = node.id
    } else if (connectingFrom.value === node.id) {
      connectingFrom.value = null
      tempConnectionTarget.value = null
    } else {
      const fromNode = nodes.value.find(n => n.id === connectingFrom.value)
      if (fromNode && !fromNode.connections.includes(node.id)) {
        const updated = {
          ...fromNode,
          connections: [...fromNode.connections, node.id],
        }
        emit('updateNode', updated)
      }
      connectingFrom.value = null
      tempConnectionTarget.value = null
    }
  } else {
    selectedNodeId.value = node.id
    emit('selectNode', node.id)
  }
}

function handleLocationClick(location: MapLocation) {
  selectedNodeId.value = location.id
  emit('selectLocation', location.id)
}

function handleEdgeClick(edge: Edge) {
  console.log('Edge clicked:', edge.id)
  selectedEdge.value = edge
  selectedNodeId.value = null
  // Prevent the click from bubbling up to canvas
  event?.stopPropagation()
}

function handleCanvasClick(event: MouseEvent) {
  // Don't deselect if we're clicking on an edge or node
  if (event.target !== event.currentTarget) {
    return
  }

  if (!mode.value.startsWith('add-')) {
    selectedNodeId.value = null
    selectedEdge.value = null
    emit('deselectAll')
    return
  }

  const canvas = event.currentTarget as HTMLElement
  const rect = canvas.getBoundingClientRect()

  let x = ((event.clientX - rect.left) / rect.width) * 100
  let y = ((event.clientY - rect.top) / rect.height) * 100

  if (snapToGrid.value) {
    x = Math.round(x / 5) * 5
    y = Math.round(y / 5) * 5
  }

  x = Math.max(0, Math.min(100, x))
  y = Math.max(0, Math.min(100, y))

  if (mode.value === 'add-battle' || mode.value === 'add-portal') {
    const newNode: Partial<MapNode> = {
      label: `新节点`,
      type: mode.value === 'add-battle' ? 'battle' : 'portal',
      position: { x, y },
      connections: [],
    }

    if (mode.value === 'add-battle') {
      newNode.spawn = {
        min: 2,
        max: 3,
        intervalSeconds: 900,
        respawnSeconds: 60,
        monsters: [],
      }
    } else {
      newNode.destination = {
        mapId: '',
      }
    }

    emit('createNode', newNode)
    mode.value = 'select'
  } else if (mode.value === 'add-location') {
    const newLocation: Partial<MapLocation> = {
      name: '新地点',
      position: { x, y },
    }

    emit('createLocation', newLocation)
    mode.value = 'select'
  }
}


// Handle keyboard shortcuts
function handleKeyDown(e: KeyboardEvent) {
  console.log('Key pressed:', e.key, 'selectedEdge:', selectedEdge.value?.id, 'selectedNodeId:', selectedNodeId.value)

  // Prevent delete from working when typing in input fields
  if (e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement) {
    console.log('Key event ignored - target is input field')
    return
  }

  if (e.key === 'Delete' || e.key === 'Backspace') {
    console.log(`${e.key} key pressed, processing...`)
    e.preventDefault()

    if (selectedNodeId.value) {
      console.log('Deleting node:', selectedNodeId.value)
      if (props.map.category === 'wild') {
        emit('deleteNode', selectedNodeId.value)
      } else {
        emit('deleteLocation', selectedNodeId.value)
      }
      selectedNodeId.value = null
    } else if (selectedEdge.value) {
      console.log('Deleting edge:', selectedEdge.value.id)
      const fromNode = nodes.value.find(n => n.id === selectedEdge.value!.from.id)
      if (fromNode) {
        const updated = {
          ...fromNode,
          connections: fromNode.connections.filter(id => id !== selectedEdge.value!.to.id),
        }
        console.log('Updated node connections:', updated.connections)
        emit('updateNode', updated)
      }
      selectedEdge.value = null
    } else {
      console.log(`${e.key} pressed but nothing selected`)
    }
  } else if (e.key === 'Escape') {
    connectingFrom.value = null
    tempConnectionTarget.value = null
    emit('update:editMode', 'select')
  }
}

// Track mouse for temporary connection line
function handleCanvasMouseMove(e: MouseEvent) {
  if (mode.value === 'connect' && connectingFrom.value) {
    const canvas = (e.target as HTMLElement).closest('.editor-map-canvas')
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 100
    const y = ((e.clientY - rect.top) / rect.height) * 100
    tempConnectionTarget.value = { x, y }
  }
}

watch(() => props.map, () => {
  selectedNodeId.value = null
  selectedEdge.value = null
  connectingFrom.value = null
  emit('update:editMode', 'select')
})

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', handleKeyDown)
  window.addEventListener('mousemove', handleCanvasMouseMove)
}
</script>

<style scoped>
.map-canvas-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  flex-wrap: wrap;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-group.ml-auto {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 12px;
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

.editor-map-canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  background: #0a0e14;
  border-radius: 12px;
  overflow: hidden;
  transform-origin: top left;
}

.map-image {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
  pointer-events: none;
}

.grid-overlay {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 1;
}

.node-graph {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  pointer-events: none;
  z-index: 5;
}

.graph-edge {
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 0.3;
  fill: none;
  transition: stroke 0.2s ease;
  pointer-events: stroke;
  cursor: pointer;
}

.graph-edge:hover {
  stroke: rgba(59, 130, 246, 0.6);
  stroke-width: 0.5;
}

.graph-edge.selected {
  stroke: rgba(59, 130, 246, 0.8);
  stroke-width: 0.5;
}

.graph-edge.editing {
  stroke: rgba(251, 191, 36, 0.8);
  stroke-width: 0.4;
  stroke-dasharray: 2 1;
  animation: dash 1s linear infinite;
}

@keyframes dash {
  to {
    stroke-dashoffset: -3;
  }
}

.node-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.35rem 0.7rem;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(17, 28, 38, 0.85);
  color: #f0f0f0;
  cursor: pointer;
  font-weight: 600;
  transition: transform 0.15s ease, background 0.2s ease, border-color 0.2s ease, opacity 0.2s ease;
  z-index: 10;
}

.node-marker:hover,
.node-marker:focus {
  transform: translate(-50%, -50%) scale(1.04);
  border-color: rgba(90, 177, 255, 0.9);
  background: rgba(28, 48, 64, 0.95);
  outline: none;
}

.node-marker.dragging {
  cursor: grabbing;
  z-index: 100;
  opacity: 0.8;
}

.node-marker.active {
  border-color: #5ab1ff;
  background: linear-gradient(
    135deg,
    rgba(59, 130, 246, 0.95),
    rgba(14, 165, 233, 0.9)
  );
  color: #f8fafc;
  box-shadow: 0 6px 20px rgba(15, 23, 42, 0.45);
}

.node-marker.connectable {
  animation: pulse 1s ease-in-out infinite;
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(59, 130, 246, 0.7);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(59, 130, 246, 0);
  }
}

.node-marker.node-type-portal {
  border-style: dashed;
}

.map-location {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.6rem 0.9rem;
  border-radius: 10px;
  font-size: 0.95rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(16, 24, 32, 0.85);
  border: 2px solid rgba(34, 211, 238, 0.5);
  cursor: pointer;
  transition: all 0.25s ease;
  z-index: 10;
}

.map-location:hover {
  background: rgba(16, 24, 32, 0.95);
  border-color: rgba(34, 211, 238, 0.8);
  transform: translate(-50%, -50%) scale(1.05);
}

.map-location.active {
  background: rgba(34, 211, 238, 0.2);
  border-color: rgba(34, 211, 238, 1);
}

.node-label,
.location-label {
  white-space: nowrap;
}

.canvas-hint {
  padding: 8px 16px;
  background: #409eff;
  color: white;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
}
</style>
