import { createAdminClient } from '@/lib/supabase/admin'
import { getWhatsAppPendencias } from '@/lib/actions/consultas.actions'
import { phonesMatch } from '@/lib/whatsapp/phone'
import { customerDuplicateCandidates, productDuplicateCandidates } from '@/lib/daily-health-data-quality'
import { generateMonthlyProgramUsageSnapshot, type MonthlyProgramUsageSnapshot } from '@/lib/monthly-program-usage'

export type DailyHealthArea = 'financeiro' | 'operacao' | 'relacionamento' | 'cadastros'
export type DailyHealthPriority = 'critico' | 'atencao' | 'informativo'
export type DailyHealthAlertState = 'novo' | 'piorou' | 'melhorou' | 'persistente'

export type DailyHealthAlertLifecycle = {
  state: DailyHealthAlertState
  firstSeen: string
  daysOpen: number
  previousImpact: number | null
  impactChange: number | null
  newRecords: number
  resolvedRecords: number
  show: boolean
}

export type DailyHealthAlert = {
  id: string
  area: DailyHealthArea
  priority: DailyHealthPriority
  title: string
  detail: string
  impact: number | null
  confidence: 'alta' | 'media'
  href: string
  records: { type: string; ids: number[] }
  presentation?: { title: string; detail: string }
  lifecycle?: DailyHealthAlertLifecycle
}

export type DailyHealthAreaLifecycle = {
  newCount: number
  worsenedCount: number
  improvedCount: number
  persistentCount: number
  resolvedCount: number
}

export type DailyHealthAmountComparison = {
  yesterday: number
  monthToDate: number
  samePeriodLastYear: number | null
}

export type DailyHealthSalesSummary = {
  sales: {
    cash: DailyHealthAmountComparison
    credit: DailyHealthAmountComparison
    total: DailyHealthAmountComparison
  }
  receipts: {
    sales: DailyHealthAmountComparison
    installments: DailyHealthAmountComparison
    total: DailyHealthAmountComparison
  }
}

export type DailyHealthMetrics = {
  salesSummary: DailyHealthSalesSummary
  sales: number
  salesComparison: number | null
  received: number
  newFinanced: number
  receivable: number
  overdue: number
  overdueInstallments: number
  dueSoon: number
  activeFinancing: number
  multiFinancingCustomers: number
  readyForPickup: number
  staleReadyForPickup: number
  readyForPickupLongStay: number
  readyForPickupWithoutPhone: number
  readyForPickupWithoutNotice: number
  overdueOrders: number
  ordersWithoutLabRequest: number
  labArrivalOverdue: number
  mountingOverdue: number
  mountingWaitingForFrame: number
  ordersWithoutLensLink: number
  ordersWithoutPrescription: number
  ordersWithoutPromise: number
  inconsistentOrderTimeline: number
  lensSalesWithoutOrder: number
  cancelledSalesWithOpenOrder: number
  pendingPostSales: number
  postSalesCompletedYesterday: number
  postSalesCompletedWeek: number
  postSaleAnalysis: PostSaleAnalysis
  pendingWhatsApp: number
  costCoverage: number | null
  creditAnalysis: CreditAnalysis
  accountsPayableAnalysis?: AccountsPayableAnalysis
  dataQualityAnalysis: DataQualityAnalysis
  areaNarratives?: DailyHealthAreaNarratives
  alertLifecycle?: Record<DailyHealthArea, DailyHealthAreaLifecycle>
}

export type AccountsPayableAnalysis = {
  pendingCount: number
  pendingValue: number
  overdueCount: number
  overdueValue: number
  oldestOverdueDays: number
  dueNext7Count: number
  dueNext7Value: number
  dueTodayCount: number
  overdueRecords: number[]
  dueNext7Records: number[]
}

export type DataQualityAnalysis = {
  duplicateCustomerIds: number[]
  duplicateCustomerCpfGroups: number
  duplicateCustomerPhoneGroups: number
  duplicateCustomerNameGroups: number
  duplicateProductIds: number[]
  duplicateProductCompositeGroups: number
  usedProductsWithoutCostIds: number[]
  staleOpenSaleIds: number[]
}

export type CreditGroupInsight = {
  label: string
  rate: number | null
  lateInstallments: number
  dueInstallments: number
}

export type CreditAnalysis = {
  historicalLateRate: number | null
  historicalLateInstallments: number
  historicalDueInstallments: number
  currentDelinquencyRate: number | null
  currentDelinquencyInstallments: number
  currentDelinquencyValue: number
  historicalPeakLateRate: number | null
  historicalPeakLateMonth: string | null
  delinquencyAging: {
    over30Installments: number
    over30Value: number
    over60Installments: number
    over60Value: number
    over90Installments: number
    over90Value: number
    over90CustomersOutsideSpc: number
  }
  multiplePurchaseSignal: string | null
  termGroups: CreditGroupInsight[]
  simultaneousGroups: CreditGroupInsight[]
  strongestSignal: string | null
  recommendation: string
  narrative: string
}

export type PostSaleAnalysis = {
  total: number
  noPhone: number
  messageSent: number
  messageScheduled: number
  messageNoResponse: number
  customerResponded: number
  ratingsReceived: number
  lowRatingCount: number
  lowRatingYesterdayCount: number
  lowRatingMonthCount: number
  respondedWithoutRating: number
  messageFailed: number
  messageCancelled: number
  noMessageAttempt: number
  complaintOrAdaptation: number
  complaintOrAdaptationYesterday: number
  complaintOrAdaptationMonth: number
  awaitingHumanReview: number
  awaitingRating: number
  deliveryIssueIds: number[]
  humanReviewIds: number[]
  satisfactionIds: number[]
  lowRatingIds: number[]
  yesterdaySatisfactionIds: number[]
  monthSatisfactionIds: number[]
}

export type DailyHealthAreaNarratives = {
  financeiro: string
  operacao: string
  relacionamento: string
  cadastros: string
  relacionamentoConcern: string | null
}

export type DailyHealthReport = {
  id?: number
  reportDate: string
  status: 'generating' | 'ready' | 'failed'
  metrics: DailyHealthMetrics
  alerts: DailyHealthAlert[]
  narrative: string
  sourceFailures: string[]
  generatedAt: string | null
}

export type HealthSnapshotCadence = 'weekly' | 'monthly'

export type PeriodicHealthSnapshot = {
  cadence: HealthSnapshotCadence
  periodStart: string
  periodEnd: string
  generatedAt: string | null
  narrative: string
  alerts: DailyHealthAlert[]
  programUsage: MonthlyProgramUsageSnapshot | null
  isPreview?: boolean
}

function reportFromStoredRow(data: any): DailyHealthReport {
  return {
    id: data.id,
    reportDate: data.report_date,
    status: data.status,
    metrics: data.metrics,
    alerts: data.alerts,
    narrative: data.narrative,
    sourceFailures: data.source_failures || [],
    generatedAt: data.generated_at,
  }
}

function periodicSnapshotFromStoredRow(data: any): PeriodicHealthSnapshot {
  return {
    cadence: data.cadence,
    periodStart: data.period_start,
    periodEnd: data.period_end,
    generatedAt: data.generated_at,
    narrative: data.narrative || '',
    alerts: Array.isArray(data.alerts) ? data.alerts : [],
    programUsage: data.cadence === 'monthly' && data.metrics?.programUsage
      ? data.metrics.programUsage as MonthlyProgramUsageSnapshot
      : null,
  }
}

function isReadySnapshot(data: any) {
  return data?.status === 'ready'
}

export type DailyHealthSettings = {
  overdueCriticalValue: number
  minimumCostCoverage: number
  labRequestHours: number
  labStaleHours: number
}

export const DEFAULT_DAILY_HEALTH_SETTINGS: DailyHealthSettings = {
  overdueCriticalValue: 5000,
  minimumCostCoverage: 0.9,
  labRequestHours: 24,
  labStaleHours: 24,
}

function normalizeSettings(input: unknown): DailyHealthSettings {
  const value = input && typeof input === 'object' ? input as Partial<DailyHealthSettings> : {}
  return {
    overdueCriticalValue: Number.isFinite(Number(value.overdueCriticalValue)) ? Math.max(0, Number(value.overdueCriticalValue)) : DEFAULT_DAILY_HEALTH_SETTINGS.overdueCriticalValue,
    minimumCostCoverage: Number.isFinite(Number(value.minimumCostCoverage)) ? Math.min(1, Math.max(0, Number(value.minimumCostCoverage))) : DEFAULT_DAILY_HEALTH_SETTINGS.minimumCostCoverage,
    labRequestHours: Number.isFinite(Number(value.labRequestHours)) ? Math.max(1, Number(value.labRequestHours)) : DEFAULT_DAILY_HEALTH_SETTINGS.labRequestHours,
    labStaleHours: Number.isFinite(Number(value.labStaleHours)) ? Math.max(24, Number(value.labStaleHours)) : DEFAULT_DAILY_HEALTH_SETTINGS.labStaleHours,
  }
}

export async function getDailyHealthSettings(storeId: number) {
  const admin = createAdminClient({ noStore: true })
  const { data } = await (admin.from('daily_store_health_settings') as any).select('settings').eq('store_id', storeId).maybeSingle()
  return normalizeSettings(data?.settings)
}

const SAO_PAULO = 'America/Sao_Paulo'
const DAY_MS = 24 * 60 * 60 * 1000
const LOCAL_MOUNTING_LIMIT_HOURS = 24
const CUSTOMER_FRAME_CONCERN_HOURS = 7 * 24
const ORDER_SEQUENCE_TOLERANCE_MS = 4 * 60 * 60 * 1000
const MONTHLY_RELATIONSHIP_SIGNAL_THRESHOLD = 3

function dateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: SAO_PAULO, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '00'
  return `${get('year')}-${get('month')}-${get('day')}`
}

function rangeForDate(key: string) {
  return {
    start: new Date(`${key}T00:00:00-03:00`).toISOString(),
    end: new Date(`${key}T23:59:59.999-03:00`).toISOString(),
  }
}

// Payments use data_pagamento as a business date persisted at midnight UTC.
// Querying it in Sao Paulo time would place that midnight in the prior local day.
function rangeForBusinessDate(key: string) {
  const start = new Date(`${key}T00:00:00.000Z`)
  const end = new Date(start.getTime() + DAY_MS)
  return { start: start.toISOString(), end: end.toISOString() }
}

function previousDateKey(key: string, days: number) {
  return dateKey(new Date(new Date(`${key}T12:00:00-03:00`).getTime() - days * DAY_MS))
}

function firstDayOfMonth(key: string) {
  return `${key.slice(0, 7)}-01`
}

function sameDatePreviousYear(key: string) {
  const [year, month, day] = key.split('-').map(Number)
  const candidate = new Date(Date.UTC(year - 1, month - 1, day, 12))
  return candidate.toISOString().slice(0, 10)
}

function rangeFromStartOfMonth(key: string) {
  const end = rangeForDate(key).end
  const start = rangeForDate(firstDayOfMonth(key)).start
  return { start, end }
}

function isMeaningfullyBefore(first: string | null, second: string | null) {
  return Boolean(first && second && new Date(first).getTime() + ORDER_SEQUENCE_TOLERANCE_MS < new Date(second).getTime())
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function sum(rows: any[], field: string) {
  return rows.reduce((total, row) => total + Number(row?.[field] || 0), 0)
}

export function periodicPeriodForReportDate(reportDate: string, cadence: HealthSnapshotCadence, allowOpenMonthly = false) {
  const date = new Date(`${reportDate}T12:00:00-03:00`)
  if (cadence === 'weekly') {
    const daysFromMonday = (date.getDay() + 6) % 7
    if (date.getDay() !== 0) return null
    return { start: previousDateKey(reportDate, daysFromMonday), end: reportDate }
  }
  const nextDay = new Date(date.getTime() + DAY_MS)
  if (!allowOpenMonthly && nextDay.getMonth() === date.getMonth()) return null
  return { start: firstDayOfMonth(reportDate), end: reportDate }
}

function buildMountingAttention(orders: any[], reportEnd: number) {
  const elapsedHours = (value: string | null) => value
    ? Math.max(0, (reportEnd - new Date(value).getTime()) / (60 * 60 * 1000))
    : 0
  const openForMounting = orders.filter((order) => Boolean(order.dt_lente_chegou) && !order.dt_montado_em && !order.dt_montado_no_lab)
  const mountingOverdue = openForMounting.filter((order) => order.armacao_com_cliente !== true && elapsedHours(order.dt_lente_chegou) > LOCAL_MOUNTING_LIMIT_HOURS)
  const mountingWaitingForFrame = openForMounting.filter((order) => order.armacao_com_cliente === true && elapsedHours(order.dt_lente_chegou) > CUSTOMER_FRAME_CONCERN_HOURS)
  return { mountingOverdue, mountingWaitingForFrame }
}

function buildReadyPickupAttention(orders: any[], pickupNotices: any[], reportEnd: number) {
  const notifiedOrderIds = new Set(pickupNotices
    .filter((notice) => notice.status === 'sent')
    .map((notice) => Number(notice.payload?.metadata?.osId))
    .filter(Number.isFinite))
  const mounted = orders.filter((order) => Boolean(order.dt_montado_em) && !order.dt_entregue_em)
  const ageInDays = (order: any) => Math.max(0, (reportEnd - new Date(order.dt_montado_em).getTime()) / DAY_MS)
  const stale = mounted.filter((order) => ageInDays(order) > 7)
  const customerFor = (order: any) => Array.isArray(order.customers) ? order.customers[0] : order.customers
  const hasPhone = (order: any) => normalizedDigits(customerFor(order)?.fone_movel || customerFor(order)?.phone).length >= 8
  return {
    readyForPickup: mounted,
    staleReadyForPickup: stale,
    longStay: stale.filter((order) => ageInDays(order) >= 30),
    withoutPhone: stale.filter((order) => !hasPhone(order)),
    withoutNotice: stale.filter((order) => hasPhone(order) && !notifiedOrderIds.has(Number(order.id))),
  }
}

function normalizedDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '')
}

