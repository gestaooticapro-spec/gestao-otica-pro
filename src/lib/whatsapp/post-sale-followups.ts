/* eslint-disable @typescript-eslint/no-explicit-any */

import { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreModules, StoreSettings } from '@/lib/store-modules'
import { toEvolutionNumber } from '@/lib/whatsapp/phone'
import { buildWhatsAppCanonicalPayload } from '@/lib/whatsapp/canonical'
import { evaluateStoreHours } from '@/lib/whatsapp/store-hours-logic'
import {
  buildPostSaleFollowupMessage,
  buildPostSaleFollowupSettings,
  decidePostSaleDeadlineOutcome,
  decideStalePostSaleFollowupRecovery,
  DEFAULT_POST_SALE_FOLLOWUP_DAYS,
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
  dt_entregue_em: string
  customers?: {
    id: number
    full_name: string
    phone: string | null
    fone_movel: string | null
  } | null
  dependentes?: {
    full_name: string | null
  } | null
  post_sales?: Array<{
    id: number
    status: string
  }> | null
  vendas?: {
    status: string | null
  } | null
}

type FollowupRow = {
  id: number
  tenant_id: string
  store_id: number
  channel_id: number
  service_order_id: number
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
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_store_channels') as any)
    .select('id, tenant_id, store_id, instance_key, phone_number, is_active, connection_status, stores(settings)')
    .eq('provider', 'evolution')
    .eq('is_active', true)
    .eq('connection_status', 'connected')

  if (error) throw error
  return (data ?? []) as ChannelRow[]
}

async function loadEligibleServiceOrders(storeId: number, deliveredUntil: string) {
  const supabase = createAdminClient()
  const deliveredBefore = `${deliveredUntil}T23:59:59.999Z`
  const { data, error } = await (supabase.from('service_orders') as any)
    .select(`
      id,
      tenant_id,
      store_id,
      customer_id,
      dt_entregue_em,
      customers ( id, full_name, phone, fone_movel ),
      dependentes ( full_name ),
      post_sales ( id, status ),
      vendas ( status )
    `)
    .eq('store_id', storeId)
    .not('dt_entregue_em', 'is', null)
    .lte('dt_entregue_em', deliveredBefore)
    .order('dt_entregue_em', { ascending: true })

  if (error) throw error
  return (data ?? []) as EligibleServiceOrderRow[]
}

