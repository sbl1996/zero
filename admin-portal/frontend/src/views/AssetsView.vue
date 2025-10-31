<template>
  <LayoutShell>
    <template #actions>
      <el-tag type="success" effect="dark">API: {{ apiBaseUrlLabel }}</el-tag>
    </template>

    <div class="assets-view">
      <AssetFilters
        :asset-type="assetStore.filters.assetType"
        :asset-type-options="assetStore.assetTypeOptions"
        :search="assetStore.filters.search"
        :tags="assetStore.filters.tags"
        :sort="assetStore.filters.sort"
        :loading="assetStore.loading"
        @update:assetType="handleSwitchType"
        @update:search="handleSearchChange"
        @update:tags="handleTagsChange"
        @update:sort="handleSortChange"
        @refresh="assetStore.fetchAssets()"
        @create="openCreateDrawer"
      >
        <template #extra>
          <div class="assets-view__columns">
            <span class="assets-view__columns-label">每行卡片</span>
            <el-select v-model="cardsPerRow" size="small" class="assets-view__columns-select">
              <el-option
                v-for="option in cardsPerRowOptions"
                :key="option"
                :label="`${option} 列`"
                :value="option"
              />
            </el-select>
          </div>
        </template>
      </AssetFilters>

      <el-alert
        v-if="assetStore.lastError"
        :title="assetStore.lastError"
        type="error"
        show-icon
        effect="dark"
        class="assets-view__alert"
      />

      <el-empty v-if="assetStore.isEmpty" description="暂无素材，点击右上角“新建资源”开始上传。" />

      <el-row v-else :gutter="20">
        <el-col
          v-for="asset in assetStore.items"
          :key="asset.id"
          :xs="columnLayout.xs"
          :sm="columnLayout.sm"
          :md="columnLayout.md"
          :lg="columnLayout.lg"
          :xl="columnLayout.xl"
        >
          <AssetCard :asset="asset" @edit="openEditDrawer(asset)" @inspect="openDetailDrawer" />
        </el-col>
      </el-row>

      <div class="assets-view__pagination">
        <el-pagination
          background
          layout="prev, pager, next"
          :current-page="assetStore.pagination.page"
          :page-count="assetStore.pagination.pages"
          @current-change="assetStore.fetchAssets"
        />
      </div>
    </div>

    <AssetFormDrawer
      v-model="formDrawerVisible"
      :mode="formMode"
      :asset="editingAsset"
      :asset-type-options="assetStore.assetTypeOptions"
      :catalog="currentCatalog"
      :default-asset-type="assetStore.filters.assetType"
      :loading="assetStore.loading"
      @submit="handleSubmitForm"
      @switchType="handleSwitchTypeFromDrawer"
    />

    <el-drawer
      v-model="detailDrawerVisible"
      title="版本历史"
      size="480px"
      :destroy-on-close="false"
      :close-on-click-modal="false"
      @close="assetStore.clearSelection()"
    >
      <el-timeline v-if="assetStore.selectedAsset">
        <el-timeline-item
          v-for="revision in assetStore.selectedAsset.revisions"
          :key="revision.id"
          :timestamp="formatDate(revision.created_at)"
        >
          <el-card shadow="never">
            <p class="detail-item__title">{{ revision.file_name }}</p>
            <p>大小：{{ prettySize(revision.file_size) }}</p>
            <p v-if="revision.uploaded_by">上传者：{{ revision.uploaded_by }}</p>
            <p v-if="revision.notes">备注：{{ revision.notes }}</p>
            <el-link :href="revision.download_url" target="_blank">下载</el-link>
          </el-card>
        </el-timeline-item>
      </el-timeline>
      <el-empty v-else description="暂无版本信息" />
    </el-drawer>
  </LayoutShell>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import dayjs from 'dayjs'

import LayoutShell from '@/components/LayoutShell.vue'
import AssetFilters from '@/components/AssetFilters.vue'
import AssetFormDrawer from '@/components/AssetFormDrawer.vue'
import AssetCard from '@/components/AssetCard.vue'
import { useAssetStore } from '@/stores/assets'
import type { Asset, AssetType, CatalogItem } from '@/types/assets'

const assetStore = useAssetStore()

const formDrawerVisible = ref(false)
const formMode = ref<'create' | 'edit'>('create')
const editingAsset = ref<Asset | null>(null)
const detailDrawerVisible = ref(false)
const cardsPerRowOptions = [1, 2, 3, 4]
const cardsPerRow = ref<number>(4)

