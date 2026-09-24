import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPhoneVariants } from '../phone'
import {
  WhatsAppConversationSummarySchema,
  WhatsAppRedesignClassificationSchema,
  defaultConversationSummary,
  type WhatsAppConversationMemory,
  type WhatsAppConversationMessage,
  type WhatsAppConversationSummary,
  type WhatsAppRedesignClassification,
} from './contracts'
import {
  WhatsAppConversationIdentitySchema,
  WhatsAppConversationTurnDraftSchema,
  WhatsAppStoredMessageInputSchema,
  buildConversationMemory,
  toConversationMessage,
  type WhatsAppConversationIdentity,
  type WhatsAppConversationTurnDraft,
  type WhatsAppStoredMessageInput,
} from './persistence'
import {
  applyConfirmedControlEvent,
  reconcileConfirmedHumanActivity,
  reconcileLegacyManualPause,
  replayWhatsAppConversationSummary,
  type WhatsAppProcessedTurnForSummary,
} from './memory-consolidation'

type RedesignStoreClient = SupabaseClient<Database>
type ConversationRow = Database['public']['Tables']['whatsapp_conversation_memory']['Row']
type MessageRow = Database['public']['Tables']['whatsapp_conversation_messages']['Row']
type TurnRow = Database['public']['Tables']['whatsapp_conversation_turns']['Row']
type StoreRow = Database['public']['Tables']['stores']['Row']

export type WhatsAppRedesignTurnContext = {
  turn: TurnRow
  conversation: ConversationRow
  memory: WhatsAppConversationMemory
  turnMessages: WhatsAppConversationMessage[]
}

function asJson(value: unknown): Json {
  return value as Json
}

export class WhatsAppRedesignConversationStore {
  constructor(private readonly client: RedesignStoreClient = createAdminClient()) {}

