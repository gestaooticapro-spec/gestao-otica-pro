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
const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-nano'

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

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
  sellerBrief: string | null
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

export type LensSalesOptionArgument = {
  configKey: string
  headline: string
  whyThisLens: string
  sellerArgument: string
  closingLine: string | null
}

export type LensSalesAssist = {
  sellerOpening: string | null
  options: LensSalesOptionArgument[]
  comparisonTip: string | null
}

export type LensSalesAssistResult = {
  success: boolean
  assist: LensSalesAssist | null
  error?: string
}

const LENS_SALES_ASSIST_TEXT_LIMITS = {
  sellerOpening: 220,
  headline: 70,
  whyThisLens: 260,
  sellerArgument: 300,
  closingLine: 120,
  comparisonTip: 240,
} as const

type SalesAssistCriticalFacts = {
  global: string[]
  byOption: Array<{
    configKey: string
    facts: string[]
  }>
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

type OpenAIResponseLike = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
  error?: {
    message?: string
    type?: string
    code?: string
    param?: string
  }
  usage?: {
    input_tokens?: number
    output_tokens?: number
    total_tokens?: number
    prompt_tokens?: number
    completion_tokens?: number
  }
}

type OpenAIChatCompletionLike = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
    type?: string
    code?: string
    param?: string
  }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
    input_tokens?: number
    output_tokens?: number
  }
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

function extractOpenAIText(response: OpenAIResponseLike): string {
  const direct = String(response.output_text || '').trim()
  if (direct) return direct

  const chunks: string[] = []
  const outputs = Array.isArray(response.output) ? response.output : []
  for (const output of outputs) {
    const content = Array.isArray(output.content) ? output.content : []
    for (const part of content) {
      if (part.type === 'output_text' && typeof part.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim())
      }
    }
  }

  return chunks.join('\n').trim()
}

function extractOpenAIUsage(response: OpenAIResponseLike | OpenAIChatCompletionLike): {
  tokensIn: number | '?'
  tokensOut: number | '?'
  tokensTotal: number | '?'
} {
  const usage = response.usage
  const tokensIn = usage?.input_tokens ?? usage?.prompt_tokens ?? '?'
  const tokensOut = usage?.output_tokens ?? usage?.completion_tokens ?? '?'
  const tokensTotal = usage?.total_tokens ?? '?'

  return { tokensIn, tokensOut, tokensTotal }
}

function logOpenAISuccess(params: {
  logTag: 'Audit' | 'Triage' | 'Sales Assist'
  endpoint: 'responses' | 'chat'
  modelName: string
  attempt: number
  usage: ReturnType<typeof extractOpenAIUsage>
}) {
  const { logTag, endpoint, modelName, attempt, usage } = params
  console.log(
    `[OpenAI ${logTag}] ok endpoint=${endpoint} modelo=${modelName} tentativa=${attempt} | entrada: ${usage.tokensIn} tokens | saida: ${usage.tokensOut} tokens | total: ${usage.tokensTotal} tokens`,
  )
}

async function generateWithOpenAI(prompt: string, logTag: 'Audit' | 'Triage' | 'Sales Assist'): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY nao configurada')
  }

  const modelCandidates = Array.from(
    new Set(
      [
        OPENAI_TEXT_MODEL,
        'gpt-4o-mini-2024-07-18',
        'gpt-4o-mini',
        'gpt-4.1-mini',
        'gpt-4.1-nano',
      ].filter(Boolean),
    ),
  )
  const errors: string[] = []

  const buildError = (status: number, payload: unknown): string => {
    if (!payload || typeof payload !== 'object') return `OpenAI HTTP ${status}`
    const err = (payload as { error?: { message?: string; code?: string; type?: string } }).error
    if (!err) return `OpenAI HTTP ${status}`
    const bits = [err.message, err.code, err.type].filter(Boolean)
    return bits.length ? bits.join(' | ') : `OpenAI HTTP ${status}`
  }

  for (const modelName of modelCandidates) {
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        const responsesRes = await fetch('https://api.openai.com/v1/responses', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            input: prompt,
            max_output_tokens: 2200,
          }),
        })

        const responsesData = await responsesRes.json() as OpenAIResponseLike
        if (responsesRes.ok) {
          const text = extractOpenAIText(responsesData)
          if (text) {
            logOpenAISuccess({
              logTag,
              endpoint: 'responses',
              modelName,
              attempt,
              usage: extractOpenAIUsage(responsesData),
            })
            return text
          }
          errors.push(`responses:${modelName}:resposta_vazia`)
        } else {
          errors.push(`responses:${modelName}:${buildError(responsesRes.status, responsesData)}`)
        }

        const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: modelName,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.2,
            max_completion_tokens: 2200,
          }),
        })

        const chatData = await chatRes.json() as OpenAIChatCompletionLike
        if (chatRes.ok) {
          const text = String(chatData.choices?.[0]?.message?.content || '').trim()
          if (text) {
            logOpenAISuccess({
              logTag,
              endpoint: 'chat',
              modelName,
              attempt,
              usage: extractOpenAIUsage(chatData),
            })
            return text
          }
          errors.push(`chat:${modelName}:resposta_vazia`)
        } else {
          errors.push(`chat:${modelName}:${buildError(chatRes.status, chatData)}`)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push(`openai:${modelName}:${msg}`)
      }

      await sleep(900 * attempt)
    }
  }

  throw new Error(`OpenAI sem resposta util. Tentativas: ${errors.slice(0, 8).join(' || ')}`)
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

