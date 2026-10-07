import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignReplyInput } from '../ai'
import {
  WHATSAPP_REDESIGN_MIN_CONFIDENCE,
  type WhatsAppRedesignClassification,
  type WhatsAppSystemDecisionDraft,
} from './contracts'
import { isExplicitOfficialPixRequest } from './system-decision'
import { isStoreOneFullRedesignEnabled } from './rollout-policy'
import {
  isExplicitHumanHandoffRequest,
  isExplicitOrderStatusOrReadinessQuestion,
  isExplicitStoreHoursQuestion,
} from './intent-guards'

export type PilotSafeReply = {
  canonicalContinuationReply?: string
  canonicalHoursReply?: string
  action: 'answer_store_hours' | 'answer_store_location' | 'answer_official_pix'
    | 'human_handoff' | 'repeat_handoff' | 'acknowledge_attachment'
    | 'recognize_continuation' | 'conservative_fallback'
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
  return isStoreOneFullRedesignEnabled(storeId, settings) || (storeId === 1
    && settings?.ai_redesign?.mode === 'shadow'
    && settings.ai_redesign.safe_replies_enabled === true)
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
    && !input.decision.facts.teamOutreachContinuation
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
  fullRouting?: boolean
}): PilotSafeReplyBase | null {
  const { classification, decision, turnMessages } = input

  if (input.fullRouting && decision.action === 'conservative_fallback'
    && classification.intent === 'greeting'
    && classification.confidence >= WHATSAPP_REDESIGN_MIN_CONFIDENCE) {
    return { action: 'conservative_fallback', messageType: 'ai_greeting' }
  }

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
    ...(input.fullRouting && reply.action === 'answer_store_hours'
      ? { canonicalHoursReply: input.decision.fallbackReply ?? undefined } : {}),
    ...(input.decision.facts.teamOutreachContinuation
      ? { canonicalContinuationReply: input.decision.fallbackReply ?? undefined } : {}),
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

function requiredScheduleTimesForQuestion(schedule: string, userMessages: Array<{ text: string | null }>) {
  const times = [...schedule.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0])
  if (times.length < 2) return times

  const question = normalizeForComparison(userMessages.map((message) => message.text ?? '').join(' '))
  const asksOpening = /\b(?:abre|abrir|abertura|inicio|comeca|open|opens|opening|start|starts|empieza)\b/u.test(question)
  const asksClosing = /\b(?:fecha|fechar|fechamento|encerra|encerramento|ate que horas|close|closes|closing|until what time|cierra|cerrar|hasta que hora)\b/u.test(question)

  if (asksOpening && !asksClosing) return [times[0]]
  if (asksClosing && !asksOpening) return [times[times.length - 1]]
  return times
}

