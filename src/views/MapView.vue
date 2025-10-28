<template>
  <div v-if="mapsList.length && currentMap">
    <div v-if="isCityMap" class="map-view">
      <aside class="map-sidebar">
        <h2 class="sidebar-title">地图</h2>
        <button
          v-for="map in mapsList"
          :key="map.id"
          type="button"
          class="map-selector"
          :class="{ active: map.id === activeMapId, locked: isMapLocked(map) }"
          :disabled="isMapLocked(map)"
          @click="selectMap(map.id)"
        >
          {{ map.name }}
        </button>
      </aside>
      <section class="map-main">
        <header class="map-header">
          <h3 class="map-name">{{ currentMap.name }}</h3>
          <p class="map-tip">选择区域进入对应功能。</p>
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
        </footer>
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
              <p v-if="realmRangeLabel" class="wild-level">推荐境界 {{ realmRangeLabel }}</p>
            </div>
            <button type="button" class="return-button" @click="returnToCity">
              返回翡冷翠
            </button>
          </header>
          <div class="wild-map-canvas">
            <img class="map-image" :src="currentMap.image" :alt="`${currentMap.name} 地图`" />
            <button
              v-for="monster in monstersOnMap"
              :key="monster.id"
              type="button"
              class="monster-marker"
              :style="monsterMarkerStyle(monster.id)"
              @click="selectMonster(monster.id)"
              @mouseenter="focusMonster(monster.id)"
              @mouseleave="clearFocusedMonster"
              @focus="focusMonster(monster.id)"
              @blur="clearFocusedMonster"
            >
              <span class="monster-label" :class="{ 'boss-label': monster.isBoss }">
                {{ monster.name }}
              </span>
            </button>
          </div>
          <footer class="monster-detail" v-if="monstersOnMap.length">
            <template v-if="focusedMonster">
              <h4 class="monster-name" :class="{ 'boss-name': focusedMonster.isBoss }">
                {{ focusedMonster.name }}
                <span v-if="focusedMonster.isBoss" class="monster-badge">BOSS</span>
                <span v-else
                  class="monster-badge specialization-badge"
                  :style="{
                    background: getSpecializationColor(focusedMonster.specialization).bg,
                    color: getSpecializationColor(focusedMonster.specialization).text,
                    borderColor: getSpecializationColor(focusedMonster.specialization).border
                  }">
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
            </template>
            <template v-else>
              将鼠标移至怪物名称查看情报
            </template>
          </footer>
          <div v-else class="monster-detail placeholder">
            暂无可挑战的怪物。
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
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import PlayerStatusPanel from '@/components/PlayerStatusPanel.vue'
import { defaultMapId, maps as mapDefinitions, getMonsterPosition } from '@/data/maps'
import { getMonsterMap, MONSTERS } from '@/data/monsters'
import { useBattleStore } from '@/stores/battle'
import { useProgressStore } from '@/stores/progress'
import { formatRealmTierLabel } from '@/utils/realm'
import type { NumericRealmTier } from '@/utils/realm'
import type { GameMap, MapLocation } from '@/types/map'
import type { Monster, MonsterSpecialization } from '@/types/domain'

const route = useRoute()
const router = useRouter()

const battle = useBattleStore()
const progress = useProgressStore()

function formatMonsterRewards(monster: Monster | null | undefined): string {
  if (!monster) return ''
  const rewards = monster.rewards
  const parts: string[] = []
  if (typeof rewards.exp === 'number') {
    parts.push(`EXP ${rewards.exp}`)
  }
  if (typeof rewards.deltaBp === 'number') {
    parts.push(`ΔBP ${rewards.deltaBp}`)
  }
  parts.push(`GOLD ${rewards.gold}`)
  return parts.join(' ・ ')
}

function describeMonsterRealm(monster: Monster | null | undefined): string {
  if (!monster?.realmTier) return '未知'
  return formatRealmTierLabel(monster.realmTier)
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
    crazy: '疯狂'
  }
  return labels[specialization] || '未知'
}

