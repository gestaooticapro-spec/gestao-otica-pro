import { z } from 'zod'

export const WHATSAPP_REDESIGN_MEMORY_MESSAGE_LIMIT = 10
export const WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS = 2 * 60 * 60 * 1000
export const WHATSAPP_REDESIGN_MIN_CONFIDENCE = 0.78

export const WhatsAppRedesignModeSchema = z.enum(['legacy', 'shadow', 'redesign'])
export type WhatsAppRedesignMode = z.infer<typeof WhatsAppRedesignModeSchema>

export const WhatsAppConversationRoleSchema = z.enum(['customer', 'assistant', 'human', 'system'])
export type WhatsAppConversationRole = z.infer<typeof WhatsAppConversationRoleSchema>

export const WhatsAppConversationMessageKindSchema = z.enum([
  'text',
  'image',
  'document',
  'audio',
  'video',
  'location',
  'sticker',
  'unknown',
])
export type WhatsAppConversationMessageKind = z.infer<typeof WhatsAppConversationMessageKindSchema>

export const WhatsAppConversationMessageSchema = z.object({
  id: z.string().trim().min(1),
  providerMessageId: z.string().trim().min(1).nullable(),
  role: WhatsAppConversationRoleSchema,
  kind: WhatsAppConversationMessageKindSchema,
  text: z.string().trim().max(4000).nullable(),
  occurredAt: z.string().datetime(),
}).strict()
export type WhatsAppConversationMessage = z.infer<typeof WhatsAppConversationMessageSchema>

export const WhatsAppConversationTopicSchema = z.enum([
  'greeting',
  'vision_exam',
  'store_hours',
  'store_location',
  'product_availability',
  'attachment',
  'order_status',
  'installment_status',
  'complaint_or_adaptation',
  'exchange_or_warranty',
  'budget_request',
  'human_agent_request',
  'unknown',
])
export type WhatsAppConversationTopic = z.infer<typeof WhatsAppConversationTopicSchema>

export const WhatsAppConversationPhaseSchema = z.enum([
  'idle',
  'active',
  'waiting_identifier',
  'waiting_human',
  'resumed',
])
export type WhatsAppConversationPhase = z.infer<typeof WhatsAppConversationPhaseSchema>

export const WhatsAppHumanControlSchema = z.enum([
  'ai_active',
  'human_pending',
  'human_active',
  'human_released',
])
export type WhatsAppHumanControl = z.infer<typeof WhatsAppHumanControlSchema>

export const WhatsAppCustomerControlModeSchema = z.enum(['auto', 'force_ai', 'force_human'])
export type WhatsAppCustomerControlMode = z.infer<typeof WhatsAppCustomerControlModeSchema>

export const WhatsAppAttachmentStatusSchema = z.enum([
  'none',
  'received',
  'awaiting_human',
  'contextualized',
])
export type WhatsAppAttachmentStatus = z.infer<typeof WhatsAppAttachmentStatusSchema>

export const WhatsAppPendingActionSchema = z.enum([
  'none',
  'awaiting_identifier',
  'awaiting_human',
  'awaiting_attachment_review',
])
export type WhatsAppPendingAction = z.infer<typeof WhatsAppPendingActionSchema>

export const WhatsAppConversationSummarySchema = z.object({
  activeTopic: WhatsAppConversationTopicSchema,
  secondaryTopics: z.array(WhatsAppConversationTopicSchema).max(5),
  phase: WhatsAppConversationPhaseSchema,
  humanControl: WhatsAppHumanControlSchema,
  customerControlMode: WhatsAppCustomerControlModeSchema,
  attachmentStatus: WhatsAppAttachmentStatusSchema,
  pendingAction: WhatsAppPendingActionSchema,
  subject: z.string().trim().max(500).nullable(),
  handoffReason: z.string().trim().max(500).nullable(),
  lastHumanActivityAt: z.string().datetime().nullable(),
  humanActiveUntil: z.string().datetime().nullable(),
  updatedAt: z.string().datetime(),
}).strict()
export type WhatsAppConversationSummary = z.infer<typeof WhatsAppConversationSummarySchema>

export const WhatsAppConversationMemorySchema = z.object({
  summary: WhatsAppConversationSummarySchema,
  messages: z.array(WhatsAppConversationMessageSchema).max(WHATSAPP_REDESIGN_MEMORY_MESSAGE_LIMIT),
}).strict()
export type WhatsAppConversationMemory = z.infer<typeof WhatsAppConversationMemorySchema>

