import { loadEnvConfig } from '@next/env'
import { createAdminClient } from '../src/lib/supabase/admin'
import { getPhoneVariants } from '../src/lib/whatsapp/phone'
import {
  classifyWhatsAppLegacyOutcome,
  compareWhatsAppShadowWithLegacy,
  extractWhatsAppLegacyCanonicalEvidence,
  extractWhatsAppShadowDecisionEvidence,
  type WhatsAppLegacyDecisionEvidence,
  type WhatsAppShadowComparisonVerdict,
  type WhatsAppShadowOutcome,
} from '../src/lib/whatsapp/redesign/shadow-comparison'

type ConversationRow = { id: number; channel_id: number; remote_phone: string }
type TurnRow = { conversation_id: number; turn_key: string; metadata: unknown }
type InboundRow = {
  id: number
  channel_id: number
  provider_message_id: string
  status: WhatsAppLegacyDecisionEvidence['inboundStatus']
}
type OutboundRow = {
  inbound_message_id: number | null
  status: NonNullable<WhatsAppLegacyDecisionEvidence['outboundStatus']>
  message_type: string
  payload: unknown
  created_at: string
}

function numericArgument(name: string, fallback: number, maximum: number) {
  const raw = process.argv.find((argument) => argument.startsWith(`--${name}=`))?.split('=', 2)[1]
  const value = raw === undefined ? fallback : Number(raw)
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new Error(`${name} deve ser inteiro entre 1 e ${maximum}.`)
  }
  return value
}

function increment<T extends string>(target: Record<T, number>, key: T) {
  target[key] = (target[key] || 0) + 1
}

