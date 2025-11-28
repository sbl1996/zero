<template>
  <div v-if="mapsList.length && currentMap">
    <div v-if="isCityMap" class="city-layout">
      <PlayerStatusPanel />
      <section class="city-main">
        <header class="map-header">
          <h3 class="map-name">{{ currentMap.name }}</h3>
          <p class="map-tip">选择区域进入对应功能，或在驿站前往其他区域。</p>
        </header>
        <div class="map-canvas">
          <img class="map-image" :src="currentMap.image" :alt="`${currentMap.name} 地图`" />
          <button
            v-for="location in visibleLocations"
            :key="location.id"
            type="button"
            class="map-location"
            :class="{ locked: isLocationLocked(location) }"
            :style="markerStyle(location)"
            :disabled="isLocationLocked(location)"
            @click="goToLocation(location)"
            @mouseenter="setFocusedLocation(location.id)"
            @mouseleave="clearFocusedLocation"
            @focus="setFocusedLocation(location.id)"
            @blur="clearFocusedLocation"
          >
            <span class="location-label">{{ location.name }}</span>
          </button>
        </div>
        <footer class="location-detail" v-if="focusedLocation">
          <h4 class="location-title">{{ focusedLocation.name }}</h4>
          <p v-if="focusedLocationLocked" class="location-description">尚未解锁。</p>
          <p v-else class="location-description">
            {{ focusedLocation.description ?? '点击以进入该地点。' }}
          </p>
          <div v-if="focusedLocation.id === travelHubId && !focusedLocationLocked" class="location-actions">
            <button type="button" class="primary-button" @click="openTravelPanel">
              打开驿站目的地
            </button>
          </div>
        </footer>
        <section v-if="travelPanelOpen" class="travel-panel">
          <header class="travel-panel__header">
            <div>
              <p class="travel-panel__eyebrow">驿站传送</p>
              <h4 class="travel-panel__title">选择目的地</h4>
            </div>
            <button type="button" class="ghost-button" @click="closeTravelPanel">关闭</button>
          </header>
          <p class="travel-panel__hint">
            已解锁区域可直接前往。抵达后可继续从当地的传送点探索。
          </p>
          <div v-if="travelTargets.length" class="travel-grid">
            <button
              v-for="map in travelTargets"
              :key="map.id"
              type="button"
              class="travel-card"
              @click="travelToMap(map.id)"
            >
              <span class="travel-card__name">{{ map.name }}</span>
              <span class="travel-card__meta">
                {{ map.category === 'city' ? '城市' : '野外' }}
              </span>
            </button>
          </div>
          <p v-else class="travel-panel__empty">暂无其他已解锁的目的地。</p>
        </section>
      </section>
    </div>
    <div v-else>
      <div v-if="currentMapLocked" class="map-locked">
        <h3 class="map-locked__title">区域尚未解锁</h3>
        <p class="map-locked__hint">完成前置挑战以开放该野外区域。</p>
        <button type="button" class="return-button" @click="returnToCity">返回翡冷翠</button>
      </div>
      <div v-else class="wild-layout">
        <PlayerStatusPanel />
        <section class="wild-main">
          <header class="wild-header">
            <div class="wild-header__info">
              <h3 class="map-name">{{ currentMap.name }}</h3>
            </div>
            <button type="button" class="return-button" @click="returnToCity">
              返回翡冷翠
            </button>
          </header>
          <div class="wild-content">
            <div class="wild-map-canvas">
              <img class="map-image" :src="currentMap.image" :alt="`${currentMap.name} 地图`" />
              <svg class="node-graph" viewBox="0 0 100 100" preserveAspectRatio="none">
                <line
                  v-for="edge in nodeEdges"
                  :key="edge.id"
                  class="graph-edge"
                  :x1="edge.from.position.x"
                  :y1="edge.from.position.y"
                  :x2="edge.to.position.x"
                  :y2="edge.to.position.y"
                />
              </svg>
              <button
                v-for="node in mapNodes"
                :key="node.id"
                type="button"
                class="node-marker"
                :class="[
                  `node-type-${node.type}`,
                  { active: node.id === activeNodeId }
                ]"
                :style="nodeStyle(node)"
                :disabled="!canSelectNode(node)"
                @click="selectNode(node.id)"
                @mouseenter="nodeHint = null"
                @focus="nodeHint = null"
              >
                <span class="node-label">{{ node.label }}</span>
              </button>
              <NpcDialoguePanel />
            </div>
            <aside class="node-sidebar">
              <div class="node-header">
                <h4 class="node-title">{{ currentNode?.label ?? '未选择节点' }}</h4>
                <p v-if="nodeHint" class="node-hint">{{ nodeHint }}</p>
              </div>
              <p v-if="currentNode?.description" class="node-description">
                {{ currentNode.description }}
              </p>
              <div class="node-list">
                <p v-if="!nodeListEntries.length" class="node-list__empty">
                  这里空荡荡的...
                </p>
                <ul v-else class="node-entry-list">
                  <li v-for="entry in nodeListEntries" :key="entry.key">
                    <button
                      type="button"
                      class="node-entry"
                      :class="[
                        `node-entry--${entry.kind}`,
                        {
                          locked: entry.kind === 'portal' && entry.locked,
                          boss: entry.kind === 'monster' && entry.monster?.isBoss
                        }
                      ]"
                      :disabled="entry.kind === 'portal' && entry.locked"
                      @mouseenter="handleEntryHover(entry)"
                      @mouseleave="handleEntryLeave(entry)"
                      @focus="handleEntryHover(entry)"
                      @blur="handleEntryLeave(entry)"
                      @click="handleEntryClick(entry)"
                    >
                      <span class="node-entry__title">
                        <template v-if="entry.kind === 'monster'">
                          {{ entry.monster?.name ?? entry.monsterId }}
                        </template>
                        <template v-else-if="entry.kind === 'npc'">
                          {{ entry.name }}
                        </template>
                        <template v-else>
                          {{ entry.label }}
                        </template>
                      </span>
                      <span class="node-entry__meta">
                        <template v-if="entry.kind === 'monster'">
                          {{ entry.monster ? describeMonsterRealm(entry.monster) : '未知等级' }}
                        </template>
                        <template v-else-if="entry.kind === 'npc'">
                          NPC
                        </template>
                        <template v-else>
                          {{ entry.locked ? '未解锁' : '传送' }}
                        </template>
                      </span>
                    </button>
                  </li>
                </ul>
              </div>
            </aside>
          </div>
          <div class="monster-detail" v-if="focusedMonster">
            <h4 class="monster-name" :class="{ 'boss-name': focusedMonster.isBoss }">
              {{ focusedMonster.name }}
              <span v-if="focusedMonster.isBoss" class="monster-badge">BOSS</span>
              <span
                v-else
                class="monster-badge specialization-badge"
                :style="monsterBadgeStyle(focusedMonster.specialization)"
              >
                {{ getSpecializationLabel(focusedMonster.specialization) }}
              </span>
            </h4>
            <div class="monster-stats">
              <div class="stat-group">
                <span class="stat-label">境界</span>
                <span class="stat-value">{{ describeMonsterRealm(focusedMonster) }}</span>
              </div>
              <div class="stat-group">
                <span class="stat-label">生命</span>
                <span class="stat-value">{{ focusedMonster.hp }}</span>
              </div>
              <div class="stat-group">
                <span class="stat-label">攻击</span>
                <span class="stat-value">{{ focusedMonster.stats.ATK }}</span>
              </div>
              <div class="stat-group">
                <span class="stat-label">防御</span>
                <span class="stat-value">{{ focusedMonster.stats.DEF }}</span>
              </div>
              <div class="stat-group">
                <span class="stat-label">敏捷</span>
                <span class="stat-value">{{ focusedMonster.stats.AGI }}</span>
              </div>
              <div class="stat-group reward">
                <span class="stat-label">奖励</span>
                <span class="stat-value">{{ formatMonsterRewards(focusedMonster) }}</span>
              </div>
            </div>
          </div>
          <div v-else class="monster-detail placeholder">
            {{
              currentNode?.description
                ?? (currentMap.description || '探索此地，寻找挑战与机遇。')
            }}
          </div>
        </section>
      </div>
    </div>
  </div>
  <div v-else class="map-empty">
    暂无可用地图。
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import NpcDialoguePanel from '@/components/NpcDialoguePanel.vue'
import { defaultMapId, maps as mapDefinitions } from '@/data/maps'
import { NPC_MAP } from '@/data/npcs'
import { MONSTERS } from '@/data/monsters'
import { formatMonsterRewards, describeMonsterRealm } from '@/utils/monsterUtils'
import { useBattleStore } from '@/stores/battle'
import { usePlayerStore } from '@/stores/player'
import { useProgressStore } from '@/stores/progress'
import { useNodeSpawnStore } from '@/stores/nodeSpawns'
import { useNpcDialogStore } from '@/stores/npcDialog'
import type { GameMap, MapLocation, MapNode } from '@/types/map'
import type { Monster, MonsterSpecialization } from '@/types/domain'

