'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { Json } from '@/lib/database.types'
import { digitsOnly, phonesMatch, phonesMatchLast8, toEvolutionNumber } from '@/lib/whatsapp/phone'
import {
  findPendingHandoffResolution,
  loadPendingHandoffResolutions,
  type PendingHandoffOrigin,
} from '@/lib/whatsapp/pending-handoff'
import { markStoreInitiatedConversation } from '@/lib/whatsapp/customer-status'
import { simulateCustomerStatus, type CustomerStatusSimulationResponse } from '@/lib/whatsapp/customer-status'

const ALLOWED_ROLES = ['admin', 'manager', 'store_operator', 'vendedor', 'tecnico']
const DEFAULT_THREAD_LIST_LIMIT = 40
const DEFAULT_THREAD_DETAIL_LIMIT = 200
const DEFAULT_RECENT_SCAN_LIMIT = 400
const WHATSAPP_RETENTION_AI_LOG_DAYS = 30
const WHATSAPP_RETENTION_MESSAGE_DAYS = 90
const WHATSAPP_RETENTION_EXPIRED_STATE_DAYS = 7
const WHATSAPP_RETENTION_DELETE_BATCH_LIMIT = 250
export type WhatsAppCustomerControlMode = 'auto' | 'force_ai' | 'force_human'
export type { CustomerStatusSimulationResponse }

type AccessProfile = {
  role: string
  store_id: number | null
}

type StoreCustomerRow = {
  id: number
  full_name: string
  cpf: string | null
  fone_movel: string | null
  phone: string | null
}

type ConversationStateRow = {
  id: number
  channel_id: number
  remote_phone: string
  state: string
  metadata: Json | null
  expires_at: string
  updated_at: string
}

type InboundRow = {
  id: number
  provider_message_id: string
  remote_phone: string
  message_text: string | null
  payload: Json | null
  status: string
  created_at: string
}

type OutboundRow = {
  id: number
  inbound_message_id: number | null
  provider_message_id: string | null
  remote_phone: string
  message_text: string
  message_type: string
  status: string
  payload: Json | null
  error_message: string | null
  sent_at: string | null
  created_at: string
}

type AiLogRow = {
  id: string
  inbound_message_id: number | null
  provider: string
  model_name: string
  latency_ms: number | null
  intent: string | null
  confidence: number | null
  is_success: boolean
  error_message: string | null
  raw_request: Json | null
  raw_response: Json | null
  created_at: string
}

type WhatsAppOperatorCustomerRef = {
  id: number
  name: string
  cpf: string | null
  phones: string[]
}

export type WhatsAppOperatorThreadListItem = {
  remotePhone: string
  customer: WhatsAppOperatorCustomerRef | null
  overrideMode: WhatsAppCustomerControlMode
  currentState: string | null
  stateExpiresAt: string | null
  stateUpdatedAt: string | null
  hasPendingHandoff: boolean
  pendingHandoffOrigin: PendingHandoffOrigin | null
  hasRecentAttachment: boolean
  lastMessageAt: string | null
  lastMessagePreview: string | null
  lastMessageDirection: 'inbound' | 'outbound' | null
  lastMessageType: string | null
  internalNote: string | null
  extractedReceipt: Json | null
  latestIntent: string | null
  latestConfidence: number | null
  latestAction: string | null
  latestOutboundType: string | null
  messageCount: number
}

export type WhatsAppOperatorThreadMessage = {
  id: string
  sourceId: number
  direction: 'inbound' | 'outbound'
  actor: 'customer' | 'system' | 'operator'
  remotePhone: string
  text: string | null
  messageType: string | null
  status: string
  createdAt: string
  providerMessageId: string | null
  inboundMessageId: number | null
  payload: Json | null
  errorMessage: string | null
  technicalLog: {
    intent: string | null
    confidence: number | null
    provider: string | null
    model: string | null
    latencyMs: number | null
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    errorMessage: string | null
    createdAt: string | null
  } | null
}

export type WhatsAppOperatorTechnicalSummary = {
  overrideMode: WhatsAppCustomerControlMode
  conversationState: string | null
  stateExpiresAt: string | null
  stateUpdatedAt: string | null
  handoffInternalNote: string | null
  latestIntent: string | null
  latestConfidence: number | null
  latestAction: string | null
  latestOutboundType: string | null
  latestInboundText: string | null
  latestInboundHasAttachment: boolean
  latestInboundAttachmentKind: string | null
  operationalDecision: {
    route: string | null
    preAiRoute: string | null
    postClassificationRoute: string | null
    reason: string | null
    selectedOption: string | null
    silenceReason: string | null
    handoffReason: string | null
  }
  aiSessionHistory: Array<{
    role: 'customer' | 'assistant'
    text: string
    at: string
  }>
  aiSessionUpdatedAt: string | null
  aiSessionEndedAt: string | null
  latestAiLog: {
    intent: string | null
    confidence: number | null
    provider: string | null
    model: string | null
    latencyMs: number | null
    inputTokens: number | null
    outputTokens: number | null
    totalTokens: number | null
    errorMessage: string | null
    createdAt: string | null
  } | null
  extractedReceipt: Json | null
  paymentInstallmentHint: {
    count: number
    firstInstallmentId: number | null
    customerId: number | null
    customerName: string | null
    dueDate: string | null
    amount: number | null
    searchQuery: string | null
    exactMatch: boolean
    source: string | null
  } | null
  metadata: Json | null
}

export type WhatsAppOperatorThreadDetail = {
  thread: WhatsAppOperatorThreadListItem
  messages: WhatsAppOperatorThreadMessage[]
  technicalSummary: WhatsAppOperatorTechnicalSummary
}

export type WhatsAppOperatorThreadListResult = {
  success: boolean
  message: string
  threads: WhatsAppOperatorThreadListItem[]
}

export type WhatsAppOperatorThreadDetailResult = {
  success: boolean
  message: string
  data: WhatsAppOperatorThreadDetail | null
}

export type WhatsAppOperatorSendMessageResult = {
  success: boolean
  message: string
  outboundMessageId?: number
}

export type WhatsAppOperatorSimulationResult = {
  success: boolean
  message: string
  data: CustomerStatusSimulationResponse | null
}

export type WhatsAppRetentionPreview = {
  policy: {
    aiLogsDays: number
    messagesDays: number
    expiredStatesDays: number
  }
  cutoffs: {
    aiLogsBefore: string
    messagesBefore: string
    expiredStatesBefore: string
  }
  protectedThreads: {
    forceHuman: number
    activeHandoff: number
    totalUnique: number
  }
  candidates: {
    aiLogs: number
    expiredStates: number
    inboundMessages: number
    outboundMessages: number
    total: number
  }
}

export type WhatsAppRetentionPreviewResult = {
  success: boolean
  message: string
  data: WhatsAppRetentionPreview | null
}

