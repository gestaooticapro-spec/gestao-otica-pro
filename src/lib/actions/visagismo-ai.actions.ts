'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { GlobalVisagismoFrameTemplate } from '@/lib/actions/visagismo.actions'
import type { FaceAnalysisResult } from '@/lib/visagismo/face-analysis'
import type { CustomerStyleProfile, FrameRecommendation } from '@/lib/visagismo/frame-recommendation'

const GEMINI_KEYS = [
  process.env.GEMINI_SECRET_KEY_1,
  process.env.GEMINI_SECRET_KEY_2,
  process.env.GEMINI_SECRET_KEY_3,
  process.env.GEMINI_SECRET_KEY_4,
  process.env.GEMINI_SECRET_KEY_5,
].filter(Boolean) as string[]

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-nano'

export type VisagismoNarrativeOption = {
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

const FRAME_COLOR_PALETTE = [
  { name: 'Preto', value: '#0f172a' },
  { name: 'Grafite', value: '#475569' },
  { name: 'Prata', value: '#cbd5e1' },
  { name: 'Dourado', value: '#c9963e' },
  { name: 'Tartaruga', value: '#7c3f1d' },
  { name: 'Marrom', value: '#5c4033' },
  { name: 'Transparente', value: '#d9f3f4' },
  { name: 'Vinho', value: '#7f1d3a' },
  { name: 'Azul', value: '#1d4ed8' },
  { name: 'Verde', value: '#166534' },
] as const

export type VisagismoRecommendationNarrative = {
  sellerOpening: string
  customerSummary: string
  options: VisagismoNarrativeOption[]
  closingLine: string
}

export type VisagismoNarrativeResult = {
  success: boolean
  narrative: VisagismoRecommendationNarrative | null
  error?: string
}

type OpenAIResponseLike = {
  output_text?: string
  output?: Array<{ content?: Array<{ type?: string; text?: string }> }>
  error?: { message?: string; type?: string; code?: string }
}

type OpenAIChatCompletionLike = {
  choices?: Array<{ message?: { content?: string } }>
  error?: { message?: string; type?: string; code?: string }
}

type GeminiResponseLike = {
  text?: () => string
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>
}

export async function generateVisagismoNarrativeAction(params: {
  analysis: FaceAnalysisResult
  customerProfile: CustomerStyleProfile
  recommendations: FrameRecommendation[]
  templates: GlobalVisagismoFrameTemplate[]
  appearance: {
    frameColor: string
    lensMode: string
    skinTone: string
  }
}): Promise<VisagismoNarrativeResult> {
  if (!GEMINI_KEYS.length && !OPENAI_API_KEY) {
    return { success: false, narrative: null, error: 'Nenhuma chave Gemini/OpenAI configurada' }
  }

  const topRecommendations = params.recommendations.slice(0, 3)
  if (!topRecommendations.length) {
    return { success: false, narrative: null, error: 'Sem recomendacoes para explicar' }
  }

  const prompt = buildVisagismoNarrativePrompt({
    ...params,
    recommendations: topRecommendations,
  })

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i]
    const keyLabel = `GEMINI_SECRET_KEY_${i + 1}`

    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      for (let attempt = 1; attempt <= 2; attempt++) {
        const result = await model.generateContent(prompt)
        const usage = result.response.usageMetadata
        console.log(
          `[Gemini Visagismo] ok ${keyLabel}#${attempt} | entrada: ${usage?.promptTokenCount ?? '?'} tokens | saida: ${usage?.candidatesTokenCount ?? '?'} tokens`,
        )

        const text = extractGeminiText(result.response)
        const json = text ? extractJsonObject(text) : null
        if (json) {
          return { success: true, narrative: normalizeNarrative(json, topRecommendations) }
        }
      }

      throw new Error('Narrativa vazia ou JSON invalido')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const recoverable =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('Quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('503') ||
        msg.includes('Service Unavailable') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('JSON invalido') ||
        msg.includes('Narrativa vazia')

      if (recoverable) {
        console.warn(`[Gemini Visagismo] ${keyLabel} - ${msg}, tentando proxima chave...`)
        if (msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('UNAVAILABLE')) {
          await sleep(4000)
        }
      } else {
        console.error(`[Gemini Visagismo] ${keyLabel} - erro: ${msg}`)
        return { success: false, narrative: null, error: msg }
      }
    }
  }

  if (OPENAI_API_KEY) {
    try {
      const text = await generateWithOpenAI(prompt)
      const json = extractJsonObject(text)
      if (json) {
        return { success: true, narrative: normalizeNarrative(json, topRecommendations) }
      }
      throw new Error('OpenAI retornou narrativa sem JSON valido')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`[OpenAI Visagismo] erro: ${msg}`)
      return { success: false, narrative: null, error: msg }
    }
  }

  return { success: false, narrative: null, error: 'Nenhuma chave Gemini/OpenAI retornou texto util' }
}

