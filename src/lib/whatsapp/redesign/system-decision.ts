import type { StoreHoursFacts } from '../store-hours-logic'
import {
  WHATSAPP_REDESIGN_MIN_CONFIDENCE,
  WhatsAppSystemDecisionDraftSchema,
  resolveReplyAuthority,
  type WhatsAppConversationMemory,
  type WhatsAppRedesignClassification,
  type WhatsAppSystemDecisionDraft,
} from './contracts'

const FORBIDDEN_CLAIMS = [
  'confirmar estoque sem consulta',
  'confirmar pagamento ou baixa',
  'confirmar que um problema foi resolvido',
  'inventar preco ou prazo',
  'orientar o cliente a ligar ou ir pessoalmente',
]

function humanization(requiresHandoff: boolean) {
  return {
    mustNotAddFacts: true as const,
    mustKeepShort: true,
    mustIdentifyIara: requiresHandoff,
    mustMentionHumanHandoff: requiresHandoff,
    forbiddenClaims: FORBIDDEN_CLAIMS,
  }
}

function handoffDraft(
  classification: WhatsAppRedesignClassification,
  memory: WhatsAppConversationMemory,
  canonicalReply: string,
  reason: string
): WhatsAppSystemDecisionDraft {
  const isContinuation = memory.summary.humanControl === 'human_pending'
    || memory.summary.pendingAction === 'awaiting_human'

  return WhatsAppSystemDecisionDraftSchema.parse({
    action: isContinuation ? 'repeat_handoff' : 'human_handoff',
    canonicalReply: isContinuation
      ? 'Sou a IAra, uma assistente virtual. Entendi que você está retomando esse assunto. Vou chamar novamente um atendente para continuar com você.'
      : canonicalReply,
    facts: {
      classificationIntent: classification.intent,
      classificationConfidence: classification.confidence,
      decisionReason: reason,
    },
    humanHandoffTiming: null,
    humanization: humanization(true),
  })
}

export type WhatsAppShadowDecisionInput = {
  classification: WhatsAppRedesignClassification
  memory: WhatsAppConversationMemory
  now: string
  hoursFacts: StoreHoursFacts | null
  storeLocationReply: string | null
  hasCurrentTurnAttachment: boolean
}

export type WhatsAppShadowDecisionResult = {
  draft: WhatsAppSystemDecisionDraft
  reason: string
}

export function buildWhatsAppShadowDecision(
  input: WhatsAppShadowDecisionInput
): WhatsAppShadowDecisionResult {
  const authority = resolveReplyAuthority(input.memory.summary, input.now)
  if (authority.authority === 'human_blocked') {
    return {
      reason: 'human_control_blocks_ai',
      draft: WhatsAppSystemDecisionDraftSchema.parse({
        action: 'no_reply',
        canonicalReply: null,
        facts: { decisionReason: 'human_control_blocks_ai' },
        humanHandoffTiming: null,
        humanization: humanization(false),
      }),
    }
  }

  const { classification } = input
  if (classification.requestsHuman) {
    return {
      reason: 'customer_requests_human',
      draft: handoffDraft(
        classification,
        input.memory,
        'Sou a IAra, uma assistente virtual. Vou chamar um atendente para continuar com você.',
        'customer_requests_human'
      ),
    }
  }

  const hasAttachment = classification.mentionsAttachment || input.hasCurrentTurnAttachment
  if (hasAttachment) {
    return {
      reason: 'attachment_requires_human_review',
      draft: handoffDraft(
        classification,
        input.memory,
        'Recebi o arquivo. Sou a IAra, uma assistente virtual, e vou chamar um atendente para verificar isso para você.',
        'attachment_requires_human_review'
      ),
    }
  }

  if (classification.intent === 'store_hours' && input.hoursFacts
    && classification.confidence >= WHATSAPP_REDESIGN_MIN_CONFIDENCE) {
    const canonicalReply = input.hoursFacts.is_open_now
      ? `Sim, estamos abertos agora. O horário de hoje é ${input.hoursFacts.today_schedule}.`
      : `No momento estamos fechados. A próxima abertura será ${input.hoursFacts.next_open_schedule}.`
    return {
      reason: 'official_store_hours_available',
      draft: WhatsAppSystemDecisionDraftSchema.parse({
        action: 'answer_store_hours',
        canonicalReply,
        facts: {
          isStoreOpenNow: input.hoursFacts.is_open_now,
          todaySchedule: input.hoursFacts.today_schedule,
          nextOpenSchedule: input.hoursFacts.next_open_schedule,
          fullWeeklySchedule: input.hoursFacts.full_weekly_schedule,
        },
        humanHandoffTiming: null,
        humanization: humanization(false),
      }),
    }
  }

  if (classification.intent === 'store_location' && input.storeLocationReply
    && classification.confidence >= WHATSAPP_REDESIGN_MIN_CONFIDENCE) {
    return {
      reason: 'official_store_location_available',
      draft: WhatsAppSystemDecisionDraftSchema.parse({
        action: 'answer_store_location',
        canonicalReply: input.storeLocationReply,
        facts: { hasOfficialStoreLocation: true },
        humanHandoffTiming: null,
        humanization: humanization(false),
      }),
    }
  }

  if (classification.intent === 'greeting' && classification.confidence >= WHATSAPP_REDESIGN_MIN_CONFIDENCE) {
    return {
      reason: 'greeting_without_operational_request',
      draft: WhatsAppSystemDecisionDraftSchema.parse({
        action: 'conservative_fallback',
        canonicalReply: 'Olá! Como posso ajudar?',
        facts: { classificationIntent: 'greeting' },
        humanHandoffTiming: null,
        humanization: humanization(false),
      }),
    }
  }

  const handoffMessages: Partial<Record<WhatsAppRedesignClassification['intent'], string>> = {
    vision_exam: 'Sou a IAra, uma assistente virtual. Para te dar a informação correta sobre exame de vista ou avaliação de grau, vou chamar um atendente.',
    product_availability: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para verificar essa peça ou lente para você.',
    order_status: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para consultar corretamente o status dos seus óculos.',
    installment_status: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para consultar essa informação financeira com segurança.',
    complaint_or_adaptation: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para entender melhor o que você precisa.',
    exchange_or_warranty: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para verificar sua troca ou garantia.',
    budget_request: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para preparar essa informação para você.',
    human_agent_request: 'Sou a IAra, uma assistente virtual. Vou chamar um atendente para continuar com você.',
  }
  const message = handoffMessages[classification.intent]
  const reason = classification.confidence < WHATSAPP_REDESIGN_MIN_CONFIDENCE
    ? 'classification_below_safe_confidence'
    : message
      ? `topic_requires_human:${classification.intent}`
      : 'no_safe_automatic_action'

  return {
    reason,
    draft: handoffDraft(
      classification,
      input.memory,
      message || 'Sou a IAra, uma assistente virtual. Para não te passar uma informação errada, vou chamar um atendente para continuar com você.',
      reason
    ),
  }
}

export type StoreLocationSource = {
  street: string | null
  number: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
}

export function buildOfficialStoreLocationReply(store: StoreLocationSource) {
  const line1 = [store.street, store.number].map((value) => value?.trim()).filter(Boolean).join(', ')
  const line2 = [store.neighborhood, store.city, store.state].map((value) => value?.trim()).filter(Boolean).join(' - ')
  const address = [line1, line2].filter(Boolean).join(', ')
  if (!address) return null

  const query = new URLSearchParams({ query: address }).toString()
  return `Nossa loja fica em ${address}. Mapa: https://www.google.com/maps/search/?api=1&${query}`
}
