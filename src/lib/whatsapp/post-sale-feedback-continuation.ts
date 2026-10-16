import type { PostSaleContext } from './post-sale-followup'

/** Reconhece apenas retornos claros no acompanhamento confirmado, sem inferir divida. */
export function postSaleFeedbackContinuation(input: {
  context: PostSaleContext | null
  messageText: string | null | undefined
  hasAttachment: boolean
  explicitHumanRequest: boolean
  explicitOrderRequest: boolean
}): 'positive' | 'comment' | null {
  if (!input.context?.postSalesId || !['awaiting_feedback', 'awaiting_rating'].includes(input.context.stage ?? '')
    || input.hasAttachment || input.explicitHumanRequest || input.explicitOrderRequest
    || !input.messageText || /[?\u00bf]/u.test(input.messageText)) return null
  const lines = input.messageText.split('\n').map(line => line.normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\b(?:jeje|jaja|haha|kkkk|rsrs)+\b/gu, '').replace(/\s+/gu, ' ').trim()).filter(Boolean)
  const positive = /^(?:(?:esta|ta|ficou|estao|estan) )?(?:otim[oa]s?|muito bom|muito bem|excelente|perfecto|perfecta|super bem)$|^(?:me adaptei bem|a adaptacao esta otima)$/u
  const comment = /^(?:so|solo) falta (?:ir (?:a )?)?pagar(?: (?:o|a|meu|minha|el|la|mi) (?:cartao|fatura|tarjeta))?$/u
  if (!lines.length || !lines.every(line => positive.test(line) || comment.test(line))) return null
  if (lines.some(line => positive.test(line))) return 'positive'
  return input.context.stage === 'awaiting_rating' ? 'comment' : null
}

/** Adaptação claramente boa, além da lista curta de frases inteiras. */
export function isClearPositiveAdaptationReply(messageText: string | null | undefined) {
  if (!messageText?.trim() || /[?\u00bf]/u.test(messageText)) return false
  const normalized = messageText.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim()
  if (!normalized) return false
  if (/\b(?:nao|nem|nunca|ruim|pessimo|horrivel|dor|tontura|enjoo|embac\w*|borr\w*|reclam\w*|aperto|folgado|caindo)\b/u.test(normalized)) {
    return false
  }
  return /\b(?:otim[oa]s?|excelente|muito bem|muito bom|super bem|enxerg\w+\s+(?:muito\s+)?bem|me adaptei|adaptacao\s+(?:esta\s+)?(?:otima|boa|muito boa)|ficou\s+(?:otim[oa]|bom|boa|perfeit[oa]))\b/u.test(normalized)
}

export function needsPostSaleIaraIntroduction(history: string[]) {
  return !history.some(line => /^ia:\s.*\biara\b/iu.test(line))
}
