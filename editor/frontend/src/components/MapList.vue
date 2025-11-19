<template>
  <div class="map-list">
    <div class="map-list__header">
      <h3>地图列表</h3>
      <el-button type="primary" size="small" @click="$emit('create')">
        + 新增
      </el-button>
    </div>
    <div class="map-list__groups">
      <div class="map-group">
        <div class="map-group__title">城市</div>
        <button
          v-for="map in cityMaps"
          :key="map.id"
          class="map-item"
          :class="{ active: map.id === currentMapId }"
          @click="$emit('select', map.id)"
        >
          {{ map.name }}
        </button>
      </div>
      <div class="map-group">
        <div class="map-group__title">野外</div>
        <button
          v-for="map in wildMaps"
          :key="map.id"
          class="map-item"
          :class="{ active: map.id === currentMapId }"
          @click="$emit('select', map.id)"
        >
          {{ map.name }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MapMetadata } from '@/types/map'

const props = defineProps<{
  maps: MapMetadata[]
  currentMapId: string | null
}>()

defineEmits<{
  select: [mapId: string]
  create: []
}>()

const cityMaps = computed(() => props.maps.filter(m => m.category === 'city'))
const wildMaps = computed(() => props.maps.filter(m => m.category === 'wild'))
</script>

<style scoped>
.map-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.map-list__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.map-list__header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.map-list__groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.map-group__title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 8px;
  text-transform: uppercase;
}

.map-item {
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: #f5f7fa;
  border-radius: 6px;
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 14px;
  color: #303133;
}

.map-item:hover {
  background: #ecf5ff;
  color: #409eff;
}

.map-item.active {
  background: #409eff;
  color: white;
  font-weight: 600;
}
</style>
