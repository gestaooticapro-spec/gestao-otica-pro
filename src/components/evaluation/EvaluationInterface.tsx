'use client'

import React, { useEffect, useMemo, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  AlertTriangle,
  Bot,
  Calendar,
  CircleHelp,
  ExternalLink,
  FileSearch,
  History,
  Import,
  Loader2,
  Plus,
  Save,
  Search,
  Sparkles,
  User,
  UserPlus,
  Users2,
  X,
  Baby,
  UserRound,
  Briefcase,
  Trash2, ShoppingCart
} from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import QuickCustomerModal from '@/components/modals/QuickCustomerModal'
import AddDependenteModal from '@/components/modals/AddDependenteModal'
import { getDependentes } from '@/lib/actions/dependents.actions'
import { searchCustomersByName, createNewVenda, type CustomerSearchResult } from '@/lib/actions/vendas.actions'
import {
  getOpticalEvaluationsForSubject,
  upsertOpticalEvaluation,
  type OpticalEvaluationListItem
} from '@/lib/actions/evaluation.actions'
import {
  continueLensRecommendationConversationAction,
  generateLensRecommendationsAction
} from '@/lib/actions/lens-recommendation.actions'
import { Database } from '@/lib/database.types'
import { EvaluationDashboard } from './EvaluationDashboard'
import { getRecentEvaluationsForEmployee, updateEvaluationPanicReason, updateEvaluationExportedVendaId, updateEvaluationOutcomeStatus } from '@/lib/actions/evaluation.actions'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import type {
  RecommendationConversationState,
  RecommendationOption
} from '@/lib/server/lens-recommendation'

type Dependente = Database['public']['Tables']['dependentes']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type SubjectType = 'customer' | 'dependente'
type EvaluationSourceSystem = 'manual' | 'ivision'
type EvaluationStatus = 'rascunho' | 'em_andamento' | 'pendente' | 'concluida' | 'importada' | 'exportada'
type EvaluationParseStatus = 'success' | 'partial' | 'failed'
type OpticalEvaluationPreview = {
  source_document_url: string
  source_document_host: string | null
  parse_status: EvaluationParseStatus
  source_os_number: string | null
  source_exam_type: string | null
  source_exam_datetime: string | null
  patient_name_raw: string | null
  age_years: number | null
  estilo_vida_uso_computador_horas: number | null
  estilo_vida_dirigir_horas: number | null
  estilo_vida_leitura_horas: number | null
  estilo_vida_uso_celular_horas: number | null
  estilo_vida_exposicao_sol_horas: number | null
  estilo_vida_ambiente_interno_horas: number | null
  estilo_vida_ambiente_externo_horas: number | null
  estilo_vida_assistir_tv_horas: number | null
  receita_longe_od_esferico: string | null
  receita_longe_od_cilindrico: string | null
  receita_longe_od_eixo: string | null
  receita_longe_oe_esferico: string | null
  receita_longe_oe_cilindrico: string | null
  receita_longe_oe_eixo: string | null
  receita_adicao: string | null
  recommended_lens_name: string | null
  commercial_recommendation_raw: string | null
  extracted_text: string
  raw_payload_json: Record<string, unknown>
  parse_warning: string | null
  document_hash: string
}

type ImportPreviewResponse = {
  success: boolean
  message: string
  data?: OpticalEvaluationPreview
}

type ManualSuggestion = {
  primaryLens: string
  complementaryOptions: string[]
  reasons: string[]
  summary: string
}

type ActiveCatalogContext = {
  versionId: string
  laboratorio: string
  versao: string
} | null

type ActiveCatalogSummary = {
  versionId: string
  laboratorio: string
  versao: string
}

type LensRecommendationActionPayload = {
  state: RecommendationConversationState
  recommendations: RecommendationOption[]
}

type SuggestionGenerationResult =
  | { success: true; suggestion: ManualSuggestion }
  | { success: false }

type QuickRetentionIntent =
  | 'pesquisar'
  | 'pensar'
  | 'armacoes'
  | 'concorrencia'

const labelStyle = 'block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-[0.2em]'
const inputStyle = 'block w-full rounded-xl border border-white/20 bg-slate-900/60 shadow-inner text-slate-100 h-10 text-sm px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 disabled:opacity-50 transition-all outline-none'
const selectStyle = `${inputStyle} appearance-none bg-[url(data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20fill%3D%22none%22%20viewBox%3D%220%200%2020%2020%22%3E%3Cpath%20stroke%3D%22%2394a3b8%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%20stroke-width%3D%221.5%22%20d%3D%22m6%208%204%204%204-4%22%2F%3E%3C%2Fsvg%3E)] bg-[length:1.25rem_1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-10`
const cardStyle = 'bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl'

const normalizePersonName = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

const formatDegreeDisplay = (value: string | null | undefined) => {
  if (!value?.trim()) return ''

  const parsed = Number(value.replace(',', '.').replace('+', '').trim())
  if (Number.isNaN(parsed)) return value

  const formatted = Math.abs(parsed).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })

  return parsed >= 0 ? `+${formatted}` : `-${formatted}`
}

const getParseStatusLabel = (value: EvaluationParseStatus) => {
  switch (value) {
    case 'success':
      return 'Sucesso'
    case 'partial':
      return 'Parcial'
    case 'failed':
      return 'Falhou'
    default:
      return value
  }
}



// ==========================================
// TEST PROFILES (FOR DEMO)
// ==========================================
const TEST_PROFILES = {
  enzo: {
    patientNameRaw: 'Enzo Gabriel (Criança Ativa)',
    ageYears: '8',
    estiloVidaUsoComputadorHoras: '0',
    estiloVidaDirigirHoras: '0',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '4',
    estiloVidaAmbienteInternoHoras: '4',
    estiloVidaAmbienteExternoHoras: '4',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'baixa',
    historicoTrocasRecentes: 'nenhuma',
    prioridadePrincipal: 'resistencia',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'trocar_marca',
    faixaOrcamento: '800_2000',
    budgetTarget: '1200',
    importanciaEstetica: 'baixa',
    importanciaResistencia: 'alta',
    prefereTransitions: 'sim',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'sim',
    queixaCriancaAtiva: 'sim',
    queixaProgressaoRapida: 'sim',
    observacoesConsultor: 'Criança muito ativa, quebra óculos na escola. Pais preocupados com aumento rápido do grau.',
    receitaLongeOdEsferico: '-4,50',
    receitaLongeOdCilindrico: '-1,50',
    receitaLongeOdEixo: '180',
    receitaLongeOeEsferico: '-4,25',
    receitaLongeOeCilindrico: '-1,25',
    receitaLongeOeEixo: '170',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '27',
    medidaDnpOe: '27',
    medidaAlturaOd: '16',
    medidaAlturaOe: '16'
  },
  maria: {
    patientNameRaw: 'Dona Maria (Adaptação Difícil)',
    ageYears: '62',
    estiloVidaUsoComputadorHoras: '1',
    estiloVidaDirigirHoras: '0',
    estiloVidaLeituraHoras: '4',
    estiloVidaUsoCelularHoras: '3',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '10',
    estiloVidaAmbienteExternoHoras: '2',
    estiloVidaAssistirTvHoras: '5',
    marcaAtual: 'Marca Genérica',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'alta',
    historicoTrocasRecentes: 'uma',
    prioridadePrincipal: 'adaptacao',
    principalIncomodoAtual: 'adaptacao',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: 'acima_5000',
    budgetTarget: '5500',
    importanciaEstetica: 'media',
    importanciaResistencia: 'media',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Já tentou usar multifocal 2 vezes sem sucesso. Sente tontura e campo lateral muito estreito.',
    receitaLongeOdEsferico: '+1,50',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+1,75',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '85',
    receitaAdicao: '2,50',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '30',
    medidaDnpOe: '30',
    medidaAlturaOd: '21',
    medidaAlturaOe: '21'
  },
  roberto: {
    patientNameRaw: 'Sr. Roberto (Presbita Iniciante)',
    ageYears: '42',
    estiloVidaUsoComputadorHoras: '8',
    estiloVidaDirigirHoras: '2',
    estiloVidaLeituraHoras: '2',
    estiloVidaUsoCelularHoras: '6',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '12',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'nao_informado',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nenhuma',
    prioridadePrincipal: 'equilibrio',
    principalIncomodoAtual: 'perto',
    objetivoCompra: 'primeira_multifocal',
    faixaOrcamento: '2000_5000',
    budgetTarget: '3500',
    importanciaEstetica: 'alta',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Empresário. Grande demanda digital. Começou a afastar objetos para ler recentemente.',
    receitaLongeOdEsferico: '0,00',
    receitaLongeOdCilindrico: '',
    receitaLongeOdEixo: '',
    receitaLongeOeEsferico: '0,00',
    receitaLongeOeCilindrico: '',
    receitaLongeOeEixo: '',
    receitaAdicao: '1,25',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '33',
    medidaDnpOe: '33',
    medidaAlturaOd: '19',
    medidaAlturaOe: '19'
  }
};

const parseNullableNumber = (value: string | null | undefined) => {
  if (!value?.trim()) return null

  const parsed = Number(value.replace(',', '.').replace('+', '').trim())
  return Number.isNaN(parsed) ? null : parsed
}

const parseNullableInteger = (value: string | null | undefined) => {
  if (!value?.trim()) return null

  const parsed = Number.parseInt(value, 10)
  return Number.isNaN(parsed) ? null : parsed
}

const hasAnyLifestyleData = (form: ReturnType<typeof createEmptyForm>) => [
  form.estiloVidaUsoComputadorHoras,
  form.estiloVidaDirigirHoras,
  form.estiloVidaLeituraHoras,
  form.estiloVidaUsoCelularHoras,
  form.estiloVidaExposicaoSolHoras,
  form.estiloVidaAmbienteInternoHoras,
  form.estiloVidaAmbienteExternoHoras,
  form.estiloVidaAssistirTvHoras
].some((value) => parseNullableInteger(value) !== null)

const hasAnyComplaintData = (form: ReturnType<typeof createEmptyForm>) =>
  !!form.marcaAtual.trim() ||
  form.dificuldadeAdaptacao !== 'nao_informado' ||
  form.queixaDirigirNoite !== 'nao' ||
  form.queixaSensibilidadeLuz !== 'nao' ||
  form.queixaQuebraOculos !== 'nao' ||
  form.queixaCriancaAtiva !== 'nao' ||
  form.queixaProgressaoRapida !== 'nao' ||
  form.prioridadePrincipal !== 'equilibrio'

const hasAnyDegreeData = (form: ReturnType<typeof createEmptyForm>) => [
  form.receitaLongeOdEsferico,
  form.receitaLongeOdCilindrico,
  form.receitaLongeOdEixo,
  form.receitaLongeOeEsferico,
  form.receitaLongeOeCilindrico,
  form.receitaLongeOeEixo,
  form.receitaAdicao
].some((value) => value.trim().length > 0)

const generateManualSuggestion = (form: ReturnType<typeof createEmptyForm>): ManualSuggestion => {
  const age = parseNullableInteger(form.ageYears)
  const addicao = parseNullableNumber(form.receitaAdicao)
  const computador = parseNullableInteger(form.estiloVidaUsoComputadorHoras) || 0
  const celular = parseNullableInteger(form.estiloVidaUsoCelularHoras) || 0
  const leitura = parseNullableInteger(form.estiloVidaLeituraHoras) || 0
  const dirigir = parseNullableInteger(form.estiloVidaDirigirHoras) || 0
  const sol = parseNullableInteger(form.estiloVidaExposicaoSolHoras) || 0
  const ambienteExterno = parseNullableInteger(form.estiloVidaAmbienteExternoHoras) || 0
  const usoPerto = computador + celular + leitura
  const isChild = age !== null && age <= 14
  const precisaResistencia =
    form.queixaCriancaAtiva === 'sim' || form.queixaQuebraOculos === 'sim'
  const progressaoRapida = form.queixaProgressaoRapida === 'sim'
  const dirigeNoite = form.queixaDirigirNoite === 'sim'
  const sensibilidadeLuz = form.queixaSensibilidadeLuz === 'sim'

  let primaryLens = 'Lente visão simples'
  const complementaryOptions: string[] = []
  const reasons: string[] = []

  if (progressaoRapida && isChild) {
    primaryLens = 'Lente de controle de miopia'
    reasons.push('idade infantil com relato de progressão rápida do grau favorece avaliar uma solução específica para controle de miopia')
  } else if ((addicao !== null && addicao >= 0.75) || (age !== null && age >= 45)) {
    primaryLens = 'Lente multifocal / progressiva'
    reasons.push(`idade${age !== null ? ` ${age}` : ''} e adição ${formatDegreeDisplay(form.receitaAdicao) || 'presente'} favorecem correção para longe, perto e intermediário`)

    if (usoPerto >= 10) {
      complementaryOptions.push('campo intermediário ampliado')
      reasons.push(`rotina de perto intensa (${usoPerto}h entre leitura, computador e celular) pede mais conforto no uso diário`)
    }
  } else if ((age !== null && age >= 38) || usoPerto >= 8) {
    primaryLens = 'Lente digital / anti-fadiga'
    reasons.push(`uso de perto elevado (${usoPerto}h) indica necessidade de mais conforto visual em telas e leitura`)
  } else if (usoPerto >= 4) {
    primaryLens = 'Lente visão simples com desenho para rotina digital'
    reasons.push(`há demanda relevante para perto e telas, mesmo sem sinais fortes de presbiopia`)
  } else {
    reasons.push('receita e rotina sugerem uma solução básica, com foco em nitidez e adaptação simples')
  }

  if (dirigir >= 4) {
    complementaryOptions.push('antirreflexo premium')
    reasons.push(`dirigir ${dirigir}h por dia reforça benefício de antirreflexo com melhor contraste e redução de reflexos`)
  }

  if (dirigeNoite) {
    complementaryOptions.push('conforto para direção noturna')
    reasons.push('foi marcada dificuldade para dirigir à noite, o que reforça contraste e redução de reflexos')
  }

  if (sol >= 4 || ambienteExterno >= 4) {
    complementaryOptions.push('fotossensível / proteção UV')
    reasons.push(`exposição externa relevante (${Math.max(sol, ambienteExterno)}h) combina com proteção solar no dia a dia`)
  }

  if (computador + celular >= 6) {
    complementaryOptions.push('conforto digital')
    reasons.push(`uso combinado de computador e celular (${computador + celular}h) pede alívio para rotina de telas`)
  }

  if (sensibilidadeLuz) {
    complementaryOptions.push('controle de claridade')
    reasons.push('foi marcada sensibilidade à luz, favorecendo conforto com claridade e ambientes externos')
  }

  if (precisaResistencia) {
    complementaryOptions.push('material resistente')
    reasons.push('o contexto indica necessidade de uma configuração mais resistente para reduzir risco de quebra')
  }

  const uniqueOptions = [...new Set(complementaryOptions)]
  const summaryParts = [primaryLens]
  if (uniqueOptions.length > 0) {
    summaryParts.push(`Complementos sugeridos: ${uniqueOptions.join(', ')}`)
  }

  return {
    primaryLens,
    complementaryOptions: uniqueOptions,
    reasons,
    summary: summaryParts.join('. ')
  }
}