export function resolveStoreOnePilotReplyText(
  candidate: PilotSafeReply,
  result: { success: true; data: { reply_text: string } } | { success: false }
) {
  const canonicalHours = (reason: string) => {
    if (candidate.action !== 'answer_store_hours' || !candidate.canonicalHoursReply) return null
    const facts = candidate.replyInput.facts
    const tomorrow = facts.requestedDay === 'tomorrow'
    const schedule = tomorrow ? facts.tomorrowSchedule : facts.todaySchedule
    if (typeof schedule !== 'string' || !schedule.trim()) return null
    const language = facts.replyLanguage
    const label = tomorrow
      ? language === 'es' ? 'Horario de mañana' : language === 'en' ? "Tomorrow's hours" : 'Horário de amanhã'
      : facts.isStoreOpenNow === false
        ? language === 'es' ? 'Horario previsto para hoy (no indica que esté abierta ahora)'
          : language === 'en' ? "Scheduled hours today (this does not mean we are open now)"
            : 'Expediente previsto para hoje (não significa que estamos abertos agora)'
        : language === 'es' ? 'Horario de hoy' : language === 'en' ? "Today's hours" : 'Horário de hoje'
    const breaks = facts.todayBreakSchedule
    const breakLabel = language === 'es' ? 'Intervalos' : language === 'en' ? 'Breaks' : 'Intervalos'
    const text = `${candidate.canonicalHoursReply} ${label}: ${schedule}.${!tomorrow && typeof breaks === 'string' && breaks
      ? ` ${breakLabel}: ${breaks}.` : ''}`
    return { shouldSend: true as const, text, generatedBy: 'canonical' as const, reason }
  }
  const suppressed = (reason: string) => ({
    shouldSend: false as const,
    generatedBy: 'suppressed' as const,
    reason,
  })
  if (!result.success) {
    return canonicalHours('provider_failure') ?? suppressed('provider_failure')
  }

  let replyText = result.data.reply_text.trim()
  let normalizedReply = normalizeForComparison(replyText)
  const continuation = candidate.replyInput.facts.teamOutreachContinuation
  if (continuation) {
    const unsafe = /\b(?:pront\w*|agend\w*|reserv\w*|pag\w*|baix\w*|pode (?:vir|retirar|buscar)|como posso|atendente|encaminh\w*)\b/u.test(normalizedReply)
    const missingContext = continuation === 'greeting'
      ? !/\b(?:equipe|avis\w*)\b/u.test(normalizedReply) || !/\b(?:retirada|retirar|buscar)\b/u.test(normalizedReply)
      : replyText.includes('?') || !/\b(?:combinado|obrigad\w*|agradec\w*|avis\w*|thanks|gracias)\b/u.test(normalizedReply)
    if (unsafe || missingContext) {
      return candidate.canonicalContinuationReply
        ? { shouldSend: true as const, text: candidate.canonicalContinuationReply,
          generatedBy: 'canonical' as const, reason: 'team_outreach_continuation_preserved' }
        : suppressed('team_outreach_context_omitted')
    }
  }
  const productMention = candidate.replyInput.facts.productMention
  if (candidate.replyInput.facts.frameAdjustment === true
    && (/\b(?:reclamacao|adaptacao ruim|sinto muito|lamentamos|prioridade|urgente)\b/u.test(normalizedReply)
      || !/\b(?:ajust\w*|apert\w*|armaca\w*|frame|fit|adjust\w*)\b/u.test(normalizedReply))) {
    return suppressed('adjustment_misrepresented')
  }
  if (candidate.replyInput.facts.postSaleGreeting === true
    && candidate.replyInput.facts.postSaleStage === 'awaiting_feedback'
    && (!/\b(?:adaptacao|adaptacion|adaptation|adjusting)\b/u.test(normalizedReply) || !replyText.includes('?'))) {
    return suppressed('post_sale_question_omitted')
  }
  if (candidate.replyInput.facts.mustIdentifyIara === true) {
    const hasExplicitIdentity = /\b(?:eu sou |sou |aqui e |soy |yo soy |i am |i m |this is )(?:a |la )?(?:assistente virtual )?iara\b/u.test(normalizedReply)
    if (!hasExplicitIdentity) {
      const misorderedIntroduction = replyText.match(/^(?:(?:ol[aá]|oi)\s*,?\s*)?iara\s+aqui[!.,;:]?\s*/iu)
      const continuation = misorderedIntroduction
        ? replyText.slice(misorderedIntroduction[0].length).trim()
        : replyText
      replyText = `Sou a IAra, assistente virtual da ótica.${continuation ? ` ${continuation}` : ''}`
      normalizedReply = normalizeForComparison(replyText)
    }
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
    const requiredTimes = requiredScheduleTimesForQuestion(expectedSchedule, candidate.replyInput.userMessages)
    if (requiredTimes.some((time) => !replyText.includes(time))) {
      return canonicalHours('official_hours_omitted') ?? suppressed('official_hours_omitted')
    }
  }

  return { shouldSend: true as const, text: replyText, generatedBy: 'ai' as const, reason: null }
}
