/* eslint-disable @typescript-eslint/no-explicit-any */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WhatsAppRetentionPreview } from '@/lib/actions/whatsapp-operator.actions'
import { isOperatorPauseActive } from '@/lib/whatsapp/human-control-policy'
import { WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS } from '@/lib/whatsapp/redesign/contracts'
import { toEvolutionNumber } from '@/lib/whatsapp/phone'
import { hasProtectedRedesignHumanControl, retentionPhoneVariants } from './retention-policy'

const WHATSAPP_RETENTION_AI_LOG_DAYS = 30
const WHATSAPP_RETENTION_MESSAGE_DAYS = 15
const WHATSAPP_RETENTION_EXPIRED_STATE_DAYS = 7
const WHATSAPP_RETENTION_DELETE_BATCH_LIMIT = 250

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

async function deleteByIds(query: any, ids: Array<number | string>) {
  if (ids.length === 0) return 0
  const { count, error } = await query.in('id', ids)

  if (error) throw error
  return Number(count || 0)
}

async function readAllRows(query: () => any) {
  const rows: Array<Record<string, any>> = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await query().order('id', { ascending: true }).range(offset, offset + pageSize - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < pageSize) return rows
  }
}

async function buildWhatsAppRetentionScope(supabaseAdmin: ReturnType<typeof createAdminClient>, storeId: number) {
  const nowIso = new Date().toISOString()
  const aiLogsBefore = daysAgoIso(WHATSAPP_RETENTION_AI_LOG_DAYS)
  const messagesBefore = daysAgoIso(WHATSAPP_RETENTION_MESSAGE_DAYS)
  const expiredStatesBefore = daysAgoIso(WHATSAPP_RETENTION_EXPIRED_STATE_DAYS)

  const [forceHumanRows, candidateStateRows, memoryRows, pendingOutboundRows] = await Promise.all([
    readAllRows(() => (supabaseAdmin.from('whatsapp_customer_control') as any)
      .select('remote_phone')
      .eq('store_id', storeId)
      .eq('mode', 'force_human')),
    readAllRows(() => (supabaseAdmin.from('whatsapp_conversation_states') as any)
      .select('remote_phone, state, metadata, updated_at, expires_at, handoff_pending')
      .eq('store_id', storeId)
      .in('state', ['awaiting_human', 'human_pause', 'waiting_human_after_attachment'])),
    readAllRows(() => (supabaseAdmin.from('whatsapp_conversation_memory') as any)
      .select('remote_phone, summary')
      .eq('store_id', storeId)
      .or('summary->>customerControlMode.eq.force_human,summary->>humanControl.in.(human_pending,human_active)')),
    readAllRows(() => (supabaseAdmin.from('whatsapp_outbound_messages') as any)
      .select('remote_phone')
      .eq('store_id', storeId)
      .in('status', ['pending', 'sending', 'failed'])),
  ])

  const forceHumanPhones = new Set<string>((forceHumanRows || []).map((row: any) => toEvolutionNumber(String(row.remote_phone || ''))).filter(Boolean))
  const activeHandoffRows = ((candidateStateRows || []) as Array<Record<string, any>>).filter((row) => {
    const pendingHandoff = row.handoff_pending === true
      && typeof row.expires_at === 'string'
      && Date.parse(row.expires_at) > Date.parse(nowIso)
    const operatorPause = isOperatorPauseActive({
      state: String(row.state || ''),
      metadata: row.metadata,
      updatedAt: String(row.updated_at || ''),
      nowMs: Date.parse(nowIso),
      pauseMs: WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS,
    })
    return pendingHandoff || operatorPause
  })
  const redesignHumanRows = (memoryRows || []).filter((row: any) => hasProtectedRedesignHumanControl(row.summary || {}))
  const activeHandoffPhones = new Set<string>([...activeHandoffRows, ...redesignHumanRows].map((row) => toEvolutionNumber(String(row.remote_phone || ''))).filter(Boolean))
  const protectedPhones = [...new Set([...forceHumanPhones, ...activeHandoffPhones])]
  const excludedMessagePhones = retentionPhoneVariants([
    ...protectedPhones,
    ...(pendingOutboundRows || []).map((row: any) => String(row.remote_phone || '')),
  ])

  return {
    nowIso,
    aiLogsBefore,
    messagesBefore,
    expiredStatesBefore,
    forceHumanPhones,
    activeHandoffPhones,
    protectedPhones,
    excludedMessagePhones,
  }
}