const apiBaseUrlLabel = computed(() => import.meta.env.VITE_API_BASE_URL ?? '同域 (相对路径)')

const currentCatalog = computed<CatalogItem[]>(() => {
  const type = formMode.value === 'edit' ? editingAsset.value?.asset_type ?? assetStore.filters.assetType : assetStore.filters.assetType

  // 如果 catalog 为空，自动加载
  if (!assetStore.catalog[type] || assetStore.catalog[type].length === 0) {
    assetStore.loadCatalog(type)
  }

  return assetStore.catalog[type] ?? []
})

const columnLayout = computed(() => {
  const span = Math.floor(24 / cardsPerRow.value)
  return {
    xs: 24,
    sm: cardsPerRow.value > 1 ? 12 : 24,
    md: span,
    lg: span,
    xl: span,
  }
})

onMounted(async () => {
  await assetStore.fetchAssets()
})

function handleSwitchType(type: AssetType) {
  assetStore.filters.assetType = type
  assetStore.fetchAssets(1)
}

function handleSearchChange(value: string) {
  assetStore.filters.search = value
  assetStore.fetchAssets(1)
}

function handleTagsChange(value: string) {
  assetStore.filters.tags = value
  assetStore.fetchAssets(1)
}

function handleSortChange(value: string) {
  assetStore.filters.sort = value as any
  assetStore.fetchAssets(1)
}

function handleSwitchTypeFromDrawer(type: AssetType) {
  assetStore.filters.assetType = type
}

function openCreateDrawer() {
  formMode.value = 'create'
  editingAsset.value = null
  formDrawerVisible.value = true
}

function openEditDrawer(asset: Asset) {
  formMode.value = 'edit'
  editingAsset.value = asset
  formDrawerVisible.value = true
}

async function handleSubmitForm(payload: any) {
  try {
    if (formMode.value === 'create') {
      await assetStore.createAsset(payload)
      ElMessage.success('素材已创建')
    } else if (editingAsset.value) {
      await assetStore.updateAsset(editingAsset.value.id, payload)
      ElMessage.success('素材已更新')
    }
    formDrawerVisible.value = false
    await assetStore.fetchAssets(assetStore.pagination.page)
  } catch (error: any) {
    let errorMessage = '操作失败'
    let errorType = 'error'

    // 处理不同类型的HTTP错误
    if (error?.response) {
      const status = error.response.status
      const detail = error.response.data?.detail

      switch (status) {
        case 409: // Conflict
          errorMessage = `ID "${payload.id}" 已存在，请使用不同的ID`
          errorType = 'warning'
          break
        case 400: // Bad Request
          errorMessage = detail || '请求数据有误，请检查输入'
          break
        case 413: // Payload Too Large
          errorMessage = '文件过大，请选择更小的文件'
          break
        case 422: // Unprocessable Entity
          errorMessage = detail || '数据格式错误，请检查输入'
          break
        case 429: // Too Many Requests
          errorMessage = '请求过于频繁，请稍后重试'
          break
        default:
          errorMessage = detail || `服务器错误 (${status})`
      }
    } else if (error?.message) {
      errorMessage = error.message
    }

    if (errorType === 'warning') {
      ElMessage.warning({
        message: errorMessage,
        duration: 5000, // 警告消息显示更长时间
      })
    } else {
      ElMessage.error({
        message: errorMessage,
        duration: 3000,
      })
    }
  }
}

async function openDetailDrawer(id: string) {
  await assetStore.inspectAsset(id)
  detailDrawerVisible.value = true
}

function prettySize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(value: string) {
  // Convert to UTC+8 (Beijing Time)
  return dayjs(value).add(8, 'hour').format('YYYY-MM-DD HH:mm')
}
</script>

<style scoped>
.assets-view {
  padding: 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.assets-view__alert {
  max-width: 720px;
}

.assets-view__pagination {
  display: flex;
  justify-content: center;
  margin-top: 1.5rem;
}

.detail-item__title {
  font-weight: 600;
  margin: 0 0 0.5rem;
}

.assets-view__columns {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.assets-view__columns-label {
  font-size: 0.875rem;
  color: var(--el-text-color-regular);
}

.assets-view__columns-select {
  width: 96px;
}
</style>
