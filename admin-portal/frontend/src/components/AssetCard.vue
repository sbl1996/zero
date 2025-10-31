<template>
  <el-card class="asset-card" shadow="hover">
    <div class="asset-card__media">
      <template v-if="isVideo">
        <video :src="asset.latest_revision?.download_url" controls muted preload="metadata"></video>
      </template>
      <template v-else>
        <el-image
          v-if="asset.latest_revision?.download_url"
          :src="asset.latest_revision.download_url"
          :alt="asset.title ?? asset.id"
          fit="cover"
          lazy
        >
          <template #placeholder>
            <div class="asset-card__placeholder">加载中...</div>
          </template>
          <template #error>
            <div class="asset-card__placeholder">无法预览</div>
          </template>
        </el-image>
        <div v-else class="asset-card__placeholder">无预览</div>
      </template>
    </div>
    <div class="asset-card__meta">
      <div class="asset-card__header">
        <strong>{{ asset.id }}</strong>
        <el-tag size="small" type="info">{{ translateType(asset.asset_type) }}</el-tag>
      </div>
      <p class="asset-card__title">{{ displayTitle }}</p>
      <div v-if="asset.tags && asset.tags.length > 0" class="asset-card__tags">
        <el-space wrap>
          <el-tag v-for="tag in asset.tags" :key="tag" size="small" :type="getTagType(tag)">{{ tag }}</el-tag>
        </el-space>
      </div>
      <p class="asset-card__desc" v-if="asset.description">{{ asset.description }}</p>
      <div class="asset-card__footer">
        <span>更新于 {{ formatDate(asset.updated_at) }}</span>
        <el-space>
          <el-button v-if="asset.latest_revision" link @click="emit('inspect', asset.id)">版本</el-button>
          <el-button link type="primary" @click="emit('edit', asset.id)">编辑</el-button>
        </el-space>
      </div>
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Asset, AssetType } from '@/types/assets'
import dayjs from 'dayjs'
import { useAssetStore } from '@/stores/assets'

const props = defineProps<{
  asset: Asset
}>()

const emit = defineEmits<{
  (event: 'edit', id: string): void
  (event: 'inspect', id: string): void
}>()

const isVideo = computed(() => props.asset.latest_revision?.content_type?.startsWith('video/'))
const assetStore = useAssetStore()

function getTagType(tag: string): string {
  if (['一级', '二级', '三级', '四级', '五级', '六级', '七级', '八级', '九级'].includes(tag)) {
    return 'warning'
  }
  // Map names are usually green
  if (props.asset.asset_type === 'monster' && !['boss', 'dragon', 'ancient', 'beast', 'magic', 'fire', 'ice'].includes(tag)) {
    return 'success'
  }
  return 'info'
}

const displayTitle = computed(() => {
  const type = props.asset.asset_type as AssetType
  const catalogLabel = assetStore.getCatalogLabel(type, props.asset.id)
  if ((type === 'map' || type === 'skill') && catalogLabel) {
    return catalogLabel
  }
  return props.asset.title ?? catalogLabel ?? '未命名资源'
})

function translateType(type: Asset['asset_type']) {
  switch (type) {
    case 'monster':
      return '怪物'
    case 'map':
      return '地图'
    case 'skill':
      return '技能'
    default:
      return '其他'
  }
}

function formatDate(timestamp: string) {
  // Convert to UTC+8 (Beijing Time)
  return dayjs(timestamp).add(8, 'hour').format('YYYY-MM-DD HH:mm')
}
</script>

<style scoped>
.asset-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  min-height: 320px;
}

.asset-card__media {
  width: 100%;
  aspect-ratio: 1 / 1;
  border-radius: 12px;
  overflow: hidden;
  background: rgba(30, 41, 59, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.asset-card__media video,
.asset-card__media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.asset-card__placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(148, 163, 184, 0.7);
  background: rgba(15, 23, 42, 0.35);
}

.asset-card__meta {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  flex: 1;
}

.asset-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.asset-card__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 600;
}

.asset-card__subtitle {
  margin: 0;
  color: rgba(148, 163, 184, 0.8);
  font-size: 0.9rem;
}

.asset-card__extra {
  margin: 0;
}

.asset-card__tags {
  margin: 0.5rem 0;
}

.asset-card__desc {
  margin: 0;
  color: rgba(226, 232, 240, 0.7);
  line-height: 1.4;
}

.asset-card__footer {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.8);
}
</style>
