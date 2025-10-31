export type AssetType = 'monster' | 'map' | 'skill' | 'misc'

export interface AssetRevision {
  id: number
  file_name: string
  file_path: string
  file_size: number
  content_type?: string | null
  checksum?: string | null
  notes?: string | null
  uploaded_by?: string | null
  created_at: string
  download_url: string
}

export interface Asset {
  id: string
  asset_type: AssetType
  title?: string | null
  description?: string | null
  tags: string[]
  extra_metadata?: Record<string, unknown> | null
  created_at: string
  updated_at: string
  latest_revision?: AssetRevision | null
  revisions: AssetRevision[]
}

export interface PaginationMeta {
  total: number
  page: number
  page_size: number
  pages: number
}

export interface AssetListResponse {
  items: Asset[]
  pagination: PaginationMeta
  // optional future fields like sort can be added without breaking
}

export interface CatalogItem {
  id: string
  label: string
}
