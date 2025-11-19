<template>
  <div class="property-panel">
    <!-- Map Properties (when nothing is selected) -->
    <el-form
      v-if="!selectedItem && currentMap"
      label-width="100px"
      size="small"
    >
      <h3 style="margin: 0 0 16px 0; font-size: 16px">地图属性</h3>
      
      <el-form-item label="地图ID">
        <el-input :model-value="currentMap.id" disabled />
      </el-form-item>

      <el-form-item label="地图名称">
        <el-input
          :model-value="currentMap.name"
          @input="updateMapField('name', $event)"
        />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          :model-value="currentMap.description"
          type="textarea"
          :rows="3"
          @input="updateMapField('description', $event)"
        />
      </el-form-item>

      <el-form-item label="背景图片">
        <el-input
          :model-value="currentMap.image"
          placeholder="如: map-florence.webp"
          @input="updateMapField('image', $event)"
        />
      </el-form-item>

      <el-form-item label="类别">
        <el-radio-group
          :model-value="currentMap.category"
          @change="updateMapField('category', $event)"
        >
          <el-radio-button value="city">城市</el-radio-button>
          <el-radio-button value="wild">野外</el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-divider>背景音乐</el-divider>

      <el-form-item label="环境音乐">
        <el-select
          :model-value="currentMap.bgm?.ambient"
          placeholder="选择环境音乐"
          clearable
          filterable
          style="width: 100%"
          @change="updateBGMField('ambient', $event)"
        >
          <el-option
            v-for="music in musicList"
            :key="music.filename"
            :label="music.filename"
            :value="music.filename"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="战斗音乐">
        <el-select
          :model-value="currentMap.bgm?.battle"
          placeholder="选择战斗音乐"
          clearable
          filterable
          style="width: 100%"
          @change="updateBGMField('battle', $event)"
        >
          <el-option
            v-for="music in musicList"
            :key="music.filename"
            :label="music.filename"
            :value="music.filename"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="默认节点" v-if="currentMap.category === 'wild'">
        <el-select
          :model-value="currentMap.defaultNodeId"
          clearable
          style="width: 100%"
          @change="updateMapField('defaultNodeId', $event)"
        >
          <el-option
            v-for="node in currentMap.nodes"
            :key="node.id"
            :label="node.label"
            :value="node.id"
          />
        </el-select>
      </el-form-item>
    </el-form>

    <div v-else-if="!selectedItem" class="empty-state">
      <p>选择一个节点或地点以编辑属性</p>
    </div>

    <!-- Battle Node Properties -->
    <el-form
      v-else-if="selectedNode?.type === 'battle'"
      label-width="100px"
      size="small"
    >
      <el-form-item label="节点ID">
        <el-input :model-value="selectedNode.id" disabled />
      </el-form-item>

      <el-form-item label="显示标签">
        <el-input
          :model-value="selectedNode.label"
          @input="updateField('label', $event)"
        />
      </el-form-item>

      <el-form-item label="坐标">
        <div style="display: flex; gap: 8px">
          <el-input-number
            :model-value="selectedNode.position.x"
            :min="0"
            :max="100"
            :precision="1"
            controls-position="right"
            @change="updatePosition('x', $event)"
          />
          <el-input-number
            :model-value="selectedNode.position.y"
            :min="0"
            :max="100"
            :precision="1"
            controls-position="right"
            @change="updatePosition('y', $event)"
          />
        </div>
      </el-form-item>

      <el-divider>怪物生成配置</el-divider>

      <el-form-item label="数量范围">
        <div style="display: flex; gap: 8px; align-items: center">
          <el-input-number
            :model-value="selectedNode.spawn?.min"
            :min="1"
            @change="updateSpawnField('min', $event)"
          />
          <span>~</span>
          <el-input-number
            :model-value="selectedNode.spawn?.max"
            :min="1"
            @change="updateSpawnField('max', $event)"
          />
        </div>
      </el-form-item>

      <el-form-item label="刷新间隔">
        <el-input-number
          :model-value="selectedNode.spawn?.intervalSeconds"
          :min="0"
          @change="updateSpawnField('intervalSeconds', $event)"
        />
        <span style="margin-left: 8px; color: #909399">秒</span>
      </el-form-item>

      <el-form-item label="重生时间">
        <el-input-number
          :model-value="selectedNode.spawn?.respawnSeconds"
          :min="0"
          @change="updateSpawnField('respawnSeconds', $event)"
        />
        <span style="margin-left: 8px; color: #909399">秒</span>
      </el-form-item>

      <el-form-item label="怪物列表">
        <div class="monster-list">
          <div
            v-for="(monster, idx) in selectedNode.spawn?.monsters"
            :key="idx"
            class="monster-item"
          >
            <el-select
              :model-value="monster.id"
              placeholder="选择怪物"
              filterable
              style="flex: 1"
              @change="updateMonster(idx, 'id', $event)"
            >
              <el-option
                v-for="m in monsters"
                :key="m.id"
                :label="`${m.name}`"
                :value="m.id"
              >
                <span>{{ m.name }}</span>
                <span style="float: right; color: #8492a6; font-size: 13px">
                  {{ realmTierToLabel(m.realmTier) }}
                </span>
              </el-option>
            </el-select>

            <el-input-number
              :model-value="monster.weight"
              :min="1"
              placeholder="权重"
              style="width: 100px"
              @change="updateMonster(idx, 'weight', $event)"
            />

            <el-button type="danger" size="small" circle @click="removeMonster(idx)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>

          <el-button
            type="primary"
            size="small"
            @click="addMonster"
            style="width: 100%"
          >
            + 添加怪物
          </el-button>
        </div>
      </el-form-item>

      <el-form-item label="NPCs">
        <el-select
          :model-value="selectedNode.npcs"
          multiple
          placeholder="选择NPC (可选)"
          style="width: 100%"
          @change="updateField('npcs', $event)"
        >
          <el-option value="guard-zhenxiang" label="卫兵 振翔" />
        </el-select>
      </el-form-item>

      <el-divider />
      
      <el-button type="danger" @click="$emit('delete')" style="width: 100%">
        删除节点
      </el-button>
    </el-form>

    <!-- Portal Node Properties -->
    <el-form
      v-else-if="selectedNode?.type === 'portal'"
      label-width="100px"
      size="small"
    >
      <el-form-item label="节点ID">
        <el-input :model-value="selectedNode.id" disabled />
      </el-form-item>

      <el-form-item label="显示标签">
        <el-input
          :model-value="selectedNode.label"
          @input="updateField('label', $event)"
        />
      </el-form-item>

      <el-form-item label="坐标">
        <div style="display: flex; gap: 8px">
          <el-input-number
            :model-value="selectedNode.position.x"
            :min="0"
            :max="100"
            :precision="1"
            @change="updatePosition('x', $event)"
          />
          <el-input-number
            :model-value="selectedNode.position.y"
            :min="0"
            :max="100"
            :precision="1"
            @change="updatePosition('y', $event)"
          />
        </div>
      </el-form-item>

      <el-divider>传送目标</el-divider>

      <el-form-item label="目标地图">
        <el-select
          :model-value="selectedNode.destination?.mapId"
          style="width: 100%"
          @change="updateDestination('mapId', $event)"
        >
          <el-option
            v-for="map in maps"
            :key="map.id"
            :label="map.name"
            :value="map.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="目标节点">
        <el-select
          :model-value="selectedNode.destination?.nodeId"
          style="width: 100%"
          clearable
          @change="updateDestination('nodeId', $event)"
        >
          <el-option
            v-for="node in destinationNodes"
            :key="node.id"
            :label="node.label"
            :value="node.id"
          />
        </el-select>
      </el-form-item>

      <el-divider />

      <el-button type="danger" @click="$emit('delete')" style="width: 100%">
        删除节点
      </el-button>
    </el-form>

    <!-- Location Properties -->
    <el-form v-else-if="selectedLocation" label-width="100px" size="small">
      <el-form-item label="地点ID">
        <el-input :model-value="selectedLocation.id" disabled />
      </el-form-item>

      <el-form-item label="名称">
        <el-input
          :model-value="selectedLocation.name"
          @input="updateLocationField('name', $event)"
        />
      </el-form-item>

      <el-form-item label="描述">
        <el-input
          :model-value="selectedLocation.description"
          type="textarea"
          :rows="3"
          @input="updateLocationField('description', $event)"
        />
      </el-form-item>

      <el-form-item label="坐标">
        <div style="display: flex; gap: 8px">
          <el-input-number
            :model-value="selectedLocation.position.x"
            :min="0"
            :max="100"
            :precision="1"
            @change="updateLocationPosition('x', $event)"
          />
          <el-input-number
            :model-value="selectedLocation.position.y"
            :min="0"
            :max="100"
            :precision="1"
            @change="updateLocationPosition('y', $event)"
          />
        </div>
      </el-form-item>

      <el-form-item label="路由名称">
        <el-input
          :model-value="selectedLocation.routeName"
          placeholder="如: shop"
          @input="updateLocationField('routeName', $event)"
        />
      </el-form-item>

      <el-form-item label="目标地图">
        <el-select
          :model-value="selectedLocation.destinationMapId"
          clearable
          style="width: 100%"
          @change="updateLocationField('destinationMapId', $event)"
        >
          <el-option
            v-for="map in maps"
            :key="map.id"
            :label="map.name"
            :value="map.id"
          />
        </el-select>
      </el-form-item>

      <el-divider />

      <el-button type="danger" @click="$emit('delete')" style="width: 100%">
        删除地点
      </el-button>
    </el-form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import type { MapMetadata, MapNode, MapLocation } from '@/types/map'