function buildDataQualityAnalysis(customers: any[], products: any[], auditItems: any[], openSales: any[], reportEnd: number, resolvedFingerprints = new Set<string>()): DataQualityAnalysis {
  const customerCandidates = customerDuplicateCandidates(customers)
  const productCandidates = productDuplicateCandidates(products)
  const customerGroups = customerCandidates.groups.filter((group) => !resolvedFingerprints.has(group.fingerprint))
  const productGroups = productCandidates.groups.filter((group) => !resolvedFingerprints.has(group.fingerprint))
  const customerIds = new Set(customerGroups.flatMap((group) => group.ids))
  const productIds = new Set(productGroups.flatMap((group) => group.ids))
  const activeCriteriaCount = (criteria: Array<{ ids: number[]; reason: string }>, reason: string, ids: Set<number>) => criteria.filter((group) => group.reason === reason && group.ids.some((id) => ids.has(id))).length
  const soldProductIds = new Set(auditItems.map((item) => Number(item.product_id)).filter(Number.isFinite))
  const usedProductsWithoutCostIds = products
    .filter((product) => soldProductIds.has(Number(product.id)) && ['Armacao', 'Lente', 'LenteContato'].includes(String(product.tipo_produto)) && Number(product.preco_custo || 0) <= 0)
    .map((product) => Number(product.id))
  const staleOpenSaleIds = openSales
    .filter((sale) => new Date(sale.created_at).getTime() < reportEnd - 7 * DAY_MS)
    .map((sale) => Number(sale.id))
    .filter(Number.isFinite)
  return {
    duplicateCustomerIds: [...customerIds],
    duplicateCustomerCpfGroups: activeCriteriaCount(customerCandidates.criteria, 'cpf', customerIds),
    duplicateCustomerPhoneGroups: activeCriteriaCount(customerCandidates.criteria, 'telefone', customerIds),
    duplicateCustomerNameGroups: activeCriteriaCount(customerCandidates.criteria, 'nome', customerIds),
    duplicateProductIds: [...productIds],
    duplicateProductCompositeGroups: activeCriteriaCount(productCandidates.criteria, 'produto_composto', productIds),
    usedProductsWithoutCostIds,
    staleOpenSaleIds,
  }
}

function buildSalesSummary(
  yesterdaySales: any[],
  monthSales: any[],
  lastYearSales: any[] | null,
  yesterdayPayments: any[],
  monthPayments: any[],
  lastYearPayments: any[] | null,
): DailyHealthSalesSummary {
  const salesAmounts = (sales: any[]) => {
    const total = sum(sales, 'valor_final')
    const credit = sales.reduce((amount, sale) => {
      const financings = sale.financiamento_loja
      const financed = Array.isArray(financings)
        ? financings.reduce((sum: number, financing: any) => sum + Number(financing.valor_total_financiado || 0), 0)
        : Number(financings?.valor_total_financiado || 0)
      return amount + Number(sale.valor_restante || 0) + financed
    }, 0)
    return { cash: Math.max(0, total - credit), credit, total }
  }
  const receiptAmounts = (payments: any[]) => {
    const sales = payments.filter((payment) => payment.parcela_id == null)
    const installments = payments.filter((payment) => payment.parcela_id != null)
    const directSales = sum(sales, 'valor_pago')
    const installmentPayments = sum(installments, 'valor_pago')
    return { sales: directSales, installments: installmentPayments, total: directSales + installmentPayments }
  }
  const yesterday = salesAmounts(yesterdaySales)
  const month = salesAmounts(monthSales)
  const annual = lastYearSales ? salesAmounts(lastYearSales) : null
  const yesterdayReceipts = receiptAmounts(yesterdayPayments)
  const monthReceipts = receiptAmounts(monthPayments)
  const annualReceipts = lastYearPayments ? receiptAmounts(lastYearPayments) : null
  const comparison = (field: 'cash' | 'credit' | 'total'): DailyHealthAmountComparison => ({
    yesterday: yesterday[field], monthToDate: month[field], samePeriodLastYear: annual?.[field] ?? null,
  })
  const receiptComparison = (field: 'sales' | 'installments' | 'total'): DailyHealthAmountComparison => ({
    yesterday: yesterdayReceipts[field], monthToDate: monthReceipts[field], samePeriodLastYear: annualReceipts?.[field] ?? null,
  })
  return {
    sales: { cash: comparison('cash'), credit: comparison('credit'), total: comparison('total') },
    receipts: { sales: receiptComparison('sales'), installments: receiptComparison('installments'), total: receiptComparison('total') },
  }
}

function outstanding(item: any) {
  return Math.max(0, Number(item.valor_parcela || 0) - Number(item.valor_pago || 0) - Number(item.valor_transferido_saida || 0) + Number(item.valor_transferido_entrada || 0))
}

function financingTerms(item: any) {
  const financing = Array.isArray(item.financiamento_loja) ? item.financiamento_loja[0] : item.financiamento_loja
  return Number(financing?.quantidade_parcelas || 0)
}

function dueOnOrBefore(item: any, todayKey: string) {
  return String(item.data_vencimento).slice(0, 10) <= todayKey
}

function isCurrentlyDelinquent(item: any, todayKey: string) {
  return outstanding(item) > 0.01 && String(item.data_vencimento).slice(0, 10) < todayKey
}

function hasHistoricalLatePayment(item: any, todayKey: string) {
  return isCurrentlyDelinquent(item, todayKey)
    || Boolean(item.data_pagamento && String(item.data_pagamento).slice(0, 10) > String(item.data_vencimento).slice(0, 10))
}

function creditGroup(label: string, rows: any[], todayKey: string): CreditGroupInsight {
  const due = rows.filter((row) => dueOnOrBefore(row, todayKey))
  const late = due.filter((row) => hasHistoricalLatePayment(row, todayKey))
  return { label, rate: due.length >= 5 ? late.length / due.length : null, lateInstallments: late.length, dueInstallments: due.length }
}

function businessDateRangeFromStartOfMonth(key: string) {
  const start = rangeForBusinessDate(firstDayOfMonth(key)).start
  const end = rangeForBusinessDate(key).end
  return { start, end }
}

function currentDelinquencyGroup(label: string, rows: any[], todayKey: string): CreditGroupInsight {
  const due = rows.filter((row) => dueOnOrBefore(row, todayKey))
  const overdue = due.filter((row) => isCurrentlyDelinquent(row, todayKey))
  return { label, rate: due.length >= 5 ? overdue.length / due.length : null, lateInstallments: overdue.length, dueInstallments: due.length }
}

async function loadInstallments(admin: ReturnType<typeof createAdminClient>, storeId: number) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (admin.from('financiamento_parcelas') as any)
      .select('id,financiamento_id,customer_id,numero_parcela,data_vencimento,data_pagamento,valor_parcela,valor_pago,valor_transferido_entrada,valor_transferido_saida,status,financiamento_loja(quantidade_parcelas),customers(is_spc)')
      .eq('store_id', storeId)
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

function buildCreditAnalysis(installments: any[], todayKey: string): CreditAnalysis {
  const valid = installments.filter((item) => Number(item.valor_parcela || 0) > 0.01)
  const due = valid.filter((item) => dueOnOrBefore(item, todayKey))
  const historicalLate = due.filter((item) => hasHistoricalLatePayment(item, todayKey))
  const currentlyDelinquent = valid.filter((item) => isCurrentlyDelinquent(item, todayKey))
  const historicalLateRate = due.length >= 5 ? historicalLate.length / due.length : null
  const currentDelinquencyRate = due.length >= 5 ? currentlyDelinquent.length / due.length : null
  const currentDelinquencyValue = currentlyDelinquent.reduce((total, item) => total + outstanding(item), 0)
  const overdueSince = (item: any) => Math.max(0, Math.floor((new Date(`${todayKey}T12:00:00-03:00`).getTime() - new Date(item.data_vencimento).getTime()) / DAY_MS))
  const aging = (days: number) => currentlyDelinquent.filter((item) => overdueSince(item) >= days)
  const over30 = aging(30)
  const over60 = aging(60)
  const over90 = aging(90)
  const spcOutsideCustomers = new Set(over90.filter((item) => {
    const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers
    return item.customer_id && customer?.is_spc !== true
  }).map((item) => item.customer_id))
  const byMonth = new Map<string, any[]>()
  due.forEach((item) => { const month = String(item.data_vencimento).slice(0, 7); byMonth.set(month, [...(byMonth.get(month) || []), item]) })
  const monthly = [...byMonth.entries()].map(([month, rows]) => ({ month, ...creditGroup(month, rows, todayKey) })).filter((item) => item.rate !== null)
  const peak = monthly.sort((a, b) => (b.rate || 0) - (a.rate || 0))[0] || null
  const termGroups = [
    creditGroup('Até 3 parcelas', valid.filter((item) => financingTerms(item) > 0 && financingTerms(item) <= 3), todayKey),
    creditGroup('4 a 5 parcelas', valid.filter((item) => financingTerms(item) >= 4 && financingTerms(item) <= 5), todayKey),
    creditGroup('6 ou mais parcelas', valid.filter((item) => financingTerms(item) >= 6), todayKey),
  ]
  const activeFinancingsByCustomer = new Map<number, Set<number>>()
  valid.filter((item) => outstanding(item) > 0.01).forEach((item) => { if (item.customer_id) { const list = activeFinancingsByCustomer.get(item.customer_id) || new Set<number>(); list.add(item.financiamento_id); activeFinancingsByCustomer.set(item.customer_id, list) } })
  const simultaneousGroups = [
    creditGroup('Uma venda parcelada ativa', valid.filter((item) => (activeFinancingsByCustomer.get(item.customer_id)?.size || 0) === 1), todayKey),
    creditGroup('Duas ou mais vendas parceladas ativas', valid.filter((item) => (activeFinancingsByCustomer.get(item.customer_id)?.size || 0) >= 2), todayKey),
  ]
  const currentSimultaneousGroups = [
    currentDelinquencyGroup('Uma compra parcelada ativa', valid.filter((item) => (activeFinancingsByCustomer.get(item.customer_id)?.size || 0) === 1), todayKey),
    currentDelinquencyGroup('Duas ou mais compras parceladas ativas', valid.filter((item) => (activeFinancingsByCustomer.get(item.customer_id)?.size || 0) >= 2), todayKey),
  ]
  const singlePurchaseGroup = currentSimultaneousGroups[0]
  const multiplePurchaseGroup = currentSimultaneousGroups[1]
  const multiplePurchaseSignal = multiplePurchaseGroup?.rate !== null
    && singlePurchaseGroup?.rate !== null
    && multiplePurchaseGroup.dueInstallments >= 10
    && multiplePurchaseGroup.lateInstallments >= 5
    && multiplePurchaseGroup.rate >= 0.25
    && multiplePurchaseGroup.rate >= singlePurchaseGroup.rate + 0.12
    ? `Entre clientes com duas ou mais compras parceladas ativas, ${Math.round(multiplePurchaseGroup.rate * 100)}% das parcelas vencidas continuam em aberto, contra ${Math.round(singlePurchaseGroup.rate * 100)}% entre quem tem uma compra ativa.`
    : null
  const candidates = [...termGroups, ...simultaneousGroups].filter((item) => item.rate !== null && item.dueInstallments >= 5).sort((a, b) => (b.rate || 0) - (a.rate || 0))
  const strongest = candidates[0]
  const baseline = historicalLateRate || 0
  const strongestSignal = strongest && strongest.rate !== null && strongest.rate > baseline + 0.08 ? `${strongest.label}: ${Math.round(strongest.rate * 100)}% das parcelas apresentaram atraso no histórico ou permanecem vencidas.` : null
  let recommendation = 'Manter lembretes antes do vencimento e priorizar a cobrança pelo valor vencido e pelo tempo de atraso.'
  if (strongestSignal && strongest?.label === '6 ou mais parcelas') recommendation = 'Antes de ampliar prazo, revisar entrada e limite de parcelas nas vendas longas; priorizar lembrete antecipado para esse grupo.'
  else if (strongestSignal && strongest?.label.includes('Duas ou mais')) recommendation = 'Antes de liberar novo parcelamento, revisar compromissos ativos do cliente e priorizar uma régua de cobrança para quem acumula contratos.'
  else if (currentlyDelinquent.length > 0) recommendation = 'Priorizar hoje as parcelas vencidas ainda em aberto, começando pelas mais antigas e de maior valor; avaliar renegociação antes que o atraso avance para a próxima faixa.'
  const peakText = peak ? `O maior índice comparável foi ${Math.round((peak.rate || 0) * 100)}% em ${peak.month}.` : 'Ainda não há base histórica suficiente para comparar períodos.'
  const delinquencyText = currentlyDelinquent.length
    ? `Hoje, ${currentlyDelinquent.length} parcelas permanecem vencidas em aberto, somando ${money(currentDelinquencyValue)}.`
    : 'Hoje, não há parcelas vencidas em aberto.'
  const historicalText = historicalLateRate === null
    ? 'Ainda não há parcelas vencidas suficientes para calcular um histórico de atraso estável.'
    : `No histórico, ${historicalLate.length} de ${due.length} parcelas vencidas foram pagas após o vencimento ou continuam em aberto (${Math.round(historicalLateRate * 100)}%).`
  return {
    historicalLateRate,
    historicalLateInstallments: historicalLate.length,
    historicalDueInstallments: due.length,
    currentDelinquencyRate,
    currentDelinquencyInstallments: currentlyDelinquent.length,
    currentDelinquencyValue,
    historicalPeakLateRate: peak?.rate ?? null,
    historicalPeakLateMonth: peak?.month ?? null,
    delinquencyAging: {
      over30Installments: over30.length,
      over30Value: over30.reduce((total, item) => total + outstanding(item), 0),
      over60Installments: over60.length,
      over60Value: over60.reduce((total, item) => total + outstanding(item), 0),
      over90Installments: over90.length,
      over90Value: over90.reduce((total, item) => total + outstanding(item), 0),
      over90CustomersOutsideSpc: spcOutsideCustomers.size,
    },
    multiplePurchaseSignal,
    termGroups,
    simultaneousGroups,
    strongestSignal,
    recommendation,
    narrative: `${delinquencyText} ${historicalText} ${peakText} ${strongestSignal || 'Não há um grupo com desvio forte o bastante para associar o histórico de atraso ao prazo ou ao número de contratos.'}`,
  }
}

