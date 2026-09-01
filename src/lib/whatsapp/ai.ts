import { GoogleGenerativeAI } from '@google/generative-ai'
import { z } from 'zod'

const GEMINI_KEYS = [
  process.env.GEMINI_SECRET_KEY_1,
  process.env.GEMINI_SECRET_KEY_2,
  process.env.GEMINI_SECRET_KEY_3,
  process.env.GEMINI_SECRET_KEY_4,
  process.env.GEMINI_SECRET_KEY_5,
  process.env.GOOGLE_API_KEY,
].filter(Boolean) as string[]

const OPENAI_KEYS = [
  process.env.OPENAI_API_KEY,
].filter(Boolean) as string[]

const GEMINI_MODEL = process.env.WHATSAPP_AI_GEMINI_MODEL || 'gemini-2.5-flash'
const OPENAI_MODEL = process.env.WHATSAPP_AI_OPENAI_MODEL || process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-nano'
const REQUEST_TIMEOUT_MS = Number(process.env.WHATSAPP_AI_TIMEOUT_MS || 20000)

const WHATSAPP_INTENTS = [
  'order_status',
  'store_hours',
  'store_location',
  'payment_info',
  'post_sale_positive',
  'budget_request',
  'prescription_submission',
  'complaint_or_adaptation',
  'pickup_or_scheduling',
  'human_agent_request',
  'unknown',
] as const

const WHATSAPP_REASONING_TAGS = [
  'status',
  'store_info',
  'payment',
  'post_sale',
  'budget',
  'prescription',
  'complaint',
  'pickup',
  'human_handoff',
  'attachment',
  'safe_automation',
  'manual_review',
  'low_confidence',
  'pix',
  'schedule',
] as const

const WHATSAPP_TONES = [
  'friendly',
  'empathetic',
  'professional',
  'calm',
  'direct',
] as const

export type WhatsAppIntent = (typeof WHATSAPP_INTENTS)[number]
export type WhatsAppReasoningTag = (typeof WHATSAPP_REASONING_TAGS)[number]
export type WhatsAppReplyTone = (typeof WHATSAPP_TONES)[number]
export type WhatsAppAiProvider = 'gemini' | 'openai'
export type WhatsAppAiTask = 'intent_classification' | 'post_sale_rating_resolution' | 'reply_humanization' | 'fallback_reply' | 'receipt_extraction' | 'tool_agent_plan' | 'tool_agent_reply'

export type WhatsAppAiTokenUsage = {
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
}

export const WhatsAppIntentClassificationSchema = z.object({
  intent: z.enum(WHATSAPP_INTENTS),
  confidence: z.number().min(0).max(1),
  automation_candidate: z.boolean(),
  entities: z.object({
    order_number: z.string().trim().min(1).max(80).nullable(),
    cpf: z.string().trim().min(1).max(20).nullable(),
    customer_name: z.string().trim().min(1).max(160).nullable(),
    patient_name: z.string().trim().min(1).max(160).nullable(),
    wants_pix: z.boolean(),
    mentions_attachment: z.boolean(),
    complaint_type: z.string().trim().min(1).max(120).nullable(),
  }),
  reasoning_tags: z.array(z.enum(WHATSAPP_REASONING_TAGS)).max(6),
})

export type WhatsAppIntentClassification = z.infer<typeof WhatsAppIntentClassificationSchema>

export const WhatsAppPostSaleRatingResolutionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('record_rating'),
    rating: z.number().int().min(1).max(5),
    reply_text: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal('ask_rating'),
    rating: z.null(),
    reply_text: z.string().trim().min(1).max(500),
  }),
  z.object({
    action: z.literal('handoff'),
    rating: z.null(),
    reply_text: z.string().trim().min(1).max(500),
  }),
])

export type WhatsAppPostSaleRatingResolution = z.infer<typeof WhatsAppPostSaleRatingResolutionSchema>

export const WhatsAppReplyHumanizationSchema = z.object({
  reply_text: z.string().trim().min(1).max(2000),
})

export type WhatsAppReplyHumanization = z.infer<typeof WhatsAppReplyHumanizationSchema>

export const WhatsAppReceiptExtractionSchema = z.object({
  is_receipt: z.boolean(),
  amount: z.number().nullable(),
  payer_name: z.string().trim().nullable(),
  receiver_name: z.string().trim().nullable(),
})