async function hasActiveHumanBlock(channelId: number, phone: string) {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const [stateResult, controlResult] = await Promise.all([
    (supabase.from('whatsapp_conversation_states') as any)
      .select('id')
      .eq('channel_id', channelId)
      .eq('remote_phone', phone)
      .in('state', ['human_pause', 'waiting_human_after_attachment'])
      .gt('expires_at', nowIso)
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

  return Boolean(stateResult.data?.id || controlResult.data?.id)
}

async function closeExpiredPostSaleFollowups(now: Date) {
  const supabase = createAdminClient()
  const deadlineIso = new Date(now.getTime() - POST_SALE_CONTEXT_MS).toISOString()
  const { data: followups, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, remote_phone, post_sales_id, sent_at')
    .eq('status', 'sent')
    .not('post_sales_id', 'is', null)
    .not('sent_at', 'is', null)
    .lte('sent_at', deadlineIso)

  if (error) throw error

  let closedWith3 = 0
  let closedWith4 = 0
  let keptHuman = 0

  for (const followup of (followups ?? []) as Array<Pick<FollowupRow, 'id' | 'tenant_id' | 'store_id' | 'channel_id' | 'remote_phone' | 'post_sales_id' | 'sent_at'>>) {
    const postSalesId = Number(followup.post_sales_id || 0)
    if (!postSalesId) continue

    if (await hasActiveHumanBlock(followup.channel_id, followup.remote_phone)) {
      keptHuman += 1
      continue
    }

    const [{ data: postSale, error: postSaleError }, { data: interactions, error: interactionsError }] = await Promise.all([
      (supabase.from('post_sales') as any)
        .select('id, status')
        .eq('id', postSalesId)
        .eq('tenant_id', followup.tenant_id)
        .eq('store_id', followup.store_id)
        .maybeSingle(),
      (supabase.from('post_sales_interactions') as any)
        .select('resumo')
        .eq('post_sales_id', postSalesId),
    ])
    if (postSaleError) throw postSaleError
    if (interactionsError) throw interactionsError
    if (!postSale?.id || postSale.status !== 'Em Acompanhamento') continue

    const outcome = decidePostSaleDeadlineOutcome((interactions ?? []).map((interaction: { resumo?: string | null }) => interaction.resumo))
    if (outcome === 'keep_human') {
      keptHuman += 1
      continue
    }

    const rating = outcome === 'auto_score_4' ? 4 : 3
    const finalObservation = rating === 4
      ? 'Nota 4 atribuída automaticamente: cliente respondeu positivamente ao pós-venda via WhatsApp, mas não informou uma nota numérica em 7 dias.'
      : 'Sem resposta ao pós-venda via WhatsApp.'

    const closed = await concludePostSaleAutomatically({
      tenantId: followup.tenant_id,
      storeId: followup.store_id,
      postSalesId,
      rating,
      finalObservation,
    })
    if (closed) {
      if (rating === 4) closedWith4 += 1
      else closedWith3 += 1
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
  const supabase = createAdminClient()
  const payload = {
    tenant_id: input.channel.tenant_id,
    store_id: input.channel.store_id,
    channel_id: input.channel.id,
    remote_phone: input.remotePhone,
    state: 'ai_session',
    expires_at: reminderExpiresAt(POST_SALE_CONTEXT_MS),
    updated_at: input.sentAtIso,
    metadata: {
      reason: 'post_sale_followup_sent',
      lastAction: 'post_sale_followup_sent',
      lastOutboundType: 'post_sale_followup',
      lastDecisionAt: input.sentAtIso,
      lastKnownCustomerId: input.customerId,
      lastKnownServiceOrderId: input.serviceOrderId,
      postSaleContext: {
        followupId: input.followupId,
        postSalesId: input.postSalesId,
        serviceOrderId: input.serviceOrderId,
        customerId: input.customerId,
        deliveryDate: input.deliveredAt,
        stage: 'awaiting_feedback',
        ratingPromptCount: 0,
      },
      aiSessionMessages: [
        {
          role: 'assistant',
          text: input.messageText,
          at: input.sentAtIso,
        },
      ],
      aiSessionUpdatedAt: input.sentAtIso,
    },
  }

  const { error } = await (supabase.from('whatsapp_conversation_states') as any)
    .upsert(payload, { onConflict: 'channel_id,remote_phone' })

  if (error) throw error
}

async function scheduleFollowups(now: Date) {
  const supabase = createAdminClient()
  const channels = await loadActiveChannels()
  let scheduled = 0
  let alreadyScheduled = 0

  for (const channel of channels) {
    const settings = followupSettingsFromChannel(channel)
    if (!settings) continue
    const firstSlot = nextPostSaleBusinessSlotForSettings(now, channel.stores?.settings)

    const deliveredUntil = daysAgoDateString(now, settings.days_after_delivery || DEFAULT_POST_SALE_FOLLOWUP_DAYS)
    const serviceOrders = await loadEligibleServiceOrders(channel.store_id, deliveredUntil)
    let channelSequence = 0

    for (const serviceOrder of serviceOrders) {
      const postSale = serviceOrder.post_sales?.[0]
      const saleStatus = serviceOrder.vendas?.status || null
      if (saleStatus === 'Devolvida' || saleStatus === 'Cancelada') continue
      if (postSale?.status === 'Concluido' || postSale?.status === 'Em Acompanhamento') continue

      const customerName = serviceOrder.customers?.full_name || 'Cliente'
      const phone = toEvolutionNumber(serviceOrder.customers?.fone_movel || serviceOrder.customers?.phone)
      if (!phone) continue

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
      })

      const scheduledFor = addPostSaleSlots(firstSlot, channelSequence, channel.stores?.settings)
      const { error } = await (supabase.from('whatsapp_post_sale_followups') as any)
        .insert({
          tenant_id: serviceOrder.tenant_id,
          store_id: channel.store_id,
          channel_id: channel.id,
          service_order_id: serviceOrder.id,
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

  return { scheduled, alreadyScheduled }
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

async function finalizeSentFollowup(input: {
  supabase: ReturnType<typeof createAdminClient>
  followup: FollowupRow
  instanceKey: string
  postSalesId: number
  sentAtIso: string
  fromStatuses?: Array<FollowupRow['status']>
}) {
  await ensureSentInteraction({
    supabase: input.supabase,
    followup: input.followup,
    postSalesId: input.postSalesId,
  })

  const humanBlockActive = await hasActiveHumanBlock(input.followup.channel_id, input.followup.remote_phone)
  if (!humanBlockActive) {
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
  }

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
  const supabase = createAdminClient()
  const cutoff = new Date(now.getTime() - STALE_SENDING_MS).toISOString()
  const { data, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, customer_id, post_sales_id, remote_phone, delivered_at, scheduled_for, status, message_text, outbound_message_id, payload, whatsapp_store_channels(instance_key), stores(settings)')
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
      await finalizeSentFollowup({
        supabase,
        followup,
        instanceKey,
        postSalesId: tracking.postSalesId,
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
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, customer_id, post_sales_id, remote_phone, delivered_at, scheduled_for, status, message_text, outbound_message_id, payload, whatsapp_store_channels(instance_key), stores(settings)')
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

      await finalizeSentFollowup({
        supabase,
        followup: {
          ...followup,
          post_sales_id: tracking.postSalesId,
        },
        instanceKey,
        postSalesId: tracking.postSalesId,
        sentAtIso: outbound.sent_at || now.toISOString(),
        fromStatuses: ['failed'],
      })
    } catch (recoveryError) {
      console.error(`[post-sale-followups] Falha ao reconciliar failed sent ${followup.id}:`, recoveryError)
    }
  }
}

async function dispatchScheduledFollowups(now: Date, limit = DEFAULT_DISPATCH_LIMIT) {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_post_sale_followups') as any)
    .select('id, tenant_id, store_id, channel_id, service_order_id, customer_id, post_sales_id, remote_phone, delivered_at, scheduled_for, status, message_text, outbound_message_id, payload, whatsapp_store_channels(instance_key), stores(settings)')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) throw error

  let attempted = 0
  let sent = 0
  let failed = 0

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
  }

  const markCancelled = async (followupId: number, message: string) => {
    const { error: updateError } = await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({ status: 'cancelled', error_message: message, updated_at: new Date().toISOString() })
      .eq('id', followupId)
      .eq('status', 'sending')
    if (updateError) throw updateError
  }

  for (const followup of (data ?? []) as FollowupRow[]) {
    if (!isPostSaleBusinessTime(now, followup.stores?.settings)) {
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
        await markCancelled(followup.id, 'Automacao de pos-venda desativada antes do envio.')
        continue
      }

      if (await hasActiveHumanBlock(followup.channel_id, followup.remote_phone)) {
        await markCancelled(followup.id, 'Fluxo cancelado por handoff humano ou override manual ativo.')
        continue
      }

      const { data: currentPostSale, error: currentPostSaleError } = await (supabase.from('post_sales') as any)
        .select('id, status')
        .eq('service_order_id', followup.service_order_id)
        .eq('store_id', followup.store_id)
        .eq('tenant_id', followup.tenant_id)
        .maybeSingle()
      if (currentPostSaleError) throw currentPostSaleError
      if (currentPostSale?.status === 'Em Acompanhamento' || currentPostSale?.status === 'Concluido') {
        await markCancelled(followup.id, `Fluxo cancelado porque o pos-venda ja esta ${currentPostSale.status}.`)
        continue
      }

      const instanceKey = followup.whatsapp_store_channels?.instance_key
      if (!instanceKey) {
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
        sentAtIso: confirmedDelivery?.sent_at || new Date().toISOString(),
      })

      sent += 1
    } catch (stepError) {
      const errorMessage = stepError instanceof Error ? stepError.message : String(stepError)
      console.error(`[post-sale-followups] Erro no processamento do followup ${followup.id}:`, stepError)
      if (deliveryAccepted || deliveryAttempted) {
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
  }
}

export type PostSaleFollowupJobResult = {
  ok: true
  scheduled: number
  alreadyScheduled: number
  dispatch: {
    attempted: number
    sent: number
    failed: number
  }
  deadlineClosures: {
    closedWith3: number
    closedWith4: number
    keptHuman: number
  }
}

export async function runPostSaleFollowupJob(): Promise<PostSaleFollowupJobResult> {
  const now = new Date()
  await recoverStaleSendingFollowups(now)
  await recoverFailedSentFollowups(now)
  const deadlineClosures = await closeExpiredPostSaleFollowups(now)
  const scheduleResult = await scheduleFollowups(now)
  const dispatchResult = await dispatchScheduledFollowups(now)

  return {
    ok: true,
    scheduled: scheduleResult.scheduled,
    alreadyScheduled: scheduleResult.alreadyScheduled,
    dispatch: dispatchResult,
    deadlineClosures,
  }
}
