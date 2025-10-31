import axios from 'axios'
import type { Asset, AssetListResponse, AssetType, CatalogItem } from '@/types/assets'
import { useAuthStore } from '@/stores/auth'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL

const client = axios.create({
  baseURL: apiBaseUrl && apiBaseUrl.length > 0 ? apiBaseUrl : undefined,
  timeout: 20000,
})

client.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.apiKey) {
    config.headers = config.headers ?? {}
    config.headers['X-API-Key'] = auth.apiKey
  }
  return config
})

export interface AssetQuery {
  page?: number
  page_size?: number
  q?: string
  asset_type?: string
  tags?: string
  sort?: string
}

export interface AssetFormPayload {
  id?: string
  asset_type: AssetType
  title?: string | null
  description?: string | null
  tags?: string[]
  notes?: string | null
  uploaded_by?: string | null
  file?: File
  extra_metadata?: Record<string, unknown> | null
}

export async function fetchAssets(params: AssetQuery): Promise<AssetListResponse> {
  const response = await client.get<AssetListResponse>('/api/assets', { params })
  return response.data
}

export async function fetchCatalog(type: AssetType): Promise<CatalogItem[]> {
  const response = await client.get<{ type: AssetType; items: CatalogItem[] }>(`/api/catalog/${type}`)
  return response.data.items
}

export async function fetchAssetDetail(id: string): Promise<Asset> {
  const response = await client.get<Asset>(`/api/assets/${id}`)
  return response.data
}

export async function createAsset(payload: AssetFormPayload): Promise<Asset> {
  if (!payload.file || !payload.id) {
    throw new Error('文件与 ID 为必填项')
  }
  const form = new FormData()
  form.set('id', payload.id)
  form.set('asset_type', payload.asset_type)
  if (payload.title) form.set('title', payload.title)
  if (payload.description) form.set('description', payload.description)
  if (payload.tags?.length) form.set('tags', JSON.stringify(payload.tags))
  if (payload.notes) form.set('notes', payload.notes)
  if (payload.uploaded_by) form.set('uploaded_by', payload.uploaded_by)
  if (payload.extra_metadata) form.set('extra_metadata', JSON.stringify(payload.extra_metadata))
  form.set('file', payload.file)

  const response = await client.post<Asset>('/api/assets', form)
  return response.data
}

export async function updateAsset(id: string, payload: AssetFormPayload): Promise<Asset> {
  const form = new FormData()
  if (payload.title !== undefined && payload.title !== null) form.set('title', payload.title)
  if (payload.description !== undefined && payload.description !== null) form.set('description', payload.description)
  if (payload.tags) form.set('tags', JSON.stringify(payload.tags))
  if (payload.notes) form.set('notes', payload.notes)
  if (payload.uploaded_by) form.set('uploaded_by', payload.uploaded_by)
  if (payload.extra_metadata) form.set('extra_metadata', JSON.stringify(payload.extra_metadata))
  if (payload.file) form.set('file', payload.file)

  const response = await client.patch<Asset>(`/api/assets/${id}`, form)
  return response.data
}
