import type { WhatsAppConversationMemory } from './contracts'

const MAX_NOTICE_AGE_MS = 48 * 60 * 60 * 1000

function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function socialOnly(text: string) {
  return /^(?:(?:oi|ola|bom dia|boa tarde|boa noite|tudo bem|tudo bom|obg|obrigad[oa]|ok|certo|ta bom|esta bom)\s*)+$/.test(normalize(text))
}

function pickupAcknowledgment(text: string) {
  if (text.includes('?')) return false
  return /^(?:(?:oi|ola|bom dia|boa tarde|boa noite) )?(?:ja |amanha |hoje |depois )?(?:vou|vamos|irei) (?:ai )?(?:buscar|retirar|passar ai(?: para (?:buscar|retirar))?)(?: (?:o|os|meu|meus|teu|seu) oculos)?(?: (?:hoje|amanha|mais tarde|depois))?(?: (?:obg|obrigad[oa]|ok|certo))*$/.test(normalize(text))
}

/** Retoma somente um aviso recente da equipe, sem transformar historico em status atual. */
export function resolveTeamOutreachContinuation(input: {
  memory: WhatsAppConversationMemory
  currentText: string
  now: string
}): 'greeting' | 'pickup_acknowledgment' | null {
  const currentKind = pickupAcknowledgment(input.currentText) ? 'pickup_acknowledgment'
    : socialOnly(input.currentText) ? 'greeting' : null
  if (!currentKind) return null
  const messages = [...input.memory.messages].sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
  const notice = messages.filter((message) => message.role === 'human').at(-1)
  if (!notice?.text || notice.kind !== 'text' || notice.text.includes('?')) return null
  const age = Date.parse(input.now) - Date.parse(notice.occurredAt)
  if (!Number.isFinite(age) || age < 0 || age > MAX_NOTICE_AGE_MS) return null
  const normalizedNotice = normalize(notice.text)
  if (!/\boculos\b/.test(normalizedNotice) || !/\bprontos?\b/.test(normalizedNotice)
    || /\b(?:nao|ainda|se|quando|talvez)\b/.test(normalizedNotice)) return null
  // Outro assunto ou outra saida operacional invalida a associacao. Saudacoes
  // genericas da IA sao toleradas para recuperar a continuidade ja perdida.
  for (const message of messages.filter((item) => Date.parse(item.occurredAt) > Date.parse(notice.occurredAt))) {
    if (message.kind !== 'text' || !message.text) return null
    if (message.role === 'customer') {
      if (!socialOnly(message.text) && !pickupAcknowledgment(message.text)) return null
    } else if (message.role === 'assistant') {
      const text = normalize(message.text)
      const contextualGreeting = /\b(?:equipe|avis\w*)\b/.test(text)
        && /\b(?:retirada|retirar|buscar)\b/.test(text)
      if (!contextualGreeting && !/\bcomo posso (?:te )?ajudar\b/.test(text)) return null
    } else return null
  }
  return currentKind
}
