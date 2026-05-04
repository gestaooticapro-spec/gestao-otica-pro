'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { RecommendationCaseInput, RecommendationOption } from '@/lib/server/lens-recommendation'

const GEMINI_KEYS = [
  process.env.GEMINI_SECRET_KEY_1,
  process.env.GEMINI_SECRET_KEY_2,
  process.env.GEMINI_SECRET_KEY_3,
  process.env.GEMINI_SECRET_KEY_4,
  process.env.GEMINI_SECRET_KEY_5,
].filter(Boolean) as string[]

export type PatientAuditContext = {
  // Prescricao
  age: number | null
  esferico: number | null
  cilindrico: number | null
  adicao: number | null
  // Rotina (horas/dia)
  horasComputador: number | null
  horasDirigir: number | null
  horasLeitura: number | null
  horasCelular: number | null
  horasSol: number | null
  horasTv: number | null
  // Perfil
  marcaAtual: string | null
  tipoLenteAtual: string | null
  usaMultifocalHoje: string | null
  historicoTrocasRecentes: string | null
  dificuldadeAdaptacao: string | null
  // Queixas
  queixaDirigirNoite: boolean
  queixaSensibilidadeLuz: boolean
  queixaQuebraOculos: boolean
  queixaProgressaoRapida: boolean
  queixaCriancaAtiva: boolean
  principalIncomodoAtual: string | null
  // Preferencias e orcamento
  prioridadePrincipal: string | null
  objetivoCompra: string | null
  faixaOrcamento: string | null
  targetPrice: number | null
  aceitaPremium: string | null
  importanciaEstetica: string | null
  importanciaResistencia: string | null
  prefereTransitions: string | null
  prefereBlueUv: string | null
  // Observacoes livres
  observacoesConsultor: string | null
}

export type AuditResult = {
  success: boolean
  audit: string | null
  error?: string
}

const ALLOWED_TRIAGE_SIGNALS = [
  'risco_espessura_alta',
  'risco_espessura_moderada',
  'priorizar_indice_alto',
  'evitar_indice_baixo',
  'priorizar_asferica',
  'priorizar_resistencia',
  'priorizar_trivex_policarbonato',
  'controle_miopia_prioritario',
  'fotossensivel_desejado_mas_secundario',
  'blue_uv_desejado_mas_secundario',
  'risco_adaptacao_multifocal',
  'priorizar_ar_premium',
  'evitar_ar_externo',
  'priorizar_conforto_digital',
  'priorizar_dirigir_noite',
  'priorizar_campo_perto',
  'orcamento_limita_solucao_ideal',
] as const

export type LensTechnicalTriageSignal = (typeof ALLOWED_TRIAGE_SIGNALS)[number]

export type LensTechnicalTriage = {
  parecer: string
  technicalSignals: LensTechnicalTriageSignal[]
  clinicalPriorities: LensTechnicalTriageSignal[]
  salesContext: {
    mainConcern: string | null
    tradeoff: string | null
    caution: string | null
  }
  confidence: 'baixa' | 'media' | 'alta'
  ignoredSignals: string[]
}

export type LensTechnicalTriageResult = {
  success: boolean
  triage: LensTechnicalTriage | null
  error?: string
}

type GeminiResponseLike = {
  text?: () => string
  candidates?: Array<{
    finishReason?: unknown
    content?: {
      parts?: Array<{
        text?: unknown
      }>
    }
  }>
}

function extractGeminiText(response: GeminiResponseLike): string {
  const directText = typeof response.text === 'function' ? String(response.text() || '').trim() : ''
  if (directText) return directText

  const candidates = Array.isArray(response.candidates) ? response.candidates : []
  const chunks: string[] = []

  for (const candidate of candidates) {
    const parts = candidate.content?.parts
    if (!Array.isArray(parts)) continue
    for (const part of parts) {
      if (typeof part.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim())
      }
    }
  }

  return chunks.join('\n').trim()
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item || '').trim()).filter(Boolean)
}

function sanitizeSignals(value: unknown): {
  accepted: LensTechnicalTriageSignal[]
  ignored: string[]
} {
  const allowed = new Set<string>(ALLOWED_TRIAGE_SIGNALS)
  const accepted: LensTechnicalTriageSignal[] = []
  const ignored: string[] = []

  for (const signal of normalizeStringArray(value)) {
    if (allowed.has(signal)) {
      accepted.push(signal as LensTechnicalTriageSignal)
    } else {
      ignored.push(signal)
    }
  }

  return {
    accepted: Array.from(new Set(accepted)),
    ignored: Array.from(new Set(ignored)),
  }
}

