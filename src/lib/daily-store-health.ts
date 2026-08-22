import { createAdminClient } from '@/lib/supabase/admin'
import { getWhatsAppPendencias } from '@/lib/actions/consultas.actions'
import { phonesMatch } from '@/lib/whatsapp/phone'

export type DailyHealthArea = 'financeiro' | 'operacao' | 'relacionamento'
export type DailyHealthPriority = 'critico' | 'atencao' | 'informativo'

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
}

export type DailyHealthMetrics = {
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
  overdueOrders: number
  ordersWithoutLabRequest: number
  pendingPostSales: number
  postSalesCompletedYesterday: number
  postSalesCompletedWeek: number
  postSaleAnalysis: PostSaleAnalysis
  pendingWhatsApp: number
  costCoverage: number | null
  creditAnalysis: CreditAnalysis
  areaNarratives?: DailyHealthAreaNarratives
}

export type CreditGroupInsight = {
  label: string
  rate: number | null
  lateInstallments: number
  dueInstallments: number
}

export type CreditAnalysis = {
  currentRate: number | null
  dueValue: number
  historicalPeakRate: number | null
  historicalPeakMonth: string | null
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
  respondedWithoutRating: number
  messageFailed: number
  messageCancelled: number
  noMessageAttempt: number
  complaintOrAdaptation: number
  awaitingHumanReview: number
  awaitingRating: number
}

