import { createAdminClient } from '@/lib/supabase/admin'

export type WhatsAppInboundProcessingTraceInput = {
  tenantId: string
  storeId: number
  channelId: number
  inboundMessageId: number
  stage: string
  outcome: string
  details?: Record<string, string | number | boolean | null | undefined>
}

const SAFE_DETAIL_KEYS = new Set([
  'action',
  'controlMode',
  'duplicate',
  'errorName',
  'intent',
  'latencyMs',
  'messageType',
  'model',
  'outboundId',
  'postSaleStage',
  'postSaleSource',
  'provider',
  'reason',
  'route',
  'shouldReply',
  'state',
  'explicitRatingDetected',
  'storeOnePilotSelected',
  'success',
  'task',
  'turnId',
  'validation',
])
const SAFE_TRACE_TOKEN = /^[a-zA-Z0-9_.:-]{1,120}$/

function safeToken(value: string) {
  return SAFE_TRACE_TOKEN.test(value) ? value : 'omitted'
}

function sanitizeDetails(details: WhatsAppInboundProcessingTraceInput['details']) {
  if (!details) return {}

  const sanitized: Record<string, string | number | boolean | null> = {}
  for (const [key, value] of Object.entries(details)) {
    if (!SAFE_DETAIL_KEYS.has(key) || value === undefined) continue
    if (typeof value === 'string' && SAFE_TRACE_TOKEN.test(value)) sanitized[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) sanitized[key] = value
    else if (typeof value === 'boolean' || value === null) sanitized[key] = value
  }
  return sanitized
}

export async function recordWhatsAppInboundProcessingEvent(
  input: WhatsAppInboundProcessingTraceInput
) {
  try {
    const supabase = createAdminClient()
    const { error } = await (supabase.from('whatsapp_inbound_processing_events') as any).insert({
      tenant_id: input.tenantId,
      store_id: input.storeId,
      channel_id: input.channelId,
      inbound_message_id: input.inboundMessageId,
      stage: safeToken(input.stage),
      outcome: safeToken(input.outcome),
      details: sanitizeDetails(input.details),
    })

    if (error) console.warn('[whatsapp_trace] persist_failed', { stage: input.stage })
  } catch {
    // A falha de observabilidade nunca deve alterar a resposta ou o envio.
    console.warn('[whatsapp_trace] persist_failed', { stage: input.stage })
  }
}
