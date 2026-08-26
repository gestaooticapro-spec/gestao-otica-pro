import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreModules, type StoreSettings } from '@/lib/store-modules'

export type ProgramUsageStatus = 'underused' | 'disabled' | 'never_used'

export type ProgramUsageGroupId =
  | 'atendimento'
  | 'operacao'
  | 'relacionamento'
  | 'financeiro'
  | 'estoque'

export type ProgramUsageCard = {
  id: string
  group: ProgramUsageGroupId
  feature: string
  status: ProgramUsageStatus
  detail: string
  periodCount: number | null
  previousMonthlyAverage: number | null
}

export type MonthlyProgramUsageSnapshot = {
  periodStart: string
  periodEnd: string
  cards: ProgramUsageCard[]
}

type UsageFilter = {
  column: string
  value: string | number | boolean
}

type UsageQuery = {
  table: string
  dateColumn: string
  filters?: UsageFilter[]
}

type Eligibility = 'sales' | 'orders' | 'financing' | 'always'

type FeatureDefinition = {
  id: string
  group: ProgramUsageGroupId
  feature: string
  enabled: boolean
  query?: UsageQuery
  eligibility: Eligibility
}

type UsageCounts = {
  allTime: number
  period: number
  previousThreeMonths: number
}

const MINIMUM_PREVIOUS_USAGE = 6
const UNDERUSE_RATIO = 0.25

function startOfSaoPauloDay(key: string) {
  return new Date(`${key}T00:00:00-03:00`).toISOString()
}

