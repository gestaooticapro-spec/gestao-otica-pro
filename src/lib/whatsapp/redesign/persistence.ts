import { z } from 'zod'
import {
  WhatsAppConversationMemorySchema,
  WhatsAppConversationMessageKindSchema,
  WhatsAppConversationMessageSchema,
  WhatsAppConversationRoleSchema,
  WhatsAppConversationSummarySchema,
  WhatsAppRedesignModeSchema,
  defaultConversationSummary,
  retainRecentConversationMessages,
  type WhatsAppConversationMemory,
  type WhatsAppConversationMessage,
} from './contracts'

export const WhatsAppStoredMessageInputSchema = z.object({
  sourceKey: z.string().trim().min(1).max(300),
  providerMessageId: z.string().trim().min(1).max(300).nullable(),
  role: WhatsAppConversationRoleSchema,
  kind: WhatsAppConversationMessageKindSchema,
  text: z.string().trim().max(4000).nullable(),
  occurredAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
}).strict()
export type WhatsAppStoredMessageInput = z.infer<typeof WhatsAppStoredMessageInputSchema>

export const WhatsAppConversationIdentitySchema = z.object({
  tenantId: z.string().uuid(),
  storeId: z.number().int().positive(),
  channelId: z.number().int().positive(),
  remotePhone: z.string().regex(/^\d{8,20}$/),
  mode: WhatsAppRedesignModeSchema,
}).strict()
export type WhatsAppConversationIdentity = z.infer<typeof WhatsAppConversationIdentitySchema>

export const WhatsAppConversationTurnDraftSchema = z.object({
  openedAt: z.string().datetime(),
  closesAt: z.string().datetime(),
  messageIds: z.array(z.string().uuid()).min(1).max(50),
}).strict().superRefine((turn, context) => {
  if (Date.parse(turn.closesAt) < Date.parse(turn.openedAt)) {
    context.addIssue({
      code: 'custom',
      path: ['closesAt'],
      message: 'O fechamento do turno nao pode anteceder sua abertura.',
    })
  }
  if (new Set(turn.messageIds).size !== turn.messageIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['messageIds'],
      message: 'Um turno nao pode repetir a mesma mensagem.',
    })
  }
})
export type WhatsAppConversationTurnDraft = z.infer<typeof WhatsAppConversationTurnDraftSchema>

export type WhatsAppStoredConversationRow = {
  summary: unknown
  created_at: string
}

export type WhatsAppStoredMessageRow = {
  id: string
  provider_message_id: string | null
  role: string
  message_kind: string
  message_text: string | null
  occurred_at: string
}

export function toConversationMessage(row: WhatsAppStoredMessageRow): WhatsAppConversationMessage {
  return WhatsAppConversationMessageSchema.parse({
    id: row.id,
    providerMessageId: row.provider_message_id,
    role: row.role,
    kind: row.message_kind,
    text: row.message_text,
    occurredAt: row.occurred_at,
  })
}

export function buildConversationMemory(
  conversation: WhatsAppStoredConversationRow,
  rows: WhatsAppStoredMessageRow[]
): WhatsAppConversationMemory {
  const parsedSummary = WhatsAppConversationSummarySchema.safeParse(conversation.summary)
  const summary = parsedSummary.success
    ? parsedSummary.data
    : defaultConversationSummary(conversation.created_at)

  const messages = retainRecentConversationMessages(rows.map(toConversationMessage))
  return WhatsAppConversationMemorySchema.parse({ summary, messages })
}

export function buildTurnDraft(
  messages: WhatsAppConversationMessage[],
  closesAt: string
): WhatsAppConversationTurnDraft {
  const uniqueMessages = new Map<string, WhatsAppConversationMessage>()
  for (const message of messages) {
    const parsed = WhatsAppConversationMessageSchema.parse(message)
    uniqueMessages.set(parsed.id, parsed)
  }
  const orderedMessages = [...uniqueMessages.values()].sort((left, right) => (
    Date.parse(left.occurredAt) - Date.parse(right.occurredAt)
  ))
  if (!orderedMessages.length) throw new Error('Nao e possivel criar um turno sem mensagens.')

  return WhatsAppConversationTurnDraftSchema.parse({
    openedAt: orderedMessages[0].occurredAt,
    closesAt,
    messageIds: orderedMessages.map((message) => message.id),
  })
}