export type DailyHealthAreaNarratives = {
  financeiro: string
  operacao: string
  relacionamento: string
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

export type DailyHealthSettings = {
  overdueCriticalValue: number
  minimumCostCoverage: number
  labRequestHours: number
}

export const DEFAULT_DAILY_HEALTH_SETTINGS: DailyHealthSettings = {
  overdueCriticalValue: 5000,
  minimumCostCoverage: 0.9,
  labRequestHours: 24,
}

function normalizeSettings(input: unknown): DailyHealthSettings {
  const value = input && typeof input === 'object' ? input as Partial<DailyHealthSettings> : {}
  return {
    overdueCriticalValue: Number.isFinite(Number(value.overdueCriticalValue)) ? Math.max(0, Number(value.overdueCriticalValue)) : DEFAULT_DAILY_HEALTH_SETTINGS.overdueCriticalValue,
    minimumCostCoverage: Number.isFinite(Number(value.minimumCostCoverage)) ? Math.min(1, Math.max(0, Number(value.minimumCostCoverage))) : DEFAULT_DAILY_HEALTH_SETTINGS.minimumCostCoverage,
    labRequestHours: Number.isFinite(Number(value.labRequestHours)) ? Math.max(1, Number(value.labRequestHours)) : DEFAULT_DAILY_HEALTH_SETTINGS.labRequestHours,
  }
}

export async function getDailyHealthSettings(storeId: number) {
  const admin = createAdminClient({ noStore: true })
  const { data } = await (admin.from('daily_store_health_settings') as any).select('settings').eq('store_id', storeId).maybeSingle()
  return normalizeSettings(data?.settings)
}

const SAO_PAULO = 'America/Sao_Paulo'
const DAY_MS = 24 * 60 * 60 * 1000

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

function previousDateKey(key: string, days: number) {
  return dateKey(new Date(new Date(`${key}T12:00:00-03:00`).getTime() - days * DAY_MS))
}

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function sum(rows: any[], field: string) {
  return rows.reduce((total, row) => total + Number(row?.[field] || 0), 0)
}

function outstanding(item: any) {
  return Math.max(0, Number(item.valor_parcela || 0) - Number(item.valor_pago || 0) - Number(item.valor_transferido_saida || 0) + Number(item.valor_transferido_entrada || 0))
}

function financingTerms(item: any) {
  const financing = Array.isArray(item.financiamento_loja) ? item.financiamento_loja[0] : item.financiamento_loja
  return Number(financing?.quantidade_parcelas || 0)
}

function creditGroup(label: string, rows: any[], todayKey: string): CreditGroupInsight {
  const due = rows.filter((row) => String(row.data_vencimento).slice(0, 10) <= todayKey)
  const late = due.filter((row) => outstanding(row) > 0.01 && String(row.data_vencimento).slice(0, 10) < todayKey || (row.data_pagamento && String(row.data_pagamento).slice(0, 10) > String(row.data_vencimento).slice(0, 10)))
  return { label, rate: due.length >= 5 ? late.length / due.length : null, lateInstallments: late.length, dueInstallments: due.length }
}

async function loadInstallments(admin: ReturnType<typeof createAdminClient>, storeId: number) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await (admin.from('financiamento_parcelas') as any)
      .select('id,financiamento_id,customer_id,numero_parcela,data_vencimento,data_pagamento,valor_parcela,valor_pago,valor_transferido_entrada,valor_transferido_saida,status,financiamento_loja(quantidade_parcelas)')
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
  const due = valid.filter((item) => String(item.data_vencimento).slice(0, 10) <= todayKey)
  const late = due.filter((item) => (outstanding(item) > 0.01 && String(item.data_vencimento).slice(0, 10) < todayKey) || Boolean(item.data_pagamento && String(item.data_pagamento).slice(0, 10) > String(item.data_vencimento).slice(0, 10)))
  const currentRate = due.length >= 5 ? late.length / due.length : null
  const dueValue = due.reduce((total, item) => total + Number(item.valor_parcela || 0), 0)
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
  const candidates = [...termGroups, ...simultaneousGroups].filter((item) => item.rate !== null && item.dueInstallments >= 5).sort((a, b) => (b.rate || 0) - (a.rate || 0))
  const strongest = candidates[0]
  const baseline = currentRate || 0
  const strongestSignal = strongest && strongest.rate !== null && strongest.rate > baseline + 0.08 ? `${strongest.label}: ${Math.round(strongest.rate * 100)}% das parcelas com vencimento já atrasaram ou permanecem vencidas.` : null
  let recommendation = 'Manter lembretes antes do vencimento e priorizar a cobrança pelo valor vencido e pelo tempo de atraso.'
  if (strongestSignal && strongest?.label === '6 ou mais parcelas') recommendation = 'Antes de ampliar prazo, revisar entrada e limite de parcelas nas vendas longas; priorizar lembrete antecipado para esse grupo.'
  else if (strongestSignal && strongest?.label.includes('Duas ou mais')) recommendation = 'Antes de liberar novo parcelamento, revisar compromissos ativos do cliente e priorizar uma régua de cobrança para quem acumula contratos.'
  else if (currentRate !== null && currentRate > 0.1) recommendation = 'Priorizar hoje as parcelas mais antigas e de maior valor; avaliar renegociação antes que o atraso avance para a próxima faixa.'
  const peakText = peak ? `O maior índice comparável foi ${Math.round((peak.rate || 0) * 100)}% em ${peak.month}.` : 'Ainda não há base histórica suficiente para comparar períodos.'
  const rateText = currentRate === null ? 'Ainda não há parcelas vencidas suficientes para calcular uma taxa estável.' : `Das ${due.length} parcelas que já venceram, ${late.length} atrasaram ou continuam em aberto (${Math.round(currentRate * 100)}%).`
  return { currentRate, dueValue, historicalPeakRate: peak?.rate ?? null, historicalPeakMonth: peak?.month ?? null, termGroups, simultaneousGroups, strongestSignal, recommendation, narrative: `${rateText} ${peakText} ${strongestSignal || 'Não há um grupo com desvio forte o bastante para atribuir o risco ao prazo ou ao número de contratos.'}` }
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

function buildPostSaleAnalysis(postSales: any[], followups: any[], interactions: any[], serviceOrders: any[], inboundMessages: any[]): PostSaleAnalysis {
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
  let respondedWithoutRating = 0
  let messageFailed = 0
  let messageCancelled = 0
  let noMessageAttempt = 0
  let complaintOrAdaptation = 0
  let awaitingHumanReview = 0
  let awaitingRating = 0

  for (const postSale of postSales) {
    const order = orderById.get(postSale.service_order_id)
    const customer = Array.isArray(order?.customers) ? order.customers[0] : order?.customers
    const phone = String(customer?.fone_movel || customer?.phone || '').replace(/\\D/g, '')
    if (!phone) noPhone += 1

    const followup = latestFollowupByPostSale.get(postSale.id)
    if (!followup) noMessageAttempt += 1
    else if (followup.status === 'sent') {
      messageSent += 1
      const sentAt = new Date(followup.sent_at || followup.created_at).getTime()
      const hasResponse = inboundMessages.some((inbound) =>
        Number(inbound.channel_id) === Number(followup.channel_id)
        && phonesMatch(inbound.remote_phone, followup.remote_phone)
        && new Date(inbound.provider_created_at || inbound.created_at).getTime() > sentAt
      )
      const hasRating = Number(postSale.avaliacao_cliente) >= 1 && Number(postSale.avaliacao_cliente) <= 5
      if (hasRating) ratingsReceived += 1
      if (hasResponse) {
        customerResponded += 1
        if (!hasRating) respondedWithoutRating += 1
      } else messageNoResponse += 1
    }
    else if (followup.status === 'scheduled' || followup.status === 'sending') messageScheduled += 1
    else if (followup.status === 'failed') messageFailed += 1
    else if (followup.status === 'cancelled') messageCancelled += 1

    const summaries = (interactionByPostSale.get(postSale.id) || []).map((interaction) => String(interaction.resumo || ''))
    if (summaries.some((summary) => /reclam|adaptaÃ§Ã£o|adaptacao/i.test(summary))) complaintOrAdaptation += 1
    if (summaries.some((summary) => /handoff|atendimento humano/i.test(summary))) awaitingHumanReview += 1
    if (summaries.some((summary) => /pedido de nota|nota de pos-venda|esclarecimento da nota/i.test(summary))) awaitingRating += 1
  }

  return { total: postSales.length, noPhone, messageSent, messageScheduled, messageNoResponse, customerResponded, ratingsReceived, respondedWithoutRating, messageFailed, messageCancelled, noMessageAttempt, complaintOrAdaptation, awaitingHumanReview, awaitingRating }
}

function fallbackNarrative(metrics: DailyHealthMetrics, alerts: DailyHealthAlert[]) {
  const urgent = alerts.filter((alert) => alert.priority === 'critico' || alert.priority === 'atencao').slice(0, 2)
  const salesText = `As vendas foram ${money(metrics.sales)} e os recebimentos ${money(metrics.received)}.`
  const creditText = metrics.creditAnalysis.currentRate === null ? '' : ` No crédito, ${Math.round(metrics.creditAnalysis.currentRate * 100)}% das parcelas vencidas atrasaram ou seguem abertas.`
  if (!urgent.length) return `${salesText}${creditText} Nenhum desvio relevante foi identificado nas fontes disponíveis.`
  return `${salesText}${creditText} Hoje merece atenção: ${urgent.map((alert) => alert.title.toLowerCase()).join(' e ')}.`
}

function fallbackAreaNarratives(metrics: DailyHealthMetrics): DailyHealthAreaNarratives {
  const postSale = metrics.postSaleAnalysis
  const operationFacts = [
    metrics.overdueOrders > 0 ? `${metrics.overdueOrders} pedidos alem do prazo` : '',
    metrics.ordersWithoutLabRequest > 0 ? `${metrics.ordersWithoutLabRequest} pedidos sem envio ao laboratorio` : '',
    metrics.readyForPickup > 0 ? `${metrics.readyForPickup} pedidos prontos aguardando retirada` : '',
  ].filter(Boolean)
  const relationshipFacts = [
    `Ontem foram concluidos ${Number(metrics.postSalesCompletedYesterday || 0)} pos-vendas e, nos ultimos 7 dias, ${Number(metrics.postSalesCompletedWeek || 0)}.`,
    metrics.pendingPostSales > 0
      ? `${metrics.pendingPostSales} continuam abertos: ${postSale.messageSent} mensagens enviadas, ${postSale.customerResponded} respostas posteriores, ${postSale.ratingsReceived} notas registradas, ${postSale.respondedWithoutRating} respostas sem nota registrada, ${postSale.awaitingRating} aguardando nota e ${postSale.messageFailed} falhas de envio.`
      : 'Nao ha pos-vendas pendentes.',
  ]
  return {
    financeiro: `${metrics.creditAnalysis.narrative} ${metrics.creditAnalysis.recommendation}`,
    operacao: operationFacts.length ? `A operacao pede atencao: ${operationFacts.join('; ')}.` : 'A operacao nao trouxe desvios relevantes nas fontes disponiveis.',
    relacionamento: relationshipFacts.join(' '),
    relacionamentoConcern: postSale.awaitingHumanReview > 0
      ? `Fiquei preocupado com ${postSale.awaitingHumanReview} caso${postSale.awaitingHumanReview === 1 ? '' : 's'} em revisao humana aberta. Confira esses retornos antes de seguirmos com novos contatos.`
      : null,
  }
}

type DailyHealthNarrativeResult = {
  narrative: string
  areas: DailyHealthAreaNarratives
}

async function createNarrative(metrics: DailyHealthMetrics, alerts: DailyHealthAlert[]): Promise<DailyHealthNarrativeResult> {
  const fallback: DailyHealthNarrativeResult = {
    narrative: fallbackNarrative(metrics, alerts),
    areas: fallbackAreaNarratives(metrics),
  }
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    console.info('[Daily health][IA] fallback deterministico; tokens=0')
    return fallback
  }
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: `Voce escreve a leitura diaria de uma otica em portugues brasileiro. Retorne SOMENTE JSON valido, sem markdown, neste formato: {"geral":"...","financeiro":"...","operacao":"...","relacionamento":"...","relacionamentoConcern":"texto ou null"}. Use SOMENTE os fatos estruturados abaixo. Nao invente causas, valores, clientes ou acoes. Cada leitura deve ser humana, direta e curta. Em relacionamento, explique os pos-vendas concluidos ontem e na semana, os envios, as respostas, as notas registradas, as respostas sem nota registrada, os casos aguardando nota e as falhas. Nunca escreva que uma resposta foi 'avaliada' quando o fato e apenas nao haver nota registrada. Preencha relacionamentoConcern somente quando houver revisao humana aberta, em tom de consultor preocupado. ${JSON.stringify({ metrics, alerts: alerts.map(({ title, detail, priority }) => ({ title, detail, priority })) })}`,
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
    let parsed: Partial<Record<'geral' | 'financeiro' | 'operacao' | 'relacionamento' | 'relacionamentoConcern', unknown>>
    try {
      parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1))
    } catch {
      console.warn(`[Daily health][IA] JSON invalido: ${text.slice(0, 1000)}`)
      return fallback
    }
    const validText = (value: unknown, fallbackValue: string) => typeof value === 'string' && value.trim().length > 10 && value.trim().length <= 1200 ? value.trim() : fallbackValue
    return {
      narrative: validText(parsed.geral, fallback.narrative),
      areas: {
        financeiro: validText(parsed.financeiro, fallback.areas.financeiro),
        operacao: validText(parsed.operacao, fallback.areas.operacao),
        relacionamento: validText(parsed.relacionamento, fallback.areas.relacionamento),
        relacionamentoConcern: typeof parsed.relacionamentoConcern === 'string' && parsed.relacionamentoConcern.trim().length > 10 && parsed.relacionamentoConcern.trim().length <= 600
          ? parsed.relacionamentoConcern.trim()
          : fallback.areas.relacionamentoConcern,
      },
    }
  } catch {
    console.info('[Daily health][IA] fallback apos falha ou formato invalido')
    return fallback
  }
}