function getSpecializationColor(specialization: MonsterSpecialization): { bg: string; text: string; border: string } {
  const colors: Record<MonsterSpecialization, { bg: string; text: string; border: string }> = {
    balanced: { bg: 'rgba(156, 163, 175, 0.7)', text: '#f3f4f6', border: 'rgba(156, 163, 175, 0.9)' },    // 灰色 - 平衡
    attacker: { bg: 'rgba(239, 68, 68, 0.7)', text: '#fef2f2', border: 'rgba(239, 68, 68, 0.9)' },        // 红色 - 攻击
    defender: { bg: 'rgba(59, 130, 246, 0.7)', text: '#eff6ff', border: 'rgba(59, 130, 246, 0.9)' },       // 蓝色 - 防御
    agile: { bg: 'rgba(34, 197, 94, 0.7)', text: '#f0fdf4', border: 'rgba(34, 197, 94, 0.9)' },          // 绿色 - 敏捷
    bruiser: { bg: 'rgba(168, 85, 247, 0.7)', text: '#faf5ff', border: 'rgba(168, 85, 247, 0.9)' },        // 紫色 - 重装
    skirmisher: { bg: 'rgba(251, 146, 60, 0.7)', text: '#fff7ed', border: 'rgba(251, 146, 60, 0.9)' },     // 橙色 - 游击
    mystic: { bg: 'rgba(139, 92, 246, 0.7)', text: '#f5f3ff', border: 'rgba(139, 92, 246, 0.9)' },        // 深紫色 - 奥术
    crazy: { bg: 'rgba(217, 70, 239, 0.7)', text: '#fdf4ff', border: 'rgba(217, 70, 239, 0.9)' }          // 粉色 - 疯狂
  }
  return colors[specialization] || { bg: 'rgba(107, 114, 128, 0.7)', text: '#f9fafb', border: 'rgba(107, 114, 128, 0.9)' }
}


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
      // 如果地图被锁定或不存在，使用store中保存的地图状态
      const savedMapId = progress.currentMapId
      const savedTarget = getMapById(savedMapId)
      if (savedTarget && !isMapLocked(savedTarget)) {
        router.replace({ name: 'map', params: { mapId: savedMapId } })
      } else {
        router.replace({ name: 'map', params: { mapId: fallbackMap.value.id } })
      }
    } else {
      // 地图有效，保存到store
      progress.setCurrentMap(target.id)
    }
  },
  { immediate: true }
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

const monstersOnMap = computed(() => {
  if (!currentMap.value || currentMap.value.category !== 'wild') return []
  return MONSTERS.filter(monster => getMonsterMap(monster.id) === currentMap.value?.id)
})

const realmRange = computed(() => {
  const tiers = monstersOnMap.value
    .map((monster) => (typeof monster.realmTier === 'number' ? monster.realmTier : null))
    .filter((tier): tier is NumericRealmTier => tier !== null)
  if (!tiers.length) return null
  return {
    min: Math.min(...tiers) as NumericRealmTier,
    max: Math.max(...tiers) as NumericRealmTier,
  }
})

const realmRangeLabel = computed(() => {
  const range = realmRange.value
  if (!range) return ''
  const minLabel = formatRealmTierLabel(range.min)
  const maxLabel = formatRealmTierLabel(range.max)
  return range.min === range.max ? minLabel : `${minLabel}~${maxLabel}`
})

const currentMapLocked = computed(() => {
  const map = currentMap.value
  if (!map) return false
  return isMapLocked(map)
})

const focusedLocationId = ref<string | null>(null)
const focusedMonsterId = ref<string | null>(null)

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

const focusedMonster = computed(() => {
  if (!focusedMonsterId.value) return null
  return monstersOnMap.value.find((monster) => monster.id === focusedMonsterId.value) ?? null
})

const monsterPositions = computed<Record<string, { x: number; y: number }>>(() => {
  if (!currentMap.value) return {}
  const mapId = currentMap.value.id
  return monstersOnMap.value.reduce((acc, monster) => {
    acc[monster.id] = getMonsterPosition(mapId, monster.id)
    return acc
  }, {} as Record<string, { x: number; y: number }>)
})