const WHATSAPP_TOOL_NAMES = [
  'lookup_open_orders',
  'lookup_open_orders_by_identifier',
  'lookup_open_installments',
  'lookup_open_installments_by_identifier',
  'lookup_store_information',
  'get_post_sale_status',
  'request_post_sale_rating',
  'record_post_sale_rating',
  'handoff_human',
] as const

export type WhatsAppToolName = (typeof WHATSAPP_TOOL_NAMES)[number]

function normalizeWhatsAppToolName(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[\s-]+/g, '_')

  const aliases: Record<string, WhatsAppToolName> = {
    lookup_open_orders: 'lookup_open_orders',
    lookup_order_status: 'lookup_open_orders',
    lookup_service_orders: 'lookup_open_orders',
    get_open_orders: 'lookup_open_orders',
    check_open_orders: 'lookup_open_orders',
    consultar_os: 'lookup_open_orders',
    consultar_pedidos: 'lookup_open_orders',
    lookup_open_orders_by_identifier: 'lookup_open_orders_by_identifier',
    lookup_order_by_identifier: 'lookup_open_orders_by_identifier',
    lookup_order_status_by_identifier: 'lookup_open_orders_by_identifier',
    consultar_os_por_identificador: 'lookup_open_orders_by_identifier',
    consultar_pedido_por_identificador: 'lookup_open_orders_by_identifier',
    lookup_open_installments: 'lookup_open_installments',
    lookup_installments: 'lookup_open_installments',
    lookup_payment_info: 'lookup_open_installments',
    get_open_installments: 'lookup_open_installments',
    check_open_installments: 'lookup_open_installments',
    consultar_parcelas: 'lookup_open_installments',
    lookup_open_installments_by_identifier: 'lookup_open_installments_by_identifier',
    lookup_installments_by_identifier: 'lookup_open_installments_by_identifier',
    lookup_payment_info_by_identifier: 'lookup_open_installments_by_identifier',
    consultar_parcelas_por_identificador: 'lookup_open_installments_by_identifier',
    lookup_store_information: 'lookup_store_information',
    lookup_store_info: 'lookup_store_information',
    get_store_information: 'lookup_store_information',
    consultar_loja: 'lookup_store_information',
    get_post_sale_status: 'get_post_sale_status',
    lookup_post_sale_status: 'get_post_sale_status',
    request_post_sale_rating: 'request_post_sale_rating',
    ask_post_sale_rating: 'request_post_sale_rating',
    record_post_sale_rating: 'record_post_sale_rating',
    save_post_sale_rating: 'record_post_sale_rating',
    handoff_human: 'handoff_human',
    handoff_to_human: 'handoff_human',
    transfer_to_human: 'handoff_human',
  }

  if (aliases[normalized]) return aliases[normalized]

  const asksByIdentifier = normalized.includes('identifier')
    || normalized.includes('identificador')
    || normalized.includes('cpf')
  if (/(order|orders|pedido|pedidos|service_order|os)/.test(normalized)) {
    return asksByIdentifier ? 'lookup_open_orders_by_identifier' : 'lookup_open_orders'
  }
  if (/(installment|installments|parcela|parcelas|payment|pagamento|financeiro)/.test(normalized)) {
    return asksByIdentifier ? 'lookup_open_installments_by_identifier' : 'lookup_open_installments'
  }

  return value
}

const WhatsAppToolNameSchema = z.preprocess(
  (value) => typeof value === 'string' ? normalizeWhatsAppToolName(value) : value,
  z.enum(WHATSAPP_TOOL_NAMES)
)

export const WhatsAppToolAgentPlanSchema = z.object({
  tool_calls: z.array(z.object({
    name: WhatsAppToolNameSchema,
    rating: z.number().int().min(1).max(5).nullable().optional(),
  })).max(3),
  reply_text: z.string().trim().max(800).nullable(),
})

export const WhatsAppToolAgentReplySchema = z.object({
  reply_text: z.string().trim().min(1).max(1200),
})

export type WhatsAppToolAgentPlan = z.infer<typeof WhatsAppToolAgentPlanSchema>
export type WhatsAppToolAgentReply = z.infer<typeof WhatsAppToolAgentReplySchema>

export type WhatsAppReceiptExtraction = z.infer<typeof WhatsAppReceiptExtractionSchema>

export type WhatsAppIntentClassificationInput = {
  messageText: string
  channelLabel?: string | null
  storeName?: string | null
  conversationState?: string | null
  recentContext?: string[]
  conversationHistory?: string[]
  hasRecentAttachment?: boolean
  hasOpenOrder?: boolean
  handoffActive?: boolean
}

