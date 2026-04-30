'use server'

import { GoogleGenerativeAI } from '@google/generative-ai'
import type { RecommendationOption } from '@/lib/server/lens-recommendation'

const GEMINI_KEYS = [
  process.env.GEMINI_SECRET_KEY_1,
  process.env.GEMINI_SECRET_KEY_2,
  process.env.GEMINI_SECRET_KEY_3,
  process.env.GEMINI_SECRET_KEY_4,
  process.env.GEMINI_SECRET_KEY_5,
].filter(Boolean) as string[]

export type PatientNarrativeContext = {
  age: number | null
  esferico: number | null
  cilindrico: number | null
  adicao: number | null
  rotinaTags: string[]
  queixas: string[]
  beneficiosDesejados: string[]
  marcaAtual: string | null
  targetPrice: number | null
  adaptationDifficulty: string | null
}

export type NarrativesResult = {
  success: boolean
  narratives: string[] | null
  error?: string
}

function buildPrompt(ctx: PatientNarrativeContext, recommendations: RecommendationOption[]): string {
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const sig = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2))

  const patientLines: string[] = []
  if (ctx.age) patientLines.push(`Idade: ${ctx.age} anos`)
  const rx = [
    ctx.esferico != null ? `Esf ${sig(ctx.esferico)}` : null,
    ctx.cilindrico != null && ctx.cilindrico !== 0 ? `Cil ${sig(ctx.cilindrico)}` : null,
    ctx.adicao != null ? `Adição +${ctx.adicao.toFixed(2)}` : null,
  ].filter(Boolean)
  if (rx.length) patientLines.push(`Grau: ${rx.join(' | ')}`)
  if (ctx.rotinaTags.length) patientLines.push(`Rotina: ${ctx.rotinaTags.join(', ')}`)
  if (ctx.queixas.length) patientLines.push(`Queixas: ${ctx.queixas.join(', ')}`)
  if (ctx.beneficiosDesejados.length) patientLines.push(`Prioridades: ${ctx.beneficiosDesejados.join(', ')}`)
  if (ctx.marcaAtual) patientLines.push(`Marca atual: ${ctx.marcaAtual}`)
  if (ctx.targetPrice) patientLines.push(`Orçamento alvo: ${fmt.format(ctx.targetPrice)}`)
  if (ctx.adaptationDifficulty) patientLines.push(`Adaptação prévia: dificuldade ${ctx.adaptationDifficulty}`)

  const optionsText = recommendations.slice(0, 3).map((opt, i) => {
    const parts = [
      `${i + 1}. ${opt.familyName}`,
      opt.offerLabel ? opt.offerLabel : null,
      fmt.format(opt.finalPrice),
      opt.clinicalCategory,
      opt.treatmentName ?? null,
    ].filter(Boolean).join(' — ')
    const reasons = opt.reasons.slice(0, 6).join(', ')
    return `${parts}\n   Sinais: ${reasons}`
  }).join('\n')

  return `Você é um especialista em vendas de ótica. Gere argumentos de apoio para o VENDEDOR (não para ler ao cliente).

PACIENTE:
${patientLines.join('\n')}

OPÇÕES RANKEADAS PELO SISTEMA:
${optionsText}

Para cada opção, escreva 2-3 frases que conectem as necessidades reais deste paciente às vantagens desta lente específica. Seja concreto — cite rotina, queixas ou grau quando relevante. Português brasileiro, tom profissional.

Responda APENAS com JSON válido:
{"narratives": ["argumento 1", "argumento 2", "argumento 3"]}`
}

export async function generateLensNarrativesAction(
  patientContext: PatientNarrativeContext,
  recommendations: RecommendationOption[],
): Promise<NarrativesResult> {
  if (!GEMINI_KEYS.length) {
    return { success: false, narratives: null, error: 'Nenhuma chave Gemini configurada' }
  }
  if (!recommendations.length) {
    return { success: false, narratives: null, error: 'Sem recomendações' }
  }

  const prompt = buildPrompt(patientContext, recommendations)

  for (const key of GEMINI_KEYS) {
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' },
      })

      const result = await model.generateContent(prompt)
      const text = result.response.text()

      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) throw new Error('JSON não encontrado na resposta')

      const parsed = JSON.parse(jsonMatch[0])
      if (!Array.isArray(parsed.narratives) || !parsed.narratives.length) {
        throw new Error('Formato inválido')
      }

      return { success: true, narratives: parsed.narratives }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isQuota =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rateLimitExceeded')
      if (!isQuota) {
        return { success: false, narratives: null, error: msg }
      }
      // cota esgotada: tenta a próxima chave
    }
  }

  return { success: false, narratives: null, error: 'Cota esgotada em todas as chaves Gemini' }
}