const buildAiRecommendationLabel = (option: RecommendationOption) => {
  const treatmentPart = option.treatmentName ? ` + ${option.treatmentName}` : ''
  const sourcePart = option.sourceLaboratorio ? ` · ${option.sourceLaboratorio}` : ''
  return `${option.familyName} | ${option.offerLabel}${treatmentPart}${sourcePart}`
}

const getClinicalCategoryLabel = (category: RecommendationOption['clinicalCategory']) => {
  switch (category) {
    case 'controle_miopia':
      return 'controle de miopia'
    case 'multifocal':
      return 'multifocal'
    case 'ocupacional':
      return 'ocupacional'
    case 'bifocal':
      return 'bifocal'
    case 'plana_solar':
      return 'solar'
    case 'visao_simples':
      return 'visão simples'
    default:
      return 'categoria compatível'
  }
}

const buildAiOptionNarrative = (
  option: RecommendationOption,
  index: number,
  referenceOption?: RecommendationOption | null
) => {
  const reasons = getUniqueHumanizedReasons(option.reasons, 3)
  const mainReasons = reasons.slice(0, 2)
  const priceFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  const categoryLabel = getClinicalCategoryLabel(option.clinicalCategory)
  const supportText = option.treatmentExplainWhy || option.commercialSummary || option.recommendationNotes || ''
  const rawReasons = option.reasons || []
  const hasResistance = rawReasons.includes('material:resistente') || rawReasons.includes('beneficio:resistencia')
  const hasThinness = rawReasons.includes('material:lente_fina') || rawReasons.includes('beneficio:lente_fina')
  const hasBlueUv = rawReasons.includes('feature:blue_uv') || rawReasons.includes('tratamento:conforto_telas')
  const hasTransitions = rawReasons.includes('feature:transitions') || rawReasons.includes('tratamento:outdoor')
  const hasAntirreflexo = rawReasons.includes('tratamento:antirreflexo')

  if (index === 0) {
    const intro = mainReasons.length
      ? `Escolhi esta como a melhor opção porque ela atende mais diretamente ao caso em ${mainReasons.join(' e ').toLowerCase()}.`
      : `Escolhi esta como a melhor opção porque ela ficou mais coerente com a necessidade principal do caso.`

    return [intro, supportText].filter(Boolean).join(' ')
  }

  if (index === 1) {
    const intro = mainReasons.length
      ? `Esta continua muito forte para o caso, principalmente por ${mainReasons.join(' e ').toLowerCase()}.`
      : `Esta continua muito coerente com a necessidade principal e funciona como segunda opção segura.`

    const priceHint =
      referenceOption && option.finalPrice !== referenceOption.finalPrice
        ? option.finalPrice > referenceOption.finalPrice
          ? `Ela sobe um pouco o investimento para buscar outra configuração dentro da mesma direção clínica.`
          : `Ela reduz um pouco o investimento sem sair da mesma direção clínica.`
        : ''

    return [intro, priceHint, supportText].filter(Boolean).join(' ')
  }

  const topCategory = referenceOption ? getClinicalCategoryLabel(referenceOption.clinicalCategory) : null
  const categoryShift =
    referenceOption && option.clinicalCategory !== referenceOption.clinicalCategory
      ? `Ela não cobre de forma tão direta a necessidade principal de ${topCategory}, mas entra como alternativa plausível se a conversa pender para ${categoryLabel}.`
      : `Ela abre uma alternativa comercial sem fugir totalmente do raciocínio principal do caso.`

  let priceTradeoff = ''
  if (referenceOption) {
    if (option.finalPrice < referenceOption.finalPrice) {
      priceTradeoff = `Aqui existe uma troca em favor de preço, ficando em ${priceFormatter.format(option.finalPrice)}.`
    } else if (option.finalPrice > referenceOption.finalPrice) {
      priceTradeoff = `Aqui existe uma troca em favor de outra proposta de valor, subindo para ${priceFormatter.format(option.finalPrice)}.`
    }
  }

  const whyWorthItParts: string[] = []
  if (hasResistance) whyWorthItParts.push('maior resistência')
  if (hasThinness) whyWorthItParts.push('lente mais fina/estética')
  if (hasTransitions) whyWorthItParts.push('fotossensível para conforto no sol')
  if (hasBlueUv) whyWorthItParts.push('proteção de luz azul')
  if (hasAntirreflexo) whyWorthItParts.push('antirreflexo de melhor qualidade')
  const whyWorthIt = whyWorthItParts.length
    ? `Ela vale o investimento adicional por ${whyWorthItParts.join(', ')}.`
    : ''

  const reasonWrap = mainReasons.length
    ? `Eu a mantive porque ainda entrega ${mainReasons.join(' e ').toLowerCase()}.`
    : ''

  return [categoryShift, priceTradeoff, whyWorthIt, reasonWrap, supportText].filter(Boolean).join(' ')
}