async function loadPostSaleInboundMessages(admin: ReturnType<typeof createAdminClient>, storeId: number, since: string) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (admin.from('whatsapp_inbound_messages') as any)
      .select('id,channel_id,remote_phone,created_at,provider_created_at')
      .eq('store_id', storeId)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

function buildPostSaleAnalysis(postSales: any[], followups: any[], interactions: any[], serviceOrders: any[], inboundMessages: any[], reportDate = dateKey()): PostSaleAnalysis {
  const orderById = new Map(serviceOrders.map((order) => [order.id, order]))
  const latestFollowupByPostSale = new Map<number, any>()
  for (const followup of followups) {
    if (followup.post_sales_id && !latestFollowupByPostSale.has(followup.post_sales_id)) {
      latestFollowupByPostSale.set(followup.post_sales_id, followup)
    }
  }

  const interactionByPostSale = new Map<number, any[]>()
  for (const interaction of interactions) {
    const list = interactionByPostSale.get(interaction.post_sales_id) || []
    list.push(interaction)
    interactionByPostSale.set(interaction.post_sales_id, list)
  }

  let noPhone = 0
  let messageSent = 0
  let messageScheduled = 0
  let messageNoResponse = 0
  let customerResponded = 0
  let ratingsReceived = 0
  let lowRatingCount = 0
  let lowRatingYesterdayCount = 0
  let lowRatingMonthCount = 0
  let respondedWithoutRating = 0
  let messageFailed = 0
  let messageCancelled = 0
  let noMessageAttempt = 0
  let complaintOrAdaptation = 0
  let complaintOrAdaptationYesterday = 0
  let complaintOrAdaptationMonth = 0
  let awaitingHumanReview = 0
  let awaitingRating = 0
  const deliveryIssueIds = new Set<number>()
  const humanReviewIds = new Set<number>()
  const satisfactionIds = new Set<number>()
  const lowRatingIds = new Set<number>()
  const yesterdaySatisfactionIds = new Set<number>()
  const monthSatisfactionIds = new Set<number>()

  for (const postSale of postSales) {
    const isCompleted = postSale.status === 'Concluido'
    const hasRating = Number(postSale.avaliacao_cliente) >= 1 && Number(postSale.avaliacao_cliente) <= 5
    if (hasRating) ratingsReceived += 1
    if (Number(postSale.avaliacao_cliente) >= 1 && Number(postSale.avaliacao_cliente) <= 2) {
      lowRatingCount += 1
      lowRatingIds.add(postSale.id)
      satisfactionIds.add(postSale.id)
      const ratingDate = postSale.updated_at ? dateKey(new Date(postSale.updated_at)) : null
      if (ratingDate?.slice(0, 7) === reportDate.slice(0, 7)) {
        lowRatingMonthCount += 1
        monthSatisfactionIds.add(postSale.id)
      }
      if (ratingDate === reportDate) {
        lowRatingYesterdayCount += 1
        yesterdaySatisfactionIds.add(postSale.id)
      }
    }

    if (!isCompleted) {
      const order = orderById.get(postSale.service_order_id)
      const customer = Array.isArray(order?.customers) ? order.customers[0] : order?.customers
      const phone = String(customer?.fone_movel || customer?.phone || '').replace(/\\D/g, '')
      if (!phone) {
        noPhone += 1
        deliveryIssueIds.add(postSale.id)
      }

      const followup = latestFollowupByPostSale.get(postSale.id)
      if (!followup) {
        noMessageAttempt += 1
        deliveryIssueIds.add(postSale.id)
      }
      else if (followup.status === 'sent') {
        messageSent += 1
        const sentAt = new Date(followup.sent_at || followup.created_at).getTime()
        const hasResponse = inboundMessages.some((inbound) =>
          Number(inbound.channel_id) === Number(followup.channel_id)
          && phonesMatch(inbound.remote_phone, followup.remote_phone)
          && new Date(inbound.provider_created_at || inbound.created_at).getTime() > sentAt
        )
        if (hasResponse) {
          customerResponded += 1
          if (!hasRating) respondedWithoutRating += 1
        } else messageNoResponse += 1
      }
      else if (followup.status === 'scheduled' || followup.status === 'sending') messageScheduled += 1
      else if (followup.status === 'failed') {
        messageFailed += 1
        deliveryIssueIds.add(postSale.id)
      }
      else if (followup.status === 'cancelled') messageCancelled += 1
    }

    const postSaleInteractions = interactionByPostSale.get(postSale.id) || []
    const satisfactionInteractions = postSaleInteractions.filter((interaction) => /reclam|adapt|insatisf|desconfort|nao gostei/i.test(String(interaction.resumo || '')))
    const summaries = postSaleInteractions.map((interaction) => String(interaction.resumo || ''))
    if (satisfactionInteractions.length > 0) {
      complaintOrAdaptation += 1
      satisfactionIds.add(postSale.id)
      const hasYesterdayInteraction = satisfactionInteractions.some((interaction) => interaction.created_at && dateKey(new Date(interaction.created_at)) === reportDate)
      const hasMonthInteraction = satisfactionInteractions.some((interaction) => interaction.created_at && dateKey(new Date(interaction.created_at)).slice(0, 7) === reportDate.slice(0, 7))
      if (hasYesterdayInteraction) {
        complaintOrAdaptationYesterday += 1
        yesterdaySatisfactionIds.add(postSale.id)
      }
      if (hasMonthInteraction) {
        complaintOrAdaptationMonth += 1
        monthSatisfactionIds.add(postSale.id)
      }
    }
    if (summaries.some((summary) => /handoff|atendimento humano/i.test(summary))) {
      awaitingHumanReview += 1
      humanReviewIds.add(postSale.id)
    }
    if (summaries.some((summary) => /pedido de nota|nota de pos-venda|esclarecimento da nota/i.test(summary))) awaitingRating += 1
  }

  return {
    total: postSales.length,
    noPhone,
    messageSent,
    messageScheduled,
    messageNoResponse,
    customerResponded,
    ratingsReceived,
    lowRatingCount,
    lowRatingYesterdayCount,
    lowRatingMonthCount,
    respondedWithoutRating,
    messageFailed,
    messageCancelled,
    noMessageAttempt,
    complaintOrAdaptation,
    complaintOrAdaptationYesterday,
    complaintOrAdaptationMonth,
    awaitingHumanReview,
    awaitingRating,
    deliveryIssueIds: [...deliveryIssueIds],
    humanReviewIds: [...humanReviewIds],
    satisfactionIds: [...satisfactionIds],
    lowRatingIds: [...lowRatingIds],
    yesterdaySatisfactionIds: [...yesterdaySatisfactionIds],
    monthSatisfactionIds: [...monthSatisfactionIds],
  }
}

