import { createAdminClient } from '@/lib/supabase/admin'
import { recordWhatsAppInboundProcessingEvent } from '../inbound-processing-trace'
import type { CustomerStatusRequest, CustomerStatusResponse } from '../customer-status'

export class WhatsAppRedesignDecisionPending extends Error {}

type DeferredMarker = {
  turnId: string
  queuedAt: string
  nextAttemptAt: string
  leaseUntil: string
  attempts: number
}

function record(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

export async function deferWhatsAppRedesignReply(inboundId: number, turnId: string,
  statusContext?: Pick<CustomerStatusRequest, 'statusReferenceId' | 'statusInteractionType'>) {
  const db = createAdminClient() as any
  const { data: inbound, error } = await db.from('whatsapp_inbound_messages')
    .select('payload,tenant_id,store_id,channel_id').eq('id', inboundId).single()
  if (error) throw error
  const payload = record(inbound.payload)
  const previous = record(payload.redesignDeferred)
  const now = new Date().toISOString()
  const marker: DeferredMarker = {
    turnId, queuedAt: previous.queuedAt || now,
    attempts: previous.attempts || 0,
    nextAttemptAt: new Date(Date.now() + 90_000).toISOString(),
    leaseUntil: now,
  }
  const { error: updateError } = await db.from('whatsapp_inbound_messages')
    .update({ payload: { ...payload, ...statusContext, redesignDeferred: marker } }).eq('id', inboundId).eq('status', 'received')
  if (updateError) throw updateError
  await recordWhatsAppInboundProcessingEvent({
    tenantId: inbound.tenant_id, storeId: inbound.store_id, channelId: inbound.channel_id,
    inboundMessageId: inboundId, stage: 'redesign_decision', outcome: 'deferred',
    details: { turnId, reason: 'redesign_decision_pending' },
  })
}

/** Bounded durable recovery. The existing VPS reconciliation dispatches pending outbounds. */
export async function resumeDeferredWhatsAppRedesignReplies(
  resolve: (input: CustomerStatusRequest, options: { deferredInboundId: number }) => Promise<CustomerStatusResponse>,
  limit = 2,
) {
  const db = createAdminClient() as any
  const now = new Date().toISOString()
  const { data: settings, error: settingsError } = await db.from('stores').select('settings').eq('id', 1).single()
  if (settingsError) throw settingsError
  const automation = settings.settings?.whatsapp_automation
  if (automation?.ai_redesign?.mode !== 'redesign' || automation.ai_redesign.safe_replies_enabled !== true) {
    return { resumed: 0, skipped: 0 }
  }
  const { data: rows, error } = await db.from('whatsapp_inbound_messages')
    .select('id,tenant_id,store_id,channel_id,remote_phone,provider_message_id,message_text,provider_created_at,payload')
    .eq('store_id', 1).eq('status', 'received')
    .lte('payload->redesignDeferred->>nextAttemptAt', now)
    .lte('payload->redesignDeferred->>leaseUntil', now)
    .order('id').limit(Math.min(2, Math.max(1, limit)))
  if (error) throw error
  let resumed = 0
  let skipped = 0
  for (const row of rows || []) {
    const payload = record(row.payload)
    const marker = record(payload.redesignDeferred) as DeferredMarker
    // Atomic compare-and-set lease prevents simultaneous schedulers resuming the same inbound.
    const leased = { ...marker, attempts: marker.attempts + 1,
      leaseUntil: new Date(Date.now() + 120_000).toISOString() }
    const { data: claim, error: claimError } = await db.from('whatsapp_inbound_messages')
      .update({ payload: { ...payload, redesignDeferred: leased } }).eq('id', row.id).eq('status', 'received')
      .contains('payload', { redesignDeferred: marker }).select('id').maybeSingle()
    if (claimError) throw claimError
    if (!claim) { skipped++; continue }
    try {
      const { data: newer, error: newerError } = await db.from('whatsapp_inbound_messages').select('id')
        .eq('channel_id', row.channel_id).eq('remote_phone', row.remote_phone).gt('id', row.id).limit(1)
      if (newerError) throw newerError
      const expired = Date.now() - Date.parse(marker.queuedAt) > 30 * 60_000 || marker.attempts >= 5
      if (expired || newer?.length) {
        const reason = expired ? 'deferred_reply_expired' : 'deferred_reply_superseded'
        const { error: terminalError } = await db.from('whatsapp_inbound_messages')
          .update({ status: 'ignored' }).eq('id', row.id).eq('status', 'received')
        if (terminalError) throw terminalError
        await recordWhatsAppInboundProcessingEvent({
          tenantId: row.tenant_id, storeId: row.store_id, channelId: row.channel_id,
          inboundMessageId: row.id, stage: 'deferred_reply', outcome: 'suppressed', details: { reason },
        })
        skipped++; continue
      }
      const { data: channel, error: channelError } = await db.from('whatsapp_store_channels')
        .select('instance_key').eq('id', row.channel_id).eq('is_active', true).maybeSingle()
      if (channelError) throw channelError
      if (!channel) throw new Error('deferred_channel_unavailable')
      await resolve({
        instanceKey: channel.instance_key, phone: row.remote_phone,
        providerMessageId: row.provider_message_id, messageText: row.message_text || undefined,
        providerCreatedAt: row.provider_created_at, payload: row.payload,
        statusReferenceId: payload.statusReferenceId || null,
        statusInteractionType: payload.statusInteractionType || null,
      }, { deferredInboundId: row.id })
      resumed++
    } catch {
      // Keep the durable entry; the lease expires and permits another bounded attempt.
      await recordWhatsAppInboundProcessingEvent({
        tenantId: row.tenant_id, storeId: row.store_id, channelId: row.channel_id,
        inboundMessageId: row.id, stage: 'deferred_reply', outcome: 'retry_pending',
        details: { reason: 'deferred_resume_failed' },
      })
      skipped++
    }
  }
  return { resumed, skipped }
}
