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

export type PatientAuditContext = {
  // Prescrição
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
  // Preferências e orçamento
  prioridadePrincipal: string | null
  objetivoCompra: string | null
  faixaOrcamento: string | null
  targetPrice: number | null
  aceitaPremium: string | null
  importanciaEstetica: string | null
  importanciaResistencia: string | null
  prefereTransitions: string | null
  prefereBlueUv: string | null
  // Observações livres
  observacoesConsultor: string | null
}

export type AuditResult = {
  success: boolean
  audit: string | null
  error?: string
}

function buildAuditPrompt(ctx: PatientAuditContext, recommendations: RecommendationOption[]): string {
  const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const sig = (n: number) => (n > 0 ? `+${n.toFixed(2)}` : n.toFixed(2))
  const hora = (h: number | null, label: string) => h && h > 0 ? `${label}: ${h}h/dia` : null
  const sim = (v: boolean, label: string) => v ? label : null

  const lines: string[] = []

  // Prescrição
  const rx = [
    ctx.esferico != null ? `Esf ${sig(ctx.esferico)}` : null,
    ctx.cilindrico != null && ctx.cilindrico !== 0 ? `Cil ${sig(ctx.cilindrico)}` : null,
    ctx.adicao != null ? `Add +${ctx.adicao.toFixed(2)}` : null,
  ].filter(Boolean)
  if (ctx.age) lines.push(`Idade: ${ctx.age} anos`)
  if (rx.length) lines.push(`Grau: ${rx.join(' | ')}`)

  // Rotina
  const rotina = [
    hora(ctx.horasComputador, 'computador'),
    hora(ctx.horasDirigir, 'dirigir'),
    hora(ctx.horasLeitura, 'leitura'),
    hora(ctx.horasCelular, 'celular'),
    hora(ctx.horasSol, 'exposição ao sol'),
    hora(ctx.horasTv, 'TV'),
  ].filter(Boolean)
  if (rotina.length) lines.push(`Rotina: ${rotina.join(', ')}`)

  // Histórico de lentes
  if (ctx.tipoLenteAtual && ctx.tipoLenteAtual !== 'nao_informado') lines.push(`Lente atual: ${ctx.tipoLenteAtual}`)
  if (ctx.usaMultifocalHoje && ctx.usaMultifocalHoje !== 'nao_informado') lines.push(`Usa multifocal hoje: ${ctx.usaMultifocalHoje}`)
  if (ctx.historicoTrocasRecentes && ctx.historicoTrocasRecentes !== 'nao_informado') lines.push(`Trocas recentes: ${ctx.historicoTrocasRecentes}`)
  if (ctx.marcaAtual) lines.push(`Marca atual: ${ctx.marcaAtual}`)

  // Queixas
  const queixas = [
    sim(ctx.queixaDirigirNoite, 'dificuldade ao dirigir à noite'),
    sim(ctx.queixaSensibilidadeLuz, 'sensibilidade à luz'),
    sim(ctx.queixaQuebraOculos, 'histórico de quebra'),
    sim(ctx.queixaProgressaoRapida, 'progressão rápida de miopia'),
    sim(ctx.queixaCriancaAtiva, 'criança muito ativa'),
    ctx.principalIncomodoAtual && ctx.principalIncomodoAtual !== 'nao_informado' ? `incômodo principal: ${ctx.principalIncomodoAtual}` : null,
    ctx.dificuldadeAdaptacao && ctx.dificuldadeAdaptacao !== 'nao_informado' ? `dificuldade de adaptação ${ctx.dificuldadeAdaptacao}` : null,
  ].filter(Boolean)
  if (queixas.length) lines.push(`Queixas: ${queixas.join(', ')}`)

  // Preferências
  const prefs = [
    ctx.prioridadePrincipal && ctx.prioridadePrincipal !== 'nao_informado' ? `prioridade: ${ctx.prioridadePrincipal}` : null,
    ctx.objetivoCompra && ctx.objetivoCompra !== 'nao_informado' ? `objetivo: ${ctx.objetivoCompra}` : null,
    ctx.faixaOrcamento && ctx.faixaOrcamento !== 'nao_informado' ? `faixa: ${ctx.faixaOrcamento}` : null,
    ctx.targetPrice ? `alvo: ${fmt.format(ctx.targetPrice)}` : null,
    ctx.aceitaPremium && ctx.aceitaPremium !== 'nao_informado' ? `aceita premium: ${ctx.aceitaPremium}` : null,
    ctx.importanciaEstetica && ctx.importanciaEstetica !== 'nao_informado' ? `estética: ${ctx.importanciaEstetica}` : null,
    ctx.importanciaResistencia && ctx.importanciaResistencia !== 'nao_informado' ? `resistência: ${ctx.importanciaResistencia}` : null,
    ctx.prefereTransitions && ctx.prefereTransitions !== 'nao_informado' ? `transitions: ${ctx.prefereTransitions}` : null,
    ctx.prefereBlueUv && ctx.prefereBlueUv !== 'nao_informado' ? `blue/UV: ${ctx.prefereBlueUv}` : null,
  ].filter(Boolean)
  if (prefs.length) lines.push(`Preferências/orçamento: ${prefs.join(', ')}`)

  if (ctx.observacoesConsultor) lines.push(`Obs. consultor: "${ctx.observacoesConsultor}"`)

  // Opções rankeadas com score
  const optionsText = recommendations.slice(0, 3).map((opt, i) => {
    const label = [opt.familyName, opt.offerLabel, opt.treatmentName].filter(Boolean).join(' — ')
    const reasons = opt.reasons.join(', ')
    return `${i + 1}. ${label}\n   Preço: ${fmt.format(opt.finalPrice)} | Categoria: ${opt.clinicalCategory} | Score: ${opt.score.toFixed(1)}\n   Sinais do motor: ${reasons}`
  }).join('\n\n')

  return `Você é um especialista em óptica clínica e comercial avaliando se um motor de recomendação acertou nas indicações. Este é um DEBUG técnico para calibração do sistema — seja completamente honesto e direto, sem diplomacia.

ANAMNESE COMPLETA DO PACIENTE:
${lines.join('\n')}

INDICAÇÕES DO MOTOR (em ordem de ranking):
${optionsText}

Analise:
1. Para cada opção: a indicação faz sentido clínico e comercial para este paciente? O que está correto? O que parece estranho, desnecessário ou errado?
2. A ordem do ranking parece coerente com o perfil?
3. Há alguma informação importante da anamnese que o motor aparentemente ignorou ou subponderou?
4. Alguma indicação que deveria ter entrado mas não entrou?

Responda em texto corrido, em português, de forma técnica e direta. Não use títulos ou listas — escreva como um colega especialista dando um parecer rápido.`
}