const route = useRoute()
const router = useRouter()

const battle = useBattleStore()
const progress = useProgressStore()
const player = usePlayerStore()
const nodeSpawns = useNodeSpawnStore()
const npcDialog = useNpcDialogStore()

const monsterDictionary = MONSTERS.reduce<Record<string, Monster>>((acc, monster) => {
  acc[monster.id] = monster
  return acc
}, {})

const travelHubId = 'courier-station'

type NodeListEntry =
  | {
      kind: 'monster'
      key: string
      instanceId: string
      monsterId: string
      monster?: Monster
    }
  | {
      kind: 'npc'
      key: string
      id: string
      name: string
      title?: string
    }
  | {
      kind: 'portal'
      key: string
      label: string
      locked: boolean
    }

function getSpecializationLabel(specialization: MonsterSpecialization): string {
  const labels: Record<MonsterSpecialization, string> = {
    balanced: '均衡',
    attacker: '攻击',
    defender: '防御',
    agile: '敏捷',
    bruiser: '重装',
    skirmisher: '游击',
    mystic: '奥术',
    crazy: '疯狂',
  }
  return labels[specialization] || '未知'
}

function getSpecializationColor(
  specialization: MonsterSpecialization,
): { bg: string; text: string; border: string } {
  const colors: Record<MonsterSpecialization, { bg: string; text: string; border: string }> = {
    balanced: { bg: 'rgba(156, 163, 175, 0.7)', text: '#f3f4f6', border: 'rgba(156, 163, 175, 0.9)' },
    attacker: { bg: 'rgba(239, 68, 68, 0.7)', text: '#fef2f2', border: 'rgba(239, 68, 68, 0.9)' },
    defender: { bg: 'rgba(59, 130, 246, 0.7)', text: '#eff6ff', border: 'rgba(59, 130, 246, 0.9)' },
    agile: { bg: 'rgba(34, 197, 94, 0.7)', text: '#f0fdf4', border: 'rgba(34, 197, 94, 0.9)' },
    bruiser: { bg: 'rgba(168, 85, 247, 0.7)', text: '#faf5ff', border: 'rgba(168, 85, 247, 0.9)' },
    skirmisher: { bg: 'rgba(251, 146, 60, 0.7)', text: '#fff7ed', border: 'rgba(251, 146, 60, 0.9)' },
    mystic: { bg: 'rgba(139, 92, 246, 0.7)', text: '#f5f3ff', border: 'rgba(139, 92, 246, 0.9)' },
    crazy: { bg: 'rgba(217, 70, 239, 0.7)', text: '#fdf4ff', border: 'rgba(217, 70, 239, 0.9)' },
  }
  return colors[specialization] || { bg: 'rgba(107, 114, 128, 0.7)', text: '#f9fafb', border: 'rgba(107, 114, 128, 0.9)' }
}

