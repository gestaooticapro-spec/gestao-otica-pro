/* eslint-disable @typescript-eslint/no-explicit-any */

import { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreModules, StoreSettings } from '@/lib/store-modules'
import { digitsOnly, phonesMatch, toEvolutionNumber } from '@/lib/whatsapp/phone'
import { recordAutomatedOutboundConversationContext } from '@/lib/whatsapp/automated-conversation-context'
import { buildWhatsAppCanonicalPayload } from '@/lib/whatsapp/canonical'
import { isOperatorPauseActive } from '@/lib/whatsapp/human-control-policy'
import { WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS } from '@/lib/whatsapp/redesign/contracts'
import { evaluateStoreHours } from '@/lib/whatsapp/store-hours-logic'
import {
  buildPostSaleFollowupMessage,
  buildPostSaleFollowupSettings,
  canBypassPostSaleBusinessHoursForTest,
  canReuseStoreOnePostSaleTestFollowup,
  decidePostSaleDeadlineOutcome,
  decideStalePostSaleFollowupRecovery,
  DEFAULT_POST_SALE_FOLLOWUP_DAYS,
  isStoreOnePostSaleTestProtocol,
  STORE_ONE_POST_SALE_TEST_MARKER,
} from '@/lib/whatsapp/post-sale-followup'
import { concludePostSaleAutomatically, ensurePostSaleTracking } from '@/lib/whatsapp/post-sales'

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const BUSINESS_START_HOUR = 9
const BUSINESS_END_HOUR = 18
const POST_SALE_SLOT_INTERVAL_MINUTES = 30
const POST_SALE_SLOT_OFFSET_MINUTES = 15
const DEFAULT_DISPATCH_LIMIT = 1
const POST_SALE_CONTEXT_MS = 7 * 24 * 60 * 60 * 1000
const STALE_SENDING_MS = 10 * 60 * 1000

type ChannelRow = {
  id: number
  tenant_id: string
  store_id: number
  instance_key: string
  phone_number: string
  is_active: boolean
  connection_status: string
  stores?: {
    settings: Json | null
  } | null
}

type EligibleServiceOrderRow = {
  id: number
  tenant_id: string
  store_id: number
  customer_id: number
  dependente_id: number | null
  dt_entregue_em: string
  protocolo_fisico?: string | null
  customers?: {
    id: number
    full_name: string
    phone: string | null
    fone_movel: string | null
  } | null
  dependentes?: {
    id: number
    full_name: string | null
  } | null
  post_sales?: Array<{
    id: number
    status: string
  }> | null
  vendas?: {
    id: number
    status: string | null
  } | null
}

type PostSaleOrderGroup = {
  orders: EligibleServiceOrderRow[]
  representative: EligibleServiceOrderRow
}

type FollowupRow = {
  id: number
  tenant_id: string
  store_id: number
  channel_id: number
  service_order_id: number
  covered_service_order_ids: number[]
  customer_id: number
  post_sales_id: number | null
  remote_phone: string
  delivered_at: string
  scheduled_for: string
  sent_at: string | null
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
  message_text: string
  outbound_message_id: number | null
  payload: Json | null
  whatsapp_store_channels?: {
    instance_key: string
    is_active: boolean
    connection_status: string
  } | null
  stores?: {
    settings: Json | null
  } | null
}

function reminderExpiresAt(ms: number) {
  return new Date(Date.now() + ms).toISOString()
}

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    weekday: 'short',
    hour12: false,
  }).formatToParts(date)

  const get = (type: string) => parts.find((part) => part.type === type)?.value || ''
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')),
    minute: Number(get('minute')),
    weekday: get('weekday'),
  }
}

function isBusinessTime(now: Date) {
  const parts = zonedParts(now)
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun'
  return !weekend && parts.hour >= BUSINESS_START_HOUR && parts.hour < BUSINESS_END_HOUR
}

function settingsFromJson(settingsJson: Json | null | undefined): StoreSettings {
  return ((settingsJson || {}) as StoreSettings) || {}
}

function isPostSaleBusinessTime(now: Date, settingsJson?: Json | null) {
  const settings = settingsFromJson(settingsJson)
  if (!settings.store_hours) return isBusinessTime(now)

  const parts = zonedParts(now)
  if (parts.hour < BUSINESS_START_HOUR || parts.hour >= BUSINESS_END_HOUR) return false

  return evaluateStoreHours(settings.store_hours, now).is_open_now === true
}

function buildUtcDateFromSaoPauloParts(date: string, hour: number, minute: number) {
  const [year, month, day] = date.split('-').map(Number)
  const utcMs = Date.UTC(year, month - 1, day, hour + 3, minute, 0, 0)
  return new Date(utcMs)
}

function nextBusinessDate(date: Date) {
  const next = new Date(date.getTime())
  do {
    next.setUTCDate(next.getUTCDate() + 1)
  } while (!isBusinessTime(buildUtcDateFromSaoPauloParts(next.toISOString().slice(0, 10), BUSINESS_START_HOUR, 0)))
  return next
}