import type { MonsterBlueprint } from '@/types/monster'
import { musicApi } from '@/api/music'

interface MusicFile {
  filename: string
  size: number
  path: string
}

const props = defineProps<{
  currentMap: MapMetadata | null
  selectedNode: MapNode | null
  selectedLocation: MapLocation | null
  maps: MapMetadata[]
  monsters: MonsterBlueprint[]
}>()

const emit = defineEmits<{
  update: [item: MapNode | MapLocation]
  updateMap: [map: MapMetadata]
  delete: []
}>()

const musicList = ref<MusicFile[]>([])

const selectedItem = computed(() => props.selectedNode || props.selectedLocation)

const destinationNodes = computed(() => {
  if (!props.selectedNode?.destination?.mapId) return []
  const targetMap = props.maps.find(m => m.id === props.selectedNode?.destination?.mapId)
  return targetMap?.nodes || []
})

function realmTierToLabel(tier: number): string {
  const labels = ['', '一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级', '九级']
  return labels[tier] || `${tier}级`
}

function updateField(field: string, value: any) {
  if (!props.selectedNode) return
  emit('update', { ...props.selectedNode, [field]: value })
}

function updatePosition(axis: 'x' | 'y', value: number | null) {
  if (!props.selectedNode || value === null) return
  emit('update', {
    ...props.selectedNode,
    position: { ...props.selectedNode.position, [axis]: value },
  })
}

