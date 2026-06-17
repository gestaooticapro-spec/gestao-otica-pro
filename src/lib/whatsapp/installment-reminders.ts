/* eslint-disable @typescript-eslint/no-explicit-any */

import { Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStoreModules, StoreSettings, WhatsAppInstallmentDueReminderSettings } from '@/lib/store-modules'
import { toEvolutionNumber } from '@/lib/whatsapp/phone'

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo'
const DEFAULT_DAYS_BEFORE_DUE = 2
const BUSINESS_START_HOUR = 9
const BUSINESS_END_HOUR = 18
const SCHEDULE_SPACING_MINUTES = 5
const DEFAULT_DISPATCH_LIMIT = 1

export const DEFAULT_INSTALLMENT_DUE_REMINDER_TEMPLATE = [
  'Olá, {nome}! Passando para lembrar que a parcela {numero_parcela} do {paciente} vence em {data_vencimento}.',
  '',
  'Se já estiver tudo certo, pode desconsiderar esta mensagem. Qualquer dúvida, nossa equipe está por aqui para ajudar.',
].join('\n')

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

type InstallmentRow = {
  id: number
  financiamento_id: number
  numero_parcela: number
  data_vencimento: string
  valor_parcela: number
  status: string
  venda_id: number
  customer_id: number
  store_id: number
  customers?: {
    id: number
    full_name: string
    phone: string | null
    fone_movel: string | null
  } | null
  financiamento_loja?: {
    quantidade_parcelas: number | null
  } | null
}

type ServiceOrderPatientRow = {
  venda_id: number
  dependente_id: number | null
  dependentes?: {
    full_name: string
  } | null
}

type ReminderRow = {
  id: number
  tenant_id: string
  store_id: number
  channel_id: number
  installment_id: number
  customer_id: number
  remote_phone: string
  message_text: string
  status: 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled'
  scheduled_for: string
  outbound_message_id: number | null
  whatsapp_store_channels?: {
    instance_key: string
  } | null
  stores?: {
    settings: Json | null
  } | null
}

export type InstallmentReminderJobResult = {
  ok: true
  skipped?: string
  targetDate?: string
  targetDates?: string[]
  scheduled: number
  alreadyScheduled: number
  dispatch: {
    attempted: number
    sent: number
    failed: number
  }
}

export function buildInstallmentDueReminderSettings(
  saved: WhatsAppInstallmentDueReminderSettings | undefined
): Required<WhatsAppInstallmentDueReminderSettings> {
  return {
    enabled: saved?.enabled === true,
    template: saved?.template?.trim() || DEFAULT_INSTALLMENT_DUE_REMINDER_TEMPLATE,
    days_before_due: saved?.days_before_due || DEFAULT_DAYS_BEFORE_DUE,
  }
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

function addDaysToDateString(date: string, days: number) {
  const base = new Date(`${date}T12:00:00Z`)
  base.setUTCDate(base.getUTCDate() + days)
  return base.toISOString().slice(0, 10)
}

function isBusinessTime(now: Date) {
  const parts = zonedParts(now)
  const weekend = parts.weekday === 'Sat' || parts.weekday === 'Sun'
  return !weekend && parts.hour >= BUSINESS_START_HOUR && parts.hour < BUSINESS_END_HOUR
}

function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || fullName
}

function formatDatePtBr(dateValue: string) {
  const date = new Date(`${dateValue.slice(0, 10)}T12:00:00Z`)
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
}

function replaceMarkers(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, value),
    template
  )
}

function patientText(customerName: string, dependentName: string | null) {
  if (!dependentName || dependentName.trim() === customerName.trim()) return 'seu óculos'
  return `óculos de ${dependentName.trim()}`
}

function buildMessage(
  template: string,
  installment: InstallmentRow,
  dependentName: string | null
) {
  const customerName = installment.customers?.full_name || 'cliente'
  const totalInstallments = installment.financiamento_loja?.quantidade_parcelas
  const parcelaLabel = totalInstallments
    ? `${installment.numero_parcela}/${totalInstallments}`
    : `${installment.numero_parcela}`

  return replaceMarkers(template, {
    nome: firstName(customerName),
    titular: customerName,
    paciente: patientText(customerName, dependentName),
    numero_parcela: parcelaLabel,
    data_vencimento: formatDatePtBr(installment.data_vencimento),
    valor_parcela: Number(installment.valor_parcela || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }),
  })
}

