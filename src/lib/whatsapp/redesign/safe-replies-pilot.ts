import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignReplyInput } from '../ai'
import {
  WHATSAPP_REDESIGN_MIN_CONFIDENCE,
  type WhatsAppRedesignClassification,
  type WhatsAppSystemDecisionDraft,
} from './contracts'
import { isExplicitOfficialPixRequest } from './system-decision'
import {
  isExplicitHumanHandoffRequest,
  isExplicitOrderStatusOrReadinessQuestion,
  isExplicitStoreHoursQuestion,
} from './intent-guards'

export type PilotSafeReply = {
  action: 'answer_store_hours' | 'answer_store_location' | 'answer_official_pix'
    | 'human_handoff' | 'repeat_handoff' | 'acknowledge_attachment'
    | 'recognize_continuation'
  replyInput: WhatsAppRedesignReplyInput
  messageType: 'store_hours' | 'store_location' | 'payment_pix_info'
    | 'human_handoff' | 'attachment_handoff' | 'ai_clarification' | 'ai_greeting'
}

type PilotSafeReplyBase = {
  action: PilotSafeReply['action']
  messageType: PilotSafeReply['messageType']
}

export function isStoreOneSafeRepliesPilotEnabled(
  storeId: number,
  settings: WhatsAppAutomationSettings | undefined
) {
  return storeId === 1
    && settings?.ai_redesign?.mode === 'shadow'
    && settings.ai_redesign.safe_replies_enabled === true
}

export function shouldLookupOrderStatusInStoreOnePilot(input: {
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  messageText?: string | null
}) {
  const explicitHumanRequest = isExplicitHumanHandoffRequest(input.messageText)
  const classifierRecognizedOrderStatus = input.classification.intent === 'order_status'
    && input.decision.action === 'lookup_order_status'
  const explicitOrderStatus = isExplicitOrderStatusOrReadinessQuestion(input.messageText)

  return !input.classification.requestsHuman
    && !explicitHumanRequest
    && !input.classification.mentionsAttachment
    && (
      (explicitOrderStatus && input.decision.action !== 'no_reply')
      || (
        input.classification.confidence >= WHATSAPP_REDESIGN_MIN_CONFIDENCE
        && input.decision.action === 'lookup_order_status'
        && classifierRecognizedOrderStatus
      )
    )
}

export function shouldUseOrderStatusToolAgent(input: {
  enabled: boolean
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  messageText?: string | null
  awaitingIdentifier?: boolean
}) {
  const hasExplicitOrderNumber = Boolean(extractExplicitOrderNumber(input.messageText))
  const classificationSupportsOrderLookup = input.classification.intent === 'order_status'
    && input.classification.confidence >= WHATSAPP_REDESIGN_MIN_CONFIDENCE
  const explicitOrderStatus = isExplicitOrderStatusOrReadinessQuestion(input.messageText)
  const explicitHumanRequest = isExplicitHumanHandoffRequest(input.messageText)

  return input.enabled
    && (classificationSupportsOrderLookup || hasExplicitOrderNumber || explicitOrderStatus
      || (input.awaitingIdentifier === true
        && (input.classification.intent === 'order_status'
          || input.classification.intent === 'unknown')))
    && !input.classification.requestsHuman
    && !explicitHumanRequest
    && !input.classification.mentionsAttachment
    && input.decision.action !== 'no_reply'
}

export function shouldForceStoreOnePhoneOrderStatusLookup(input: {
  storeId: number
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  messageText?: string | null
}) {
  return input.storeId === 1
    && isExplicitOrderStatusOrReadinessQuestion(input.messageText)
    && !extractExplicitOrderNumber(input.messageText)
    && !input.classification.requestsHuman
    && !input.classification.mentionsAttachment
    && !isExplicitHumanHandoffRequest(input.messageText)
    && input.decision.action !== 'no_reply'
}

