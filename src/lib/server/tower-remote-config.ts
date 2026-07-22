import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeTowerRemoteConfig, type TowerRemoteConfig } from '@/lib/tower/remote-config'

export async function readTowerRemoteConfig(storeId: number, tenantId?: string): Promise<TowerRemoteConfig | null> {
  const admin = createAdminClient()
  let query = admin
    .from('stores')
    .select('settings')
    .eq('id', storeId)
  if (tenantId) query = query.eq('tenant_id', tenantId)
  const { data, error } = await query.maybeSingle()

  if (error || !data) return null
  const settings = (data as unknown as { settings: unknown }).settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings) || (settings as Record<string, unknown>).tower_enabled !== true) return null
  return normalizeTowerRemoteConfig(settings)
}