const now = ref(Date.now())
let nowTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (typeof window !== 'undefined') {
    nowTimer = window.setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
})

onBeforeUnmount(() => {
  if (nowTimer) {
    clearInterval(nowTimer)
    nowTimer = null
  }
})

const mapsList = computed(() => mapDefinitions.filter((map) => !isMapLocked(map)))
const fallbackMap = computed(() => {
  const defaultTarget = mapsList.value.find((map) => map.id === defaultMapId)
  return defaultTarget ?? mapsList.value[0] ?? null
})

const activeMapId = computed(() => {
  if (typeof route.params.mapId === 'string') {
    return route.params.mapId
  }
  const savedId = progress.currentMapId
  const savedMap = getMapById(savedId)
  if (savedMap && !isMapLocked(savedMap)) {
    return savedId
  }
  return fallbackMap.value?.id
})

function getMapById(id: string | undefined) {
  if (!id) return undefined
  return mapDefinitions.find((map) => map.id === id)
}

function isMapLocked(map: GameMap | undefined) {
  if (!map) return false
  if (map.category === 'wild') {
    return !progress.isMapUnlocked(map.id)
  }
  return false
}

watch(
  () => route.params.mapId,
  (mapId) => {
    if (!mapsList.value.length || !fallbackMap.value) return
    const id = typeof mapId === 'string' ? mapId : undefined
    const target = getMapById(id)

    if (!target || isMapLocked(target)) {
      const savedMapId = progress.currentMapId
      const savedTarget = getMapById(savedMapId)
      if (savedTarget && !isMapLocked(savedTarget)) {
        router.replace({ name: 'map', params: { mapId: savedMapId } })
      } else {
        router.replace({ name: 'map', params: { mapId: fallbackMap.value.id } })
      }
    } else {
      progress.setCurrentMap(target.id)
    }
  },
  { immediate: true },
)