type WhatsAppRetentionQueryMode = 'count' | 'ids' | 'delete'

function createRetentionQuery(supabaseAdmin: ReturnType<typeof createAdminClient>, tableName: string, mode: WhatsAppRetentionQueryMode) {
  if (mode === 'delete') return (supabaseAdmin.from(tableName) as any).delete({ count: 'exact' })
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

  let expiredStates = createRetentionQuery(supabaseAdmin, 'whatsapp_conversation_states', mode)
    .eq('store_id', storeId)
    .lt('expires_at', scope.nowIso)
    .lt('updated_at', scope.expiredStatesBefore)
    .not('state', 'in', '("awaiting_human","human_pause","waiting_human_after_attachment")')

  let inboundMessages = createRetentionQuery(supabaseAdmin, 'whatsapp_inbound_messages', mode)
    .eq('store_id', storeId)
    .lt('created_at', scope.messagesBefore)
    .in('status', ['processed', 'ignored'])

  let outboundMessages = createRetentionQuery(supabaseAdmin, 'whatsapp_outbound_messages', mode)
    .eq('store_id', storeId)
    .lt('created_at', scope.messagesBefore)
    .in('status', ['sent', 'cancelled'])

  if (scope.excludedMessagePhones.length > 0) {
    const protectedList = postgrestTextInList(scope.excludedMessagePhones)
    inboundMessages = inboundMessages.not('remote_phone', 'in', protectedList)
    outboundMessages = outboundMessages.not('remote_phone', 'in', protectedList)
  }
  if (scope.protectedPhones.length > 0) {
    expiredStates = expiredStates.not('remote_phone', 'in', postgrestTextInList(retentionPhoneVariants(scope.protectedPhones)))
  }

  return {
    aiLogs,
    expiredStates,
    inboundMessages,
    outboundMessages,
  }
}

export async function previewWhatsAppRetention(supabaseAdmin: ReturnType<typeof createAdminClient>, storeId: number): Promise<WhatsAppRetentionPreview> {
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

  return data
}

export async function cleanupWhatsAppRetention(supabaseAdmin: ReturnType<typeof createAdminClient>, storeId: number) {
  const scope = await buildWhatsAppRetentionScope(supabaseAdmin, storeId)
  const queries = buildWhatsAppRetentionQueries(supabaseAdmin, storeId, scope, 'ids')

  const [aiLogIds, expiredStateIds, outboundIds, inboundIds] = await Promise.all([
    selectIds(queries.aiLogs.order('created_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
    selectIds(queries.expiredStates.order('updated_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
    selectIds(queries.outboundMessages.order('created_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
    selectIds(queries.inboundMessages.order('created_at', { ascending: true }).limit(WHATSAPP_RETENTION_DELETE_BATCH_LIMIT)),
  ])

  // Re-read human controls and repeat eligibility filters at deletion time.
  const freshScope = await buildWhatsAppRetentionScope(supabaseAdmin, storeId)
  const deletionQueries = buildWhatsAppRetentionQueries(supabaseAdmin, storeId, freshScope, 'delete')
  const aiLogs = await deleteByIds(deletionQueries.aiLogs, aiLogIds)
  const expiredStates = await deleteByIds(deletionQueries.expiredStates, expiredStateIds)
  const outboundMessages = await deleteByIds(deletionQueries.outboundMessages, outboundIds)
  const inboundMessages = await deleteByIds(deletionQueries.inboundMessages, inboundIds)
  const total = aiLogs + expiredStates + inboundMessages + outboundMessages

  return { aiLogs, expiredStates, inboundMessages, outboundMessages, total }
}
