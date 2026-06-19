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
const REQUEST_TIMEOUT_MS = Number(process.env.WHATSAPP_AI_TIMEOUT_MS || 15000)

const WHATSAPP_INTENTS = [
  'order_status',
  'store_hours',
  'store_location',
  'payment_info',
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
export type WhatsAppAiTask = 'intent_classification' | 'reply_humanization' | 'fallback_reply' | 'receipt_extraction'

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
    .slice(0, 3)
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

export function isWhatsAppIntentSafeForAutomaticHandling(intent: WhatsAppIntent) {
  return intent === 'order_status'
    || intent === 'store_hours'
    || intent === 'store_location'
    || intent === 'payment_info'
}

export { WHATSAPP_INTENTS, WHATSAPP_REASONING_TAGS, WHATSAPP_TONES }