const currentMap = computed(() => {
  if (!mapsList.value.length) return null
  const id = activeMapId.value
  const target = getMapById(id)
  if (!target || isMapLocked(target)) {
    return fallbackMap.value
  }
  return target
})

const visibleLocations = computed<MapLocation[]>(() => {
  if (!currentMap.value) return []
  return currentMap.value.locations.filter((location) => !isLocationLocked(location))
})

const isCityMap = computed(() => currentMap.value?.category === 'city')

const mapNodes = computed<MapNode[]>(() => {
  if (!currentMap.value || currentMap.value.category !== 'wild') return []
  return currentMap.value.nodes ?? []
})

const activeNodeId = computed(() => {
  const map = currentMap.value
  if (!map || map.category !== 'wild') return null
  const stored = progress.currentNodeId(map.id)
  if (stored && map.nodes?.some((node) => node.id === stored)) {
    return stored
  }
  const fallbackNode = map.nodes?.[0]?.id ?? null
  return map.defaultNodeId ?? fallbackNode ?? null
})

watch(
  () => ({ map: currentMap.value, nodeId: activeNodeId.value }),
  ({ map, nodeId }) => {
    if (!map || map.category !== 'wild' || !nodeId) return
    if (progress.currentNodeId(map.id) !== nodeId) {
      progress.setCurrentNode(map.id, nodeId)
    }
    const node = map.nodes?.find((entry) => entry.id === nodeId)
    if (node) {
      nodeSpawns.ensureInitialized(map.id, node)
    }
  },
  { immediate: true },
)

const currentNode = computed<MapNode | null>(() => {
  if (!mapNodes.value.length) return null
  const id = activeNodeId.value
  if (!id) return mapNodes.value[0] ?? null
  return mapNodes.value.find((node) => node.id === id) ?? mapNodes.value[0] ?? null
})

const nodeEdges = computed(() => {
  const edges: Array<{ id: string; from: MapNode; to: MapNode }> = []
  const seen = new Set<string>()
  const nodes = mapNodes.value
  nodes.forEach((node) => {
    node.connections.forEach((targetId) => {
      const target = nodes.find((entry) => entry.id === targetId)
      if (!target) return
      const key = [node.id, target.id].sort().join(':')
      if (seen.has(key)) return
      seen.add(key)
      edges.push({ id: key, from: node, to: target })
    })
  })
  return edges
})

