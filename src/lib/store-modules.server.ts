import { createAdminClient } from '@/lib/supabase/admin'
import { StoreModuleKey, StoreSettings, getStoreModules } from '@/lib/store-modules'

export async function getStoreModulesForStore(storeId: number) {
  const supabase = createAdminClient()
  const { data: store } = await supabase
    .from('stores')
    .select('settings')
    .eq('id', storeId)
    .maybeSingle()

  const settings = (store as { settings?: unknown } | null)?.settings
  return getStoreModules((settings || null) as StoreSettings | null)
}

export async function isStoreModuleEnabledForStore(storeId: number, moduleKey: StoreModuleKey) {
  const modules = await getStoreModulesForStore(storeId)
  return modules[moduleKey]
}

export async function getStoreModuleDisabledMessage(storeId: number, moduleKey: StoreModuleKey) {
  const enabled = await isStoreModuleEnabledForStore(storeId, moduleKey)
  return enabled ? null : `Modulo ${moduleKey} desativado para esta loja.`
}