  async getOrCreateConversation(identityInput: WhatsAppConversationIdentity): Promise<ConversationRow> {
    const identity = WhatsAppConversationIdentitySchema.parse(identityInput)
    const existing = await this.findConversation(identity.channelId, identity.remotePhone)
    if (existing) {
      if (existing.mode === identity.mode) return existing
      const { data: updated, error: updateError } = await (this.client
        .from('whatsapp_conversation_memory') as any)
        .update({ mode: identity.mode, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select('*')
        .single()
      if (updateError) throw updateError
      return updated
    }

    const createdAt = new Date().toISOString()
    const { data, error } = await (this.client
      .from('whatsapp_conversation_memory') as any)
      .insert({
        tenant_id: identity.tenantId,
        store_id: identity.storeId,
        channel_id: identity.channelId,
        remote_phone: identity.remotePhone,
        mode: identity.mode,
        summary: asJson(defaultConversationSummary(createdAt)),
      })
      .select('*')
      .single()

    if (!error && data) return data
    if (error?.code !== '23505') throw error

    const concurrent = await this.findConversation(identity.channelId, identity.remotePhone)
    if (!concurrent) throw new Error('A conversa foi criada em paralelo, mas nao foi localizada.')
    return concurrent
  }

  async recordMessage(
    identityInput: WhatsAppConversationIdentity,
    messageInput: WhatsAppStoredMessageInput
  ): Promise<MessageRow> {
    const identity = WhatsAppConversationIdentitySchema.parse(identityInput)
    const message = WhatsAppStoredMessageInputSchema.parse(messageInput)
    const conversation = await this.getOrCreateConversation(identity)

    const { data, error } = await (this.client
      .from('whatsapp_conversation_messages') as any)
      .upsert({
        conversation_id: conversation.id,
        source_key: message.sourceKey,
        provider_message_id: message.providerMessageId,
        role: message.role,
        message_kind: message.kind,
        message_text: message.text,
        occurred_at: message.occurredAt,
        metadata: asJson(message.metadata),
      }, {
        onConflict: 'conversation_id,source_key',
        ignoreDuplicates: true,
      })
      .select('*')
      .maybeSingle()

    if (error) throw error
    if (data) return data

    const { data: existing, error: existingError } = await (this.client
      .from('whatsapp_conversation_messages') as any)
      .select('*')
      .eq('conversation_id', conversation.id)
      .eq('source_key', message.sourceKey)
      .single()

    if (existingError) throw existingError
    return existing
  }

  async loadMemory(identityInput: WhatsAppConversationIdentity): Promise<WhatsAppConversationMemory> {
    const identity = WhatsAppConversationIdentitySchema.parse(identityInput)
    const conversation = await this.getOrCreateConversation(identity)
    const { data: messages, error } = await (this.client
      .from('whatsapp_conversation_messages') as any)
      .select('id, provider_message_id, role, message_kind, message_text, occurred_at')
      .eq('conversation_id', conversation.id)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) throw error
    return buildConversationMemory(conversation, messages ?? [])
  }

  async recordControlEvent(input: {
    conversationId: number
    eventKey: string
    action: 'assume' | 'release' | 'handoff_sent'
    occurredAt: string
    actor: string
    messageId?: string | null
    reason?: string | null
  }): Promise<WhatsAppConversationSummary> {
    const { data, error } = await (this.client as any).rpc('record_whatsapp_conversation_control_event', {
      p_conversation_id: input.conversationId,
      p_event_key: input.eventKey,
      p_action: input.action,
      p_occurred_at: input.occurredAt,
      p_actor: input.actor,
      p_message_id: input.messageId ?? null,
      p_reason: input.reason ?? null,
    })
    if (error) throw error
    return WhatsAppConversationSummarySchema.parse(data)
  }

  async createReadyTurn(input: {
    conversationId: number
    turnKey: string
    draft: WhatsAppConversationTurnDraft
    metadata?: Record<string, unknown>
  }): Promise<string> {
    const turnKey = input.turnKey.trim()
    if (!turnKey || turnKey.length > 300) throw new Error('Chave do turno invalida.')
    const draft = WhatsAppConversationTurnDraftSchema.parse(input.draft)
    const { data, error } = await (this.client as any).rpc('create_whatsapp_conversation_turn', {
      p_conversation_id: input.conversationId,
      p_turn_key: turnKey,
      p_message_ids: draft.messageIds,
      p_opened_at: draft.openedAt,
      p_closes_at: draft.closesAt,
      p_metadata: asJson(input.metadata ?? {}),
    })

    if (error) throw error
    if (typeof data !== 'string' || !data) throw new Error('O banco nao retornou o identificador do turno.')
    return data
  }

  async listReadyTurnIds(
    limit = 10,
    now = new Date().toISOString(),
    storeId?: number
  ): Promise<string[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
    let conversationQuery = (this.client
      .from('whatsapp_conversation_memory') as any)
      .select('id')
      .eq('mode', 'shadow')
    if (storeId) conversationQuery = conversationQuery.eq('store_id', storeId)
    const { data: conversations, error: conversationsError } = await conversationQuery
    if (conversationsError) throw conversationsError

    const conversationIds = (conversations ?? []).map((row: { id: number }) => row.id)
    if (!conversationIds.length) return []

    const { data, error } = await (this.client
      .from('whatsapp_conversation_turns') as any)
      .select('id')
      .in('conversation_id', conversationIds)
      .eq('status', 'ready')
      .lte('closes_at', now)
      .order('closes_at', { ascending: true })
      .limit(safeLimit)

    if (error) throw error
    return (data ?? []).map((row: { id: string }) => row.id)
  }

  async claimReadyTurn(turnId: string): Promise<boolean> {
    const timestamp = new Date().toISOString()
    const { data, error } = await (this.client
      .from('whatsapp_conversation_turns') as any)
      .update({ status: 'processing', updated_at: timestamp })
      .eq('id', turnId)
      .eq('status', 'ready')
      .select('id')
      .maybeSingle()

    if (error) throw error
    return Boolean(data)
  }

  async releaseClaimedTurn(turnId: string): Promise<boolean> {
    const timestamp = new Date().toISOString()
    const { data, error } = await (this.client
      .from('whatsapp_conversation_turns') as any)
      .update({ status: 'ready', updated_at: timestamp })
      .eq('id', turnId)
      .eq('status', 'processing')
      .select('id')
      .maybeSingle()

    if (error) throw error
    return Boolean(data)
  }

  async loadTurnContext(turnId: string): Promise<WhatsAppRedesignTurnContext> {
    const { data: turn, error: turnError } = await (this.client
      .from('whatsapp_conversation_turns') as any)
      .select('*')
      .eq('id', turnId)
      .single()
    if (turnError) throw turnError

    const { data: conversation, error: conversationError } = await (this.client
      .from('whatsapp_conversation_memory') as any)
      .select('*')
      .eq('id', turn.conversation_id)
      .single()
    if (conversationError) throw conversationError

    const { data: recentRows, error: recentError } = await (this.client
      .from('whatsapp_conversation_messages') as any)
      .select('id, provider_message_id, role, message_kind, message_text, occurred_at')
      .eq('conversation_id', conversation.id)
      // A resposta do legado pode ser gravada antes de o processador sombra
      // rodar. Ela nao pode contaminar a decisao que esta sendo reconstruida.
      .lte('occurred_at', turn.closes_at)
      .order('occurred_at', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10)
    if (recentError) throw recentError

    const { data: latestHuman, error: humanError } = await (this.client
      .from('whatsapp_conversation_messages') as any)
      .select('occurred_at')
      .eq('conversation_id', conversation.id)
      .eq('role', 'human')
      .lte('occurred_at', turn.closes_at)
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (humanError) throw humanError

    const phoneVariants = [...getPhoneVariants(conversation.remote_phone)]
    const { data: legacyStates, error: legacyError } = await (this.client
      .from('whatsapp_conversation_states') as any)
      .select('state, updated_at, expires_at, metadata')
      .eq('channel_id', conversation.channel_id)
      .in('remote_phone', phoneVariants)
      .lte('updated_at', turn.closes_at)
      .gt('expires_at', turn.closes_at)
      .order('updated_at', { ascending: false })
      .limit(5)
    if (legacyError) throw legacyError

    const { data: links, error: linksError } = await (this.client
      .from('whatsapp_conversation_turn_messages') as any)
      .select('message_id, position')
      .eq('turn_id', turnId)
      .order('position', { ascending: true })
    if (linksError) throw linksError

    const messageIds = (links ?? []).map((link: { message_id: string }) => link.message_id)
    if (!messageIds.length) throw new Error('Turno sem mensagens vinculadas.')

    const { data: turnRows, error: messagesError } = await (this.client
      .from('whatsapp_conversation_messages') as any)
      .select('id, provider_message_id, role, message_kind, message_text, occurred_at')
      .in('id', messageIds)
    if (messagesError) throw messagesError

    const rowsById = new Map((turnRows ?? []).map((row: MessageRow) => [row.id, row]))
    const orderedRows = messageIds.map((id: string) => rowsById.get(id)).filter(Boolean) as MessageRow[]
    if (orderedRows.length !== messageIds.length) throw new Error('Mensagem vinculada ao turno nao localizada.')

    const historicalSummary = await this.loadSummaryAtTurn(conversation, turn.closes_at)
    const memory = buildConversationMemory({
      ...conversation,
      summary: asJson(historicalSummary),
    }, recentRows ?? [])
    const capturedSummary = reconcileConfirmedHumanActivity({
      summary: memory.summary,
      humanMessageAt: latestHuman?.occurred_at ?? null,
      asOf: turn.closes_at,
    })
    const legacyManualState = (legacyStates ?? []).find((row: {
      state: string
      metadata: Json | null
    }) => {
      const metadata = row.metadata && typeof row.metadata === 'object'
        && !Array.isArray(row.metadata) ? row.metadata as Record<string, Json> : {}
      return row.state === 'human_pause'
        && (metadata.reason === 'store_initiated' || metadata.reason === 'app_manual_send')
    })
    const legacyMetadata = legacyManualState?.metadata
      && typeof legacyManualState.metadata === 'object'
      && !Array.isArray(legacyManualState.metadata)
      ? legacyManualState.metadata as Record<string, Json>
      : {}
    const legacySummary = reconcileLegacyManualPause({
      summary: capturedSummary,
      legacyState: legacyManualState ? {
        state: legacyManualState.state,
        reason: typeof legacyMetadata.reason === 'string' ? legacyMetadata.reason : null,
        updatedAt: legacyManualState.updated_at,
        expiresAt: legacyManualState.expires_at,
      } : null,
      asOf: turn.closes_at,
    })

    const { data: latestControlEvent, error: controlError } = await (this.client
      .from('whatsapp_conversation_control_events') as any)
      .select('action, occurred_at, reason')
      .eq('conversation_id', conversation.id)
      .lte('occurred_at', turn.closes_at)
      .order('occurred_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (controlError) throw controlError
    const controlEventIsOlderThanHuman = Boolean(
      latestControlEvent && latestHuman
      && Date.parse(latestHuman.occurred_at) > Date.parse(latestControlEvent.occurred_at)
    )
    const summary = applyConfirmedControlEvent({
      summary: legacySummary,
      event: latestControlEvent && !controlEventIsOlderThanHuman ? {
        action: latestControlEvent.action,
        occurredAt: latestControlEvent.occurred_at,
        reason: latestControlEvent.reason,
      } : null,
      asOf: turn.closes_at,
    })

    return {
      turn,
      conversation,
      memory: { ...memory, summary },
      turnMessages: orderedRows.map(toConversationMessage),
    }
  }

  private async loadSummaryAtTurn(
    conversation: ConversationRow,
    closesAt: string
  ): Promise<WhatsAppConversationSummary> {
    const priorTurns: Array<{ id: string; opened_at: string; closes_at: string; metadata: Json }> = []
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await (this.client
        .from('whatsapp_conversation_turns') as any)
        .select('id, opened_at, closes_at, metadata')
        .eq('conversation_id', conversation.id)
        .eq('status', 'processed')
        .lte('closes_at', closesAt)
        .order('opened_at', { ascending: true })
        .order('closes_at', { ascending: true })
        .order('id', { ascending: true })
        .range(offset, offset + 499)
      if (error) throw error
      priorTurns.push(...(data ?? []))
      if ((data ?? []).length < 500) break
    }

    const selectedTurns: Array<{
      row: { id: string; opened_at: string; closes_at: string; metadata: Json }
      classification: WhatsAppRedesignClassification
    }> = (priorTurns ?? []).flatMap((row: {
      id: string; opened_at: string; closes_at: string; metadata: Json
    }) => {
      const metadata = row.metadata && typeof row.metadata === 'object'
        && !Array.isArray(row.metadata) ? row.metadata as Record<string, unknown> : {}
      const processing = metadata.shadowProcessing && typeof metadata.shadowProcessing === 'object'
        && !Array.isArray(metadata.shadowProcessing)
        ? metadata.shadowProcessing as Record<string, unknown> : {}
      if (processing.sendsMessage !== false) return []
      const classification = WhatsAppRedesignClassificationSchema.parse(processing.classification)
      return [{ row, classification }]
    })

    const linkedKinds = new Map<string, string[]>()
    for (let offset = 0; offset < selectedTurns.length; offset += 10) {
      const batch = selectedTurns.slice(offset, offset + 10)
      const { data: links, error: linksError } = await (this.client
        .from('whatsapp_conversation_turn_messages') as any)
        .select('turn_id, message_id')
        .in('turn_id', batch.map(({ row }) => row.id))
      if (linksError) throw linksError
      const messageIds = (links ?? []).map((link: { message_id: string }) => link.message_id)
      if (!messageIds.length) throw new Error('Turno processado sem mensagens vinculadas.')
      const kindsById = new Map<string, string>()
      for (let messageOffset = 0; messageOffset < messageIds.length; messageOffset += 200) {
        const { data: messages, error: messagesError } = await (this.client
          .from('whatsapp_conversation_messages') as any)
          .select('id, message_kind')
          .in('id', messageIds.slice(messageOffset, messageOffset + 200))
        if (messagesError) throw messagesError
        for (const message of messages ?? []) kindsById.set(message.id, message.message_kind)
      }
      for (const link of links ?? []) {
        const kind = kindsById.get(link.message_id)
        if (!kind) throw new Error('Mensagem de turno processado nao localizada.')
        linkedKinds.set(link.turn_id, [...(linkedKinds.get(link.turn_id) ?? []), kind])
      }
    }

    const processedTurns: WhatsAppProcessedTurnForSummary[] = selectedTurns.map(({ row, classification }) => ({
      id: row.id,
      openedAt: new Date(row.opened_at).toISOString(),
      closesAt: new Date(row.closes_at).toISOString(),
      classification,
      turnMessages: (linkedKinds.get(row.id) ?? []).map((kind, index) => ({
        id: `${row.id}:${index}`,
        providerMessageId: null,
        role: 'customer' as const,
        kind: kind as WhatsAppConversationMessage['kind'],
        text: null,
        occurredAt: new Date(row.closes_at).toISOString(),
      })),
    }))

    const canonical = buildConversationMemory(conversation, []).summary
    const base = {
      ...defaultConversationSummary(conversation.created_at),
      customerControlMode: canonical.customerControlMode,
    }
    return replayWhatsAppConversationSummary({ summary: base, processedTurns })
  }

  async loadStore(storeId: number): Promise<StoreRow> {
    const { data, error } = await (this.client
      .from('stores') as any)
      .select('id, name, tenant_id, settings, street, number, neighborhood, city, state')
      .eq('id', storeId)
      .single()
    if (error) throw error
    return data
  }

  async finishTurn(input: {
    turnId: string
    status: 'processed' | 'failed'
    metadata: Record<string, unknown>
  }) {
    if (input.status === 'processed') {
      const { error } = await (this.client as any).rpc('finish_whatsapp_redesign_shadow_turn', {
        p_turn_id: input.turnId,
        p_metadata: asJson(input.metadata),
      })
      if (error) throw error
      return
    }

    const timestamp = new Date().toISOString()
    const { error } = await (this.client
      .from('whatsapp_conversation_turns') as any)
      .update({
        status: input.status,
        processed_at: timestamp,
        updated_at: timestamp,
        metadata: asJson(input.metadata),
      })
      .eq('id', input.turnId)
      .eq('status', 'processing')
    if (error) throw error
  }

  private async findConversation(channelId: number, remotePhone: string): Promise<ConversationRow | null> {
    const { data, error } = await (this.client
      .from('whatsapp_conversation_memory') as any)
      .select('*')
      .eq('channel_id', channelId)
      .eq('remote_phone', remotePhone)
      .maybeSingle()

    if (error) throw error
    return data
  }
}