Regra importante sobre "aceita premium: nao":
- Interprete como restricao comercial a pacote/lente claramente premium e ao preco final, nao como veto absoluto a qualquer componente tecnico premium.
- Se a queixa principal exigir alto desempenho (ex.: reflexos ao dirigir a noite, uso digital intenso) e o orcamento for limitado, descreva o tradeoff como "equilibrar desempenho tecnico com custo", nao como "rejeicao total a tecnologias premium".
- Evite frases duras como "recusa solucoes premium" quando o caso pode aceitar lente de entrada/intermediaria com tratamento superior dentro do alvo de preco.
- Em vez disso, prefira "evitar pacote premium ou investimento alto; justificar componentes superiores apenas quando resolvem a queixa principal e cabem no orcamento".

Use SOMENTE estes sinais:
${ALLOWED_TRIAGE_SIGNALS.map((signal) => `- ${signal}`).join('\n')}

Responda apenas JSON valido, sem markdown:
{
  "parecer": "parecer tecnico curto, sem marca ou produto",
  "sellerBrief": "texto curto para o vendedor, em linguagem de atendimento, com o ponto mais importante para observar na conversa",
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
    sellerBrief: raw.sellerBrief ? String(raw.sellerBrief).trim().slice(0, 600) : null,
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

Regra de leitura sobre "aceita premium: nao":
- Nao trate automaticamente 'treatment_tier:premium' como erro se a lente/pacote nao for premium, o preco final estiver dentro da faixa ou abaixo do alvo, e o tratamento superior resolver uma queixa principal.
- A recusa a premium deve pesar principalmente contra 'lens_tier:premium', pacote claramente premium ou preco final acima do alvo/faixa.
- Quando houver 'lens_tier:entrada|intermediaria' + 'treatment_tier:premium', avalie como trade-off comercial: pode ser correto se o AR premium for necessario para dirigir a noite, reflexos, telas ou blue/UV.
- So marque como erro provavel se o tratamento premium extrapolar o orcamento, contradizer uma rejeicao explicita do componente, ou aparecer sem relacao clara com as queixas.

Regra de leitura sobre features ausentes:
- Se o payload/triagem sinalizar que uma feature e secundaria (ex.: 'fotossensivel_desejado_mas_secundario', 'blue_uv_desejado_mas_secundario' ou motivo '*_secundario_ao_*'), trate sua ausencia como trade-off comercial, nao como erro provavel automatico.
- Para casos de alto grau com direcao noturna, ausencia de AR ou AR inadequado e mais grave que ausencia de fotossensivel, porque atinge uma queixa funcional/seguranca.
- Critique 'feature:ausente_transitions' como erro apenas quando fotossensivel for prioridade principal ou quando nao houver justificativa tecnica/orcamentaria no payload.
- Se uma opcao sem Transitions entrega alto indice, AR premium para direcao noturna e preco muito abaixo do alvo, descreva como alternativa de custo-beneficio com limitacao em luz/sol, nao como falha grave.
- Em alta miopia com queixa noturna, 'tratamento:ar_externo_nao_equivale_ar_noite' ou 'tratamento:ar_ausente_critico' deve ser tratado como falha mais severa do que 'feature:ausente_transitions'.

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

function formatSignedDiopter(value: number): string {
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}D`
}

function pushUnique(items: string[], value: string): void {
  if (!items.includes(value)) items.push(value)
}

function buildSalesAssistCriticalFacts(params: {
  patientContext: PatientAuditContext
  motorInput: RecommendationCaseInput
  recommendations: RecommendationOption[]
}): SalesAssistCriticalFacts {
  const { patientContext, motorInput, recommendations } = params
  const global: string[] = []
  const absSphere = typeof motorInput.esferico === 'number' ? Math.abs(motorInput.esferico) : null
  const absCylinder = typeof motorInput.cilindrico === 'number' ? Math.abs(motorInput.cilindrico) : null
  const add = typeof motorInput.adicao === 'number' ? motorInput.adicao : null
  const objectiveTags = motorInput.objetivo_tags || []
  const desiredBenefits = motorInput.desired_benefits || []
  const preferredFeatures = motorInput.preferred_features || []
  const rejectedFeatures = motorInput.rejected_features || []
  const categories = new Set(recommendations.map((option) => option.clinicalCategory))

  if (add !== null && add >= 3.5) {
    pushUnique(global, `Adicao alta (${formatSignedDiopter(add)}) exige opcoes com grade/disponibilidade compativel.`)
  } else if (add !== null && add >= 3) {
    pushUnique(global, `Adicao elevada (${formatSignedDiopter(add)}) pede atencao a campo de perto e disponibilidade.`)
  }

  if (absCylinder !== null && absCylinder >= 4) {
    pushUnique(global, `Cilindro alto (${formatSignedDiopter(motorInput.cilindrico || 0)}) restringe lentes prontas e exige grade compativel.`)
  } else if (absCylinder !== null && absCylinder >= 2.5) {
    pushUnique(global, `Astigmatismo relevante (${formatSignedDiopter(motorInput.cilindrico || 0)}) pede cuidado com disponibilidade e qualidade optica.`)
  }

  if (absSphere !== null && absSphere >= 6) {
    pushUnique(global, `Grau esferico alto (${formatSignedDiopter(motorInput.esferico || 0)}) aumenta a importancia de espessura, indice e estetica.`)
  } else if (absSphere !== null && absSphere >= 4) {
    pushUnique(global, `Grau esferico moderado/alto (${formatSignedDiopter(motorInput.esferico || 0)}) merece atencao a espessura e material.`)
  }

  if (objectiveTags.includes('ocupacional') || desiredBenefits.includes('ocupacional') || categories.has('ocupacional')) {
    pushUnique(global, 'Objetivo de escritorio: priorizar lente ocupacional para perto/intermediario, nao vender como multifocal de uso geral.')
  }

  if (categories.has('plana_solar')) {
    pushUnique(global, 'Caso solar plano: foco em conforto sob luz intensa, sem sugerir correcao de grau se a receita estiver plana.')
  }

  if (categories.has('controle_miopia') || objectiveTags.includes('controle_miopia') || desiredBenefits.includes('controle_miopia')) {
    pushUnique(global, 'Controle de miopia e uma prioridade clinica: explicar como foco principal quando aparecer nas opcoes.')
  }

  if (patientContext.queixaDirigirNoite || motorInput.rotina_tags?.includes('dirigir_noite')) {
    pushUnique(global, 'Queixa de dirigir a noite: valorizar antirreflexo e qualidade optica quando esses sinais existirem na opcao.')
  }

  if (patientContext.queixaQuebraOculos || patientContext.queixaCriancaAtiva || desiredBenefits.includes('resistencia')) {
    pushUnique(global, 'Necessidade de resistencia: considerar material e impacto como argumento quando a opcao trouxer esse sinal.')
  }

  if (preferredFeatures.includes('blue_uv')) {
    pushUnique(global, 'Cliente deseja Blue/UV: mencionar apenas quando a opcao realmente trouxer esse recurso.')
  }

  if (preferredFeatures.includes('transitions') || preferredFeatures.includes('fotossensivel')) {
    pushUnique(global, 'Cliente deseja fotossensivel: mencionar apenas quando a opcao realmente trouxer esse recurso.')
  }

  if (rejectedFeatures.length > 0) {
    pushUnique(global, `Preferencias rejeitadas devem ser respeitadas no texto: ${rejectedFeatures.join(', ')}.`)
  }

  if (typeof motorInput.targetPrice === 'number') {
    pushUnique(global, `Preco alvo informado: ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(motorInput.targetPrice)}.`)
  }

  const byOption = recommendations.slice(0, 3).map((option) => {
    const facts: string[] = []
    const reasonText = (option.reasons || []).join(' ')

    if (option.clinicalCategory === 'ocupacional') {
      pushUnique(facts, 'Opcao ocupacional para perto/intermediario e rotina de escritorio.')
    }
    if (option.clinicalCategory === 'multifocal') {
      pushUnique(facts, 'Opcao multifocal para multiplas distancias; alinhar com adaptacao e campo de perto quando relevante.')
    }
    if (option.clinicalCategory === 'visao_simples') {
      pushUnique(facts, 'Opcao de visao simples; nao vender como multifocal/ocupacional.')
    }
    if (option.clinicalCategory === 'plana_solar') {
      pushUnique(facts, 'Opcao solar plana para conforto em luz intensa.')
    }
    if (option.clinicalCategory === 'controle_miopia') {
      pushUnique(facts, 'Opcao com foco em controle de miopia.')
    }
    if (reasonText.includes('indice_174')) {
      pushUnique(facts, 'Indice 1.74: argumento de lente mais fina para graus altos quando fizer sentido.')
    } else if (reasonText.includes('indice_167')) {
      pushUnique(facts, 'Indice 1.67: argumento de lente mais fina para graus moderados/altos quando fizer sentido.')
    }
    if (reasonText.includes('ar_premium_dirigir_noite') || reasonText.includes('tratamento:dirigir_noite')) {
      pushUnique(facts, 'Tratamento indicado para dirigir a noite/qualidade visual.')
    }
    if (reasonText.includes('feature:blue_uv')) {
      pushUnique(facts, 'Opcao com Blue/UV ou filtro azul conforme payload.')
    }
    if (reasonText.includes('feature:transitions') || reasonText.includes('fotossensivel')) {
      pushUnique(facts, 'Opcao fotossensivel conforme payload.')
    }
    if (reasonText.includes('alvo_preco:acima_alvo')) {
      pushUnique(facts, 'Preco acima do alvo: apresentar como ponto de atencao comercial simples.')
    }
    if (reasonText.includes('lens_tier:premium') || reasonText.includes('treatment_tier:premium')) {
      pushUnique(facts, 'Opcao com componente premium conforme tier do payload.')
    }
    if (reasonText.includes('fulfillment:sob_demanda_exigencia')) {
      pushUnique(facts, 'Atende uma exigencia de disponibilidade/sob demanda; nao prometer pronta entrega.')
    }

    return {
      configKey: option.configKey,
      facts,
    }
  })

  return { global, byOption }
}

function buildSalesAssistPrompt(params: {
  patientContext: PatientAuditContext
  technicalTriage: LensTechnicalTriage | null
  motorInput: RecommendationCaseInput
  recommendations: RecommendationOption[]
  criticalFacts?: SalesAssistCriticalFacts
}): string {
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const criticalFacts = params.criticalFacts || buildSalesAssistCriticalFacts(params)
  const options = params.recommendations.slice(0, 3).map((opt, index) => ({
    index: index + 1,
    configKey: opt.configKey,
    familyName: opt.familyName,
    offerLabel: opt.offerLabel,
    treatmentName: opt.treatmentName,
    treatmentType: opt.treatmentType,
    clinicalCategory: opt.clinicalCategory,
    finalPrice: opt.finalPrice,
    formattedPrice: fmt.format(opt.finalPrice),
    reasons: opt.reasons,
    score: opt.score,
    commercialSummary: opt.commercialSummary,
    recommendationNotes: opt.recommendationNotes,
    treatmentSummary: opt.treatmentSummary,
    treatmentNotes: opt.treatmentNotes,
    treatmentExplainWhy: opt.treatmentExplainWhy,
  }))

  return `Voce e um consultor senior de optica ajudando um vendedor durante o atendimento.