const currentMapLocked = computed(() => {
  const map = currentMap.value
  if (!map) return false
  return isMapLocked(map)
})

const focusedLocationId = ref<string | null>(null)
const focusedMonsterId = ref<string | null>(null)
const nodeHint = ref<string | null>(null)
const travelPanelOpen = ref(false)

const focusedLocation = computed<MapLocation | null>(() => {
  if (!focusedLocationId.value) return null
  return visibleLocations.value.find((location) => location.id === focusedLocationId.value) ?? null
})

function isLocationLocked(location: MapLocation) {
  if (location.destinationMapId) {
    const target = getMapById(location.destinationMapId)
    if (target && target.category === 'wild') {
      return !progress.isMapUnlocked(target.id)
    }
  }
  return false
}

const focusedLocationLocked = computed(() => {
  if (!focusedLocation.value) return false
  return isLocationLocked(focusedLocation.value)
})

const currentNodeState = computed(() => {
  if (!currentNode.value) return null
  return nodeSpawns.nodeStates[currentNode.value.id] ?? null
})

const travelTargets = computed(() => {
  if (!currentMap.value) return []
  return mapsList.value.filter((map) => map.id !== currentMap.value?.id)
})

const monsterEntries = computed(() => {
  if (!currentNodeState.value) return []
  return currentNodeState.value.instances.map((instance) => ({
    ...instance,
    monster: monsterDictionary[instance.monsterId],
  }))
})

const npcListEntries = computed<NodeListEntry[]>(() => {
  const node = currentNode.value
  if (!node?.npcs?.length) return []
  return node.npcs.map((npcId, index) => {
    const definition = NPC_MAP[npcId]
    return {
      kind: 'npc' as const,
      key: `npc-${npcId}-${index}`,
      id: npcId,
      name: definition?.name ?? npcId,
      title: definition?.title,
    }
  })
})

const portalEntry = computed<NodeListEntry | null>(() => {
  if (!currentNode.value?.destination) return null
  const targetMap = getMapById(currentNode.value.destination.mapId)
  return {
    kind: 'portal',
    key: `portal-${currentNode.value.id}`,
    label: targetMap?.name ?? currentNode.value.destination.mapId,
    locked: destinationLocked.value,
  }
})

const nodeListEntries = computed<NodeListEntry[]>(() => {
  const entries: NodeListEntry[] = []
  monsterEntries.value.forEach((entry) => {
    entries.push({
      kind: 'monster',
      key: `monster-${entry.instanceId}`,
      instanceId: entry.instanceId,
      monsterId: entry.monsterId,
      monster: entry.monster,
    })
  })
  npcListEntries.value.forEach((entry) => entries.push(entry))
  if (portalEntry.value) {
    entries.push(portalEntry.value)
  }
  return entries
})

const focusedMonster = computed(() => {
  if (!focusedMonsterId.value) return null
  return monsterDictionary[focusedMonsterId.value] ?? null
})

function markerStyle(location: MapLocation) {
  return {
    left: `${location.position.x}%`,
    top: `${location.position.y}%`,
  }
}

function nodeStyle(node: MapNode) {
  return {
    left: `${node.position.x}%`,
    top: `${node.position.y}%`,
  }
}

function canSelectNode(node: MapNode) {
  if (currentMapLocked.value) return false
  if (!currentNode.value) return true
  if (currentNode.value.id === node.id) return true
  return (
    currentNode.value.connections.includes(node.id) ||
    node.connections.includes(currentNode.value.id)
  )
}

const destinationLocked = computed(() => isPortalLocked(currentNode.value))

function selectNode(nodeId: string) {
  if (!currentMap.value || currentMap.value.category !== 'wild') return
  const target = currentMap.value.nodes?.find((node) => node.id === nodeId)
  if (!target) return
  if (!canSelectNode(target)) {
    nodeHint.value = '该节点与当前位置未直接连通。'
    return
  }
  if (target.type === 'portal') {
    travelThroughPortal(target)
    return
  }
  nodeHint.value = null
  focusedMonsterId.value = null
  progress.setCurrentNode(currentMap.value.id, target.id)
  nodeSpawns.ensureInitialized(currentMap.value.id, target)
}