function buildTechnicalTriagePrompt(ctx: PatientAuditContext, caseInput: RecommendationCaseInput): string {
  const payload = {
    patient: ctx,
    motorCaseInput: caseInput,
  }

  return `Voce e um especialista tecnico em optica oftalmica fazendo uma TRIAGEM antes do motor matematico de recomendacao.

Objetivo: transformar nuances tecnicas do caso em sinais estruturados. Nao indique marcas, laboratorios, familias ou produtos. Nao use reputacao de mercado. Nao escreva nomes como Varilux, Hoya, Zeiss, Shamir, Stellest etc. Se precisar falar de produto, fale apenas por categoria tecnica.

Analise grau, cilindro, eixo, adicao, idade, rotina, DNP, altura, queixas, preferencias e observacoes do consultor. Pode inferir riscos tecnicos, mas seja conservador quando a informacao faltar.

Use SOMENTE estes sinais:
${ALLOWED_TRIAGE_SIGNALS.map((signal) => `- ${signal}`).join('\n')}

Responda apenas JSON valido, sem markdown:
{
  "parecer": "parecer tecnico curto, sem marca ou produto",
  "technicalSignals": ["um_ou_mais_sinais_da_lista"],
  "clinicalPriorities": ["no_maximo_3_sinais_da_lista"],
  "salesContext": {
    "mainConcern": "principal preocupacao percebida, ou null",
    "tradeoff": "tradeoff que o vendedor deve explicar, ou null",
    "caution": "cuidado para nao prometer algo indevido, ou null"
  },
  "confidence": "baixa|media|alta"
}

Dados:
${JSON.stringify(payload, null, 2)}`
}

function normalizeTechnicalTriage(raw: Record<string, unknown>): LensTechnicalTriage {
  const technical = sanitizeSignals(raw.technicalSignals)
  const priorities = sanitizeSignals(raw.clinicalPriorities)
  const salesContext = raw.salesContext && typeof raw.salesContext === 'object' && !Array.isArray(raw.salesContext)
    ? raw.salesContext as Record<string, unknown>
    : {}
  const confidenceRaw = String(raw.confidence || 'media')
  const confidence = confidenceRaw === 'baixa' || confidenceRaw === 'alta' ? confidenceRaw : 'media'

  return {
    parecer: String(raw.parecer || '').trim().slice(0, 900),
    technicalSignals: technical.accepted,
    clinicalPriorities: priorities.accepted.slice(0, 3),
    salesContext: {
      mainConcern: salesContext.mainConcern ? String(salesContext.mainConcern).slice(0, 500) : null,
      tradeoff: salesContext.tradeoff ? String(salesContext.tradeoff).slice(0, 700) : null,
      caution: salesContext.caution ? String(salesContext.caution).slice(0, 700) : null,
    },
    confidence,
    ignoredSignals: Array.from(new Set([...technical.ignored, ...priorities.ignored])),
  }
}

