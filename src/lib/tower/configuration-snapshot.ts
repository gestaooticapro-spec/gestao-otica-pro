import type { AiSuggestionConfig } from '@/lib/types/ai-config.types'
import type { TowerRemoteConfig } from '@/lib/tower/remote-config'

export const TOWER_CONFIGURATION_SNAPSHOT_VERSION = 1 as const

export type TowerActiveCatalogSnapshot = {
  activationId: string
  versionId: string
  laboratorio: string
  versao: string
  activatedAt: string
  lastSyncedAt: string | null
}

export type TowerConfigurationSnapshot = {
  schemaVersion: typeof TOWER_CONFIGURATION_SNAPSHOT_VERSION
  revision: string
  generatedAt: string
  storeId: number
  remoteConfig: TowerRemoteConfig
  catalogs: TowerActiveCatalogSnapshot[]
  aiSuggestionConfig: AiSuggestionConfig
}

