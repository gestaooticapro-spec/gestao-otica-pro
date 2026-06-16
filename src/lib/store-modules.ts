import { Json } from '@/lib/database.types'

export type WhatsAppOsReplyTemplates = {
  lens_in_production: string
  lens_arrived_needs_frame: string
  lens_arrived_assembling: string
  ready_for_pickup: string
}

export type WhatsAppAutomationOsOnDemandSettings = {
  enabled?: boolean
  templates?: Partial<WhatsAppOsReplyTemplates>
}

export type WhatsAppAutomationSettings = {
  os_on_demand?: WhatsAppAutomationOsOnDemandSettings
  [key: string]: Json | undefined
}

export type StoreModuleKey =
  | 'fiscal'
  | 'installments'
  | 'postSales'
  | 'evaluation'
  | 'globalTables'
  | 'quickSale'
  | 'labels'

export type StoreModules = Record<StoreModuleKey, boolean>

export type StoreSettings = {
  logo?: string
  receipt_type?: 'pre_printed' | 'half_a4'
  commission_generation_mode?: 'closed_only' | 'open_or_closed'
  delivery_date_enabled?: boolean
  service_order_mode?: 'single' | 'multiple'
  pre_sale_analysis_enabled?: boolean
  module_global_tables_enabled?: boolean
  module_fiscal_enabled?: boolean
  module_installments_enabled?: boolean
  module_post_sales_enabled?: boolean
  module_quick_sale_enabled?: boolean
  module_labels_enabled?: boolean
  whatsapp_automation?: WhatsAppAutomationSettings
  [key: string]: Json | undefined
}

export const STORE_MODULE_LABELS: Record<StoreModuleKey, string> = {
  fiscal: 'Fiscal',
  installments: 'Parcelamento',
  postSales: 'Pós-venda',
  evaluation: 'Avaliação',
  globalTables: 'Tabelas Globais',
  quickSale: 'Venda rápida',
  labels: 'Etiquetas',
}

export const DEFAULT_STORE_MODULES: StoreModules = {
  fiscal: true,
  installments: true,
  postSales: true,
  evaluation: false,
  globalTables: false,
  quickSale: true,
  labels: true,
}

export function getStoreModules(settings?: StoreSettings | null): StoreModules {
  const evaluationEnabled = settings?.pre_sale_analysis_enabled === true
  const globalTablesEnabled =
    evaluationEnabled || settings?.module_global_tables_enabled === true

  return {
    fiscal: settings?.module_fiscal_enabled !== false,
    installments: settings?.module_installments_enabled !== false,
    postSales: settings?.module_post_sales_enabled !== false,
    evaluation: evaluationEnabled,
    globalTables: globalTablesEnabled,
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