export type WhatsAppRetentionCleanupResult = {
  success: boolean
  message: string
  deleted: {
    aiLogs: number
    expiredStates: number
    inboundMessages: number
    outboundMessages: number
    total: number
  } | null
  preview: WhatsAppRetentionPreview | null
}

function formatActionError(error: unknown, fallback: string) {
  if (!error) return fallback
  if (error instanceof Error && error.message) return error.message

  if (typeof error === 'object' && error !== null) {
    const candidate = error as { message?: unknown; details?: unknown; code?: unknown }
    const parts = [candidate.message, candidate.details, candidate.code]
      .filter((value) => typeof value === 'string' && value.trim().length > 0)
      .map((value) => String(value).trim())

    if (parts.length > 0) return parts.join(' | ')
  }

  return fallback
}

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, Json | undefined>
}

function asString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function asNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
}

function postgrestTextInList(values: string[]) {
  return `(${values.map((value) => `"${value.replace(/"/g, '\\"')}"`).join(',')})`
}

async function countQuery(query: any) {
  const { count, error } = await query
  if (error) throw error
  return Number(count || 0)
}

async function selectIds(query: any): Promise<Array<number | string>> {
  const { data, error } = await query
  if (error) throw error
  return (data || []).map((row: any) => row.id).filter((id: unknown) => typeof id === 'number' || typeof id === 'string')
}

async function deleteByIds(supabaseAdmin: ReturnType<typeof createAdminClient>, tableName: string, ids: Array<number | string>) {
  if (ids.length === 0) return 0
  const { error } = await (supabaseAdmin.from(tableName) as any)
    .delete()
    .in('id', ids)

  if (error) throw error
  return ids.length
}

async function buildWhatsAppRetentionScope(supabaseAdmin: ReturnType<typeof createAdminClient>, storeId: number) {
  const nowIso = new Date().toISOString()
  const aiLogsBefore = daysAgoIso(WHATSAPP_RETENTION_AI_LOG_DAYS)
  const messagesBefore = daysAgoIso(WHATSAPP_RETENTION_MESSAGE_DAYS)
  const expiredStatesBefore = daysAgoIso(WHATSAPP_RETENTION_EXPIRED_STATE_DAYS)

  const [{ data: forceHumanRows, error: forceHumanError }, { data: activeHandoffRows, error: activeHandoffError }] = await Promise.all([
    (supabaseAdmin.from('whatsapp_customer_control') as any)
      .select('remote_phone')
      .eq('store_id', storeId)
      .eq('mode', 'force_human'),
    (supabaseAdmin.from('whatsapp_conversation_states') as any)
      .select('remote_phone')
      .eq('store_id', storeId)
      .in('state', ['human_pause', 'waiting_human_after_attachment'])
      .gt('expires_at', nowIso),
  ])

  if (forceHumanError) throw forceHumanError
  if (activeHandoffError) throw activeHandoffError

  const forceHumanPhones = new Set<string>((forceHumanRows || []).map((row: any) => normalizeRemotePhone(String(row.remote_phone || ''))).filter(Boolean))
  const activeHandoffPhones = new Set<string>((activeHandoffRows || []).map((row: any) => normalizeRemotePhone(String(row.remote_phone || ''))).filter(Boolean))
  const protectedPhones = [...new Set([...forceHumanPhones, ...activeHandoffPhones])]

  return {
    nowIso,
    aiLogsBefore,
    messagesBefore,
    expiredStatesBefore,
    forceHumanPhones,
    activeHandoffPhones,
    protectedPhones,
  }
}

type WhatsAppRetentionQueryMode = 'count' | 'ids'

function createRetentionQuery(supabaseAdmin: ReturnType<typeof createAdminClient>, tableName: string, mode: WhatsAppRetentionQueryMode) {
  if (mode === 'count') {
    return (supabaseAdmin.from(tableName) as any).select('id', { count: 'exact', head: true })
  }

  return (supabaseAdmin.from(tableName) as any).select('id')
}

function buildWhatsAppRetentionQueries(
  supabaseAdmin: ReturnType<typeof createAdminClient>,
  storeId: number,
  scope: Awaited<ReturnType<typeof buildWhatsAppRetentionScope>>,
  mode: WhatsAppRetentionQueryMode
) {
  const aiLogs = createRetentionQuery(supabaseAdmin, 'whatsapp_ai_logs', mode)
    .eq('store_id', storeId)
    .lt('created_at', scope.aiLogsBefore)

  const expiredStates = createRetentionQuery(supabaseAdmin, 'whatsapp_conversation_states', mode)
    .eq('store_id', storeId)
    .lt('expires_at', scope.nowIso)
    .lt('updated_at', scope.expiredStatesBefore)
    .not('state', 'in', '("human_pause","waiting_human_after_attachment")')

  let inboundMessages = createRetentionQuery(supabaseAdmin, 'whatsapp_inbound_messages', mode)
    .eq('store_id', storeId)
    .lt('created_at', scope.messagesBefore)

  let outboundMessages = createRetentionQuery(supabaseAdmin, 'whatsapp_outbound_messages', mode)
    .eq('store_id', storeId)
    .lt('created_at', scope.messagesBefore)

  if (scope.protectedPhones.length > 0) {
    const protectedList = postgrestTextInList(scope.protectedPhones)
    inboundMessages = inboundMessages.not('remote_phone', 'in', protectedList)
    outboundMessages = outboundMessages.not('remote_phone', 'in', protectedList)
  }

  return {
    aiLogs,
    expiredStates,
    inboundMessages,
    outboundMessages,
  }
}

function parseAiSessionHistory(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null
      const record = entry as Record<string, unknown>
      const role = record.role === 'customer' || record.role === 'assistant' ? record.role : null
      const text = asString(record.text)
      const at = asString(record.at)
      if (!role || !text || !at) return null

      return {
        role,
        text,
        at,
      } as const
    })
    .filter(Boolean) as Array<{
      role: 'customer' | 'assistant'
      text: string
      at: string
    }>
}

function parsePaymentInstallmentHint(value: unknown): WhatsAppOperatorTechnicalSummary['paymentInstallmentHint'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const count = asNumber(record.count)
  if (!count || count <= 0) return null

  return {
    count,
    firstInstallmentId: asNumber(record.firstInstallmentId),
    customerId: asNumber(record.customerId),
    customerName: asString(record.customerName),
    dueDate: asString(record.dueDate),
    amount: asNumber(record.amount),
    searchQuery: asString(record.searchQuery),
    exactMatch: record.exactMatch === true,
    source: asString(record.source),
  }
}

function inferOperationalRoute(metadata: Record<string, Json | undefined>) {
  const preAiRoute = asString(metadata.preAiRoute)
  const postClassificationRoute = asString(metadata.postClassificationRoute)
  const action = asString(metadata.lastAction)
  const outboundType = asString(metadata.lastOutboundType)
  const reason = asString(metadata.reason)
  const selectedOption = asString(metadata.selectedOption)

  return postClassificationRoute
    || preAiRoute
    || outboundType
    || selectedOption
    || action
    || reason
}