export type WhatsAppPostSaleRatingResolutionInput = {
  messageText: string
  conversationHistory?: string[]
  storeName?: string | null
}

export type WhatsAppReplyHumanizationInput = {
  intent: WhatsAppIntent
  userMessageText?: string
  conversationHistory?: string[]
  tone?: WhatsAppReplyTone
  canonicalReply: string
  storeName?: string | null
  facts?: Record<string, string | number | boolean | null>
  policy?: {
    mustNotAddInformation?: boolean
    mustKeepShort?: boolean
  }
}

export type WhatsAppAiSuccess<T> = {
  success: true
  provider: WhatsAppAiProvider
  model: string
  keyIndex: number
  data: T
  attempts: number
  rawText: string
  latencyMs: number
  promptText: string
  tokenUsage?: WhatsAppAiTokenUsage
}

export type WhatsAppFallbackReplyInput = {
  userMessageText: string
  conversationHistory?: string[]
  storeName?: string | null
}

export type WhatsAppToolAgentInput = {
  messageText: string
  conversationHistory?: string[]
  recentContext?: string[]
  storeName?: string | null
  basePrompt?: string | null
  pendingPostSale?: {
    postSalesId?: number | null
    stage?: string | null
  } | null
  pendingHumanHandoff?: boolean
}

export type WhatsAppAiFailure = {
  success: false
  error: string
  attempts: number
  providerErrors: string[]
  latencyMs: number
  promptText: string
}

export type WhatsAppAiResult<T> = WhatsAppAiSuccess<T> | WhatsAppAiFailure

type ProviderAttemptSuccess = {
  provider: WhatsAppAiProvider
  model: string
  keyIndex: number
  rawText: string
  tokenUsage?: WhatsAppAiTokenUsage
}

type ProviderAttemptFailure = {
  provider: WhatsAppAiProvider
  keyIndex: number
  error: string
}

type GeminiResponseWithUsage = {
  usageMetadata?: unknown
}

let geminiRoundRobinCursor = 0
let openAiRoundRobinCursor = 0

function normalizeWhitespace(value: string | null | undefined) {
  return String(value || '')
    .replace(/\r/g, '')
    .trim()
}

function nextRoundRobinOrder(size: number, cursor: number) {
  if (size <= 0) return []

  const order: number[] = []
  for (let offset = 0; offset < size; offset += 1) {
    order.push((cursor + offset) % size)
  }
  return order
}

function extractJsonObject(text: string) {
  const trimmed = normalizeWhitespace(text)
  if (!trimmed) return ''

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim()
  }

  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1)
  }

  return trimmed
}

function numericOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizeGeminiUsage(value: unknown): WhatsAppAiTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const usage = value as Record<string, unknown>
  const inputTokens = numericOrNull(usage.promptTokenCount)
  const outputTokens = numericOrNull(usage.candidatesTokenCount)
  const totalTokens = numericOrNull(usage.totalTokenCount)
  if (inputTokens === null && outputTokens === null && totalTokens === null) return undefined
  return { inputTokens, outputTokens, totalTokens }
}

function normalizeOpenAiUsage(value: unknown): WhatsAppAiTokenUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const usage = value as Record<string, unknown>
  const inputTokens = numericOrNull(usage.input_tokens)
  const outputTokens = numericOrNull(usage.output_tokens)
  const totalTokens = numericOrNull(usage.total_tokens)
  if (inputTokens === null && outputTokens === null && totalTokens === null) return undefined
  return { inputTokens, outputTokens, totalTokens }
}