function nextPostSaleBusinessSlot(now: Date) {
  const parts = zonedParts(now)
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun'

  if (weekend || parts.hour >= BUSINESS_END_HOUR) {
    const nextDate = nextBusinessDate(new Date(`${parts.date}T12:00:00Z`))
    return buildUtcDateFromSaoPauloParts(nextDate.toISOString().slice(0, 10), BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  if (parts.hour < BUSINESS_START_HOUR) {
    return buildUtcDateFromSaoPauloParts(parts.date, BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  const minutesOfDay = parts.hour * 60 + parts.minute
  const firstSlotMinutes = BUSINESS_START_HOUR * 60 + POST_SALE_SLOT_OFFSET_MINUTES
  if (minutesOfDay <= firstSlotMinutes) {
    return buildUtcDateFromSaoPauloParts(parts.date, BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  const delta = minutesOfDay - firstSlotMinutes
  const nextOffset = Math.ceil(delta / POST_SALE_SLOT_INTERVAL_MINUTES) * POST_SALE_SLOT_INTERVAL_MINUTES
  const slotMinutesOfDay = firstSlotMinutes + nextOffset
  const slotHour = Math.floor(slotMinutesOfDay / 60)
  const slotMinute = slotMinutesOfDay % 60

  if (slotHour >= BUSINESS_END_HOUR) {
    const nextDate = nextBusinessDate(new Date(`${parts.date}T12:00:00Z`))
    return buildUtcDateFromSaoPauloParts(nextDate.toISOString().slice(0, 10), BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  return buildUtcDateFromSaoPauloParts(parts.date, slotHour, slotMinute)
}

function nextPostSaleBusinessSlotForSettings(now: Date, settingsJson?: Json | null) {
  const settings = settingsFromJson(settingsJson)
  let candidate = settings.store_hours
    ? nextPostSaleSlotCandidate(now)
    : nextPostSaleBusinessSlot(now)
  for (let attempt = 0; attempt < 21 * 24 * 2; attempt += 1) {
    if (isPostSaleBusinessTime(candidate, settingsJson)) return candidate
    candidate = settings.store_hours
      ? nextPostSaleSlotCandidate(new Date(candidate.getTime() + POST_SALE_SLOT_INTERVAL_MINUTES * 60 * 1000))
      : nextPostSaleBusinessSlot(new Date(candidate.getTime() + POST_SALE_SLOT_INTERVAL_MINUTES * 60 * 1000))
  }
  return candidate
}

function nextPostSaleSlotCandidate(now: Date) {
  const parts = zonedParts(now)

  if (parts.hour >= BUSINESS_END_HOUR) {
    const nextDate = new Date(`${parts.date}T12:00:00Z`)
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
    return buildUtcDateFromSaoPauloParts(nextDate.toISOString().slice(0, 10), BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  if (parts.hour < BUSINESS_START_HOUR) {
    return buildUtcDateFromSaoPauloParts(parts.date, BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  const minutesOfDay = parts.hour * 60 + parts.minute
  const firstSlotMinutes = BUSINESS_START_HOUR * 60 + POST_SALE_SLOT_OFFSET_MINUTES
  if (minutesOfDay <= firstSlotMinutes) {
    return buildUtcDateFromSaoPauloParts(parts.date, BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  const delta = minutesOfDay - firstSlotMinutes
  const nextOffset = Math.ceil(delta / POST_SALE_SLOT_INTERVAL_MINUTES) * POST_SALE_SLOT_INTERVAL_MINUTES
  const slotMinutesOfDay = firstSlotMinutes + nextOffset
  const slotHour = Math.floor(slotMinutesOfDay / 60)
  const slotMinute = slotMinutesOfDay % 60

  if (slotHour >= BUSINESS_END_HOUR) {
    const nextDate = new Date(`${parts.date}T12:00:00Z`)
    nextDate.setUTCDate(nextDate.getUTCDate() + 1)
    return buildUtcDateFromSaoPauloParts(nextDate.toISOString().slice(0, 10), BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
  }

  return buildUtcDateFromSaoPauloParts(parts.date, slotHour, slotMinute)
}

function addPostSaleSlots(date: Date, slots: number, settingsJson?: Json | null) {
  let next = new Date(date.getTime())
  for (let i = 0; i < slots; i += 1) {
    next = new Date(next.getTime() + POST_SALE_SLOT_INTERVAL_MINUTES * 60 * 1000)
    if (!isPostSaleBusinessTime(next, settingsJson)) {
      next = nextPostSaleBusinessSlotForSettings(next, settingsJson)
    }
  }
  return next
}

function daysAgoDateString(now: Date, days: number) {
  const target = new Date(now.getTime())
  target.setUTCDate(target.getUTCDate() - days)
  return target.toISOString().slice(0, 10)
}

function followupSettingsFromChannel(channel: ChannelRow) {
  const settings = settingsFromJson(channel.stores?.settings)
  if (settings.whatsapp_automation?.enabled === false) return null

  const modules = getStoreModules(settings)
  if (!modules.postSales) return null

  const followupSettings = buildPostSaleFollowupSettings(
    settings.whatsapp_automation?.post_sale_followup
  )
  return followupSettings.enabled ? followupSettings : null
}

function followupEnabledFromStoreSettings(settingsJson: Json | null | undefined) {
  const settings = settingsFromJson(settingsJson)
  if (settings.whatsapp_automation?.enabled === false) return false

  const modules = getStoreModules(settings)
  if (!modules.postSales) return false

  return buildPostSaleFollowupSettings(
    settings.whatsapp_automation?.post_sale_followup
  ).enabled
}

async function loadActiveChannels() {
  const supabase = createAdminClient({ noStore: true })
  const { data, error } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id, tenant_id, store_id, instance_key, phone_number, is_active, connection_status, stores(settings)')
    .eq('provider', 'evolution')
    .eq('is_active', true)
    .eq('connection_status', 'connected')

  if (error) throw error
  return (data ?? []) as ChannelRow[]
}

async function loadEligibleServiceOrders(storeId: number, deliveredUntil: string, deliveredSince: string) {
  const supabase = createAdminClient({ noStore: true })
  const deliveredBefore = `${deliveredUntil}T23:59:59.999Z`
  const query = (supabase.from('service_orders') as any)
    .select(`
      id,
      tenant_id,
      store_id,
      customer_id,
      dependente_id,
      dt_entregue_em,
      customers ( id, full_name, phone, fone_movel ),
      dependentes ( id, full_name ),
      post_sales ( id, status ),
      vendas ( id, status )
    `)
    .eq('store_id', storeId)
    .not('dt_entregue_em', 'is', null)
    .lte('dt_entregue_em', deliveredBefore)
    .gte('dt_entregue_em', `${deliveredSince}T00:00:00.000Z`)
    .order('dt_entregue_em', { ascending: true })
    .order('id', { ascending: true })

  const orders: EligibleServiceOrderRow[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query.range(offset, offset + 499)
    if (error) throw error
    orders.push(...(data || []))
    if (!data || data.length < 500) break
  }
  return orders
}

function orderBeneficiaryKey(order: EligibleServiceOrderRow) {
  return order.dependente_id ? `dependent:${order.dependente_id}` : 'customer'
}

function ordersCanBeGrouped(left: EligibleServiceOrderRow, right: EligibleServiceOrderRow) {
  if (left.customer_id !== right.customer_id) return false
  if (orderBeneficiaryKey(left) !== orderBeneficiaryKey(right)) return false

  const leftDelivered = new Date(left.dt_entregue_em).getTime()
  const rightDelivered = new Date(right.dt_entregue_em).getTime()
  const withinDeliveryWindow = Number.isFinite(leftDelivered) && Number.isFinite(rightDelivered)
    && Math.abs(leftDelivered - rightDelivered) <= 14 * 24 * 60 * 60 * 1000
  const sameSale = Boolean(left.vendas?.id && right.vendas?.id && left.vendas.id === right.vendas.id)

  return sameSale || withinDeliveryWindow
}

function groupEligibleServiceOrders(orders: EligibleServiceOrderRow[]) {
  const groups: PostSaleOrderGroup[] = []

  for (const order of orders) {
    // A primeira OS e a ancora do grupo. Isso impede o encadeamento
    // transitive de entregas 0/13/26 dias em um grupo de 26 dias.
    const group = groups.find((candidate) => ordersCanBeGrouped(candidate.orders[0], order))
    if (group) {
      group.orders.push(order)
      group.representative = [...group.orders].sort((left, right) =>
        new Date(right.dt_entregue_em).getTime() - new Date(left.dt_entregue_em).getTime()
      )[0]
      continue
    }

    groups.push({ orders: [order], representative: order })
  }

  return groups
}

async function hasActiveHumanBlock(channelId: number, phone: string) {
  const supabase = createAdminClient({ noStore: true })
  const nowIso = new Date().toISOString()
  const nowMs = Date.parse(nowIso)

  const [stateResult, controlResult] = await Promise.all([
    (supabase.from('whatsapp_conversation_states') as any)
      .select('id, state, metadata, updated_at')
      .eq('channel_id', channelId)
      .eq('remote_phone', phone)
      .eq('state', 'human_pause')
      .maybeSingle(),
    (supabase.from('whatsapp_customer_control') as any)
      .select('id')
      .eq('channel_id', channelId)
      .eq('remote_phone', phone)
      .eq('mode', 'force_human')
      .maybeSingle(),
  ])

  if (stateResult.error) throw stateResult.error
  if (controlResult.error) throw controlResult.error

  const hasRecentOperatorPause = stateResult.data
    && isOperatorPauseActive({
      state: stateResult.data.state,
      metadata: stateResult.data.metadata,
      updatedAt: stateResult.data.updated_at,
      nowMs,
      pauseMs: WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS,
    })

  return Boolean(hasRecentOperatorPause || controlResult.data?.id)
}

async function isPostSaleFollowupOptedOut(storeId: number, phone: string) {
  const supabase = createAdminClient({ noStore: true })
  const { data, error } = await (supabase.from('whatsapp_message_preferences') as any)
    .select('remote_phone')
    .eq('store_id', storeId)
    .eq('post_sale_followups_enabled', false)
  if (error) throw error
  return (data || []).some((row: { remote_phone?: string | null }) => phonesMatch(row.remote_phone, phone))
}

async function closeExpiredPostSaleFollowups(now: Date) {
  const supabase = createAdminClient({ noStore: true })
  const deadlineIso = new Date(now.getTime() - POST_SALE_CONTEXT_MS).toISOString()
  // Filtrar antes de percorrer o historico: centenas de casos ja concluidos
  // nao devem consumir o tempo da execucao nem impedir novos agendamentos.
  const activeOrderIds: number[] = []
  for (let offset = 0; ; offset += 500) {
    const { data: active, error: activeError } = await (supabase.from('post_sales') as any)
      .select('service_order_id').eq('status', 'Em Acompanhamento').order('id').range(offset, offset + 499)
    if (activeError) throw activeError
    activeOrderIds.push(...(active || []).map((p: { service_order_id: number }) => p.service_order_id))
    if (!active || active.length < 500) break
  }
  if (!activeOrderIds.length) return { closedWith3: 0, closedWith4: 0, keptHuman: 0 }
  const { data: followups, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, remote_phone, post_sales_id, covered_service_order_ids, sent_at')
    .eq('status', 'sent')
    .not('post_sales_id', 'is', null)
    .not('sent_at', 'is', null)
    .lte('sent_at', deadlineIso)
    .overlaps('covered_service_order_ids', activeOrderIds)

  if (error) throw error

  let closedWith3 = 0
  let closedWith4 = 0
  let keptHuman = 0

  for (const followup of (followups ?? []) as Array<Pick<FollowupRow, 'id' | 'tenant_id' | 'store_id' | 'channel_id' | 'service_order_id' | 'covered_service_order_ids' | 'remote_phone' | 'post_sales_id' | 'sent_at'>>) {
    const serviceOrderIds = coveredServiceOrderIds(followup)

    const { data: postSales, error: postSalesError } = await (supabase.from('post_sales') as any)
      .select('id, status, service_order_id')
      .eq('tenant_id', followup.tenant_id)
      .eq('store_id', followup.store_id)
      .in('service_order_id', serviceOrderIds)
    if (postSalesError) throw postSalesError
    const activePostSales = (postSales || []).filter((postSale: { status: string }) => postSale.status === 'Em Acompanhamento')
    if (activePostSales.length === 0) continue
    if (await hasActiveHumanBlock(followup.channel_id, followup.remote_phone)) {
      keptHuman += 1
      continue
    }
    const postSalesIds = (postSales || []).map((postSale: { id: number }) => postSale.id)
    if (postSalesIds.length === 0) continue
    const { data: interactions, error: interactionsError } = await (supabase.from('post_sales_interactions') as any)
      .select('resumo')
      .in('post_sales_id', postSalesIds)
    if (interactionsError) throw interactionsError

    const outcome = decidePostSaleDeadlineOutcome((interactions ?? []).map((interaction: { resumo?: string | null }) => interaction.resumo))
    if (outcome === 'keep_human') {
      keptHuman += 1
      continue
    }

    const rating = outcome === 'auto_score_4' ? 4 : 3
    const finalObservation = rating === 4
      ? 'Nota 4 atribuída automaticamente: cliente respondeu positivamente ao pós-venda via WhatsApp, mas não informou uma nota numérica em 7 dias.'
      : 'Sem resposta ao pós-venda via WhatsApp.'

    for (const postSale of activePostSales as Array<{ id: number }>) {
      const closed = await concludePostSaleAutomatically({
        tenantId: followup.tenant_id,
        storeId: followup.store_id,
        postSalesId: postSale.id,
        rating,
        finalObservation,
      })
      if (closed) {
        if (rating === 4) closedWith4 += 1
        else closedWith3 += 1
      }
    }
  }

  return { closedWith3, closedWith4, keptHuman }
}

async function markPostSaleConversationContext(input: {
  channel: ChannelRow
  followupId: number
  postSalesId: number
  serviceOrderId: number
  customerId: number
  remotePhone: string
  sentAtIso: string
  deliveredAt: string
  messageText: string
}) {
  await recordAutomatedOutboundConversationContext({
    tenantId: input.channel.tenant_id,
    storeId: input.channel.store_id,
    channelId: input.channel.id,
    remotePhone: input.remotePhone,
    sentAtIso: input.sentAtIso,
    retentionMs: POST_SALE_CONTEXT_MS,
    messageText: input.messageText,
    metadata: {
      reason: 'post_sale_followup_sent',
      lastAction: 'post_sale_followup_sent',
      lastOutboundType: 'post_sale_followup',
      lastDecisionAt: input.sentAtIso,
      postSaleContext: {
        followupId: input.followupId,
        postSalesId: input.postSalesId,
        serviceOrderId: input.serviceOrderId,
        customerId: input.customerId,
        deliveryDate: input.deliveredAt,
        stage: 'awaiting_feedback',
        ratingPromptCount: 0,
      },
    },
  })
}

async function postSaleHasContact(postSaleId: number) {
  const supabase = createAdminClient({ noStore: true })
  const { data, error } = await (supabase.from('post_sales_interactions') as any)
    .select('id').eq('post_sales_id', postSaleId).limit(1)
  if (error) throw error
  return Boolean(data?.length)
}

async function nextAvailablePostSaleSlot(channel: ChannelRow, now: Date) {
  const supabase = createAdminClient({ noStore: true })
  const firstSlot = nextPostSaleBusinessSlotForSettings(now, channel.stores?.settings)
  const { data: tail, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('scheduled_for').eq('store_id', channel.store_id).in('status', ['scheduled', 'sending'])
    .order('scheduled_for', { ascending: false }).limit(1)
  if (error) throw error
  return tail?.[0] && new Date(tail[0].scheduled_for) >= firstSlot
    ? addPostSaleSlots(new Date(tail[0].scheduled_for), 1, channel.stores?.settings)
    : firstSlot
}

async function scheduleFollowups(now: Date, dryRun = false, onlyStoreId?: number) {
  const supabase = createAdminClient({ noStore: true })
  const channels = await loadActiveChannels()
  let scheduled = 0
  let alreadyScheduled = 0
  const reasons: Record<string, number> = {}
  const countReason = (reason: string) => { reasons[reason] = (reasons[reason] || 0) + 1 }
  let examined = 0
  let eligibleGroups = 0
  const visitedStores = new Set<number>()

  for (const channel of channels) {
    if (onlyStoreId !== undefined && channel.store_id !== onlyStoreId) continue
    if (visitedStores.has(channel.store_id)) continue
    const settings = followupSettingsFromChannel(channel)
    if (!settings) { countReason('automation_disabled'); continue }
    visitedStores.add(channel.store_id)
    const firstSlot = await nextAvailablePostSaleSlot(channel, now)

    const deliveredUntil = daysAgoDateString(now, settings.days_after_delivery || DEFAULT_POST_SALE_FOLLOWUP_DAYS)
    // Recuperacao recente: nao iniciar contatos sobre entregas historicas.
    const deliveredSince = daysAgoDateString(now, Math.max(30, settings.days_after_delivery + 14))
    const serviceOrders = await loadEligibleServiceOrders(channel.store_id, deliveredUntil, deliveredSince)
    examined += serviceOrders.length
    const serviceOrderIds = serviceOrders.map((serviceOrder) => serviceOrder.id)
    const existingFollowupOrderIds = new Set<number>()
    if (serviceOrderIds.length > 0) {
      const { data: existingFollowups, error: existingFollowupsError } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .select('covered_service_order_ids')
        .eq('store_id', channel.store_id)
        .overlaps('covered_service_order_ids', serviceOrderIds)

      if (existingFollowupsError) throw existingFollowupsError
      for (const existing of existingFollowups || []) {
        for (const serviceOrderId of Array.isArray(existing.covered_service_order_ids) ? existing.covered_service_order_ids : []) {
          if (Number.isFinite(serviceOrderId)) existingFollowupOrderIds.add(Number(serviceOrderId))
        }
      }
    }

    const eligibleOrders: EligibleServiceOrderRow[] = []
    for (const serviceOrder of serviceOrders) {
      const saleStatus = serviceOrder.vendas?.status || null
      if (saleStatus === 'Devolvida' || saleStatus === 'Cancelada') { countReason('sale_cancelled'); continue }
      if (serviceOrder.post_sales?.some((p) => p.status === 'Concluido')) { countReason('completed'); continue }
      if (existingFollowupOrderIds.has(serviceOrder.id)) { countReason('already_covered'); continue }
      let contacted = false
      for (const postSale of serviceOrder.post_sales || []) {
        if (await postSaleHasContact(postSale.id)) contacted = true
      }
      if (contacted) { countReason('existing_contact'); continue }
      eligibleOrders.push(serviceOrder)
    }

    const groupedOrders = groupEligibleServiceOrders(eligibleOrders)
    let channelSequence = 0

    for (const group of groupedOrders) {
      const serviceOrder = group.representative
      const postSale = serviceOrder.post_sales?.[0]

      const customerName = serviceOrder.customers?.full_name || 'Cliente'
      const phone = toEvolutionNumber(serviceOrder.customers?.fone_movel || serviceOrder.customers?.phone)
      if (!phone || !/^\d{10,15}$/.test(phone)) { countReason('missing_or_invalid_phone'); continue }
      if (await isPostSaleFollowupOptedOut(channel.store_id, phone)) { countReason('opt_out'); continue }
      if (await hasActiveHumanBlock(channel.id, phone)) { countReason('human_control'); continue }
      eligibleGroups += 1
      if (dryRun) continue

      const deliveredAt = String(serviceOrder.dt_entregue_em || '').slice(0, 10)
      if (!deliveredAt) continue

      const deliveredMs = new Date(serviceOrder.dt_entregue_em).getTime()
      const diffDays = Number.isFinite(deliveredMs)
        ? Math.max(1, Math.floor((now.getTime() - deliveredMs) / 86_400_000))
        : settings.days_after_delivery
      const messageText = buildPostSaleFollowupMessage({
        template: settings.template,
        customerName,
        dependentName: serviceOrder.dependentes?.full_name ?? null,
        daysSinceDelivery: diffDays,
        groupedServiceOrderCount: group.orders.length,
      })

      const scheduledFor = addPostSaleSlots(firstSlot, channelSequence, channel.stores?.settings)
      const { error } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .insert({
          tenant_id: serviceOrder.tenant_id,
          store_id: channel.store_id,
          channel_id: channel.id,
          service_order_id: serviceOrder.id,
          covered_service_order_ids: group.orders.map((item) => item.id),
          customer_id: serviceOrder.customer_id,
          post_sales_id: postSale?.id || null,
          remote_phone: phone,
          delivered_at: deliveredAt,
          scheduled_for: scheduledFor.toISOString(),
          status: 'scheduled',
          message_text: messageText,
          payload: {
            deliveryDate: deliveredAt,
            daysSinceDelivery: diffDays,
            groupedServiceOrderIds: group.orders.map((item) => item.id),
            groupedServiceOrderCount: group.orders.length,
            groupedBeneficiary: serviceOrder.dependente_id
              ? { type: 'dependent', id: serviceOrder.dependente_id, name: serviceOrder.dependentes?.full_name ?? null }
              : { type: 'customer', id: serviceOrder.customer_id, name: customerName },
          },
        })

      if (error?.code === '23505') {
        alreadyScheduled += 1
        continue
      }
      if (error) throw error

      scheduled += 1
      channelSequence += 1
    }
  }

  return { scheduled, alreadyScheduled, examined, eligibleGroups, reasons }
}

async function automationSendRequest(payload: {
  instanceKey: string
  phone: string
  text: string
  outboundMessageId: number
}) {
  const baseUrl = process.env.WHATSAPP_AUTOMATION_ADMIN_URL?.replace(/\/$/, '')
  const secret = process.env.WHATSAPP_INTERNAL_SECRET
  if (!baseUrl || !secret) throw new Error('WhatsApp automation admin environment is not configured.')

  const response = await fetch(`${baseUrl}/admin/messages/send`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${secret}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30000),
  })

  const result = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(`WhatsApp send failed (${response.status}): ${JSON.stringify(result)}`)
  }
  return result
}

async function ensureSentInteraction(input: {
  supabase: ReturnType<typeof createAdminClient>
  followup: FollowupRow
  postSalesId: number
}) {
  const summary = 'Disparo automatico de pos-venda via WhatsApp.'
  const { data: existing, error: existingError } = await (input.supabase.from('post_sales_interactions') as any)
    .select('id')
    .eq('post_sales_id', input.postSalesId)
    .eq('tipo_contato', 'WhatsApp Automático')
    .eq('resumo', summary)
    .limit(1)
    .maybeSingle()

  if (existingError) throw existingError
  if (existing?.id) return

  const { error } = await (input.supabase.from('post_sales_interactions') as any).insert({
    tenant_id: input.followup.tenant_id,
    store_id: input.followup.store_id,
    post_sales_id: input.postSalesId,
    registrado_por_id: null,
    tipo_contato: 'WhatsApp Automático',
    resumo: summary,
  })
  if (error) throw error
}

function coveredServiceOrderIds(followup: Pick<FollowupRow, 'service_order_id' | 'covered_service_order_ids'>) {
  const ids = Array.isArray(followup.covered_service_order_ids) && followup.covered_service_order_ids.length > 0
    ? followup.covered_service_order_ids
    : [followup.service_order_id]
  return [...new Set(ids.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
}

async function ensureGroupPostSaleTrackings(followup: FollowupRow) {
  const postSalesIds: number[] = []
  for (const serviceOrderId of coveredServiceOrderIds(followup)) {
    const tracking = await ensurePostSaleTracking({
      tenantId: followup.tenant_id,
      storeId: followup.store_id,
      serviceOrderId,
      interactionSummary: 'Disparo automatico de pos-venda via WhatsApp.',
      skipInteraction: true,
    })
    postSalesIds.push(tracking.postSalesId)
  }
  return [...new Set(postSalesIds)]
}

async function finalizeSentFollowup(input: {
  supabase: ReturnType<typeof createAdminClient>
  followup: FollowupRow
  instanceKey: string
  postSalesId: number
  groupedPostSalesIds?: number[]
  sentAtIso: string
  fromStatuses?: Array<FollowupRow['status']>
}) {
  for (const postSalesId of [...new Set([input.postSalesId, ...(input.groupedPostSalesIds || [])])]) {
    await ensureSentInteraction({ supabase: input.supabase, followup: input.followup, postSalesId })
  }

  await markPostSaleConversationContext({
    channel: {
      id: input.followup.channel_id,
      tenant_id: input.followup.tenant_id,
      store_id: input.followup.store_id,
      instance_key: input.instanceKey,
      phone_number: '',
      is_active: true,
      connection_status: 'connected',
    },
    followupId: input.followup.id,
    postSalesId: input.postSalesId,
    serviceOrderId: input.followup.service_order_id,
    customerId: input.followup.customer_id,
    remotePhone: input.followup.remote_phone,
    sentAtIso: input.sentAtIso,
    deliveredAt: input.followup.delivered_at,
    messageText: input.followup.message_text,
  })

  let updateQuery = (input.supabase.from('whatsapp_post_sale_followups') as any)
    .update({
      status: 'sent',
      post_sales_id: input.postSalesId,
      sent_at: input.sentAtIso,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.followup.id)
  const fromStatuses = input.fromStatuses?.length ? input.fromStatuses : ['sending']
  updateQuery = fromStatuses.length === 1
    ? updateQuery.eq('status', fromStatuses[0])
    : updateQuery.in('status', fromStatuses)

  const { error } = await updateQuery

  if (error) throw error
}

async function recoverStaleSendingFollowups(now: Date) {
  const supabase = createAdminClient({ noStore: true })
  const cutoff = new Date(now.getTime() - STALE_SENDING_MS).toISOString()
  const { data, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, covered_service_order_ids, customer_id, post_sales_id, remote_phone, delivered_at, scheduled_for, status, message_text, outbound_message_id, payload, whatsapp_store_channels(instance_key), stores(settings)')
    .eq('status', 'sending')
    .lte('updated_at', cutoff)
    .limit(DEFAULT_DISPATCH_LIMIT * 10)

  if (error) throw error

  for (const followup of (data ?? []) as FollowupRow[]) {
    try {
    const { data: recoveryClaim, error: recoveryClaimError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({ updated_at: now.toISOString() })
      .eq('id', followup.id)
      .eq('status', 'sending')
      .lte('updated_at', cutoff)
      .select('id')
      .maybeSingle()
    if (recoveryClaimError) throw recoveryClaimError
    if (!recoveryClaim?.id) continue

    let outboundStatus: string | null = null
    let outboundSentAt: string | null = null
    let outboundErrorMessage: string | null = null

    if (followup.outbound_message_id) {
      const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
        .select('status, sent_at, error_message')
        .eq('id', followup.outbound_message_id)
        .maybeSingle()
      if (outboundError) throw outboundError
      outboundStatus = outbound?.status ?? null
      outboundSentAt = outbound?.sent_at ?? null
      outboundErrorMessage = outbound?.error_message ?? null
    }

    const recovery = decideStalePostSaleFollowupRecovery({
      outboundMessageId: followup.outbound_message_id,
      outboundStatus,
    })

    if (recovery === 'reschedule') {
      const { error: rescheduleError } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          status: 'scheduled',
          scheduled_for: nextPostSaleBusinessSlotForSettings(now, followup.stores?.settings).toISOString(),
          error_message: 'Claim anterior expirou antes da criacao do outbound; reagendado com seguranca.',
          updated_at: now.toISOString(),
        })
        .eq('id', followup.id)
        .eq('status', 'sending')
      if (rescheduleError) throw rescheduleError
      continue
    }

    if (recovery === 'finalize_sent') {
      const instanceKey = followup.whatsapp_store_channels?.instance_key
      if (!instanceKey) throw new Error(`Follow-up ${followup.id} sem instance_key durante recuperacao.`)
      const tracking = followup.post_sales_id
        ? { postSalesId: followup.post_sales_id }
        : await ensurePostSaleTracking({
            tenantId: followup.tenant_id,
            storeId: followup.store_id,
            serviceOrderId: followup.service_order_id,
            interactionSummary: 'Disparo automatico de pos-venda via WhatsApp.',
          skipInteraction: true,
        })
      const groupedPostSalesIds = await ensureGroupPostSaleTrackings(followup)
      await finalizeSentFollowup({
        supabase,
        followup,
        instanceKey,
        postSalesId: tracking.postSalesId,
        groupedPostSalesIds,
        sentAtIso: outboundSentAt || now.toISOString(),
      })
      continue
    }

    if (recovery === 'manual_review') {
      const { error: pendingError } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          error_message: `Estado de envio indeterminado (${outboundStatus || 'sem status'}); aguardando reconciliacao sem reenviar.`,
          updated_at: now.toISOString(),
        })
        .eq('id', followup.id)
        .eq('status', 'sending')
      if (pendingError) throw pendingError
      continue
    }

    const errorMessage = `Envio rejeitado pelo WhatsApp: ${outboundErrorMessage || 'sem detalhe do provedor.'}`
    const { error: failError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({ status: 'failed', error_message: errorMessage, updated_at: now.toISOString() })
      .eq('id', followup.id)
      .eq('status', 'sending')
    if (failError) throw failError
    } catch (recoveryError) {
      console.error(`[post-sale-followups] Falha ao recuperar followup ${followup.id}:`, recoveryError)
    }
  }
}

async function recoverFailedSentFollowups(now: Date) {
  const supabase = createAdminClient({ noStore: true })
  const { data, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, covered_service_order_ids, customer_id, post_sales_id, remote_phone, delivered_at, scheduled_for, status, message_text, outbound_message_id, payload, whatsapp_store_channels(instance_key), stores(settings)')
    .eq('status', 'failed')
    .not('outbound_message_id', 'is', null)
    .limit(DEFAULT_DISPATCH_LIMIT * 10)

  if (error) throw error

  for (const followup of (data ?? []) as FollowupRow[]) {
    try {
      if (!followup.outbound_message_id) continue

      const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
        .select('status, sent_at')
        .eq('id', followup.outbound_message_id)
        .maybeSingle()
      if (outboundError) throw outboundError
      if (outbound?.status !== 'sent') continue

      const instanceKey = followup.whatsapp_store_channels?.instance_key
      if (!instanceKey) throw new Error(`Follow-up ${followup.id} sem instance_key durante recuperacao de failed.`)
      const tracking = followup.post_sales_id
        ? { postSalesId: followup.post_sales_id }
        : await ensurePostSaleTracking({
            tenantId: followup.tenant_id,
            storeId: followup.store_id,
            serviceOrderId: followup.service_order_id,
            interactionSummary: 'Disparo automatico de pos-venda via WhatsApp.',
          skipInteraction: true,
        })
      const groupedPostSalesIds = await ensureGroupPostSaleTrackings(followup)

      await finalizeSentFollowup({
        supabase,
        followup: {
          ...followup,
          post_sales_id: tracking.postSalesId,
        },
        instanceKey,
        postSalesId: tracking.postSalesId,
        groupedPostSalesIds,
        sentAtIso: outbound.sent_at || now.toISOString(),
        fromStatuses: ['failed'],
      })
    } catch (recoveryError) {
      console.error(`[post-sale-followups] Falha ao reconciliar failed sent ${followup.id}:`, recoveryError)
    }
  }
}

async function dispatchScheduledFollowups(
  now: Date,
  limit = DEFAULT_DISPATCH_LIMIT,
  onlyFollowupId?: number
) {
  const supabase = createAdminClient({ noStore: true })
  let query = (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, covered_service_order_ids, customer_id, post_sales_id, remote_phone, delivered_at, scheduled_for, status, message_text, outbound_message_id, payload, whatsapp_store_channels(instance_key,is_active,connection_status), stores(settings)')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)
  if (onlyFollowupId !== undefined) query = query.eq('id', onlyFollowupId)

  const { data, error } = await query

  if (error) throw error

  let attempted = 0
  let sent = 0
  let failed = 0
  const reasons: Record<string, number> = {}
  const countReason = (reason: string) => { reasons[reason] = (reasons[reason] || 0) + 1 }

  const markFailed = async (followupId: number, message: string) => {
    const { error: updateError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({
        status: 'failed',
        error_message: message,
        updated_at: new Date().toISOString(),
      })
      .eq('id', followupId)
      .eq('status', 'sending')
    if (updateError) throw updateError
    failed += 1
    countReason('failed')
  }

  const markCancelled = async (followupId: number, message: string) => {
    countReason('cancelled')
    const { error: updateError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({ status: 'cancelled', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', followupId)
      .eq('status', 'sending')
    if (updateError) throw updateError
  }

  for (const followup of (data ?? []) as FollowupRow[]) {
    const payload = followup.payload && typeof followup.payload === 'object' && !Array.isArray(followup.payload)
      ? followup.payload as Record<string, Json>
      : null
    const isScopedStoreOneTest = canBypassPostSaleBusinessHoursForTest({
      followupId: followup.id,
      targetFollowupId: onlyFollowupId,
      storeId: followup.store_id,
      manualTestMarker: typeof payload?.manualTest === 'string' ? payload.manualTest : null,
    })

    if (!isPostSaleBusinessTime(now, followup.stores?.settings) && !isScopedStoreOneTest) {
      countReason('outside_business_hours')
      const { error: rescheduleError } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          scheduled_for: nextPostSaleBusinessSlotForSettings(now, followup.stores?.settings).toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', followup.id)
        .eq('status', 'scheduled')
      if (rescheduleError) console.error(`[post-sale-followups] Falha ao reagendar followup ${followup.id} fora do horario da loja:`, rescheduleError)
      continue
    }

    if (!isScopedStoreOneTest) {
      const { data: allowed, error: cadenceError } = await (supabase as any).rpc('claim_whatsapp_post_sale_dispatch')
      if (cadenceError) throw cadenceError
      if (!allowed) { countReason('dispatch_slot_already_used'); break }
    }

    // Claim atômico: erro transiente não derruba o lote inteiro.
    let claimedId: number | null = null
    try {
      const { data: claimed, error: claimError } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          status: 'sending',
          updated_at: new Date().toISOString(),
          error_message: null,
        })
        .eq('id', followup.id)
        .eq('status', 'scheduled')
        .select('id')
        .maybeSingle()

      if (claimError) throw claimError
      claimedId = claimed?.id ?? null
    } catch (claimErr) {
      console.error(`[post-sale-followups] Erro no claim do followup ${followup.id}:`, claimErr)
      continue
    }

    if (!claimedId) continue
    attempted += 1
    let deliveryAttempted = false
    let deliveryAccepted = false

    // Antes do envio, erros encerram o item. Depois da tentativa, o estado fica
    // disponivel para reconciliacao, evitando reenviar uma mensagem ambigua.
    try {
      if (!followupEnabledFromStoreSettings(followup.stores?.settings)) {
        countReason('automation_disabled')
        await markCancelled(followup.id, 'Automacao de pos-venda desativada antes do envio.')
        continue
      }

      if (await hasActiveHumanBlock(followup.channel_id, followup.remote_phone)) {
        countReason('human_control')
        const { error: pauseError } = await (supabase.from('whatsapp_post_sale_followups') as any)
          .update({ status: 'scheduled', scheduled_for: nextPostSaleBusinessSlotForSettings(new Date(now.getTime() + 30 * 60_000), followup.stores?.settings).toISOString(), error_message: 'Aguardando liberacao do atendimento humano.', updated_at: now.toISOString() })
          .eq('id', followup.id).eq('status', 'sending')
        if (pauseError) throw pauseError
        continue
      }

      if (await isPostSaleFollowupOptedOut(followup.store_id, followup.remote_phone)) {
        countReason('opt_out')
        await markCancelled(followup.id, 'Cliente não recebe acompanhamentos automáticos de pós-venda por WhatsApp.')
        continue
      }

      const { data: currentPostSale, error: currentPostSaleError } = await (supabase.from('post_sales') as any)
        .select('id, status')
        .eq('service_order_id', followup.service_order_id)
        .eq('store_id', followup.store_id)
        .eq('tenant_id', followup.tenant_id)
        .maybeSingle()
      if (currentPostSaleError) throw currentPostSaleError
      if ((currentPostSale?.status === 'Concluido' || (currentPostSale && await postSaleHasContact(currentPostSale.id))) && !isScopedStoreOneTest) {
        countReason(currentPostSale.status === 'Concluido' ? 'completed' : 'existing_contact')
        await markCancelled(followup.id, `Fluxo cancelado porque o pos-venda ja esta ${currentPostSale.status}.`)
        continue
      }

      if (!followup.whatsapp_store_channels?.is_active || followup.whatsapp_store_channels.connection_status !== 'connected') {
        countReason('channel_unavailable')
        await markFailed(followup.id, 'Canal WhatsApp desconectado ou desativado antes do envio.')
        continue
      }
      if (!isScopedStoreOneTest) {
        const coveredIds = followup.covered_service_order_ids?.length ? followup.covered_service_order_ids : [followup.service_order_id]
        const { data: currentOrders, error: ordersError } = await (supabase.from('service_orders') as any)
          .select('id,dt_entregue_em,vendas(status),post_sales(id,status)')
          .eq('store_id', followup.store_id).eq('tenant_id', followup.tenant_id).in('id', coveredIds)
        if (ordersError) throw ordersError
        let blocked = currentOrders?.length !== coveredIds.length
        for (const order of currentOrders || []) {
          if (!order.dt_entregue_em || ['Cancelada', 'Devolvida'].includes(order.vendas?.status)) blocked = true
          for (const postSale of order.post_sales || []) {
            if (postSale.status === 'Concluido' || await postSaleHasContact(postSale.id)) blocked = true
          }
        }
        if (blocked) {
          countReason('group_no_longer_eligible')
          await markCancelled(followup.id, 'Elegibilidade das OS agrupadas mudou antes do primeiro contato.')
          continue
        }
      }

      const instanceKey = followup.whatsapp_store_channels?.instance_key
      if (!instanceKey) {
        countReason('channel_missing_instance')
        await markFailed(followup.id, 'Canal WhatsApp sem instance_key.')
        continue
      }

      // Tracking (garante post_sales) só após validar gates. A interacao de
      // "Disparo" so e registrada apos o envio efetivo (ver abaixo).
      const tracking = await ensurePostSaleTracking({
        tenantId: followup.tenant_id,
        storeId: followup.store_id,
        serviceOrderId: followup.service_order_id,
        interactionSummary: 'Disparo automatico de pos-venda via WhatsApp.',
        skipInteraction: true,
      })
      const groupedPostSalesIds = await ensureGroupPostSaleTrackings(followup)

      const outboundPayload = {
        followupId: followup.id,
        serviceOrderId: followup.service_order_id,
        customerId: followup.customer_id,
        postSalesId: tracking.postSalesId,
        ...buildWhatsAppCanonicalPayload({
          intent: 'post_sale_positive',
          action: 'post_sale_followup_sent',
          outboundType: 'post_sale_followup',
          canonicalReply: followup.message_text,
          facts: {
            followupId: followup.id,
            postSalesId: tracking.postSalesId,
            serviceOrderId: followup.service_order_id,
            customerId: followup.customer_id,
          },
        }),
      }

      const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
        .insert({
          tenant_id: followup.tenant_id,
          store_id: followup.store_id,
          channel_id: followup.channel_id,
          inbound_message_id: null,
          remote_phone: followup.remote_phone,
          message_text: followup.message_text,
          message_type: 'post_sale_followup',
          status: 'pending',
          payload: outboundPayload,
        })
        .select('id')
        .single()

      if (outboundError) throw outboundError

      const { error: linkError } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          post_sales_id: tracking.postSalesId,
          outbound_message_id: outbound.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', followup.id)
        .eq('status', 'sending')
      if (linkError) throw linkError

      // Envio de fato - falha aqui marca failed (o outbound pending permanece p/ auditoria).
      try {
        deliveryAttempted = true
        const sendResult = await automationSendRequest({
          instanceKey,
          phone: followup.remote_phone,
          text: followup.message_text,
          outboundMessageId: outbound.id,
        })
        deliveryAccepted = true
        const directSentAt = new Date().toISOString()
        const { error: directDeliveryError } = await (supabase.from('whatsapp_outbound_messages') as any)
          .update({
            status: 'sent',
            ...(sendResult?.providerMessageId ? { provider_message_id: sendResult.providerMessageId } : {}),
            error_message: null,
            sent_at: directSentAt,
          })
          .eq('id', outbound.id)
        if (directDeliveryError) throw directDeliveryError
      } catch (sendError) {
        if (deliveryAccepted) throw sendError
        const { data: delivery, error: deliveryError } = await (supabase.from('whatsapp_outbound_messages') as any)
          .select('status, sent_at, error_message')
          .eq('id', outbound.id)
          .maybeSingle()
        if (deliveryError) throw deliveryError

        if (delivery?.status === 'sent') {
          deliveryAccepted = true
        } else if (delivery?.status === 'failed') {
          await markFailed(
            followup.id,
            `Falha no envio WhatsApp: ${delivery.error_message || (sendError instanceof Error ? sendError.message : String(sendError))}`
          )
          continue
        } else {
          const errorMessage = sendError instanceof Error ? sendError.message : String(sendError)
          const { error: uncertainError } = await (supabase.from('whatsapp_post_sale_followups') as any)
            .update({
              error_message: `Resultado do envio indeterminado; aguardando reconciliacao sem reenviar: ${errorMessage}`,
              updated_at: new Date().toISOString(),
            })
            .eq('id', followup.id)
            .eq('status', 'sending')
          if (uncertainError) throw uncertainError
          continue
        }
      }

      deliveryAccepted = true
      const { data: confirmedDelivery, error: confirmedDeliveryError } = await (supabase.from('whatsapp_outbound_messages') as any)
        .select('sent_at')
        .eq('id', outbound.id)
        .maybeSingle()
      if (confirmedDeliveryError) throw confirmedDeliveryError

      await finalizeSentFollowup({
        supabase,
        followup: {
          ...followup,
          post_sales_id: tracking.postSalesId,
          outbound_message_id: outbound.id,
        },
        instanceKey,
        postSalesId: tracking.postSalesId,
        groupedPostSalesIds,
        sentAtIso: confirmedDelivery?.sent_at || new Date().toISOString(),
      })

      sent += 1
    } catch (stepError) {
      const errorMessage = stepError instanceof Error ? stepError.message : String(stepError)
      console.error(`[post-sale-followups] Erro no processamento do followup ${followup.id}:`, stepError)
      if (deliveryAccepted || deliveryAttempted) {
        countReason('awaiting_reconciliation')
        const recoveryMessage = deliveryAccepted
          ? `Mensagem enviada; finalizacao pendente de reconciliacao: ${errorMessage}`
          : `Tentativa de envio com resultado indeterminado; reconciliacao obrigatoria: ${errorMessage}`
        const { error: recoveryError } = await (supabase.from('whatsapp_post_sale_followups') as any)
          .update({
            error_message: recoveryMessage,
            updated_at: new Date().toISOString(),
          })
          .eq('id', followup.id)
          .eq('status', 'sending')
        if (recoveryError) console.error(`[post-sale-followups] Falha ao registrar reconciliacao ${followup.id}:`, recoveryError)
      } else {
        try {
          await markFailed(followup.id, `Erro antes do envio: ${errorMessage}`)
        } catch (markError) {
          console.error(`[post-sale-followups] Falha ao marcar followup ${followup.id} como failed:`, markError)
        }
      }
    }
  }

  return {
    attempted,
    sent,
    failed,
    reasons,
  }
}

export type StoreOnePostSaleTestResult =
  | { outcome: 'accepted'; providerMessageId: string | null; providerStatus: string | null }
  | { outcome: 'not_sent'; reason: string }

/**
 * One-off, tightly scoped test trigger. It deliberately does not call the
 * global scheduler/job and dispatches only the follow-up row created here.
 */
export async function triggerStoreOnePostSaleFollowupTest(input: {
  protocol: string
  expectedRecipient: string
}): Promise<StoreOnePostSaleTestResult> {
  if (!isStoreOnePostSaleTestProtocol(input.protocol)) {
    return { outcome: 'not_sent', reason: 'protocol_not_allowed' }
  }

  const expectedRecipient = toEvolutionNumber(input.expectedRecipient)
  if (!expectedRecipient) return { outcome: 'not_sent', reason: 'invalid_recipient' }

  const supabase = createAdminClient({ noStore: true })
  const { data: orders, error: ordersError } = await (supabase.from('service_orders') as any)
    .select(`
      id, tenant_id, store_id, customer_id, dependente_id, dt_entregue_em, protocolo_fisico,
      customers ( id, full_name, phone, fone_movel ),
      dependentes ( id, full_name ),
      post_sales ( id, status ),
      vendas ( id, status )
    `)
    .eq('store_id', 1)
    .not('protocolo_fisico', 'is', null)
    .ilike('protocolo_fisico', '%1043%')
    .limit(10)
  if (ordersError) throw ordersError

  const matchingOrders = ((orders ?? []) as EligibleServiceOrderRow[])
    .filter((order) => digitsOnly(order.protocolo_fisico) === '1043')
  if (matchingOrders.length === 0) return { outcome: 'not_sent', reason: 'order_not_found' }
  if (matchingOrders.length !== 1) return { outcome: 'not_sent', reason: 'order_ambiguous' }

  const order = matchingOrders[0]
  const { data: channels, error: channelsError } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id, tenant_id, store_id, instance_key, phone_number, is_active, connection_status, stores(settings)')
    .eq('store_id', 1)
    .eq('provider', 'evolution')
    .eq('is_active', true)
    .eq('connection_status', 'connected')
  if (channelsError) throw channelsError
  if ((channels ?? []).length !== 1) return { outcome: 'not_sent', reason: 'channel_unavailable_or_ambiguous' }

  const channel = channels[0] as ChannelRow
  const settings = followupSettingsFromChannel(channel)
  if (!settings) return { outcome: 'not_sent', reason: 'followup_disabled' }
  if (channel.tenant_id !== order.tenant_id || order.store_id !== 1) {
    return { outcome: 'not_sent', reason: 'tenant_mismatch' }
  }

  const phone = toEvolutionNumber(order.customers?.fone_movel || order.customers?.phone)
  if (!phone || !phonesMatch(phone, expectedRecipient)) {
    return { outcome: 'not_sent', reason: 'recipient_mismatch' }
  }

  const deliveredAt = String(order.dt_entregue_em || '')
  const deliveredMs = new Date(deliveredAt).getTime()
  const ageDays = Number.isFinite(deliveredMs)
    ? Math.floor((Date.now() - deliveredMs) / 86_400_000)
    : -1
  const eligibleDeliveryDate = daysAgoDateString(new Date(), settings.days_after_delivery)
  if (!deliveredAt || !Number.isFinite(deliveredMs) || deliveredAt.slice(0, 10) > eligibleDeliveryDate) {
    return { outcome: 'not_sent', reason: 'delivery_not_old_enough' }
  }

  const saleStatus = order.vendas?.status || null
  if (saleStatus === 'Devolvida' || saleStatus === 'Cancelada') {
    return { outcome: 'not_sent', reason: 'sale_ineligible' }
  }

  const postSales = order.post_sales ?? []
  if (postSales.length > 1) return { outcome: 'not_sent', reason: 'post_sale_ambiguous' }
  const postSale = postSales[0]

  const now = new Date()
  if (await hasActiveHumanBlock(channel.id, phone)) {
    return { outcome: 'not_sent', reason: 'human_control_active' }
  }
  if (await isPostSaleFollowupOptedOut(1, phone)) {
    return { outcome: 'not_sent', reason: 'recipient_opted_out' }
  }

  const { data: existingCoverage, error: coverageError } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id,status,payload,service_order_id,covered_service_order_ids,remote_phone')
    .eq('store_id', 1)
    .overlaps('covered_service_order_ids', [order.id])
    .limit(1)
  if (coverageError) throw coverageError

  const existingFollowup = existingCoverage?.[0] as {
    id: number
    status: string
    payload: Json | null
    service_order_id: number | null
    covered_service_order_ids: number[] | null
    remote_phone: string | null
  } | undefined
  const existingPayload = existingFollowup?.payload
    && typeof existingFollowup.payload === 'object'
    && !Array.isArray(existingFollowup.payload)
    ? existingFollowup.payload as Record<string, Json>
    : {}
  const reusableTestFollowup = existingFollowup && canReuseStoreOnePostSaleTestFollowup({
    protocol: input.protocol,
    storeId: 1,
    status: existingFollowup.status,
    serviceOrderId: existingFollowup.service_order_id,
    expectedServiceOrderId: order.id,
    coveredServiceOrderIds: existingFollowup.covered_service_order_ids,
    remotePhoneMatches: Boolean(existingFollowup.remote_phone && phonesMatch(existingFollowup.remote_phone, phone)),
  })

  if (existingFollowup?.status === 'sending') {
    return { outcome: 'not_sent', reason: 'sending' }
  }
  if (existingFollowup && !reusableTestFollowup) {
    return { outcome: 'not_sent', reason: 'followup_already_exists' }
  }
  const customerName = order.customers?.full_name || 'Cliente'
  const messageText = buildPostSaleFollowupMessage({
    template: settings.template,
    customerName,
    dependentName: order.dependentes?.full_name ?? null,
    daysSinceDelivery: Math.max(1, ageDays),
  })
  const deliveredDate = deliveredAt.slice(0, 10)
  const nowIso = now.toISOString()
  const manualTestPayload = {
    ...existingPayload,
    deliveryDate: deliveredDate,
    daysSinceDelivery: Math.max(1, ageDays),
    groupedServiceOrderIds: [order.id],
    groupedServiceOrderCount: 1,
    groupedBeneficiary: order.dependente_id
      ? { type: 'dependent', id: order.dependente_id, name: order.dependentes?.full_name ?? null }
      : { type: 'customer', id: order.customer_id, name: customerName },
    manualTest: STORE_ONE_POST_SALE_TEST_MARKER,
  }

  let followupId: number
  if (existingFollowup && reusableTestFollowup) {
    const { data: resetFollowup, error: resetError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({
        status: 'scheduled',
        scheduled_for: new Date(now.getTime() - 1_000).toISOString(),
        message_text: messageText,
        payload: manualTestPayload,
        error_message: null,
        sent_at: null,
        updated_at: nowIso,
      })
      .eq('id', existingFollowup.id)
      .eq('status', existingFollowup.status)
      .select('id')
      .maybeSingle()
    if (resetError) throw resetError
    if (!resetFollowup?.id) return { outcome: 'not_sent', reason: 'sending' }
    followupId = Number(resetFollowup.id)
  } else {
    const { data: insertedFollowup, error: insertError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .insert({
        tenant_id: order.tenant_id,
        store_id: 1,
        channel_id: channel.id,
        service_order_id: order.id,
        covered_service_order_ids: [order.id],
        customer_id: order.customer_id,
        post_sales_id: postSale?.id ?? null,
        remote_phone: phone,
        delivered_at: deliveredDate,
        scheduled_for: new Date(now.getTime() - 1_000).toISOString(),
        status: 'scheduled',
        message_text: messageText,
        payload: manualTestPayload,
      })
      .select('id')
      .single()

    if (insertError?.code === '23505') return { outcome: 'not_sent', reason: 'followup_already_exists' }
    if (insertError) throw insertError
    followupId = Number(insertedFollowup.id)
  }

  await dispatchScheduledFollowups(now, 1, followupId)

  const { data: finalFollowup, error: finalFollowupError } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('status,outbound_message_id')
    .eq('id', followupId)
    .maybeSingle()
  if (finalFollowupError) throw finalFollowupError

  if (finalFollowup?.status !== 'sent' || !finalFollowup.outbound_message_id) {
    return { outcome: 'not_sent', reason: finalFollowup?.status || 'delivery_pending_review' }
  }

  const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
    .select('provider_message_id,payload')
    .eq('id', finalFollowup.outbound_message_id)
    .maybeSingle()
  if (outboundError) throw outboundError

  const outboundPayload = outbound?.payload
    && typeof outbound.payload === 'object'
    && !Array.isArray(outbound.payload)
    ? outbound.payload as Record<string, Json>
    : {}
  const providerDelivery = outboundPayload.delivery
    && typeof outboundPayload.delivery === 'object'
    && !Array.isArray(outboundPayload.delivery)
    ? outboundPayload.delivery as Record<string, Json>
    : {}
  const providerStatus = typeof providerDelivery.status === 'string' ? providerDelivery.status : null
  const providerMessageId = typeof outbound?.provider_message_id === 'string' ? outbound.provider_message_id : null

  console.info('[post-sale-followups:test-send]', JSON.stringify({
    followupId,
    outboundMessageId: finalFollowup.outbound_message_id,
    providerMessageId,
    providerStatus,
    followupStatus: finalFollowup.status,
  }))

  return { outcome: 'accepted', providerMessageId, providerStatus }
}

export type ManualPostSaleRequeueResult = {
  requeuedFailures: number
  scheduledMissingAttempts: number
  skipped: number
}

export async function requeuePostSalesForDailyHealth(storeId: number): Promise<ManualPostSaleRequeueResult> {
  const supabase = createAdminClient({ noStore: true })
  const channel = (await loadActiveChannels()).find((c) => c.store_id === storeId && followupSettingsFromChannel(c))
  if (!channel) throw new Error('Nao ha um canal de WhatsApp conectado com o pos-venda automatico habilitado.')
  const { data: runId, error } = await (supabase as any).rpc('begin_whatsapp_post_sale_job')
  if (error) throw error
  if (!runId) throw new Error('O job de pos-venda esta em andamento. Aguarde a conclusao.')
  try {
    const now = new Date()
    const requeuedFailures = await requeueSafeRecentFailures(now, storeId)
    const selection = await scheduleFollowups(now, false, storeId)
    const result = { requeuedFailures, scheduledMissingAttempts: selection.scheduled, skipped: Object.values(selection.reasons).reduce((sum, count) => sum + count, 0) }
    const { error: auditError } = await (supabase.from('whatsapp_post_sale_job_runs') as any)
      .update({ status: 'completed', finished_at: new Date().toISOString(), result: { manualRequeue: true, storeId, ...result, selection } }).eq('id', runId)
    if (auditError) throw auditError
    return result
  } catch (error) {
    await (supabase.from('whatsapp_post_sale_job_runs') as any)
      .update({ status: 'failed', finished_at: new Date().toISOString(), error_code: 'manual_requeue_error' }).eq('id', runId)
    throw error
  }
}

async function requeueSafeRecentFailures(now: Date, onlyStoreId?: number, dryRun = false) {
  const supabase = createAdminClient({ noStore: true })
  const channels = await loadActiveChannels()
  let query = (supabase.from('whatsapp_post_sale_followups') as any)
    .select('*').eq('status', 'failed').gte('delivered_at', daysAgoDateString(now, 30))
  if (onlyStoreId !== undefined) query = query.eq('store_id', onlyStoreId)
  const { data: failures, error } = await query
  if (error) throw error
  let requeued = 0
  for (const followup of (failures || []) as FollowupRow[]) {
    const channel = channels.find((c) => c.id === followup.channel_id)
    if (!channel) continue
    const settings = followupSettingsFromChannel(channel)
    if (!settings || followup.delivered_at > daysAgoDateString(now, settings.days_after_delivery)) continue
    if (!/^\d{10,15}$/.test(followup.remote_phone)) continue
    const payload = followup.payload && typeof followup.payload === 'object' && !Array.isArray(followup.payload) ? followup.payload : {}
    if (Number(payload.recoveryAttempts || 0) >= 2 || payload.manualTest) continue
    if (followup.outbound_message_id) {
      const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
        .select('status,sent_at,provider_message_id').eq('id', followup.outbound_message_id).maybeSingle()
      if (outboundError) throw outboundError
      // Pending e resultado desconhecido exigem reconciliacao, nunca reenvio.
      if (!outbound || outbound.status !== 'failed' || outbound.sent_at || outbound.provider_message_id) continue
    }
    if (await isPostSaleFollowupOptedOut(followup.store_id, followup.remote_phone) || await hasActiveHumanBlock(followup.channel_id, followup.remote_phone)) continue
    const { data: postSales, error: postSalesError } = await (supabase.from('post_sales') as any)
      .select('id,status').eq('store_id', followup.store_id).in('service_order_id', followup.covered_service_order_ids)
    if (postSalesError) throw postSalesError
    let contacted = false
    for (const p of postSales || []) if (p.status === 'Concluido' || await postSaleHasContact(p.id)) contacted = true
    if (contacted) continue
    const { data: orders, error: ordersError } = await (supabase.from('service_orders') as any)
      .select('id,dt_entregue_em,vendas(status)').eq('store_id', followup.store_id).eq('tenant_id', followup.tenant_id).in('id', followup.covered_service_order_ids)
    if (ordersError) throw ordersError
    if (orders?.length !== followup.covered_service_order_ids.length || orders.some((order: any) => !order.dt_entregue_em || ['Cancelada', 'Devolvida'].includes(order.vendas?.status))) continue
    if (dryRun) { requeued += 1; continue }
    const scheduledFor = await nextAvailablePostSaleSlot(channel, now)
    const { data: updated, error: updateError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({ status: 'scheduled', scheduled_for: scheduledFor.toISOString(), payload: { ...payload, recoveryAttempts: Number(payload.recoveryAttempts || 0) + 1, recoveryAt: now.toISOString() }, updated_at: now.toISOString() })
      .eq('id', followup.id).eq('status', 'failed').select('id').maybeSingle()
    if (updateError) throw updateError
    if (updated) requeued += 1
  }
  return requeued
}

export type PostSaleFollowupJobResult = {
  ok: true
  scheduled: number
  alreadyScheduled: number
  runId?: string
  dryRun?: boolean
  skippedConcurrentRun?: boolean
  selection?: { examined: number; eligibleGroups: number; reasons: Record<string, number> }
  recovery?: { eligibleFailures?: number; requeuedFailures: number }
  dispatch: {
    attempted: number
    sent: number
    failed: number
    reasons?: Record<string, number>
  }
  deadlineClosures: {
    closedWith3: number
    closedWith4: number
    keptHuman: number
  }
}

export async function runPostSaleFollowupJob(options: { dryRun?: boolean } = {}): Promise<PostSaleFollowupJobResult> {
  const now = new Date()
  const supabase = createAdminClient({ noStore: true })
  const emptyResult: PostSaleFollowupJobResult = { ok: true, scheduled: 0, alreadyScheduled: 0, dispatch: { attempted: 0, sent: 0, failed: 0 }, deadlineClosures: { closedWith3: 0, closedWith4: 0, keptHuman: 0 } }
  if (options.dryRun) {
    const selection = await scheduleFollowups(now, true)
    const eligibleFailures = await requeueSafeRecentFailures(now, undefined, true)
    return { ...emptyResult, dryRun: true, selection, recovery: { eligibleFailures, requeuedFailures: 0 } }
  }
  const { data: runId, error: leaseError } = await (supabase as any).rpc('begin_whatsapp_post_sale_job')
  if (leaseError) throw leaseError
  if (!runId) {
    const result = { ...emptyResult, skippedConcurrentRun: true }
    const { data: skipped, error: auditError } = await (supabase.from('whatsapp_post_sale_job_runs') as any)
      .insert({ status: 'completed', finished_at: now.toISOString(), result }).select('id').single()
    if (auditError) throw auditError
    return { ...result, runId: skipped.id }
  }
  try {
    await recoverStaleSendingFollowups(now)
    await recoverFailedSentFollowups(now)
    const requeuedFailures = await requeueSafeRecentFailures(now)
    const deadlineClosures = await closeExpiredPostSaleFollowups(now)
    const scheduleResult = await scheduleFollowups(now)
    const dispatchResult = await dispatchScheduledFollowups(now)

    const result: PostSaleFollowupJobResult = {
      ok: true,
      scheduled: scheduleResult.scheduled,
      alreadyScheduled: scheduleResult.alreadyScheduled,
      dispatch: dispatchResult,
      deadlineClosures,
      runId,
      selection: { examined: scheduleResult.examined, eligibleGroups: scheduleResult.eligibleGroups, reasons: scheduleResult.reasons },
      recovery: { requeuedFailures },
    }
    const { error: auditError } = await (supabase.from('whatsapp_post_sale_job_runs') as any)
      .update({ status: 'completed', finished_at: new Date().toISOString(), result }).eq('id', runId)
    if (auditError) throw auditError
    return result
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : 'job_error'
    await (supabase.from('whatsapp_post_sale_job_runs') as any)
      .update({ status: 'failed', finished_at: new Date().toISOString(), error_code: code }).eq('id', runId)
    throw error
  }
}