const buildAiCommercialSummary = (option: RecommendationOption) => {
  const explanation = option.treatmentExplainWhy || option.commercialSummary || option.recommendationNotes || ''
  const reasons = option.reasons.slice(0, 3).map(humanizeRecommendationReason).join(', ')
  return [
    `${buildAiRecommendationLabel(option)} — ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.finalPrice)}`,
    explanation,
    reasons ? `Motivos considerados: ${reasons}.` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

const getTopAlternativeOption = (recommendations: RecommendationOption[]) =>
  recommendations[1] || recommendations[2] || recommendations[0] || null

const buildQuickRetentionReply = (params: {
  intent: QuickRetentionIntent
  recommendations: RecommendationOption[]
  activeCatalog: ActiveCatalogContext
  activeCatalogs?: ActiveCatalogSummary[]
}) => {
  const { intent, recommendations, activeCatalog, activeCatalogs } = params
  const topOption = recommendations[0] || null
  const alternativeOption = getTopAlternativeOption(recommendations)
  const priceFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

  const topLabel = topOption ? buildAiRecommendationLabel(topOption) : 'a configuração principal'
  const topPrice = topOption ? priceFormatter.format(topOption.finalPrice) : null
  const altIsDifferent = alternativeOption && alternativeOption.configKey !== topOption?.configKey
  const altLabel = altIsDifferent ? buildAiRecommendationLabel(alternativeOption) : null
  const altPrice = altIsDifferent ? priceFormatter.format(alternativeOption!.finalPrice) : null
  const labName =
    activeCatalog?.laboratorio ||
    (activeCatalogs && activeCatalogs.length
      ? activeCatalogs.map((catalog) => catalog.laboratorio).join(' + ')
      : 'os catálogos ativos da loja')

  if (intent === 'pesquisar') {
    return `Sem problema. Antes de sair para pesquisar, vale te mostrar por que eu separei ${topLabel}${topPrice ? ` por ${topPrice}` : ''}: ela conversa diretamente com o que você me contou e já está dentro do que temos hoje em ${labName}. Se quiser, eu também posso te mostrar agora uma segunda comparação lado a lado${altLabel ? `, incluindo ${altLabel}${altPrice ? ` por ${altPrice}` : ''}` : ''}, para você decidir com mais segurança sem precisar ir embora na dúvida.`
  }

  if (intent === 'pensar') {
    return `Claro, você pode pensar com calma. Antes disso, deixa eu te resumir em uma frase: a opção que fez mais sentido para o seu caso foi ${topLabel}${topPrice ? ` por ${topPrice}` : ''} porque ela resolve melhor a necessidade principal sem eu te empurrar algo aleatório. Se preferir, eu também posso te deixar uma alternativa mais equilibrada${altLabel ? `, como ${altLabel}${altPrice ? ` por ${altPrice}` : ''}` : ''}, para você comparar com tranquilidade.`
  }

  if (intent === 'armacoes') {
    return `Sem problema com a armação, isso a gente consegue contornar aqui na loja. O importante é que a lente indicada para o seu caso continua sendo ${topLabel}${topPrice ? ` por ${topPrice}` : ''}; a armação eu posso trocar por outro estilo sem perder essa base técnica. Se quiser, eu já separo outras opções de armação com perfil diferente e mantenho a lente que realmente faz sentido para você.`
  }

  return `Entendo. Se você encontrou preço melhor na concorrência, vale comparar não só o valor, mas o que está entrando na configuração. Eu cheguei em ${topLabel}${topPrice ? ` por ${topPrice}` : ''} porque ela conversa melhor com o seu caso dentro do que temos hoje em ${labName}. Se a questão for orçamento, eu consigo te mostrar uma alternativa mais defensável sem desmontar a recomendação${altLabel ? `, como ${altLabel}${altPrice ? ` por ${altPrice}` : ''}` : ''}, para você comparar preço com mais justiça.`
}

const buildAiOptionDetails = (option: RecommendationOption) => {
  const supportText = option.treatmentExplainWhy || option.commercialSummary || option.recommendationNotes || ''
  const reasons = getUniqueHumanizedReasons(option.reasons, 4)

  return [
    supportText ? `Contexto da configuração:\n${supportText}` : '',
    reasons.length ? `Critérios considerados:\n${reasons.map((reason) => `• ${reason}`).join('\n')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

function AiOptionInfoButton({ option }: { option: RecommendationOption }) {
  const details = buildAiOptionDetails(option)
  if (!details) return null

  return (
    <div className="group relative">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-black/20 text-slate-300 transition-colors hover:border-cyan-400/40 hover:bg-cyan-500/10 hover:text-cyan-100"
        aria-label="Ver detalhes da recomendação"
      >
        <CircleHelp className="h-4 w-4" />
      </button>
      <div className="pointer-events-none absolute right-0 top-11 z-20 hidden w-80 rounded-2xl border border-cyan-500/20 bg-slate-950/95 p-4 text-sm leading-6 text-slate-200 shadow-2xl shadow-black/40 group-hover:block">
        <p className="whitespace-pre-line">{details}</p>
      </div>
    </div>
  )
}

const normalizeCompareText = (value: string | null | undefined) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const humanizeRecommendationReason = (reason: string) => {
  const [type, rawValue = ''] = reason.split(':')
  const value = rawValue.replace(/_/g, ' ')

  const labelsByValue: Record<string, string> = {
    multifocal: 'Categoria clínica multifocal',
    bifocal: 'Categoria clínica bifocal',
    visao_simples: 'Categoria clínica visão simples',
    ocupacional: 'Categoria clínica ocupacional',
    controle_miopia: 'Categoria clínica de controle de miopia',
    plana_solar: 'Categoria clínica solar',
    dirigir: 'Rotina com bastante tempo ao volante',
    dirigir_noite: 'Queixa de direção noturna',
    computador: 'Rotina intensa de computador',
    celular: 'Uso frequente de celular',
    sol: 'Exposição solar relevante',
    crianca_ativa: 'Criança muito ativa',
    risco_quebra: 'Risco frequente de quebra',
    adaptacao_rapida: 'Busca adaptação mais fácil',
    conforto_visual: 'Busca mais conforto visual',
    conforto_luz: 'Busca mais conforto com claridade',
    resistencia: 'Busca material mais resistente',
    indice_alto_pouco_ganho: 'Índice alto com ganho mínimo para este grau',
    indice_baixo_grau_alto: 'Índice baixo para um grau que pede lente mais fina',
    custo_beneficio: 'Busca melhor custo-benefício',
    transitions: 'Preferência por Transitions',
    blue_uv: 'Preferência por proteção Blue UV',
    resistente: 'Configuração com material mais resistente',
  }

  if (reason === 'categoria:mista_sem_oferta_definida') {
    return 'Família mista com oferta específica compatível'
  }

  if (reason === 'oferta_atomica') return 'Oferta pronta'
  if (reason === 'inclui_tratamento') return 'Configuração já inclui tratamento'
  if (reason === 'tratamento:antirreflexo') return 'Tratamento antirreflexo'
  if (reason === 'tratamento:conforto_telas') return 'Tratamento favorável para telas'
  if (reason === 'tratamento:dirigir_noite') return 'Tratamento favorável para direção noturna'
  if (reason === 'tratamento:outdoor') return 'Tratamento favorável para uso externo'
  if (reason === 'opcao:alternativa_plausivel') return 'Alternativa plausível para ampliar a conversa'
  if (reason === 'opcao:salto_preco_controlado') return 'Alternativa com salto de preço controlado'
  if (reason === 'material:indice_alto_pouco_ganho') return 'Índice alto com ganho pequeno neste grau'
  if (reason === 'material:indice_baixo_grau_alto') return 'Índice baixo para grau alto'

  if (type === 'categoria' && rawValue === 'controle_miopia') {
    return 'Categoria clínica de controle de miopia'
  }
  if ((type === 'beneficio' || type === 'uso') && rawValue === 'controle_miopia') {
    return 'Sinal de progressão rápida do grau'
  }

  if (type === 'orcamento') {
    return `Faixa de orçamento ${value}`
  }

  if (type === 'alvo_preco') {
    return `Preço próximo do alvo informado`
  }

  if (type === 'tratamento_orcamento') {
    return `Tratamento com nível de preço ${value}`
  }

  if (type === 'tratamento_uso') {
    return `Tratamento alinhado ao uso: ${labelsByValue[rawValue] || value}`
  }

  if (type === 'tratamento_beneficio') {
    return `Tratamento alinhado ao benefício: ${labelsByValue[rawValue] || value}`
  }

  if (type === 'categoria' || type === 'uso' || type === 'beneficio' || type === 'feature' || type === 'material') {
    return labelsByValue[rawValue] || `${type}: ${value}`
  }

  return reason.replace(/_/g, ' ')
}

const getUniqueHumanizedReasons = (reasons: string[], limit = 3) =>
  Array.from(new Set(reasons.map(humanizeRecommendationReason).filter(Boolean))).slice(0, limit)

const detectAgreementLevel = (
  ivisionLabel: string,
  aiOption: RecommendationOption | null
): 'forte' | 'parcial' | 'divergente' => {
  if (!ivisionLabel || !aiOption) return 'divergente'

  const ivision = normalizeCompareText(ivisionLabel)
  const family = normalizeCompareText(aiOption.familyName)
  const offer = normalizeCompareText(aiOption.offerLabel)

  if (
    (family && ivision.includes(family)) ||
    (offer && ivision.includes(offer)) ||
    (family && family.includes(ivision)) ||
    (offer && offer.includes(ivision))
  ) {
    return 'forte'
  }

  if (
    (aiOption.clinicalCategory === 'multifocal' && /\b(varilux|progressiv|multifocal)\b/.test(ivision)) ||
    (aiOption.clinicalCategory === 'visao_simples' && /\b(eyezen|visao simples|single)\b/.test(ivision)) ||
    (aiOption.clinicalCategory === 'ocupacional' && /\b(ocupacional|office|digitime|softwear)\b/.test(ivision))
  ) {
    return 'parcial'
  }

  return 'divergente'
}

const buildComparisonText = (
  ivisionLabel: string,
  aiOption: RecommendationOption | null
) => {
  if (!ivisionLabel || !aiOption) return ''

  const level = detectAgreementLevel(ivisionLabel, aiOption)
  const humanReasons = aiOption.reasons
    .filter((reason) => !reason.startsWith('orcamento:'))
    .slice(0, 3)
    .map(humanizeRecommendationReason)
    .join(', ')

  if (level === 'forte') {
    return 'A IA chegou a uma direção muito parecida com a sugestão do iVision. A diferença está mais na configuração comercial, no tratamento ou no preço final do que no desenho principal da lente.'
  }

  if (level === 'parcial') {
    return `A IA manteve a mesma direção clínica geral do iVision, mas ajustou a configuração para refletir melhor o caso atual em preço final, tratamento e conforto de uso. ${humanReasons ? `Ela priorizou especialmente: ${humanReasons}.` : ''}`.trim()
  }

  return `A IA considerou sinais adicionais do caso, como rotina, adaptação, faixa de preço e features desejadas, e por isso priorizou uma combinação diferente da sugerida pelo iVision. ${humanReasons ? `Os critérios mais fortes foram: ${humanReasons}.` : ''}`.trim()
}

const inferRecommendationCaseInput = (form: ReturnType<typeof createEmptyForm>) => {
  const longeOdEsferico = parseNullableNumber(form.receitaLongeOdEsferico)
  const longeOdCilindrico = parseNullableNumber(form.receitaLongeOdCilindrico)
  const longeOeEsferico = parseNullableNumber(form.receitaLongeOeEsferico)
  const longeOeCilindrico = parseNullableNumber(form.receitaLongeOeCilindrico)

  const odStrength = Math.abs(longeOdEsferico || 0) + Math.abs(longeOdCilindrico || 0)
  const oeStrength = Math.abs(longeOeEsferico || 0) + Math.abs(longeOeCilindrico || 0)
  const useOd = odStrength >= oeStrength

  const rotinaTags: string[] = []
  const desiredBenefits: string[] = []
  const preferredFeatures: string[] = []
  const objetivoTags: string[] = []

  const computador = parseNullableInteger(form.estiloVidaUsoComputadorHoras) || 0
  const celular = parseNullableInteger(form.estiloVidaUsoCelularHoras) || 0
  const dirigir = parseNullableInteger(form.estiloVidaDirigirHoras) || 0
  const sol = parseNullableInteger(form.estiloVidaExposicaoSolHoras) || 0
  const externo = parseNullableInteger(form.estiloVidaAmbienteExternoHoras) || 0

  if (computador >= 3) rotinaTags.push('computador')
  if (celular >= 2) rotinaTags.push('celular')
  if (dirigir >= 2) rotinaTags.push('dirigir')
  if (sol >= 2 || externo >= 2) rotinaTags.push('sol')

  const age = parseNullableInteger(form.ageYears)

  if (parseNullableNumber(form.receitaAdicao) !== null || (age !== null && age >= 45)) {
    desiredBenefits.push('adaptacao_rapida', 'conforto_visual')
    objetivoTags.push('presbiopia')
  }

  if (form.dificuldadeAdaptacao === 'alta') {
    desiredBenefits.push('adaptacao_rapida')
  }

  if (form.queixaDirigirNoite === 'sim') {
    rotinaTags.push('dirigir_noite')
  }

  if (form.queixaSensibilidadeLuz === 'sim') {
    desiredBenefits.push('conforto_luz')
    preferredFeatures.push('transitions')
  }

  if (form.prefereTransitions === 'sim') {
    preferredFeatures.push('transitions')
    desiredBenefits.push('conforto_luz')
  }

  if (form.prefereBlueUv === 'sim') {
    preferredFeatures.push('blue_uv')
    desiredBenefits.push('conforto_digital')
  }

  const isChild = age !== null && age <= 14
  if (isChild) {
    rotinaTags.push('crianca')
  }

  if (form.queixaCriancaAtiva === 'sim') {
    rotinaTags.push('crianca_ativa')
    desiredBenefits.push('resistencia')
  }

  if (form.queixaQuebraOculos === 'sim') {
    rotinaTags.push('risco_quebra')
    desiredBenefits.push('resistencia')
  }

  if (form.queixaProgressaoRapida === 'sim') {
    rotinaTags.push('controle_miopia')
    desiredBenefits.push('controle_miopia')
    objetivoTags.push('controle_miopia')
  }

  if (parseNullableNumber(form.receitaAdicao) !== null && form.usaMultifocalHoje === 'nao') {
    objetivoTags.push('primeira_multifocal')
  }

  let budgetMode: 'economico' | 'intermediario' | 'premium' = 'intermediario'

  if (form.faixaOrcamento === 'ate_800' || form.faixaOrcamento === '800_2000') {
    budgetMode = 'economico'
  }
  if (form.faixaOrcamento === 'acima_5000') {
    budgetMode = 'premium'
  }

  const targetBudget = parseNullableNumber(form.budgetTarget)
  if (targetBudget !== null) {
    if (targetBudget <= 1500) budgetMode = 'economico'
    if (targetBudget >= 5000) budgetMode = 'premium'
  }

  if (form.aceitaPremium === 'nao' && budgetMode === 'premium') {
    budgetMode = 'intermediario'
  }

  if (form.prioridadePrincipal === 'economia') {
    budgetMode = 'economico'
    objetivoTags.push('custo_beneficio')
  }
  if (form.prioridadePrincipal === 'premium') {
    budgetMode = 'premium'
  }
  if (form.prioridadePrincipal === 'adaptacao') {
    desiredBenefits.push('adaptacao_rapida')
  }
  if (form.prioridadePrincipal === 'resistencia') {
    desiredBenefits.push('resistencia')
  }
  if (form.prioridadePrincipal === 'controle_miopia') {
    rotinaTags.push('controle_miopia')
    desiredBenefits.push('controle_miopia')
    objetivoTags.push('controle_miopia')
  }

  if (form.importanciaResistencia === 'alta') {
    desiredBenefits.push('resistencia')
  }

  if (form.importanciaEstetica === 'alta') {
    desiredBenefits.push('estetica', 'lente_fina')
  }

  if (form.principalIncomodoAtual === 'peso_espessura') {
    desiredBenefits.push('lente_fina', 'estetica')
  }

  if (form.principalIncomodoAtual === 'reflexo') {
    desiredBenefits.push('antirreflexo', 'conforto_visual')
  }

  const budgetExplicit = targetBudget !== null || form.faixaOrcamento !== 'nao_informado'

  return {
    idade: age,
    marca_atual: form.marcaAtual.trim() || null,
    esferico: useOd ? longeOdEsferico : longeOeEsferico,
    cilindrico: useOd ? longeOdCilindrico : longeOeCilindrico,
    adicao: parseNullableNumber(form.receitaAdicao),
    rotina_tags: Array.from(new Set(rotinaTags)),
    objetivo_tags: Array.from(new Set(objetivoTags)),
    desired_benefits: Array.from(new Set(desiredBenefits)),
    preferred_features: Array.from(new Set(preferredFeatures)),
    budget_mode: budgetMode,
    budget_signal: budgetExplicit ? 'informado' : 'nao_informado',
    targetPrice: targetBudget && targetBudget > 0 ? targetBudget : null,
    adaptation_difficulty:
      form.dificuldadeAdaptacao === 'nao_informado'
        ? null
        : form.dificuldadeAdaptacao,
    notes: form.sourceExamType || null
  }
}

function DegreeInput({
  value,
  onChange,
  className,
  placeholder
}: {
  value: string
  onChange: (value: string) => void
  className?: string
  placeholder?: string
}) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/\D/g, '')
    if (!raw) {
      onChange('')
      return
    }

    const val = parseInt(raw, 10) / 100
    const isNegative = value.includes('-')
    const formatted = val.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
    onChange(isNegative ? `-${formatted}` : `+${formatted}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === '-') {
      e.preventDefault()
      if (!value.includes('-')) {
        onChange(value.replace('+', '').replace('-', '') ? `-${value.replace('+', '')}` : '-')
      }
    }

    if (e.key === '+') {
      e.preventDefault()
      if (value.includes('-')) onChange(value.replace('-', '+'))
      else if (!value.includes('+')) onChange(`+${value}`)
    }
  }

  const isNegative = value.includes('-')
  const isPositive = value.includes('+')
  const textColor = isNegative ? 'text-rose-300' : isPositive ? 'text-emerald-300' : 'text-slate-100'

  return (
    <input
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      className={`${className || ''} ${textColor}`}
      placeholder={placeholder || '+0,00'}
      autoComplete="off"
    />
  )
}

const createEmptyForm = () => ({
  sourceUrl: '',
  sourceSystem: 'manual' as EvaluationSourceSystem,
  status: 'concluida' as EvaluationStatus,
  parseStatus: 'success' as EvaluationParseStatus,
  sourceDocumentHost: '',
  sourceOsNumber: '',
  sourceExamType: '',
  sourceExamDatetime: '',
  patientNameRaw: '',
  ageYears: '',
  estiloVidaUsoComputadorHoras: '',
  estiloVidaDirigirHoras: '',
  estiloVidaLeituraHoras: '',
  estiloVidaUsoCelularHoras: '',
  estiloVidaExposicaoSolHoras: '',
  estiloVidaAmbienteInternoHoras: '',
  estiloVidaAmbienteExternoHoras: '',
  estiloVidaAssistirTvHoras: '',
  marcaAtual: '',
  dificuldadeAdaptacao: 'nao_informado',
  queixaDirigirNoite: 'nao',
  queixaSensibilidadeLuz: 'nao',
  queixaQuebraOculos: 'nao',
  queixaCriancaAtiva: 'nao',
  queixaProgressaoRapida: 'nao',
  prioridadePrincipal: 'equilibrio',
  tipoLenteAtual: 'nao_informado',
  usaMultifocalHoje: 'nao_informado',
  principalIncomodoAtual: 'nao_informado',
  objetivoCompra: 'nao_informado',
  faixaOrcamento: 'nao_informado',
  budgetTarget: '',
  importanciaEstetica: 'nao_informado',
  importanciaResistencia: 'nao_informado',
  prefereTransitions: 'nao_informado',
  prefereBlueUv: 'nao_informado',
  aceitaPremium: 'nao_informado',
  historicoTrocasRecentes: 'nao_informado',
  observacoesConsultor: '',
  receitaLongeOdEsferico: '',
  receitaLongeOdCilindrico: '',
  receitaLongeOdEixo: '',
  receitaLongeOeEsferico: '',
  receitaLongeOeCilindrico: '',
  receitaLongeOeEixo: '',
  receitaPertoOdEsferico: '',
  receitaPertoOdCilindrico: '',
  receitaPertoOdEixo: '',
  receitaPertoOeEsferico: '',
  receitaPertoOeCilindrico: '',
  receitaPertoOeEixo: '',
  receitaAdicao: '',
  medidaDnpOd: '',
  medidaDnpOe: '',
  medidaAlturaOd: '',
  medidaAlturaOe: '',
  recommendedLensName: '',
  commercialRecommendationRaw: '',
  extractedText: '',
  parseWarning: '',
  documentHash: '',
  rawPayloadJson: {} as Record<string, unknown>
})

export default function EvaluationInterface({
  activeCatalog,
  activeCatalogs = []
}: {
  activeCatalog: ActiveCatalogContext
  activeCatalogs?: ActiveCatalogSummary[]
}) {
  const params = useParams()
  const router = useRouter()
  const storeId = parseInt(params.storeId as string, 10)
  const { preference } = useBackgroundPreference()

  const [query, setQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([])
  const [recentEvaluations, setRecentEvaluations] = useState<OpticalEvaluationListItem[]>([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [selectedSubjectType, setSelectedSubjectType] = useState<SubjectType | null>(null)
  const [selectedDependenteId, setSelectedDependenteId] = useState<string>('')
  const [history, setHistory] = useState<OpticalEvaluationListItem[]>([])
  const [form, setForm] = useState(createEmptyForm())
  const [evaluationId, setEvaluationId] = useState<number | null>(null)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [searchError, setSearchError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false)
  const [isDependenteModalOpen, setIsDependenteModalOpen] = useState(false)
  
  const hasAuthenticatedRef = React.useRef(false)
  const [authenticatedEmployee, setAuthenticatedEmployee] = useState<{ id: number; full_name: string; role: string } | null>(null)

  const [isSearching, startSearchTransition] = useTransition()
  const [isImporting, startImportTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [isCreatingVenda, startCreateVendaTransition] = useTransition()
  const [isLoadingHistory, startHistoryTransition] = useTransition()
  const [isGeneratingAi, startAiGenerationTransition] = useTransition()
  const [isContinuingAi, startAiConversationTransition] = useTransition()
  const [manualSuggestion, setManualSuggestion] = useState<ManualSuggestion | null>(null)
  const [aiState, setAiState] = useState<RecommendationConversationState | null>(null)
  const [aiRecommendations, setAiRecommendations] = useState<RecommendationOption[]>([])
  const [aiFeedback, setAiFeedback] = useState<string | null>(null)
  const [aiConversationInput, setAiConversationInput] = useState('')
  const [quickRetentionReply, setQuickRetentionReply] = useState<string | null>(null)
  const [ivisionReferenceSuggestion, setIvisionReferenceSuggestion] = useState<string | null>(null)
  const [ivisionReferenceSummary, setIvisionReferenceSummary] = useState<string | null>(null)

  const selectedDependente = useMemo(
    () => dependentes.find((dep) => dep.id === Number(selectedDependenteId)) || null,
    [dependentes, selectedDependenteId]
  )

  useEffect(() => {
    if (query.trim().length < 2 || selectedCustomer) {
      return
    }

    const timer = setTimeout(() => {
      startSearchTransition(async () => {
        const result = await searchCustomersByName(query, storeId)
        if (result.success && result.data) {
          setCustomerResults(result.data)
          setSearchError(null)
        } else {
          setCustomerResults([])
          setSearchError(result.message || 'Erro ao buscar clientes.')
        }
      })
    }, 400)

    return () => clearTimeout(timer)
  }, [query, selectedCustomer, storeId])

  useEffect(() => {
    if (!selectedCustomer) return

    getDependentes(selectedCustomer.id).then((data) => setDependentes(data))
  }, [selectedCustomer])

  useEffect(() => {
    if (!selectedCustomer) return
    if (!selectedSubjectType) return
    if (selectedSubjectType === 'dependente' && !selectedDependenteId) return

    startHistoryTransition(async () => {
      const evaluations = await getOpticalEvaluationsForSubject({
        storeId,
        customerId: selectedSubjectType === 'customer' ? selectedCustomer.id : null,
        dependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null
      })
      setHistory(evaluations)
    })
  }, [selectedCustomer, selectedSubjectType, selectedDependenteId, storeId])

  
  useEffect(() => { // Load Dashboard
    if (authenticatedEmployee && !selectedCustomer && query.length === 0) {
      setIsLoadingDashboard(true)
      getRecentEvaluationsForEmployee(authenticatedEmployee.id, storeId).then(list => {
        setRecentEvaluations(list)
        setIsLoadingDashboard(false)
      })
    }
  }, [authenticatedEmployee, selectedCustomer, query.length, storeId])

  const clearSubject = () => {
    setSelectedCustomer(null)
    setDependentes([])
    setSelectedDependenteId('')
    setSelectedSubjectType(null)
    setQuery('')
    setCustomerResults([])
    setHistory([])
    setForm(createEmptyForm())
    setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
    setAiState(null)
    setAiRecommendations([])
    setAiFeedback(null)
    setAiConversationInput('')
    setIvisionReferenceSuggestion(null)
    setIvisionReferenceSummary(null)
    setFormError(null)
    setFeedback(null)
  }

  
  const handleSelectEvaluation = (ev: OpticalEvaluationListItem) => {
    // Restaurar estado da avaliação
    setEvaluationId(ev.id)
    setSyncStatus('saved')
    
    // Configurar sujeito
    if (ev.evaluated_dependente_id) {
      setSelectedSubjectType('dependente')
      setSelectedDependenteId(String(ev.evaluated_dependente_id))
    } else if (ev.evaluated_customer_id) {
      setSelectedSubjectType('customer')
    }
    
    // Fake customer search to simulate they are selected
    if (ev.evaluated_patient_name) {
       setQuery(ev.evaluated_patient_name)
       setSelectedCustomer({
           id: ev.responsible_customer_id || ev.evaluated_customer_id || 0,
           full_name: ev.responsible_customer_name || ev.evaluated_patient_name,
           cpf: '', fone_movel: '', tem_pendencia: false, obs_debito: ''
       })
    }
    
    // Restaurar forms
    setForm({
      ...createEmptyForm(),
      sourceSystem: ev.source_system,
      status: ev.status,
      sourceUrl: ev.source_document_url || '',
      sourceDocumentHost: ev.source_document_host || '',
      sourceOsNumber: ev.source_os_number || '',
      sourceExamType: ev.source_exam_type || '',
      sourceExamDatetime: ev.source_exam_datetime ? ev.source_exam_datetime.slice(0, 16) : '',
      patientNameRaw: ev.patient_name_raw || '',
      ageYears: ev.age_years ? String(ev.age_years) : '',
      receitaLongeOdEsferico: ev.receita_longe_od_esferico || '',
      receitaLongeOdCilindrico: ev.receita_longe_od_cilindrico || '',
      receitaLongeOdEixo: ev.receita_longe_od_eixo || '',
      receitaLongeOeEsferico: ev.receita_longe_oe_esferico || '',
      receitaLongeOeCilindrico: ev.receita_longe_oe_cilindrico || '',
      receitaLongeOeEixo: ev.receita_longe_oe_eixo || '',
      receitaPertoOdEsferico: ev.receita_perto_od_esferico || '',
      receitaPertoOdCilindrico: ev.receita_perto_od_cilindrico || '',
      receitaPertoOdEixo: ev.receita_perto_od_eixo || '',
      receitaPertoOeEsferico: ev.receita_perto_oe_esferico || '',
      receitaPertoOeCilindrico: ev.receita_perto_oe_cilindrico || '',
      receitaPertoOeEixo: ev.receita_perto_oe_eixo || '',
      receitaAdicao: ev.receita_adicao || '',
      medidaDnpOd: ev.medida_dnp_od || '',
      medidaDnpOe: ev.medida_dnp_oe || '',
      medidaAlturaOd: ev.medida_altura_od || '',
      medidaAlturaOe: ev.medida_altura_oe || '',
      recommendedLensName: ev.recommended_lens_name || '',
      commercialRecommendationRaw: ev.commercial_recommendation_raw || '',
      rawPayloadJson: (ev.raw_payload_json as Record<string, unknown>) || {}
    })
  }

  const handleCloseEvaluation = async (evaluationId: number) => {
    if (!storeId) return
    await updateEvaluationOutcomeStatus(evaluationId, storeId, 'cliente_pesquisa')
    // Recarrega o mural removendo o card encerrado
    setRecentEvaluations((prev) => prev.filter((ev) => ev.id !== evaluationId))
  }

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer)
    setQuery(customer.full_name)
    setCustomerResults([])
    setSelectedDependenteId('')
    setSelectedSubjectType(null)
    setHistory([])
    setForm(createEmptyForm())
    setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
    setAiState(null)
    setAiRecommendations([])
    setAiFeedback(null)
    setAiConversationInput('')
    setIvisionReferenceSuggestion(null)
    setIvisionReferenceSummary(null)
    setFormError(null)
    setFeedback(null)
  }

  const handleQuickSuccess = (customer: Customer) => {
    handleSelectCustomer({
      id: customer.id,
      full_name: customer.full_name,
      cpf: customer.cpf,
      fone_movel: customer.fone_movel,
      obs_debito: customer.obs_debito,
      tem_pendencia: false
    })
  }

  const handleDependenteAdded = (dependente: Dependente) => {
    setDependentes((prev) => {
      if (prev.some((item) => item.id === dependente.id)) {
        return prev
      }

      return [dependente, ...prev]
    })
    setSelectedSubjectType('dependente')
    setSelectedDependenteId(String(dependente.id))
    setIsDependenteModalOpen(false)
  }

  const handleFormChange = (field: keyof ReturnType<typeof createEmptyForm>, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const generateManualSuggestionResult = (): SuggestionGenerationResult => {
    if (!hasAnyDegreeData(form)) {
      setFormError('Preencha pelo menos os campos principais do grau antes de gerar a sugestão.')
      return { success: false }
    }

    if (!form.ageYears && !hasAnyLifestyleData(form) && !form.receitaAdicao && !hasAnyComplaintData(form)) {
      setFormError('Informe idade, adição, estilo de vida ou alguma queixa do cliente para gerar a sugestão.')
      return { success: false }
    }

    const suggestion = generateManualSuggestion(form)
    return { success: true, suggestion }
  }

  const applyManualSuggestion = (suggestion: ManualSuggestion, feedbackMessage: string) => {
    setManualSuggestion(suggestion)
    setFormError(null)
    setFeedback(feedbackMessage)
    setForm((prev) => ({
      ...prev,
      recommendedLensName: suggestion.primaryLens,
      commercialRecommendationRaw: suggestion.summary
    }))
  }

  const handleGenerateSuggestion = () => {
    const result = generateManualSuggestionResult()
    if (!result.success) return

    applyManualSuggestion(result.suggestion, 'Sugestão comercial gerada com base nas regras da avaliação manual.')
  }

  const fallbackToSystemSuggestion = () => {
    const result = generateManualSuggestionResult()
    if (!result.success) return false

    setQuickRetentionReply(null)

    setAiState(null)
    setAiRecommendations([])
    setAiConversationInput('')
    setAiFeedback('Sugestão comercial gerada com base nos dados da avaliação.')
    applyManualSuggestion(result.suggestion, 'Sugestão comercial gerada com base nos dados da avaliação.')
    return true
  }

  const handleGenerateAiRecommendation = () => {
    if (!activeCatalog) {
      fallbackToSystemSuggestion()
      return
    }

    if (!isSubjectChosen) {
      setFormError('Escolha primeiro o paciente avaliado.')
      return
    }

    if (aiCaseInput.esferico === null || aiCaseInput.cilindrico === null) {
      setFormError('Preencha pelo menos esférico e cilíndrico para a IA recomendar.')
      return
    }

    setFormError(null)
    setAiFeedback(null)
    setQuickRetentionReply(null)
    setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)

    startAiGenerationTransition(async () => {
      const result = await generateLensRecommendationsAction({
        versionId: activeCatalog.versionId,
        versionIds:
          activeCatalogs.length > 0
            ? activeCatalogs.map((catalog) => catalog.versionId)
            : undefined,
        storeId,
        ...aiCaseInput,
        topN: 3
      })

      if (!result.success || !result.data) {
        if (!fallbackToSystemSuggestion()) {
          setAiRecommendations([])
          setAiState(null)
          setAiFeedback(null)
          setFormError(result.message)
        }
        return
      }

      const payload = result.data as LensRecommendationActionPayload
      setAiState(payload.state)
      setAiRecommendations(payload.recommendations)
      setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
      setAiFeedback('Sugestão por IA gerada com base no catálogo ativo da loja.')
    })
  }

  const handleContinueAiConversation = () => {
    if (!aiState || !aiConversationInput.trim()) return

    const currentInput = aiConversationInput.trim()
    setAiConversationInput('')

    startAiConversationTransition(async () => {
      const result = await continueLensRecommendationConversationAction({
        state: aiState,
        userMessage: currentInput,
        topN: 3
      })

      if (!result.success || !result.data) {
        if (!fallbackToSystemSuggestion()) {
          setFormError(result.message)
          setAiConversationInput(currentInput)
        }
        return
      }

      const payload = result.data as {
        nextState: RecommendationConversationState
        recommendations: RecommendationOption[]
      }
      setAiState(payload.nextState)
      setAiRecommendations(payload.recommendations)
      setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
      setAiFeedback(`Sugestão refinada para: "${currentInput}"`)
    })
  }

  const handleQuickRetentionAction = (intent: QuickRetentionIntent) => {
    if (!aiRecommendations.length) return

    setQuickRetentionReply(
      buildQuickRetentionReply({
        intent,
        recommendations: aiRecommendations,
        activeCatalog,
        activeCatalogs,
      })
    )
    setAiFeedback('Resposta rápida gerada para ajudar o consultor a segurar o cliente na loja.')

    if (evaluationId && storeId) {
      updateEvaluationPanicReason(evaluationId, storeId, intent).catch(() => {
        // silencioso — não bloqueia o fluxo do consultor
      })
    }
  }

  const handleApplyAiRecommendation = (option: RecommendationOption) => {
    setForm((prev) => ({
      ...prev,
      recommendedLensName: buildAiRecommendationLabel(option),
      commercialRecommendationRaw: buildAiCommercialSummary(option)
    }))
    setFeedback('Sugestão da IA aplicada aos campos comerciais. Revise antes de salvar.')
    setFormError(null)
  }

  const handleQueryChange = (value: string) => {
    setQuery(value)
    if (value.trim().length < 2) {
      setCustomerResults([])
      setSearchError(null)
    }
  }

  const handleImport = () => {
    if (!selectedCustomer) {
      setFormError('Selecione primeiro o titular ou dependente para importar o exame.')
      return
    }
    if (!isSubjectChosen) {
      setFormError('Escolha primeiro o paciente avaliado antes de importar o exame.')
      return
    }
    if (!form.sourceUrl.trim()) {
      setFormError('Cole primeiro o link do PDF do iVision para iniciar a importação.')
      return
    }

    setFormError(null)
    setFeedback(null)
    startImportTransition(async () => {
      try {
        const response = await fetch('/api/evaluation/import-preview', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            storeId,
            sourceUrl: form.sourceUrl.trim()
          })
        })
        const result = await response.json() as ImportPreviewResponse

        if (!response.ok || !result.success || !result.data) {
          setFormError(result.message || 'Não foi possível importar o PDF do iVision.')
          return
        }
        const preview = result.data

        setForm((prev) => ({
          ...prev,
          sourceUrl: prev.sourceUrl.trim(),
          sourceSystem: 'ivision',
          status: 'importada',
          parseStatus: preview.parse_status,
          sourceDocumentHost: preview.source_document_host || '',
          sourceOsNumber: preview.source_os_number || '',
          sourceExamType: preview.source_exam_type || '',
          sourceExamDatetime: preview.source_exam_datetime
            ? preview.source_exam_datetime.slice(0, 16)
            : '',
          patientNameRaw: preview.patient_name_raw || '',
          ageYears: preview.age_years ? String(preview.age_years) : '',
          estiloVidaUsoComputadorHoras: preview.estilo_vida_uso_computador_horas !== null ? String(preview.estilo_vida_uso_computador_horas) : '',
          estiloVidaDirigirHoras: preview.estilo_vida_dirigir_horas !== null ? String(preview.estilo_vida_dirigir_horas) : '',
          estiloVidaLeituraHoras: preview.estilo_vida_leitura_horas !== null ? String(preview.estilo_vida_leitura_horas) : '',
          estiloVidaUsoCelularHoras: preview.estilo_vida_uso_celular_horas !== null ? String(preview.estilo_vida_uso_celular_horas) : '',
          estiloVidaExposicaoSolHoras: preview.estilo_vida_exposicao_sol_horas !== null ? String(preview.estilo_vida_exposicao_sol_horas) : '',
          estiloVidaAmbienteInternoHoras: preview.estilo_vida_ambiente_interno_horas !== null ? String(preview.estilo_vida_ambiente_interno_horas) : '',
          estiloVidaAmbienteExternoHoras: preview.estilo_vida_ambiente_externo_horas !== null ? String(preview.estilo_vida_ambiente_externo_horas) : '',
          estiloVidaAssistirTvHoras: preview.estilo_vida_assistir_tv_horas !== null ? String(preview.estilo_vida_assistir_tv_horas) : '',
          receitaLongeOdEsferico: formatDegreeDisplay(preview.receita_longe_od_esferico),
          receitaLongeOdCilindrico: formatDegreeDisplay(preview.receita_longe_od_cilindrico),
          receitaLongeOdEixo: preview.receita_longe_od_eixo || '',
          receitaLongeOeEsferico: formatDegreeDisplay(preview.receita_longe_oe_esferico),
          receitaLongeOeCilindrico: formatDegreeDisplay(preview.receita_longe_oe_cilindrico),
          receitaLongeOeEixo: preview.receita_longe_oe_eixo || '',
          receitaAdicao: formatDegreeDisplay(preview.receita_adicao),
          recommendedLensName: preview.recommended_lens_name || '',
          commercialRecommendationRaw: preview.commercial_recommendation_raw || '',
          extractedText: preview.extracted_text || '',
          parseWarning: preview.parse_warning || '',
          documentHash: preview.document_hash || '',
          rawPayloadJson: preview.raw_payload_json || {}
        }))
        setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
        setAiState(null)
        setAiRecommendations([])
        setAiFeedback(null)
        setAiConversationInput('')
        setIvisionReferenceSuggestion(preview.recommended_lens_name || null)
        setIvisionReferenceSummary(preview.commercial_recommendation_raw || null)

        setFeedback(result.message)
      } catch (error) {
        setFormError(error instanceof Error ? error.message : 'Falha inesperada ao importar o PDF do iVision.')
      }
    })
  }

  const handleIrParaVenda = () => {
    if (!selectedCustomer) {
      setFormError('Selecione o titular antes de prosseguir para venda.')
      return
    }
    if (!authenticatedEmployee) {
      setFormError('Consultor não identificado. Impossível criar venda diretamente.')
      return
    }

    setFormError(null)
    setFeedback(null)

    startCreateVendaTransition(async () => {
      const result = await createNewVenda(selectedCustomer.id, authenticatedEmployee.id)
      
      if (result.success && result.data) {
         if (evaluationId) {
             await updateEvaluationExportedVendaId(evaluationId, storeId, result.data.id)
         }
         router.push(`/dashboard/loja/${storeId}/vendas/${result.data.id}/experimental?evaluation_id=${evaluationId || ''}`)
      } else {
         setFormError(result.message || 'Erro ao converter avaliação em Venda.')
      }
    })
  }

  const handleSave = () => {
    if (!selectedCustomer) {
      setFormError('Selecione o titular antes de salvar.')
      return
    }
    if (!isSubjectChosen) {
      setFormError('Escolha primeiro o paciente avaliado.')
      return
    }

    if (selectedSubjectType === 'dependente' && !selectedDependente) {
      setFormError('Selecione o dependente avaliado.')
      return
    }

    setFormError(null)
    setFeedback(null)

    startSaveTransition(async () => {
      const derivedStatus: EvaluationStatus = form.sourceSystem === 'ivision' ? 'importada' : 'concluida'
      const result = await upsertOpticalEvaluation({
        evaluationId: evaluationId || undefined,
        storeId,
        evaluatedCustomerId: selectedSubjectType === 'customer' ? selectedCustomer.id : null,
        evaluatedDependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null,
        responsibleCustomerId: selectedSubjectType === 'dependente' ? selectedCustomer.id : null,
        evaluatedNameSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.full_name || '') : selectedCustomer.full_name,
        responsibleNameSnapshot: selectedSubjectType === 'dependente' ? selectedCustomer.full_name : null,
        relationshipSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.parentesco || 'Dependente') : 'Titular',
        employeeId: authenticatedEmployee?.id ?? undefined,
        sourceSystem: form.sourceSystem,
        status: derivedStatus,
        parseStatus: form.parseStatus,
        sourceDocumentUrl: form.sourceUrl || null,
        sourceDocumentHost: form.sourceDocumentHost || null,
        sourceOsNumber: form.sourceOsNumber || null,
        sourceExamType: form.sourceExamType || null,
        sourceExamDatetime: form.sourceExamDatetime || null,
        patientNameRaw: form.patientNameRaw || null,
        ageYears: form.ageYears ? Number(form.ageYears) : null,
        estiloVidaUsoComputadorHoras: form.estiloVidaUsoComputadorHoras ? Number(form.estiloVidaUsoComputadorHoras) : null,
        estiloVidaDirigirHoras: form.estiloVidaDirigirHoras ? Number(form.estiloVidaDirigirHoras) : null,
        estiloVidaLeituraHoras: form.estiloVidaLeituraHoras ? Number(form.estiloVidaLeituraHoras) : null,
        estiloVidaUsoCelularHoras: form.estiloVidaUsoCelularHoras ? Number(form.estiloVidaUsoCelularHoras) : null,
        estiloVidaExposicaoSolHoras: form.estiloVidaExposicaoSolHoras ? Number(form.estiloVidaExposicaoSolHoras) : null,
        estiloVidaAmbienteInternoHoras: form.estiloVidaAmbienteInternoHoras ? Number(form.estiloVidaAmbienteInternoHoras) : null,
        estiloVidaAmbienteExternoHoras: form.estiloVidaAmbienteExternoHoras ? Number(form.estiloVidaAmbienteExternoHoras) : null,
        estiloVidaAssistirTvHoras: form.estiloVidaAssistirTvHoras ? Number(form.estiloVidaAssistirTvHoras) : null,
        receitaLongeOdEsferico: form.receitaLongeOdEsferico || null,
        receitaLongeOdCilindrico: form.receitaLongeOdCilindrico || null,
        receitaLongeOdEixo: form.receitaLongeOdEixo || null,
        receitaLongeOeEsferico: form.receitaLongeOeEsferico || null,
        receitaLongeOeCilindrico: form.receitaLongeOeCilindrico || null,
        receitaLongeOeEixo: form.receitaLongeOeEixo || null,
        receitaPertoOdEsferico: form.receitaPertoOdEsferico || null,
        receitaPertoOdCilindrico: form.receitaPertoOdCilindrico || null,
        receitaPertoOdEixo: form.receitaPertoOdEixo || null,
        receitaPertoOeEsferico: form.receitaPertoOeEsferico || null,
        receitaPertoOeCilindrico: form.receitaPertoOeCilindrico || null,
        receitaPertoOeEixo: form.receitaPertoOeEixo || null,
        receitaAdicao: form.receitaAdicao || null,
        medidaDnpOd: form.medidaDnpOd || null,
        medidaDnpOe: form.medidaDnpOe || null,
        medidaAlturaOd: form.medidaAlturaOd || null,
        medidaAlturaOe: form.medidaAlturaOe || null,
        recommendedLensName: form.recommendedLensName || null,
        commercialRecommendationRaw: form.commercialRecommendationRaw || null,
        extractedText: form.extractedText || null,
        rawPayloadJson: form.rawPayloadJson,
        parseWarning: form.parseWarning || null,
        documentHash: form.documentHash || null
      })

      if (!result.success) {
        setFormError(result.message)
        return
      }

      setFeedback(result.message)
      setForm((prev) => ({
        ...createEmptyForm(),
        sourceUrl: prev.sourceUrl
      }))
      setEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
      setAiState(null)
      setAiRecommendations([])
      setAiFeedback(null)
      setAiConversationInput('')
      setIvisionReferenceSuggestion(null)
      setIvisionReferenceSummary(null)

      const evaluations = await getOpticalEvaluationsForSubject({
        storeId,
        customerId: selectedSubjectType === 'customer' ? selectedCustomer.id : null,
        dependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null
      })
      setHistory(evaluations)
    })
  }



  

  const selectedSubjectLabel = selectedSubjectType === 'dependente'