function buildIntentPrompt(input: WhatsAppIntentClassificationInput) {
  const recentContext = (input.recentContext || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(0, 8)
  const conversationHistory = (input.conversationHistory || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(-8)

  return [
    'Voce classifica mensagens de WhatsApp de uma otica.',
    'Responda SOMENTE em JSON valido, sem markdown, sem explicacoes extras.',
    'Escolha apenas uma intent da lista permitida.',
    'Nao invente dados ausentes.',
    'Se houver duvida comercial, clinica, reclamacao, anexo ou baixa confianca, seja conservador.',
    'Se a resposta indicar claramente satisfacao, elogio ou adaptacao boa em um contexto de acompanhamento apos a entrega, use post_sale_positive.',
    'Se o contexto citar pos-venda recente, avalie a mensagem atual: use post_sale_positive ou complaint_or_adaptation somente quando ela claramente continuar esse acompanhamento; se for outro assunto, classifique pelo assunto novo.',
    '',
    'INTENTS PERMITIDAS:',
    WHATSAPP_INTENTS.join(', '),
    '',
    'REASONING TAGS PERMITIDAS:',
    WHATSAPP_REASONING_TAGS.join(', '),
    '',
    'SCHEMA:',
    JSON.stringify({
      intent: 'order_status',
      confidence: 0.93,
      automation_candidate: true,
      entities: {
        order_number: null,
        cpf: null,
        customer_name: null,
        patient_name: null,
        wants_pix: false,
        mentions_attachment: false,
        complaint_type: null,
      },
      reasoning_tags: ['status', 'safe_automation'],
    }, null, 2),
    '',
    'CONTEXTO DO SISTEMA:',
    JSON.stringify({
      channelLabel: input.channelLabel || null,
      storeName: input.storeName || null,
      conversationState: input.conversationState || null,
      hasRecentAttachment: Boolean(input.hasRecentAttachment),
      hasOpenOrder: Boolean(input.hasOpenOrder),
      handoffActive: Boolean(input.handoffActive),
      recentContext,
      conversationHistory,
    }, null, 2),
    '',
    'MENSAGEM DO CLIENTE:',
    input.messageText,
  ].join('\n')
}

function buildPostSaleRatingResolutionPrompt(input: WhatsAppPostSaleRatingResolutionInput) {
  const conversationHistory = (input.conversationHistory || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(-8)

  return [
    'Voce decide como tratar a resposta de um cliente a um pedido de nota de pos-venda de uma otica.',
    'Responda SOMENTE em JSON valido, sem markdown ou explicacoes extras.',
    'Use o historico para entender se a mensagem atual responde ao pedido de nota.',
    'Escolha record_rating somente quando a mensagem expressar claramente uma nota de 1 a 5. Aceite formatos naturais como "nota 05", "cinco", "5 estrelas" e "5/5".',
    'Escolha ask_rating quando o cliente parecer satisfeito, mas nao houver uma nota inequivoca. A resposta deve pedir uma nota de 1 a 5 de forma cordial.',
    'Escolha handoff se houver reclamacao, pedido de atendimento humano, assunto diferente, ou ambiguidade que nao possa ser resolvida com seguranca. A resposta deve informar que a equipe continuara o atendimento.',
    'Nao invente fatos, prazos, descontos ou informacoes da loja. A resposta deve ser curta e em portugues do Brasil.',
    '',
    'SCHEMAS PERMITIDOS:',
    JSON.stringify([
      { action: 'record_rating', rating: 5, reply_text: 'Muito obrigado pela nota 5! Vou registrar seu retorno aqui.' },
      { action: 'ask_rating', rating: null, reply_text: 'Que bom saber disso! Para registrar sua avaliacao, qual nota de 1 a 5 voce nos daria?' },
      { action: 'handoff', rating: null, reply_text: 'Vou encaminhar sua mensagem para nossa equipe continuar o atendimento por aqui.' },
    ], null, 2),
    '',
    'CONTEXTO:',
    JSON.stringify({
      storeName: input.storeName || null,
      flow: 'pos_venda_aguardando_nota',
      conversationHistory,
    }, null, 2),
    '',
    'MENSAGEM ATUAL DO CLIENTE:',
    input.messageText,
  ].join('\n')
}

function buildHumanizationPrompt(input: WhatsAppReplyHumanizationInput) {
  const conversationHistory = (input.conversationHistory || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(-8)

  return [
    'Voce reescreve mensagens de WhatsApp para uma otica.',
    'Responda SOMENTE em JSON valido, sem markdown, sem explicacoes extras.',
    'Nao altere fatos, nao invente informacoes, nao mude a decisao do sistema.',
    'Se a entrada fornecer a MENSAGEM DO CLIENTE original, formule a sua resposta baseada EXATAMENTE nos fatos e na resposta canonica fornecidos para matar a duvida do cliente.',
    'Detecte o idioma predominante da MENSAGEM DO CLIENTE e do historico recente. Responda no mesmo idioma: portugues para portugues e espanhol para espanhol. Nao misture idiomas. Se nao for possivel identificar com seguranca, use portugues do Brasil.',
    'Quando os fatos indicarem que a loja esta fechada, seja acolhedor e contextual. Informe somente o proximo horario fornecido pelo sistema; adapte a redacao ao pedido do cliente sem prometer nada que nao esteja na resposta canonica. Se o caso ja foi encaminhado para a equipe, deixe isso claro de forma gentil.',
    'Se houver policy de mensagem curta, mantenha conciso.',
    '',
    'TONS PERMITIDOS:',
    WHATSAPP_TONES.join(', '),
    '',
    'SCHEMA:',
    JSON.stringify({ reply_text: 'Oi! Hoje atendemos das 08:30 as 18:00.' }, null, 2),
    '',
    'ENTRADA DO SISTEMA:',
    JSON.stringify({
      intent: input.intent,
      tone: input.tone || 'friendly',
      storeName: input.storeName || null,
      facts: input.facts || {},
      policy: {
        mustNotAddInformation: input.policy?.mustNotAddInformation !== false,
        mustKeepShort: input.policy?.mustKeepShort === true,
      },
      canonicalReply: input.canonicalReply,
    }, null, 2),
    ...(conversationHistory.length > 0 ? [
      '',
      'HISTORICO RECENTE DA SESSAO AUTOMATICA:',
      ...conversationHistory,
    ] : []),
    ...(input.userMessageText ? [
      '',
      'MENSAGEM DO CLIENTE (Responda a essa duvida especificamente):',
      input.userMessageText
    ] : []),
  ].join('\n')
}

function buildFallbackReplyPrompt(input: WhatsAppFallbackReplyInput) {
  const conversationHistory = (input.conversationHistory || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(-8)

  return [
    'Voce responde mensagens de WhatsApp para uma otica.',
    'Responda SOMENTE em JSON valido, sem markdown, sem explicacoes extras.',
    'A mensagem caiu no fallback porque o sistema nao identificou uma intencao operacional segura.',
    'Seu trabalho eh responder de forma natural, curta e util, sem inventar informacoes da loja, pedido, estoque, preco, prazo, pagamento ou dados do cliente.',
    'Se for apenas cumprimento ou conversa social, cumprimente de volta e pergunte como pode ajudar.',
    'Se o cliente pedir algo especifico mas faltarem dados ou a intencao estiver ambigua, faca uma pergunta simples de esclarecimento.',
    'Se parecer que precisa de atendente humano, diga que vai chamar a equipe.',
    'Nao liste menu de categorias.',
    '',
    'SCHEMA:',
    JSON.stringify({ reply_text: 'Oi! Tudo bem por aqui. Como posso te ajudar hoje?' }, null, 2),
    '',
    'CONTEXTO DO SISTEMA:',
    JSON.stringify({
      storeName: input.storeName || null,
    }, null, 2),
    ...(conversationHistory.length > 0 ? [
      '',
      'HISTORICO RECENTE DA SESSAO AUTOMATICA:',
      ...conversationHistory,
    ] : []),
    '',
    'MENSAGEM DO CLIENTE:',
    input.userMessageText,
  ].join('\n')
}

function toolAgentHistory(input: WhatsAppToolAgentInput) {
  return (input.conversationHistory || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(-12)
}

function buildToolAgentPlanPrompt(input: WhatsAppToolAgentInput) {
  const conversationHistory = toolAgentHistory(input)
  const recentContext = (input.recentContext || [])
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .slice(0, 10)

  return [
    'Voce e a IA de atendimento de uma otica e decide quando consultar o sistema interno.',
    'Responda SOMENTE em JSON valido.',
    'Nao invente dados sobre pedidos, pagamentos, horarios, endereco, receita, produtos ou politicas.',
    'Use ferramentas quando precisar de fatos do sistema. A ferramenta recebe o telefone e a loja de forma segura; nao inclua CPF, telefone ou IDs nos argumentos.',
    'Se o assunto nao for atendido pela otica (por exemplo, flores), nao use ferramenta e responda de forma gentil que nao possui essa informacao, oferecendo ajuda com assuntos da otica.',
    'Use handoff_human se o cliente pedir claramente uma pessoa, apresentar reclamacao/adaptacao ruim, ou precisar de confirmacao humana para uma informacao que as ferramentas nao cobrem, como receita ou grau. Nao explique limitacoes tecnicas ao cliente.',
    'Quando pendingHumanHandoff for true, a solicitacao ja foi encaminhada, mas nenhum membro da equipe respondeu ainda. Reconheca uma cobranca de retorno, reforce o encaminhamento e continue respondendo duvidas que as ferramentas conseguem resolver. Nao se apresente novamente.',
    'Se houver pos-venda aguardando feedback e o cliente demonstrar satisfacao, use request_post_sale_rating para iniciar o pedido de nota.',
    'Use record_post_sale_rating apenas quando existir um pos-venda aguardando nota e a mensagem indicar inequivocamente uma nota de 1 a 5. Inclua rating.',
    'Se a mensagem atual tiver CPF, nome ou numero de pedido apos voce ter pedido identificacao, use lookup_open_orders_by_identifier ou lookup_open_installments_by_identifier conforme o assunto anterior.',
    'Perguntas sobre previsao de conclusao, prazo, atraso ou possibilidade de adiantar um pedido exigem confirmacao humana quando nao houver uma ferramenta com essa data. Use handoff_human; nao invente prazo.',
    'Para duvida ambigua, responda com uma pergunta curta em vez de encaminhar.',
    'Se precisar usar ferramenta, reply_text deve ser null. Se nao precisar, tool_calls deve ser [].',
    input.basePrompt ? `DIRETRIZ DA LOJA: ${input.basePrompt}` : null,
    '',
    'FERRAMENTAS:',
    'lookup_open_orders: consulta os oculos/pedidos em aberto do titular.',
    'lookup_open_orders_by_identifier: consulta pedido em aberto usando o identificador informado na mensagem atual.',
    'lookup_open_installments: consulta parcelas em aberto do titular.',
    'lookup_open_installments_by_identifier: consulta parcelas em aberto usando o identificador informado na mensagem atual.',
    'lookup_store_information: consulta horario e endereco da loja.',
    'get_post_sale_status: consulta o acompanhamento de pos-venda ativo.',
    'request_post_sale_rating: registra a resposta positiva e pede uma nota de 1 a 5.',
    'record_post_sale_rating: registra uma nota validada de 1 a 5 no pos-venda pendente.',
    'handoff_human: encaminha para a equipe humana.',
    '',
    'CONTEXTO:',
    JSON.stringify({
      storeName: input.storeName || null,
      recentContext,
      pendingPostSale: input.pendingPostSale || null,
      pendingHumanHandoff: input.pendingHumanHandoff === true,
      conversationHistory,
    }),
    '',
    'MENSAGEM ATUAL:',
    input.messageText,
  ].filter((line): line is string => line !== null).join('\n')
}

function buildToolAgentReplyPrompt(input: WhatsAppToolAgentInput, toolResults: unknown[]) {
  return [
    'Voce e a IA de atendimento de uma otica. Responda SOMENTE em JSON valido.',
    'Responda ao cliente em portugues do Brasil, com naturalidade e de forma objetiva.',
    'Use exclusivamente os fatos fornecidos pelos resultados das ferramentas. Nao invente informacoes.',
    'Quando uma ferramenta informar que nao encontrou dados ou que o assunto nao e atendido, explique isso com gentileza e, se fizer sentido, faca uma pergunta curta.',
    'Se houver handoff_human nos resultados, nao fale de limitacoes tecnicas, acesso a dados ou seguranca. A transicao sera apresentada como continuidade do atendimento da otica.',
    'Nao mencione ferramentas, banco de dados, sistema interno, IDs ou regras internas.',
    input.basePrompt ? `DIRETRIZ DA LOJA: ${input.basePrompt}` : null,
    '',
    'CONTEXTO:',
    JSON.stringify({
      storeName: input.storeName || null,
      pendingPostSale: input.pendingPostSale || null,
      pendingHumanHandoff: input.pendingHumanHandoff === true,
      conversationHistory: toolAgentHistory(input),
      toolResults,
    }),
    '',
    'MENSAGEM ATUAL:',
    input.messageText,
  ].filter((line): line is string => line !== null).join('\n')
}

async function callGemini(task: WhatsAppAiTask, prompt: string): Promise<ProviderAttemptSuccess | ProviderAttemptFailure> {
  if (GEMINI_KEYS.length === 0) {
    return { provider: 'gemini', keyIndex: -1, error: 'Nenhuma chave Gemini configurada.' }
  }

  const order = nextRoundRobinOrder(GEMINI_KEYS.length, geminiRoundRobinCursor)
  geminiRoundRobinCursor = (geminiRoundRobinCursor + 1) % GEMINI_KEYS.length

  for (const keyIndex of order) {
    const key = GEMINI_KEYS[keyIndex]
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL })
      
      const payload: Array<string | { inlineData: { data: string; mimeType: string } }> = [prompt]
      if (task === 'receipt_extraction' && prompt.includes('||IMAGE_BASE64_PAYLOAD||')) {
        const [textPrompt, base64Raw] = prompt.split('||IMAGE_BASE64_PAYLOAD||')
        payload[0] = textPrompt.trim()
        
        let mimeType = 'image/jpeg'
        let base64Data = base64Raw.trim()
        
        if (base64Data.startsWith('data:')) {
          const splitPoint = base64Data.indexOf(';base64,')
          if (splitPoint !== -1) {
            mimeType = base64Data.slice(5, splitPoint)
            base64Data = base64Data.slice(splitPoint + 8)
          }
        }
        
        payload.push({
          inlineData: {
            mimeType,
            data: base64Data,
          }
        })
      }

      const result = await Promise.race([
        model.generateContent(payload),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout Gemini.')), REQUEST_TIMEOUT_MS)),
      ])

      const rawText = normalizeWhitespace(result.response.text())
      if (!rawText) {
        return { provider: 'gemini', keyIndex, error: `Gemini respondeu vazio em ${task}.` }
      }

      return {
        provider: 'gemini',
        model: GEMINI_MODEL,
        keyIndex,
        rawText,
        tokenUsage: normalizeGeminiUsage((result.response as GeminiResponseWithUsage).usageMetadata),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (keyIndex === order[order.length - 1]) {
        return { provider: 'gemini', keyIndex, error: `Gemini falhou em ${task}: ${message}` }
      }
    }
  }

  return { provider: 'gemini', keyIndex: -1, error: `Gemini falhou em ${task}.` }
}

async function callOpenAI(task: WhatsAppAiTask, prompt: string): Promise<ProviderAttemptSuccess | ProviderAttemptFailure> {
  if (OPENAI_KEYS.length === 0) {
    return { provider: 'openai', keyIndex: -1, error: 'Nenhuma chave OpenAI configurada.' }
  }

  const order = nextRoundRobinOrder(OPENAI_KEYS.length, openAiRoundRobinCursor)
  openAiRoundRobinCursor = (openAiRoundRobinCursor + 1) % OPENAI_KEYS.length

  for (const keyIndex of order) {
    const key = OPENAI_KEYS[keyIndex]
    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          input: prompt,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })

      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const errorMessage = typeof payload?.error?.message === 'string'
          ? payload.error.message
          : JSON.stringify(payload)
        if (keyIndex === order[order.length - 1]) {
          return { provider: 'openai', keyIndex, error: `OpenAI falhou em ${task}: ${errorMessage}` }
        }
        continue
      }

      const rawText = normalizeWhitespace(
        typeof payload?.output_text === 'string'
          ? payload.output_text
          : Array.isArray(payload?.output)
            ? payload.output
              .flatMap((output: { content?: Array<{ type?: string; text?: string }> }) => output.content || [])
              .filter((part: { type?: string; text?: string }) => part.type === 'output_text' && typeof part.text === 'string')
              .map((part: { text?: string }) => part.text || '')
              .join('\n')
            : ''
      )

      if (!rawText) {
        return { provider: 'openai', keyIndex, error: `OpenAI respondeu vazio em ${task}.` }
      }

      return {
        provider: 'openai',
        model: OPENAI_MODEL,
        keyIndex,
        rawText,
        tokenUsage: normalizeOpenAiUsage(payload?.usage),
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (keyIndex === order[order.length - 1]) {
        return { provider: 'openai', keyIndex, error: `OpenAI falhou em ${task}: ${message}` }
      }
    }
  }

  return { provider: 'openai', keyIndex: -1, error: `OpenAI falhou em ${task}.` }
}

async function runWithFallback(task: WhatsAppAiTask, prompt: string) {
  const providerErrors: string[] = []
  const attempts: Array<Promise<ProviderAttemptSuccess | ProviderAttemptFailure>> = [
    callGemini(task, prompt),
    callOpenAI(task, prompt),
  ]

  for (const attempt of attempts) {
    const result = await attempt
    if ('rawText' in result) {
      return { success: true as const, result, providerErrors }
    }
    providerErrors.push(`${result.provider}:${result.error}`)
  }

  return { success: false as const, providerErrors }
}

function parseStructuredJson<T>(rawText: string, schema: z.ZodSchema<T>) {
  const jsonCandidate = extractJsonObject(rawText)
  const parsed = JSON.parse(jsonCandidate)
  return schema.parse(parsed)
}

async function executeStructuredTask<T>(
  task: WhatsAppAiTask,
  prompt: string,
  schema: z.ZodSchema<T>
): Promise<WhatsAppAiResult<T>> {
  const t0 = Date.now()
  const outcome = await runWithFallback(task, prompt)
  const latencyMs = Date.now() - t0

  if (!outcome.success) {
    return {
      success: false,
      error: `Todos os providers falharam em ${task}.`,
      attempts: outcome.providerErrors.length,
      providerErrors: outcome.providerErrors,
      latencyMs,
      promptText: prompt,
    }
  }

  try {
    const data = parseStructuredJson(outcome.result.rawText, schema)
    return {
      success: true,
      provider: outcome.result.provider,
      model: outcome.result.model,
      keyIndex: outcome.result.keyIndex,
      data,
      attempts: outcome.providerErrors.length + 1,
      rawText: outcome.result.rawText,
      latencyMs,
      promptText: prompt,
      tokenUsage: outcome.result.tokenUsage,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      success: false,
      error: `JSON invalido em ${task}: ${message}`,
      attempts: outcome.providerErrors.length + 1,
      providerErrors: [
        ...outcome.providerErrors,
        `${outcome.result.provider}:json_invalido:${message}`,
      ],
      latencyMs,
      promptText: prompt,
    }
  }
}

export async function classifyWhatsAppIntent(
  input: WhatsAppIntentClassificationInput
): Promise<WhatsAppAiResult<WhatsAppIntentClassification>> {
  return executeStructuredTask(
    'intent_classification',
    buildIntentPrompt(input),
    WhatsAppIntentClassificationSchema
  )
}

export async function resolveWhatsAppPostSaleRating(
  input: WhatsAppPostSaleRatingResolutionInput
): Promise<WhatsAppAiResult<WhatsAppPostSaleRatingResolution>> {
  return executeStructuredTask(
    'post_sale_rating_resolution',
    buildPostSaleRatingResolutionPrompt(input),
    WhatsAppPostSaleRatingResolutionSchema
  )
}

export async function extractReceiptWithVision(
  base64: string,
  mimeType: string | null
): Promise<WhatsAppAiResult<WhatsAppReceiptExtraction>> {
  const prompt = [
    'Voce eh um assistente financeiro de uma otica.',
    'Sua tarefa eh extrair dados de comprovantes de pagamento PIX ou Transferencia.',
    'Responda SOMENTE em JSON valido, sem markdown.',
    'Se a imagem nao for um comprovante de pagamento, marque is_receipt como false.',
    'Se for um comprovante, tente extrair amount (numero float), payer_name (quem pagou), receiver_name (quem recebeu).',
    '||IMAGE_BASE64_PAYLOAD||',
    mimeType && mimeType !== 'application/octet-stream' ? `data:${mimeType};base64,${base64}` : base64
  ].join('\n')

  return executeStructuredTask(
    'receipt_extraction',
    prompt,
    WhatsAppReceiptExtractionSchema
  )
}

export async function humanizeWhatsAppReply(
  input: WhatsAppReplyHumanizationInput
): Promise<WhatsAppAiResult<WhatsAppReplyHumanization>> {
  return executeStructuredTask(
    'reply_humanization',
    buildHumanizationPrompt(input),
    WhatsAppReplyHumanizationSchema
  )
}

export async function generateWhatsAppFallbackReply(
  input: WhatsAppFallbackReplyInput
): Promise<WhatsAppAiResult<WhatsAppReplyHumanization>> {
  return executeStructuredTask(
    'fallback_reply',
    buildFallbackReplyPrompt(input),
    WhatsAppReplyHumanizationSchema
  )
}

export async function planWhatsAppToolAgent(
  input: WhatsAppToolAgentInput
): Promise<WhatsAppAiResult<WhatsAppToolAgentPlan>> {
  return executeStructuredTask(
    'tool_agent_plan',
    buildToolAgentPlanPrompt(input),
    WhatsAppToolAgentPlanSchema
  )
}

export async function writeWhatsAppToolAgentReply(
  input: WhatsAppToolAgentInput,
  toolResults: unknown[]
): Promise<WhatsAppAiResult<WhatsAppToolAgentReply>> {
  return executeStructuredTask(
    'tool_agent_reply',
    buildToolAgentReplyPrompt(input, toolResults),
    WhatsAppToolAgentReplySchema
  )
}

export function isWhatsAppIntentSafeForAutomaticHandling(intent: WhatsAppIntent) {
  return intent === 'order_status'
    || intent === 'store_hours'
    || intent === 'store_location'
    || intent === 'payment_info'
}

export { WHATSAPP_INTENTS, WHATSAPP_REASONING_TAGS, WHATSAPP_TONES }
