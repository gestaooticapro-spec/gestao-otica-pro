import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  WhatsAppConversationSummarySchema,
  defaultConversationSummary,
  type WhatsAppConversationMemory,
  type WhatsAppConversationMessage,
  type WhatsAppConversationSummary,
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

  async saveSummary(
    identityInput: WhatsAppConversationIdentity,
    summaryInput: WhatsAppConversationSummary
  ): Promise<WhatsAppConversationSummary> {
    const identity = WhatsAppConversationIdentitySchema.parse(identityInput)
    const summary = WhatsAppConversationSummarySchema.parse(summaryInput)
    const conversation = await this.getOrCreateConversation(identity)
    const { error } = await (this.client
      .from('whatsapp_conversation_memory') as any)
      .update({
        mode: identity.mode,
        summary: asJson(summary),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversation.id)

    if (error) throw error
    return summary
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

    return {
      turn,
      conversation,
      memory: buildConversationMemory(conversation, recentRows ?? []),
      turnMessages: orderedRows.map(toConversationMessage),
    }
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