? selectedDependente?.full_name || 'Dependente'
    : selectedCustomer?.full_name || 'Titular'
  const selectedSubjectName = selectedSubjectType === 'dependente'
    ? selectedDependente?.full_name || null
    : selectedSubjectType === 'customer'
      ? selectedCustomer?.full_name || null
      : null
  const isSubjectChosen = !!selectedSubjectType && (selectedSubjectType !== 'dependente' || !!selectedDependenteId)
  const patientNameMismatch =
    !!form.patientNameRaw &&
    !!selectedSubjectName &&
    normalizePersonName(form.patientNameRaw) !== normalizePersonName(selectedSubjectName)

  // CRM Auto-save
  useEffect(() => {
    // Só salva automaticamente se tiver paciente escolhido E funcionário autenticado
    if (!isSubjectChosen || !authenticatedEmployee) {
      return
    }

    const timer = setTimeout(() => {
      startSaveTransition(async () => {
        setSyncStatus('saving')
        
        try {
          const derivedStatus: EvaluationStatus = form.sourceSystem === 'ivision' ? 'importada' : 'em_andamento'
          const payload = {
            storeId,
            evaluationId: evaluationId || undefined,
            evaluatedCustomerId: selectedSubjectType === 'customer' ? selectedCustomer?.id : null,
            evaluatedDependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null,
            responsibleCustomerId: selectedSubjectType === 'dependente' ? selectedCustomer?.id : null,
            evaluatedNameSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.full_name || '') : selectedCustomer?.full_name || '',
            responsibleNameSnapshot: selectedSubjectType === 'dependente' ? (selectedCustomer?.full_name || '') : null,
            relationshipSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.parentesco || 'Dependente') : 'Titular',
            employeeId: authenticatedEmployee.id,
            sourceSystem: form.sourceSystem,
            status: derivedStatus,
            parseStatus: form.parseStatus,
            sourceDocumentUrl: form.sourceUrl || null,
            sourceDocumentHost: form.sourceDocumentHost || null,
            sourceOsNumber: form.sourceOsNumber || null,
            sourceExamType: form.sourceExamType || null,
            sourceExamDatetime: form.sourceExamDatetime || null,
            patientNameRaw: form.patientNameRaw || null,
            ageYears: form.ageYears ? Number(form.ageYears) : null,
            estiloVidaUsoComputadorHoras: form.estiloVidaUsoComputadorHoras ? Number(form.estiloVidaUsoComputadorHoras) : null,
            estiloVidaDirigirHoras: form.estiloVidaDirigirHoras ? Number(form.estiloVidaDirigirHoras) : null,
            estiloVidaLeituraHoras: form.estiloVidaLeituraHoras ? Number(form.estiloVidaLeituraHoras) : null,
            estiloVidaUsoCelularHoras: form.estiloVidaUsoCelularHoras ? Number(form.estiloVidaUsoCelularHoras) : null,
            estiloVidaExposicaoSolHoras: form.estiloVidaExposicaoSolHoras ? Number(form.estiloVidaExposicaoSolHoras) : null,
            estiloVidaAmbienteInternoHoras: form.estiloVidaAmbienteInternoHoras ? Number(form.estiloVidaAmbienteInternoHoras) : null,
            estiloVidaAmbienteExternoHoras: form.estiloVidaAmbienteExternoHoras ? Number(form.estiloVidaAmbienteExternoHoras) : null,
            estiloVidaAssistirTvHoras: form.estiloVidaAssistirTvHoras ? Number(form.estiloVidaAssistirTvHoras) : null,
            receitaLongeOdEsferico: form.receitaLongeOdEsferico || null,
            receitaLongeOdCilindrico: form.receitaLongeOdCilindrico || null,
            receitaLongeOdEixo: form.receitaLongeOdEixo || null,
            receitaLongeOeEsferico: form.receitaLongeOeEsferico || null,
            receitaLongeOeCilindrico: form.receitaLongeOeCilindrico || null,
            receitaLongeOeEixo: form.receitaLongeOeEixo || null,
            receitaPertoOdEsferico: form.receitaPertoOdEsferico || null,
            receitaPertoOdCilindrico: form.receitaPertoOdCilindrico || null,
            receitaPertoOdEixo: form.receitaPertoOdEixo || null,
            receitaPertoOeEsferico: form.receitaPertoOeEsferico || null,
            receitaPertoOeCilindrico: form.receitaPertoOeCilindrico || null,
            receitaPertoOeEixo: form.receitaPertoOeEixo || null,
            receitaAdicao: form.receitaAdicao || null,
            medidaDnpOd: form.medidaDnpOd || null,
            medidaDnpOe: form.medidaDnpOe || null,
            medidaAlturaOd: form.medidaAlturaOd || null,
            medidaAlturaOe: form.medidaAlturaOe || null,
            recommendedLensName: form.recommendedLensName || null,
            commercialRecommendationRaw: form.commercialRecommendationRaw || null,
            recommendedItems: aiRecommendations.length > 0 ? aiRecommendations : null,
            extractedText: form.extractedText || null,
            rawPayloadJson: form.rawPayloadJson,
            parseWarning: form.parseWarning || null,
            documentHash: form.documentHash || null
          }

          const result = await upsertOpticalEvaluation(payload)

          if (result.success && result.data) {
            setEvaluationId(result.data.id)
            setSyncStatus('saved')
          } else {
            console.error('Save error:', result.message)
            setSyncStatus('error')
          }
        } catch (err) {
          console.error('Save error:', err)
          setSyncStatus('error')
        }
      })
    }, 1200)

    return () => clearTimeout(timer)
  }, [form, isSubjectChosen, authenticatedEmployee, evaluationId, selectedCustomer, selectedDependente, selectedSubjectType, selectedDependenteId, storeId])

  const isIvisionMode = form.sourceSystem === 'ivision'
  const hasCatalogForAi = activeCatalogs.length > 0 || !!activeCatalog
  const aiCaseInput = inferRecommendationCaseInput(form)
  const canGenerateAi =
    hasCatalogForAi &&
    isSubjectChosen &&
    aiCaseInput.esferico !== null
  const showManualSuggestionBlock = !hasCatalogForAi
  const aiTopRecommendation = aiRecommendations[0] || null
  const showIvisionReference = isIvisionMode && !!ivisionReferenceSuggestion
  const showIvisionComparison = showIvisionReference && !!aiTopRecommendation
  const comparisonText = showIvisionComparison
    ? buildComparisonText(ivisionReferenceSuggestion || '', aiTopRecommendation)
    : ''
  const canOpenImportedPdf =
    isIvisionMode &&
    !!form.sourceUrl &&
    (!!form.documentHash || !!form.extractedText)
  const hasSourceUrl = form.sourceUrl.trim().length > 0

  if (!authenticatedEmployee) {
    return (
      <div className="relative flex h-[calc(100vh-64px)] items-center justify-center overflow-hidden bg-slate-950">
        <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
          <div className="absolute inset-0 bg-[url('/atendimento.jpg')] bg-cover bg-center opacity-40 blur-[2px]" />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
        </div>
        <EmployeeAuthModal
          storeId={storeId}
          isOpen={true}
          onClose={() => {
            if (!hasAuthenticatedRef.current) {
              router.back()
            }
          }}
          onSuccess={(emp) => {
            hasAuthenticatedRef.current = true
            setAuthenticatedEmployee(emp)
          }}
          title="Assinatura de Avaliação"
          description="Acesso restrito. Insira o seu PIN de consultor para assumir a titularidade desta avaliação."
        />
      </div>
    )
  }

  return (
    <div className="relative flex h-[calc(100vh-64px)] overflow-hidden bg-slate-950">
      <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
        <div className="absolute inset-0 bg-[url('/atendimento.jpg')] bg-cover bg-center opacity-40 blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
      </div>

      <div className="absolute top-4 right-4 z-50">
        <BackgroundToggle />
      </div>

      <div className="relative z-10 flex w-full gap-4 p-4">
        <div className={`w-[360px] ${cardStyle} flex flex-col overflow-hidden`}>
          <div className="border-b border-white/10 bg-gradient-to-br from-indigo-900/50 to-slate-900/60 p-4">
            <h1 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-white">
              <Sparkles className="h-5 w-5 text-indigo-300" />
              Avaliação
            </h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300/80">
              Pré-venda e histórico individual
            </p>
            {authenticatedEmployee && (
              <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-1" title={authenticatedEmployee.full_name}>
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-indigo-200 truncate max-w-[240px]">
                  Consultor(a): {authenticatedEmployee.full_name}
                </span>
              </div>
            )}
          </div>

          <div className="border-b border-white/10 p-4 space-y-4">
            <div>
              <label className={labelStyle}>Titular / Responsável</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  value={query}
                  onChange={(e) => handleQueryChange(e.target.value)}
                  disabled={!!selectedCustomer}
                  className={`${inputStyle} pl-10 pr-10 ${selectedCustomer ? 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10' : ''}`}
                  placeholder={selectedCustomer ? '' : 'Nome, CPF ou telefone...'}
                />
                {selectedCustomer && (
                  <button
                    type="button"
                    onClick={clearSubject}
                    className="absolute right-2 top-2 rounded-lg p-1.5 text-cyan-300 hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {isSearching && !selectedCustomer && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-indigo-400" />
                )}
              </div>

              
              {!selectedCustomer && query.length < 2 && (
                <div className="mt-4 pt-4 border-t border-white/10 flex-1">
                  <EvaluationDashboard
                    employeeName={authenticatedEmployee?.full_name || ''}
                    evaluations={recentEvaluations}
                    onSelectEvaluation={handleSelectEvaluation}
                    onCloseEvaluation={handleCloseEvaluation}
                    isLoading={isLoadingDashboard}
                  />
                </div>
              )}

              {!selectedCustomer && (query.length >= 2 || customerResults.length > 0) && (
                <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/90 shadow-2xl">
                  <div className="max-h-64 overflow-y-auto custom-scrollbar">
                    {customerResults.length > 0 ? (
                      customerResults.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => handleSelectCustomer(customer)}
                          className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left transition-colors hover:bg-white/5"
                        >
                          <div>
                            <p className="font-black uppercase tracking-tight text-white">{customer.full_name}</p>
                            <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                              CPF {customer.cpf || 'N/A'}
                            </p>
                          </div>
                          <Plus className="h-4 w-4 text-slate-500" />
                        </button>
                      ))
                    ) : (
                      <p className="px-4 py-6 text-center text-sm italic text-slate-500">
                        {searchError || 'Nenhum cliente encontrado.'}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsQuickModalOpen(true)}
                    className="flex w-full items-center gap-3 border-t border-white/10 bg-cyan-500/10 px-4 py-4 text-left text-cyan-300 transition-colors hover:bg-cyan-500/20"
                  >
                    <UserPlus className="h-5 w-5" />
                    <div>
                      <p className="text-xs font-black uppercase tracking-[0.2em]">Novo Cadastro</p>
                      <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/70">
                        adicionar &quot;{query}&quot;
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {selectedCustomer && (
              <>
                <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">Responsável</p>
                  <p className="mt-2 text-lg font-black text-white">{selectedCustomer.full_name}</p>
                  <p className="mt-1 text-xs font-bold text-slate-400">
                    {selectedCustomer.cpf || 'Sem CPF'} â€¢ {selectedCustomer.fone_movel || 'Sem telefone'}
                  </p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <label className={labelStyle}>Paciente Avaliado</label>
                    <button
                      type="button"
                      onClick={() => setIsDependenteModalOpen(true)}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-indigo-300 hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3" /> Dependente
                    </button>
                  </div>

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSubjectType('customer')}
                      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${selectedSubjectType === 'customer' ? 'border-indigo-500/40 bg-indigo-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                    >
                      <User className={`h-5 w-5 ${selectedSubjectType === 'customer' ? 'text-indigo-300' : 'text-slate-500'}`} />
                      <div>
                        <p className="font-black text-white">Titular</p>
                        <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                          {selectedCustomer.full_name}
                        </p>
                      </div>
                    </button>

                    {dependentes.map((dependente) => (
                      <button
                        key={dependente.id}
                        type="button"
                        onClick={() => {
                          setSelectedSubjectType('dependente')
                          setSelectedDependenteId(String(dependente.id))
                        }}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-colors ${selectedSubjectType === 'dependente' && Number(selectedDependenteId) === dependente.id ? 'border-indigo-500/40 bg-indigo-500/15' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}
                      >
                        <Users2 className={`h-5 w-5 ${selectedSubjectType === 'dependente' && Number(selectedDependenteId) === dependente.id ? 'text-indigo-300' : 'text-slate-500'}`} />
                        <div>
                          <p className="font-black text-white">{dependente.full_name}</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-slate-500">
                            {dependente.parentesco || 'Dependente'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            <div className="mb-3 flex items-center gap-2">
              <History className="h-4 w-4 text-indigo-300" />
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">Histórico</h2>
              {isLoadingHistory && <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />}
            </div>

            {!selectedCustomer ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-500">
                Selecione um responsável e um paciente para ver o histórico de avaliações.
              </div>
            ) : !isSubjectChosen ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-500">
                Escolha primeiro o paciente avaliado para liberar o histórico individual.
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-500">
                Nenhuma avaliação encontrada para {selectedSubjectLabel}.
              </div>
            ) : (
              <div className="space-y-3">
                {history.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                          {new Date(item.created_at).toLocaleDateString('pt-BR')} â€¢ {item.source_system}
                        </p>
                        <p className="mt-1 text-sm font-black text-white">
                          {item.evaluated_patient_name || item.patient_name_raw || 'Paciente'}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          OS {item.source_os_number || 'N/A'} â€¢ {item.source_exam_type || 'Avaliação'}
                        </p>
                      </div>
                      {item.source_document_url && (
                        <a
                          href={item.source_document_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.15em] text-indigo-300 hover:bg-white/10"
                        >
                          <ExternalLink className="h-3 w-3" /> PDF
                        </a>
                      )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs font-bold text-slate-300">
                      <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                        OD {formatDegreeDisplay(item.receita_longe_od_esferico) || '-'} {formatDegreeDisplay(item.receita_longe_od_cilindrico) || ''} {item.receita_longe_od_eixo || ''}
                      </div>
                      <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-2">
                        OE {formatDegreeDisplay(item.receita_longe_oe_esferico) || '-'} {formatDegreeDisplay(item.receita_longe_oe_cilindrico) || ''} {item.receita_longe_oe_eixo || ''}
                      </div>
                    </div>
                    {(item.receita_adicao || item.recommended_lens_name) && (
                      <div className="mt-2 text-xs text-slate-400">
                        {item.receita_adicao && <span className="mr-3 font-bold text-emerald-300">Adição {formatDegreeDisplay(item.receita_adicao)}</span>}
                        {item.recommended_lens_name && <span>Sugestão: {item.recommended_lens_name}</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-hidden rounded-2xl border border-white/10 bg-slate-900/40 backdrop-blur-xl shadow-xl">
          <div className="border-b border-white/10 bg-slate-900/60 px-6 py-4">
            <h2 className="text-lg font-black uppercase tracking-tight text-white">Nova Avaliação</h2>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
              Importação iVision ou preenchimento manual
            </p>
          </div>

          <div className="h-[calc(100%-81px)] overflow-y-auto p-6 custom-scrollbar">
            {!selectedCustomer ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-indigo-500/20 bg-indigo-500/10">
                    <FileSearch className="h-6 w-6 text-indigo-300" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">
                    Selecione o paciente
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Escolha primeiro o titular e, se necessário, o dependente avaliado para importar ou preencher a análise.
                  </p>
                </div>
              </div>
            ) : !isSubjectChosen ? (
              <div className="flex min-h-[420px] items-center justify-center">
                <div className="max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/20 bg-cyan-500/10">
                    <Users2 className="h-6 w-6 text-cyan-300" />
                  </div>
                  <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">
                    Escolha o Paciente Avaliado
                  </h3>
                  <p className="mt-3 text-sm leading-6 text-slate-400">
                    Depois de selecionar o titular, escolha quem foi avaliado na coluna à esquerda. Só então a nova avaliação será aberta.
                  </p>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-5xl space-y-5">
                {formError && (
                  <div className="flex items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-bold text-red-300">
                    <AlertTriangle className="h-4 w-4" /> {formError}
                  </div>
                )}
                {feedback && (
                  <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-300">
                    <Sparkles className="h-4 w-4" /> {feedback}
                  </div>
                )}

                {/* TEST PROFILES - REMOVE EASILY BY DELETING THIS BLOCK */}
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 mb-5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Preenchimento Rápido (DEMO):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.enzo }))
                      setFeedback('Perfil do Enzo (Criança) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Baby className="h-3.5 w-3.5" /> Enzo (Criança)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.maria }))
                      setFeedback('Perfil da Maria (Adaptação) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Maria (Adaptação)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.roberto }))
                      setFeedback('Perfil do Roberto (Empresário) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Roberto (Empresário)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(createEmptyForm())
                      setFormError(null)
                      setFeedback('Formulário limpo com sucesso!')
                    }}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar Tudo
                  </button>
                </div>

                <div className={`${cardStyle} p-5`}>
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                        Origem do Exame
                      </h3>
                      <p className="mt-1 text-xs font-bold text-slate-400">
                        Paciente atual: {selectedSubjectLabel}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null)
                          setFeedback(null)
                          setForm((prev) => ({ ...prev, sourceSystem: 'manual', status: 'concluida' }))
                        }}
                        className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.15em] transition-colors ${!isIvisionMode ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                      >
                        Manual
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setFormError(null)
                          setFeedback(null)
                          setForm((prev) => ({ ...prev, sourceSystem: 'ivision' }))
                        }}
                        className={`rounded-xl border px-4 py-2 text-xs font-black uppercase tracking-[0.15em] transition-colors ${isIvisionMode ? 'border-indigo-500/30 bg-indigo-500/15 text-indigo-200' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'}`}
                      >
                        iVision
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-12 gap-4">
                    {isIvisionMode && (
                      <div className="col-span-12 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-4">
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex-1">
                            <label className={labelStyle}>Link do PDF iVision</label>
                            <input
                              value={form.sourceUrl}
                              onChange={(e) => handleFormChange('sourceUrl', e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault()
                                  handleImport()
                                }
                              }}
                              className={inputStyle}
                              placeholder="Cole aqui o link assinado do PDF gerado pelo iVision"
                            />
                          </div>
                          <div className="mt-5 flex items-center gap-2">
                            <button
                              type="button"
                              onClick={handleImport}
                              disabled={isImporting || !hasSourceUrl}
                              title="Importar PDF do iVision"
                              className="inline-flex h-10 items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-4 text-xs font-black uppercase tracking-[0.15em] text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
                            >
                              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Import className="h-4 w-4" />}
                              Importar PDF
                            </button>
                            {canOpenImportedPdf && (
                              <a
                                href={form.sourceUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Ver PDF"
                                className="inline-flex h-10 items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 text-xs font-black uppercase tracking-[0.15em] text-cyan-200 hover:bg-cyan-500/20"
                              >
                                <ExternalLink className="h-4 w-4" />
                                Ver PDF
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Origem</label>
                      <input value={form.sourceSystem} readOnly className={inputStyle} />
                    </div>
                    {isIvisionMode && (
                      <div className="col-span-12 md:col-span-8">
                        <label className={labelStyle}>Leitura do PDF</label>
                        <input value={getParseStatusLabel(form.parseStatus)} readOnly className={inputStyle} />
                      </div>
                    )}
                  </div>
                </div>

                <div className={`${cardStyle} p-5`}>
                  <h3 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                    Estilo de Vida
                  </h3>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Idade</label>
                      <input
                        type="number"
                        min="0"
                        value={form.ageYears}
                        onChange={(e) => handleFormChange('ageYears', e.target.value)}
                        className={inputStyle}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Computador (h)</label>
                      <input type="number" min="0" value={form.estiloVidaUsoComputadorHoras} onChange={(e) => handleFormChange('estiloVidaUsoComputadorHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Dirigir (h)</label>
                      <input type="number" min="0" value={form.estiloVidaDirigirHoras} onChange={(e) => handleFormChange('estiloVidaDirigirHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Leitura (h)</label>
                      <input type="number" min="0" value={form.estiloVidaLeituraHoras} onChange={(e) => handleFormChange('estiloVidaLeituraHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Celular (h)</label>
                      <input type="number" min="0" value={form.estiloVidaUsoCelularHoras} onChange={(e) => handleFormChange('estiloVidaUsoCelularHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Exposição ao Sol (h)</label>
                      <input type="number" min="0" value={form.estiloVidaExposicaoSolHoras} onChange={(e) => handleFormChange('estiloVidaExposicaoSolHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Ambiente Interno (h)</label>
                      <input type="number" min="0" value={form.estiloVidaAmbienteInternoHoras} onChange={(e) => handleFormChange('estiloVidaAmbienteInternoHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Ambiente Externo (h)</label>
                      <input type="number" min="0" value={form.estiloVidaAmbienteExternoHoras} onChange={(e) => handleFormChange('estiloVidaAmbienteExternoHoras', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Assistir TV (h)</label>
                      <input type="number" min="0" value={form.estiloVidaAssistirTvHoras} onChange={(e) => handleFormChange('estiloVidaAssistirTvHoras', e.target.value)} className={inputStyle} />
                    </div>
                  </div>
                </div>

                <div className={`${cardStyle} p-5`}>
                  <h3 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                    Queixas e Prioridades
                  </h3>
                  <div className="grid grid-cols-12 gap-4">
                    {/* SUBSECTION 1: HISTÃ“RICO E Ã“CULOS ATUAL */}
                    <div className="col-span-12">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Histórico e Ã“culos Atual
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Marca atual</label>
                      <input
                        value={form.marcaAtual}
                        onChange={(e) => handleFormChange('marcaAtual', e.target.value)}
                        className={inputStyle}
                        placeholder="Ex: Hoya, Zeiss, Essilor"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Tipo da lente atual</label>
                      <select
                        value={form.tipoLenteAtual}
                        onChange={(e) => handleFormChange('tipoLenteAtual', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="visao_simples">Visão simples</option>
                        <option value="multifocal">Multifocal / progressiva</option>
                        <option value="ocupacional">Ocupacional</option>
                        <option value="bifocal">Bifocal</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Usa multifocal hoje?</label>
                      <select
                        value={form.usaMultifocalHoje}
                        onChange={(e) => handleFormChange('usaMultifocalHoje', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Adaptação com lentes anteriores</label>
                      <select
                        value={form.dificuldadeAdaptacao}
                        onChange={(e) => handleFormChange('dificuldadeAdaptacao', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="baixa">Boa adaptação</option>
                        <option value="media">Alguma dificuldade</option>
                        <option value="alta">Muita dificuldade</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Trocas recentes de lente</label>
                      <select
                        value={form.historicoTrocasRecentes}
                        onChange={(e) => handleFormChange('historicoTrocasRecentes', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="nenhuma">Nenhuma recente</option>
                        <option value="uma">Uma troca recente</option>
                        <option value="varias">Várias trocas / retrabalho</option>
                      </select>
                    </div>

                    {/* SUBSECTION 2: OBJETIVOS E PREFERÃŠNCIAS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Objetivos e Preferências
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prioridade principal</label>
                      <select
                        value={form.prioridadePrincipal}
                        onChange={(e) => handleFormChange('prioridadePrincipal', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="equilibrio">Equilíbrio geral</option>
                        <option value="economia">Melhor custo-benefício</option>
                        <option value="adaptacao">Adaptação mais fácil</option>
                        <option value="resistencia">Mais resistência</option>
                        <option value="controle_miopia">Controle de miopia</option>
                        <option value="premium">Desempenho premium</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Principal incômodo atual</label>
                      <select
                        value={form.principalIncomodoAtual}
                        onChange={(e) => handleFormChange('principalIncomodoAtual', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="nenhum">Nenhum específico</option>
                        <option value="perto">Não enxerga bem de perto</option>
                        <option value="longe">Não enxerga bem de longe</option>
                        <option value="intermediario">Intermediário / computador</option>
                        <option value="peso_espessura">Peso / espessura</option>
                        <option value="reflexo">Reflexo / brilho</option>
                        <option value="adaptacao">Dificuldade de adaptação</option>
                        <option value="preco">Preço</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Objetivo desta compra</label>
                      <select
                        value={form.objetivoCompra}
                        onChange={(e) => handleFormChange('objetivoCompra', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="primeira_multifocal">Primeira multifocal</option>
                        <option value="upgrade">Upgrade de lente</option>
                        <option value="resolver_queixa">Resolver queixa específica</option>
                        <option value="economizar">Economizar</option>
                        <option value="trocar_marca">Trocar marca/laboratório</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Faixa de orçamento</label>
                      <select
                        value={form.faixaOrcamento}
                        onChange={(e) => handleFormChange('faixaOrcamento', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="ate_800">Até 800</option>
                        <option value="800_2000">800 a 2.000</option>
                        <option value="2000_5000">2.000 a 5.000</option>
                        <option value="acima_5000">Acima de 5.000</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Orçamento alvo</label>
                      <input
                        value={form.budgetTarget}
                        onChange={(e) => handleFormChange('budgetTarget', e.target.value)}
                        className={inputStyle}
                        placeholder="Ex: até 2500"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Importância de estética/finura</label>
                      <select
                        value={form.importanciaEstetica}
                        onChange={(e) => handleFormChange('importanciaEstetica', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Importância de resistência</label>
                      <select
                        value={form.importanciaResistencia}
                        onChange={(e) => handleFormChange('importanciaResistencia', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">Média</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prefere Transitions?</label>
                      <select
                        value={form.prefereTransitions}
                        onChange={(e) => handleFormChange('prefereTransitions', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prefere Blue/UV?</label>
                      <select
                        value={form.prefereBlueUv}
                        onChange={(e) => handleFormChange('prefereBlueUv', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Aceita opção premium?</label>
                      <select
                        value={form.aceitaPremium}
                        onChange={(e) => handleFormChange('aceitaPremium', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Não informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Não</option>
                      </select>
                    </div>

                    {/* SUBSECTION 3: SINTOMAS E COMPORTAMENTOS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Sintomas e Comportamentos
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Dificuldade para dirigir à noite</label>
                      <select
                        value={form.queixaDirigirNoite}
                        onChange={(e) => handleFormChange('queixaDirigirNoite', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Sensibilidade à luz</label>
                      <select
                        value={form.queixaSensibilidadeLuz}
                        onChange={(e) => handleFormChange('queixaSensibilidadeLuz', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Quebra óculos com frequência</label>
                      <select
                        value={form.queixaQuebraOculos}
                        onChange={(e) => handleFormChange('queixaQuebraOculos', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Criança muito ativa</label>
                      <select
                        value={form.queixaCriancaAtiva}
                        onChange={(e) => handleFormChange('queixaCriancaAtiva', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Grau aumentando rápido</label>
                      <select
                        value={form.queixaProgressaoRapida}
                        onChange={(e) => handleFormChange('queixaProgressaoRapida', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>

                    {/* SUBSECTION 4: OBSERVAÃ‡Ã•ES ADICIONAIS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Observações Adicionais
                      </h4>
                    </div>
                    <div className="col-span-12">
                      <label className={labelStyle}>Observações do consultor</label>
                      <textarea
                        value={form.observacoesConsultor}
                        onChange={(e) => handleFormChange('observacoesConsultor', e.target.value)}
                        className="block min-h-[92px] w-full rounded-xl border border-white/20 bg-slate-900/60 shadow-inner text-slate-100 px-3 py-3 text-sm font-bold placeholder:font-normal placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                        placeholder="Ex: cliente muito sensível a preço, já devolveu multifocal, quer lente mais fina, compara muito com concorrente..."
                      />
                    </div>
                  </div>
                </div>

                {isIvisionMode && (
                  <div className={`${cardStyle} p-5`}>
                    <h3 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                      Cabeçalho do PDF
                    </h3>
                    <div className="grid grid-cols-12 gap-4">
                      <div className="col-span-12 md:col-span-6">
                        <label className={labelStyle}>Paciente no PDF</label>
                        <input
                          value={form.patientNameRaw}
                          onChange={(e) => handleFormChange('patientNameRaw', e.target.value)}
                          className={`${inputStyle} ${patientNameMismatch ? 'border-red-500/50 bg-red-500/10 text-red-200 focus:border-red-400/60 focus:ring-red-400/30' : ''}`}
                        />
                        {patientNameMismatch && (
                          <p className="mt-2 text-xs font-bold text-red-300">
                            O nome do PDF está diferente do paciente avaliado escolhido: {selectedSubjectName}
                          </p>
                        )}
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <label className={labelStyle}>OS origem</label>
                        <input value={form.sourceOsNumber} onChange={(e) => handleFormChange('sourceOsNumber', e.target.value)} className={inputStyle} />
                      </div>
                      <div className="col-span-12 md:col-span-3">
                        <label className={labelStyle}>Tipo de exame</label>
                        <input value={form.sourceExamType} onChange={(e) => handleFormChange('sourceExamType', e.target.value)} className={inputStyle} />
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <label className={labelStyle}>Data / Hora do exame</label>
                        <div className="relative">
                          <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                          <input type="datetime-local" value={form.sourceExamDatetime} onChange={(e) => handleFormChange('sourceExamDatetime', e.target.value)} className={`${inputStyle} pl-10`} />
                        </div>
                      </div>
                      <div className="col-span-12 md:col-span-6">
                        <label className={labelStyle}>Paciente Avaliado</label>
                        <input value={selectedSubjectLabel} readOnly className={`${inputStyle} text-cyan-200`} />
                      </div>
                    </div>
                  </div>
                )}

                <div className={`${cardStyle} p-5`}>
                  <h3 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                    Receita e Medidas
                  </h3>
                  <div className="grid grid-cols-12 gap-4">
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelStyle}>OD ESF</label>
                      <DegreeInput value={form.receitaLongeOdEsferico} onChange={(value) => handleFormChange('receitaLongeOdEsferico', value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelStyle}>OD CIL</label>
                      <DegreeInput value={form.receitaLongeOdCilindrico} onChange={(value) => handleFormChange('receitaLongeOdCilindrico', value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelStyle}>OD EIXO</label>
                      <input value={form.receitaLongeOdEixo} onChange={(e) => handleFormChange('receitaLongeOdEixo', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelStyle}>OE ESF</label>
                      <DegreeInput value={form.receitaLongeOeEsferico} onChange={(value) => handleFormChange('receitaLongeOeEsferico', value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelStyle}>OE CIL</label>
                      <DegreeInput value={form.receitaLongeOeCilindrico} onChange={(value) => handleFormChange('receitaLongeOeCilindrico', value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-2">
                      <label className={labelStyle}>OE EIXO</label>
                      <input value={form.receitaLongeOeEixo} onChange={(e) => handleFormChange('receitaLongeOeEixo', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Adição</label>
                      <DegreeInput value={form.receitaAdicao} onChange={(value) => handleFormChange('receitaAdicao', value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>DNP OD</label>
                      <input value={form.medidaDnpOd} onChange={(e) => handleFormChange('medidaDnpOd', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>DNP OE</label>
                      <input value={form.medidaDnpOe} onChange={(e) => handleFormChange('medidaDnpOe', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Altura OD / OE</label>
                      <div className="grid grid-cols-2 gap-2">
                        <input value={form.medidaAlturaOd} onChange={(e) => handleFormChange('medidaAlturaOd', e.target.value)} className={inputStyle} />
                        <input value={form.medidaAlturaOe} onChange={(e) => handleFormChange('medidaAlturaOe', e.target.value)} className={inputStyle} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className={`${cardStyle} p-5`}>
                  <h3 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                    Recomendação Comercial
                  </h3>
                  <div className="grid grid-cols-12 gap-4">
                    {activeCatalog && (
                      <div className="col-span-12 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-300">
                              Sugestão assistida por IA
                            </p>
                            <p className="mt-2 text-sm text-slate-300">
                              A IA usa os catálogos ativos da loja para sugerir lente, tratamento e preço final.
                            </p>
                            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              {activeCatalogs.length > 1
                                ? `Catálogos ativos: ${activeCatalogs
                                    .map((catalog) => catalog.laboratorio)
                                    .join(' + ')}`
                                : `Catálogo ativo: ${activeCatalog.laboratorio} · ${activeCatalog.versao}`}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleGenerateAiRecommendation}
                            disabled={isGeneratingAi || !canGenerateAi}
                            className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isGeneratingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                            Gerar pela IA
                          </button>
                        </div>

                        {aiFeedback && (
                          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                            {aiFeedback}
                          </div>
                        )}

                        {showIvisionReference && (
                          <div className="mt-4 grid grid-cols-12 gap-4">
                            <div className="col-span-12 lg:col-span-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/10 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
                                Sugestão iVision
                              </p>
                              <p className="mt-2 text-lg font-black text-white">{ivisionReferenceSuggestion}</p>
                              {ivisionReferenceSummary && (
                                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-300">
                                  {ivisionReferenceSummary}
                                </p>
                              )}
                            </div>
                            <div className="col-span-12 lg:col-span-6 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/10 p-4">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-300">
                                Sugestão IA
                              </p>
                              {aiTopRecommendation ? (
                                <div className="mt-2 flex h-full flex-col">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-lg font-black text-white">
                                        {buildAiRecommendationLabel(aiTopRecommendation)}
                                      </p>
                                      <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                        {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(aiTopRecommendation.finalPrice)}
                                      </p>
                                    </div>
                                    <AiOptionInfoButton option={aiTopRecommendation} />
                                  </div>
                                  <p className="mt-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                    {buildAiOptionNarrative(aiTopRecommendation, 0, aiTopRecommendation)}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyAiRecommendation(aiTopRecommendation)}
                                    className="mt-auto ml-auto inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400"
                                  >
                                    Aplicar esta opção
                                  </button>
                                </div>
                              ) : manualSuggestion ? (
                                <>
                                  <p className="mt-2 text-lg font-black text-white">
                                    {manualSuggestion.primaryLens}
                                  </p>
                                  {manualSuggestion.complementaryOptions.length > 0 && (
                                    <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                      Complementos: {manualSuggestion.complementaryOptions.join(', ')}
                                    </p>
                                  )}
                                  <div className="mt-3 space-y-2">
                                    {manualSuggestion.reasons.slice(0, 3).map((reason) => (
                                      <p key={reason} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
                                        {reason}
                                      </p>
                                    ))}
                                  </div>
                                </>
                              ) : (
                                <div className="mt-3 rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-slate-300">
                                  Gere pela IA para comparar a sugestão importada do iVision com uma recomendação baseada no catálogo ativo da loja.
                                </div>
                              )}
                            </div>
                            {showIvisionComparison && (
                              <div className="col-span-12 rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm leading-6 text-slate-300">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                  Por que a IA concorda ou diverge
                                </p>
                                <p className="mt-2">{comparisonText}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {!showIvisionReference && aiRecommendations.length > 0 && (
                          <div className="mt-4 grid grid-cols-12 gap-4">
                            {aiRecommendations.map((option, index) => (
                              <div
                                key={option.configKey}
                                className={`col-span-12 rounded-2xl border p-4 ${index === 0 ? 'border-fuchsia-500/20 bg-fuchsia-500/10' : 'border-white/10 bg-black/20'}`}
                              >
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                                  <div>
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                          Opção {index + 1}
                                        </p>
                                        <p className="mt-2 text-lg font-black text-white">{buildAiRecommendationLabel(option)}</p>
                                        <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.finalPrice)}
                                        </p>
                                      </div>
                                      <AiOptionInfoButton option={option} />
                                    </div>
                                    <p className="mt-3 rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                      {buildAiOptionNarrative(option, index, aiRecommendations[0] || option)}
                                    </p>
                                  </div>
                                  <div className="flex lg:min-w-[220px] lg:max-w-sm lg:flex-col lg:justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleApplyAiRecommendation(option)}
                                      className="mt-auto ml-auto inline-flex items-center gap-2 self-end rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400"
                                    >
                                      Aplicar esta opção
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {!showIvisionReference && !aiRecommendations.length && manualSuggestion && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              Sugestão do sistema
                            </p>
                            <p className="mt-2 text-lg font-black text-white">{manualSuggestion.primaryLens}</p>
                            {manualSuggestion.complementaryOptions.length > 0 && (
                              <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                Complementos: {manualSuggestion.complementaryOptions.join(', ')}
                              </p>
                            )}
                            <div className="mt-3 space-y-2">
                              {manualSuggestion.reasons.slice(0, 3).map((reason) => (
                                <p key={reason} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
                                  {reason}
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {aiRecommendations.length > 0 && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              Refinar recomendação
                            </p>
                            <div className="mt-3 flex gap-3">
                              <input
                                value={aiConversationInput}
                                onChange={(e) => setAiConversationInput(e.target.value)}
                                placeholder="Ex: ele quer pensar melhor, mas gostou da proposta"
                                className={`${inputStyle} flex-1`}
                              />
                              <button
                                type="button"
                                onClick={handleContinueAiConversation}
                                disabled={!aiState || !aiConversationInput.trim() || isContinuingAi}
                                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isContinuingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                                Refinar
                              </button>
                            </div>

                            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              Resposta rápida para retenção
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {[
                                { id: 'pesquisar', label: 'Vou dar uma pesquisada' },
                                { id: 'pensar', label: 'Vou falar com meu marido' },
                                { id: 'armacoes', label: 'Não gostei das armações' },
                                { id: 'concorrencia', label: 'Achei mais barato na concorrência' }
                              ].map((shortcut) => (
                                <button
                                  key={shortcut.id}
                                  type="button"
                                  onClick={() => handleQuickRetentionAction(shortcut.id as QuickRetentionIntent)}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                                >
                                  {shortcut.label}
                                </button>
                              ))}
                            </div>
                            {quickRetentionReply && (
                              <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-4 text-sm leading-6 text-amber-50">
                                {quickRetentionReply}
                              </div>
                            )}
                          </div>
                        )}

                        {false && aiRecommendations.length > 0 && (
                          <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                              Refinar recomendação
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {['Ficou caro', 'Ele quer algo em até 8000', 'Quero manter Transitions', 'Quero outra opção'].map((suggestion) => (
                                <button
                                  key={suggestion}
                                  type="button"
                                  onClick={() => setAiConversationInput(suggestion)}
                                  className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-white/10"
                                >
                                  {suggestion}
                                </button>
                              ))}
                            </div>
                            <div className="mt-3 flex gap-3">
                              <input
                                value={aiConversationInput}
                                onChange={(e) => setAiConversationInput(e.target.value)}
                                placeholder="Ex: ficou caro, quero algo em até 8000"
                                className={`${inputStyle} flex-1`}
                              />
                              <button
                                type="button"
                                onClick={handleContinueAiConversation}
                                disabled={!aiState || !aiConversationInput.trim() || isContinuingAi}
                                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isContinuingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                                Refinar
                              </button>
                            </div>
                          </div>
                        )}

                        {!aiRecommendations.length && (
                          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-slate-400">
                            Gere a recomendação por IA para comparar ou aplicar uma opção comercial nesta avaliação.
                          </div>
                        )}
                      </div>
                    )}
                    {showManualSuggestionBlock && (
                      <div className="col-span-12 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                              Sugestão do Sistema
                            </p>
                            <p className="mt-2 text-sm text-slate-300">
                              Gere uma sugestão comercial a partir do grau, da idade e do estilo de vida antes de salvar.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleGenerateSuggestion}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-200 hover:bg-emerald-500/20"
                          >
                            <Sparkles className="h-4 w-4" />
                            Gerar Sugestão
                          </button>
                        </div>

                        {manualSuggestion ? (
                          <div className="mt-4 grid grid-cols-12 gap-4">
                            <div className="col-span-12 lg:col-span-5">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Sugestão principal</p>
                              <p className="mt-2 text-lg font-black text-white">{manualSuggestion.primaryLens}</p>
                              {manualSuggestion.complementaryOptions.length > 0 && (
                                <p className="mt-2 text-sm font-bold text-emerald-200">
                                  Complementos: {manualSuggestion.complementaryOptions.join(', ')}
                                </p>
                              )}
                            </div>
                            <div className="col-span-12 lg:col-span-7">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Motivos</p>
                              <div className="mt-2 space-y-2">
                                {manualSuggestion.reasons.map((reason) => (
                                  <p key={reason} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
                                    {reason}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-4 rounded-xl border border-dashed border-white/10 bg-black/10 px-4 py-4 text-sm text-slate-400">
                            A sugestão aparecerá aqui e também poderá preencher os campos comerciais logo abaixo.
                          </div>
                        )}
                      </div>
                    )}
                    <div className="col-span-12">
                      <label className={labelStyle}>Lente recomendada</label>
                      <input value={form.recommendedLensName} onChange={(e) => handleFormChange('recommendedLensName', e.target.value)} className={inputStyle} />
                    </div>
                    <div className="col-span-12">
                      <label className={labelStyle}>Resumo comercial</label>
                      <textarea
                        value={form.commercialRecommendationRaw}
                        onChange={(e) => handleFormChange('commercialRecommendationRaw', e.target.value)}
                        className="block min-h-[92px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-bold text-slate-100 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                        placeholder="Tratamento sugerido, material, observações comerciais..."
                      />
                    </div>
                    {isIvisionMode && (
                      <>
                        <div className="col-span-12">
                          <label className={labelStyle}>Avisos da importação</label>
                          <textarea
                            value={form.parseWarning}
                            onChange={(e) => handleFormChange('parseWarning', e.target.value)}
                            className="block min-h-[72px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-bold text-slate-100 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="Avisos de parse ou observações internas"
                          />
                        </div>
                        <div className="col-span-12">
                          <label className={labelStyle}>Texto extraído do PDF</label>
                          <textarea
                            value={form.extractedText}
                            onChange={(e) => handleFormChange('extractedText', e.target.value)}
                            className="block min-h-[180px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-medium text-slate-200 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="O texto bruto extraído do PDF fica registrado aqui"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar Avaliação
                  </button>

                  <button
                    type="button"
                    onClick={handleIrParaVenda}
                    disabled={isCreatingVenda || isSaving || !selectedCustomer}
                    className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-600 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-emerald-50 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:bg-emerald-500 hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] disabled:opacity-50 transition-all font-sans"
                  >
                    {isCreatingVenda ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
                    Ir para Venda (Checkout)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {isQuickModalOpen && (
        <QuickCustomerModal
          isOpen={isQuickModalOpen}
          onClose={() => setIsQuickModalOpen(false)}
          onSuccess={handleQuickSuccess}
          storeId={storeId}
          initialName={query}
        />
      )}

      {selectedCustomer && (
        <AddDependenteModal
          isOpen={isDependenteModalOpen}
          onClose={() => setIsDependenteModalOpen(false)}
          onSuccess={handleDependenteAdded}
          storeId={storeId}
          customerId={selectedCustomer.id}
        />
      )}
    </div>
  )
}
