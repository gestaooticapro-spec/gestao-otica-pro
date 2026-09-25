import type { WhatsAppAutomationSettings } from '@/lib/store-modules'
import type { WhatsAppRedesignClassification, WhatsAppSystemDecisionDraft } from './contracts'

export type PilotSafeReply = {
  action: 'answer_store_hours' | 'answer_store_location' | 'answer_official_pix'
  text: string
  messageType: 'store_hours' | 'store_location' | 'payment_pix_info'
}

export function isStoreOneSafeRepliesPilotEnabled(
  storeId: number,
  settings: WhatsAppAutomationSettings | undefined
) {
  return storeId === 1
    && settings?.ai_redesign?.mode === 'shadow'
    && settings.ai_redesign.safe_replies_enabled === true
}

function isExplicitKeyOnlyRequest(text: string) {
  const normalized = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
  return /^(?:qual (?:e |seria )?(?:a )?chave pix|(?:me |nos )?(?:passa|passe|manda|mande|envia|envie|informa|informe) (?:a |sua |o )?(?:chave )?pix|(?:pode |poderia )?(?:me )?(?:passar|mandar|enviar|informar) (?:a |sua |o )?(?:chave )?pix|(?:chave )?pix (?:da loja|da otica)?)(?: por favor)?$/.test(normalized)
}

export function selectStoreOnePilotSafeReply(input: {
  classification: WhatsAppRedesignClassification
  decision: WhatsAppSystemDecisionDraft
  turnMessages: Array<{ kind: string; text: string | null }>
  officialPixKey: string | null
  officialPixHolder: string | null
}): PilotSafeReply | null {
  const { classification, decision, turnMessages } = input
  if (classification.requestsHuman || classification.mentionsAttachment
    || turnMessages.length !== 1 || turnMessages[0].kind !== 'text') return null

  const text = turnMessages[0].text?.trim() ?? ''
  if (!text) return null

  // O classificador nao possui ainda intent Pix. A excecao exige uma pergunta
  // literal e exclusiva pela chave; valores, parcelas e comprovantes seguem no legado.
  if (decision.action !== 'no_reply' && classification.confidence >= 0.78
    && isExplicitKeyOnlyRequest(text) && input.officialPixKey?.trim()) {
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

  return null
}