function buildAuditPrompt(ctx: PatientAuditContext, recommendations: RecommendationOption[]): string {
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const sig = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2))
  const hora = (h: number | null, label: string) => (h && h > 0 ? `${label}: ${h}h/dia` : null)
  const sim = (v: boolean, label: string) => (v ? label : null)

  const lines: string[] = []

  const rx = [
    ctx.esferico != null ? `Esf ${sig(ctx.esferico)}` : null,
    ctx.cilindrico != null && ctx.cilindrico !== 0 ? `Cil ${sig(ctx.cilindrico)}` : null,
    ctx.adicao != null ? `Add +${ctx.adicao.toFixed(2)}` : null,
  ].filter(Boolean)
  if (ctx.age) lines.push(`Idade: ${ctx.age} anos`)
  if (rx.length) lines.push(`Grau: ${rx.join(' | ')}`)

  const rotina = [
    hora(ctx.horasComputador, 'computador'),
    hora(ctx.horasDirigir, 'dirigir'),
    hora(ctx.horasLeitura, 'leitura'),
    hora(ctx.horasCelular, 'celular'),
    hora(ctx.horasSol, 'exposicao ao sol'),
    hora(ctx.horasTv, 'TV'),
  ].filter(Boolean)
  if (rotina.length) lines.push(`Rotina: ${rotina.join(', ')}`)

  if (ctx.tipoLenteAtual && ctx.tipoLenteAtual !== 'nao_informado') lines.push(`Lente atual: ${ctx.tipoLenteAtual}`)
  if (ctx.usaMultifocalHoje && ctx.usaMultifocalHoje !== 'nao_informado') lines.push(`Usa multifocal hoje: ${ctx.usaMultifocalHoje}`)
  if (ctx.historicoTrocasRecentes && ctx.historicoTrocasRecentes !== 'nao_informado') lines.push(`Trocas recentes: ${ctx.historicoTrocasRecentes}`)
  if (ctx.marcaAtual) lines.push(`Marca atual: ${ctx.marcaAtual}`)

  const queixas = [
    sim(ctx.queixaDirigirNoite, 'dificuldade ao dirigir a noite'),
    sim(ctx.queixaSensibilidadeLuz, 'sensibilidade a luz'),
    sim(ctx.queixaQuebraOculos, 'historico de quebra'),
    sim(ctx.queixaProgressaoRapida, 'progressao rapida de miopia'),
    sim(ctx.queixaCriancaAtiva, 'crianca muito ativa'),
    ctx.principalIncomodoAtual && ctx.principalIncomodoAtual !== 'nao_informado' ? `incomodo principal: ${ctx.principalIncomodoAtual}` : null,
    ctx.dificuldadeAdaptacao && ctx.dificuldadeAdaptacao !== 'nao_informado' ? `dificuldade de adaptacao ${ctx.dificuldadeAdaptacao}` : null,
  ].filter(Boolean)
  if (queixas.length) lines.push(`Queixas: ${queixas.join(', ')}`)

  const prefs = [
    ctx.prioridadePrincipal && ctx.prioridadePrincipal !== 'nao_informado' ? `prioridade: ${ctx.prioridadePrincipal}` : null,
    ctx.objetivoCompra && ctx.objetivoCompra !== 'nao_informado' ? `objetivo: ${ctx.objetivoCompra}` : null,
    ctx.faixaOrcamento && ctx.faixaOrcamento !== 'nao_informado' ? `faixa: ${ctx.faixaOrcamento}` : null,
    ctx.targetPrice ? `alvo: ${fmt.format(ctx.targetPrice)}` : null,
    ctx.aceitaPremium && ctx.aceitaPremium !== 'nao_informado' ? `aceita premium: ${ctx.aceitaPremium}` : null,
    ctx.importanciaEstetica && ctx.importanciaEstetica !== 'nao_informado' ? `estetica: ${ctx.importanciaEstetica}` : null,
    ctx.importanciaResistencia && ctx.importanciaResistencia !== 'nao_informado' ? `resistencia: ${ctx.importanciaResistencia}` : null,
    ctx.prefereTransitions && ctx.prefereTransitions !== 'nao_informado' ? `transitions: ${ctx.prefereTransitions}` : null,
    ctx.prefereBlueUv && ctx.prefereBlueUv !== 'nao_informado' ? `blue/UV: ${ctx.prefereBlueUv}` : null,
  ].filter(Boolean)
  if (prefs.length) lines.push(`Preferencias/orcamento: ${prefs.join(', ')}`)

  if (ctx.observacoesConsultor) lines.push(`Obs. consultor: "${ctx.observacoesConsultor}"`)

  const optionsText = recommendations
    .slice(0, 3)
    .map((opt, i) => {
      const label = [opt.familyName, opt.offerLabel, opt.treatmentName].filter(Boolean).join(' — ')
      const reasons = opt.reasons.join(', ')
      return `${i + 1}. ${label}\n   Preco: ${fmt.format(opt.finalPrice)} | Categoria: ${opt.clinicalCategory} | Score: ${opt.score.toFixed(1)}\n   Sinais do motor: ${reasons}`
    })
    .join('\n\n')

  return `Voce e um especialista em optica clinica e comercial avaliando se um motor de recomendacao acertou nas indicacoes. Este e um DEBUG tecnico para calibracao do sistema.

Seu papel e validar a coerencia interna do motor com base somente nos dados abaixo. Nao reordene por reputacao publica, popularidade de marca, conhecimento de mercado externo ou facilidade de encontrar informacoes na web. Se uma marca conhecida parecer melhor por conhecimento externo, trate isso como hipotese comercial, nao como erro do motor. Marcas proprias ou menos conhecidas podem ser tecnicamente equivalentes quando o payload trouxer sinais de design, beneficios, tratamento e score.

ANAMNESE COMPLETA DO PACIENTE:
${lines.join('\n')}

INDICACOES DO MOTOR (em ordem de ranking):
${optionsText}

Analise:
1. Para cada opcao: a indicacao faz sentido clinico e comercial para este paciente? O que esta correto? O que parece estranho, desnecessario ou errado?
2. A ordem do ranking parece coerente com o perfil e com os sinais do motor informados?
3. Ha alguma informacao importante da anamnese que o motor aparentemente ignorou ou subponderou?
4. Alguma indicacao que deveria ter entrado mas nao entrou? (Desconsidere marcas Shamir e Zeiss - nao estao disponiveis no catalogo deste sistema.)

Ao apontar problemas, separe claramente o que e erro provavel do motor, ponto de atencao comercial, hipotese baseada em conhecimento externo, ou preferencia subjetiva. Nao transforme superioridade percebida de marca em erro sem evidencia no payload.

Responda em texto corrido, em portugues, de forma tecnica e direta. Escreva como um colega especialista dando um parecer rapido.`
}

