'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_STORE_MODULES, StoreModules } from '@/lib/store-modules'

const StoreModulesContext = createContext<StoreModules>(DEFAULT_STORE_MODULES)

export function StoreModulesProvider({
  children,
  modules,
}: {
  children: React.ReactNode
  modules: StoreModules
}) {
  return (
    <StoreModulesContext.Provider value={modules}>
      {children}
    </StoreModulesContext.Provider>
  )
}

export function useStoreModules() {
  return useContext(StoreModulesContext)
}