function updateSpawnField(field: string, value: any) {
  if (!props.selectedNode?.spawn) return
  emit('update', {
    ...props.selectedNode,
    spawn: { ...props.selectedNode.spawn, [field]: value },
  })
}

function updateMonster(index: number, field: 'id' | 'weight', value: any) {
  if (!props.selectedNode?.spawn?.monsters) return
  const monsters = [...props.selectedNode.spawn.monsters]
  monsters[index] = { ...monsters[index], [field]: value }
  emit('update', {
    ...props.selectedNode,
    spawn: { ...props.selectedNode.spawn, monsters },
  })
}

function addMonster() {
  if (!props.selectedNode?.spawn) return
  const monsters = [...(props.selectedNode.spawn.monsters || [])]
  monsters.push({ id: '', weight: 1 })
  emit('update', {
    ...props.selectedNode,
    spawn: { ...props.selectedNode.spawn, monsters },
  })
}

function removeMonster(index: number) {
  if (!props.selectedNode?.spawn?.monsters) return
  const monsters = props.selectedNode.spawn.monsters.filter((_, i) => i !== index)
  emit('update', {
    ...props.selectedNode,
    spawn: { ...props.selectedNode.spawn, monsters },
  })
}

function updateDestination(field: 'mapId' | 'nodeId', value: any) {
  if (!props.selectedNode) return
  const destination = { ...(props.selectedNode.destination || { mapId: '' }), [field]: value }
  if (field === 'mapId') {
    destination.nodeId = undefined
  }
  emit('update', { ...props.selectedNode, destination })
}

function updateLocationField(field: string, value: any) {
  if (!props.selectedLocation) return
  emit('update', { ...props.selectedLocation, [field]: value })
}

function updateLocationPosition(axis: 'x' | 'y', value: number | null) {
  if (!props.selectedLocation || value === null) return
  emit('update', {
    ...props.selectedLocation,
    position: { ...props.selectedLocation.position, [axis]: value },
  })
}

function updateMapField(field: string, value: any) {
  if (!props.currentMap) return
  emit('updateMap', { ...props.currentMap, [field]: value })
}

function updateBGMField(field: 'ambient' | 'battle', value: string | null) {
  if (!props.currentMap) return
  const bgm = { ...(props.currentMap.bgm || {}), [field]: value || undefined }
  emit('updateMap', { ...props.currentMap, bgm })
}

onMounted(async () => {
  try {
    musicList.value = await musicApi.list()
  } catch (error) {
    console.error('Failed to load music list:', error)
  }
})
</script>

<style scoped>
.property-panel {
  padding: 16px;
  background: white;
  border-radius: 8px;
  border: 1px solid #dcdfe6;
  overflow-y: auto;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
  color: #909399;
}

.monster-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.monster-item {
  display: flex;
  gap: 8px;
  align-items: center;
}
</style>