function reminderSettingsFromChannel(channel: ChannelRow) {
  const settings = ((channel.stores?.settings || {}) as StoreSettings) || {}
  if (settings.whatsapp_automation?.enabled === false) return null

  const modules = getStoreModules(settings)
  if (!modules.installments) return null

  const reminderSettings = buildInstallmentDueReminderSettings(
    settings.whatsapp_automation?.installment_due_reminder
  )
  return reminderSettings.enabled ? reminderSettings : null
}

function reminderEnabledFromStoreSettings(settingsJson: Json | null | undefined) {
  const settings = ((settingsJson || {}) as StoreSettings) || {}
  if (settings.whatsapp_automation?.enabled === false) return false

  const modules = getStoreModules(settings)
  if (!modules.installments) return false

  return buildInstallmentDueReminderSettings(
    settings.whatsapp_automation?.installment_due_reminder
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

async function loadDueInstallments(storeId: number, targetDate: string) {
  const supabase = createAdminClient()
  const nextDate = addDaysToDateString(targetDate, 1)
  const { data, error } = await (supabase.from('financiamento_parcelas') as any)
    .select(`
      id,
      financiamento_id,
      numero_parcela,
      data_vencimento,
      valor_parcela,
      status,
      venda_id,
      customer_id,
      store_id,
      customers ( id, full_name, phone, fone_movel ),
      financiamento_loja ( quantidade_parcelas )
    `)
    .eq('store_id', storeId)
    .in('status', ['Pendente', 'pendente'])
    .gt('valor_parcela', 0.01)
    .gte('data_vencimento', targetDate)
    .lt('data_vencimento', nextDate)
    .order('data_vencimento', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return (data ?? []) as InstallmentRow[]
}

async function loadPatientNames(storeId: number, vendaIds: number[]) {
  if (vendaIds.length === 0) return new Map<number, string | null>()

  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('service_orders') as any)
    .select('venda_id, dependente_id, dependentes(full_name)')
    .eq('store_id', storeId)
    .in('venda_id', vendaIds)
    .order('created_at', { ascending: true })

  if (error) throw error

  const names = new Map<number, string | null>()
  for (const row of (data ?? []) as ServiceOrderPatientRow[]) {
    if (!names.has(row.venda_id)) {
      names.set(row.venda_id, row.dependentes?.full_name ?? null)
    }
  }
  return names
}

async function scheduleReminders(now: Date) {
  const supabase = createAdminClient()
  const channels = await loadActiveChannels()
  const today = zonedParts(now).date
  const targetDates = new Set<string>()
  let scheduled = 0
  let alreadyScheduled = 0

  for (const channel of channels) {
    const settings = reminderSettingsFromChannel(channel)
    if (!settings) continue

    const reminderDays = [...new Set([settings.days_before_due, 1].filter((days) => days > 0))]
    const installmentsWithTargetDate: Array<InstallmentRow & { reminderTargetDate: string }> = []

    for (const daysBeforeDue of reminderDays) {
      const targetDate = addDaysToDateString(today, daysBeforeDue)
      targetDates.add(targetDate)

      const installments = await loadDueInstallments(channel.store_id, targetDate)
      installmentsWithTargetDate.push(
        ...installments.map((installment) => ({
          ...installment,
          reminderTargetDate: targetDate,
        }))
      )
    }

    const patientNames = await loadPatientNames(
      channel.store_id,
      [...new Set(installmentsWithTargetDate.map((installment) => installment.venda_id).filter(Boolean))]
    )

    let channelSequence = 0
    for (const installment of installmentsWithTargetDate) {
      const phone = toEvolutionNumber(installment.customers?.fone_movel || installment.customers?.phone)
      if (!phone) continue

      const scheduledFor = new Date(now.getTime() + channelSequence * SCHEDULE_SPACING_MINUTES * 60 * 1000)
      const messageText = buildMessage(settings.template, installment, patientNames.get(installment.venda_id) ?? null)

      const { error } = await (supabase.from('whatsapp_installment_reminders') as any)
        .insert({
          tenant_id: channel.tenant_id,
          store_id: channel.store_id,
          channel_id: channel.id,
          installment_id: installment.id,
          customer_id: installment.customer_id,
          remote_phone: phone,
          due_date: installment.data_vencimento.slice(0, 10),
          scheduled_for: scheduledFor.toISOString(),
          status: 'scheduled',
          message_text: messageText,
          payload: {
            vendaId: installment.venda_id,
            financiamentoId: installment.financiamento_id,
            numeroParcela: installment.numero_parcela,
            targetDate: installment.reminderTargetDate,
            daysBeforeDue: Math.max(
              1,
              Math.round(
                (
                  new Date(`${installment.data_vencimento.slice(0, 10)}T12:00:00Z`).getTime()
                  - new Date(`${today}T12:00:00Z`).getTime()
                ) / 86_400_000
              )
            ),
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

  return {
    targetDate: addDaysToDateString(today, DEFAULT_DAYS_BEFORE_DUE),
    targetDates: [...targetDates],
    scheduled,
    alreadyScheduled,
  }
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

async function dispatchDueReminders(now: Date, limit = DEFAULT_DISPATCH_LIMIT) {
  const supabase = createAdminClient()
  const { data, error } = await (supabase.from('whatsapp_installment_reminders') as any)
    .select('id, tenant_id, store_id, channel_id, installment_id, customer_id, remote_phone, message_text, status, scheduled_for, outbound_message_id, whatsapp_store_channels(instance_key), stores(settings)')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(limit)

  if (error) throw error

  let attempted = 0
  let sent = 0
  let failed = 0

  for (const reminder of (data ?? []) as ReminderRow[]) {
    attempted += 1
    if (!reminderEnabledFromStoreSettings(reminder.stores?.settings)) {
      await (supabase.from('whatsapp_installment_reminders') as any)
        .update({ status: 'cancelled', error_message: 'Automacao de vencimento desativada antes do envio.' })
        .eq('id', reminder.id)
      continue
    }

    const instanceKey = reminder.whatsapp_store_channels?.instance_key
    if (!instanceKey) {
      await (supabase.from('whatsapp_installment_reminders') as any)
        .update({ status: 'failed', error_message: 'Canal WhatsApp sem instance_key.' })
        .eq('id', reminder.id)
      failed += 1
      continue
    }

    const { data: outbound, error: outboundError } = await (supabase.from('whatsapp_outbound_messages') as any)
      .insert({
        tenant_id: reminder.tenant_id,
        store_id: reminder.store_id,
        channel_id: reminder.channel_id,
        inbound_message_id: null,
        remote_phone: reminder.remote_phone,
        message_text: reminder.message_text,
        message_type: 'installment_due_reminder',
        status: 'pending',
        payload: {
          reminderId: reminder.id,
          installmentId: reminder.installment_id,
          customerId: reminder.customer_id,
        },
      })
      .select('id')
      .single()

    if (outboundError) throw outboundError

    await (supabase.from('whatsapp_installment_reminders') as any)
      .update({
        status: 'sending',
        outbound_message_id: outbound.id,
      })
      .eq('id', reminder.id)

    try {
      await automationSendRequest({
        instanceKey,
        phone: reminder.remote_phone,
        text: reminder.message_text,
        outboundMessageId: outbound.id,
      })

      await (supabase.from('whatsapp_installment_reminders') as any)
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        })
        .eq('id', reminder.id)

      sent += 1
    } catch (sendError) {
      await (supabase.from('whatsapp_installment_reminders') as any)
        .update({
          status: 'failed',
          error_message: sendError instanceof Error ? sendError.message : String(sendError),
        })
        .eq('id', reminder.id)

      failed += 1
    }
  }

  return { attempted, sent, failed }
}

export async function runInstallmentReminderJob(now = new Date()): Promise<InstallmentReminderJobResult> {
  if (!isBusinessTime(now)) {
    return {
      ok: true,
      skipped: 'outside_business_hours',
      scheduled: 0,
      alreadyScheduled: 0,
      dispatch: { attempted: 0, sent: 0, failed: 0 },
    }
  }

  const schedule = await scheduleReminders(now)
  const dispatch = await dispatchDueReminders(now)

  return {
    ok: true,
    targetDate: schedule.targetDate,
    scheduled: schedule.scheduled,
    alreadyScheduled: schedule.alreadyScheduled,
    dispatch,
  }
}