export const WhatsAppTopicRelationSchema = z.enum([
  'continue_topic',
  'change_topic',
  'parallel_topic',
  'unclear_topic',
])
export type WhatsAppTopicRelation = z.infer<typeof WhatsAppTopicRelationSchema>

export const WhatsAppRedesignClassificationSchema = z.object({
  intent: WhatsAppConversationTopicSchema,
  confidence: z.number().min(0).max(1),
  topicRelation: WhatsAppTopicRelationSchema,
  requestsHuman: z.boolean(),
  mentionsAttachment: z.boolean(),
  entities: z.object({
    customerName: z.string().trim().max(200).nullable(),
    patientName: z.string().trim().max(200).nullable(),
    cpf: z.string().trim().max(20).nullable(),
    orderNumber: z.string().trim().max(80).nullable(),
    productMention: z.string().trim().min(1).max(160).nullable().optional(),
  }).strict(),
}).strict()
export type WhatsAppRedesignClassification = z.infer<typeof WhatsAppRedesignClassificationSchema>

export const WhatsAppRedesignActionSchema = z.enum([
  'answer_store_hours',
  'answer_store_location',
  'answer_official_pix',
  'acknowledge_attachment',
  'recognize_continuation',
  'human_handoff',
  'repeat_handoff',
  'no_reply',
  'conservative_fallback',
])
export type WhatsAppRedesignAction = z.infer<typeof WhatsAppRedesignActionSchema>

export const WhatsAppCanonicalFactSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
])

export const WhatsAppHumanizationPolicySchema = z.object({
  mustNotAddFacts: z.literal(true),
  mustKeepShort: z.boolean(),
  mustIdentifyIara: z.boolean(),
  mustMentionHumanHandoff: z.boolean(),
  forbiddenClaims: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict()
export type WhatsAppHumanizationPolicy = z.infer<typeof WhatsAppHumanizationPolicySchema>

export const WhatsAppHumanHandoffTimingSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('during_open_hours'),
    nextOpenSchedule: z.null(),
  }).strict(),
  z.object({
    mode: z.literal('when_store_opens'),
    nextOpenSchedule: z.string().trim().min(1).max(200),
  }).strict(),
])
export type WhatsAppHumanHandoffTiming = z.infer<typeof WhatsAppHumanHandoffTimingSchema>

const WhatsAppSystemDecisionBaseSchema = z.object({
  action: WhatsAppRedesignActionSchema,
  fallbackReply: z.string().trim().min(1).max(1200).nullable(),
  facts: z.record(z.string(), WhatsAppCanonicalFactSchema),
  humanHandoffTiming: WhatsAppHumanHandoffTimingSchema.nullable(),
  humanization: WhatsAppHumanizationPolicySchema,
}).strict()

export const WhatsAppSystemDecisionDraftSchema = WhatsAppSystemDecisionBaseSchema.superRefine((decision, context) => {
  if (decision.action === 'no_reply' && decision.fallbackReply !== null) {
    context.addIssue({
      code: 'custom',
      path: ['fallbackReply'],
      message: 'no_reply nao pode carregar texto de fallback.',
    })
  }

  if (decision.action !== 'no_reply' && !decision.fallbackReply) {
    context.addIssue({
      code: 'custom',
      path: ['fallbackReply'],
      message: 'A decisao exige um texto de fallback para contingencia.',
    })
  }
})
export type WhatsAppSystemDecisionDraft = z.infer<typeof WhatsAppSystemDecisionDraftSchema>

export const WhatsAppSystemDecisionSchema = WhatsAppSystemDecisionDraftSchema.superRefine((decision, context) => {
  const isHumanHandoff = decision.action === 'human_handoff' || decision.action === 'repeat_handoff'

  if (isHumanHandoff && !decision.humanHandoffTiming) {
    context.addIssue({
      code: 'custom',
      path: ['humanHandoffTiming'],
      message: 'O encaminhamento humano exige a definicao de quando a equipe podera atender.',
    })
  }

  if (!isHumanHandoff && decision.humanHandoffTiming !== null) {
    context.addIssue({
      code: 'custom',
      path: ['humanHandoffTiming'],
      message: 'Somente encaminhamentos humanos podem definir horario para a equipe.',
    })
  }
})
export type WhatsAppSystemDecision = z.infer<typeof WhatsAppSystemDecisionSchema>

