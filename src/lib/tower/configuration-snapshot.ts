import type { AiSuggestionConfig } from '@/lib/types/ai-config.types'
import type { TowerRemoteConfig } from '@/lib/tower/remote-config'
import type { RecommendationCatalog } from '@/lib/server/lens-recommendation'

export const TOWER_CONFIGURATION_SNAPSHOT_VERSION = 1 as const

export type TowerActiveCatalogSnapshot = {
  activationId: string
  versionId: string
  laboratorio: string
  versao: string
  activatedAt: string
  lastSyncedAt: string | null
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
  catalogs: TowerActiveCatalogSnapshot[]
  availableCatalogs: TowerActiveCatalogSnapshot[]
  aiSuggestionConfig: AiSuggestionConfig
  customers: TowerCustomerSnapshot[]
  operationalCatalog?: {
    catalog: unknown
    geometries: unknown[]
    frames: unknown[]
    recommendationData: RecommendationCatalog
  }
}
