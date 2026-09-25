import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignClassification, WhatsAppSystemDecisionDraft } from './contracts'
import { isExplicitOfficialPixRequest } from './system-decision'

export type PilotSafeReply = {
  action: 'answer_store_hours' | 'answer_store_location' | 'answer_official_pix'
    | 'human_handoff' | 'repeat_handoff' | 'acknowledge_attachment'
    | 'recognize_continuation' | 'conservative_fallback'
  text: string
  messageType: 'store_hours' | 'store_location' | 'payment_pix_info'
    | 'human_handoff' | 'attachment_handoff' | 'ai_clarification' | 'ai_greeting'
}

export function isStoreOneSafeRepliesPilotEnabled(
  storeId: number,
  settings: WhatsAppAutomationSettings | undefined
) {
  return storeId === 1
    && settings?.ai_redesign?.mode === 'shadow'
    && settings.ai_redesign.safe_replies_enabled === true
}

export function selectStoreOnePilotSafeReply(input: {
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  turnMessages: Array<{ kind: string; text: string | null }>
  officialPixKey: string | null
  officialPixHolder: string | null
}): PilotSafeReply | null {
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
    return decision.canonicalReply ? {
      action: decision.action,
      text: decision.canonicalReply,
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
  if (messageType && decision.canonicalReply) {
    return { action: decision.action as PilotSafeReply['action'], messageType, text: decision.canonicalReply }
  }

  return null
}