function nextDateKey(key: string) {
  const date = new Date(`${key}T12:00:00-03:00`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}

function previousThreeMonthsStart(key: string) {
  const [year, month] = key.split('-').map(Number)
  return new Date(Date.UTC(year, month - 4, 1, 12)).toISOString().slice(0, 10)
}

function applyFilters(query: any, filters: UsageFilter[] = []) {
  return filters.reduce((current, filter) => current.eq(filter.column, filter.value), query)
}

async function countUsage(
  admin: ReturnType<typeof createAdminClient>,
  storeId: number,
  usage: UsageQuery,
  start?: string,
  endExclusive?: string,
) {
  let query = (admin.from(usage.table) as any)
    .select('id', { count: 'exact', head: true })
    .eq('store_id', storeId)
  query = applyFilters(query, usage.filters)
  if (start) query = query.gte(usage.dateColumn, startOfSaoPauloDay(start))
  if (endExclusive) query = query.lt(usage.dateColumn, startOfSaoPauloDay(endExclusive))
  const { count, error } = await query
  if (error) return null
  return Number(count || 0)
}

async function loadUsageCounts(
  admin: ReturnType<typeof createAdminClient>,
  storeId: number,
  usage: UsageQuery,
  periodStart: string,
  periodEnd: string,
): Promise<UsageCounts | null> {
  const periodEndExclusive = nextDateKey(periodEnd)
  const baselineStart = previousThreeMonthsStart(periodStart)
  const [allTime, period, previousThreeMonths] = await Promise.all([
    countUsage(admin, storeId, usage),
    countUsage(admin, storeId, usage, periodStart, periodEndExclusive),
    countUsage(admin, storeId, usage, baselineStart, periodStart),
  ])
  if (allTime === null || period === null || previousThreeMonths === null) return null
  return { allTime, period, previousThreeMonths }
}

export function classifyProgramUsage(input: {
  enabled: boolean
  allTime: number | null
  period: number | null
  previousThreeMonths: number | null
  eligibleAllTime: boolean
  eligibleInPeriod: boolean
}): Omit<ProgramUsageCard, 'id' | 'group' | 'feature'> | null {
  if (!input.enabled) {
    return {
      status: 'disabled',
      detail: 'A função está desabilitada nas configurações da loja.',
      periodCount: null,
      previousMonthlyAverage: null,
    }
  }
  if (input.allTime === null || input.period === null || input.previousThreeMonths === null) return null
  if (input.eligibleAllTime && input.allTime === 0) {
    return {
      status: 'never_used',
      detail: 'Não encontramos nenhum uso registrado no histórico disponível.',
      periodCount: 0,
      previousMonthlyAverage: null,
    }
  }
  if (!input.eligibleInPeriod || input.previousThreeMonths < MINIMUM_PREVIOUS_USAGE) return null
  const previousMonthlyAverage = input.previousThreeMonths / 3
  if (input.period >= previousMonthlyAverage * UNDERUSE_RATIO) return null
  return {
    status: 'underused',
    detail: `Foi usada ${input.period} ${input.period === 1 ? 'vez' : 'vezes'} no período, contra média de ${previousMonthlyAverage.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} por mês nos três meses anteriores.`,
    periodCount: input.period,
    previousMonthlyAverage,
  }
}

function featureDefinitions(settings: StoreSettings): FeatureDefinition[] {
  const modules = getStoreModules(settings)
  const whatsappEnabled = settings.whatsapp_automation?.enabled === true
  return [
    { id: 'quick-sale', group: 'atendimento', feature: 'Venda rápida', enabled: modules.quickSale, eligibility: 'sales' },
    { id: 'optical-evaluation', group: 'atendimento', feature: 'Avaliação óptica', enabled: modules.evaluation, eligibility: 'sales', query: { table: 'optical_evaluations', dateColumn: 'created_at' } },
    { id: 'lab-tags', group: 'operacao', feature: 'Tags do laboratório', enabled: true, eligibility: 'orders', query: { table: 'nfc_tray_events', dateColumn: 'created_at' } },
    { id: 'labels', group: 'operacao', feature: 'Etiquetas de produtos', enabled: modules.labels, eligibility: 'sales' },
    { id: 'post-sales', group: 'relacionamento', feature: 'Pós-venda', enabled: modules.postSales, eligibility: 'orders', query: { table: 'post_sales', dateColumn: 'created_at' } },
    { id: 'automatic-whatsapp', group: 'relacionamento', feature: 'WhatsApp automático', enabled: whatsappEnabled, eligibility: 'sales', query: { table: 'whatsapp_outbound_messages', dateColumn: 'created_at' } },
    { id: 'collections', group: 'relacionamento', feature: 'Cobrança', enabled: modules.installments, eligibility: 'financing', query: { table: 'cobranca_historico', dateColumn: 'created_at' } },
    { id: 'assistance', group: 'relacionamento', feature: 'Programa de assistência', enabled: true, eligibility: 'sales', query: { table: 'assistance_tickets', dateColumn: 'created_at' } },
    { id: 'installments', group: 'financeiro', feature: 'Parcelamento da loja', enabled: modules.installments, eligibility: 'sales', query: { table: 'financiamento_loja', dateColumn: 'created_at' } },
    { id: 'cash-register', group: 'financeiro', feature: 'Livro Caixa', enabled: true, eligibility: 'sales', query: { table: 'caixa_diario', dateColumn: 'created_at' } },
    { id: 'accounts-payable', group: 'financeiro', feature: 'Contas a pagar', enabled: true, eligibility: 'always', query: { table: 'accounts_payable', dateColumn: 'created_at' } },
    { id: 'fiscal', group: 'financeiro', feature: 'Emissão fiscal', enabled: modules.fiscal, eligibility: 'sales', query: { table: 'vendas', dateColumn: 'data_fechamento', filters: [{ column: 'nf_emitida', value: true }] } },
    { id: 'stock-movements', group: 'estoque', feature: 'Movimentações de estoque', enabled: true, eligibility: 'sales', query: { table: 'stock_movements', dateColumn: 'created_at' } },
    { id: 'xml-import', group: 'estoque', feature: 'Importação de XML', enabled: modules.fiscal, eligibility: 'sales', query: { table: 'imported_invoices', dateColumn: 'imported_at' } },
    { id: 'global-tables', group: 'estoque', feature: 'Tabelas globais', enabled: modules.globalTables, eligibility: 'sales' },
  ]
}

export async function generateMonthlyProgramUsageSnapshot(
  storeId: number,
  periodStart: string,
  periodEnd: string,
): Promise<MonthlyProgramUsageSnapshot> {
  const admin = createAdminClient({ noStore: true })
  const { data: store, error: storeError } = await (admin.from('stores') as any)
    .select('settings')
    .eq('id', storeId)
    .single()
  if (storeError) throw storeError

  const definitions = featureDefinitions((store?.settings || {}) as StoreSettings)
  const salesQuery: UsageQuery = { table: 'vendas', dateColumn: 'data_fechamento', filters: [{ column: 'status', value: 'Fechada' }] }
  const ordersQuery: UsageQuery = { table: 'service_orders', dateColumn: 'created_at' }
  const financingQuery: UsageQuery = { table: 'financiamento_loja', dateColumn: 'created_at' }
  const [sales, orders, financing, ...featureCounts] = await Promise.all([
    loadUsageCounts(admin, storeId, salesQuery, periodStart, periodEnd),
    loadUsageCounts(admin, storeId, ordersQuery, periodStart, periodEnd),
    loadUsageCounts(admin, storeId, financingQuery, periodStart, periodEnd),
    ...definitions.map((definition) => definition.query
      ? loadUsageCounts(admin, storeId, definition.query, periodStart, periodEnd)
      : Promise.resolve(null)),
  ])

  const eligibility = {
    sales,
    orders,
    financing,
    always: { allTime: 1, period: 1, previousThreeMonths: 1 },
  }
  const cards = definitions.flatMap((definition, index) => {
    const counts = featureCounts[index]
    const eligibleCounts = eligibility[definition.eligibility]
    const classification = classifyProgramUsage({
      enabled: definition.enabled,
      allTime: counts?.allTime ?? null,
      period: counts?.period ?? null,
      previousThreeMonths: counts?.previousThreeMonths ?? null,
      eligibleAllTime: Boolean(eligibleCounts?.allTime),
      eligibleInPeriod: Boolean(eligibleCounts?.period),
    })
    return classification ? [{
      id: definition.id,
      group: definition.group,
      feature: definition.feature,
      ...classification,
    } satisfies ProgramUsageCard] : []
  })

  return { periodStart, periodEnd, cards }
}