async function loadAllRows(queryForRange: (from: number, to: number) => any) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await queryForRange(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

function buildOrderIntegrityAttention(orders: any[], ophthalmicSaleIds: Set<number>) {
  const hasLensLink = (order: any) => (Array.isArray(order.links) ? order.links : []).some((link: any) => link.uso_na_os === 'lente_od' || link.uso_na_os === 'lente_oe')
  const hasPrescription = (order: any) => [
    order.receita_longe_od_esferico, order.receita_longe_od_cilindrico,
    order.receita_longe_oe_esferico, order.receita_longe_oe_cilindrico,
    order.receita_perto_od_esferico, order.receita_perto_od_cilindrico,
    order.receita_perto_oe_esferico, order.receita_perto_oe_cilindrico,
  ].some((value) => value != null && String(value).trim() !== '' && String(value).trim() !== '-')
  const isOphthalmicOrder = (order: any) => ophthalmicSaleIds.has(Number(order.venda_id))
  return {
    ordersWithoutLensLink: orders.filter((order) => isOphthalmicOrder(order) && !hasLensLink(order)),
    ordersWithoutPrescription: orders.filter((order) => isOphthalmicOrder(order) && hasLensLink(order) && !hasPrescription(order)),
  }
}

function buildAccountsPayableAnalysis(rows: any[], todayKey: string): AccountsPayableAnalysis | undefined {
  const pending = rows.filter((row) => row.status === 'Pendente' && Math.max(0, Number(row.amount || 0) - Number(row.amount_paid || 0)) > 0.01)
  if (!pending.length) return undefined
  const next7Key = previousDateKey(todayKey, -7)
  const outstandingAmount = (row: any) => Math.max(0, Number(row.amount || 0) - Number(row.amount_paid || 0))
  const overdueRows = pending.filter((row) => String(row.due_date || '').slice(0, 10) < todayKey)
  const dueNext7Rows = pending.filter((row) => {
    const date = String(row.due_date || '').slice(0, 10)
    return date >= todayKey && date <= next7Key
  })
  const daysLate = (row: any) => Math.max(0, Math.floor((new Date(`${todayKey}T12:00:00-03:00`).getTime() - new Date(row.due_date).getTime()) / DAY_MS))
  return {
    pendingCount: pending.length,
    pendingValue: pending.reduce((total, row) => total + outstandingAmount(row), 0),
    overdueCount: overdueRows.length,
    overdueValue: overdueRows.reduce((total, row) => total + outstandingAmount(row), 0),
    oldestOverdueDays: overdueRows.length ? Math.max(...overdueRows.map(daysLate)) : 0,
    dueNext7Count: dueNext7Rows.length,
    dueNext7Value: dueNext7Rows.reduce((total, row) => total + outstandingAmount(row), 0),
    dueTodayCount: pending.filter((row) => String(row.due_date || '').slice(0, 10) === todayKey).length,
    overdueRecords: overdueRows.map((row) => Number(row.id)).filter(Number.isFinite),
    dueNext7Records: dueNext7Rows.map((row) => Number(row.id)).filter(Number.isFinite),
  }
}

function priorityWeight(priority: DailyHealthPriority) {
  return { informativo: 0, atencao: 1, critico: 2 }[priority]
}

function daysBetween(firstDate: string, lastDate: string) {
  return Math.max(1, Math.floor((new Date(`${lastDate}T12:00:00-03:00`).getTime() - new Date(`${firstDate}T12:00:00-03:00`).getTime()) / DAY_MS) + 1)
}

function alertImpact(alert: DailyHealthAlert) {
  return alert.impact ?? alert.records.ids.length
}

function shouldRepeatPersistentAlert(alert: DailyHealthAlert, daysOpen: number) {
  return [7, 15, 30].includes(daysOpen) || (daysOpen > 30 && (alert.priority === 'critico' ? daysOpen % 7 === 0 : daysOpen % 14 === 0))
}

const ALERT_SOURCE_DEPENDENCIES: Record<string, string[]> = {
  'overdue-installments': ['parcelas'],
  'payable-overdue': ['contas a pagar'],
  'payable-next-7-days': ['contas a pagar'],
  'cost-coverage': ['itens vendidos'],
  'orders-without-lab': ['ordens de servico'],
  'lenses-not-arrived': ['ordens de servico'],
  'lens-mounting-overdue': ['ordens de servico'],
  'lens-mounting-waiting-frame': ['ordens de servico'],
  'ready-pickup-stale': ['ordens de servico'],
  'ready-pickup-without-phone': ['ordens de servico'],
  'ready-pickup-without-notice': ['ordens de servico', 'avisos de retirada'],
  'orders-without-promise': ['ordens de servico'],
  'orders-without-lens-link': ['ordens de servico', 'lentes das OS'],
  'orders-without-prescription': ['ordens de servico', 'lentes das OS'],
  'invalid-order-timeline': ['ordens de servico'],
  'cancelled-sales-with-open-order': ['ordens de servico'],
  'lens-sales-without-order': ['ordens de servico', 'vendas de lentes'],
  'whatsapp-pending': ['WhatsApp'],
  'post-sales-delivery': ['pos-venda', 'envios de pos-venda', 'clientes de pos-venda', 'respostas de WhatsApp para pos-venda'],
  'post-sales-human-review': ['pos-venda', 'interacoes de pos-venda'],
  'post-sales-satisfaction': ['pos-venda', 'interacoes de pos-venda'],
  'duplicate-customers': ['clientes'],
  'duplicate-products': ['produtos'],
  'used-products-without-cost': ['produtos', 'itens de auditoria'],
  'stale-open-sales': ['vendas em aberto'],
}

const RETIRED_ALERT_IDS = new Set([
  'invalid-order-timeline',
  'duplicate-open-orders',
  'lab-orders-without-update',
])

const DATA_SOURCE_ALERTS: Array<{ id: string; area: DailyHealthArea; sources: string[]; title: string; detail: string }> = [
  {
    id: 'data-unavailable-financial',
    area: 'financeiro',
    sources: ['vendas', 'vendas acumuladas do mes', 'vendas no mesmo periodo do ano anterior', 'recebimentos', 'recebimentos acumulados do mes', 'recebimentos no mesmo periodo do ano anterior', 'parcelas', 'contas a pagar', 'itens vendidos'],
    title: 'Parte dos dados financeiros não pôde ser atualizada',
    detail: 'O relatório preservou as pendências anteriores e não tirou conclusões sobre essa fonte hoje.',
  },
  {
    id: 'data-unavailable-operation',
    area: 'operacao',
    sources: ['ordens de servico', 'vendas de lentes', 'lentes das OS', 'avisos de retirada'],
    title: 'Parte dos dados operacionais não pôde ser atualizada',
    detail: 'O relatório preservou as pendências anteriores e não tirou conclusões sobre essa fonte hoje.',
  },
  {
    id: 'data-unavailable-relationship',
    area: 'relacionamento',
    sources: ['pos-venda', 'envios de pos-venda', 'interacoes de pos-venda', 'clientes de pos-venda', 'respostas de WhatsApp para pos-venda', 'WhatsApp'],
    title: 'Parte dos dados de relacionamento não pôde ser atualizada',
    detail: 'O relatório preservou as pendências anteriores e não tirou conclusões sobre essa fonte hoje.',
  },
  {
    id: 'data-unavailable-data-quality',
    area: 'cadastros',
    sources: ['clientes', 'produtos', 'itens de auditoria', 'vendas em aberto'],
    title: 'Parte da faxina cadastral não pôde ser atualizada',
    detail: 'O relatório preservou as pendências anteriores e não concluiu que os cadastros foram corrigidos.',
  },
]

function shouldRepeatAfterMissedGeneration(alert: DailyHealthAlert, previousDaysOpen: number, daysOpen: number) {
  for (let day = previousDaysOpen + 1; day <= daysOpen; day += 1) {
    if (shouldRepeatPersistentAlert(alert, day)) return true
  }
  return false
}

function compareAlerts(currentAlerts: DailyHealthAlert[], previousAlerts: DailyHealthAlert[], previousDate: string | null, reportDate: string, unavailableSources = new Set<string>()) {
  const priorById = new Map(previousAlerts.map((alert) => [alert.id, alert]))
  const lifecycle: Record<DailyHealthArea, DailyHealthAreaLifecycle> = {
    financeiro: { newCount: 0, worsenedCount: 0, improvedCount: 0, persistentCount: 0, resolvedCount: 0 },
    operacao: { newCount: 0, worsenedCount: 0, improvedCount: 0, persistentCount: 0, resolvedCount: 0 },
    relacionamento: { newCount: 0, worsenedCount: 0, improvedCount: 0, persistentCount: 0, resolvedCount: 0 },
    cadastros: { newCount: 0, worsenedCount: 0, improvedCount: 0, persistentCount: 0, resolvedCount: 0 },
  }
  const currentIds = new Set(currentAlerts.map((alert) => alert.id))
  for (const previous of previousAlerts) {
    const sourceUnavailable = (ALERT_SOURCE_DEPENDENCIES[previous.id] || []).some((source) => unavailableSources.has(source))
    if (!currentIds.has(previous.id) && previous.lifecycle && lifecycle[previous.area] && !sourceUnavailable && !RETIRED_ALERT_IDS.has(previous.id)) lifecycle[previous.area].resolvedCount += 1
  }

  const alerts = currentAlerts.map((alert) => {
    const previous = priorById.get(alert.id)
    if (alert.id.startsWith('data-unavailable-')) {
      const state = previous?.lifecycle ? 'piorou' as const : 'novo' as const
      lifecycle[alert.area][state === 'novo' ? 'newCount' : 'worsenedCount'] += 1
      return { ...alert, lifecycle: { state, firstSeen: previous?.lifecycle?.firstSeen || reportDate, daysOpen: previous?.lifecycle ? daysBetween(previous.lifecycle.firstSeen, reportDate) : 1, previousImpact: previous ? alertImpact(previous) : null, impactChange: null, newRecords: 0, resolvedRecords: 0, show: true } }
    }
    if (!previous || !previousDate || !previous.lifecycle) {
      lifecycle[alert.area].newCount += 1
      return { ...alert, lifecycle: { state: 'novo' as const, firstSeen: reportDate, daysOpen: 1, previousImpact: null, impactChange: null, newRecords: alert.records.ids.length, resolvedRecords: 0, show: true } }
    }

    const currentImpact = alertImpact(alert)
    const previousImpact = alertImpact(previous)
    const difference = currentImpact - previousImpact
    const relativeChange = previousImpact > 0 ? Math.abs(difference) / previousImpact : 0
    const previousIds = new Set(previous.records?.ids || [])
    const currentIdsForAlert = new Set(alert.records.ids)
    const newRecords = [...currentIdsForAlert].filter((id) => !previousIds.has(id)).length
    const resolvedRecords = [...previousIds].filter((id) => !currentIdsForAlert.has(id)).length
    const firstSeen = previous.lifecycle?.firstSeen || previousDate
    const daysOpen = daysBetween(firstSeen, reportDate)
    const priorityChanged = priorityWeight(alert.priority) - priorityWeight(previous.priority)
    const materialIncrease = difference > 0 && (previousImpact < 10 ? difference >= 1 : relativeChange >= 0.1)
    const materialDecrease = difference < 0 && (previousImpact < 10 ? difference <= -1 : relativeChange >= 0.1)
    const state: DailyHealthAlertState = priorityChanged > 0 || materialIncrease ? 'piorou' : priorityChanged < 0 || materialDecrease ? 'melhorou' : 'persistente'
    lifecycle[alert.area][state === 'piorou' ? 'worsenedCount' : state === 'melhorou' ? 'improvedCount' : 'persistentCount'] += 1
    return {
      ...alert,
      detail: ['lens-mounting-overdue', 'lens-mounting-waiting-frame'].includes(alert.id) && state === 'persistente'
        ? `${alert.detail} O assunto ainda nao foi resolvido desde ontem.`
        : alert.detail,
      lifecycle: {
        state,
        firstSeen,
        daysOpen,
        previousImpact,
        impactChange: difference,
        newRecords,
        resolvedRecords,
        show: state !== 'persistente'
          || newRecords > 0
          || ['lens-mounting-overdue', 'lens-mounting-waiting-frame'].includes(alert.id)
          || shouldRepeatAfterMissedGeneration(alert, previous.lifecycle.daysOpen || 0, daysOpen),
      },
    }
  })
  return { alerts, lifecycle }
}

export const dailyHealthTestables = {
  buildAccountsPayableAnalysis,
  buildDataQualityAnalysis,
  buildOrderIntegrityAttention,
  buildPostSaleAnalysis,
  buildMountingAttention,
  buildReadyPickupAttention,
  compareAlerts,
  isGroundedAiText,
  isReadySnapshot,
}

function fallbackNarrative(metrics: DailyHealthMetrics, alerts: DailyHealthAlert[]) {
  const urgent = alerts.filter((alert) => alert.priority === 'critico' || alert.priority === 'atencao').slice(0, 2)
  const salesText = `As vendas foram ${money(metrics.sales)} e os recebimentos ${money(metrics.received)}.`
  const creditText = metrics.creditAnalysis.currentDelinquencyInstallments
    ? ` No crédito, ${metrics.creditAnalysis.currentDelinquencyInstallments} parcelas vencidas seguem em aberto.`
    : ''
  if (!urgent.length) return `${salesText}${creditText} Nenhum desvio relevante foi identificado nas fontes disponíveis.`
  return `${salesText}${creditText} Hoje merece atenção: ${urgent.map((alert) => alert.title.toLowerCase()).join(' e ')}.`
}

function fallbackFinancialNarrative(credit: CreditAnalysis) {
  const aging = credit.delinquencyAging
  const current = credit.currentDelinquencyInstallments
    ? `Hoje existem ${credit.currentDelinquencyInstallments} parcelas vencidas em aberto, somando ${money(credit.currentDelinquencyValue)}.`
    : 'Hoje nao ha parcelas vencidas em aberto.'
  const lossRisk = aging.over90Installments
    ? `Dessas, ${aging.over90Installments} ja ultrapassaram 90 dias de atraso, no valor de ${money(aging.over90Value)}; ${aging.over90CustomersOutsideSpc} cliente${aging.over90CustomersOutsideSpc === 1 ? '' : 's'} desse grupo ainda nao esta${aging.over90CustomersOutsideSpc === 1 ? '' : 'o'} no SPC.`
    : 'Nenhuma parcela aberta ultrapassou 90 dias de atraso.'
  return `${current} ${lossRisk} ${credit.multiplePurchaseSignal || 'A prioridade e agir primeiro sobre os valores mais antigos e de maior impacto.'}`
}

function fallbackAreaNarratives(metrics: DailyHealthMetrics, alerts: DailyHealthAlert[] = []): DailyHealthAreaNarratives {
  const postSale = metrics.postSaleAnalysis
  const hasUnavailableData = (area: DailyHealthArea) => alerts.some((alert) => alert.area === area && alert.id.startsWith('data-unavailable-'))
  const changed = (area: DailyHealthArea) => {
    const state = metrics.alertLifecycle?.[area]
    return Boolean(state && state.newCount + state.worsenedCount + state.improvedCount > 0)
  }
  const quiet = (area: DailyHealthArea) => {
    const resolved = metrics.alertLifecycle?.[area]?.resolvedCount || 0
    return resolved ? `${resolved} pendencia${resolved === 1 ? '' : 's'} foi${resolved === 1 ? '' : 'ram'} resolvida${resolved === 1 ? '' : 's'} desde ontem.` : 'Nao houve mudanca material desde ontem.'
  }
  const operationFacts = [
    metrics.overdueOrders > 0 ? `${metrics.overdueOrders} pedidos alem do prazo` : '',
    metrics.ordersWithoutLabRequest > 0 ? `${metrics.ordersWithoutLabRequest} pedidos sem envio ao laboratorio` : '',
    metrics.mountingOverdue > 0 ? `${metrics.mountingOverdue} montagens locais acima de 24 horas` : '',
    metrics.mountingWaitingForFrame > 0 ? `${metrics.mountingWaitingForFrame} montagens aguardam a armacao do cliente ha mais de 7 dias` : '',
    metrics.ordersWithoutPromise > 0 ? `${metrics.ordersWithoutPromise} OS sem data prometida` : '',
    metrics.ordersWithoutLensLink > 0 ? `${metrics.ordersWithoutLensLink} OS estao sem lente vinculada` : '',
    metrics.ordersWithoutPrescription > 0 ? `${metrics.ordersWithoutPrescription} OS com lente vinculada estao sem grau preenchido` : '',
    metrics.staleReadyForPickup > 0 ? `${metrics.staleReadyForPickup} oculos prontos estao na gaveta ha mais de 7 dias` : '',
  ].filter(Boolean)
  const relationshipFacts = [
    postSale.lowRatingYesterdayCount > 0 ? `Ontem, ${postSale.lowRatingYesterdayCount} nota${postSale.lowRatingYesterdayCount === 1 ? '' : 's'} baixa${postSale.lowRatingYesterdayCount === 1 ? '' : 's'} foi${postSale.lowRatingYesterdayCount === 1 ? '' : 'ram'} registrada${postSale.lowRatingYesterdayCount === 1 ? '' : 's'}.` : '',
    postSale.complaintOrAdaptationYesterday > 0 ? `Ontem, ${postSale.complaintOrAdaptationYesterday} relato${postSale.complaintOrAdaptationYesterday === 1 ? '' : 's'} indica${postSale.complaintOrAdaptationYesterday === 1 ? '' : 'm'} reclamação ou dificuldade de adaptação.` : '',
    postSale.lowRatingMonthCount + postSale.complaintOrAdaptationMonth >= MONTHLY_RELATIONSHIP_SIGNAL_THRESHOLD ? `Neste mês, ${postSale.lowRatingMonthCount + postSale.complaintOrAdaptationMonth} sinais de insatisfação já merecem uma observação mais cuidadosa.` : '',
    postSale.deliveryIssueIds.length > 0 ? `${postSale.deliveryIssueIds.length} pós-venda${postSale.deliveryIssueIds.length === 1 ? '' : 's'} ainda não teve${postSale.deliveryIssueIds.length === 1 ? '' : 'ram'} contato confiável.` : '',
    postSale.awaitingHumanReview > 0 ? `${postSale.awaitingHumanReview} resposta${postSale.awaitingHumanReview === 1 ? '' : 's'} aguarda${postSale.awaitingHumanReview === 1 ? '' : 'm'} revisão humana.` : '',
  ].filter(Boolean)
  const dataQuality = metrics.dataQualityAnalysis
  const cadastroFacts = [
    dataQuality.duplicateCustomerIds.length > 0 ? `${dataQuality.duplicateCustomerIds.length} clientes com possivel duplicidade` : '',
    dataQuality.duplicateProductIds.length > 0 ? `${dataQuality.duplicateProductIds.length} produtos com possivel duplicidade` : '',
    dataQuality.usedProductsWithoutCostIds.length > 0 ? `${dataQuality.usedProductsWithoutCostIds.length} produtos vendidos sem custo cadastrado` : '',
    dataQuality.staleOpenSaleIds.length > 0 ? `${dataQuality.staleOpenSaleIds.length} vendas em aberto ha mais de 7 dias` : '',
  ].filter(Boolean)
  return {
    financeiro: hasUnavailableData('financeiro') ? 'Nao foi possivel atualizar todos os dados financeiros. O relatorio nao concluiu que pendencias anteriores foram resolvidas.' : changed('financeiro') ? fallbackFinancialNarrative(metrics.creditAnalysis) : quiet('financeiro'),
    operacao: hasUnavailableData('operacao') ? 'Nao foi possivel atualizar todos os dados operacionais. O relatorio nao concluiu que pendencias anteriores foram resolvidas.' : changed('operacao') ? (operationFacts.length ? `A operacao pede atencao: ${operationFacts.join('; ')}.` : 'A operacao nao trouxe desvios relevantes nas fontes disponiveis.') : quiet('operacao'),
    relacionamento: hasUnavailableData('relacionamento') ? 'Nao foi possivel atualizar todos os dados de relacionamento. O relatorio nao concluiu que pendencias anteriores foram resolvidas.' : changed('relacionamento') && relationshipFacts.length ? relationshipFacts.join(' ') : quiet('relacionamento'),
    cadastros: hasUnavailableData('cadastros') ? 'Nao foi possivel atualizar todos os dados cadastrais. O relatorio preservou as pendencias anteriores.' : changed('cadastros') && cadastroFacts.length ? `A faxina encontrou: ${cadastroFacts.join('; ')}.` : quiet('cadastros'),
    relacionamentoConcern: !hasUnavailableData('relacionamento') && changed('relacionamento') && postSale.awaitingHumanReview > 0
      ? `Fiquei preocupado com ${postSale.awaitingHumanReview} caso${postSale.awaitingHumanReview === 1 ? '' : 's'} em revisao humana aberta. Confira esses retornos antes de seguirmos com novos contatos.`
      : null,
  }
}

type DailyHealthNarrativeResult = {
  narrative: string
  areas: DailyHealthAreaNarratives
  cards: Record<string, { title: string; detail: string }>
}

function aiText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 10 && value.trim().length <= 1200 ? value.trim() : null
}

