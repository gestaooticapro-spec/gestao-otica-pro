'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useParams } from 'next/navigation'
import {
  AlertTriangle,
  Bot,
  Calendar,
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
  X
} from 'lucide-react'
import QuickCustomerModal from '@/components/modals/QuickCustomerModal'
import AddDependenteModal from '@/components/modals/AddDependenteModal'
import { getDependentes } from '@/lib/actions/dependents.actions'
import { searchCustomersByName, type CustomerSearchResult } from '@/lib/actions/vendas.actions'
import {
  getOpticalEvaluationsForSubject,
  saveOpticalEvaluation,
  type OpticalEvaluationListItem
} from '@/lib/actions/evaluation.actions'
import {
  continueLensRecommendationConversationAction,
  generateLensRecommendationsAction
} from '@/lib/actions/lens-recommendation.actions'
import { Database } from '@/lib/database.types'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import type {
  RecommendationConversationState,
  RecommendationOption
} from '@/lib/server/lens-recommendation'

type Dependente = Database['public']['Tables']['dependentes']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type SubjectType = 'customer' | 'dependente'
type EvaluationSourceSystem = 'manual' | 'ivision'
type EvaluationStatus = 'rascunho' | 'concluida' | 'importada' | 'exportada'
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

type LensRecommendationActionPayload = {
  state: RecommendationConversationState
  recommendations: RecommendationOption[]
}

type SuggestionGenerationResult =
  | { success: true; suggestion: ManualSuggestion }
  | { success: false }

const labelStyle = 'block text-[10px] font-black text-slate-400 uppercase mb-1 tracking-[0.2em]'
const inputStyle = 'block w-full rounded-xl border border-white/10 bg-black/20 shadow-inner text-slate-100 h-10 text-sm px-3 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 font-bold placeholder:font-normal placeholder:text-slate-500 disabled:opacity-50 transition-all outline-none'
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

  let primaryLens = 'Lente visÃ£o simples'
  const complementaryOptions: string[] = []
  const reasons: string[] = []

  if (progressaoRapida && isChild) {
    primaryLens = 'Lente de controle de miopia'
    reasons.push('idade infantil com relato de progressÃ£o rÃ¡pida do grau favorece avaliar uma soluÃ§Ã£o especÃ­fica para controle de miopia')
  } else if ((addicao !== null && addicao >= 0.75) || (age !== null && age >= 45)) {
    primaryLens = 'Lente multifocal / progressiva'
    reasons.push(`idade${age !== null ? ` ${age}` : ''} e adiÃ§Ã£o ${formatDegreeDisplay(form.receitaAdicao) || 'presente'} favorecem correÃ§Ã£o para longe, perto e intermediÃ¡rio`)

    if (usoPerto >= 10) {
      complementaryOptions.push('campo intermediÃ¡rio ampliado')
      reasons.push(`rotina de perto intensa (${usoPerto}h entre leitura, computador e celular) pede mais conforto no uso diÃ¡rio`)
    }
  } else if ((age !== null && age >= 38) || usoPerto >= 8) {
    primaryLens = 'Lente digital / anti-fadiga'
    reasons.push(`uso de perto elevado (${usoPerto}h) indica necessidade de mais conforto visual em telas e leitura`)
  } else if (usoPerto >= 4) {
    primaryLens = 'Lente visÃ£o simples com desenho para rotina digital'
    reasons.push(`hÃ¡ demanda relevante para perto e telas, mesmo sem sinais fortes de presbiopia`)
  } else {
    reasons.push('receita e rotina sugerem uma soluÃ§Ã£o bÃ¡sica, com foco em nitidez e adaptaÃ§Ã£o simples')
  }

  if (dirigir >= 4) {
    complementaryOptions.push('antirreflexo premium')
    reasons.push(`dirigir ${dirigir}h por dia reforÃ§a benefÃ­cio de antirreflexo com melhor contraste e reduÃ§Ã£o de reflexos`)
  }

  if (dirigeNoite) {
    complementaryOptions.push('conforto para direÃ§Ã£o noturna')
    reasons.push('foi marcada dificuldade para dirigir Ã  noite, o que reforÃ§a contraste e reduÃ§Ã£o de reflexos')
  }

  if (sol >= 4 || ambienteExterno >= 4) {
    complementaryOptions.push('fotossensÃ­vel / proteÃ§Ã£o UV')
    reasons.push(`exposiÃ§Ã£o externa relevante (${Math.max(sol, ambienteExterno)}h) combina com proteÃ§Ã£o solar no dia a dia`)
  }

  if (computador + celular >= 6) {
    complementaryOptions.push('conforto digital')
    reasons.push(`uso combinado de computador e celular (${computador + celular}h) pede alÃ­vio para rotina de telas`)
  }

  if (sensibilidadeLuz) {
    complementaryOptions.push('controle de claridade')
    reasons.push('foi marcada sensibilidade Ã  luz, favorecendo conforto com claridade e ambientes externos')
  }

  if (precisaResistencia) {
    complementaryOptions.push('material resistente')
    reasons.push('o contexto indica necessidade de uma configuraÃ§Ã£o mais resistente para reduzir risco de quebra')
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
  return `${option.familyName} | ${option.offerLabel}${treatmentPart}`
}