function buildVisagismoNarrativePrompt(params: {
  analysis: FaceAnalysisResult
  customerProfile: CustomerStyleProfile
  recommendations: FrameRecommendation[]
  templates: GlobalVisagismoFrameTemplate[]
  appearance: {
    frameColor: string
    lensMode: string
    skinTone: string
  }
}) {
  const templatesById = new Map(params.templates.map((template) => [template.id, template]))

  const payload = {
    faceAnalysis: params.analysis,
    customerProfile: params.customerProfile,
    appearance: {
      skinToneLabel: skinToneLabel(params.appearance.skinTone),
      lensMode: params.appearance.lensMode,
    },
    availableFrameColors: FRAME_COLOR_PALETTE,
    recommendations: params.recommendations.map((recommendation, index) => {
      const template = templatesById.get(recommendation.templateId)

      return {
        rank: index + 1,
        templateId: recommendation.templateId,
        name: recommendation.name,
        score: recommendation.score,
        reasons: recommendation.reasons,
        frameProfile: template?.profile ?? null,
        construction: template?.construction ?? 'full-rim',
      }
    }),
  }

  return `
Voce e um consultor de visagismo optico escrevendo apoio para o vendedor apresentar uma indicacao ao cliente.

REGRAS IMPORTANTES:
- Nao mude a ordem das recomendacoes.
- Nao sugira armacoes fora da lista recebida.
- Nao critique o motor e nao diga que a IA discorda.
- Nao mencione score, algoritmo, JSON ou "IA".
- Explique de forma comercial, curta, elegante e natural para atendimento em otica.
- Se houver uma ressalva tecnica nas razoes, trate como comparacao visual, sem assustar o cliente.
- Evite promessas absolutas sobre beleza, idade, genero ou tom de pele.
- Escolha uma cor em availableFrameColors para cada opcao, considerando formato da armacao, faceAnalysis, customerProfile e appearance.skinToneLabel.
- Leve em conta construction: full-rim tem mais presenca, rimless/parafusada deve soar mais leve e delicada, semi-rimless/fio de nylon fica entre os dois.
- Nao justifique a cor atualmente selecionada; recomende a cor que fizer mais sentido.
- suggestedColorHex deve ser exatamente um value de availableFrameColors, e suggestedColorName deve ser o name correspondente.
- Trate a pele como leitura assistida por camera, ajustavel pelo vendedor.
- Separe claramente a justificativa de formato em shapeSuggestion e a justificativa de cor em colorSuggestion.
- A explanation deve ser uma frase-resumo curta combinando formato e cor.
- Responda somente em JSON valido, sem markdown.

Formato obrigatorio:
{
  "sellerOpening": "frase curta para o vendedor iniciar a apresentacao",
  "customerSummary": "resumo curto do que o cliente busca e do que o rosto pede",
  "options": [
    {
      "templateId": "id recebido",
      "name": "nome recebido",
      "headline": "titulo curto",
      "explanation": "resumo geral em ate 220 caracteres",
      "shapeSuggestion": "por que este formato faz sentido para o rosto/perfil em ate 220 caracteres",
      "suggestedColorName": "nome exato de availableFrameColors",
      "suggestedColorHex": "value exato de availableFrameColors",
      "colorSuggestion": "por que a cor sugerida faz sentido com o tom de pele/perfil em ate 220 caracteres",
      "sellerTip": "fala pratica para o vendedor em ate 240 caracteres",
      "caveat": "ressalva curta ou null"
    }
  ],
  "closingLine": "frase curta para convidar o cliente a comparar as 3 opcoes"
}

Dados:
${JSON.stringify(payload, null, 2)}
`.trim()
}

function skinToneLabel(skinTone: string) {
  if (skinTone === 'light') return 'pele clara'
  if (skinTone === 'dark') return 'pele escura/negra'
  return 'pele media'
}