Objetivo: transformar o payload tecnico do motor em argumentos comerciais honestos, claros e uteis para o vendedor conversar com o cliente.

Regras:
- Nao faca auditoria do motor.
- Nao diga que o motor errou.
- Nao invente beneficios que nao aparecem no payload.
- Nao use reputacao externa de marca como argumento.
- Se houver limitacao relevante, explique como ponto de atencao simples; nao transforme nenhuma opcao em "trade-off" fixo.
- Nao trate a terceira opcao como alternativa especial. Explique cada opcao pelo seu proprio merito.
- Use linguagem natural de balcão, sem parecer laudo medico.
- O texto deve ajudar o vendedor a vender com seguranca, nao confundir o cliente.
- Se uma feature foi rejeitada pelo cliente, nao tente vende-la.
- Se o payload trouxer score/reasons, use isso como evidencia tecnica, mas nao mostre score ao cliente.
- Evite promessas absolutas como "adaptacao garantida", "garante adaptacao", "maxima transparencia", "melhor do mercado" ou "mais fina disponivel", exceto quando o payload trouxer literalmente essa garantia.
- Para Varilux, se fizer sentido mencionar garantia, diga "conta com garantia de adaptacao Varilux, conforme condicoes do certificado"; nao prometa que a adaptacao clinica sera certa ou imediata.
- Quando houver um filtro tecnico decisivo no caso, destaque isso em linguagem simples. Exemplos: adicao alta, cilindro alto, grau alto, lente ocupacional, controle de miopia, lente solar plana, resistencia, alto indice ou rejeicao de uma tecnologia.
- Se a escolha foi limitada por disponibilidade/grade, explique que a opcao foi selecionada por atender a receita, sem prometer disponibilidade fora do payload.
- Use os criticalFacts como fonte preferencial para identificar o motivo tecnico principal. Se houver criticalFacts.global, o sellerOpening deve mencionar o primeiro fato global em linguagem simples.
- Use criticalFacts.byOption para explicar cada opcao pelo seu proprio merito, sem copiar literalmente todos os fatos.
- Seja breve: sellerOpening em ate 1 frase; headline em ate 6 palavras; whyThisLens em ate 2 frases curtas; sellerArgument em ate 2 frases curtas; closingLine em 1 frase.

