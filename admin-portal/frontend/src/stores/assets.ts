import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Asset, AssetType, CatalogItem } from '@/types/assets'
import {
  createAsset as apiCreateAsset,
  fetchAssetDetail,
  fetchAssets as apiFetchAssets,
  fetchCatalog as apiFetchCatalog,
  updateAsset as apiUpdateAsset,
} from '@/services/api'

const DEFAULT_PAGE_SIZE = 20

export const useAssetStore = defineStore('assets', () => {
  const loading = ref(false)
  const items = ref<Asset[]>([])
  const lastError = ref<string | null>(null)
  const pagination = reactive({
    total: 0,
    page: 1,
    page_size: DEFAULT_PAGE_SIZE,
    pages: 1,
  })
  const filters = reactive({
    assetType: 'monster' as AssetType,
    search: '',
    tags: '',
    sort: 'updated_desc' as 'id' | 'updated_desc',
  })

  const catalog = reactive<Record<AssetType, CatalogItem[]>>({
    monster: [],
    map: [],
    skill: [],
    misc: [],
  })
  const catalogLoaded = reactive<Record<AssetType, boolean>>({
    monster: false,
    map: false,
    skill: false,
    misc: false,
  })
  const catalogLoading = reactive<Record<AssetType, boolean>>({
    monster: false,
    map: false,
    skill: false,
    misc: false,
  })

  const catalogPromises: Partial<Record<AssetType, Promise<void>>> = {}

  const catalogIndex = computed(() => {
    const result: Record<AssetType, Record<string, string>> = {
      monster: {},
      map: {},
      skill: {},
      misc: {},
    }

    for (const type of Object.keys(catalog) as AssetType[]) {
      result[type] = {}
      for (const item of catalog[type]) {
        result[type][item.id] = item.label
      }
    }

    return result
  })

  const selectedAsset = ref<Asset | null>(null)

  const assetTypeOptions = computed<{ label: string; value: AssetType }[]>(() => [
    { label: '怪物', value: 'monster' },
    { label: '地图', value: 'map' },
    { label: '技能', value: 'skill' },
    { label: '其他', value: 'misc' },
  ])

  const isEmpty = computed(() => !loading.value && (!items.value || items.value.length === 0))

  function setError(message: string | null) {
    lastError.value = message
  }

  function syncCatalog(type: AssetType, items: CatalogItem[]) {
    catalog[type] = items
    catalogLoaded[type] = true
  }

  async function loadCatalog(type: AssetType, force = false) {
    if (!force && catalogLoaded[type]) return
    if (catalogPromises[type]) {
      await catalogPromises[type]
      return
    }
    const loader = (async () => {
      catalogLoading[type] = true
      try {
        const items = await apiFetchCatalog(type)
        syncCatalog(type, items)
      } catch (error: unknown) {
        console.error('Failed to load catalog', error)
        catalogLoaded[type] = false
        throw error
      } finally {
        catalogLoading[type] = false
        delete catalogPromises[type]
      }
    })()
    catalogPromises[type] = loader
    await loader
  }

  async function preloadCatalogs(force = false) {
    await Promise.all(
      (Object.keys(catalog) as AssetType[]).map((type) => loadCatalog(type, force)),
    )
  }

  async function ensureCatalog(type: AssetType) {
    if (catalogLoaded[type]) return
    try {
      await loadCatalog(type)
    } catch (error) {
      console.error(error)
    }
  }

  async function fetchAssets(page = 1) {
    loading.value = true
    setError(null)
    try {
      const response = await apiFetchAssets({
        page,
        page_size: pagination.page_size,
        asset_type: filters.assetType,
        q: filters.search || undefined,
        tags: filters.tags || undefined,
        sort: filters.sort,
      })
      items.value = response.items
      Object.assign(pagination, response.pagination)
    } catch (error: any) {
      console.error(error)
      const message = error?.response?.data?.detail ?? error?.message ?? '加载资源列表失败'
      setError(message)
    } finally {
      loading.value = false
    }
  }

  async function createAsset(payload: Parameters<typeof apiCreateAsset>[0]) {
    loading.value = true
    setError(null)
    try {
      const created = await apiCreateAsset(payload)
      items.value = [created, ...items.value]
      await fetchAssets(1)
      return created
    } catch (error: any) {
      const message = error?.response?.data?.detail ?? error?.message ?? '上传资源失败'
      setError(message)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function updateAsset(assetId: string, payload: Parameters<typeof apiUpdateAsset>[1]) {
    loading.value = true
    setError(null)
    try {
      const updated = await apiUpdateAsset(assetId, payload)
      const index = items.value.findIndex((item) => item.id === assetId)
      if (index >= 0) {
        items.value.splice(index, 1, updated)
      }
      if (selectedAsset.value?.id === assetId) {
        selectedAsset.value = updated
      }
      return updated
    } catch (error: any) {
      const message = error?.response?.data?.detail ?? error?.message ?? '更新资源失败'
      setError(message)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function inspectAsset(id: string) {
    try {
      selectedAsset.value = await fetchAssetDetail(id)
    } catch (error) {
      console.error(error)
    }
  }

  function clearSelection() {
    selectedAsset.value = null
  }

  async function validateAssetId(id: string, assetType: AssetType): Promise<boolean> {
    // 检查现有资源中是否已存在
    const existingInAssets = items.value.some(asset => asset.id === id)
    if (existingInAssets) {
      return false
    }

    // 检查catalog中是否已预定义
    const existingInCatalog = catalog[assetType]?.some(item => item.id === id)
    if (existingInCatalog) {
      return false
    }

    // 可以选择性地调用后端API进行双重验证
    // 这里暂时只做前端验证，减少不必要的API调用
    return true
  }

  function getCatalogLabel(type: AssetType, id: string): string | undefined {
    const byType = catalogIndex.value[type]?.[id]
    if (byType) return byType
    return undefined
  }

  return {
    loading,
    items,
    filters,
    pagination,
    lastError,
    catalog,
    catalogIndex,
    assetTypeOptions,
    isEmpty,
    selectedAsset,
    catalogLoaded,
    catalogLoading,
    loadCatalog,
    ensureCatalog,
    preloadCatalogs,
    fetchAssets,
    createAsset,
    updateAsset,
    inspectAsset,
    clearSelection,
    validateAssetId,
    getCatalogLabel,
    setError,
  }
})