function isPortalLocked(node: MapNode | null | undefined) {
  if (!node?.destination) return false
  const target = getMapById(node.destination.mapId)
  if (!target) return true
  if (target.category === 'wild') {
    return !progress.isMapUnlocked(target.id)
  }
  return false
}

function travelThroughPortal(source?: MapNode | null) {
  const portalNode = source ?? currentNode.value
  if (!portalNode?.destination || !currentMap.value) return
  if (isPortalLocked(portalNode)) {
    nodeHint.value = '前方区域尚未解锁。'
    return
  }
  const destination = portalNode.destination
  progress.setCurrentMap(destination.mapId, destination.nodeId)
  router.push({ name: 'map', params: { mapId: destination.mapId } })
}

function monsterBadgeStyle(specialization: MonsterSpecialization) {
  const colors = getSpecializationColor(specialization)
  return {
    background: colors.bg,
    color: colors.text,
    borderColor: colors.border,
  }
}

function selectMap(mapId: string) {
  if (mapId === activeMapId.value) return
  const target = getMapById(mapId)
  if (!target || isMapLocked(target)) return
  progress.setCurrentMap(mapId)
  router.replace({ name: 'map', params: { mapId } })
}

function goToLocation(location: MapLocation) {
  travelPanelOpen.value = false
  if (isLocationLocked(location)) return
  if (location.id === travelHubId) {
    travelPanelOpen.value = true
    return
  }
  if (location.destinationMapId) {
    progress.setCurrentMap(location.destinationMapId)
    router.push({ name: 'map', params: { mapId: location.destinationMapId } })
    return
  }
  if (!location.routeName) return
  router.push({
    name: location.routeName,
    params: location.routeParams ?? undefined,
    query: location.routeQuery ?? undefined,
  })
}

function setFocusedLocation(id: string) {
  focusedLocationId.value = id
}

function clearFocusedLocation() {
  focusedLocationId.value = null
}

function focusMonster(id: string) {
  focusedMonsterId.value = id
}

function clearFocusedMonster() {
  focusedMonsterId.value = null
}

function openTravelPanel() {
  travelPanelOpen.value = true
}

function closeTravelPanel() {
  travelPanelOpen.value = false
}

function travelToMap(mapId: string) {
  travelPanelOpen.value = false
  selectMap(mapId)
}

function engageMonster(instanceId: string, monsterId: string) {
  if (currentMapLocked.value || !currentNode.value) return
  const monster = monsterDictionary[monsterId]
  if (!monster) return
  if (player.res.operation.mode === 'idle') {
    const confirmed =
      typeof window === 'undefined' || window.confirm('检测到你尚未运转斗气，确定要开始战斗吗？')
    if (!confirmed) return
  }
  battle.start(monster, {
    originNodeId: currentNode.value.id,
    originNodeInstanceId: instanceId,
  })
  router.push('/battle')
}

function returnToCity() {
  if (fallbackMap.value) {
    progress.setCurrentMap(fallbackMap.value.id)
    router.push({ name: 'map', params: { mapId: fallbackMap.value.id } })
  }
}

function handleEntryHover(entry: NodeListEntry) {
  if (entry.kind === 'monster') {
    focusMonster(entry.monsterId)
    return
  }
  clearFocusedMonster()
  if (entry.kind === 'npc') {
    return
  }
  nodeHint.value = null
}

function handleEntryLeave(entry: NodeListEntry) {
  if (entry.kind === 'monster') {
    clearFocusedMonster()
  }
}

function handleEntryClick(entry: NodeListEntry) {
  if (entry.kind === 'monster') {
    engageMonster(entry.instanceId, entry.monsterId)
    return
  }
  if (entry.kind === 'npc') {
    npcDialog.open(entry.id)
    return
  }
  if (entry.kind === 'portal') {
    if (entry.locked) {
      nodeHint.value = '前方区域尚未解锁。'
      return
    }
    travelThroughPortal(currentNode.value)
  }
}