function markerStyle(location: MapLocation) {
  return {
    left: `${location.position.x}%`,
    top: `${location.position.y}%`,
  }
}

function monsterMarkerStyle(monsterId: string) {
  const position = monsterPositions.value[monsterId]
  if (!position) return {}
  return {
    left: `${position.x}%`,
    top: `${position.y}%`,
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
  if (isLocationLocked(location)) return
  if (location.destinationMapId) {
    progress.setCurrentMap(location.destinationMapId)
    router.push({ name: 'map', params: { mapId: location.destinationMapId } })
    return
  }
  if (!location.routeName) return
  router.push({
    name: location.routeName,
    params: location.routeParams,
    query: location.routeQuery,
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

function selectMonster(monsterId: string) {
  if (currentMapLocked.value) return
  const monster = monstersOnMap.value.find((m) => m.id === monsterId)
  if (!monster) return
  battle.start(monster)
  router.push('/battle')
}

function returnToCity() {
  if (fallbackMap.value) {
    progress.setCurrentMap(fallbackMap.value.id)
    router.push({ name: 'map', params: { mapId: fallbackMap.value.id } })
  }
}

watch(
  currentMap,
  () => {
    focusedLocationId.value = null
    focusedMonsterId.value = null
  },
  { immediate: true }
)
</script>

<style scoped>
.map-view {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 1.5rem;
  padding: 0.5rem 20px;
  height: 100%;
  box-sizing: border-box;
}

.map-sidebar {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.sidebar-title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 600;
  color: #f0f0f0;
}

.map-selector {
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  background: rgba(14, 22, 30, 0.7);
  color: #f0f0f0;
  padding: 0.6rem 0.8rem;
  text-align: left;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, transform 0.15s ease;
}

.map-selector:hover,
.map-selector:focus {
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(34, 56, 72, 0.8);
  outline: none;
}

.map-selector:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.map-selector.locked {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(18, 18, 18, 0.6);
}

.map-selector.active {
  border-color: #5ab1ff;
  background: rgba(28, 48, 64, 0.85);
}

.map-main {
  display: flex;
  flex-direction: column;
  gap: 1.0rem;
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

.wild-layout {
  display: grid;
  grid-template-columns: minmax(260px, 320px) 1fr;
  gap: 1.5rem;
  height: 100%;
  box-sizing: border-box;
  align-items: start;
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

.wild-map-canvas {
  position: relative;
  width: 100%;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(8, 12, 18, 0.5);
  min-height: 320px;
}

.monster-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 0.35rem 0.75rem;
  border-radius: 999px;
  border: none;
  cursor: pointer;
  background: rgba(255, 201, 120, 0.92);
  color: #1a1e24;
  font-weight: 600;
  transition: transform 0.15s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.monster-marker:has(.boss-label) {
  background: linear-gradient(135deg, rgba(220, 38, 127, 0.92), rgba(185, 28, 28, 0.92));
  color: #fff;
  box-shadow: 0 4px 12px rgba(220, 38, 127, 0.4);
}

.monster-marker:hover,
.monster-marker:focus {
  transform: translate(-50%, -50%) scale(1.06);
  background: rgba(255, 220, 150, 0.96);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
  outline: none;
}

.monster-marker:has(.boss-label):hover,
.monster-marker:has(.boss-label):focus {
  background: linear-gradient(135deg, rgba(236, 72, 153, 0.96), rgba(220, 38, 38, 0.96));
  box-shadow: 0 8px 24px rgba(236, 72, 153, 0.5);
}

.monster-label {
  display: inline-flex;
  gap: 0.35rem;
  align-items: center;
  white-space: nowrap;
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
  .map-view {
    grid-template-columns: 1fr;
  }

  .map-sidebar {
    flex-direction: row;
    flex-wrap: wrap;
  }

  .map-selector {
    flex: 1 1 120px;
    text-align: center;
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
