/* eslint-disable @typescript-eslint/no-explicit-any */

import { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreModules, StoreSettings } from '@/lib/store-modules'
import { toEvolutionNumber } from '@/lib/whatsapp/phone'
import { buildWhatsAppCanonicalPayload } from '@/lib/whatsapp/canonical'
import {
  buildPostSaleFollowupMessage,
  buildPostSaleFollowupSettings,
  DEFAULT_POST_SALE_FOLLOWUP_DAYS,
} from '@/lib/whatsapp/post-sale-followup'
import { ensurePostSaleTracking } from '@/lib/whatsapp/post-sales'

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const BUSINESS_START_HOUR = 9
const BUSINESS_END_HOUR = 18
const POST_SALE_SLOT_INTERVAL_MINUTES = 30
const POST_SALE_SLOT_OFFSET_MINUTES = 15
const DEFAULT_DISPATCH_LIMIT = 1
const POST_SALE_CONTEXT_MS = 7 * 24 * 60 * 60 * 1000

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

function addPostSaleSlots(date: Date, slots: number) {
  let next = new Date(date.getTime())
  for (let i = 0; i < slots; i += 1) {
    next = new Date(next.getTime() + POST_SALE_SLOT_INTERVAL_MINUTES * 60 * 1000)
    const parts = zonedParts(next)
    if (!isBusinessTime(next) || (parts.hour >= BUSINESS_END_HOUR)) {
      const nextDate = nextBusinessDate(new Date(`${parts.date}T12:00:00Z`))
      next = buildUtcDateFromSaoPauloParts(nextDate.toISOString().slice(0, 10), BUSINESS_START_HOUR, POST_SALE_SLOT_OFFSET_MINUTES)
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
  const settings = ((channel.stores?.settings || {}) as StoreSettings) || {}
  if (settings.whatsapp_automation?.enabled === false) return null

  const modules = getStoreModules(settings)
  if (!modules.postSales) return null

  const followupSettings = buildPostSaleFollowupSettings(
    settings.whatsapp_automation?.post_sale_followup
  )
  return followupSettings.enabled ? followupSettings : null
}

function followupEnabledFromStoreSettings(settingsJson: Json | null | undefined) {
  const settings = ((settingsJson || {}) as StoreSettings) || {}
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

  const [{ data: state }, { data: control }] = await Promise.all([
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

  return Boolean(state?.id || control?.id)
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
  const firstSlot = nextPostSaleBusinessSlot(now)

  for (const channel of channels) {
    const settings = followupSettingsFromChannel(channel)
    if (!settings) continue

    const deliveredUntil = daysAgoDateString(now, settings.days_after_delivery || DEFAULT_POST_SALE_FOLLOWUP_DAYS)
    const serviceOrders = await loadEligibleServiceOrders(channel.store_id, deliveredUntil)
    let channelSequence = 0

    for (const serviceOrder of serviceOrders) {
      const postSale = serviceOrder.post_sales?.[0]
      const saleStatus = serviceOrder.vendas?.status || null
      if (saleStatus === 'Devolvida' || saleStatus === 'Cancelada') continue
      if (postSale?.status === 'Concluido') continue

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

      const scheduledFor = settings.business_hours_only === false
        ? new Date(now.getTime())
        : addPostSaleSlots(firstSlot, channelSequence)
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

  for (const followup of (data ?? []) as FollowupRow[]) {
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
    if (!claimed?.id) continue

    attempted += 1

    if (!followupEnabledFromStoreSettings(followup.stores?.settings)) {
      await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({ status: 'cancelled', error_message: 'Automacao de pos-venda desativada antes do envio.' })
        .eq('id', followup.id)
      continue
    }

    if (await hasActiveHumanBlock(followup.channel_id, followup.remote_phone)) {
      await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({ status: 'cancelled', error_message: 'Fluxo cancelado por handoff humano ou override manual ativo.' })
        .eq('id', followup.id)
      continue
    }

    const instanceKey = followup.whatsapp_store_channels?.instance_key
    if (!instanceKey) {
      await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({ status: 'failed', error_message: 'Canal WhatsApp sem instance_key.' })
        .eq('id', followup.id)
      failed += 1
      continue
    }

    const tracking = await ensurePostSaleTracking({
      tenantId: followup.tenant_id,
      storeId: followup.store_id,
      serviceOrderId: followup.service_order_id,
      interactionSummary: 'Disparo automatico de pos-venda via WhatsApp.',
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

    await (supabase.from('whatsapp_post_sale_followups') as any)
      .update({
        post_sales_id: tracking.postSalesId,
        outbound_message_id: outbound.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', followup.id)

    try {
      await automationSendRequest({
        instanceKey,
        phone: followup.remote_phone,
        text: followup.message_text,
        outboundMessageId: outbound.id,
      })

      const sentAtIso = new Date().toISOString()
      await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          status: 'sent',
          sent_at: sentAtIso,
          updated_at: sentAtIso,
        })
        .eq('id', followup.id)

      await markPostSaleConversationContext({
        channel: {
          id: followup.channel_id,
          tenant_id: followup.tenant_id,
          store_id: followup.store_id,
          instance_key: instanceKey,
          phone_number: '',
          is_active: true,
          connection_status: 'connected',
        },
        followupId: followup.id,
        postSalesId: tracking.postSalesId,
        serviceOrderId: followup.service_order_id,
        customerId: followup.customer_id,
        remotePhone: followup.remote_phone,
        sentAtIso,
        deliveredAt: followup.delivered_at,
        messageText: followup.message_text,
      })

      sent += 1
    } catch (sendError) {
      await (supabase.from('whatsapp_post_sale_followups') as any)
        .update({
          status: 'failed',
          error_message: sendError instanceof Error ? sendError.message : String(sendError),
          updated_at: new Date().toISOString(),
        })
        .eq('id', followup.id)
      failed += 1
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
}

export async function runPostSaleFollowupJob(): Promise<PostSaleFollowupJobResult> {
  const now = new Date()
  const scheduleResult = await scheduleFollowups(now)
  const dispatchResult = isBusinessTime(now)
    ? await dispatchScheduledFollowups(now)
    : { attempted: 0, sent: 0, failed: 0 }

  return {
    ok: true,
    scheduled: scheduleResult.scheduled,
    alreadyScheduled: scheduleResult.alreadyScheduled,
    dispatch: dispatchResult,
  }
}