watch(
  currentMap,
  () => {
    focusedLocationId.value = null
    focusedMonsterId.value = null
    nodeHint.value = null
    travelPanelOpen.value = false
  },
  { immediate: true },
)

watch(
  () => activeNodeId.value,
  () => {
    focusedMonsterId.value = null
  },
)
</script>

<style scoped>
.city-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1.5rem;
  padding: 0;
  height: 100%;
  box-sizing: border-box;
  align-items: stretch;
}

.city-main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.map-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 1rem;
}

.map-name {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}

.map-subtitle {
  margin: 0.2rem 0 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.65);
}

.map-tip {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.65);
}

.map-canvas {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(8, 12, 18, 0.5);
}

.map-image {
  display: block;
  width: 100%;
  height: auto;
}

.map-location {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.35rem 0.6rem;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  background: rgba(90, 177, 255, 0.85);
  color: #0d1722;
  font-weight: 600;
  transition: transform 0.15s ease, background 0.2s ease, opacity 0.2s ease;
}

.map-location:hover,
.map-location:focus {
  transform: translate(-50%, -50%) scale(1.05);
  background: rgba(120, 207, 255, 0.95);
  outline: none;
}

.map-location:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.map-location.locked {
  background: rgba(90, 177, 255, 0.35);
}

.location-label {
  white-space: nowrap;
}

.location-detail {
  padding: 0.9rem 1rem;
  border-radius: 8px;
  background: rgba(12, 20, 28, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.location-title {
  margin: 0 0 0.35rem;
  font-size: 1.05rem;
  font-weight: 600;
}

.location-description {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.75);
  line-height: 1.4;
}

.location-actions {
  margin-top: 0.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.primary-button {
  border: 1px solid rgba(90, 177, 255, 0.7);
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.9), rgba(14, 165, 233, 0.85));
  color: #f8fafc;
  padding: 0.45rem 0.95rem;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.12s ease, filter 0.12s ease;
}

.primary-button:hover,
.primary-button:focus {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.45);
  filter: brightness(1.05);
  outline: none;
}

.map-empty {
  padding: 2rem;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
}

.map-locked {
  padding: 2rem 1.5rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  color: rgba(255, 255, 255, 0.75);
}

.map-locked__title {
  margin: 0;
  font-size: 1.4rem;
  font-weight: 600;
}

.map-locked__hint {
  margin: 0;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.65);
}

.return-button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  color: #f0f0f0;
  padding: 0.45rem 1.1rem;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease;
}

.return-button:hover,
.return-button:focus {
  border-color: rgba(255, 255, 255, 0.45);
  background: rgba(255, 255, 255, 0.16);
  outline: none;
}

.travel-panel {
  padding: 1rem;
  border-radius: 10px;
  background: rgba(12, 20, 28, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.travel-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.travel-panel__eyebrow {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.04em;
}

.travel-panel__title {
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
  font-weight: 700;
}

.travel-panel__hint {
  margin: 0;
  color: rgba(255, 255, 255, 0.7);
  font-size: 0.9rem;
}

.travel-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.65rem;
}

.travel-card {
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: linear-gradient(160deg, rgba(26, 44, 60, 0.85), rgba(16, 24, 32, 0.9));
  padding: 0.75rem 0.85rem;
  text-align: left;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  transition: transform 0.12s ease, border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  color: #f3f4f6;
}

.travel-card:hover,
.travel-card:focus {
  transform: translateY(-1px);
  border-color: rgba(90, 177, 255, 0.8);
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.4);
  background: linear-gradient(160deg, rgba(28, 66, 92, 0.95), rgba(17, 29, 40, 0.95));
  outline: none;
}

.travel-card__name {
  font-weight: 700;
  font-size: 1rem;
}

.travel-card__meta {
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.travel-panel__empty {
  margin: 0;
  color: rgba(255, 255, 255, 0.6);
  font-size: 0.9rem;
}

.ghost-button {
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.06);
  color: #f8fafc;
  padding: 0.45rem 0.9rem;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.12s ease;
}

.ghost-button:hover,
.ghost-button:focus {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-1px);
  outline: none;
}