function buildOperationalDecisionSummary(
  state: string | null | undefined,
  metadata: Record<string, Json | undefined>
): WhatsAppOperatorTechnicalSummary['operationalDecision'] {
  const reason = asString(metadata.reason)
  const selectedOption = asString(metadata.selectedOption)
  const action = asString(metadata.lastAction)
  const preAiRoute = asString(metadata.preAiRoute)
  const postClassificationRoute = asString(metadata.postClassificationRoute)
  const route = inferOperationalRoute(metadata)

  const isSilent = action === 'silent_handoff'
    || action === 'ignore'
    || state === 'silent'
    || route === 'ignore_silent'
    || route === 'ignore_human_pause'

  const isHandoff = action === 'human_handoff'
    || action === 'force_human_override'
    || state === 'human_pause'
    || state === 'waiting_human_after_attachment'

  return {
    route,
    preAiRoute,
    postClassificationRoute,
    reason,
    selectedOption,
    silenceReason: isSilent ? reason || route || action : null,
    handoffReason: isHandoff ? reason || selectedOption || route || action : null,
  }
}

function extractTokenUsage(rawResponse: Json | null | undefined) {
  const response = asRecord(rawResponse)
  const tokenUsage = asRecord(response.tokenUsage as Json | undefined)

  return {
    inputTokens: asNumber(tokenUsage.inputTokens),
    outputTokens: asNumber(tokenUsage.outputTokens),
    totalTokens: asNumber(tokenUsage.totalTokens),
  }
}

function normalizeRemotePhone(value: string) {
  const digits = digitsOnly(value)
  if (!digits) return value.trim()

  if (digits.startsWith('55') && digits.length >= 12) return digits

  const evolution = toEvolutionNumber(digits)
  return evolution || digits
}

function phonesBelongToSameThread(left: string | null | undefined, right: string | null | undefined) {
  return phonesMatch(left, right) || normalizeRemotePhone(String(left || '')) === normalizeRemotePhone(String(right || ''))
}

function pickPreferredRemotePhone(current: string, candidate: string) {
  const currentNormalized = normalizeRemotePhone(current)
  const candidateNormalized = normalizeRemotePhone(candidate)
  if (!currentNormalized) return candidateNormalized || candidate
  if (!candidateNormalized) return currentNormalized || current

  const currentDigits = digitsOnly(currentNormalized)
  const candidateDigits = digitsOnly(candidateNormalized)

  if (candidateDigits.length > currentDigits.length) return candidateNormalized
  return currentNormalized
}

function findMapValueByPhoneMatch<T>(map: Map<string, T>, phone: string) {
  for (const [key, value] of map.entries()) {
    if (phonesBelongToSameThread(key, phone)) return value
  }
  return undefined
}

async function sendAutomationMessage(payload: {
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

function buildCustomerRef(customer: StoreCustomerRow | null): WhatsAppOperatorCustomerRef | null {
  if (!customer) return null

  const phones = [customer.fone_movel, customer.phone]
    .map((value) => normalizeRemotePhone(String(value || '')))
    .filter(Boolean)

  return {
    id: customer.id,
    name: customer.full_name,
    cpf: customer.cpf,
    phones: [...new Set(phones)],
  }
}

function findCustomerByPhone(phone: string, customers: StoreCustomerRow[]) {
  const strictMatch = customers.find((customer) =>
    phonesMatch(phone, customer.fone_movel) ||
    phonesMatch(phone, customer.phone)
  )
  if (strictMatch) return strictMatch

  const looseMatches = customers.filter((customer) =>
    phonesMatchLast8(phone, customer.fone_movel) ||
    phonesMatchLast8(phone, customer.phone)
  )

  return looseMatches.length === 1 ? looseMatches[0] : null
}

function findCustomerById(customerId: number | null, customers: StoreCustomerRow[]) {
  if (!customerId || !Number.isFinite(customerId)) return null
  return customers.find((customer) => customer.id === customerId) || null
}

function inferOutboundActor(messageType: string | null | undefined, payload: Json | null | undefined) {
  const normalizedType = String(messageType || '').trim().toLowerCase()
  const record = asRecord(payload)

  if (
    normalizedType.includes('operator') ||
    normalizedType.includes('human') ||
    record.sentBy === 'operator' ||
    record.source === 'operator' ||
    record.manual === true
  ) {
    return 'operator' as const
  }

  return 'system' as const
}

async function getViewContext(storeId: number) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    throw new Error('Usuario nao autenticado.')
  }

  const profile = (await getProfileByAdmin(user.id)) as AccessProfile | null
  if (!profile) {
    throw new Error('Perfil invalido.')
  }

  const isAllowed = ALLOWED_ROLES.includes(profile.role)
  const hasStoreAccess = profile.role === 'admin' || profile.store_id === storeId

  if (!isAllowed || !hasStoreAccess) {
    throw new Error('Acesso negado.')
  }

  return {
    profile,
    supabaseAdmin: createAdminClient(),
  }
}

async function loadStoreCustomers(storeId: number) {
  const supabaseAdmin = createAdminClient()
  const { data, error } = await (supabaseAdmin.from('customers') as any)
    .select('id, full_name, cpf, fone_movel, phone')
    .eq('store_id', storeId)
    .limit(5000)

  if (error) throw error
  return (data || []) as StoreCustomerRow[]
}

function mergeCustomers(...groups: StoreCustomerRow[][]) {
  const map = new Map<number, StoreCustomerRow>()
  for (const group of groups) {
    for (const customer of group) {
      map.set(customer.id, customer)
    }
  }

  return [...map.values()]
}

