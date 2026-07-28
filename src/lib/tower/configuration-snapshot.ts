import type { AiSuggestionConfig } from '@/lib/types/ai-config.types'
import type { TowerRemoteConfig } from '@/lib/tower/remote-config'
import type { RecommendationCatalog } from '@/lib/server/lens-recommendation'

export const TOWER_CONFIGURATION_SNAPSHOT_VERSION = 1 as const

export type TowerCatalogSnapshot = {
  versionId: string
  laboratorio: string
  versao: string
  publishedAt: string | null
}

export type TowerCustomerSnapshot = {
  id: number
  fullName: string
  mobilePhone: string | null
  updatedAt: string | null
}

export type TowerConfigurationSnapshot = {
  schemaVersion: typeof TOWER_CONFIGURATION_SNAPSHOT_VERSION
  revision: string
  generatedAt: string
  storeId: number
  remoteConfig: TowerRemoteConfig
  catalogs: TowerCatalogSnapshot[]
  availableCatalogs: TowerCatalogSnapshot[]
  aiSuggestionConfig: AiSuggestionConfig
  customers: TowerCustomerSnapshot[]
  visagismoFrames: unknown[]
  operationalCatalog?: {
    catalog: unknown
    geometries: unknown[]
    recommendationData: RecommendationCatalog
  }
}