function normalizeNarrativeHighlights(value: string) {
  return value.replace(/\[\[highlight:([a-z0-9-]+)\]\]([\s\S]*?)\[\[\/highlight\]\]/gi, '[[highlight:$1]]$2[[/highlight]]')
}

function isGroundedAiText(value: unknown, evidence: string[]) {
  const rawText = aiText(value)
  const text = rawText ? normalizeNarrativeHighlights(rawText) : null
  if (!text) return false
  if (/(?:porque|por isso|devido|caus(?:a|ou)|provoc|recomend|prioriz|\bdeve\b|\bprecisa\b|contat(?:e|ar)|\bfaca\b|\bfaça\b)/i.test(text)) return false
  const supportedNumbers = new Set(evidence.flatMap((item) => item.match(/\d+(?:[.,]\d+)?/g) || []))
  const usedNumbers = text.match(/\d+(?:[.,]\d+)?/g) || []
  return usedNumbers.every((number) => supportedNumbers.has(number))
}

function groundedAiText(value: unknown, fallbackValue: string, evidence: string[]) {
  return isGroundedAiText(value, evidence) ? normalizeNarrativeHighlights(String(value).trim()) : fallbackValue
}

async function createNarrative(metrics: DailyHealthMetrics, alerts: DailyHealthAlert[]): Promise<DailyHealthNarrativeResult> {
  const fallback: DailyHealthNarrativeResult = {
    narrative: fallbackNarrative(metrics, alerts),
    areas: fallbackAreaNarratives(metrics, alerts),
    cards: Object.fromEntries(alerts.map((alert) => [alert.id, { title: alert.title, detail: alert.detail }])),
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.info('[Daily health][IA] fallback deterministico; tokens=0')
    return fallback
  }
  try {
    const metricsForAi = Object.fromEntries(Object.entries(metrics).filter(([key]) => !new Set(['inconsistentOrderTimeline']).has(key)))
    const aiMetrics = {
      ...metricsForAi,
      creditAnalysis: {
        currentDelinquencyRate: metrics.creditAnalysis.currentDelinquencyRate,
        currentDelinquencyInstallments: metrics.creditAnalysis.currentDelinquencyInstallments,
        currentDelinquencyValue: metrics.creditAnalysis.currentDelinquencyValue,
        delinquencyAging: metrics.creditAnalysis.delinquencyAging,
        multiplePurchaseSignal: metrics.creditAnalysis.multiplePurchaseSignal,
      },
    }
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: `Voce escreve a leitura diaria de uma otica em portugues brasileiro. Retorne SOMENTE JSON valido, sem markdown, neste formato: {"geral":"...","financeiro":"...","operacao":"...","relacionamento":"...","cadastros":"...","relacionamentoConcern":"texto ou null","cards":{"id-do-alerta":{"title":"...","detail":"..."}}}. Use SOMENTE os fatos estruturados abaixo. Nao invente causas, valores, clientes ou acoes. Cada leitura deve ser humana, direta e curta. Quando quiser destacar uma parte do texto, use [[highlight:id-do-alerta]]trecho[[/highlight]]. Use apenas o id de um alerta fornecido abaixo e marque a frase ou ideia relevante, nunca um numero isolado. A prioridade e a cor sao definidas exclusivamente pelo sistema a partir do alerta; voce nao decide se algo e critico ou atencao. Os textos financeiro, operacao, relacionamento e cadastros sao leituras de modulo, nao listas de botoes. O relatorio e diario: use lifecycle.show para decidir o que merece ser mencionado. Se um modulo nao tiver alerta com show=true, diga apenas que nao houve mudanca material desde ontem, citando resolucoes quando houver; nao repita numeros persistentes. No financeiro, quando houver mudanca relevante, fale de inadimplencia atual: parcelas que continuam vencidas em aberto, valor, envelhecimento acima de 90 dias e quantos clientes desse grupo ainda nao estao no SPC. Se houver alerta de contas a pagar com lifecycle.show=true, mencione somente o vencimento em aberto ou a concentracao material nos proximos 7 dias. Nunca mencione parcelas que foram quitadas com atraso, historico de atraso ou comparacoes de pagamento passado. Mencione varias compras parceladas apenas se multiplePurchaseSignal existir e houver mudanca relevante no financeiro, como associacao atual observada e nao causa. Os cards sao excecoes com lifecycle.show=true: reescreva titulo e detalhe de forma variada e concreta. Quando houver lens-mounting-overdue persistente, deixe claro que a data da montagem local ainda nao foi preenchida desde ontem. Quando houver lens-mounting-waiting-frame persistente, deixe claro que a armação do cliente ainda nao foi recebida desde ontem. Para CADA card, use exclusivamente os fatos do alerta com o mesmo id; nao acrescente porcentagens, causas, comparacoes, estados de resposta ou conclusoes que nao estejam no titulo e detalhe daquele alerta. Nao crie uma acao nova nem repita literalmente o titulo original. Em relacionamento, explique os pos-vendas concluidos ontem e na semana somente quando relacionamento tiver mudanca relevante. Nunca escreva que uma resposta foi 'avaliada' quando o fato e apenas nao haver nota registrada. Preencha relacionamentoConcern somente quando houver revisao humana aberta e show=true, em tom de consultor preocupado. ${JSON.stringify({ metrics: aiMetrics, lifecycle: metrics.alertLifecycle, alerts: alerts.map(({ id, title, detail, priority, area, lifecycle }) => ({ id, title, detail, priority, area, lifecycle })) })}`,
      }),
      cache: 'no-store',
    })
    if (!response.ok) return fallback
    const data = await response.json() as any
    const outputText = Array.isArray(data.output)
      ? data.output.flatMap((item: any) => Array.isArray(item?.content) ? item.content : []).find((item: any) => item?.type === 'output_text')?.text
      : ''
    const text = typeof data.output_text === 'string'
      ? data.output_text.trim()
      : typeof outputText === 'string'
        ? outputText.trim()
        : ''
    const usage = data.usage || {}
    console.info(`[Daily health][IA] tokens entrada=${Number(usage.input_tokens || 0)} saida=${Number(usage.output_tokens || 0)} total=${Number(usage.total_tokens || 0)}`)
    const jsonStart = text.indexOf('{')
    const jsonEnd = text.lastIndexOf('}')
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      console.warn(`[Daily health][IA] JSON invalido: ${text.slice(0, 1000)}`)
      return fallback
    }
    let parsed: Partial<Record<'geral' | 'financeiro' | 'operacao' | 'relacionamento' | 'cadastros' | 'relacionamentoConcern', unknown>> & { cards?: unknown }
    try {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
    } catch {
      console.warn(`[Daily health][IA] JSON invalido: ${text.slice(0, 1000)}`)
      return fallback
    }
    const hasForbiddenCreditHistoryLanguage = (value: string) => /historico|quitad|paga[sd]? com atraso/i.test(value)
    const cards = Object.fromEntries(alerts.map((alert) => [alert.id, { title: alert.title, detail: alert.detail }]))
    const financialEvidence = [fallback.areas.financeiro, ...alerts.filter((alert) => alert.area === 'financeiro').flatMap((alert) => [alert.title, alert.detail])]
    const operationEvidence = [fallback.areas.operacao, ...alerts.filter((alert) => alert.area === 'operacao').flatMap((alert) => [alert.title, alert.detail])]
    const relationshipEvidence = [fallback.areas.relacionamento, ...alerts.filter((alert) => alert.area === 'relacionamento').flatMap((alert) => [alert.title, alert.detail])]
    const dataQualityEvidence = [fallback.areas.cadastros, ...alerts.filter((alert) => alert.area === 'cadastros').flatMap((alert) => [alert.title, alert.detail])]
    const hasNormalRelationshipLanguage = (value: string) => /conclu|mensagens? (enviadas|recebidas)|respostas? (recebidas|posteriores)|notas? registradas|aguardando nota|nao ha pos-vendas pendentes/i.test(value)
    const financeiroDaIa = groundedAiText(parsed.financeiro, fallback.areas.financeiro, financialEvidence)
    const financeiro = hasForbiddenCreditHistoryLanguage(financeiroDaIa)
      ? fallback.areas.financeiro
      : financeiroDaIa
    const financeiroTemMudanca = Boolean(metrics.alertLifecycle && (metrics.alertLifecycle.financeiro.newCount + metrics.alertLifecycle.financeiro.worsenedCount + metrics.alertLifecycle.financeiro.improvedCount > 0))
    const operacaoTemMudanca = Boolean(metrics.alertLifecycle && (metrics.alertLifecycle.operacao.newCount + metrics.alertLifecycle.operacao.worsenedCount + metrics.alertLifecycle.operacao.improvedCount > 0))
    const relacionamentoTemMudanca = Boolean(metrics.alertLifecycle && (metrics.alertLifecycle.relacionamento.newCount + metrics.alertLifecycle.relacionamento.worsenedCount + metrics.alertLifecycle.relacionamento.improvedCount > 0))
    const cadastrosTemMudanca = Boolean(metrics.alertLifecycle && (metrics.alertLifecycle.cadastros.newCount + metrics.alertLifecycle.cadastros.worsenedCount + metrics.alertLifecycle.cadastros.improvedCount > 0))
    const dadosIndisponiveis = (area: DailyHealthArea) => alerts.some((alert) => alert.area === area && alert.id.startsWith('data-unavailable-'))
    const financeiroComSinal = financeiroTemMudanca && metrics.creditAnalysis.multiplePurchaseSignal && !financeiro.includes('duas ou mais compras')
      ? `${financeiro} ${metrics.creditAnalysis.multiplePurchaseSignal}`
      : financeiro
    return {
      narrative: groundedAiText(parsed.geral, fallback.narrative, [fallback.narrative, ...alerts.flatMap((alert) => [alert.title, alert.detail])]),
      areas: {
        financeiro: !dadosIndisponiveis('financeiro') && financeiroTemMudanca ? financeiroComSinal : fallback.areas.financeiro,
        operacao: !dadosIndisponiveis('operacao') && operacaoTemMudanca ? groundedAiText(parsed.operacao, fallback.areas.operacao, operationEvidence) : fallback.areas.operacao,
        relacionamento: !dadosIndisponiveis('relacionamento') && relacionamentoTemMudanca && !hasNormalRelationshipLanguage(String(parsed.relacionamento || '')) ? groundedAiText(parsed.relacionamento, fallback.areas.relacionamento, relationshipEvidence) : fallback.areas.relacionamento,
        cadastros: !dadosIndisponiveis('cadastros') && cadastrosTemMudanca ? groundedAiText(parsed.cadastros, fallback.areas.cadastros, dataQualityEvidence) : fallback.areas.cadastros,
        relacionamentoConcern: !dadosIndisponiveis('relacionamento') && relacionamentoTemMudanca && isGroundedAiText(parsed.relacionamentoConcern, [fallback.areas.relacionamentoConcern || '', ...relationshipEvidence]) && /revis/i.test(String(parsed.relacionamentoConcern)) && !/reclama/i.test(String(parsed.relacionamentoConcern))
          ? String(parsed.relacionamentoConcern).trim()
          : fallback.areas.relacionamentoConcern,
      },
      cards,
    }
  } catch {
    console.info('[Daily health][IA] fallback apos falha ou formato invalido')
    return fallback
  }
}