async function loadCustomersByIds(storeId: number, customerIds: number[]) {
  const ids = [...new Set(customerIds.filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const customers: StoreCustomerRow[] = []

  for (let index = 0; index < ids.length; index += 100) {
    const batch = ids.slice(index, index + 100)
    const { data, error } = await (supabaseAdmin.from('customers') as any)
      .select('id, full_name, cpf, fone_movel, phone')
      .eq('store_id', storeId)
      .in('id', batch)

    if (error) throw error
    customers.push(...((data || []) as StoreCustomerRow[]))
  }

  return customers
}

async function loadCustomersByPhoneHints(storeId: number, phones: string[]) {
  const suffixes = [...new Set(phones
    .map((phone) => digitsOnly(phone).slice(-4))
    .filter((suffix) => suffix.length === 4))]

  if (suffixes.length === 0) return []

  const supabaseAdmin = createAdminClient()
  const customers: StoreCustomerRow[] = []

  for (let index = 0; index < suffixes.length; index += 20) {
    const batch = suffixes.slice(index, index + 20)
    const filter = batch
      .flatMap((suffix) => [
        `fone_movel.ilike.%${suffix}%`,
        `phone.ilike.%${suffix}%`,
      ])
      .join(',')

    const { data, error } = await (supabaseAdmin.from('customers') as any)
      .select('id, full_name, cpf, fone_movel, phone')
      .eq('store_id', storeId)
      .or(filter)
      .limit(1000)

    if (error) throw error
    customers.push(...((data || []) as StoreCustomerRow[]))
  }

  return mergeCustomers(customers)
}

function createThreadAccumulator(remotePhone: string) {
  return {
    remotePhone,
    currentState: null as string | null,
    stateExpiresAt: null as string | null,
    stateUpdatedAt: null as string | null,
    hasPendingHandoff: false,
    pendingHandoffOrigin: null as PendingHandoffOrigin | null,
    internalNote: null as string | null,
    extractedReceipt: null as Json | null,
    latestIntent: null as string | null,
    latestConfidence: null as number | null,
    latestAction: null as string | null,
    latestOutboundType: null as string | null,
    lastKnownCustomerId: null as number | null,
    hasRecentAttachment: false,
    lastMessageAt: null as string | null,
    lastMessagePreview: null as string | null,
    lastMessageDirection: null as 'inbound' | 'outbound' | null,
    lastMessageType: null as string | null,
    messageCount: 0,
  }
}

function buildThreadListItem(
  remotePhone: string,
  accumulator: ReturnType<typeof createThreadAccumulator>,
  customer: StoreCustomerRow | null,
  overrideMode: WhatsAppCustomerControlMode
): WhatsAppOperatorThreadListItem {
  return {
    remotePhone,
    customer: buildCustomerRef(customer),
    overrideMode,
    currentState: accumulator.currentState,
    stateExpiresAt: accumulator.stateExpiresAt,
    stateUpdatedAt: accumulator.stateUpdatedAt,
    hasPendingHandoff: accumulator.hasPendingHandoff,
    pendingHandoffOrigin: accumulator.pendingHandoffOrigin,
    hasRecentAttachment: accumulator.hasRecentAttachment,
    lastMessageAt: accumulator.lastMessageAt,
    lastMessagePreview: accumulator.lastMessagePreview,
    lastMessageDirection: accumulator.lastMessageDirection,
    lastMessageType: accumulator.lastMessageType,
    internalNote: accumulator.internalNote,
    extractedReceipt: accumulator.extractedReceipt,
    latestIntent: accumulator.latestIntent,
    latestConfidence: accumulator.latestConfidence,
    latestAction: accumulator.latestAction,
    latestOutboundType: accumulator.latestOutboundType,
    messageCount: accumulator.messageCount,
  }
}

async function loadCustomerControlMap(storeId: number, phones?: string[]) {
  const supabaseAdmin = createAdminClient()
  const query = (supabaseAdmin.from('whatsapp_customer_control') as any)
    .select('remote_phone, mode')
    .eq('store_id', storeId)

  const { data, error } = await query
  if (error) throw error

  const map = new Map<string, WhatsAppCustomerControlMode>()
  for (const row of (data || []) as Array<{ remote_phone: string; mode: string }>) {
    const mode = row.mode === 'force_ai' || row.mode === 'force_human' ? row.mode : 'auto'
    map.set(normalizeRemotePhone(row.remote_phone), mode)
  }

  return map
}

async function loadCustomerLinkMap(storeId: number, phones?: string[]) {
  const supabaseAdmin = createAdminClient()
  const query = (supabaseAdmin.from('whatsapp_customer_links') as any)
    .select('remote_phone, customer_id')
    .eq('store_id', storeId)

  const { data, error } = await query
  if (error) throw error

  const map = new Map<string, number>()
  for (const row of (data || []) as Array<{ remote_phone: string; customer_id: number | null }>) {
    if (!Number.isFinite(row.customer_id)) continue
    map.set(normalizeRemotePhone(row.remote_phone), Number(row.customer_id))
  }

  return map
}

export async function getWhatsAppOperatorThreads(input: {
  storeId: number
  query?: string
  onlyPending?: boolean
  limit?: number
}): Promise<WhatsAppOperatorThreadListResult> {
  try {
    const storeId = Number(input.storeId)
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.', threads: [] }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const query = String(input.query || '').trim()
    const numericQuery = digitsOnly(query)
    const limit = Math.max(1, Math.min(Number(input.limit || DEFAULT_THREAD_LIST_LIMIT), 100))
    const scanLimit = query ? Math.max(limit * 4, 120) : DEFAULT_RECENT_SCAN_LIMIT
    const customers = await loadStoreCustomers(storeId)

    const matchedCustomers = query
      ? customers.filter((customer) => {
          const haystack = [
            customer.full_name,
            customer.cpf,
            customer.fone_movel,
            customer.phone,
          ]
            .map((value) => String(value || '').toLowerCase())
            .join(' ')

          return haystack.includes(query.toLowerCase())
        })
      : []

    const candidatePhones = new Set<string>()
    for (const customer of matchedCustomers) {
      for (const phone of [customer.fone_movel, customer.phone]) {
        const normalized = normalizeRemotePhone(String(phone || ''))
        if (normalized) candidatePhones.add(normalized)
      }
    }

    const inboundQuery = (supabaseAdmin.from('whatsapp_inbound_messages') as any)
      .select('id, provider_message_id, remote_phone, message_text, payload, status, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(scanLimit)

    const outboundQuery = (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .select('id, inbound_message_id, provider_message_id, remote_phone, message_text, message_type, status, payload, error_message, sent_at, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(scanLimit)

    const stateQuery = (supabaseAdmin.from('whatsapp_conversation_states') as any)
      .select('id, channel_id, remote_phone, state, metadata, expires_at, updated_at')
      .eq('store_id', storeId)
      .order('updated_at', { ascending: false })
      .limit(scanLimit)

    if (candidatePhones.size > 0) {
      const phones = [...candidatePhones].slice(0, 100)
      inboundQuery.in('remote_phone', phones)
      outboundQuery.in('remote_phone', phones)
      stateQuery.in('remote_phone', phones)
    } else if (numericQuery.length >= 4) {
      inboundQuery.ilike('remote_phone', `%${numericQuery}%`)
      outboundQuery.ilike('remote_phone', `%${numericQuery}%`)
      stateQuery.ilike('remote_phone', `%${numericQuery}%`)
    }

    const [{ data: inboundRows, error: inboundError }, { data: outboundRows, error: outboundError }, { data: stateRows, error: stateError }] = await Promise.all([
      inboundQuery,
      outboundQuery,
      stateQuery,
    ])

    if (inboundError) throw inboundError
    if (outboundError) throw outboundError
    if (stateError) throw stateError

    const typedStateRows = (stateRows || []) as ConversationStateRow[]
    const pendingHandoffResolutions = await loadPendingHandoffResolutions(
      supabaseAdmin,
      storeId,
      typedStateRows
    )

    const threadMap = new Map<string, ReturnType<typeof createThreadAccumulator>>()
    const ensureThread = (remotePhone: string) => {
      for (const [existingKey, existingThread] of threadMap.entries()) {
        if (!phonesBelongToSameThread(existingKey, remotePhone)) continue

        const preferredPhone = pickPreferredRemotePhone(existingThread.remotePhone, remotePhone)
        existingThread.remotePhone = preferredPhone
        if (preferredPhone !== existingKey) {
          threadMap.delete(existingKey)
          threadMap.set(preferredPhone, existingThread)
        }
        return existingThread
      }

      const normalized = normalizeRemotePhone(remotePhone)
      if (!threadMap.has(normalized)) {
        threadMap.set(normalized, createThreadAccumulator(normalized))
      }
      return threadMap.get(normalized)!
    }

    for (const stateRow of typedStateRows) {
      const thread = ensureThread(stateRow.remote_phone)
      const metadata = asRecord(stateRow.metadata)
      const pendingHandoff = findPendingHandoffResolution(pendingHandoffResolutions, stateRow.remote_phone)

      thread.currentState = stateRow.state
      thread.stateExpiresAt = stateRow.expires_at
      thread.stateUpdatedAt = stateRow.updated_at
      thread.hasPendingHandoff = pendingHandoff?.isPending === true
      thread.pendingHandoffOrigin = pendingHandoff?.origin ?? null
      thread.internalNote = asString(metadata.handoff_internal_note)
      thread.extractedReceipt = (metadata.ai_extracted_receipt as Json | undefined) ?? null
      thread.latestIntent = asString(metadata.lastIntent) || asString(metadata.aiIntent)
      thread.latestConfidence = asNumber(metadata.lastIntentConfidence) ?? asNumber(metadata.aiConfidence)
      thread.latestAction = asString(metadata.lastAction)
      thread.latestOutboundType = asString(metadata.lastOutboundType)
      thread.lastKnownCustomerId = asNumber(metadata.lastKnownCustomerId)
      thread.hasRecentAttachment = metadata.lastInboundHasAttachment === true
    }

    for (const inboundRow of (inboundRows || []) as InboundRow[]) {
      const thread = ensureThread(inboundRow.remote_phone)
      thread.messageCount += 1

      if (!thread.lastMessageAt || new Date(inboundRow.created_at).getTime() > new Date(thread.lastMessageAt).getTime()) {
        thread.lastMessageAt = inboundRow.created_at
        thread.lastMessagePreview = inboundRow.message_text || asString(asRecord(inboundRow.payload).caption) || '[mensagem sem texto]'
        thread.lastMessageDirection = 'inbound'
        thread.lastMessageType = 'inbound'
      }
    }

    for (const outboundRow of (outboundRows || []) as OutboundRow[]) {
      const thread = ensureThread(outboundRow.remote_phone)
      thread.messageCount += 1

      if (!thread.lastMessageAt || new Date(outboundRow.created_at).getTime() > new Date(thread.lastMessageAt).getTime()) {
        thread.lastMessageAt = outboundRow.created_at
        thread.lastMessagePreview = outboundRow.message_text || '[saida sem texto]'
        thread.lastMessageDirection = 'outbound'
        thread.lastMessageType = outboundRow.message_type || 'outbound'
      }
    }

    if (candidatePhones.size > 0) {
      for (const phone of candidatePhones) {
        ensureThread(phone)
      }
    }

    const phones = [...threadMap.values()].map((thread) => thread.remotePhone)
    const [controlMap, customerLinkMap] = await Promise.all([
      loadCustomerControlMap(storeId, phones),
      loadCustomerLinkMap(storeId, phones),
    ])
    for (const [phone, mode] of controlMap.entries()) {
      if (mode === 'force_human') ensureThread(phone)
    }
    const allPhones = [...threadMap.values()].map((thread) => thread.remotePhone)
    const linkedCustomerIds = [...customerLinkMap.values()]
    const knownCustomerIds = [...threadMap.values()]
      .map((thread) => thread.lastKnownCustomerId)
      .filter((id): id is number => Number.isFinite(id))
    const resolvedCustomers = mergeCustomers(
      customers,
      await loadCustomersByIds(storeId, [...linkedCustomerIds, ...knownCustomerIds]),
      await loadCustomersByPhoneHints(storeId, allPhones)
    )

    let threads = [...threadMap.values()].map((accumulator) => {
      const remotePhone = accumulator.remotePhone
      const linkedCustomerId = findMapValueByPhoneMatch(customerLinkMap, remotePhone)
      const customer = findCustomerById(linkedCustomerId ?? null, resolvedCustomers)
        || matchedCustomers.find((item) => findCustomerByPhone(remotePhone, [item]))
        || findCustomerByPhone(remotePhone, resolvedCustomers)
        || findCustomerById(accumulator.lastKnownCustomerId, resolvedCustomers)
      return buildThreadListItem(remotePhone, accumulator, customer, findMapValueByPhoneMatch(controlMap, remotePhone) || 'auto')
    })

    if (query && candidatePhones.size === 0 && numericQuery.length === 0) {
      threads = threads.filter((thread) =>
        thread.customer?.name.toLowerCase().includes(query.toLowerCase())
      )
    }

    if (input.onlyPending) {
      threads = threads.filter((thread) => thread.hasPendingHandoff)
    }

    threads.sort((left, right) => {
      const leftPriority = left.hasPendingHandoff ? 2 : left.overrideMode === 'force_human' ? 1 : 0
      const rightPriority = right.hasPendingHandoff ? 2 : right.overrideMode === 'force_human' ? 1 : 0
      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority
      }

      const leftTime = left.lastMessageAt ? new Date(left.lastMessageAt).getTime() : 0
      const rightTime = right.lastMessageAt ? new Date(right.lastMessageAt).getTime() : 0
      return rightTime - leftTime
    })

    return {
      success: true,
      message: '',
      threads: threads.slice(0, limit),
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to load threads:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel carregar as conversas do WhatsApp.'),
      threads: [],
    }
  }
}

export async function getWhatsAppOperatorThreadDetail(input: {
  storeId: number
  remotePhone: string
  limit?: number
}): Promise<WhatsAppOperatorThreadDetailResult> {
  try {
    const storeId = Number(input.storeId)
    const remotePhone = normalizeRemotePhone(String(input.remotePhone || ''))
    const limit = Math.max(1, Math.min(Number(input.limit || DEFAULT_THREAD_DETAIL_LIMIT), 500))

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.', data: null }
    }

    if (!remotePhone) {
      return { success: false, message: 'Telefone invalido.', data: null }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const customers = await loadStoreCustomers(storeId)
    const [controlMap, customerLinkMap] = await Promise.all([
      loadCustomerControlMap(storeId, [remotePhone]),
      loadCustomerLinkMap(storeId, [remotePhone]),
    ])

    const phoneLast8 = digitsOnly(remotePhone).slice(-8)
    const inboundBaseQuery = (supabaseAdmin.from('whatsapp_inbound_messages') as any)
      .select('id, provider_message_id, remote_phone, message_text, payload, status, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(Math.max(limit * 3, limit))
    const outboundBaseQuery = (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .select('id, inbound_message_id, provider_message_id, remote_phone, message_text, message_type, status, payload, error_message, sent_at, created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: false })
      .limit(Math.max(limit * 3, limit))
    const stateBaseQuery = (supabaseAdmin.from('whatsapp_conversation_states') as any)
      .select('id, channel_id, remote_phone, state, metadata, expires_at, updated_at')
      .eq('store_id', storeId)

    if (phoneLast8) {
      inboundBaseQuery.ilike('remote_phone', `%${phoneLast8}%`)
      outboundBaseQuery.ilike('remote_phone', `%${phoneLast8}%`)
      stateBaseQuery.ilike('remote_phone', `%${phoneLast8}%`)
    }

    const [{ data: inboundRows, error: inboundError }, { data: outboundRows, error: outboundError }, { data: stateRow, error: stateError }] = await Promise.all([
      inboundBaseQuery,
      outboundBaseQuery,
      stateBaseQuery.order('updated_at', { ascending: false }).limit(20),
    ])

    if (inboundError) throw inboundError
    if (outboundError) throw outboundError
    if (stateError) throw stateError

    const filteredInboundRows = ((inboundRows || []) as InboundRow[])
      .filter((row) => phonesBelongToSameThread(row.remote_phone, remotePhone))
      .slice(0, limit)
    const filteredOutboundRows = ((outboundRows || []) as OutboundRow[])
      .filter((row) => phonesBelongToSameThread(row.remote_phone, remotePhone))
      .slice(0, limit)
    const matchedStateRow = ((stateRow || []) as ConversationStateRow[])
      .find((row) => phonesBelongToSameThread(row.remote_phone, remotePhone)) || null
    const pendingHandoffResolutions = await loadPendingHandoffResolutions(
      supabaseAdmin,
      storeId,
      matchedStateRow ? [matchedStateRow] : []
    )
    const pendingHandoff = findPendingHandoffResolution(pendingHandoffResolutions, remotePhone)

    const inboundIds = filteredInboundRows.map((row) => row.id)
    let aiLogs: AiLogRow[] = []

    if (inboundIds.length > 0) {
      const { data: aiLogRows, error: aiLogsError } = await (supabaseAdmin.from('whatsapp_ai_logs') as any)
        .select('id, inbound_message_id, provider, model_name, latency_ms, intent, confidence, is_success, error_message, raw_request, raw_response, created_at')
        .in('inbound_message_id', inboundIds)
        .order('created_at', { ascending: false })

      if (aiLogsError) throw aiLogsError
      aiLogs = (aiLogRows || []) as AiLogRow[]
    }

    const latestAiLogByInboundId = new Map<number, AiLogRow>()
    for (const log of aiLogs) {
      if (!log.inbound_message_id || latestAiLogByInboundId.has(log.inbound_message_id)) continue
      latestAiLogByInboundId.set(log.inbound_message_id, log)
    }

    const messages: WhatsAppOperatorThreadMessage[] = [
      ...filteredInboundRows.map((row) => {
        const technicalLog = latestAiLogByInboundId.get(row.id)
        const tokenUsage = extractTokenUsage(technicalLog?.raw_response)

        return {
          id: `inbound-${row.id}`,
          sourceId: row.id,
          direction: 'inbound' as const,
          actor: 'customer' as const,
          remotePhone: row.remote_phone,
          text: row.message_text || asString(asRecord(row.payload).caption),
          messageType: 'inbound',
          status: row.status,
          createdAt: row.created_at,
          providerMessageId: row.provider_message_id,
          inboundMessageId: row.id,
          payload: row.payload,
          errorMessage: null,
          technicalLog: technicalLog ? {
            intent: technicalLog.intent,
            confidence: technicalLog.confidence,
            provider: technicalLog.provider,
            model: technicalLog.model_name,
            latencyMs: technicalLog.latency_ms,
            inputTokens: tokenUsage.inputTokens,
            outputTokens: tokenUsage.outputTokens,
            totalTokens: tokenUsage.totalTokens,
            errorMessage: technicalLog.error_message,
            createdAt: technicalLog.created_at,
          } : null,
        }
      }),
      ...filteredOutboundRows.map((row) => ({
        id: `outbound-${row.id}`,
        sourceId: row.id,
        direction: 'outbound' as const,
        actor: inferOutboundActor(row.message_type, row.payload),
        remotePhone: row.remote_phone,
        text: row.message_text,
        messageType: row.message_type,
        status: row.status,
        createdAt: row.created_at,
        providerMessageId: row.provider_message_id,
        inboundMessageId: row.inbound_message_id,
        payload: row.payload,
        errorMessage: row.error_message,
        technicalLog: null,
      })),
    ].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())

    const stateMetadata = asRecord(matchedStateRow?.metadata)
    const latestAiLog = aiLogs[0] || null
    const latestAiTokens = extractTokenUsage(latestAiLog?.raw_response)
    const linkedCustomerId = findMapValueByPhoneMatch(customerLinkMap, remotePhone)
    const resolvedCustomers = mergeCustomers(
      customers,
      await loadCustomersByIds(storeId, [
        linkedCustomerId ?? 0,
        asNumber(stateMetadata.lastKnownCustomerId) ?? 0,
      ]),
      await loadCustomersByPhoneHints(storeId, [remotePhone])
    )
    const customer = findCustomerById(linkedCustomerId ?? null, resolvedCustomers)
      || findCustomerByPhone(remotePhone, resolvedCustomers)
      || findCustomerById(asNumber(stateMetadata.lastKnownCustomerId), resolvedCustomers)
    const lastMessage = messages[messages.length - 1] || null

    const thread = buildThreadListItem(
      remotePhone,
      {
        ...createThreadAccumulator(remotePhone),
        currentState: matchedStateRow?.state ?? null,
        stateExpiresAt: matchedStateRow?.expires_at ?? null,
        stateUpdatedAt: matchedStateRow?.updated_at ?? null,
        hasPendingHandoff: pendingHandoff?.isPending === true,
        pendingHandoffOrigin: pendingHandoff?.origin ?? null,
        internalNote: asString(stateMetadata.handoff_internal_note),
        extractedReceipt: (stateMetadata.ai_extracted_receipt as Json | undefined) ?? null,
        latestIntent: asString(stateMetadata.lastIntent) || asString(stateMetadata.aiIntent),
        latestConfidence: asNumber(stateMetadata.lastIntentConfidence) ?? asNumber(stateMetadata.aiConfidence),
        latestAction: asString(stateMetadata.lastAction),
        latestOutboundType: asString(stateMetadata.lastOutboundType),
        lastKnownCustomerId: asNumber(stateMetadata.lastKnownCustomerId),
        hasRecentAttachment: stateMetadata.lastInboundHasAttachment === true,
        lastMessageAt: lastMessage?.createdAt ?? null,
        lastMessagePreview: lastMessage?.text ?? null,
        lastMessageDirection: lastMessage?.direction ?? null,
        lastMessageType: lastMessage?.messageType ?? null,
        messageCount: messages.length,
      },
      customer,
      findMapValueByPhoneMatch(controlMap, remotePhone) || 'auto'
    )

    return {
      success: true,
      message: '',
      data: {
        thread,
        messages,
        technicalSummary: {
          overrideMode: findMapValueByPhoneMatch(controlMap, remotePhone) || 'auto',
          conversationState: matchedStateRow?.state ?? null,
          stateExpiresAt: matchedStateRow?.expires_at ?? null,
          stateUpdatedAt: matchedStateRow?.updated_at ?? null,
          handoffInternalNote: asString(stateMetadata.handoff_internal_note),
          latestIntent: asString(stateMetadata.lastIntent) || asString(stateMetadata.aiIntent),
          latestConfidence: asNumber(stateMetadata.lastIntentConfidence) ?? asNumber(stateMetadata.aiConfidence),
        latestAction: asString(stateMetadata.lastAction),
        latestOutboundType: asString(stateMetadata.lastOutboundType),
        latestInboundText: asString(stateMetadata.lastInboundText),
        latestInboundHasAttachment: stateMetadata.lastInboundHasAttachment === true,
        latestInboundAttachmentKind: asString(stateMetadata.lastInboundAttachmentKind),
        operationalDecision: buildOperationalDecisionSummary(
          matchedStateRow?.state ?? null,
          stateMetadata
        ),
        aiSessionHistory: parseAiSessionHistory(stateMetadata.aiSessionMessages),
        aiSessionUpdatedAt: asString(stateMetadata.aiSessionUpdatedAt),
        aiSessionEndedAt: asString(stateMetadata.aiSessionEndedAt),
        latestAiLog: latestAiLog ? {
          intent: latestAiLog.intent,
          confidence: latestAiLog.confidence,
            provider: latestAiLog.provider,
            model: latestAiLog.model_name,
            latencyMs: latestAiLog.latency_ms,
            inputTokens: latestAiTokens.inputTokens,
            outputTokens: latestAiTokens.outputTokens,
            totalTokens: latestAiTokens.totalTokens,
            errorMessage: latestAiLog.error_message,
            createdAt: latestAiLog.created_at,
          } : null,
          extractedReceipt: (stateMetadata.ai_extracted_receipt as Json | undefined) ?? null,
          paymentInstallmentHint: parsePaymentInstallmentHint(stateMetadata.paymentInstallmentHint),
          metadata: matchedStateRow?.metadata ?? null,
        },
      },
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to load thread detail:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel carregar a thread do WhatsApp.'),
      data: null,
    }
  }
}

export async function sendWhatsAppOperatorMessage(input: {
  storeId: number
  remotePhone: string
  messageText: string
}): Promise<WhatsAppOperatorSendMessageResult> {
  try {
    const storeId = Number(input.storeId)
    const remotePhone = normalizeRemotePhone(String(input.remotePhone || ''))
    const messageText = String(input.messageText || '').trim()

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.' }
    }

    if (!remotePhone) {
      return { success: false, message: 'Telefone invalido.' }
    }

    if (!messageText) {
      return { success: false, message: 'Digite uma mensagem para enviar.' }
    }

    if (messageText.length > 5000) {
      return { success: false, message: 'Mensagem muito longa.' }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const { data: channel, error: channelError } = await (supabaseAdmin.from('whatsapp_store_channels') as any)
      .select('id, tenant_id, store_id, instance_key, is_active, connection_status')
      .eq('store_id', storeId)
      .eq('provider', 'evolution')
      .eq('is_active', true)
      .eq('connection_status', 'connected')
      .maybeSingle()

    if (channelError) throw channelError
    if (!channel?.instance_key) {
      return { success: false, message: 'WhatsApp da loja nao esta conectado.' }
    }

    await markStoreInitiatedConversation({
      instanceKey: channel.instance_key,
      phone: remotePhone,
      messageText,
      mirrorOutbound: false,
      payload: {
        source: 'operator_modal',
        manual: true,
      },
    })

    const { data: outbound, error: outboundError } = await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .insert({
        tenant_id: channel.tenant_id,
        store_id: storeId,
        channel_id: channel.id,
        inbound_message_id: null,
        remote_phone: remotePhone,
        message_text: messageText,
        message_type: 'operator_manual',
        status: 'pending',
        payload: {
          source: 'operator_modal',
          manual: true,
          sentBy: 'operator',
        },
      })
      .select('id')
      .single()

    if (outboundError) throw outboundError

    try {
      await sendAutomationMessage({
        instanceKey: channel.instance_key,
        phone: remotePhone,
        text: messageText,
        outboundMessageId: outbound.id,
      })
    } catch (sendError) {
      await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
        .update({
          status: 'failed',
          error_message: sendError instanceof Error ? sendError.message : String(sendError),
        })
        .eq('id', outbound.id)

      return {
        success: false,
        message: sendError instanceof Error ? sendError.message : 'Falha ao enviar mensagem real.',
      }
    }

    await (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .update({
        status: 'sent',
        sent_at: new Date().toISOString(),
      })
      .eq('id', outbound.id)

    return {
      success: true,
      message: 'Mensagem enviada e conversa pausada para atendimento humano.',
      outboundMessageId: outbound.id,
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to send operator message:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel enviar a mensagem real.'),
    }
  }
}

export async function setWhatsAppCustomerControl(input: {
  storeId: number
  remotePhone: string
  mode: WhatsAppCustomerControlMode
}): Promise<{ success: boolean; message: string; mode?: WhatsAppCustomerControlMode }> {
  try {
    const storeId = Number(input.storeId)
    const remotePhone = normalizeRemotePhone(String(input.remotePhone || ''))
    const mode: WhatsAppCustomerControlMode = input.mode === 'force_ai' || input.mode === 'force_human' ? input.mode : 'auto'

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.' }
    }

    if (!remotePhone) {
      return { success: false, message: 'Telefone invalido.' }
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, message: 'Usuario nao autenticado.' }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const { data: channel, error: channelError } = await (supabaseAdmin.from('whatsapp_store_channels') as any)
      .select('id, tenant_id')
      .eq('store_id', storeId)
      .eq('provider', 'evolution')
      .maybeSingle()

    if (channelError) throw channelError
    if (!channel?.id || !channel?.tenant_id) {
      return { success: false, message: 'Canal WhatsApp da loja nao encontrado.' }
    }

    if (mode === 'auto') {
      const { error } = await (supabaseAdmin.from('whatsapp_customer_control') as any)
        .delete()
        .eq('channel_id', channel.id)
        .eq('remote_phone', remotePhone)

      if (error) throw error
      return { success: true, message: 'Cliente voltou para o modo automatico.', mode }
    }

    if (mode === 'force_ai') {
      const { error: stateClearError } = await (supabaseAdmin.from('whatsapp_conversation_states') as any)
        .delete()
        .eq('channel_id', channel.id)
        .eq('remote_phone', remotePhone)

      if (stateClearError) throw stateClearError
    }

    const { error } = await (supabaseAdmin.from('whatsapp_customer_control') as any)
      .upsert({
        tenant_id: channel.tenant_id,
        store_id: storeId,
        channel_id: channel.id,
        remote_phone: remotePhone,
        mode,
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'channel_id,remote_phone' })

    if (error) throw error

    return {
      success: true,
      message: mode === 'force_human'
        ? 'Cliente fixado em atendimento humano.'
        : 'Cliente marcado para a proxima chamada entrar pela IA.',
      mode,
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to set customer control:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel alterar o modo do cliente.'),
    }
  }
}

export async function getWhatsAppRetentionPreview(input: {
  storeId: number
}): Promise<WhatsAppRetentionPreviewResult> {
  try {
    const storeId = Number(input.storeId)
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.', data: null }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const scope = await buildWhatsAppRetentionScope(supabaseAdmin, storeId)
    const queries = buildWhatsAppRetentionQueries(supabaseAdmin, storeId, scope, 'count')

    const [aiLogs, expiredStates, inboundMessages, outboundMessages] = await Promise.all([
      countQuery(queries.aiLogs),
      countQuery(queries.expiredStates),
      countQuery(queries.inboundMessages),
      countQuery(queries.outboundMessages),
    ])

    const data: WhatsAppRetentionPreview = {
      policy: {
        aiLogsDays: WHATSAPP_RETENTION_AI_LOG_DAYS,
        messagesDays: WHATSAPP_RETENTION_MESSAGE_DAYS,
        expiredStatesDays: WHATSAPP_RETENTION_EXPIRED_STATE_DAYS,
      },
      cutoffs: {
        aiLogsBefore: scope.aiLogsBefore,
        messagesBefore: scope.messagesBefore,
        expiredStatesBefore: scope.expiredStatesBefore,
      },
      protectedThreads: {
        forceHuman: scope.forceHumanPhones.size,
        activeHandoff: scope.activeHandoffPhones.size,
        totalUnique: scope.protectedPhones.length,
      },
      candidates: {
        aiLogs,
        expiredStates,
        inboundMessages,
        outboundMessages,
        total: aiLogs + expiredStates + inboundMessages + outboundMessages,
      },
    }

    return {
      success: true,
      message: 'Previa de retencao calculada.',
      data,
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to preview retention:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel calcular a previa de retencao.'),
      data: null,
    }
  }
}

export async function runWhatsAppRetentionCleanup(input: {
  storeId: number
  confirmation: string
}): Promise<WhatsAppRetentionCleanupResult> {
  try {
    const storeId = Number(input.storeId)
    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.', deleted: null, preview: null }
    }

    if (input.confirmation !== 'CONFIRMAR_FAXINA_WHATSAPP') {
      return { success: false, message: 'Confirmacao invalida para executar a faxina.', deleted: null, preview: null }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const scope = await buildWhatsAppRetentionScope(supabaseAdmin, storeId)
    const queries = buildWhatsAppRetentionQueries(supabaseAdmin, storeId, scope, 'ids')

    const [aiLogIds, expiredStateIds, outboundIds, inboundIds] = await Promise.all([
      selectIds(queries.aiLogs.order('created_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
      selectIds(queries.expiredStates.order('updated_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
      selectIds(queries.outboundMessages.order('created_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
      selectIds(queries.inboundMessages.order('created_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
    ])

    const aiLogs = await deleteByIds(supabaseAdmin, 'whatsapp_ai_logs', aiLogIds)
    const expiredStates = await deleteByIds(supabaseAdmin, 'whatsapp_conversation_states', expiredStateIds)
    const outboundMessages = await deleteByIds(supabaseAdmin, 'whatsapp_outbound_messages', outboundIds)
    const inboundMessages = await deleteByIds(supabaseAdmin, 'whatsapp_inbound_messages', inboundIds)
    const total = aiLogs + expiredStates + inboundMessages + outboundMessages

    const nextPreview = await getWhatsAppRetentionPreview({ storeId })

    return {
      success: true,
      message: total > 0
        ? `Faxina executada: ${total} registro(s) removido(s).`
        : 'Nenhum registro elegivel para remover nesta rodada.',
      deleted: {
        aiLogs,
        expiredStates,
        inboundMessages,
        outboundMessages,
        total,
      },
      preview: nextPreview.data,
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to run retention cleanup:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel executar a faxina de WhatsApp.'),
      deleted: null,
      preview: null,
    }
  }
}

export async function simulateWhatsAppOperatorMessage(input: {
  storeId: number
  remotePhone: string
  messageText: string
}): Promise<WhatsAppOperatorSimulationResult> {
  try {
    const storeId = Number(input.storeId)
    const remotePhone = normalizeRemotePhone(String(input.remotePhone || ''))
    const messageText = String(input.messageText || '').trim()

    if (!Number.isFinite(storeId) || storeId <= 0) {
      return { success: false, message: 'Loja invalida.', data: null }
    }

    if (!remotePhone) {
      return { success: false, message: 'Telefone invalido.', data: null }
    }

    if (!messageText) {
      return { success: false, message: 'Digite uma mensagem para simular.', data: null }
    }

    const { supabaseAdmin } = await getViewContext(storeId)
    const { data: channel, error: channelError } = await (supabaseAdmin.from('whatsapp_store_channels') as any)
      .select('instance_key, is_active, connection_status')
      .eq('store_id', storeId)
      .eq('provider', 'evolution')
      .eq('is_active', true)
      .eq('connection_status', 'connected')
      .maybeSingle()

    if (channelError) throw channelError
    if (!channel?.instance_key) {
      return { success: false, message: 'WhatsApp da loja nao esta conectado.', data: null }
    }

    const simulation = await simulateCustomerStatus({
      instanceKey: channel.instance_key,
      phone: remotePhone,
      messageText,
      payload: null,
      providerMessageId: `simulation-${Date.now()}`,
    })

    return {
      success: true,
      message: simulation.shouldReply ? 'Simulacao concluida.' : 'Simulacao concluida sem resposta automatica.',
      data: simulation,
    }
  } catch (error) {
    console.error('[WhatsApp Operator] Failed to simulate message:', error)
    return {
      success: false,
      message: formatActionError(error, 'Nao foi possivel simular a mensagem.'),
      data: null,
    }
  }
}
