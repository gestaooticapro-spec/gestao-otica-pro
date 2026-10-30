import { loadEnvConfig } from '@next/env'
import { createAdminClient } from '../src/lib/supabase/admin'

type Command = 'status' | 'enable' | 'disable' | 'check-recent'

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {}
}

async function main() {
  const command = process.argv[2] as Command
  if (!['status', 'enable', 'disable', 'check-recent'].includes(command) || process.argv.length !== 3) {
    throw new Error('uso: status | enable | disable | check-recent')
  }

  if (command === 'enable' || command === 'disable') {
    throw new Error('O redesign e o padrao do programa; este comando antigo nao altera mais o atendimento. Use as configuracoes de WhatsApp da loja.')
  }

  loadEnvConfig(process.cwd())
  const admin = createAdminClient()
  const { data: store, error } = await (admin.from('stores') as any)
    .select('settings,pix_key,street,number,city,state')
    .eq('id', 1)
    .single()
  if (error || !store) throw new Error('loja_indisponivel')

  const settings = object(store.settings)
  const automation = object(settings.whatsapp_automation)
  const redesign = object(automation.ai_redesign)
  const modeShadow = redesign.mode === 'shadow'
  const enabled = redesign.safe_replies_enabled === true
  const hasPix = typeof store.pix_key === 'string' && store.pix_key.trim().length > 0
  const hasAddress = [store.street, store.number, store.city, store.state]
    .every((value) => typeof value === 'string' && value.trim().length > 0)
  const hasHours = Object.keys(object(settings.store_hours)).length > 0
  const { data: channels, error: channelError } = await (admin.from('whatsapp_store_channels') as any)
    .select('is_active,connection_status')
    .eq('store_id', 1)
  if (channelError) throw new Error('canal_indisponivel')
  const channelConnected = (channels ?? []).some((channel: { is_active: boolean; connection_status: string }) =>
    channel.is_active && channel.connection_status === 'connected'
  )

  if (command === 'status') {
    console.log(JSON.stringify({ attendanceEngine: 'redesign', historicalModeShadow: modeShadow, historicalPilotEnabled: enabled, automationEnabled: automation.enabled !== false,
      channelConnected, hasHours, hasAddress, hasPix }))
    return
  }

  if (command === 'check-recent') {
    const since = new Date(Date.now() - 15 * 60_000).toISOString()
    const { data: inbounds, error: inboundError } = await (admin.from('whatsapp_inbound_messages') as any)
      .select('id,status,created_at,provider_message_id')
      .eq('store_id', 1)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(25)
    if (inboundError) throw new Error('inbound_indisponivel')
    const inboundIds = (inbounds ?? []).map((row: { id: number }) => row.id)
    const { data: outbounds, error: outboundError } = inboundIds.length
      ? await (admin.from('whatsapp_outbound_messages') as any)
        .select('inbound_message_id,status,message_type,payload,created_at')
        .in('inbound_message_id', inboundIds)
      : { data: [], error: null }
    if (outboundError) throw new Error('outbound_indisponivel')
    const outboundByInbound = new Map<number, Array<Record<string, unknown>>>()
    for (const outbound of outbounds ?? []) {
      const payload = object(outbound.payload)
      const canonical = object(payload.canonical)
      const action = typeof canonical.action === 'string' ? canonical.action : 'legacy_or_unlabeled'
      const intent = typeof canonical.intent === 'string' ? canonical.intent : 'unknown'
      const inboundId = Number(outbound.inbound_message_id)
      outboundByInbound.set(inboundId, [...(outboundByInbound.get(inboundId) ?? []), {
        action, intent, type: outbound.message_type, status: outbound.status,
        ageSeconds: Math.max(0, Math.round((Date.now() - Date.parse(outbound.created_at)) / 1000)),
      }])
    }
    const providerIds = [...new Set((inbounds ?? []).map((row: { provider_message_id: string }) => row.provider_message_id).filter(Boolean))]
    const { data: conversationMessages, error: messageError } = providerIds.length
      ? await (admin.from('whatsapp_conversation_messages') as any)
        .select('id,provider_message_id,conversation_id')
        .in('provider_message_id', providerIds)
      : { data: [], error: null }
    if (messageError) throw new Error('turn_message_lookup_failed')
    const messageIds = (conversationMessages ?? []).map((row: { id: string }) => row.id)
    const { data: turnLinks, error: linkError } = messageIds.length
      ? await (admin.from('whatsapp_conversation_turn_messages') as any)
        .select('turn_id,message_id')
        .in('message_id', messageIds)
      : { data: [], error: null }
    if (linkError) throw new Error('turn_lookup_failed')
    const turnIds = [...new Set((turnLinks ?? []).map((row: { turn_id: string }) => row.turn_id))]
    const { data: turns, error: turnError } = turnIds.length
      ? await (admin.from('whatsapp_conversation_turns') as any)
        .select('id,status,metadata')
        .in('id', turnIds)
      : { data: [], error: null }
    if (turnError) throw new Error('turn_metadata_lookup_failed')
    const turnByMessage = new Map<string, unknown>()
    const turnById = new Map<string, unknown>((turns ?? []).map((turn: { id: string }) => [turn.id, turn]))
    for (const link of turnLinks ?? []) turnByMessage.set(link.message_id, turnById.get(link.turn_id))
    const providerByMessageId = new Map<string, string>((conversationMessages ?? []).map((row: { id: string; provider_message_id: string }) => [row.provider_message_id, row.id]))
    const report = (inbounds ?? []).slice(0, 10).map((inbound: {
      id: number; status: string; created_at: string; provider_message_id: string
    }) => {
      const messageId = providerByMessageId.get(inbound.provider_message_id)
      const turn = messageId ? object(turnByMessage.get(messageId)) : {}
      const metadata = object(turn.metadata)
      const shadow = object(metadata.shadowProcessing)
      const classification = object(shadow.classification)
      const decision = object(shadow.decision)
      return {
        inboundStatus: inbound.status,
        inboundAgeSeconds: Math.max(0, Math.round((Date.now() - Date.parse(inbound.created_at)) / 1000)),
        replies: outboundByInbound.get(inbound.id) ?? [],
        shadowTurnStatus: typeof turn.status === 'string' ? turn.status : 'not_found',
        shadowIntent: typeof classification.intent === 'string' ? classification.intent : 'pending_or_unavailable',
        shadowAction: typeof decision.action === 'string' ? decision.action : 'pending_or_unavailable',
      }
    })
    console.log(JSON.stringify({ inboundCount: inbounds?.length ?? 0, recent: report }))
    return
  }


}

main().catch(() => {
  // Erros do provedor podem conter dados da requisicao. Nunca imprimi-los aqui.
  console.error('stage4_operation_failed')
  process.exitCode = 1
})