export async function generateDailyStoreHealthReport(storeId = 1, reportDate = previousDateKey(dateKey(), 1), options: { force?: boolean } = {}): Promise<DailyHealthReport> {
  const admin = createAdminClient({ noStore: true })
  const force = options.force === true
  const { data: existingReport, error: existingReportError } = await (admin.from('daily_store_health_reports') as any)
    .select('*')
    .eq('store_id', storeId)
    .eq('cadence', 'daily')
    .eq('report_date', reportDate)
    .maybeSingle()
  if (existingReportError) throw existingReportError
  if (!force && isReadySnapshot(existingReport)) return reportFromStoredRow(existingReport)
  const failures: string[] = []
  const target = rangeForDate(reportDate)
  const monthTarget = rangeFromStartOfMonth(reportDate)
  const lastYearReportDate = sameDatePreviousYear(reportDate)
  const lastYearTarget = rangeFromStartOfMonth(lastYearReportDate)
  const paymentTarget = rangeForBusinessDate(reportDate)
  const paymentMonthTarget = businessDateRangeFromStartOfMonth(reportDate)
  const lastYearPaymentTarget = businessDateRangeFromStartOfMonth(lastYearReportDate)
  // A snapshot must be judged at the end of its reference day, not when it is regenerated.
  const asOfDateKey = reportDate
  const dueSoonKey = previousDateKey(asOfDateKey, -7)

  const [storeResult, settingsResult, salesResult, monthSalesResult, lastYearSalesResult, paymentsResult, monthPaymentsResult, lastYearPaymentsResult, financingsResult, monthFinancingsResult, lastYearFinancingsResult, installmentsResult, accountsPayableResult, ordersResult, lensSalesResult, postSalesResult, postSalesCompletedYesterdayResult, postSalesCompletedWeekResult, postSaleFollowupsResult, postSaleInteractionsResult, postSaleOrdersResult, itemsResult, whatsAppResult] = await Promise.allSettled([
    (admin.from('stores') as any).select('tenant_id,created_at').eq('id', storeId).single(),
    (admin.from('daily_store_health_settings') as any).select('settings').eq('store_id', storeId).maybeSingle(),
    loadAllRows((from, to) => (admin.from('vendas') as any).select('id,valor_final,valor_restante,data_fechamento,financiamento_loja!financiamento_loja_venda_id_fkey(valor_total_financiado)').eq('store_id', storeId).eq('status', 'Fechada').gte('data_fechamento', target.start).lte('data_fechamento', target.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('vendas') as any).select('id,valor_final,valor_restante,data_fechamento,financiamento_loja!financiamento_loja_venda_id_fkey(valor_total_financiado)').eq('store_id', storeId).eq('status', 'Fechada').gte('data_fechamento', monthTarget.start).lte('data_fechamento', monthTarget.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('vendas') as any).select('id,valor_final,valor_restante,data_fechamento,financiamento_loja!financiamento_loja_venda_id_fkey(valor_total_financiado)').eq('store_id', storeId).eq('status', 'Fechada').gte('data_fechamento', lastYearTarget.start).lte('data_fechamento', lastYearTarget.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('pagamentos') as any).select('valor_pago,parcela_id').eq('store_id', storeId).gte('data_pagamento', paymentTarget.start).lt('data_pagamento', paymentTarget.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('pagamentos') as any).select('valor_pago,parcela_id').eq('store_id', storeId).gte('data_pagamento', paymentMonthTarget.start).lt('data_pagamento', paymentMonthTarget.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('pagamentos') as any).select('valor_pago,parcela_id').eq('store_id', storeId).gte('data_pagamento', lastYearPaymentTarget.start).lt('data_pagamento', lastYearPaymentTarget.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('financiamento_loja') as any).select('id,customer_id,valor_total_financiado,quantidade_parcelas,created_at').eq('store_id', storeId).gte('created_at', target.start).lte('created_at', target.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('financiamento_loja') as any).select('valor_total_financiado').eq('store_id', storeId).gte('created_at', monthTarget.start).lte('created_at', monthTarget.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('financiamento_loja') as any).select('valor_total_financiado').eq('store_id', storeId).gte('created_at', lastYearTarget.start).lte('created_at', lastYearTarget.end).range(from, to)),
    loadInstallments(admin, storeId),
    loadAllRows((from, to) => (admin.from('accounts_payable') as any).select('id,amount,amount_paid,due_date,status').eq('store_id', storeId).range(from, to)),
    loadAllRows((from, to) => (admin.from('service_orders') as any).select('id,venda_id,created_at,dt_prometido_para,dt_pedido_em,dt_lente_chegou,dt_montado_em,dt_montado_no_lab,dt_recebido_na_loja,dt_entregue_em,lab_encerrada_em,os_enviada_ao_lab,armacao_com_cliente,receita_longe_od_esferico,receita_longe_od_cilindrico,receita_longe_oe_esferico,receita_longe_oe_cilindrico,receita_perto_od_esferico,receita_perto_od_cilindrico,receita_perto_oe_esferico,receita_perto_oe_cilindrico,customers(fone_movel,phone),links:venda_itens_os_links(venda_item_id,uso_na_os),vendas(status)').eq('store_id', storeId).range(from, to)),
    loadAllRows((from, to) => (admin.from('venda_itens') as any).select('venda_id,products!inner(tipo_produto),vendas!inner(status,data_fechamento)').eq('store_id', storeId).eq('products.tipo_produto', 'Lente').eq('vendas.status', 'Fechada').gte('vendas.data_fechamento', rangeForDate(previousDateKey(reportDate, 30)).start).lte('vendas.data_fechamento', target.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('post_sales') as any).select('id,status,service_order_id,avaliacao_cliente,created_at,updated_at').eq('store_id', storeId).range(from, to)),
    loadAllRows((from, to) => (admin.from('post_sales') as any).select('id').eq('store_id', storeId).eq('status', 'Concluido').gte('updated_at', target.start).lte('updated_at', target.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('post_sales') as any).select('id').eq('store_id', storeId).eq('status', 'Concluido').gte('updated_at', rangeForDate(previousDateKey(reportDate, 6)).start).lte('updated_at', target.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('whatsapp_post_sale_followups') as any).select('post_sales_id,channel_id,remote_phone,status,sent_at,created_at').eq('store_id', storeId).not('post_sales_id', 'is', null).order('created_at', { ascending: false }).range(from, to)),
    loadAllRows((from, to) => (admin.from('post_sales_interactions') as any).select('post_sales_id,tipo_contato,resumo,created_at').eq('store_id', storeId).order('created_at', { ascending: false }).range(from, to)),
    loadAllRows((from, to) => (admin.from('service_orders') as any).select('id,customers(phone,fone_movel)').eq('store_id', storeId).range(from, to)),
    loadAllRows((from, to) => (admin.from('venda_itens') as any).select('id,product_id,valor_total_item,products(preco_custo),vendas!inner(data_fechamento,status)').eq('store_id', storeId).eq('vendas.status', 'Fechada').gte('vendas.data_fechamento', target.start).lte('vendas.data_fechamento', target.end).range(from, to)),
    getWhatsAppPendencias(storeId),
  ])

  const read = <T>(result: PromiseSettledResult<any>, source: string, fallback: T): T => {
    if (result.status === 'rejected') { failures.push(source); return fallback }
    if (result.value?.error) { failures.push(source); return fallback }
    return (result.value?.data ?? result.value) as T
  }

  const [customersResult, productsResult, auditItemsResult, openSalesResult, pickupNoticesResult, dataQualityReviewsResult] = await Promise.allSettled([
    loadAllRows((from, to) => (admin.from('customers') as any).select('id,full_name,cpf,fone_movel,phone').eq('store_id', storeId).range(from, to)),
    loadAllRows((from, to) => (admin.from('products') as any).select('id,nome,marca,referencia,preco_custo,tipo_produto').eq('store_id', storeId).range(from, to)),
    loadAllRows((from, to) => (admin.from('venda_itens') as any).select('product_id,vendas!inner(status,data_fechamento)').eq('store_id', storeId).eq('vendas.status', 'Fechada').gte('vendas.data_fechamento', rangeForDate(previousDateKey(reportDate, 90)).start).lte('vendas.data_fechamento', target.end).range(from, to)),
    loadAllRows((from, to) => (admin.from('vendas') as any).select('id,created_at').eq('store_id', storeId).eq('status', 'Em Aberto').range(from, to)),
    loadAllRows((from, to) => (admin.from('whatsapp_outbound_messages') as any).select('status,payload').eq('store_id', storeId).eq('message_type', 'service_order').contains('payload', { source: 'gaveta.ready_pickup_button' }).range(from, to)),
    loadAllRows((from, to) => (admin.from('daily_health_data_quality_reviews') as any).select('fingerprint').eq('store_id', storeId).eq('decision', 'keep_separate').range(from, to)),
  ])

  const store = read<any>(storeResult, 'loja', null)
  if (!store?.tenant_id) throw new Error('Loja nao encontrada para o relatorio diario.')
  const settings = normalizeSettings(read<any>(settingsResult, 'parametros', null)?.settings)
  const sales = read<any[]>(salesResult, 'vendas', [])
  const monthSales = read<any[]>(monthSalesResult, 'vendas acumuladas do mes', [])
  const lastYearSales = read<any[]>(lastYearSalesResult, 'vendas no mesmo periodo do ano anterior', [])
  const payments = read<any[]>(paymentsResult, 'recebimentos', [])
  const monthPayments = read<any[]>(monthPaymentsResult, 'recebimentos acumulados do mes', [])
  const lastYearPayments = read<any[]>(lastYearPaymentsResult, 'recebimentos no mesmo periodo do ano anterior', [])
  const newFinancings = read<any[]>(financingsResult, 'novos parcelamentos', [])
  const monthFinancings = read<any[]>(monthFinancingsResult, 'parcelamentos acumulados do mes', [])
  const lastYearFinancings = read<any[]>(lastYearFinancingsResult, 'parcelamentos no mesmo periodo do ano anterior', [])
  const installments = read<any[]>(installmentsResult, 'parcelas', [])
  const accountsPayable = read<any[]>(accountsPayableResult, 'contas a pagar', [])
  const orders = read<any[]>(ordersResult, 'ordens de servico', [])
  const lensSales = read<any[]>(lensSalesResult, 'vendas de lentes', [])
  const postSales = read<any[]>(postSalesResult, 'pos-venda', [])
  const postSalesCompletedYesterday = read<any[]>(postSalesCompletedYesterdayResult, 'pos-vendas concluidos ontem', [])
  const postSalesCompletedWeek = read<any[]>(postSalesCompletedWeekResult, 'pos-vendas concluidos na semana', [])
  const postSaleFollowups = read<any[]>(postSaleFollowupsResult, 'envios de pos-venda', [])
  const postSaleInteractions = read<any[]>(postSaleInteractionsResult, 'interacoes de pos-venda', [])
  const postSaleOrders = read<any[]>(postSaleOrdersResult, 'clientes de pos-venda', [])
  const soldItems = read<any[]>(itemsResult, 'itens vendidos', [])
  const customers = read<any[]>(customersResult, 'clientes', [])
  const products = read<any[]>(productsResult, 'produtos', [])
  const auditItems = read<any[]>(auditItemsResult, 'itens de auditoria', [])
  const openSales = read<any[]>(openSalesResult, 'vendas em aberto', [])
  const pickupNotices = read<any[]>(pickupNoticesResult, 'avisos de retirada', [])
  const dataQualityReviews = read<any[]>(dataQualityReviewsResult, 'revisoes cadastrais', [])
  const whatsApp = whatsAppResult.status === 'fulfilled' ? whatsAppResult.value : (failures.push('WhatsApp'), [])
  const earliestPostSaleMessage = postSaleFollowups
    .filter((followup) => followup.status === 'sent' && followup.sent_at)
    .map((followup) => String(followup.sent_at))
    .sort()[0]
  let postSaleInboundMessages: any[] = []
  if (earliestPostSaleMessage) {
    try {
      postSaleInboundMessages = await loadPostSaleInboundMessages(admin, storeId, earliestPostSaleMessage)
    } catch {
      failures.push('respostas de WhatsApp para pos-venda')
    }
  }

  const unpaid = installments.filter((item) => outstanding(item) > 0.01)
  const creditAnalysis = buildCreditAnalysis(installments, asOfDateKey)
  const accountsPayableAnalysis = buildAccountsPayableAnalysis(accountsPayable, asOfDateKey)
  const overdue = unpaid.filter((item) => String(item.data_vencimento).slice(0, 10) < asOfDateKey)
  const dueSoon = unpaid.filter((item) => String(item.data_vencimento).slice(0, 10) >= asOfDateKey && String(item.data_vencimento).slice(0, 10) <= dueSoonKey)
  const activeByCustomer = new Map<number, number>()
  unpaid.forEach((item) => item.customer_id && activeByCustomer.set(item.customer_id, (activeByCustomer.get(item.customer_id) || 0) + 1))
  const orderDate = (value: string | null) => value ? String(value).slice(0, 10) : null
  const saleStatus = (order: any) => {
    const sale = Array.isArray(order.vendas) ? order.vendas[0] : order.vendas
    return String(sale?.status || '')
  }
  const activeOrders = orders.filter((order) => !order.lab_encerrada_em && !order.dt_entregue_em && !['Cancelada', 'Devolvida'].includes(saleStatus(order)))
  const reportEnd = new Date(target.end).getTime()
  const pickupOrders = orders.filter((order) => !order.dt_entregue_em && !['Cancelada', 'Devolvida'].includes(saleStatus(order)))
  const pickupAttention = buildReadyPickupAttention(pickupOrders, pickupNotices, reportEnd)
  const oldWithoutLab = activeOrders.filter((order) => !order.dt_pedido_em && new Date(order.created_at).getTime() < reportEnd - settings.labRequestHours * 60 * 60 * 1000)
  const lensNotArrivedByPromise = activeOrders.filter((order) => Boolean(order.dt_pedido_em) && !order.dt_lente_chegou && orderDate(order.dt_prometido_para) !== null && orderDate(order.dt_prometido_para)! <= asOfDateKey)
  const { mountingOverdue, mountingWaitingForFrame } = buildMountingAttention(activeOrders, reportEnd)
  const activeOrderSaleIds = [...new Set(activeOrders.map((order) => Number(order.venda_id)).filter(Number.isFinite))]
  const ophthalmicSaleIds = new Set<number>()
  if (activeOrderSaleIds.length) {
    try {
      const rows = await loadAllRows((from, to) => (admin.from('venda_itens') as any).select('venda_id,products!inner(tipo_produto)').eq('store_id', storeId).eq('products.tipo_produto', 'Lente').in('venda_id', activeOrderSaleIds).range(from, to))
      rows.forEach((row) => ophthalmicSaleIds.add(Number(row.venda_id)))
    } catch {
      failures.push('lentes das OS')
    }
  }
  const { ordersWithoutLensLink, ordersWithoutPrescription } = buildOrderIntegrityAttention(activeOrders, ophthalmicSaleIds)
  const ordersWithoutPromise = activeOrders.filter((order) => !order.dt_prometido_para)
  const operationAuditStart = rangeForDate(previousDateKey(reportDate, 30)).start
  const inconsistentOrderTimeline = orders.filter((order) => {
    if (new Date(order.created_at).getTime() < new Date(operationAuditStart).getTime()) return false
    const arrivedBeforeRequested = isMeaningfullyBefore(order.dt_lente_chegou, order.dt_pedido_em)
    const assembledBeforeArrival = isMeaningfullyBefore(order.dt_montado_em, order.dt_lente_chegou)
    const deliveredBeforeAssembly = isMeaningfullyBefore(order.dt_entregue_em, order.dt_montado_em)
    return arrivedBeforeRequested || assembledBeforeArrival || deliveredBeforeAssembly
  })
  const cancelledSalesWithOpenOrder = orders.filter((order) => !order.dt_entregue_em && !order.lab_encerrada_em && ['Cancelada', 'Devolvida'].includes(saleStatus(order)))
  const lensSaleIds = new Set(lensSales.map((item) => Number(item.venda_id)).filter(Number.isFinite))
  const ordersBySale = new Set(orders.map((order) => Number(order.venda_id)).filter(Number.isFinite))
  const lensSalesWithoutOrder = [...lensSaleIds].filter((saleId) => !ordersBySale.has(saleId))
  const resolvedDataQualityFingerprints = new Set(dataQualityReviews.map((review) => String(review.fingerprint)))
  const dataQualityAnalysis = buildDataQualityAnalysis(customers, products, auditItems, openSales, reportEnd, resolvedDataQualityFingerprints)
  const soldValue = sum(soldItems, 'valor_total_item')
  const coveredValue = soldItems.filter((item) => Number(item.products?.preco_custo || 0) > 0).reduce((total, item) => total + Number(item.valor_total_item || 0), 0)
  const postSaleAnalysis = buildPostSaleAnalysis(postSales, postSaleFollowups, postSaleInteractions, postSaleOrders, postSaleInboundMessages, reportDate)
  const hasAnnualHistory = !store.created_at || new Date(store.created_at).getTime() <= new Date(lastYearTarget.end).getTime()
  const salesSummary = buildSalesSummary(
    sales, monthSales, hasAnnualHistory ? lastYearSales : null,
    payments, monthPayments, hasAnnualHistory ? lastYearPayments : null,
  )
  const metrics: DailyHealthMetrics = {
    salesSummary,
    sales: sum(sales, 'valor_final'), salesComparison: hasAnnualHistory ? sum(lastYearSales, 'valor_final') : null,
    received: sum(payments, 'valor_pago'), newFinanced: sum(newFinancings, 'valor_total_financiado'),
    receivable: unpaid.reduce((total, item) => total + outstanding(item), 0), overdue: overdue.reduce((total, item) => total + outstanding(item), 0),
    overdueInstallments: overdue.length, dueSoon: dueSoon.reduce((total, item) => total + outstanding(item), 0),
    activeFinancing: new Set(unpaid.map((item) => item.financiamento_id)).size,
    multiFinancingCustomers: [...activeByCustomer.values()].filter((count) => count > 1).length,
    readyForPickup: pickupAttention.readyForPickup.length,
    staleReadyForPickup: pickupAttention.staleReadyForPickup.length,
    readyForPickupLongStay: pickupAttention.longStay.length,
    readyForPickupWithoutPhone: pickupAttention.withoutPhone.length,
    readyForPickupWithoutNotice: pickupAttention.withoutNotice.length,
    overdueOrders: lensNotArrivedByPromise.length,
    ordersWithoutLabRequest: oldWithoutLab.length,
    labArrivalOverdue: lensNotArrivedByPromise.length,
    mountingOverdue: mountingOverdue.length,
    mountingWaitingForFrame: mountingWaitingForFrame.length,
    ordersWithoutLensLink: ordersWithoutLensLink.length,
    ordersWithoutPrescription: ordersWithoutPrescription.length,
    ordersWithoutPromise: ordersWithoutPromise.length,
    inconsistentOrderTimeline: inconsistentOrderTimeline.length,
    lensSalesWithoutOrder: lensSalesWithoutOrder.length,
    cancelledSalesWithOpenOrder: cancelledSalesWithOpenOrder.length,
    pendingPostSales: postSales.filter((postSale) => postSale.status !== 'Concluido').length,
    postSalesCompletedYesterday: postSalesCompletedYesterday.length,
    postSalesCompletedWeek: postSalesCompletedWeek.length,
    postSaleAnalysis,
    pendingWhatsApp: whatsApp.length,
    costCoverage: soldValue > 0 ? coveredValue / soldValue : null,
    creditAnalysis,
    accountsPayableAnalysis,
    dataQualityAnalysis,
  }

  const unavailableSources = new Set(failures)
  const sourceAvailable = (...sources: string[]) => sources.every((source) => !unavailableSources.has(source))
  const alerts: DailyHealthAlert[] = []
  if (sourceAvailable('parcelas') && metrics.overdue > 0) alerts.push({ id: 'overdue-installments', area: 'financeiro', priority: metrics.overdue > settings.overdueCriticalValue ? 'critico' : 'atencao', title: `${metrics.overdueInstallments} parcelas vencidas`, detail: `${money(metrics.overdue)} permanecem em aberto.`, impact: metrics.overdue, confidence: 'alta', href: `/dashboard/loja/${storeId}/financeiro/parcelas`, records: { type: 'parcela', ids: overdue.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.ordersWithoutLabRequest > 0) alerts.push({ id: 'orders-without-lab', area: 'operacao', priority: 'critico', title: `${metrics.ordersWithoutLabRequest} lentes ainda nao foram pedidas ao laboratorio`, detail: `Essas OS estao abertas ha mais de ${settings.labRequestHours} horas sem pedido registrado.`, impact: metrics.ordersWithoutLabRequest, confidence: 'alta', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: oldWithoutLab.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.labArrivalOverdue > 0) alerts.push({ id: 'lenses-not-arrived', area: 'operacao', priority: 'critico', title: `${metrics.labArrivalOverdue} lentes nao chegaram ate a data prometida`, detail: 'O pedido foi registrado no laboratorio, mas a lente ainda nao chegou para a montagem.', impact: metrics.labArrivalOverdue, confidence: 'alta', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: lensNotArrivedByPromise.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.mountingOverdue > 0) alerts.push({ id: 'lens-mounting-overdue', area: 'operacao', priority: 'critico', title: `${metrics.mountingOverdue} oculos aguardam montagem ha mais de 24 horas`, detail: 'A lente ja chegou na loja, mas a data da montagem local ainda nao foi preenchida.', impact: metrics.mountingOverdue, confidence: 'alta', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: mountingOverdue.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.mountingWaitingForFrame > 0) alerts.push({ id: 'lens-mounting-waiting-frame', area: 'operacao', priority: 'atencao', title: `${metrics.mountingWaitingForFrame} oculos aguardam a armação do cliente ha mais de 7 dias`, detail: 'A lente chegou na loja, mas a montagem depende da armação que ainda esta com o cliente.', impact: metrics.mountingWaitingForFrame, confidence: 'alta', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: mountingWaitingForFrame.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.staleReadyForPickup > 0) alerts.push({ id: 'ready-pickup-stale', area: 'operacao', priority: metrics.readyForPickupLongStay > 0 ? 'critico' : 'atencao', title: `${metrics.staleReadyForPickup} oculos prontos estao na gaveta ha mais de 7 dias`, detail: metrics.readyForPickupLongStay > 0 ? `${metrics.readyForPickupLongStay} ja ultrapassaram 30 dias. Confira se houve abandono do cliente ou se a entrega ficou sem baixa.` : 'Confira se o cliente foi avisado e se a entrega foi registrada corretamente.', impact: metrics.staleReadyForPickup, confidence: 'alta', href: `/dashboard/loja/${storeId}/gaveta`, records: { type: 'os', ids: pickupAttention.staleReadyForPickup.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.readyForPickupWithoutPhone > 0) alerts.push({ id: 'ready-pickup-without-phone', area: 'operacao', priority: 'atencao', title: `${metrics.readyForPickupWithoutPhone} oculos na gaveta estao sem telefone valido`, detail: 'Esses clientes esperam ha mais de 7 dias e a loja nao tem telefone valido registrado para confirmar a retirada.', impact: metrics.readyForPickupWithoutPhone, confidence: 'alta', href: `/dashboard/loja/${storeId}/gaveta`, records: { type: 'os', ids: pickupAttention.withoutPhone.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico', 'avisos de retirada') && metrics.readyForPickupWithoutNotice > 0) alerts.push({ id: 'ready-pickup-without-notice', area: 'operacao', priority: 'atencao', title: `${metrics.readyForPickupWithoutNotice} oculos na gaveta nao possuem aviso de retirada registrado`, detail: 'Existe telefone valido, mas nao ha envio registrado pelo botao da Gaveta. Confira antes de concluir que o cliente foi avisado.', impact: metrics.readyForPickupWithoutNotice, confidence: 'alta', href: `/dashboard/loja/${storeId}/gaveta`, records: { type: 'os', ids: pickupAttention.withoutNotice.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.ordersWithoutPromise > 0) alerts.push({ id: 'orders-without-promise', area: 'operacao', priority: 'atencao', title: `${metrics.ordersWithoutPromise} OS estao sem data prometida`, detail: 'Sem uma data combinada, a loja nao consegue acompanhar corretamente o prazo da lente e da entrega.', impact: metrics.ordersWithoutPromise, confidence: 'alta', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: ordersWithoutPromise.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico', 'lentes das OS') && metrics.ordersWithoutLensLink > 0) alerts.push({ id: 'orders-without-lens-link', area: 'operacao', priority: 'atencao', title: `${metrics.ordersWithoutLensLink} OS abertas sem lente vinculada`, detail: 'A OS nao possui item de lente OD ou OE relacionado a venda. Confira se a lente ainda sera escolhida ou se houve falha no cadastro.', impact: metrics.ordersWithoutLensLink, confidence: 'media', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: ordersWithoutLensLink.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico', 'lentes das OS') && metrics.ordersWithoutPrescription > 0) alerts.push({ id: 'orders-without-prescription', area: 'operacao', priority: 'atencao', title: `${metrics.ordersWithoutPrescription} OS com lente vinculada estao sem grau`, detail: 'A OS possui lente relacionada, mas nenhum campo de receita foi preenchido. Confira antes de enviar ou montar.', impact: metrics.ordersWithoutPrescription, confidence: 'media', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: ordersWithoutPrescription.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico') && metrics.cancelledSalesWithOpenOrder > 0) alerts.push({ id: 'cancelled-sales-with-open-order', area: 'operacao', priority: 'atencao', title: `${metrics.cancelledSalesWithOpenOrder} vendas canceladas ou devolvidas ainda possuem OS aberta`, detail: 'Essas OS precisam ser encerradas para nao continuarem na fila operacional.', impact: metrics.cancelledSalesWithOpenOrder, confidence: 'alta', href: `/dashboard/loja/${storeId}/laboratorio`, records: { type: 'os', ids: cancelledSalesWithOpenOrder.map((item) => item.id) } })
  if (sourceAvailable('ordens de servico', 'vendas de lentes') && metrics.lensSalesWithoutOrder > 0) alerts.push({ id: 'lens-sales-without-order', area: 'operacao', priority: 'atencao', title: `${metrics.lensSalesWithoutOrder} vendas de lentes oftalmicas nao possuem OS`, detail: 'Essas vendas recentes de lentes oftalmicas precisam ser conferidas para garantir que o processo de laboratorio foi aberto. Lentes de contato nao entram nesta verificacao.', impact: metrics.lensSalesWithoutOrder, confidence: 'media', href: `/dashboard/loja/${storeId}/vendas`, records: { type: 'venda', ids: lensSalesWithoutOrder } })
  if (sourceAvailable('clientes') && dataQualityAnalysis.duplicateCustomerIds.length > 0) {
    const groups = [
      dataQualityAnalysis.duplicateCustomerCpfGroups > 0 ? `${dataQualityAnalysis.duplicateCustomerCpfGroups} por CPF` : '',
      dataQualityAnalysis.duplicateCustomerPhoneGroups > 0 ? `${dataQualityAnalysis.duplicateCustomerPhoneGroups} por telefone` : '',
      dataQualityAnalysis.duplicateCustomerNameGroups > 0 ? `${dataQualityAnalysis.duplicateCustomerNameGroups} por nome igual` : '',
    ].filter(Boolean).join(', ')
    alerts.push({ id: 'duplicate-customers', area: 'cadastros', priority: dataQualityAnalysis.duplicateCustomerCpfGroups > 0 || dataQualityAnalysis.duplicateCustomerPhoneGroups > 0 ? 'critico' : 'atencao', title: `${dataQualityAnalysis.duplicateCustomerIds.length} clientes parecem estar duplicados`, detail: `Foram encontrados ${groups}. Revise antes de qualquer mesclagem.`, impact: dataQualityAnalysis.duplicateCustomerIds.length, confidence: dataQualityAnalysis.duplicateCustomerNameGroups > 0 ? 'media' : 'alta', href: `/dashboard/loja/${storeId}/clientes`, records: { type: 'cliente', ids: dataQualityAnalysis.duplicateCustomerIds } })
  }
  if (sourceAvailable('produtos') && dataQualityAnalysis.duplicateProductIds.length > 0) {
    const groups = dataQualityAnalysis.duplicateProductCompositeGroups
    alerts.push({ id: 'duplicate-products', area: 'cadastros', priority: 'atencao', title: `${dataQualityAnalysis.duplicateProductIds.length} produtos parecem estar duplicados`, detail: `Foram encontrados ${groups} grupos com nome, marca e referencia compativeis. Confira os registros antes de alterar estoque ou preco.`, impact: dataQualityAnalysis.duplicateProductIds.length, confidence: 'alta', href: `/dashboard/loja/${storeId}/cadastros`, records: { type: 'produto', ids: dataQualityAnalysis.duplicateProductIds } })
  }
  if (sourceAvailable('produtos', 'itens de auditoria') && dataQualityAnalysis.usedProductsWithoutCostIds.length > 0) alerts.push({ id: 'used-products-without-cost', area: 'cadastros', priority: 'atencao', title: `${dataQualityAnalysis.usedProductsWithoutCostIds.length} produtos vendidos estao sem custo`, detail: 'Esses produtos tiveram venda nos ultimos 90 dias, mas ainda nao possuem custo positivo cadastrado.', impact: dataQualityAnalysis.usedProductsWithoutCostIds.length, confidence: 'alta', href: `/dashboard/loja/${storeId}/cadastros`, records: { type: 'produto', ids: dataQualityAnalysis.usedProductsWithoutCostIds } })
  if (sourceAvailable('vendas em aberto') && dataQualityAnalysis.staleOpenSaleIds.length > 0) alerts.push({ id: 'stale-open-sales', area: 'cadastros', priority: 'atencao', title: `${dataQualityAnalysis.staleOpenSaleIds.length} vendas continuam abertas ha mais de 7 dias`, detail: 'Revise se a venda deve ser concluida, cancelada ou tratada pelo protocolo de abandono.', impact: dataQualityAnalysis.staleOpenSaleIds.length, confidence: 'alta', href: `/dashboard/loja/${storeId}/vendas?mode=pendencias`, records: { type: 'venda', ids: dataQualityAnalysis.staleOpenSaleIds } })
  if (sourceAvailable('WhatsApp') && metrics.pendingWhatsApp > 0) alerts.push({ id: 'whatsapp-pending', area: 'relacionamento', priority: 'atencao', title: `${metrics.pendingWhatsApp} conversas de WhatsApp aguardando humano`, detail: 'Ha atendimentos transferidos que ainda precisam de continuidade.', impact: metrics.pendingWhatsApp, confidence: 'alta', href: `/dashboard/loja/${storeId}/atendimento`, records: { type: 'conversa', ids: whatsApp.map((item) => item.id) } })
  const postSalesWithDeliveryIssue = postSaleAnalysis.deliveryIssueIds.length
  if (sourceAvailable('pos-venda', 'envios de pos-venda', 'clientes de pos-venda') && postSalesWithDeliveryIssue > 0) alerts.push({ id: 'post-sales-delivery', area: 'relacionamento', priority: 'atencao', title: `${postSalesWithDeliveryIssue} pos-vendas sem contato confiavel`, detail: `${postSaleAnalysis.messageFailed} falharam no envio, ${postSaleAnalysis.noMessageAttempt} nao possuem tentativa registrada e ${postSaleAnalysis.noPhone} nao possuem telefone valido.`, impact: postSalesWithDeliveryIssue, confidence: 'alta', href: `/dashboard/loja/${storeId}/pos-venda`, records: { type: 'pos-venda', ids: postSaleAnalysis.deliveryIssueIds } })
  if (sourceAvailable('pos-venda', 'interacoes de pos-venda') && postSaleAnalysis.awaitingHumanReview > 0) alerts.push({ id: 'post-sales-human-review', area: 'relacionamento', priority: 'atencao', title: `${postSaleAnalysis.awaitingHumanReview} respostas de pos-venda aguardam revisao`, detail: 'Esses clientes responderam e ainda precisam de continuidade humana registrada.', impact: postSaleAnalysis.awaitingHumanReview, confidence: 'alta', href: `/dashboard/loja/${storeId}/pos-venda`, records: { type: 'pos-venda', ids: postSaleAnalysis.humanReviewIds } })
  const yesterdaySatisfactionCount = postSaleAnalysis.lowRatingYesterdayCount + postSaleAnalysis.complaintOrAdaptationYesterday
  const monthlySatisfactionCount = postSaleAnalysis.lowRatingMonthCount + postSaleAnalysis.complaintOrAdaptationMonth
  const hasMonthlySatisfactionSignal = monthlySatisfactionCount >= MONTHLY_RELATIONSHIP_SIGNAL_THRESHOLD
  if (sourceAvailable('pos-venda', 'interacoes de pos-venda') && (yesterdaySatisfactionCount > 0 || hasMonthlySatisfactionSignal)) {
    const satisfactionSignals = [
      postSaleAnalysis.lowRatingYesterdayCount > 0 ? `Ontem, ${postSaleAnalysis.lowRatingYesterdayCount} nota${postSaleAnalysis.lowRatingYesterdayCount === 1 ? '' : 's'} baixa${postSaleAnalysis.lowRatingYesterdayCount === 1 ? '' : 's'}` : '',
      postSaleAnalysis.complaintOrAdaptationYesterday > 0 ? `Ontem, ${postSaleAnalysis.complaintOrAdaptationYesterday} relato${postSaleAnalysis.complaintOrAdaptationYesterday === 1 ? '' : 's'} de reclamação ou adaptação` : '',
      hasMonthlySatisfactionSignal ? `Neste mês, ${monthlySatisfactionCount} sinais de insatisfação` : '',
    ].filter(Boolean).join('; ')
    const satisfactionIds = [...new Set([
      ...(yesterdaySatisfactionCount > 0 ? postSaleAnalysis.yesterdaySatisfactionIds : []),
      ...(hasMonthlySatisfactionSignal ? postSaleAnalysis.monthSatisfactionIds : []),
    ])]
    alerts.push({ id: 'post-sales-satisfaction', area: 'relacionamento', priority: 'critico', title: `${satisfactionSignals} pedem acompanhamento`, detail: 'O pós-venda registrou uma avaliação baixa ou um relato de insatisfação. Confira os casos novos e observe se existe um padrão no mês.', impact: yesterdaySatisfactionCount > 0 ? yesterdaySatisfactionCount : monthlySatisfactionCount, confidence: 'alta', href: `/dashboard/loja/${storeId}/pos-venda`, records: { type: 'pos-venda', ids: satisfactionIds } })
  }
  if (sourceAvailable('contas a pagar') && accountsPayableAnalysis?.overdueCount) alerts.push({ id: 'payable-overdue', area: 'financeiro', priority: accountsPayableAnalysis.overdueValue > settings.overdueCriticalValue ? 'critico' : 'atencao', title: `${accountsPayableAnalysis.overdueCount} contas a pagar vencidas`, detail: `${money(accountsPayableAnalysis.overdueValue)} continuam em aberto; a mais antiga está vencida há ${accountsPayableAnalysis.oldestOverdueDays} dias.`, impact: accountsPayableAnalysis.overdueValue, confidence: 'alta', href: `/dashboard/loja/${storeId}/financeiro/contas`, records: { type: 'conta a pagar', ids: accountsPayableAnalysis.overdueRecords } })
  if (sourceAvailable('contas a pagar') && accountsPayableAnalysis && accountsPayableAnalysis.dueNext7Count >= 5 && accountsPayableAnalysis.dueNext7Value > settings.overdueCriticalValue) alerts.push({ id: 'payable-next-7-days', area: 'financeiro', priority: 'atencao', title: `${accountsPayableAnalysis.dueNext7Count} contas a pagar concentram vencimento nos próximos 7 dias`, detail: `${money(accountsPayableAnalysis.dueNext7Value)} precisam ser acompanhados até ${previousDateKey(asOfDateKey, -7).split('-').reverse().join('/')}.`, impact: accountsPayableAnalysis.dueNext7Value, confidence: 'alta', href: `/dashboard/loja/${storeId}/financeiro/contas`, records: { type: 'conta a pagar', ids: accountsPayableAnalysis.dueNext7Records } })
  if (sourceAvailable('itens vendidos') && metrics.costCoverage !== null && metrics.costCoverage < settings.minimumCostCoverage) alerts.push({ id: 'cost-coverage', area: 'financeiro', priority: 'atencao', title: 'Margem indisponivel por custo incompleto', detail: `Somente ${(metrics.costCoverage * 100).toFixed(0)}% do valor vendido possui custo positivo cadastrado; lucro e margem foram ocultados.`, impact: null, confidence: 'alta', href: `/dashboard/loja/${storeId}/reports/financeiro`, records: { type: 'produto', ids: [] } })
  for (const sourceAlert of DATA_SOURCE_ALERTS) {
    if (sourceAlert.sources.some((source) => unavailableSources.has(source))) {
      alerts.push({ id: sourceAlert.id, area: sourceAlert.area, priority: 'atencao', title: sourceAlert.title, detail: sourceAlert.detail, impact: null, confidence: 'alta', href: '', records: { type: 'fonte', ids: [] } })
    }
  }

  const { data: previousReport } = await (admin.from('daily_store_health_reports') as any)
    .select('report_date,alerts')
    .eq('store_id', storeId)
    .eq('cadence', 'daily')
    .eq('status', 'ready')
    .lt('report_date', reportDate)
    .order('report_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const compared = compareAlerts(alerts, Array.isArray(previousReport?.alerts) ? previousReport.alerts : [], previousReport?.report_date || null, reportDate, unavailableSources)
  metrics.alertLifecycle = compared.lifecycle
  const narratives = await createNarrative(metrics, compared.alerts)
  metrics.areaNarratives = narratives.areas
  const presentedAlerts = compared.alerts.map((alert) => ({ ...alert, presentation: narratives.cards[alert.id] || { title: alert.title, detail: alert.detail } }))
  const report: DailyHealthReport = { reportDate, status: 'ready', metrics, alerts: presentedAlerts.sort((a, b) => ({ critico: 0, atencao: 1, informativo: 2 }[a.priority] - { critico: 0, atencao: 1, informativo: 2 }[b.priority])), narrative: narratives.narrative, sourceFailures: failures, generatedAt: new Date().toISOString() }
  const snapshotPayload = { tenant_id: store.tenant_id, store_id: storeId, report_date: reportDate, cadence: 'daily', period_start: reportDate, period_end: reportDate, status: 'ready', metrics: report.metrics, alerts: report.alerts, narrative: report.narrative, source_failures: report.sourceFailures, generated_at: report.generatedAt, generation_started_at: report.generatedAt, updated_at: report.generatedAt }
  const { data: saved, error } = force && existingReport
    ? await (admin.from('daily_store_health_reports') as any).update(snapshotPayload).eq('store_id', storeId).eq('cadence', 'daily').eq('report_date', reportDate).select('id').single()
    : await (admin.from('daily_store_health_reports') as any).insert(snapshotPayload).select('id').single()
  if (error) {
    if (error.code === '23505') {
      const { data: concurrentReport, error: concurrentReportError } = await (admin.from('daily_store_health_reports') as any).select('*').eq('store_id', storeId).eq('cadence', 'daily').eq('report_date', reportDate).maybeSingle()
      if (!concurrentReportError && isReadySnapshot(concurrentReport)) return reportFromStoredRow(concurrentReport)
    }
    throw error
  }
  return { ...report, id: saved?.id }
}

export async function getLatestDailyStoreHealthReport(storeId: number): Promise<DailyHealthReport | null> {
  const admin = createAdminClient({ noStore: true })
  const { data, error } = await (admin.from('daily_store_health_reports') as any).select('*').eq('store_id', storeId).eq('cadence', 'daily').eq('status', 'ready').order('report_date', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  return reportFromStoredRow(data)
}

export type PeriodicSnapshotGenerationOptions = {
  allowOpenMonthly?: boolean
  persist?: boolean
}

export async function generatePeriodicStoreHealthSnapshot(storeId: number, cadence: HealthSnapshotCadence, reportDate = previousDateKey(dateKey(), 1), options: PeriodicSnapshotGenerationOptions = {}): Promise<PeriodicHealthSnapshot | null> {
  const allowOpenMonthly = cadence === 'monthly' && options.allowOpenMonthly === true
  const persist = options.persist !== false
  const period = periodicPeriodForReportDate(reportDate, cadence, allowOpenMonthly)
  if (!period) return null

  const admin = createAdminClient({ noStore: true })
  if (persist) {
    const { data: existing, error: existingError } = await (admin.from('daily_store_health_reports') as any)
      .select('*')
      .eq('store_id', storeId)
      .eq('cadence', cadence)
      .eq('period_start', period.start)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing && isReadySnapshot(existing)) return periodicSnapshotFromStoredRow(existing)
  }

  const { data: dailyRows, error: dailyError } = await (admin.from('daily_store_health_reports') as any)
    .select('report_date,metrics,alerts,source_failures')
    .eq('store_id', storeId)
    .eq('cadence', 'daily')
    .eq('status', 'ready')
    .gte('report_date', period.start)
    .lte('report_date', period.end)
    .order('report_date', { ascending: true })
  if (dailyError) throw dailyError
  if (!dailyRows?.length) return null

  const latestByAlertId = new Map<string, any>()
  const occurrenceCount = new Map<string, number>()
  for (const row of dailyRows) {
    for (const alert of Array.isArray(row.alerts) ? row.alerts : []) {
      if (!alert?.id) continue
      latestByAlertId.set(alert.id, alert)
      occurrenceCount.set(alert.id, (occurrenceCount.get(alert.id) || 0) + 1)
    }
  }
  const alerts = [...latestByAlertId.values()].map((alert) => {
    const occurrences = occurrenceCount.get(alert.id) || 1
    return occurrences > 1
      ? { ...alert, detail: `${alert.detail} Foi identificado em ${occurrences} dias do periodo.` }
      : alert
  })
  const label = cadence === 'weekly' ? 'semanal' : 'mensal'
  const narrative = alerts.length
    ? `A varredura ${label} de ${period.start.split('-').reverse().join('/')} a ${period.end.split('-').reverse().join('/')} reuniu ${alerts.length} ponto${alerts.length === 1 ? '' : 's'} de atenção identificados nos relatórios diários.`
    : `A varredura ${label} de ${period.start.split('-').reverse().join('/')} a ${period.end.split('-').reverse().join('/')} não encontrou pontos de atenção nos relatórios diários disponíveis.`
  const generatedAt = new Date().toISOString()
  const programUsage = cadence === 'monthly'
    ? await generateMonthlyProgramUsageSnapshot(storeId, period.start, period.end)
    : null
  const { data: store, error: storeError } = await (admin.from('stores') as any).select('tenant_id').eq('id', storeId).single()
  if (storeError) throw storeError
  const payload = {
    tenant_id: store.tenant_id,
    store_id: storeId,
    report_date: period.end,
    cadence,
    period_start: period.start,
    period_end: period.end,
    status: 'ready',
    metrics: {
      ...(dailyRows[dailyRows.length - 1].metrics || {}),
      ...(programUsage ? { programUsage } : {}),
    },
    alerts,
    narrative,
    source_failures: [...new Set(dailyRows.flatMap((row: any) => Array.isArray(row.source_failures) ? row.source_failures : []))],
    generated_at: generatedAt,
    generation_started_at: generatedAt,
    updated_at: generatedAt,
  }
  if (!persist) return { ...periodicSnapshotFromStoredRow(payload), isPreview: true }
  const { data: saved, error: saveError } = await (admin.from('daily_store_health_reports') as any).insert(payload).select('*').single()
  if (saveError) {
    if (saveError.code === '23505') {
      const { data: concurrent } = await (admin.from('daily_store_health_reports') as any).select('*').eq('store_id', storeId).eq('cadence', cadence).eq('period_start', period.start).maybeSingle()
      if (concurrent && isReadySnapshot(concurrent)) return periodicSnapshotFromStoredRow(concurrent)
    }
    throw saveError
  }
  return periodicSnapshotFromStoredRow(saved)
}

export async function getLatestPeriodicStoreHealthSnapshot(storeId: number, cadence: HealthSnapshotCadence): Promise<PeriodicHealthSnapshot | null> {
  const admin = createAdminClient({ noStore: true })
  const { data, error } = await (admin.from('daily_store_health_reports') as any)
    .select('*')
    .eq('store_id', storeId)
    .eq('cadence', cadence)
    .eq('status', 'ready')
    .order('period_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  return periodicSnapshotFromStoredRow(data)
}
