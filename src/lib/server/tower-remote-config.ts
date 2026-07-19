import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeTowerRemoteConfig, type TowerRemoteConfig } from '@/lib/tower/remote-config'

export async function readTowerRemoteConfig(storeId: number): Promise<TowerRemoteConfig | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('stores')
    .select('settings')
    .eq('id', storeId)
    .maybeSingle()

  if (error || !data) return null
  const settings = (data as unknown as { settings: unknown }).settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || (settings as Record<string, unknown>).tower_enabled !== true) return null
  return normalizeTowerRemoteConfig(settings)
}
