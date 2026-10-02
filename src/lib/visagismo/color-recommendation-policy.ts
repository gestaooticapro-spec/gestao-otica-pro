// Narrativa comercial de Visagismo: somente formato e proporcoes.
type NarrativeOption = {
  templateId: string
  name: string
  headline: string
  explanation: string
  shapeSuggestion: string
  suggestedColorName: string
  suggestedColorHex: string
  colorSuggestion: string
  sellerTip: string
  caveat: string | null
}

type Narrative = {
  sellerOpening: string
  customerSummary: string
  options: NarrativeOption[]
  closingLine: string
}

const COLOR_ADVICE_TERMS = /\b(?:cor(?:es)?|color(?:s)?|paleta|tonalidade|tons?|cromatico|preto|preta|branco|branca|grafite|prata|prateado|prateada|dourado|dourada|ouro|tartaruga|marrom|transparente|vinho|bordo|azul|verde|vermelho|vermelha|rosa|rose|roxo|roxa|violeta|amarelo|amarela|bege|ambar|champagne|bronze|cobre|metalico|metalizada|cristal)\b/i

function normalizeForColorDetection(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function withoutColorAdvice(text: string, fallback: string) {
  const safeParts = text
    .match(/[^.!?\n]+[.!?]?/g)
    ?.map((part) => part.trim())
    .filter((part) => part && !COLOR_ADVICE_TERMS.test(normalizeForColorDetection(part)))
    ?? []
  return safeParts.join(' ').trim() || fallback
}

export function enforceVisagismoNarrativeColorPolicy<T extends Narrative>(narrative: T): T {
  return {
    ...narrative,
    sellerOpening: withoutColorAdvice(narrative.sellerOpening, 'Vamos comparar os formatos que melhor conversam com este perfil.'),
    customerSummary: withoutColorAdvice(narrative.customerSummary, 'A analise combina as proporcoes do rosto, o estilo informado e os modelos disponiveis.'),
    options: narrative.options.map((option) => ({
      ...option,
      headline: withoutColorAdvice(option.headline, 'Formato recomendado'),
      explanation: withoutColorAdvice(option.explanation, 'Este modelo foi selecionado pela leitura das proporcoes e preferencias informadas.'),
      shapeSuggestion: withoutColorAdvice(option.shapeSuggestion, 'Compare como este formato estrutura o rosto.'),
      // Os campos permanecem no contrato para reversao, mas nao carregam uma
      // recomendacao enquanto a politica comercial de cor estiver desligada.
      suggestedColorName: '',
      suggestedColorHex: '',
      colorSuggestion: '',
      sellerTip: withoutColorAdvice(option.sellerTip, 'Apresente este modelo ao lado das demais opcoes e confirme a preferencia do cliente.'),
      caveat: option.caveat ? withoutColorAdvice(option.caveat, '') || null : null,
    })),
    closingLine: withoutColorAdvice(narrative.closingLine, 'A escolha final deve considerar o conforto e a preferencia do cliente.'),
  }
}