export function extractExplicitOrderNumber(messageText: string | null | undefined) {
  const normalized = (messageText ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
  const match = normalized.match(/\b(?:os|ordem(?:\s+de\s+servico)?|pedido)\s*(?:n[º°o.]?\s*)?(\d{1,10})\b/u)
  return match?.[1] ?? null
}

function selectStoreOnePilotSafeReplyBase(input: {
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  turnMessages: Array<{ kind: string; text: string | null }>
  officialPixKey: string | null
  officialPixHolder: string | null
}): PilotSafeReplyBase | null {
  const { classification, decision, turnMessages } = input

  // O classificador nao possui ainda intent Pix. A excecao exige uma pergunta
  // literal e exclusiva pela chave; valores, parcelas e comprovantes seguem no legado.
  const text = turnMessages.length === 1 && turnMessages[0].kind === 'text'
    ? turnMessages[0].text?.trim() ?? '' : ''
  if (decision.action === 'answer_official_pix' && isExplicitOfficialPixRequest(text)
    && input.officialPixKey?.trim()) {
    return {
      action: 'answer_official_pix',
      messageType: 'payment_pix_info',
    }
  }

  if (decision.action === 'answer_store_hours' || decision.action === 'answer_store_location') {
    if (decision.action === 'answer_store_hours'
      && !isExplicitStoreHoursQuestion(turnMessages.map((message) => message.text || '').join(' '))) return null
    return {
      action: decision.action,
      messageType: decision.action === 'answer_store_hours' ? 'store_hours' : 'store_location',
    }
  }

  const messageTypeByAction: Partial<Record<typeof decision.action, PilotSafeReply['messageType']>> = {
    human_handoff: 'human_handoff',
    repeat_handoff: 'human_handoff',
    acknowledge_attachment: 'attachment_handoff',
    recognize_continuation: 'ai_clarification',
  }
  const messageType = messageTypeByAction[decision.action]
  if (messageType) {
    return { action: decision.action as PilotSafeReply['action'], messageType }
  }

  return null
}

export function selectStoreOnePilotSafeReply(input: Parameters<typeof selectStoreOnePilotSafeReplyBase>[0]) {
  const reply = selectStoreOnePilotSafeReplyBase(input)
  if (!reply) return null
  const holder = input.officialPixHolder?.trim() ?? null
  const facts: WhatsAppRedesignReplyInput['facts'] = {
    ...input.decision.facts,
    mustIdentifyIara: input.decision.humanization.mustIdentifyIara,
    mustMentionHumanHandoff: input.decision.humanization.mustMentionHumanHandoff,
    ...(input.decision.humanHandoffTiming ? {
      humanHandoffMode: input.decision.humanHandoffTiming.mode,
      nextOpenSchedule: input.decision.humanHandoffTiming.nextOpenSchedule,
    } : {}),
    productMention: input.classification.entities.productMention ?? null,
  }
  if (reply.action === 'answer_official_pix') {
    facts.officialPixKey = input.officialPixKey?.trim() ?? null
    facts.officialPixHolder = holder
  }

  return {
    action: reply.action,
    messageType: reply.messageType,
    replyInput: {
      action: reply.action,
      intent: input.classification.intent,
      userMessages: input.turnMessages.map(({ kind, text: messageText }) => ({ kind, text: messageText })),
      facts,
    },
  }
}

function normalizeForComparison(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function resolveStoreOnePilotReplyText(
  candidate: PilotSafeReply,
  result: { success: true; data: { reply_text: string } } | { success: false }
) {
  const suppressed = (reason: string) => ({
    shouldSend: false as const,
    generatedBy: 'suppressed' as const,
    reason,
  })
  if (!result.success) {
    return suppressed('provider_failure')
  }

  const replyText = result.data.reply_text.trim()
  const normalizedReply = normalizeForComparison(replyText)
  const productMention = candidate.replyInput.facts.productMention
  if (candidate.replyInput.facts.mustIdentifyIara === true
    && !/\b(?:eu sou |sou |aqui e |soy |yo soy |i am |i m |this is )(?:a |la )?(?:assistente virtual )?iara\b/u.test(normalizedReply)) {
    return suppressed('assistant_identity_omitted')
  }

  if (candidate.replyInput.intent === 'product_availability'
    && typeof productMention === 'string'
    && !normalizedReply.includes(normalizeForComparison(productMention))) {
    return suppressed('required_product_omitted')
  }

  if (candidate.replyInput.intent === 'product_availability'
    && /\b(?:temos|tem|disponivel|disponiveis|em estoque|estoque|hay|tenemos|disponible|disponibles|en stock|have it|we have|in stock|available)\b/u.test(normalizedReply)) {
    return suppressed('unsafe_stock_claim')
  }

  if (candidate.action === 'human_handoff' || candidate.action === 'repeat_handoff'
    || candidate.action === 'acknowledge_attachment') {
    const mentionsHandoff = /\b(?:atendente|atendentes|equipe|time|pessoa|humano|encaminh|chamar|consultar|verificar|revisar|asesor|asesora|equipo|persona|derivar|consultar|revisar|attendant|agent|team|person|forward|check|review)\b/u.test(normalizedReply)
    if (!mentionsHandoff) {
      return suppressed('handoff_omitted')
    }
  }

  const officialPixKey = candidate.replyInput.facts.officialPixKey
  if (candidate.action === 'answer_official_pix'
    && typeof officialPixKey === 'string'
    && !replyText.includes(officialPixKey)) {
    return suppressed('official_key_omitted')
  }

  const expectedSchedule = candidate.replyInput.facts.requestedDay === 'tomorrow'
    ? candidate.replyInput.facts.tomorrowSchedule
    : candidate.replyInput.facts.todaySchedule
  if (candidate.action === 'answer_store_hours' && typeof expectedSchedule === 'string') {
    const requiredTimes = [...expectedSchedule.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0])
    if (requiredTimes.some((time) => !replyText.includes(time))) {
      return suppressed('official_hours_omitted')
    }
  }

  return { shouldSend: true as const, text: replyText, generatedBy: 'ai' as const, reason: null }
}