function normalizeNarrative(
  raw: Record<string, unknown>,
  recommendations: FrameRecommendation[],
): VisagismoRecommendationNarrative {
  const allowed = new Map(recommendations.map((item) => [item.templateId, item]))
  const rawOptions = Array.isArray(raw.options) ? raw.options : []

  const options = rawOptions
    .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object' && !Array.isArray(item))
    .map((item) => {
      const templateId = String(item.templateId || '').trim()
      const recommendation = allowed.get(templateId)
      if (!recommendation) return null
      const fallbackExplanation = String(item.explanation || recommendation.reasons.join('. ')).trim()
      const fallbackShape = String(item.shapeSuggestion || fallbackExplanation || recommendation.reasons.join('. ')).trim()
      const suggestedColor = normalizeSuggestedColor(item.suggestedColorHex, item.suggestedColorName)
      const fallbackColor = String(item.colorSuggestion || `A cor ${suggestedColor.name.toLowerCase()} pode equilibrar contraste, pele e estilo desejado no atendimento.`).trim()

      return {
        templateId,
        name: recommendation.name,
        headline: limit(String(item.headline || recommendation.name).trim(), 70),
        explanation: limit(fallbackExplanation, 220),
        shapeSuggestion: limit(fallbackShape, 220),
        suggestedColorName: suggestedColor.name,
        suggestedColorHex: suggestedColor.value,
        colorSuggestion: limit(fallbackColor, 220),
        sellerTip: limit(String(item.sellerTip || 'Compare esta opcao no rosto e observe a leitura geral da expressao.').trim(), 240),
        caveat: item.caveat ? limit(String(item.caveat).trim(), 140) : null,
      }
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const missing = recommendations
    .filter((recommendation) => !options.some((option) => option.templateId === recommendation.templateId))
    .map((recommendation) => ({
      templateId: recommendation.templateId,
      name: recommendation.name,
      headline: recommendation.name,
      explanation: limit(recommendation.reasons.join('. '), 220),
      shapeSuggestion: limit(recommendation.reasons.join('. '), 220),
      suggestedColorName: 'Grafite',
      suggestedColorHex: '#475569',
      colorSuggestion: 'O grafite e uma cor versatil para comparar contraste, leveza e presenca sem pesar tanto quanto o preto.',
      sellerTip: 'Mostre esta opcao como comparacao visual para confirmar o efeito no rosto do cliente.',
      caveat: null,
    }))

  return {
    sellerOpening: limit(String(raw.sellerOpening || 'Separei tres caminhos que fazem sentido para o seu rosto e para o estilo que voce buscou.').trim(), 220),
    customerSummary: limit(String(raw.customerSummary || 'A selecao equilibra proporcao, estilo desejado e efeito visual esperado.').trim(), 260),
    options: [...options, ...missing].slice(0, 3),
    closingLine: limit(String(raw.closingLine || 'Vamos comparar as tres no rosto para ver qual conversa melhor com sua expressao.').trim(), 180),
  }
}

function normalizeSuggestedColor(hex: unknown, name: unknown) {
  const normalizedHex = typeof hex === 'string' ? hex.trim().toLowerCase() : ''
  const byHex = FRAME_COLOR_PALETTE.find((color) => color.value === normalizedHex)
  if (byHex) return { name: byHex.name, value: byHex.value }

  const normalizedName = typeof name === 'string' ? name.trim().toLowerCase() : ''
  const byName = FRAME_COLOR_PALETTE.find((color) => color.name.toLowerCase() === normalizedName)
  const fallback = byName ?? FRAME_COLOR_PALETTE[1]
  return { name: fallback.name, value: fallback.value }
}

function extractGeminiText(response: GeminiResponseLike): string {
  if (typeof response.text === 'function') {
    try {
      const text = response.text()
      if (text?.trim()) return text.trim()
    } catch {}
  }

  return (response.candidates ?? [])
    .flatMap((candidate) => candidate.content?.parts ?? [])
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
    .trim()
}

function extractJsonObject(text: string): Record<string, unknown> | null {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) return null

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

async function generateWithOpenAI(prompt: string): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error('OPENAI_API_KEY nao configurada')

  const responsesRes = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      input: prompt,
      temperature: 0.35,
    }),
  })
  const responsesData = await responsesRes.json() as OpenAIResponseLike
  if (responsesRes.ok) {
    const text = extractOpenAIText(responsesData)
    if (text) return text
  }

  const chatRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.35,
    }),
  })
  const chatData = await chatRes.json() as OpenAIChatCompletionLike
  if (chatRes.ok) {
    const text = chatData.choices?.[0]?.message?.content?.trim()
    if (text) return text
  }

  throw new Error(
    responsesData.error?.message ||
    chatData.error?.message ||
    `OpenAI falhou (${responsesRes.status}/${chatRes.status})`
  )
}

function extractOpenAIText(data: OpenAIResponseLike): string {
  if (data.output_text?.trim()) return data.output_text.trim()

  return (data.output ?? [])
    .flatMap((item) => item.content ?? [])
    .map((content) => content.type === 'output_text' || content.type === 'text' ? content.text ?? '' : '')
    .join('\n')
    .trim()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function limit(value: string, max: number) {
  return value.length > max ? value.slice(0, max - 1).trimEnd() + '…' : value
}
