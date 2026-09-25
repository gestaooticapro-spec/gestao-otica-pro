import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignReplyInput } from '../ai'
import type { WhatsAppRedesignClassification, WhatsAppSystemDecisionDraft } from './contracts'
import { isExplicitOfficialPixRequest } from './system-decision'
import { detectWhatsAppRedesignReplyLanguage, localizedPixReply } from './reply-language'

export type PilotSafeReply = {
  action: 'answer_store_hours' | 'answer_store_location' | 'answer_official_pix'
    | 'human_handoff' | 'repeat_handoff' | 'acknowledge_attachment'
    | 'recognize_continuation' | 'conservative_fallback'
  fallbackText: string
  replyInput: WhatsAppRedesignReplyInput
  messageType: 'store_hours' | 'store_location' | 'payment_pix_info'
    | 'human_handoff' | 'attachment_handoff' | 'ai_clarification' | 'ai_greeting'
}

type PilotSafeReplyBase = {
  action: PilotSafeReply['action']
  text: string
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
    const holder = input.officialPixHolder?.trim()
    return {
      action: 'answer_official_pix',
      messageType: 'payment_pix_info',
      text: `Nossa chave Pix é ${input.officialPixKey.trim()}.${holder ? ` Favorecido: ${holder}.` : ''} Confira o favorecido antes de pagar.`,
    }
  }

  if (decision.action === 'answer_store_hours' || decision.action === 'answer_store_location') {
    return decision.fallbackReply ? {
      action: decision.action,
      text: decision.fallbackReply,
      messageType: decision.action === 'answer_store_hours' ? 'store_hours' : 'store_location',
    } : null
  }

  const messageTypeByAction: Partial<Record<typeof decision.action, PilotSafeReply['messageType']>> = {
    human_handoff: 'human_handoff',
    repeat_handoff: 'human_handoff',
    acknowledge_attachment: 'attachment_handoff',
    recognize_continuation: 'ai_clarification',
    conservative_fallback: 'ai_greeting',
  }
  const messageType = messageTypeByAction[decision.action]
  if (messageType && decision.fallbackReply) {
    return { action: decision.action as PilotSafeReply['action'], messageType, text: decision.fallbackReply }
  }

  return null
}

export function selectStoreOnePilotSafeReply(input: Parameters<typeof selectStoreOnePilotSafeReplyBase>[0]) {
  const reply = selectStoreOnePilotSafeReplyBase(input)
  if (!reply) return null
  const text = input.turnMessages.length === 1 && input.turnMessages[0].kind === 'text'
    ? input.turnMessages[0].text?.trim() ?? '' : ''
  const language = detectWhatsAppRedesignReplyLanguage(text ? [text] : [])
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
    fallbackText: reply.action === 'answer_official_pix'
      ? localizedPixReply({
        key: input.officialPixKey?.trim() ?? '',
        holder,
        language,
      })
      : reply.text,
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
  if (!result.success) {
    return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'provider_failure' as const }
  }

  const replyText = result.data.reply_text.trim()
  const normalizedReply = normalizeForComparison(replyText)
  const productMention = candidate.replyInput.facts.productMention
  if (candidate.replyInput.facts.mustIdentifyIara === true
    && !/\b(?:eu sou |sou |aqui e |soy |yo soy |i am |i m |this is )(?:a |la )?(?:assistente virtual )?iara\b/u.test(normalizedReply)) {
    return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'assistant_identity_omitted' as const }
  }

  if (candidate.replyInput.intent === 'product_availability'
    && typeof productMention === 'string'
    && !normalizedReply.includes(normalizeForComparison(productMention))) {
    return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'required_product_omitted' as const }
  }

  if (candidate.replyInput.intent === 'product_availability'
    && /\b(?:temos|tem|disponivel|disponiveis|em estoque|estoque|hay|tenemos|disponible|disponibles|en stock|have it|we have|in stock|available)\b/u.test(normalizedReply)) {
    return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'unsafe_stock_claim' as const }
  }

  if (candidate.action === 'human_handoff' || candidate.action === 'repeat_handoff'
    || candidate.action === 'acknowledge_attachment') {
    const mentionsHandoff = /\b(?:atendente|atendentes|equipe|time|pessoa|humano|encaminh|chamar|consultar|verificar|revisar|asesor|asesora|equipo|persona|derivar|consultar|revisar|attendant|agent|team|person|forward|check|review)\b/u.test(normalizedReply)
    if (!mentionsHandoff) {
      return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'handoff_omitted' as const }
    }
  }

  const officialPixKey = candidate.replyInput.facts.officialPixKey
  if (candidate.action === 'answer_official_pix'
    && typeof officialPixKey === 'string'
    && !replyText.includes(officialPixKey)) {
    return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'official_key_omitted' as const }
  }

  const expectedSchedule = candidate.replyInput.facts.requestedDay === 'tomorrow'
    ? candidate.replyInput.facts.tomorrowSchedule
    : candidate.replyInput.facts.todaySchedule
  if (candidate.action === 'answer_store_hours' && typeof expectedSchedule === 'string') {
    const requiredTimes = [...expectedSchedule.matchAll(/\b\d{1,2}:\d{2}\b/g)].map((match) => match[0])
    if (requiredTimes.some((time) => !replyText.includes(time))) {
      return { text: candidate.fallbackText, generatedBy: 'fallback' as const, fallbackReason: 'official_hours_omitted' as const }
    }
  }

  return { text: replyText, generatedBy: 'ai' as const, fallbackReason: null }
}