export async function generateLensAuditAction(
  patientContext: PatientAuditContext,
  recommendations: RecommendationOption[],
): Promise<AuditResult> {
  if (!GEMINI_KEYS.length) {
    return { success: false, audit: null, error: 'Nenhuma chave Gemini configurada' }
  }
  if (!recommendations.length) {
    return { success: false, audit: null, error: 'Sem recomendacoes' }
  }

  const prompt = buildAuditPrompt(patientContext, recommendations)

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i]
    const keyLabel = `GEMINI_SECRET_KEY_${i + 1}`
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await model.generateContent(prompt)
        const usage = result.response.usageMetadata
        const tokensIn = usage?.promptTokenCount ?? '?'
        const tokensOut = usage?.candidatesTokenCount ?? '?'
        console.log(`[Gemini Audit] ✓ ${keyLabel}#${attempt} | entrada: ${tokensIn} tokens | saida: ${tokensOut} tokens`)

        const audit = extractGeminiText(result.response)
        if (audit) {
          return { success: true, audit }
        }

        const response = result.response as GeminiResponseLike
        const finishReasons = Array.isArray(response.candidates)
          ? response.candidates.map((candidate) => candidate.finishReason).filter(Boolean)
          : []
        console.warn(`[Gemini Audit] ! ${keyLabel}#${attempt} sem texto. finishReason=${finishReasons.join(',') || 'n/a'}`)
      }

      throw new Error('Resposta vazia')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isQuota =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rateLimitExceeded')
      const isUnavailable =
        msg.includes('503') ||
        msg.includes('Service Unavailable') ||
        msg.includes('UNAVAILABLE')
      const isEmptyResponse = msg.includes('Resposta vazia')
      if (isQuota) {
        console.warn(`[Gemini Audit] ✗ ${keyLabel} - cota esgotada, tentando proxima chave...`)
      } else if (isUnavailable) {
        console.warn(`[Gemini Audit] ✗ ${keyLabel} - servico indisponivel (503), tentando proxima chave...`)
      } else if (isEmptyResponse) {
        console.warn(`[Gemini Audit] ✗ ${keyLabel} - resposta vazia, tentando proxima chave...`)
      } else {
        console.error(`[Gemini Audit] ✗ ${keyLabel} - erro: ${msg}`)
        return { success: false, audit: null, error: msg }
      }
    }
  }

  console.error('[Gemini Audit] ✗ Nenhuma chave retornou texto util.')
  return { success: false, audit: null, error: 'Nenhuma chave Gemini retornou texto util na auditoria' }
}

export async function generateLensTechnicalTriageAction(
  patientContext: PatientAuditContext,
  caseInput: RecommendationCaseInput,
): Promise<LensTechnicalTriageResult> {
  if (!GEMINI_KEYS.length) {
    return { success: false, triage: null, error: 'Nenhuma chave Gemini configurada' }
  }

  const prompt = buildTechnicalTriagePrompt(patientContext, caseInput)

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i]
    const keyLabel = `GEMINI_SECRET_KEY_${i + 1}`
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await model.generateContent(prompt)
        const usage = result.response.usageMetadata
        const tokensIn = usage?.promptTokenCount ?? '?'
        const tokensOut = usage?.candidatesTokenCount ?? '?'
        console.log(`[Gemini Triage] ✓ ${keyLabel}#${attempt} | entrada: ${tokensIn} tokens | saida: ${tokensOut} tokens`)

        const text = extractGeminiText(result.response)
        const json = text ? extractJsonObject(text) : null
        if (json) {
          return { success: true, triage: normalizeTechnicalTriage(json) }
        }

        const response = result.response as GeminiResponseLike
        const finishReasons = Array.isArray(response.candidates)
          ? response.candidates.map((candidate) => candidate.finishReason).filter(Boolean)
          : []
        console.warn(`[Gemini Triage] ! ${keyLabel}#${attempt} sem JSON. finishReason=${finishReasons.join(',') || 'n/a'}`)
      }

      throw new Error('Triagem vazia ou JSON invalido')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isRecoverable =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('Quota') ||
        msg.includes('503') ||
        msg.includes('Service Unavailable') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('Triagem vazia') ||
        msg.includes('JSON invalido')

      if (isRecoverable) {
        console.warn(`[Gemini Triage] ✗ ${keyLabel} - ${msg}, tentando proxima chave...`)
      } else {
        console.error(`[Gemini Triage] ✗ ${keyLabel} - erro: ${msg}`)
        return { success: false, triage: null, error: msg }
      }
    }
  }

  return { success: false, triage: null, error: 'Nenhuma chave Gemini retornou triagem util' }
}