export async function generateLensAuditAction(
  patientContext: PatientAuditContext,
  recommendations: RecommendationOption[],
): Promise<AuditResult> {
  if (!GEMINI_KEYS.length) {
    return { success: false, audit: null, error: 'Nenhuma chave Gemini configurada' }
  }
  if (!recommendations.length) {
    return { success: false, audit: null, error: 'Sem recomendações' }
  }

  const prompt = buildAuditPrompt(patientContext, recommendations)

  for (let i = 0; i < GEMINI_KEYS.length; i++) {
    const key = GEMINI_KEYS[i]
    const keyLabel = `GEMINI_SECRET_KEY_${i + 1}`
    try {
      const genAI = new GoogleGenerativeAI(key)
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

      const result = await model.generateContent(prompt)
      const usage = result.response.usageMetadata
      const tokensIn = usage?.promptTokenCount ?? '?'
      const tokensOut = usage?.candidatesTokenCount ?? '?'
      console.log(`[Gemini Audit] ✓ ${keyLabel} | entrada: ${tokensIn} tokens | saída: ${tokensOut} tokens`)

      const audit = result.response.text().trim()
      if (!audit) throw new Error('Resposta vazia')

      return { success: true, audit }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      const isQuota =
        msg.includes('429') ||
        msg.includes('quota') ||
        msg.includes('RESOURCE_EXHAUSTED') ||
        msg.includes('rateLimitExceeded')
      if (isQuota) {
        console.warn(`[Gemini Audit] ✗ ${keyLabel} — cota esgotada, tentando próxima chave...`)
      } else {
        console.error(`[Gemini Audit] ✗ ${keyLabel} — erro: ${msg}`)
        return { success: false, audit: null, error: msg }
      }
    }
  }

  console.error('[Gemini Audit] ✗ Todas as chaves esgotaram a cota.')
  return { success: false, audit: null, error: 'Cota esgotada em todas as chaves Gemini' }
}