export async function generateDailyStoreHealthReport(storeId = 1, reportDate = previousDateKey(dateKey(), 1)): Promise<DailyHealthReport> {
  const admin = createAdminClient({ noStore: true })
  const failures: string[] = []
  const target = rangeForDate(reportDate)
  const comparison = rangeForDate(previousDateKey(reportDate, 7))
  // A snapshot must be judged at the end of its reference day, not when it is regenerated.
  const asOfDateKey = reportDate
  const dueSoonKey = previousDateKey(asOfDateKey, -7)

  const [storeResult, settingsResult, salesResult, comparisonResult, paymentsResult, financingsResult, installmentsResult, ordersResult, postSalesResult, postSalesCompletedYesterdayResult, postSalesCompletedWeekResult, postSaleFollowupsResult, postSaleInteractionsResult, postSaleOrdersResult, itemsResult, whatsAppResult] = await Promise.allSettled([
    (admin.from('stores') as any).select('tenant_id').eq('id', storeId).single(),
    (admin.from('daily_store_health_settings') as any).select('settings').eq('store_id', storeId).maybeSingle(),
    (admin.from('vendas') as any).select('id,valor_final').eq('store_id', storeId).eq('status', 'Fechada').gte('created_at', target.start).lte('created_at', target.end),
    (admin.from('vendas') as any).select('valor_final').eq('store_id', storeId).eq('status', 'Fechada').gte('created_at', comparison.start).lte('created_at', comparison.end),
    (admin.from('pagamentos') as any).select('valor_pago').eq('store_id', storeId).gte('data_pagamento', target.start).lte('data_pagamento', target.end),
    (admin.from('financiamento_loja') as any).select('id,customer_id,valor_total_financiado,quantidade_parcelas,created_at').eq('store_id', storeId).gte('created_at', target.start).lte('created_at', target.end),
    loadInstallments(admin, storeId),
    (admin.from('service_orders') as any).select('id,created_at,dt_prometido_para,dt_pedido_em,dt_recebido_na_loja,dt_entregue_em').eq('store_id', storeId).is('lab_encerrada_em', null),
    (admin.from('post_sales') as any).select('id,status,service_order_id,avaliacao_cliente').eq('store_id', storeId).neq('status', 'Concluido'),
    (admin.from('post_sales') as any).select('id').eq('store_id', storeId).eq('status', 'Concluido').gte('updated_at', target.start).lte('updated_at', target.end),
    (admin.from('post_sales') as any).select('id').eq('store_id', storeId).eq('status', 'Concluido').gte('updated_at', rangeForDate(previousDateKey(reportDate, 6)).start).lte('updated_at', target.end),
    (admin.from('whatsapp_post_sale_followups') as any).select('post_sales_id,channel_id,remote_phone,status,sent_at,created_at').eq('store_id', storeId).not('post_sales_id', 'is', null).order('created_at', { ascending: false }),
    (admin.from('post_sales_interactions') as any).select('post_sales_id,tipo_contato,resumo,created_at').eq('store_id', storeId).order('created_at', { ascending: false }),
    (admin.from('service_orders') as any).select('id,customers(phone,fone_movel)').eq('store_id', storeId),
    (admin.from('venda_itens') as any).select('id,product_id,valor_total_item,products(preco_custo),vendas!inner(created_at,status)').eq('store_id', storeId).eq('vendas.status', 'Fechada').gte('vendas.created_at', target.start).lte('vendas.created_at', target.end),
    getWhatsAppPendencias(storeId),
  ])

  const read = <T>(result: PromiseSettledResult<any>, source: string, fallback: T): T => {
    if (result.status === 'rejected') { failures.push(source); return fallback }
    if (result.value?.error) { failures.push(source); return fallback }
    return (result.value?.data ?? result.value) as T
  }

  const store = read<any>(storeResult, 'loja', null)
  if (!store?.tenant_id) throw new Error('Loja nao encontrada para o relatorio diario.')
  const settings = normalizeSettings(read<any>(settingsResult, 'parametros', null)?.settings)
  const sales = read<any[]>(salesResult, 'vendas', [])
  const comparisonSales = read<any[]>(comparisonResult, 'comparacao de vendas', [])
  const payments = read<any[]>(paymentsResult, 'recebimentos', [])
  const newFinancings = read<any[]>(financingsResult, 'novos parcelamentos', [])
  const installments = read<any[]>(installmentsResult, 'parcelas', [])
  const orders = read<any[]>(ordersResult, 'ordens de servico', [])
  const postSales = read<any[]>(postSalesResult, 'pos-venda', [])
  const postSalesCompletedYesterday = read<any[]>(postSalesCompletedYesterdayResult, 'pos-vendas concluidos ontem', [])
  const postSalesCompletedWeek = read<any[]>(postSalesCompletedWeekResult, 'pos-vendas concluidos na semana', [])
  const postSaleFollowups = read<any[]>(postSaleFollowupsResult, 'envios de pos-venda', [])
  const postSaleInteractions = read<any[]>(postSaleInteractionsResult, 'interacoes de pos-venda', [])
  const postSaleOrders = read<any[]>(postSaleOrdersResult, 'clientes de pos-venda', [])
  const soldItems = read<any[]>(itemsResult, 'itens vendidos', [])
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
  const overdue = unpaid.filter((item) => String(item.data_vencimento).slice(0, 10) < asOfDateKey)
  const dueSoon = unpaid.filter((item) => String(item.data_vencimento).slice(0, 10) >= asOfDateKey && String(item.data_vencimento).slice(0, 10) <= dueSoonKey)
  const activeByCustomer = new Map<number, number>()
  unpaid.forEach((item) => item.customer_id && activeByCustomer.set(item.customer_id, (activeByCustomer.get(item.customer_id) || 0) + 1))
  const orderDate = (value: string | null) => value ? String(value).slice(0, 10) : null
  const readyForPickup = orders.filter((order) => order.dt_recebido_na_loja && !order.dt_entregue_em)
  const overdueOrders = orders.filter((order) => !order.dt_entregue_em && orderDate(order.dt_prometido_para) && orderDate(order.dt_prometido_para)! < asOfDateKey)
  const oldWithoutLab = orders.filter((order) => !order.dt_entregue_em && !order.dt_pedido_em && new Date(order.created_at).getTime() < Date.now() - settings.labRequestHours * 60 * 60 * 1000)
  const soldValue = sum(soldItems, 'valor_total_item')
  const coveredValue = soldItems.filter((item) => Number(item.products?.preco_custo || 0) > 0).reduce((total, item) => total + Number(item.valor_total_item || 0), 0)
  const postSaleAnalysis = buildPostSaleAnalysis(postSales, postSaleFollowups, postSaleInteractions, postSaleOrders, postSaleInboundMessages)
  const metrics: DailyHealthMetrics = {
    sales: sum(sales, 'valor_final'), salesComparison: comparisonSales.length ? sum(comparisonSales, 'valor_final') : null,
    received: sum(payments, 'valor_pago'), newFinanced: sum(newFinancings, 'valor_total_financiado'),
    receivable: unpaid.reduce((total, item) => total + outstanding(item), 0), overdue: overdue.reduce((total, item) => total + outstanding(item), 0),
    overdueInstallments: overdue.length, dueSoon: dueSoon.reduce((total, item) => total + outstanding(item), 0),
    activeFinancing: new Set(unpaid.map((item) => item.financiamento_id)).size,
    multiFinancingCustomers: [...activeByCustomer.values()].filter((count) => count > 1).length,
    readyForPickup: readyForPickup.length, overdueOrders: overdueOrders.length, ordersWithoutLabRequest: oldWithoutLab.length,
    pendingPostSales: postSales.length,
    postSalesCompletedYesterday: postSalesCompletedYesterday.length,
    postSalesCompletedWeek: postSalesCompletedWeek.length,
    postSaleAnalysis,
    pendingWhatsApp: whatsApp.length,
    costCoverage: soldValue > 0 ? coveredValue / soldValue : null,
    creditAnalysis,
  }

  const alerts: DailyHealthAlert[] = []
  if (metrics.overdue > 0) alerts.push({ id: 'overdue-installments', area: 'financeiro', priority: metrics.overdue > settings.overdueCriticalValue ? 'critico' : 'atencao', title: `${metrics.overdueInstallments} parcelas vencidas`, detail: `${money(metrics.overdue)} permanecem em aberto.`, impact: metrics.overdue, confidence: 'alta', href: `/dashboard/loja/${storeId}/financeiro/parcelas`, records: { type: 'parcela', ids: overdue.slice(0, 25).map((item) => item.id) } })
  if (metrics.multiFinancingCustomers > 0) alerts.push({ id: 'multiple-financing', area: 'financeiro', priority: 'atencao', title: `${metrics.multiFinancingCustomers} clientes com mais de uma parcela ativa`, detail: 'Acompanhe esse grupo antes de liberar novo credito; o indicador aponta exposicao, nao causa de atraso.', impact: null, confidence: 'media', href: `/dashboard/loja/${storeId}/financeiro/parcelas`, records: { type: 'cliente', ids: [...activeByCustomer].filter(([, count]) => count > 1).map(([id]) => id).slice(0, 25) } })
  if (metrics.overdueOrders > 0) alerts.push({ id: 'late-orders', area: 'operacao', priority: 'critico', title: `${metrics.overdueOrders} pedidos alem do prazo prometido`, detail: 'Existem clientes aguardando entrega apos a data informada.', impact: metrics.overdueOrders, confidence: 'alta', href: `/dashboard/loja/${storeId}/entrega`, records: { type: 'os', ids: overdueOrders.slice(0, 25).map((item) => item.id) } })
  if (metrics.ordersWithoutLabRequest > 0) alerts.push({ id: 'orders-without-lab', area: 'operacao', priority: 'atencao', title: `${metrics.ordersWithoutLabRequest} pedidos sem envio ao laboratorio`, detail: 'Ordens abertas ha mais de 24 horas ainda nao registram pedido ao laboratorio.', impact: metrics.ordersWithoutLabRequest, confidence: 'alta', href: `/dashboard/loja/${storeId}/entrega`, records: { type: 'os', ids: oldWithoutLab.slice(0, 25).map((item) => item.id) } })
  if (metrics.readyForPickup > 0) alerts.push({ id: 'ready-pickup', area: 'operacao', priority: 'informativo', title: `${metrics.readyForPickup} pedidos prontos aguardando retirada`, detail: 'Priorize o aviso e a confirmacao de retirada dos clientes.', impact: metrics.readyForPickup, confidence: 'alta', href: `/dashboard/loja/${storeId}/entrega`, records: { type: 'os', ids: readyForPickup.slice(0, 25).map((item) => item.id) } })
  if (metrics.pendingWhatsApp > 0) alerts.push({ id: 'whatsapp-pending', area: 'relacionamento', priority: 'atencao', title: `${metrics.pendingWhatsApp} conversas de WhatsApp aguardando humano`, detail: 'Ha atendimentos transferidos que ainda precisam de continuidade.', impact: metrics.pendingWhatsApp, confidence: 'alta', href: `/dashboard/loja/${storeId}/atendimento`, records: { type: 'conversa', ids: whatsApp.slice(0, 25).map((item) => item.id) } })
  if (metrics.pendingPostSales > 0) alerts.push({ id: 'post-sales-pending', area: 'relacionamento', priority: postSaleAnalysis.messageFailed > 0 || postSaleAnalysis.complaintOrAdaptation > 0 ? 'atencao' : 'informativo', title: `${metrics.pendingPostSales} pos-vendas pendentes`, detail: `${postSaleAnalysis.messageSent} tiveram mensagem enviada: ${postSaleAnalysis.customerResponded} receberam resposta posterior, ${postSaleAnalysis.ratingsReceived} notas foram registradas e ${postSaleAnalysis.respondedWithoutRating} respostas seguem sem nota. ${postSaleAnalysis.messageScheduled} aguardam novo envio; ${postSaleAnalysis.messageFailed} falharam no envio; ${postSaleAnalysis.noMessageAttempt} ${postSaleAnalysis.noMessageAttempt === 1 ? 'nao possui' : 'nao possuem'} tentativa registrada.`, impact: metrics.pendingPostSales, confidence: 'alta', href: `/dashboard/loja/${storeId}/pos-venda`, records: { type: 'pos-venda', ids: postSales.slice(0, 25).map((item) => item.id) } })
  if (metrics.costCoverage !== null && metrics.costCoverage < settings.minimumCostCoverage) alerts.push({ id: 'cost-coverage', area: 'financeiro', priority: 'atencao', title: 'Margem indisponivel por custo incompleto', detail: `Somente ${(metrics.costCoverage * 100).toFixed(0)}% do valor vendido possui custo positivo cadastrado; lucro e margem foram ocultados.`, impact: null, confidence: 'alta', href: `/dashboard/loja/${storeId}/reports/financeiro`, records: { type: 'produto', ids: [] } })

  const narratives = await createNarrative(metrics, alerts)
  metrics.areaNarratives = narratives.areas
  const report: DailyHealthReport = { reportDate, status: 'ready', metrics, alerts: alerts.sort((a, b) => ({ critico: 0, atencao: 1, informativo: 2 }[a.priority] - { critico: 0, atencao: 1, informativo: 2 }[b.priority])), narrative: narratives.narrative, sourceFailures: failures, generatedAt: new Date().toISOString() }
  const { data: saved, error } = await (admin.from('daily_store_health_reports') as any).upsert({ tenant_id: store.tenant_id, store_id: storeId, report_date: reportDate, status: 'ready', metrics: report.metrics, alerts: report.alerts, narrative: report.narrative, source_failures: report.sourceFailures, generated_at: report.generatedAt, generation_started_at: report.generatedAt, updated_at: report.generatedAt }, { onConflict: 'store_id,report_date' }).select('id').single()
  if (error) throw error
  return { ...report, id: saved?.id }
}

export async function getLatestDailyStoreHealthReport(storeId: number): Promise<DailyHealthReport | null> {
  const admin = createAdminClient({ noStore: true })
  const { data, error } = await (admin.from('daily_store_health_reports') as any).select('*').eq('store_id', storeId).eq('status', 'ready').order('report_date', { ascending: false }).limit(1).maybeSingle()
  if (error || !data) return null
  return { id: data.id, reportDate: data.report_date, status: data.status, metrics: data.metrics, alerts: data.alerts, narrative: data.narrative, sourceFailures: data.source_failures || [], generatedAt: data.generated_at }
}