const buildAiCommercialSummary = (option: RecommendationOption) => {
  const explanation = option.treatmentExplainWhy || option.commercialSummary || option.recommendationNotes || ''
  const reasons = option.reasons.slice(0, 3).map(humanizeRecommendationReason).join(', ')
  return [
    `${buildAiRecommendationLabel(option)} â€” ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.finalPrice)}`,
    explanation,
    reasons ? `Motivos considerados: ${reasons}.` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
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
    multifocal: 'Categoria clÃ­nica multifocal',
    bifocal: 'Categoria clÃ­nica bifocal',
    visao_simples: 'Categoria clÃ­nica visÃ£o simples',
    ocupacional: 'Categoria clÃ­nica ocupacional',
    controle_miopia: 'Categoria clÃ­nica de controle de miopia',
    plana_solar: 'Categoria clÃ­nica solar',
    dirigir: 'Rotina com bastante tempo ao volante',
    dirigir_noite: 'Queixa de direÃ§Ã£o noturna',
    computador: 'Rotina intensa de computador',
    celular: 'Uso frequente de celular',
    sol: 'ExposiÃ§Ã£o solar relevante',
    crianca_ativa: 'CrianÃ§a muito ativa',
    risco_quebra: 'Risco frequente de quebra',
    adaptacao_rapida: 'Busca adaptaÃ§Ã£o mais fÃ¡cil',
    conforto_visual: 'Busca mais conforto visual',
    conforto_luz: 'Busca mais conforto com claridade',
    resistencia: 'Busca material mais resistente',
    custo_beneficio: 'Busca melhor custo-benefÃ­cio',
    transitions: 'PreferÃªncia por Transitions',
    blue_uv: 'PreferÃªncia por proteÃ§Ã£o Blue UV',
    resistente: 'ConfiguraÃ§Ã£o com material mais resistente',
  }

  if (reason === 'categoria:mista_sem_oferta_definida') {
    return 'FamÃ­lia mista com oferta especÃ­fica compatÃ­vel'
  }

  if (reason === 'oferta_atomica') return 'Oferta pronta'
  if (reason === 'inclui_tratamento') return 'ConfiguraÃ§Ã£o jÃ¡ inclui tratamento'
  if (reason === 'tratamento:antirreflexo') return 'Tratamento antirreflexo'
  if (reason === 'tratamento:conforto_telas') return 'Tratamento favorÃ¡vel para telas'
  if (reason === 'tratamento:dirigir_noite') return 'Tratamento favorÃ¡vel para direÃ§Ã£o noturna'
  if (reason === 'tratamento:outdoor') return 'Tratamento favorÃ¡vel para uso externo'

  if (type === 'categoria' && rawValue === 'controle_miopia') {
    return 'Categoria clÃƒÂ­nica de controle de miopia'
  }
  if ((type === 'beneficio' || type === 'uso') && rawValue === 'controle_miopia') {
    return 'Sinal de progressÃƒÂ£o rÃƒÂ¡pida do grau'
  }

  if (type === 'orcamento') {
    return `Faixa de orÃ§amento ${value}`
  }

  if (type === 'alvo_preco') {
    return `PreÃ§o prÃ³ximo do alvo informado`
  }

  if (type === 'tratamento_orcamento') {
    return `Tratamento com nÃ­vel de preÃ§o ${value}`
  }

  if (type === 'tratamento_uso') {
    return `Tratamento alinhado ao uso: ${labelsByValue[rawValue] || value}`
  }

  if (type === 'tratamento_beneficio') {
    return `Tratamento alinhado ao benefÃ­cio: ${labelsByValue[rawValue] || value}`
  }

  if (type === 'categoria' || type === 'uso' || type === 'beneficio' || type === 'feature' || type === 'material') {
    return labelsByValue[rawValue] || `${type}: ${value}`
  }

  return reason.replace(/_/g, ' ')
}

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
    return 'A IA chegou a uma direÃ§Ã£o muito parecida com a sugestÃ£o do iVision. A diferenÃ§a estÃ¡ mais na configuraÃ§Ã£o comercial, no tratamento ou no preÃ§o final do que no desenho principal da lente.'
  }

  if (level === 'parcial') {
    return `A IA manteve a mesma direÃ§Ã£o clÃ­nica geral do iVision, mas ajustou a configuraÃ§Ã£o para refletir melhor o caso atual em preÃ§o final, tratamento e conforto de uso. ${humanReasons ? `Ela priorizou especialmente: ${humanReasons}.` : ''}`.trim()
  }

  return `A IA considerou sinais adicionais do caso, como rotina, adaptaÃ§Ã£o, faixa de preÃ§o e features desejadas, e por isso priorizou uma combinaÃ§Ã£o diferente da sugerida pelo iVision. ${humanReasons ? `Os critÃ©rios mais fortes foram: ${humanReasons}.` : ''}`.trim()
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

  let budgetMode: 'economico' | 'intermediario' | 'premium' = 'intermediario'
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
  activeCatalog
}: {
  activeCatalog: ActiveCatalogContext
}) {
  const params = useParams()
  const storeId = parseInt(params.storeId as string, 10)
  const { preference } = useBackgroundPreference()

  const [query, setQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [selectedSubjectType, setSelectedSubjectType] = useState<SubjectType | null>(null)
  const [selectedDependenteId, setSelectedDependenteId] = useState<string>('')
  const [history, setHistory] = useState<OpticalEvaluationListItem[]>([])
  const [form, setForm] = useState(createEmptyForm())
  const [searchError, setSearchError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [isQuickModalOpen, setIsQuickModalOpen] = useState(false)
  const [isDependenteModalOpen, setIsDependenteModalOpen] = useState(false)

  const [isSearching, startSearchTransition] = useTransition()
  const [isImporting, startImportTransition] = useTransition()
  const [isSaving, startSaveTransition] = useTransition()
  const [isLoadingHistory, startHistoryTransition] = useTransition()
  const [isGeneratingAi, startAiGenerationTransition] = useTransition()
  const [isContinuingAi, startAiConversationTransition] = useTransition()
  const [manualSuggestion, setManualSuggestion] = useState<ManualSuggestion | null>(null)
  const [aiState, setAiState] = useState<RecommendationConversationState | null>(null)
  const [aiRecommendations, setAiRecommendations] = useState<RecommendationOption[]>([])
  const [aiFeedback, setAiFeedback] = useState<string | null>(null)
  const [aiConversationInput, setAiConversationInput] = useState('')
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

  const clearSubject = () => {
    setSelectedCustomer(null)
    setDependentes([])
    setSelectedDependenteId('')
    setSelectedSubjectType(null)
    setQuery('')
    setCustomerResults([])
    setHistory([])
    setForm(createEmptyForm())
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

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer)
    setQuery(customer.full_name)
    setCustomerResults([])
    setSelectedDependenteId('')
    setSelectedSubjectType(null)
    setHistory([])
    setForm(createEmptyForm())
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
      setFormError('Preencha pelo menos os campos principais do grau antes de gerar a sugestÃ£o.')
      return { success: false }
    }

    if (!form.ageYears && !hasAnyLifestyleData(form) && !form.receitaAdicao && !hasAnyComplaintData(form)) {
      setFormError('Informe idade, adiÃ§Ã£o, estilo de vida ou alguma queixa do cliente para gerar a sugestÃ£o.')
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

    applyManualSuggestion(result.suggestion, 'SugestÃ£o comercial gerada com base nas regras da avaliaÃ§Ã£o manual.')
  }

  const fallbackToSystemSuggestion = () => {
    const result = generateManualSuggestionResult()
    if (!result.success) return false

    setAiState(null)
    setAiRecommendations([])
    setAiConversationInput('')
    setAiFeedback('SugestÃ£o comercial gerada com base nos dados da avaliaÃ§Ã£o.')
    applyManualSuggestion(result.suggestion, 'SugestÃ£o comercial gerada com base nos dados da avaliaÃ§Ã£o.')
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
      setFormError('Preencha pelo menos esfÃ©rico e cilÃ­ndrico para a IA recomendar.')
      return
    }

    setFormError(null)
    setAiFeedback(null)
    setManualSuggestion(null)

    startAiGenerationTransition(async () => {
      const result = await generateLensRecommendationsAction({
        versionId: activeCatalog.versionId,
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
      setManualSuggestion(null)
      setAiFeedback('SugestÃ£o por IA gerada com base no catÃ¡logo ativo da loja.')
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
      setManualSuggestion(null)
      setAiFeedback(`SugestÃ£o refinada para: "${currentInput}"`)
    })
  }

  const handleApplyAiRecommendation = (option: RecommendationOption) => {
    setForm((prev) => ({
      ...prev,
      recommendedLensName: buildAiRecommendationLabel(option),
      commercialRecommendationRaw: buildAiCommercialSummary(option)
    }))
    setFeedback('SugestÃ£o da IA aplicada aos campos comerciais. Revise antes de salvar.')
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
      setFormError('Cole primeiro o link do PDF do iVision para iniciar a importaÃ§Ã£o.')
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
          setFormError(result.message || 'NÃ£o foi possÃ­vel importar o PDF do iVision.')
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
      const result = await saveOpticalEvaluation({
        storeId,
        evaluatedCustomerId: selectedSubjectType === 'customer' ? selectedCustomer.id : null,
        evaluatedDependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null,
        responsibleCustomerId: selectedSubjectType === 'dependente' ? selectedCustomer.id : null,
        evaluatedNameSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.full_name || '') : selectedCustomer.full_name,
        responsibleNameSnapshot: selectedSubjectType === 'dependente' ? selectedCustomer.full_name : null,
        relationshipSnapshot: selectedSubjectType === 'dependente' ? (selectedDependente?.parentesco || 'Dependente') : 'Titular',
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
  const isIvisionMode = form.sourceSystem === 'ivision'
  const hasCatalogForAi = !!activeCatalog
  const aiCaseInput = inferRecommendationCaseInput(form)
  const canGenerateAi =
    hasCatalogForAi &&
    isSubjectChosen &&
    aiCaseInput.esferico !== null &&
    aiCaseInput.cilindrico !== null
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
              AvaliaÃ§Ã£o
            </h1>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300/80">
              PrÃ©-venda e histÃ³rico individual
            </p>
          </div>

          <div className="border-b border-white/10 p-4 space-y-4">
            <div>
              <label className={labelStyle}>Titular / ResponsÃ¡vel</label>
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
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">ResponsÃ¡vel</p>
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
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-indigo-300">HistÃ³rico</h2>
              {isLoadingHistory && <Loader2 className="h-4 w-4 animate-spin text-indigo-300" />}
            </div>

            {!selectedCustomer ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-500">
                Selecione um responsÃ¡vel e um paciente para ver o histÃ³rico de avaliaÃ§Ãµes.
              </div>
            ) : !isSubjectChosen ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-500">
                Escolha primeiro o paciente avaliado para liberar o histÃ³rico individual.
              </div>
            ) : history.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-center text-sm text-slate-500">
                Nenhuma avaliaÃ§Ã£o encontrada para {selectedSubjectLabel}.
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
                          OS {item.source_os_number || 'N/A'} â€¢ {item.source_exam_type || 'AvaliaÃ§Ã£o'}
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
                        {item.receita_adicao && <span className="mr-3 font-bold text-emerald-300">AdiÃ§Ã£o {formatDegreeDisplay(item.receita_adicao)}</span>}
                        {item.recommended_lens_name && <span>SugestÃ£o: {item.recommended_lens_name}</span>}
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
            <h2 className="text-lg font-black uppercase tracking-tight text-white">Nova AvaliaÃ§Ã£o</h2>
            <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300">
              ImportaÃ§Ã£o iVision ou preenchimento manual
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
                    Escolha primeiro o titular e, se necessÃ¡rio, o dependente avaliado para importar ou preencher a anÃ¡lise.
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
                    Depois de selecionar o titular, escolha quem foi avaliado na coluna Ã  esquerda. SÃ³ entÃ£o a nova avaliaÃ§Ã£o serÃ¡ aberta.
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
                      <label className={labelStyle}>ExposiÃ§Ã£o ao Sol (h)</label>
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
                      <label className={labelStyle}>AdaptaÃ§Ã£o com lentes anteriores</label>
                      <select
                        value={form.dificuldadeAdaptacao}
                        onChange={(e) => handleFormChange('dificuldadeAdaptacao', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="baixa">Boa adaptaÃ§Ã£o</option>
                        <option value="media">Alguma dificuldade</option>
                        <option value="alta">Muita dificuldade</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prioridade principal</label>
                      <select
                        value={form.prioridadePrincipal}
                        onChange={(e) => handleFormChange('prioridadePrincipal', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="equilibrio">EquilÃ­brio geral</option>
                        <option value="economia">Melhor custo-benefÃ­cio</option>
                        <option value="adaptacao">AdaptaÃ§Ã£o mais fÃ¡cil</option>
                        <option value="resistencia">Mais resistÃªncia</option>
                        <option value="controle_miopia">Controle de miopia</option>
                        <option value="premium">Desempenho premium</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Dificuldade para dirigir Ã  noite</label>
                      <select
                        value={form.queixaDirigirNoite}
                        onChange={(e) => handleFormChange('queixaDirigirNoite', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Sensibilidade Ã  luz</label>
                      <select
                        value={form.queixaSensibilidadeLuz}
                        onChange={(e) => handleFormChange('queixaSensibilidadeLuz', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Quebra Ã³culos com frequÃªncia</label>
                      <select
                        value={form.queixaQuebraOculos}
                        onChange={(e) => handleFormChange('queixaQuebraOculos', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>CrianÃ§a muito ativa</label>
                      <select
                        value={form.queixaCriancaAtiva}
                        onChange={(e) => handleFormChange('queixaCriancaAtiva', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Grau aumentando rÃ¡pido</label>
                      <select
                        value={form.queixaProgressaoRapida}
                        onChange={(e) => handleFormChange('queixaProgressaoRapida', e.target.value)}
                        className={inputStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                  </div>
                </div>

                {isIvisionMode && (
                  <div className={`${cardStyle} p-5`}>
                    <h3 className="mb-4 text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                      CabeÃ§alho do PDF
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
                            O nome do PDF estÃ¡ diferente do paciente avaliado escolhido: {selectedSubjectName}
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
                      <label className={labelStyle}>AdiÃ§Ã£o</label>
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
                    RecomendaÃ§Ã£o Comercial
                  </h3>
                  <div className="grid grid-cols-12 gap-4">
                    {activeCatalog && (
                      <div className="col-span-12 rounded-2xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-300">
                              SugestÃ£o assistida por IA
                            </p>
                            <p className="mt-2 text-sm text-slate-300">
                              A IA usa o catÃ¡logo ativo da loja para sugerir lente, tratamento e preÃ§o final.
                            </p>
                            <p className="mt-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
                              CatÃ¡logo ativo: {activeCatalog.laboratorio} Â· {activeCatalog.versao}
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
                                SugestÃ£o iVision
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
                                SugestÃ£o IA
                              </p>
                              {aiTopRecommendation ? (
                                <>
                                  <p className="mt-2 text-lg font-black text-white">
                                    {buildAiRecommendationLabel(aiTopRecommendation)}
                                  </p>
                                  <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                    {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(aiTopRecommendation.finalPrice)}
                                  </p>
                                  <div className="mt-3 space-y-2">
                                    {aiTopRecommendation.reasons.slice(0, 3).map((reason) => (
                                      <p key={reason} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
                                        {humanizeRecommendationReason(reason)}
                                      </p>
                                    ))}
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyAiRecommendation(aiTopRecommendation)}
                                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400"
                                  >
                                    Aplicar esta opÃ§Ã£o
                                  </button>
                                </>
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
                                  Gere pela IA para comparar a sugestÃ£o importada do iVision com uma recomendaÃ§Ã£o baseada no catÃ¡logo ativo da loja.
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
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                  <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                      OpÃ§Ã£o {index + 1}
                                    </p>
                                    <p className="mt-2 text-lg font-black text-white">{buildAiRecommendationLabel(option)}</p>
                                    <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.finalPrice)}
                                    </p>
                                    <div className="mt-3 space-y-2">
                                      {option.reasons.slice(0, 3).map((reason) => (
                                        <p key={`${option.configKey}-${reason}`} className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-300">
                                          {humanizeRecommendationReason(reason)}
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                  <div className="lg:max-w-sm">
                                    {(option.treatmentExplainWhy || option.commercialSummary) && (
                                      <p className="rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                        {option.treatmentExplainWhy || option.commercialSummary}
                                      </p>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleApplyAiRecommendation(option)}
                                      className="mt-4 inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400"
                                    >
                                      Aplicar esta opÃ§Ã£o
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
                              SugestÃ£o do sistema
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
                              Refinar recomendaÃ§Ã£o
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {['Ficou caro', 'Ele quer algo em atÃ© 8000', 'Quero manter Transitions', 'Quero outra opÃ§Ã£o'].map((suggestion) => (
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
                                placeholder="Ex: ficou caro, quero algo em atÃ© 8000"
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
                            Gere a recomendaÃ§Ã£o por IA para comparar ou aplicar uma opÃ§Ã£o comercial nesta avaliaÃ§Ã£o.
                          </div>
                        )}
                      </div>
                    )}
                    {showManualSuggestionBlock && (
                      <div className="col-span-12 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                              SugestÃ£o do Sistema
                            </p>
                            <p className="mt-2 text-sm text-slate-300">
                              Gere uma sugestÃ£o comercial a partir do grau, da idade e do estilo de vida antes de salvar.
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleGenerateSuggestion}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-emerald-200 hover:bg-emerald-500/20"
                          >
                            <Sparkles className="h-4 w-4" />
                            Gerar SugestÃ£o
                          </button>
                        </div>

                        {manualSuggestion ? (
                          <div className="mt-4 grid grid-cols-12 gap-4">
                            <div className="col-span-12 lg:col-span-5">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">SugestÃ£o principal</p>
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
                            A sugestÃ£o aparecerÃ¡ aqui e tambÃ©m poderÃ¡ preencher os campos comerciais logo abaixo.
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
                        placeholder="Tratamento sugerido, material, observaÃ§Ãµes comerciais..."
                      />
                    </div>
                    {isIvisionMode && (
                      <>
                        <div className="col-span-12">
                          <label className={labelStyle}>Avisos da importaÃ§Ã£o</label>
                          <textarea
                            value={form.parseWarning}
                            onChange={(e) => handleFormChange('parseWarning', e.target.value)}
                            className="block min-h-[72px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-bold text-slate-100 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="Avisos de parse ou observaÃ§Ãµes internas"
                          />
                        </div>
                        <div className="col-span-12">
                          <label className={labelStyle}>Texto extraÃ­do do PDF</label>
                          <textarea
                            value={form.extractedText}
                            onChange={(e) => handleFormChange('extractedText', e.target.value)}
                            className="block min-h-[180px] w-full rounded-xl border border-white/10 bg-black/20 px-3 py-3 text-sm font-medium text-slate-200 shadow-inner outline-none transition-all placeholder:font-normal placeholder:text-slate-500 focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50"
                            placeholder="O texto bruto extraÃ­do do PDF fica registrado aqui"
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar AvaliaÃ§Ã£o
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
