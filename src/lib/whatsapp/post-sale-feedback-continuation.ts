import type { PostSaleContext } from './post-sale-followup'

const STORE_QUOTE = /\b(?:aqui e da otica|como esta a adaptacao|retirada de|ja faz \d+ dias|seus oculos foi|queriamos saber|segue o detalhamento)\b/u
const LAUGH = /\b(?:jeje|jaja|haha|hehe|kkkk+|rsrs+)\b/gu
const SOCIAL_CLAUSE = /^(?:oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|td bom)$/u
const GREETING_PREFIX = /^(?:oi|ola|opa|e ai|bom dia|boa tarde|boa noite|tudo bem|tudo bom|td bem|td bom)\b[\s,]*/u
const INCIDENTAL_PAY = /^(?:so|solo) falta (?:ir (?:a )?)?pagar(?: (?:o|a|meu|minha|el|la|mi) (?:cartao|fatura|tarjeta))?$/u
const NEGATIVE = /\b(?:nao me adaptei|nao gost\w*|nao esta bom|nao deu certo|nao serve|ruim|pessimo|horrivel|dor|doendo|doeu|tontura|tonto|enjoo|embac\w*|borr\w*|reclam\w*|aperto|apert\w*|folgado|caindo|incomod\w*|zoado|pior|arde|ardendo)\b/u
const OTHER_TOPIC = /\b(?:pagar|pagamento|pix|boleto|link|saldo|quanto|preco|buscar|retirar|passar ai|passar la|horario|atendente|humano|ajustar|ajuste|apertar|armacao|amanha|pedido)\b|\bos\s*#?\d+\b/u
const AFFIRMATIVE = /\b(?:cert[oa]s?|certinho|de boa|na boa|numa boa|suave|sussa|suss[ae]|tranqui\w*|firmeza|blz|beleza|show|top|massa|dahora|joia|perfeit\w*|otim\w*|excelent\w*|maravilh\w*|gostei|gosto|bom demais|boa demais|super bem|muito bem|muito bom|esta bom|ta bom|ta boa|esta boa|ficou bom|ficou boa|enxerg\w*|adaptei|adaptacao|sem problema|nenhum problema|nada a reclamar|ok|okay|sim|100|valeu|obrigad\w*|gracas a deus|ainda bem|tudo certo|td certo|tudo ok|td ok|ta certo|esta certo|ta sim|esta sim|uso bem|usando bem|uma boa)\b/u

function fold(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/gu, '').toLowerCase()
}

function customerClauses(messageText: string) {
  const clauses: string[] = []
  for (const line of messageText.split('\n')) {
    const foldedLine = fold(line).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim()
    if (!foldedLine || foldedLine === 'voce' || foldedLine === 'you' || STORE_QUOTE.test(foldedLine)) continue
    let rest = foldedLine.replace(LAUGH, ' ').replace(/\s+/g, ' ').trim()
    while (GREETING_PREFIX.test(rest)) rest = rest.replace(GREETING_PREFIX, '').trim()
    for (const clause of rest.split(/[.?!,;]+/u)) {
      const clean = clause.replace(/\s+/g, ' ').trim()
      if (clean) clauses.push(clean)
    }
  }
  return clauses
}

/** Le a resposta do cliente no pos-venda, sem catalogar cada gíria. */
export function postSaleCustomerReply(messageText: string | null | undefined): 'positive' | 'negative' | 'other' | 'greeting' {
  if (!messageText?.trim()) return 'other'
  const ownText = messageText.split('\n').filter((line) => {
    const folded = fold(line)
    return folded && !STORE_QUOTE.test(folded)
  }).join('\n')
  if (/[?\u00bf]/u.test(ownText)) return 'other'
  const clauses = customerClauses(messageText)
  if (!clauses.length) return 'greeting'
  const meaningful = clauses.filter((clause) => !SOCIAL_CLAUSE.test(clause) && !INCIDENTAL_PAY.test(clause))
  if (!meaningful.length) return 'greeting'
  if (meaningful.some((clause) => NEGATIVE.test(clause) || OTHER_TOPIC.test(clause))) return 'negative'
  if (meaningful.some((clause) => AFFIRMATIVE.test(clause))) return 'positive'
  const words = meaningful.length === 1 ? meaningful[0].split(' ') : []
  const shortAnswer = words.length >= 2 && words.length <= 8
    && !/\b(?:quero|preciso|pode|manda|cade|quando|onde|como)\b/u.test(meaningful[0])
  return shortAnswer ? 'positive' : 'other'
}

/** Reconhece retorno positivo no acompanhamento confirmado, sem inferir divida. */
export function postSaleFeedbackContinuation(input: {
  context: PostSaleContext | null
  messageText: string | null | undefined
  hasAttachment: boolean
  explicitHumanRequest: boolean
  explicitOrderRequest: boolean
}): 'positive' | 'comment' | null {
  if (!input.context?.postSalesId || !['awaiting_feedback', 'awaiting_rating'].includes(input.context.stage ?? '')
    || input.hasAttachment || input.explicitHumanRequest || input.explicitOrderRequest
    || !input.messageText) return null
  if (postSaleCustomerReply(input.messageText) === 'positive') return 'positive'
  const lines = input.messageText.split('\n').map((line) => fold(line)
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(LAUGH, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (input.context.stage === 'awaiting_rating' && lines.length === 1 && INCIDENTAL_PAY.test(lines[0])) return 'comment'
  return null
}

/** Adaptação boa dita pelo cliente, inclusive gíria, abreviação e cumprimento junto. */
export function isClearPositiveAdaptationReply(messageText: string | null | undefined) {
  return postSaleCustomerReply(messageText) === 'positive'
}

export function needsPostSaleIaraIntroduction(history: string[]) {
  return !history.some(line => /^ia:\s.*\biara\b/iu.test(line))
}
