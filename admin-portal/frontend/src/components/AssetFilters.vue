<template>
  <div class="filters">
    <el-space wrap>
      <el-select
        class="filters__type"
        :model-value="assetType"
        placeholder="选择资源类型"
        @change="(value: AssetType) => emit('update:assetType', value)"
      >
        <el-option v-for="option in assetTypeOptions" :key="option.value" :label="option.label" :value="option.value" />
      </el-select>
      <el-input
        class="filters__search"
        :model-value="search"
        placeholder="搜索 ID / 标题 / 描述"
        clearable
        @clear="emit('update:search', '')"
        @input="(value: string) => emit('update:search', value)"
        @keyup.enter="emit('refresh')"
      >
        <template #prefix>
          <el-icon>
            <Search />
          </el-icon>
        </template>
      </el-input>
      <el-input
        class="filters__tags"
        v-model="tagsValue"
        placeholder="按标签筛选（支持逗号/，/、/空格分隔）"
        clearable
        @clear="handleTagsClear"
        @keyup.enter="emit('refresh')"
      >
        <template #prefix>
          <el-icon>
            <CollectionTag />
          </el-icon>
        </template>
      </el-input>
      <el-select
        class="filters__sort"
        :model-value="sort"
        placeholder="排序"
        @change="(value: string) => emit('update:sort', value)"
      >
        <el-option label="按更新时间" value="updated_desc" />
        <el-option label="按资源ID" value="id" />
      </el-select>
      <el-button type="primary" :loading="loading" @click="emit('create')">
        <el-icon style="margin-right: 4px">
          <Plus />
        </el-icon>
        新建资源
      </el-button>
      <el-button :loading="loading" @click="emit('refresh')">
        <el-icon style="margin-right: 4px">
          <Refresh />
        </el-icon>
        刷新
      </el-button>
      <slot name="extra" />
    </el-space>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AssetType } from '@/types/assets'
import { CollectionTag, Plus, Refresh, Search } from '@element-plus/icons-vue'

function normalizeTagsInput(input: string): string {
  if (!input) return ''
  const parts = input
    .split(/[\s,，、　]+/u)
    .map(s => s.trim())
    .filter(Boolean)
  return parts.join(',')
}


const props = defineProps<{
  assetType: AssetType
  assetTypeOptions: Array<{ label: string; value: AssetType }>
  search: string
  tags: string
  sort: string
  loading: boolean
}>()

const emit = defineEmits<{
  (event: 'update:assetType', value: AssetType): void
  (event: 'update:search', value: string): void
  (event: 'update:tags', value: string): void
  (event: 'update:sort', value: string): void
  (event: 'refresh'): void
  (event: 'create'): void
}>()

const tagsValue = computed({
  get: () => props.tags,
  set: (value: string) => emit('update:tags', normalizeTagsInput(value))
})

function handleTagsClear() {
  emit('update:tags', '')
}
</script>

<style scoped>
.filters {
  margin-bottom: 1.5rem;
}

.filters__type {
  min-width: 140px;
}

.filters__search {
  min-width: 260px;
}

.filters__tags {
  min-width: 200px;
}

.filters__sort {
  min-width: 180px;
}
</style>