async function main() {
  const storeId = numericArgument('store-id', 1, Number.MAX_SAFE_INTEGER)
  const limit = numericArgument('limit', 50, 100)
  loadEnvConfig(process.cwd())
  const admin = createAdminClient()

  const { data: conversations, error: conversationError } = await (admin
    .from('whatsapp_conversation_memory') as any)
    .select('id,channel_id,remote_phone')
    .eq('store_id', storeId)
    .eq('mode', 'shadow')
  if (conversationError) throw conversationError
  const conversationRows = (conversations ?? []) as ConversationRow[]
  const conversationById = new Map(conversationRows.map((row) => [row.id, row]))

  const { data: latestTurnRows, error: latestTurnError } = conversationRows.length
    ? await (admin.from('whatsapp_conversation_turns') as any)
      .select('conversation_id,turn_key,status,closes_at,processed_at,metadata')
      .in('conversation_id', conversationRows.map((row) => row.id))
      .order('closes_at', { ascending: false })
      .limit(1)
    : { data: [], error: null }
  if (latestTurnError) throw latestTurnError
  const latestTurn = latestTurnRows?.[0] as {
    conversation_id: number
    turn_key: string
    status: string
    closes_at: string
    processed_at: string | null
    metadata: unknown
  } | undefined
  const latestConversation = latestTurn ? conversationById.get(latestTurn.conversation_id) : undefined
  const latestPhoneVariants = latestConversation
    ? [...getPhoneVariants(latestConversation.remote_phone)]
    : []
  const [{ data: latestStates, error: latestStateError }, { data: latestControls, error: latestControlError }] = latestConversation
    && latestPhoneVariants.length
    ? await Promise.all([
        (admin.from('whatsapp_conversation_states') as any)
          .select('state,expires_at')
          .eq('channel_id', latestConversation.channel_id)
          .in('remote_phone', latestPhoneVariants)
          .gt('expires_at', new Date().toISOString()),
        (admin.from('whatsapp_customer_control') as any)
          .select('mode')
          .eq('channel_id', latestConversation.channel_id)
          .in('remote_phone', latestPhoneVariants),
      ])
    : [{ data: [], error: null }, { data: [], error: null }]
  if (latestStateError) throw latestStateError
  if (latestControlError) throw latestControlError
  const latestMetadata = latestTurn?.metadata && typeof latestTurn.metadata === 'object'
    && !Array.isArray(latestTurn.metadata)
    ? latestTurn.metadata as Record<string, any>
    : {}
  if (!conversationRows.length) {
    console.log(JSON.stringify({
      storeId, inspected: 0, comparable: 0, verdicts: {}, shadowOutcomes: {},
      legacyOutcomes: {}, latestTurnState: null, privacy: 'no_ids_phones_messages_or_payloads',
    }))
    return
  }

  const { data: turns, error: turnError } = await (admin
    .from('whatsapp_conversation_turns') as any)
    .select('conversation_id,turn_key,metadata')
    .in('conversation_id', conversationRows.map((row) => row.id))
    .eq('status', 'processed')
    .order('closes_at', { ascending: false })
    .limit(limit)
  if (turnError) throw turnError
  const turnRows = ((turns ?? []) as TurnRow[]).filter((turn) => turn.turn_key.startsWith('inbound:'))
  const providerIds = [...new Set(turnRows.map((turn) => turn.turn_key.slice('inbound:'.length)).filter(Boolean))]

  const { data: inbounds, error: inboundError } = providerIds.length
    ? await (admin.from('whatsapp_inbound_messages') as any)
      .select('id,channel_id,provider_message_id,status')
      .eq('store_id', storeId)
      .in('provider_message_id', providerIds)
    : { data: [], error: null }
  if (inboundError) throw inboundError
  const inboundRows = (inbounds ?? []) as InboundRow[]
  const inboundByChannelAndProvider = new Map(
    inboundRows.map((row) => [`${row.channel_id}:${row.provider_message_id}`, row])
  )

  const inboundIds = inboundRows.map((row) => row.id)
  const { data: outbounds, error: outboundError } = inboundIds.length
    ? await (admin.from('whatsapp_outbound_messages') as any)
      .select('inbound_message_id,status,message_type,payload,created_at')
      .in('inbound_message_id', inboundIds)
      .order('created_at', { ascending: false })
    : { data: [], error: null }
  if (outboundError) throw outboundError
  const outboundByInboundId = new Map<number, OutboundRow>()
  for (const row of (outbounds ?? []) as OutboundRow[]) {
    if (row.inbound_message_id !== null && !outboundByInboundId.has(row.inbound_message_id)) {
      outboundByInboundId.set(row.inbound_message_id, row)
    }
  }

  const latestInbound = latestTurn && latestConversation
    ? inboundByChannelAndProvider.get(`${latestConversation.channel_id}:${latestTurn.turn_key.slice('inbound:'.length)}`)
    : undefined
  const latestOutbound = latestInbound ? outboundByInboundId.get(latestInbound.id) : undefined
  const latestLegacyOutcome = latestInbound
    ? classifyWhatsAppLegacyOutcome({
        inboundStatus: latestInbound.status,
        outboundStatus: latestOutbound?.status ?? null,
        messageType: latestOutbound?.message_type ?? null,
        ...extractWhatsAppLegacyCanonicalEvidence(latestOutbound?.payload),
      })
    : null
  const latestTurnState = latestTurn
    ? {
        status: latestTurn.status,
        closedSecondsAgo: Math.max(0, Math.round((Date.now() - Date.parse(latestTurn.closes_at)) / 1000)),
        processed: latestTurn.processed_at !== null,
        shadowDecisionReason: typeof latestMetadata.shadowProcessing?.decisionReason === 'string'
          ? latestMetadata.shadowProcessing.decisionReason
          : null,
        shadowStoreOpenNow: typeof latestMetadata.shadowProcessing?.decision?.facts?.isStoreOpenNow === 'boolean'
          ? latestMetadata.shadowProcessing.decision.facts.isStoreOpenNow
          : null,
        shadowHandoffTiming: ['during_open_hours', 'when_store_opens'].includes(
          latestMetadata.shadowProcessing?.decision?.humanHandoffTiming?.mode
        )
          ? latestMetadata.shadowProcessing.decision.humanHandoffTiming.mode
          : null,
        legacyInboundStatus: latestInbound?.status ?? null,
        legacyOutboundStatus: latestOutbound?.status ?? null,
        legacyOutcome: latestLegacyOutcome,
        legacyConversationState: typeof latestStates?.[0]?.state === 'string' ? latestStates[0].state : null,
        customerControlMode: typeof latestControls?.[0]?.mode === 'string' ? latestControls[0].mode : 'auto',
      }
    : null

  const verdicts: Partial<Record<WhatsAppShadowComparisonVerdict, number>> = {}
  const shadowOutcomes: Partial<Record<WhatsAppShadowOutcome, number>> = {}
  const legacyOutcomes: Partial<Record<WhatsAppShadowOutcome, number>> = {}
  const outcomePairs: Record<string, number> = {}
  const divergenceReasons: Record<string, number> = {}
  let inspected = 0
  let comparable = 0

  for (const turn of turnRows) {
    const shadow = extractWhatsAppShadowDecisionEvidence(turn.metadata)
    const conversation = conversationById.get(turn.conversation_id)
    if (!shadow || !conversation) continue
    inspected += 1
    const providerId = turn.turn_key.slice('inbound:'.length)
    const inbound = inboundByChannelAndProvider.get(`${conversation.channel_id}:${providerId}`)
    if (!inbound) continue
    const outbound = outboundByInboundId.get(inbound.id) ?? null
    const canonical = extractWhatsAppLegacyCanonicalEvidence(outbound?.payload)
    const comparison = compareWhatsAppShadowWithLegacy(shadow, {
      inboundStatus: inbound.status,
      outboundStatus: outbound?.status ?? null,
      messageType: outbound?.message_type ?? null,
      ...canonical,
    })
    increment(verdicts as Record<WhatsAppShadowComparisonVerdict, number>, comparison.verdict)
    increment(shadowOutcomes as Record<WhatsAppShadowOutcome, number>, comparison.shadowOutcome)
    increment(legacyOutcomes as Record<WhatsAppShadowOutcome, number>, comparison.legacyOutcome)
    increment(outcomePairs, `${comparison.shadowOutcome}->${comparison.legacyOutcome}`)
    if (comparison.verdict === 'divergent') {
      const reason = typeof (turn.metadata as any)?.shadowProcessing?.decisionReason === 'string'
        ? (turn.metadata as any).shadowProcessing.decisionReason
        : 'reason_unavailable'
      increment(divergenceReasons, reason)
    }
    if (comparison.verdict !== 'inconclusive') comparable += 1
  }

  // Saida deliberadamente agregada: nunca imprime identificadores, telefones,
  // textos de clientes, respostas, payloads ou credenciais.
  console.log(JSON.stringify({
    storeId,
    inspected,
    comparable,
    verdicts,
    shadowOutcomes,
    legacyOutcomes,
    outcomePairs,
    divergenceReasons,
    latestTurnState,
    privacy: 'no_ids_phones_messages_or_payloads',
  }))
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Falha na comparacao em sombra.')
  process.exitCode = 1
})
