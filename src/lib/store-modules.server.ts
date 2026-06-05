import { getStoreProfile } from '@/lib/actions/store.actions'
import { StoreModuleKey, StoreSettings, getStoreModules } from '@/lib/store-modules'

export async function getStoreModulesForStore(storeId: number) {
  const store = await getStoreProfile(storeId)
  return getStoreModules((store?.settings || null) as StoreSettings | null)
}

export async function isStoreModuleEnabledForStore(storeId: number, moduleKey: StoreModuleKey) {
  const modules = await getStoreModulesForStore(storeId)
  return modules[moduleKey]
}