Responda apenas JSON valido, sem markdown:
{
  "sellerOpening": "frase curta para o vendedor abrir a explicacao, ou null",
  "options": [
    {
      "configKey": "copie exatamente o configKey da opcao",
      "headline": "titulo curto do argumento",
      "whyThisLens": "por que esta lente foi indicada para este cliente",
      "sellerArgument": "texto pronto para o vendedor falar ao cliente",
      "closingLine": "frase curta de fechamento, ou null"
    }
  ],
  "comparisonTip": "dica curta para comparar as opcoes entre si, sem chamar nenhuma de trade-off, ou null"
}

Dados:
${JSON.stringify({
    patient: params.patientContext,
    technicalTriage: params.technicalTriage,
    motorInput: params.motorInput,
    criticalFacts,
    recommendations: options,
  }, null, 2)}`
}

function normalizeSalesAssist(
  raw: Record<string, unknown>,
  recommendations: RecommendationOption[],
): LensSalesAssist {
  const allowedKeys = new Set(recommendations.map((option) => option.configKey))
  const rawOptions = Array.isArray(raw.options) ? raw.options : []

  const options = rawOptions
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => ({
      configKey: String(item.configKey || '').trim(),
      headline: String(item.headline || '').trim().slice(0, LENS_SALES_ASSIST_TEXT_LIMITS.headline),
      whyThisLens: String(item.whyThisLens || '').trim().slice(0, LENS_SALES_ASSIST_TEXT_LIMITS.whyThisLens),
      sellerArgument: String(item.sellerArgument || '').trim().slice(0, LENS_SALES_ASSIST_TEXT_LIMITS.sellerArgument),
      closingLine: item.closingLine ? String(item.closingLine).trim().slice(0, LENS_SALES_ASSIST_TEXT_LIMITS.closingLine) : null,
    }))
    .filter((item) => allowedKeys.has(item.configKey) && (item.whyThisLens || item.sellerArgument))

  return {
    sellerOpening: raw.sellerOpening ? String(raw.sellerOpening).trim().slice(0, LENS_SALES_ASSIST_TEXT_LIMITS.sellerOpening) : null,
    options,
    comparisonTip: raw.comparisonTip ? String(raw.comparisonTip).trim().slice(0, LENS_SALES_ASSIST_TEXT_LIMITS.comparisonTip) : null,
  }
}

export async function generateLensSalesAssistAction(params: {
  patientContext: PatientAuditContext
  technicalTriage: LensTechnicalTriage | null
  motorInput: RecommendationCaseInput
  recommendations: RecommendationOption[]
}): Promise<LensSalesAssistResult> {
  if (!GEMINI_KEYS.length && !OPENAI_API_KEY) {
    return { success: false, assist: null, error: 'Nenhuma chave Gemini/OpenAI configurada' }
  }
  if (!params.recommendations.length) {
    return { success: false, assist: null, error: 'Sem recomendacoes' }
  }

  const criticalFacts = buildSalesAssistCriticalFacts(params)
  const prompt = buildSalesAssistPrompt({ ...params, criticalFacts })

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
        console.log(`[Gemini Sales Assist] ok ${keyLabel}#${attempt} | entrada: ${tokensIn} tokens | saida: ${tokensOut} tokens`)

        const text = extractGeminiText(result.response)
        const json = text ? extractJsonObject(text) : null
        if (json) {
          return { success: true, assist: normalizeSalesAssist(json, params.recommendations) }
        }
      }

      throw new Error('Argumentos de venda vazios ou JSON invalido')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isRecoverable =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('Quota') ||
        msg.includes('503') ||
        msg.includes('Service Unavailable') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('JSON invalido') ||
        msg.includes('Argumentos de venda vazios')

      if (isRecoverable) {
        console.warn(`[Gemini Sales Assist] ${keyLabel} - ${msg}, tentando proxima chave...`)
        if (msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('UNAVAILABLE')) {
          await sleep(5000)
        }
      } else {
        console.error(`[Gemini Sales Assist] ${keyLabel} - erro: ${msg}`)
        return { success: false, assist: null, error: msg }
      }
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const text = await generateWithOpenAI(prompt, 'Sales Assist')
      const json = extractJsonObject(text)
      if (json) {
        return { success: true, assist: normalizeSalesAssist(json, params.recommendations) }
      }
      throw new Error('OpenAI retornou argumentos sem JSON valido')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[OpenAI Sales Assist] erro: ${msg}`)
      return { success: false, assist: null, error: msg }
    }
  }

  return { success: false, assist: null, error: 'Nenhuma chave Gemini/OpenAI retornou argumentos uteis' }
}

export async function generateLensAuditAction(
  patientContext: PatientAuditContext,
  recommendations: RecommendationOption[],
): Promise<AuditResult> {
  if (!GEMINI_KEYS.length && !OPENAI_API_KEY) {
    return { success: false, audit: null, error: 'Nenhuma chave Gemini/OpenAI configurada' }
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
        console.warn(`[Gemini Audit] ? ${keyLabel} - cota esgotada, tentando proxima chave...`)
      } else if (isUnavailable) {
        console.warn(`[Gemini Audit] ? ${keyLabel} - servico indisponivel (503), tentando proxima chave...`)
        await sleep(5000)
      } else if (isEmptyResponse) {
        console.warn(`[Gemini Audit] ? ${keyLabel} - resposta vazia, tentando proxima chave...`)
      } else {
        console.error(`[Gemini Audit] ✗ ${keyLabel} - erro: ${msg}`)
        return { success: false, audit: null, error: msg }
      }
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const audit = await generateWithOpenAI(prompt, 'Audit')
      return { success: true, audit }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[OpenAI Audit] erro: ${msg}`)
    }
  }

  console.error('[Audit] nenhuma chave retornou texto util.')
  return { success: false, audit: null, error: 'Nenhuma chave Gemini/OpenAI retornou texto util na auditoria' }
}

export async function generateLensTechnicalTriageAction(
  patientContext: PatientAuditContext,
  caseInput: RecommendationCaseInput,
): Promise<LensTechnicalTriageResult> {
  if (!GEMINI_KEYS.length && !OPENAI_API_KEY) {
    return { success: false, triage: null, error: 'Nenhuma chave Gemini/OpenAI configurada' }
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
        console.warn(`[Gemini Triage] ? ${keyLabel} - ${msg}, tentando proxima chave...`)
        if (msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('UNAVAILABLE')) {
          await sleep(5000)
        }
      } else {
        console.error(`[Gemini Triage] ? ${keyLabel} - erro: ${msg}`)
        return { success: false, triage: null, error: msg }
      }
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const text = await generateWithOpenAI(prompt, 'Triage')
      const json = extractJsonObject(text)
      if (json) {
        return { success: true, triage: normalizeTechnicalTriage(json) }
      }
      throw new Error('OpenAI retornou triagem sem JSON valido')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[OpenAI Triage] erro: ${msg}`)
      return { success: false, triage: null, error: msg }
    }
  }

  return { success: false, triage: null, error: 'Nenhuma chave Gemini/OpenAI retornou triagem util' }
}

