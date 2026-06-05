import { Json } from '@/lib/database.types'

export type StoreModuleKey =
  | 'fiscal'
  | 'installments'
  | 'postSales'
  | 'evaluation'
  | 'quickSale'
  | 'labels'

export type StoreModules = Record<StoreModuleKey, boolean>

export type StoreSettings = {
  logo?: string
  receipt_type?: 'pre_printed' | 'half_a4'
  pre_sale_analysis_enabled?: boolean
  module_fiscal_enabled?: boolean
  module_installments_enabled?: boolean
  module_post_sales_enabled?: boolean
  module_quick_sale_enabled?: boolean
  module_labels_enabled?: boolean
  [key: string]: Json | undefined
}

export const STORE_MODULE_LABELS: Record<StoreModuleKey, string> = {
  fiscal: 'Fiscal',
  installments: 'Parcelamento',
  postSales: 'Pos-venda',
  evaluation: 'Avaliacao',
  quickSale: 'Venda rapida',
  labels: 'Etiquetas',
}

export const DEFAULT_STORE_MODULES: StoreModules = {
  fiscal: true,
  installments: true,
  postSales: true,
  evaluation: false,
  quickSale: true,
  labels: true,
}

export function getStoreModules(settings?: StoreSettings | null): StoreModules {
  return {
    fiscal: settings?.module_fiscal_enabled !== false,
    installments: settings?.module_installments_enabled !== false,
    postSales: settings?.module_post_sales_enabled !== false,
    evaluation: settings?.pre_sale_analysis_enabled === true,
    quickSale: settings?.module_quick_sale_enabled !== false,
    labels: settings?.module_labels_enabled !== false,
  }
}

export function isStoreModuleEnabled(
  settings: StoreSettings | null | undefined,
  moduleKey: StoreModuleKey
) {
  return getStoreModules(settings)[moduleKey]
}
