import { Json } from '@/lib/database.types'

export type StoreWeeklySchedule = {
  is_open: boolean
  open_time: string // HH:mm
  close_time: string // HH:mm
}

export type StoreBreakWindow = {
  id: string
  start_time: string // HH:mm
  end_time: string // HH:mm
  days: number[] // 0 (Sun) to 6 (Sat)
  reason?: string
}

export type StoreSpecialClosure = {
  id: string
  date: string // YYYY-MM-DD
  reason: string
}

export type StoreSpecialOpening = {
  id: string
  date: string // YYYY-MM-DD
  open_time: string // HH:mm
  close_time: string // HH:mm
  reason: string
}

export type StoreHoursConfig = {
  timezone: string // default: "America/Sao_Paulo"
  weekly_schedule: Record<number, StoreWeeklySchedule> // 0 to 6
  break_windows: StoreBreakWindow[]
  special_closures: StoreSpecialClosure[]
  special_openings: StoreSpecialOpening[]
}

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

export type WhatsAppInstallmentDueReminderSettings = {
  enabled?: boolean
  template?: string
  days_before_due?: number
}

export type WhatsAppPostSaleFollowupSettings = {
  enabled?: boolean
  template?: string
  days_after_delivery?: number
  business_hours_only?: boolean
}

export type WhatsAppAiResponderSettings = {
  enabled?: boolean
  prompt?: string
}

export type WhatsAppAutomationSettings = {
  enabled?: boolean
  os_on_demand?: WhatsAppAutomationOsOnDemandSettings
  installment_due_reminder?: WhatsAppInstallmentDueReminderSettings
  post_sale_followup?: WhatsAppPostSaleFollowupSettings
  ai_responder?: WhatsAppAiResponderSettings
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
  store_hours?: StoreHoursConfig
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