.wild-layout {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 1.5rem;
  height: 100%;
  box-sizing: border-box;
  align-items: stretch;
}

.wild-layout > .panel {
  height: 100%;
}

.wild-main {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.wild-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.25rem;
}

.wild-header__info {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.wild-level {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.7);
}

.wild-node-label {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
}

.wild-content {
  display: flex;
  gap: 1.25rem;
  align-items: stretch;
}

.wild-map-canvas {
  position: relative;
  flex: 1 1 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(8, 12, 18, 0.5);
  min-height: 360px;
}

.node-graph {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.graph-edge {
  stroke: rgba(255, 255, 255, 0.3);
  stroke-width: 0.3;
  stroke-linecap: round;
  fill: none;
  transition: stroke 0.2s ease;
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
}

.node-marker .node-label {
  white-space: nowrap;
}

.node-marker:hover,
.node-marker:focus {
  transform: translate(-50%, -50%) scale(1.04);
  border-color: rgba(90, 177, 255, 0.9);
  background: rgba(28, 48, 64, 0.95);
  outline: none;
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

.node-marker:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.node-marker.node-type-portal {
  border-style: dashed;
}

.node-sidebar {
  flex: 0 0 200px;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  border-radius: 12px;
  padding: 1rem;
  background: rgba(8, 12, 18, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

.node-header {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.node-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
}

.node-hint {
  margin: 0;
  font-size: 0.85rem;
  color: #f97316;
}

.node-description {
  margin: 0;
  font-size: 0.9rem;
  color: rgba(255, 255, 255, 0.75);
}

.node-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.node-list__empty {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.7);
}

.node-footer-hint {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(255, 255, 255, 0.65);
  padding: 0.5rem 0.25rem 0;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.node-entry-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.node-entry {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(18, 28, 40, 0.8);
  color: #f0f0f0;
  padding: 0.4rem 0.6rem;
  display: flex;
  justify-content: space-between;
  gap: 0.35rem;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease;
}

.node-entry:hover,
.node-entry:focus {
  border-color: rgba(90, 177, 255, 0.7);
  background: rgba(35, 52, 70, 0.92);
  outline: none;
}

.node-entry.locked {
  opacity: 0.4;
  cursor: not-allowed;
}

.node-entry__title {
  font-weight: 600;
}

.node-entry__meta {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.node-entry--monster.boss {
  border-color: rgba(251, 191, 36, 0.6);
}

.node-entry--portal {
  border-style: dashed;
}

.monster-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  padding: 0 0.35rem;
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffe1e6;
  background: rgba(255, 80, 120, 0.6);
}

.monster-badge.specialization-badge {
  border: 1px solid;
}

.monster-detail {
  padding: 0.9rem 1rem;
  border-radius: 8px;
  background: rgba(12, 20, 28, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.15);
  min-height: 96px;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  font-size: 0.95rem;
}

.monster-detail.placeholder {
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.65);
  font-style: italic;
}

.monster-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.monster-name.boss-name {
  color: #fbbf24;
  text-shadow: 0 2px 4px rgba(251, 191, 36, 0.3);
  font-weight: 700;
}

.monster-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  font-size: 0.8rem;
}

.stat-group {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.stat-label {
  font-size: 0.7rem;
  color: rgba(255, 255, 255, 0.6);
  font-weight: 500;
}

.stat-value {
  font-weight: 600;
  color: rgba(255, 255, 255, 0.9);
}

.stat-group.reward {
  flex: 1;
  justify-content: space-between;
  background: rgba(255, 200, 120, 0.1);
  border-color: rgba(255, 200, 120, 0.2);
}

.stat-group.reward .stat-value {
  color: rgba(255, 220, 150, 0.95);
}

@media (max-width: 960px) {
  .city-layout {
    grid-template-columns: 1fr;
  }

  .wild-content {
    flex-direction: column;
  }

  .node-sidebar {
    flex: 1 1 auto;
  }
  .wild-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .wild-header {
    flex-direction: column;
    align-items: stretch;
  }

  .return-button {
    align-self: flex-start;
  }
}
</style>