export const WhatsAppHumanizedReplySchema = z.object({
  replyText: z.string().trim().min(1).max(1200),
}).strict()
export type WhatsAppHumanizedReply = z.infer<typeof WhatsAppHumanizedReplySchema>

export const HUMAN_PENDING_ALLOWED_ACTIONS = new Set<WhatsAppRedesignAction>([
  'answer_store_hours',
  'answer_store_location',
  'acknowledge_attachment',
  'recognize_continuation',
  'repeat_handoff',
  'no_reply',
])

export function canActDuringHumanPending(action: WhatsAppRedesignAction) {
  return HUMAN_PENDING_ALLOWED_ACTIONS.has(action)
}

export function retainRecentConversationMessages(
  messages: WhatsAppConversationMessage[],
  limit = WHATSAPP_REDESIGN_MEMORY_MESSAGE_LIMIT
) {
  const safeLimit = Math.max(1, Math.min(WHATSAPP_REDESIGN_MEMORY_MESSAGE_LIMIT, Math.floor(limit)))
  const unique = new Map<string, WhatsAppConversationMessage>()

  for (const message of messages) {
    const parsed = WhatsAppConversationMessageSchema.parse(message)
    unique.set(parsed.id, parsed)
  }

  return [...unique.values()]
    .sort((left, right) => (
      new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime()
    ))
    .slice(-safeLimit)
}

export function registerHumanActivity(
  summary: WhatsAppConversationSummary,
  occurredAt: string
): WhatsAppConversationSummary {
  const parsedSummary = WhatsAppConversationSummarySchema.parse(summary)
  const activityAt = new Date(occurredAt)
  if (Number.isNaN(activityAt.getTime())) throw new Error('Data de atividade humana invalida.')

  return WhatsAppConversationSummarySchema.parse({
    ...parsedSummary,
    phase: 'active',
    humanControl: 'human_active',
    lastHumanActivityAt: activityAt.toISOString(),
    humanActiveUntil: new Date(activityAt.getTime() + WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS).toISOString(),
    updatedAt: activityAt.toISOString(),
  })
}

export function releaseExpiredHumanControl(
  summary: WhatsAppConversationSummary,
  now: string
): WhatsAppConversationSummary {
  const parsedSummary = WhatsAppConversationSummarySchema.parse(summary)
  if (parsedSummary.customerControlMode === 'force_human') return parsedSummary
  if (parsedSummary.humanControl !== 'human_active' || !parsedSummary.humanActiveUntil) return parsedSummary

  const nowMs = new Date(now).getTime()
  const expiresMs = new Date(parsedSummary.humanActiveUntil).getTime()
  if (!Number.isFinite(nowMs) || nowMs < expiresMs) return parsedSummary

  return WhatsAppConversationSummarySchema.parse({
    ...parsedSummary,
    phase: 'resumed',
    humanControl: 'human_released',
    humanActiveUntil: null,
    updatedAt: new Date(nowMs).toISOString(),
  })
}

export type WhatsAppReplyAuthority = 'ai_allowed' | 'human_blocked'

export function resolveReplyAuthority(
  summary: WhatsAppConversationSummary,
  now: string
): { authority: WhatsAppReplyAuthority; summary: WhatsAppConversationSummary } {
  const releasedSummary = releaseExpiredHumanControl(summary, now)

  if (releasedSummary.customerControlMode === 'force_human') {
    return { authority: 'human_blocked', summary: releasedSummary }
  }

  if (releasedSummary.humanControl === 'human_active') {
    return { authority: 'human_blocked', summary: releasedSummary }
  }

  return { authority: 'ai_allowed', summary: releasedSummary }
}

export function defaultConversationSummary(now: string): WhatsAppConversationSummary {
  const timestamp = new Date(now)
  if (Number.isNaN(timestamp.getTime())) throw new Error('Data inicial invalida.')

  return {
    activeTopic: 'unknown',
    secondaryTopics: [],
    phase: 'idle',
    humanControl: 'ai_active',
    customerControlMode: 'auto',
    attachmentStatus: 'none',
    pendingAction: 'none',
    subject: null,
    handoffReason: null,
    lastHumanActivityAt: null,
    humanActiveUntil: null,
    updatedAt: timestamp.toISOString(),
  }
}
