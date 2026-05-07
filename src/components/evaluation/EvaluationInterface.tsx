'use client'

import React, { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  Bot,
  Calendar,
  Check,
  CircleHelp,
  Copy,
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
  Trash2, ShoppingCart, ArrowLeft
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
import {
  generateLensSalesAssistAction,
  generateLensTechnicalTriageAction,
  type LensSalesAssist,
  type LensTechnicalTriage,
  type LensTechnicalTriageSignal,
  type PatientAuditContext,
} from '@/lib/actions/gemini-narratives.actions'
import { Database } from '@/lib/database.types'
import { EvaluationDashboard } from './EvaluationDashboard'
import { getRecentEvaluationsForEmployee, getRecentEvaluationsForStore, updateEvaluationPanicReason, updateEvaluationExportedVendaId, updateEvaluationOutcomeStatus } from '@/lib/actions/evaluation.actions'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import type {
  RecommendationCaseInput,
  RecommendationConversationState,
  RecommendationOption
} from '@/lib/server/lens-recommendation'

type Dependente = Database['public']['Tables']['dependentes']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type SubjectType = 'customer' | 'dependente'
type EvaluationSourceSystem = 'manual' | 'ivision'
type EvaluationStatus = 'rascunho' | 'em_andamento' | 'pendente' | 'concluida' | 'importada' | 'exportada'
type EvaluationParseStatus = 'success' | 'partial' | 'failed'
type LensRimPoint = { x: number; y: number }
type LensSearchField = {
  familyName: string
  lineA: LensRimPoint[]
  lineB: LensRimPoint[]
}
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

const LENS_ENGINE_DIAGNOSTIC_SUITE_NAME = 'Dossie Triplice do Motor'
const LENS_ENGINE_DIAGNOSTIC_SUITE_RESTORE_KEY = 'dossie_triplice_motor'
const LENS_DEMO_QUICK_FILL_RESTORE_KEY = 'demo_quick_fill_profiles'
const SHOW_LENS_DEMO_QUICK_FILL = false

const TRIAGE_SIGNAL_PATCHES: Record<LensTechnicalTriageSignal, Partial<Pick<RecommendationCaseInput, 'rotina_tags' | 'objetivo_tags' | 'desired_benefits' | 'preferred_features'>>> = {
  risco_espessura_alta: { desired_benefits: ['lente_fina', 'estetica', 'qualidade_optica'] },
  risco_espessura_moderada: { desired_benefits: ['lente_fina'] },
  priorizar_indice_alto: { desired_benefits: ['lente_fina', 'estetica'] },
  evitar_indice_baixo: { desired_benefits: ['lente_fina'] },
  priorizar_asferica: { desired_benefits: ['qualidade_optica', 'estetica'] },
  priorizar_resistencia: { desired_benefits: ['resistencia'], rotina_tags: ['risco_quebra'] },
  priorizar_trivex_policarbonato: {
    desired_benefits: ['resistencia'],
    rotina_tags: ['risco_quebra'],
    objetivo_tags: ['resistencia_impacto_prioritaria'],
  },
  controle_miopia_prioritario: {
    rotina_tags: ['controle_miopia'],
    objetivo_tags: ['controle_miopia'],
    desired_benefits: ['controle_miopia'],
  },
  fotossensivel_desejado_mas_secundario: {
    preferred_features: ['transitions'],
    desired_benefits: ['conforto_luz'],
    objetivo_tags: ['transitions_secundario'],
  },
  blue_uv_desejado_mas_secundario: {
    preferred_features: ['blue_uv'],
    desired_benefits: ['conforto_digital'],
    objetivo_tags: ['blue_uv_secundario'],
  },
  risco_adaptacao_multifocal: {
    rotina_tags: ['adaptacao_critica'],
    objetivo_tags: ['adaptacao_critica'],
    desired_benefits: ['adaptacao_rapida', 'conforto_visual'],
  },
  priorizar_ar_premium: { desired_benefits: ['ar_premium', 'qualidade_optica', 'conforto_visual'] },
  evitar_ar_externo: {
    desired_benefits: ['qualidade_optica', 'conforto_visual'],
    objetivo_tags: ['evitar_ar_externo'],
  },
  priorizar_conforto_digital: { desired_benefits: ['conforto_digital'], rotina_tags: ['computador'] },
  priorizar_dirigir_noite: { desired_benefits: ['conforto_visual', 'qualidade_optica'], rotina_tags: ['dirigir_noite'] },
  priorizar_campo_perto: { desired_benefits: ['conforto_visual'], rotina_tags: ['leitura', 'computador'] },
  orcamento_limita_solucao_ideal: { objetivo_tags: ['orcamento_limita_solucao_ideal'] },
}

const uniqueList = (items: string[]) => Array.from(new Set(items.filter(Boolean)))

const applyTechnicalTriageToCaseInput = (
  caseInput: RecommendationCaseInput,
  triage: LensTechnicalTriage | null,
): RecommendationCaseInput => {
  if (!triage) return caseInput

  const next: RecommendationCaseInput = {
    ...caseInput,
    rotina_tags: [...(caseInput.rotina_tags || [])],
    objetivo_tags: [...(caseInput.objetivo_tags || [])],
    desired_benefits: [...(caseInput.desired_benefits || [])],
    preferred_features: [...(caseInput.preferred_features || [])],
  }

  for (const signal of uniqueList([...triage.technicalSignals, ...triage.clinicalPriorities]) as LensTechnicalTriageSignal[]) {
    const patch = TRIAGE_SIGNAL_PATCHES[signal]
    if (!patch) continue
    next.rotina_tags = uniqueList([...(next.rotina_tags || []), ...(patch.rotina_tags || [])])
    next.objetivo_tags = uniqueList([...(next.objetivo_tags || []), ...(patch.objetivo_tags || [])])
    next.desired_benefits = uniqueList([...(next.desired_benefits || []), ...(patch.desired_benefits || [])])
    next.preferred_features = uniqueList([...(next.preferred_features || []), ...(patch.preferred_features || [])])
  }

  const triageNotes = [
    triage.parecer ? `Triagem IA: ${triage.parecer}` : null,
    triage.salesContext.tradeoff ? `Tradeoff IA: ${triage.salesContext.tradeoff}` : null,
    triage.salesContext.caution ? `Cuidado IA: ${triage.salesContext.caution}` : null,
  ].filter(Boolean)

  if (triageNotes.length > 0) {
    next.notes = [caseInput.notes, ...triageNotes].filter(Boolean).join(' | ')
  }

  if (next.rejected_features?.length) {
    const rejected = new Set(next.rejected_features)
    next.preferred_features = (next.preferred_features || []).filter((feature) => !rejected.has(feature))
  }

  const explicitlyPreferred = new Set(caseInput.preferred_features || [])
  if (caseInput.budget_mode === 'premium') {
    next.objetivo_tags = (next.objetivo_tags || []).filter((tag) => {
      if (tag === 'transitions_secundario' && explicitlyPreferred.has('transitions')) return false
      if (tag === 'blue_uv_secundario' && explicitlyPreferred.has('blue_uv')) return false
      return true
    })
  }

  return next
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

const AI_SEARCH_STEPS = [
  'Mapeando campo visual',
  'Comparando geometrias',
  'Cruzando rotina e grau',
  'Ordenando conforto e preco'
]
const LENS_SCAN_TERMS = ['PROGRESSIVA', 'CAMPO AMPLO', 'DIGITAL', 'OCUPACIONAL', 'ANTIREFLEXO', 'TRANSITIONS']

const DEFAULT_LENS_RIM: LensRimPoint[] = [
  { x: 0.06, y: 0.42 },
  { x: 0.11, y: 0.18 },
  { x: 0.30, y: 0.06 },
  { x: 0.58, y: 0.05 },
  { x: 0.82, y: 0.16 },
  { x: 0.95, y: 0.40 },
  { x: 0.90, y: 0.70 },
  { x: 0.65, y: 0.88 },
  { x: 0.33, y: 0.88 },
  { x: 0.12, y: 0.70 },
]

const LENS_RIM_CUTOUT = { x: 0.24, y: 0.22, w: 0.52, h: 0.46 }

function normalizeLensRimForAnimation(points: LensRimPoint[] | null | undefined): LensRimPoint[] {
  if (!points || points.length < 3) return DEFAULT_LENS_RIM

  const remapped = points.map((point) => ({
    x: (point.x - LENS_RIM_CUTOUT.x) / LENS_RIM_CUTOUT.w,
    y: (point.y - LENS_RIM_CUTOUT.y) / LENS_RIM_CUTOUT.h,
  }))

  const xs = remapped.map((point) => point.x)
  const ys = remapped.map((point) => point.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = maxX - minX || 1
  const height = maxY - minY || 1

  return remapped.map((point) => ({
    x: 0.04 + ((point.x - minX) / width) * 0.92,
    y: 0.06 + ((point.y - minY) / height) * 0.88,
  }))
}

function buildSmoothSvgPath(points: LensRimPoint[], width: number, height: number): string {
  if (points.length < 3) return ''

  const abs = points.map((point) => ({ x: point.x * width, y: point.y * height }))
  const last = abs[abs.length - 1]
  const first = abs[0]
  const commands = [`M ${((last.x + first.x) / 2).toFixed(2)} ${((last.y + first.y) / 2).toFixed(2)}`]

  for (let index = 0; index < abs.length; index += 1) {
    const current = abs[index]
    const next = abs[(index + 1) % abs.length]
    commands.push(
      `Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${((current.x + next.x) / 2).toFixed(2)} ${((current.y + next.y) / 2).toFixed(2)}`
    )
  }

  commands.push('Z')
  return commands.join(' ')
}

function normalizeLensLineForAnimation(points: LensRimPoint[] | null | undefined): LensRimPoint[] {
  if (!points || points.length < 2) return []

  return points.map((point) => ({
    x: Math.max(0, Math.min(1, (point.x - LENS_RIM_CUTOUT.x) / LENS_RIM_CUTOUT.w)),
    y: Math.max(0, Math.min(1, (point.y - LENS_RIM_CUTOUT.y) / LENS_RIM_CUTOUT.h)),
  }))
}

function buildOpenSvgPath(points: LensRimPoint[], width: number, height: number): string {
  if (points.length < 2) return ''

  const abs = points.map((point) => ({ x: point.x * width, y: point.y * height }))
  const commands = [`M ${abs[0].x.toFixed(2)} ${abs[0].y.toFixed(2)}`]

  if (abs.length === 2) {
    commands.push(`L ${abs[1].x.toFixed(2)} ${abs[1].y.toFixed(2)}`)
    return commands.join(' ')
  }

  commands.push(`L ${((abs[0].x + abs[1].x) / 2).toFixed(2)} ${((abs[0].y + abs[1].y) / 2).toFixed(2)}`)
  for (let index = 1; index < abs.length - 1; index += 1) {
    const current = abs[index]
    const next = abs[index + 1]
    commands.push(
      `Q ${current.x.toFixed(2)} ${current.y.toFixed(2)} ${((current.x + next.x) / 2).toFixed(2)} ${((current.y + next.y) / 2).toFixed(2)}`
    )
  }
  commands.push(`L ${abs[abs.length - 1].x.toFixed(2)} ${abs[abs.length - 1].y.toFixed(2)}`)
  return commands.join(' ')
}

function buildFieldSvgPath(lineA: LensRimPoint[], lineB: LensRimPoint[], width: number, height: number): string {
  if (lineA.length < 2 || lineB.length < 2) return ''
  const a = lineA.map((point) => ({ x: point.x * width, y: point.y * height }))
  const b = [...lineB].reverse().map((point) => ({ x: point.x * width, y: point.y * height }))
  const all = [...a, ...b]
  return `M ${all.map((point) => `${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' L ')} Z`
}

const FALLBACK_SEARCH_FIELDS: LensSearchField[] = [
  {
    familyName: 'Campo amplo',
    lineA: [{ x: 0.34, y: 0.04 }, { x: 0.45, y: 0.35 }, { x: 0.34, y: 0.94 }],
    lineB: [{ x: 0.66, y: 0.04 }, { x: 0.55, y: 0.35 }, { x: 0.66, y: 0.94 }],
  },
  {
    familyName: 'Campo medio',
    lineA: [{ x: 0.42, y: 0.04 }, { x: 0.48, y: 0.44 }, { x: 0.40, y: 0.94 }],
    lineB: [{ x: 0.58, y: 0.04 }, { x: 0.52, y: 0.44 }, { x: 0.60, y: 0.94 }],
  },
]

function LensSearchAnimation({
  lensRim,
  searchFields,
}: {
  lensRim?: LensRimPoint[] | null
  searchFields?: LensSearchField[]
}) {
  const [activeStep, setActiveStep] = useState(0)
  const [activeFieldIndex, setActiveFieldIndex] = useState(0)
  const clipId = useId().replace(/:/g, '')
  const lensPath = useMemo(
    () => buildSmoothSvgPath(normalizeLensRimForAnimation(lensRim), 120, 78),
    [lensRim]
  )
  const normalizedFields = useMemo(() => {
    const source = searchFields && searchFields.length > 0 ? searchFields : FALLBACK_SEARCH_FIELDS
    return source
      .map((field) => {
        const lineA = normalizeLensLineForAnimation(field.lineA)
        const lineB = normalizeLensLineForAnimation(field.lineB)
        return {
          familyName: field.familyName,
          lineAPath: buildOpenSvgPath(lineA, 120, 78),
          lineBPath: buildOpenSvgPath(lineB, 120, 78),
          fieldPath: buildFieldSvgPath(lineA, lineB, 120, 78),
        }
      })
      .filter((field) => field.lineAPath && field.lineBPath && field.fieldPath)
  }, [searchFields])
  const activeField = normalizedFields[activeFieldIndex % Math.max(1, normalizedFields.length)] || null

  useEffect(() => {
    const interval = window.setInterval(() => {
      setActiveStep((current) => Math.min(current + 1, AI_SEARCH_STEPS.length - 1))
    }, 8000)

    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (normalizedFields.length <= 1) return undefined

    const interval = window.setInterval(() => {
      setActiveFieldIndex((current) => (current + 1) % normalizedFields.length)
    }, 110)

    return () => window.clearInterval(interval)
  }, [normalizedFields.length])

  return (
    <div
      className="mt-4 overflow-hidden rounded-2xl border border-fuchsia-500/20 bg-slate-950/50 p-4"
      role="status"
      aria-live="polite"
      aria-label="IA analisando lentes"
    >
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_230px] lg:items-center">
        <div className="relative h-36 overflow-hidden rounded-xl border border-white/10 bg-black/30">
          <svg className="lens-stage" viewBox="0 0 300 130" role="presentation" aria-hidden="true">
            <defs>
              <clipPath id={`${clipId}-od`}>
                <path d={lensPath} />
              </clipPath>
              <clipPath id={`${clipId}-oe`}>
                <path d={lensPath} transform="translate(120 0) scale(-1 1)" />
              </clipPath>
              <linearGradient id={`${clipId}-glass`} x1="0" x2="1" y1="0" y2="1">
                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.28" />
                <stop offset="48%" stopColor="#d946ef" stopOpacity="0.13" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0.92" />
              </linearGradient>
              <radialGradient id={`${clipId}-peripheral`} cx="50%" cy="50%" r="64%">
                <stop offset="0%" stopColor="#020617" stopOpacity="0" />
                <stop offset="54%" stopColor="#020617" stopOpacity="0.08" />
                <stop offset="100%" stopColor="#020617" stopOpacity="0.58" />
              </radialGradient>
              <linearGradient id={`${clipId}-scanshine`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="white" stopOpacity="0" />
                <stop offset="50%" stopColor="white" stopOpacity="0.22" />
                <stop offset="100%" stopColor="white" stopOpacity="0" />
              </linearGradient>
            </defs>

            <g transform="translate(25 26)">
              <path className="lens-shape" d={lensPath} fill={`url(#${clipId}-glass)`} />
              <g clipPath={`url(#${clipId}-od)`}>
                <rect className="lens-grid-svg" x="0" y="0" width="120" height="78" />
                <line className="scan-line-svg scan-line-a" x1="-18" y1="20" x2="138" y2="20" />
                <line className="scan-line-svg scan-line-b" x1="-18" y1="53" x2="138" y2="53" />
                <line className="scan-axis-svg scan-axis-a" x1="60" y1="-16" x2="60" y2="96" />
                {activeField && (
                  <g key={`od-${activeFieldIndex}`} className="vision-snapshot">
                    <path className="vision-field" d={activeField.fieldPath} />
                    <path className="vision-line" d={activeField.lineAPath} />
                    <path className="vision-line" d={activeField.lineBPath} />
                  </g>
                )}
                <rect className="peripheral-haze" x="0" y="0" width="120" height="78" fill={`url(#${clipId}-peripheral)`} />
                <rect className="scan-shine-svg" x="0" y="0" width="120" height="18" fill={`url(#${clipId}-scanshine)`} />
                {/* <circle className="target-svg target-a" cx="70" cy="36" r="3" /> */}
              </g>
              <path className="lens-edge" d={lensPath} />
            </g>

            <g transform="translate(155 26)">
              <path className="lens-shape" d={lensPath} transform="translate(120 0) scale(-1 1)" fill={`url(#${clipId}-glass)`} />
              <g clipPath={`url(#${clipId}-oe)`}>
                <rect className="lens-grid-svg" x="0" y="0" width="120" height="78" />
                <line className="scan-line-svg scan-line-a" x1="-18" y1="23" x2="138" y2="23" />
                <line className="scan-line-svg scan-line-b" x1="-18" y1="56" x2="138" y2="56" />
                <line className="scan-axis-svg scan-axis-b" x1="60" y1="-16" x2="60" y2="96" />
                {activeField && (
                  <g transform="translate(120 0) scale(-1 1)">
                    <g key={`oe-${activeFieldIndex}`} className="vision-snapshot">
                      <path className="vision-field vision-field-alt" d={activeField.fieldPath} />
                      <path className="vision-line" d={activeField.lineAPath} />
                      <path className="vision-line" d={activeField.lineBPath} />
                    </g>
                  </g>
                )}
                <rect className="peripheral-haze" x="0" y="0" width="120" height="78" fill={`url(#${clipId}-peripheral)`} />
                <rect className="scan-shine-svg" x="0" y="0" width="120" height="18" fill={`url(#${clipId}-scanshine)`} />
                {/* <circle className="target-svg target-b" cx="47" cy="44" r="3" /> */}
                {/* <circle className="target-svg target-c" cx="80" cy="54" r="3" /> */}
              </g>
              <path className="lens-edge" d={lensPath} transform="translate(120 0) scale(-1 1)" />
            </g>

            <g className="term-carousel" transform="translate(0 104)">
              {LENS_SCAN_TERMS.map((term, index) => (
                <text
                  key={term}
                  className="term-carousel-item"
                  x="150"
                  y="7"
                  style={{ animationDelay: `${index * 0.42}s` }}
                >
                  {term}
                </text>
              ))}
            </g>
          </svg>
        </div>

        <div>
          <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-200">
            <Sparkles className="h-3 w-3" />
            IA em analise
          </p>
          <div className="mt-3 space-y-2">
            {AI_SEARCH_STEPS.map((step, index) => (
              <div
                key={step}
                className={`flex items-center gap-2 text-xs font-bold transition-colors duration-300 ${
                  index < activeStep
                    ? 'text-cyan-200'
                    : index === activeStep
                      ? 'text-fuchsia-100'
                      : 'text-slate-500'
                }`}
              >
                <span
                  className={`step-dot ${
                    index < activeStep
                      ? 'step-dot-done'
                      : index === activeStep
                        ? 'step-dot-active'
                        : 'step-dot-idle'
                  }`}
                />
                <span>{step}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .lens-stage {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
          filter: drop-shadow(0 0 18px rgba(34, 211, 238, 0.16));
        }

        .lens-shape {
          opacity: 0.95;
        }

        .lens-edge {
          fill: none;
          stroke: rgba(125, 211, 252, 0.54);
          stroke-width: 1.8;
          vector-effect: non-scaling-stroke;
          filter: drop-shadow(0 0 8px rgba(34, 211, 238, 0.45));
        }

        .lens-grid-svg {
          fill: rgba(15, 23, 42, 0.24);
          stroke: rgba(34, 211, 238, 0.13);
          stroke-width: 8;
          stroke-dasharray: 1 10;
          animation: gridRush 0.55s linear infinite;
        }

        .scan-line-svg {
          stroke: rgba(34, 211, 238, 0.9);
          stroke-width: 1.4;
          filter: drop-shadow(0 0 5px rgba(34, 211, 238, 0.85));
          opacity: 0.75;
          transform-box: fill-box;
          transform-origin: center;
        }

        .scan-line-a {
          animation: scanFast 0.62s ease-in-out infinite;
        }

        .scan-line-b {
          animation: scanFast 0.48s ease-in-out infinite reverse;
        }

        .scan-axis-svg {
          stroke: rgba(217, 70, 239, 0.92);
          stroke-width: 1.35;
          filter: drop-shadow(0 0 5px rgba(217, 70, 239, 0.85));
          transform-box: fill-box;
          transform-origin: center;
          animation: axisSweep 0.86s ease-in-out infinite;
        }

        .scan-axis-b {
          animation-duration: 0.68s;
          animation-direction: reverse;
        }

        .vision-field {
          fill: rgba(34, 211, 238, 0.08);
          stroke: rgba(251, 191, 36, 0.28);
          stroke-width: 0.8;
          filter: drop-shadow(0 0 7px rgba(251, 191, 36, 0.18));
          opacity: 0.46;
        }

        .vision-field-alt {
          fill: rgba(217, 70, 239, 0.08);
        }

        .vision-line {
          fill: none;
          stroke: rgba(251, 191, 36, 0.82);
          stroke-width: 1.45;
          stroke-linecap: round;
          stroke-linejoin: round;
          vector-effect: non-scaling-stroke;
          filter: drop-shadow(0 0 5px rgba(251, 191, 36, 0.65));
        }

        .vision-snapshot {
          transform-box: fill-box;
          transform-origin: center;
          animation: geometryRead 110ms ease-out;
        }

        .peripheral-haze {
          mix-blend-mode: multiply;
          opacity: 0.74;
          animation: hazeBreath 13s ease-in-out infinite;
        }

        .target-svg {
          fill: #f0abfc;
          filter: drop-shadow(0 0 6px #d946ef);
          animation: targetJump 0.58s steps(4) infinite;
        }

        .term-carousel-item {
          fill: rgba(226, 232, 240, 0.88);
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.16em;
          text-anchor: middle;
          dominant-baseline: middle;
          opacity: 0;
          transform-box: fill-box;
          transform-origin: center;
          animation: termCylinder 2.52s linear infinite;
        }

        .target-b {
          animation-delay: -0.17s;
        }

        .target-c {
          animation-delay: -0.31s;
        }

        .step-dot {
          width: 8px;
          height: 8px;
          flex: 0 0 auto;
          border-radius: 999px;
          background: #22d3ee;
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.85);
        }

        .step-dot-active {
          background: #f0abfc;
          box-shadow: 0 0 16px rgba(217, 70, 239, 0.9);
          animation: stepBlink 1.1s ease-in-out infinite;
        }

        .step-dot-done {
          background: #22d3ee;
          box-shadow: 0 0 12px rgba(34, 211, 238, 0.7);
        }

        .step-dot-idle {
          background: rgba(100, 116, 139, 0.8);
          box-shadow: none;
        }

        @keyframes gridRush {
          from { stroke-dashoffset: 0; }
          to { stroke-dashoffset: 22; }
        }

        @keyframes scanFast {
          0% { transform: translateY(-32px) rotate(-10deg); opacity: 0; }
          20% { opacity: 1; }
          100% { transform: translateY(42px) rotate(13deg); opacity: 0; }
        }

        @keyframes axisSweep {
          0%, 100% { transform: rotate(-52deg); opacity: 0.15; }
          45% { transform: rotate(6deg); opacity: 1; }
          70% { transform: rotate(58deg); opacity: 0.65; }
        }

        @keyframes targetJump {
          0% { transform: translate(0, 0); opacity: 0.2; }
          25% { transform: translate(18px, 8px); opacity: 1; }
          50% { transform: translate(-12px, 22px); opacity: 0.55; }
          75% { transform: translate(22px, -12px); opacity: 1; }
          100% { transform: translate(0, 0); opacity: 0.2; }
        }

        @keyframes stepBlink {
          0%, 100% { transform: scale(0.75); opacity: 0.45; }
          50% { transform: scale(1.2); opacity: 1; }
        }

        @keyframes hazeBreath {
          0%, 100% { opacity: 0.82; }
          20% { opacity: 0.38; }
          42% { opacity: 0.68; }
          64% { opacity: 0.25; }
          82% { opacity: 0.74; }
        }

        @keyframes geometryRead {
          0% { opacity: 0.08; transform: scale(0.985); }
          22% { opacity: 1; transform: scale(1); }
          100% { opacity: 0.78; transform: scale(1); }
        }

        .scan-shine-svg {
          animation: scanShine 3s linear infinite alternate;
        }

        @keyframes scanShine {
          0%   { transform: translateY(0px); }
          100% { transform: translateY(60px); }
        }

        @keyframes termCylinder {
          0% { opacity: 0; transform: translateY(12px) scaleY(0.55); }
          8% { opacity: 0.35; transform: translateY(7px) scaleY(0.78); }
          17% { opacity: 1; transform: translateY(0) scaleY(1); }
          28% { opacity: 0.35; transform: translateY(-7px) scaleY(0.78); }
          38%, 100% { opacity: 0; transform: translateY(-12px) scaleY(0.55); }
        }

        @media (prefers-reduced-motion: reduce) {
          .lens-grid-svg,
          .scan-line-svg,
          .scan-axis-svg,
          .vision-snapshot,
          .peripheral-haze,
          .term-carousel-item,
          .target-svg,
          .step-dot {
            animation-duration: 2.4s;
          }
        }
      `}</style>
    </div>
  )
}

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
    patientNameRaw: 'Lia Martins (Miopia Infantil Complexa)',
    ageYears: '9',
    estiloVidaUsoComputadorHoras: '0',
    estiloVidaDirigirHoras: '0',
    estiloVidaLeituraHoras: '2',
    estiloVidaUsoCelularHoras: '3',
    estiloVidaExposicaoSolHoras: '5',
    estiloVidaAmbienteInternoHoras: '5',
    estiloVidaAmbienteExternoHoras: '5',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'resistencia',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: '800_2000',
    budgetTarget: '1500',
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
    observacoesConsultor: 'Crianca pratica esportes na escola, fica muito ao ar livre e os pais relatam aumento do grau em menos de um ano. Testa prioridade clinica de controle de miopia mesmo sem foto/blue completo.',
    receitaLongeOdEsferico: '-5,25',
    receitaLongeOdCilindrico: '-1,75',
    receitaLongeOdEixo: '180',
    receitaLongeOeEsferico: '-5,00',
    receitaLongeOeCilindrico: '-1,50',
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
    patientNameRaw: 'Caio Andrade (Alto Grau Ativo)',
    ageYears: '31',
    estiloVidaUsoComputadorHoras: '7',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '5',
    estiloVidaExposicaoSolHoras: '3',
    estiloVidaAmbienteInternoHoras: '9',
    estiloVidaAmbienteExternoHoras: '3',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'uma',
    prioridadePrincipal: 'equilibrio',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'trocar_marca',
    faixaOrcamento: '2000_5000',
    budgetTarget: '2800',
    importanciaEstetica: 'alta',
    importanciaResistencia: 'alta',
    prefereTransitions: 'sim',
    prefereBlueUv: 'nao',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'sim',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Cliente usa armacao grande, joga futebol nos fins de semana e queixa lente grossa. Testa conflito entre alto indice, resistencia, fotossensivel e direcao noturna.',
    receitaLongeOdEsferico: '-7,25',
    receitaLongeOdCilindrico: '-2,00',
    receitaLongeOdEixo: '15',
    receitaLongeOeEsferico: '-6,75',
    receitaLongeOeCilindrico: '-1,75',
    receitaLongeOeEixo: '165',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '32',
    medidaDnpOe: '32',
    medidaAlturaOd: '20',
    medidaAlturaOe: '20'
  },
  roberto: {
    patientNameRaw: 'Helena Duarte (Executiva Orcamento Apertado)',
    ageYears: '54',
    estiloVidaUsoComputadorHoras: '10',
    estiloVidaDirigirHoras: '3',
    estiloVidaLeituraHoras: '3',
    estiloVidaUsoCelularHoras: '4',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '12',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Varilux antiga',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'media',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'equilibrio',
    principalIncomodoAtual: 'longe_perto',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: '800_2000',
    budgetTarget: '1800',
    importanciaEstetica: 'media',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Executiva com muita tela e reunioes, dirige a noite e reclama de reflexos no multifocal antigo. Quer blue/UV, mas nao aceita premium e tem alvo baixo.',
    receitaLongeOdEsferico: '+1,25',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '100',
    receitaLongeOeEsferico: '+1,00',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '80',
    receitaAdicao: '2,25',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '18',
    medidaAlturaOe: '18'
  },
  baixoGrauEconomico: {
    patientNameRaw: 'Bruno Lima (Baixo Grau Economico)',
    ageYears: '28',
    estiloVidaUsoComputadorHoras: '3',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '3',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '9',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'preco',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'primeiro_oculos',
    faixaOrcamento: 'ate_800',
    budgetTarget: '600',
    importanciaEstetica: 'baixa',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'nao',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Cliente de baixo grau, sem queixas especiais, quer gastar pouco. Testa se o motor evita alto indice, AR premium e tecnologias caras sem necessidade.',
    receitaLongeOdEsferico: '-1,00',
    receitaLongeOdCilindrico: '-0,25',
    receitaLongeOdEixo: '180',
    receitaLongeOeEsferico: '-0,75',
    receitaLongeOeCilindrico: '-0,25',
    receitaLongeOeEixo: '170',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '18',
    medidaAlturaOe: '18'
  },
  presbitaPremium: {
    patientNameRaw: 'Renata Costa (Presbita Premium Adaptavel)',
    ageYears: '58',
    estiloVidaUsoComputadorHoras: '4',
    estiloVidaDirigirHoras: '4',
    estiloVidaLeituraHoras: '3',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '2',
    estiloVidaAmbienteInternoHoras: '8',
    estiloVidaAmbienteExternoHoras: '2',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Multifocal atual',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'baixa',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'premium',
    principalIncomodoAtual: 'longe_perto',
    objetivoCompra: 'melhorar_conforto',
    faixaOrcamento: 'acima_5000',
    budgetTarget: '5800',
    importanciaEstetica: 'media',
    importanciaResistencia: 'media',
    prefereTransitions: 'sim',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Paciente usa multifocal sem dificuldade importante e quer melhorar conforto, campos e direcao. Testa se o motor sobe design multifocal premium quando o orcamento permite.',
    receitaLongeOdEsferico: '+1,75',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+1,50',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '85',
    receitaAdicao: '2,50',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '20',
    medidaAlturaOe: '20'
  },
  primeiraMultifocal: {
    patientNameRaw: 'Marina Alves (Primeira Multifocal Medrosa)',
    ageYears: '44',
    estiloVidaUsoComputadorHoras: '8',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '2',
    estiloVidaUsoCelularHoras: '4',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '11',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'alta',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'adaptacao',
    principalIncomodoAtual: 'perto',
    objetivoCompra: 'primeira_multifocal',
    faixaOrcamento: '800_2000',
    budgetTarget: '1600',
    importanciaEstetica: 'media',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Primeira experiencia com adicao baixa, muito receio de adaptacao e rotina forte de telas. Testa se o motor evita supervender progressivo complexo quando anti-fadiga ou entrada pode resolver.',
    receitaLongeOdEsferico: '+0,25',
    receitaLongeOdCilindrico: '-0,50',
    receitaLongeOdEixo: '100',
    receitaLongeOeEsferico: '+0,25',
    receitaLongeOeCilindrico: '-0,25',
    receitaLongeOeEixo: '90',
    receitaAdicao: '1,00',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '18',
    medidaAlturaOe: '18'
  },
  solarOutdoor: {
    patientNameRaw: 'Sergio Prado (Solar Outdoor)',
    ageYears: '36',
    estiloVidaUsoComputadorHoras: '1',
    estiloVidaDirigirHoras: '3',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '7',
    estiloVidaAmbienteInternoHoras: '3',
    estiloVidaAmbienteExternoHoras: '7',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'sol',
    principalIncomodoAtual: 'luz',
    objetivoCompra: 'oculos_sol_grau',
    faixaOrcamento: '800_2000',
    budgetTarget: '1700',
    importanciaEstetica: 'media',
    importanciaResistencia: 'media',
    prefereTransitions: 'sim',
    prefereBlueUv: 'nao',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Cliente trabalha ao ar livre e dirige de dia. Quer conforto no sol, escurecimento ou sol grau. Testa se o motor diferencia solar/outdoor de conforto digital.',
    receitaLongeOdEsferico: '-2,00',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '10',
    receitaLongeOeEsferico: '-1,75',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '170',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '32',
    medidaDnpOe: '32',
    medidaAlturaOd: '19',
    medidaAlturaOe: '19'
  },
  altaMiopiaBaixoOrcamento: {
    patientNameRaw: 'Tiago Nunes (Alta Miopia Orcamento Baixo)',
    ageYears: '34',
    estiloVidaUsoComputadorHoras: '5',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '4',
    estiloVidaExposicaoSolHoras: '2',
    estiloVidaAmbienteInternoHoras: '9',
    estiloVidaAmbienteExternoHoras: '2',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'uma',
    prioridadePrincipal: 'preco',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: '800_2000',
    budgetTarget: '1600',
    importanciaEstetica: 'alta',
    importanciaResistencia: 'media',
    prefereTransitions: 'sim',
    prefereBlueUv: 'nao',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Alta miopia com queixa de lente grossa, mas cliente tem orcamento baixo e nao aceita premium. Testa se o motor explica limitacao e escolhe melhor compromisso sem prometer 1.74 completo.',
    receitaLongeOdEsferico: '-8,00',
    receitaLongeOdCilindrico: '-1,50',
    receitaLongeOdEixo: '20',
    receitaLongeOeEsferico: '-7,50',
    receitaLongeOeCilindrico: '-1,25',
    receitaLongeOeEixo: '160',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '32',
    medidaDnpOe: '32',
    medidaAlturaOd: '19',
    medidaAlturaOe: '19'
  },
  ocupacionalVerdadeiro: {
    patientNameRaw: 'Otavio Rocha (Ocupacional Verdadeiro)',
    ageYears: '47',
    estiloVidaUsoComputadorHoras: '10',
    estiloVidaDirigirHoras: '0',
    estiloVidaLeituraHoras: '4',
    estiloVidaUsoCelularHoras: '3',
    estiloVidaExposicaoSolHoras: '0',
    estiloVidaAmbienteInternoHoras: '12',
    estiloVidaAmbienteExternoHoras: '0',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'conforto_digital',
    principalIncomodoAtual: 'perto',
    objetivoCompra: 'oculos_escritorio',
    faixaOrcamento: '800_2000',
    budgetTarget: '1600',
    importanciaEstetica: 'baixa',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Paciente trabalha o dia inteiro em computador, quase nao dirige e quer conforto para escritorio/perto/intermediario. Testa se o motor sobe ocupacional verdadeiro quando longe plena nao e prioridade.',
    receitaLongeOdEsferico: '+0,50',
    receitaLongeOdCilindrico: '-0,50',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+0,25',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '85',
    receitaAdicao: '1,50',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '18',
    medidaAlturaOe: '18'
  },
  fotossensivelPrioritario: {
    patientNameRaw: 'Fabio Menezes (Fotossensivel Prioritario)',
    ageYears: '39',
    estiloVidaUsoComputadorHoras: '2',
    estiloVidaDirigirHoras: '2',
    estiloVidaLeituraHoras: '1',
    estiloVidaUsoCelularHoras: '3',
    estiloVidaExposicaoSolHoras: '6',
    estiloVidaAmbienteInternoHoras: '5',
    estiloVidaAmbienteExternoHoras: '6',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'sol',
    principalIncomodoAtual: 'luz',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: '800_2000',
    budgetTarget: '1500',
    importanciaEstetica: 'media',
    importanciaResistencia: 'media',
    prefereTransitions: 'sim',
    prefereBlueUv: 'nao',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Cliente sente muito incomodo com sol e quer uma lente que escureca automaticamente, mas nao pediu oculos de sol dedicado. Testa se o motor diferencia fotossensivel prioritario de sol grau fixo e de conforto digital.',
    receitaLongeOdEsferico: '-2,75',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '10',
    receitaLongeOeEsferico: '-2,50',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '170',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '32',
    medidaDnpOe: '32',
    medidaAlturaOd: '19',
    medidaAlturaOe: '19'
  },
  adaptacaoMultifocalDificil: {
    patientNameRaw: 'Marta Pires (Adaptacao Multifocal Dificil)',
    ageYears: '57',
    estiloVidaUsoComputadorHoras: '4',
    estiloVidaDirigirHoras: '2',
    estiloVidaLeituraHoras: '3',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '9',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Multifocal antigo',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'alta',
    historicoTrocasRecentes: 'uma',
    prioridadePrincipal: 'adaptacao',
    principalIncomodoAtual: 'longe_perto',
    objetivoCompra: 'melhorar_conforto',
    faixaOrcamento: 'acima_5000',
    budgetTarget: '6200',
    importanciaEstetica: 'media',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'nao',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Paciente teve adaptacao ruim em multifocal anterior, mas aceita investir. Testa se o motor prioriza design, campos e adaptacao antes de adicionar features nao solicitadas.',
    receitaLongeOdEsferico: '+1,50',
    receitaLongeOdCilindrico: '-0,75',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+1,25',
    receitaLongeOeCilindrico: '-0,50',
    receitaLongeOeEixo: '85',
    receitaAdicao: '2,25',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '20',
    medidaAlturaOe: '20'
  },
  hipermetropiaAltaEstetica: {
    patientNameRaw: 'Claudio Reis (Hipermetropia Alta Estetica)',
    ageYears: '42',
    estiloVidaUsoComputadorHoras: '6',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '2',
    estiloVidaUsoCelularHoras: '4',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '9',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '1',
    marcaAtual: 'Nenhuma',
    tipoLenteAtual: 'visao_simples',
    usaMultifocalHoje: 'nao',
    dificuldadeAdaptacao: 'nao_informado',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'estetica',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: '2000_5000',
    budgetTarget: '3200',
    importanciaEstetica: 'alta',
    importanciaResistencia: 'media',
    prefereTransitions: 'nao',
    prefereBlueUv: 'nao',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Alta hipermetropia com queixa de lente grossa no centro e aumento dos olhos. Testa se o motor aplica logica de alto grau tambem para positivo, sem depender apenas de miopia.',
    receitaLongeOdEsferico: '+5,75',
    receitaLongeOdCilindrico: '-1,00',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+5,50',
    receitaLongeOeCilindrico: '-0,75',
    receitaLongeOeEixo: '85',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '32',
    medidaDnpOe: '32',
    medidaAlturaOd: '19',
    medidaAlturaOe: '19'
  },
  add400Disponibilidade: {
    patientNameRaw: 'Dora Almeida (ADD +4 Disponibilidade)',
    ageYears: '66',
    estiloVidaUsoComputadorHoras: '2',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '5',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '10',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Multifocal atual',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'media',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'adaptacao',
    principalIncomodoAtual: 'perto',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: 'acima_5000',
    budgetTarget: '6500',
    importanciaEstetica: 'media',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'nao',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Paciente precisa de multifocal com adicao +4.00. Testa disponibilidade de grade: ofertas com add_max menor que +4.00 nao podem aparecer.',
    receitaLongeOdEsferico: '+2,00',
    receitaLongeOdCilindrico: '-1,00',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+1,75',
    receitaLongeOeCilindrico: '-0,75',
    receitaLongeOeEixo: '85',
    receitaAdicao: '4,00',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '31',
    medidaDnpOe: '31',
    medidaAlturaOd: '20',
    medidaAlturaOe: '20'
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
  const sourcePart = option.sourceLaboratorio ? ` Â· ${option.sourceLaboratorio}` : ''
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
      return 'visÃ£o simples'
    default:
      return 'categoria compatÃ­vel'
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
      ? `Escolhi esta como a melhor opÃ§Ã£o porque ela atende mais diretamente ao caso em ${mainReasons.join(' e ').toLowerCase()}.`
      : `Escolhi esta como a melhor opÃ§Ã£o porque ela ficou mais coerente com a necessidade principal do caso.`

    return [intro, supportText].filter(Boolean).join(' ')
  }

  if (index === 1) {
    const intro = mainReasons.length
      ? `Esta continua muito forte para o caso, principalmente por ${mainReasons.join(' e ').toLowerCase()}.`
      : `Esta continua muito coerente com a necessidade principal e funciona como segunda opÃ§Ã£o segura.`

    const priceHint =
      referenceOption && option.finalPrice !== referenceOption.finalPrice
        ? option.finalPrice > referenceOption.finalPrice
          ? `Ela sobe um pouco o investimento para buscar outra configuraÃ§Ã£o dentro da mesma direÃ§Ã£o clÃ­nica.`
          : `Ela reduz um pouco o investimento sem sair da mesma direÃ§Ã£o clÃ­nica.`
        : ''

    return [intro, priceHint, supportText].filter(Boolean).join(' ')
  }

  const topCategory = referenceOption ? getClinicalCategoryLabel(referenceOption.clinicalCategory) : null
  const categoryShift =
    referenceOption && option.clinicalCategory !== referenceOption.clinicalCategory
      ? `Ela nÃ£o cobre de forma tÃ£o direta a necessidade principal de ${topCategory}, mas entra como alternativa plausÃ­vel se a conversa pender para ${categoryLabel}.`
      : `Ela abre uma alternativa comercial sem fugir totalmente do raciocÃ­nio principal do caso.`

  let priceTradeoff = ''
  if (referenceOption) {
    if (option.finalPrice < referenceOption.finalPrice) {
      priceTradeoff = `Aqui existe uma troca em favor de preÃ§o, ficando em ${priceFormatter.format(option.finalPrice)}.`
    } else if (option.finalPrice > referenceOption.finalPrice) {
      priceTradeoff = `Aqui existe uma troca em favor de outra proposta de valor, subindo para ${priceFormatter.format(option.finalPrice)}.`
    }
  }

  const whyWorthItParts: string[] = []
  if (hasResistance) whyWorthItParts.push('maior resistÃªncia')
  if (hasThinness) whyWorthItParts.push('lente mais fina/estÃ©tica')
  if (hasTransitions) whyWorthItParts.push('fotossensÃ­vel para conforto no sol')
  if (hasBlueUv) whyWorthItParts.push('proteÃ§Ã£o de luz azul')
  if (hasAntirreflexo) whyWorthItParts.push('antirreflexo de melhor qualidade')
  const whyWorthIt = whyWorthItParts.length
    ? `Ela vale o investimento adicional por ${whyWorthItParts.join(', ')}.`
    : ''

  const reasonWrap = mainReasons.length
    ? `Eu a mantive porque ainda entrega ${mainReasons.join(' e ').toLowerCase()}.`
    : ''

  return [categoryShift, priceTradeoff, whyWorthIt, reasonWrap, supportText].filter(Boolean).join(' ')
}

const getSalesAssistOptionText = (
  option: RecommendationOption,
  salesAssist: LensSalesAssist | null,
) => {
  const argument = salesAssist?.options.find((item) => item.configKey === option.configKey)
  if (!argument) return null

  return [
    argument.headline,
    argument.sellerArgument || argument.whyThisLens,
    argument.tradeoff ? `Trade-off: ${argument.tradeoff}` : null,
    argument.closingLine,
  ].filter(Boolean).join('\n\n')
}

const buildSellerVisibleOptionNarrative = (
  option: RecommendationOption,
  index: number,
  referenceOption: RecommendationOption | null,
  salesAssist: LensSalesAssist | null,
) => {
  return getSalesAssistOptionText(option, salesAssist) || buildAiOptionNarrative(option, index, referenceOption)
}

function buildPatientAuditContext(
  form: ReturnType<typeof createEmptyForm>,
  aiCaseInput: ReturnType<typeof inferRecommendationCaseInput>
): PatientAuditContext {
  const n = (v: string) => { const p = parseFloat(v.replace(',', '.')); return isNaN(p) ? null : p }
  return {
    age: aiCaseInput.idade ?? null,
    esferico: aiCaseInput.esferico,
    cilindrico: aiCaseInput.cilindrico,
    adicao: aiCaseInput.adicao ?? null,
    horasComputador: n(form.estiloVidaUsoComputadorHoras),
    horasDirigir: n(form.estiloVidaDirigirHoras),
    horasLeitura: n(form.estiloVidaLeituraHoras),
    horasCelular: n(form.estiloVidaUsoCelularHoras),
    horasSol: n(form.estiloVidaExposicaoSolHoras),
    horasTv: n(form.estiloVidaAssistirTvHoras),
    marcaAtual: form.marcaAtual.trim() || null,
    tipoLenteAtual: form.tipoLenteAtual || null,
    usaMultifocalHoje: form.usaMultifocalHoje || null,
    historicoTrocasRecentes: form.historicoTrocasRecentes || null,
    dificuldadeAdaptacao: form.dificuldadeAdaptacao !== 'nao_informado' ? form.dificuldadeAdaptacao : null,
    queixaDirigirNoite: form.queixaDirigirNoite === 'sim',
    queixaSensibilidadeLuz: form.queixaSensibilidadeLuz === 'sim',
    queixaQuebraOculos: form.queixaQuebraOculos === 'sim',
    queixaProgressaoRapida: form.queixaProgressaoRapida === 'sim',
    queixaCriancaAtiva: form.queixaCriancaAtiva === 'sim',
    principalIncomodoAtual: form.principalIncomodoAtual !== 'nao_informado' ? form.principalIncomodoAtual : null,
    prioridadePrincipal: form.prioridadePrincipal !== 'nao_informado' ? form.prioridadePrincipal : null,
    objetivoCompra: form.objetivoCompra !== 'nao_informado' ? form.objetivoCompra : null,
    faixaOrcamento: form.faixaOrcamento !== 'nao_informado' ? form.faixaOrcamento : null,
    targetPrice: aiCaseInput.targetPrice ?? null,
    aceitaPremium: form.aceitaPremium !== 'nao_informado' ? form.aceitaPremium : null,
    importanciaEstetica: form.importanciaEstetica !== 'nao_informado' ? form.importanciaEstetica : null,
    importanciaResistencia: form.importanciaResistencia !== 'nao_informado' ? form.importanciaResistencia : null,
    prefereTransitions: form.prefereTransitions !== 'nao_informado' ? form.prefereTransitions : null,
    prefereBlueUv: form.prefereBlueUv !== 'nao_informado' ? form.prefereBlueUv : null,
    observacoesConsultor: form.observacoesConsultor.trim() || null,
  }
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

  const topLabel = topOption ? buildAiRecommendationLabel(topOption) : 'a configuraÃ§Ã£o principal'
  const topPrice = topOption ? priceFormatter.format(topOption.finalPrice) : null
  const altIsDifferent = alternativeOption && alternativeOption.configKey !== topOption?.configKey
  const altLabel = altIsDifferent ? buildAiRecommendationLabel(alternativeOption) : null
  const altPrice = altIsDifferent ? priceFormatter.format(alternativeOption!.finalPrice) : null
  const labName =
    activeCatalog?.laboratorio ||
    (activeCatalogs && activeCatalogs.length
      ? activeCatalogs.map((catalog) => catalog.laboratorio).join(' + ')
      : 'os catÃ¡logos ativos da loja')

  if (intent === 'pesquisar') {
    return `Sem problema. Antes de sair para pesquisar, vale te mostrar por que eu separei ${topLabel}${topPrice ? ` por ${topPrice}` : ''}: ela conversa diretamente com o que vocÃª me contou e jÃ¡ estÃ¡ dentro do que temos hoje em ${labName}. Se quiser, eu tambÃ©m posso te mostrar agora uma segunda comparaÃ§Ã£o lado a lado${altLabel ? `, incluindo ${altLabel}${altPrice ? ` por ${altPrice}` : ''}` : ''}, para vocÃª decidir com mais seguranÃ§a sem precisar ir embora na dÃºvida.`
  }

  if (intent === 'pensar') {
    return `Claro, vocÃª pode pensar com calma. Antes disso, deixa eu te resumir em uma frase: a opÃ§Ã£o que fez mais sentido para o seu caso foi ${topLabel}${topPrice ? ` por ${topPrice}` : ''} porque ela resolve melhor a necessidade principal sem eu te empurrar algo aleatÃ³rio. Se preferir, eu tambÃ©m posso te deixar uma alternativa mais equilibrada${altLabel ? `, como ${altLabel}${altPrice ? ` por ${altPrice}` : ''}` : ''}, para vocÃª comparar com tranquilidade.`
  }

  if (intent === 'armacoes') {
    return `Sem problema com a armaÃ§Ã£o, isso a gente consegue contornar aqui na loja. O importante Ã© que a lente indicada para o seu caso continua sendo ${topLabel}${topPrice ? ` por ${topPrice}` : ''}; a armaÃ§Ã£o eu posso trocar por outro estilo sem perder essa base tÃ©cnica. Se quiser, eu jÃ¡ separo outras opÃ§Ãµes de armaÃ§Ã£o com perfil diferente e mantenho a lente que realmente faz sentido para vocÃª.`
  }

  return `Entendo. Se vocÃª encontrou preÃ§o melhor na concorrÃªncia, vale comparar nÃ£o sÃ³ o valor, mas o que estÃ¡ entrando na configuraÃ§Ã£o. Eu cheguei em ${topLabel}${topPrice ? ` por ${topPrice}` : ''} porque ela conversa melhor com o seu caso dentro do que temos hoje em ${labName}. Se a questÃ£o for orÃ§amento, eu consigo te mostrar uma alternativa mais defensÃ¡vel sem desmontar a recomendaÃ§Ã£o${altLabel ? `, como ${altLabel}${altPrice ? ` por ${altPrice}` : ''}` : ''}, para vocÃª comparar preÃ§o com mais justiÃ§a.`
}

const buildAiOptionDetails = (option: RecommendationOption) => {
  const supportText = option.treatmentExplainWhy || option.commercialSummary || option.recommendationNotes || ''
  const reasons = getUniqueHumanizedReasons(option.reasons, 4)

  return [
    supportText ? `Contexto da configuraÃ§Ã£o:\n${supportText}` : '',
    reasons.length ? `CritÃ©rios considerados:\n${reasons.map((reason) => `â€¢ ${reason}`).join('\n')}` : ''
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
        aria-label="Ver detalhes da recomendaÃ§Ã£o"
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
    indice_alto_pouco_ganho: 'Ãndice alto com ganho mÃ­nimo para este grau',
    indice_baixo_grau_alto: 'Ãndice baixo para um grau que pede lente mais fina',
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
  if (reason === 'opcao:alternativa_plausivel') return 'Alternativa plausÃ­vel para ampliar a conversa'
  if (reason === 'opcao:salto_preco_controlado') return 'Alternativa com salto de preÃ§o controlado'
  if (reason === 'material:indice_alto_pouco_ganho') return 'Ãndice alto com ganho pequeno neste grau'
  if (reason === 'material:indice_baixo_grau_alto') return 'Ãndice baixo para grau alto'

  if (type === 'categoria' && rawValue === 'controle_miopia') {
    return 'Categoria clÃ­nica de controle de miopia'
  }
  if ((type === 'beneficio' || type === 'uso') && rawValue === 'controle_miopia') {
    return 'Sinal de progressÃ£o rÃ¡pida do grau'
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
    return 'A IA chegou a uma direÃ§Ã£o muito parecida com a sugestÃ£o do iVision. A diferenÃ§a estÃ¡ mais na configuraÃ§Ã£o comercial, no tratamento ou no preÃ§o final do que no desenho principal da lente.'
  }

  if (level === 'parcial') {
    return `A IA manteve a mesma direÃ§Ã£o clÃ­nica geral do iVision, mas ajustou a configuraÃ§Ã£o para refletir melhor o caso atual em preÃ§o final, tratamento e conforto de uso. ${humanReasons ? `Ela priorizou especialmente: ${humanReasons}.` : ''}`.trim()
  }

  return `A IA considerou sinais adicionais do caso, como rotina, adaptaÃ§Ã£o, faixa de preÃ§o e features desejadas, e por isso priorizou uma combinaÃ§Ã£o diferente da sugerida pelo iVision. ${humanReasons ? `Os critÃ©rios mais fortes foram: ${humanReasons}.` : ''}`.trim()
}

const inferRecommendationCaseInput = (form: ReturnType<typeof createEmptyForm>): RecommendationCaseInput => {
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
    objetivoTags.push('adaptacao_critica')
  }

  // HistÃ³rico de trocas com dificuldade alta = caso crÃ­tico de adaptaÃ§Ã£o
  const historicoComFalha = ['uma', 'duas', 'mais_de_duas'].includes(form.historicoTrocasRecentes)
  if (form.dificuldadeAdaptacao === 'alta' && historicoComFalha) {
    desiredBenefits.push('adaptacao_rapida', 'conforto_visual')
    objetivoTags.push('adaptacao_critica')
    rotinaTags.push('adaptacao_critica')
  }

  if (form.queixaDirigirNoite === 'sim') {
    rotinaTags.push('dirigir_noite')
  }

  if (form.queixaSensibilidadeLuz === 'sim') {
    desiredBenefits.push('conforto_luz')
    // sÃ³ sugere transitions se o paciente nÃ£o recusou explicitamente
    if (form.prefereTransitions !== 'nao') {
      preferredFeatures.push('transitions')
    }
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

  if (
    parseNullableNumber(form.receitaAdicao) !== null &&
    (form.usaMultifocalHoje === 'nao' || form.objetivoCompra === 'primeira_multifocal')
  ) {
    objetivoTags.push('primeira_multifocal')
    desiredBenefits.push('adaptacao_rapida', 'conforto_visual')
  }

  const targetBudget = parseNullableNumber(form.budgetTarget)

  let budgetMode: 'economico' | 'intermediario' | 'premium' = 'intermediario'
  if (targetBudget !== null) {
    if (targetBudget <= 2000) budgetMode = 'economico'
    else if (targetBudget > 5000) budgetMode = 'premium'
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

  if (form.objetivoCompra === 'ocupacional_escritorio') {
    objetivoTags.push('ocupacional')
    desiredBenefits.push('conforto_visual', 'conforto_digital')
  }

  if (form.importanciaResistencia === 'alta') {
    desiredBenefits.push('resistencia')
  }

  if (form.importanciaEstetica === 'alta') {
    desiredBenefits.push('estetica', 'lente_fina')
  }

  if (form.aceitaPremium === 'sim') {
    desiredBenefits.push('qualidade_optica')
    if (budgetMode === 'intermediario') {
      budgetMode = 'premium'
    }
  } else if (form.aceitaPremium === 'nao') {
    objetivoTags.push('premium_recusado')
  }

  if (form.principalIncomodoAtual === 'peso_espessura') {
    desiredBenefits.push('lente_fina', 'estetica')
  }

  if (form.principalIncomodoAtual === 'reflexo') {
    desiredBenefits.push('antirreflexo', 'conforto_visual')
  }

  const budgetExplicit = targetBudget !== null

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
    rejected_features: [
      ...(form.prefereTransitions === 'nao' ? ['transitions'] : []),
      ...(form.prefereBlueUv === 'nao' ? ['blue_uv'] : []),
    ],
    adaptation_difficulty:
      form.dificuldadeAdaptacao === 'nao_informado'
        ? null
        : form.dificuldadeAdaptacao as RecommendationCaseInput['adaptation_difficulty'],
    notes: [form.sourceExamType, form.observacoesConsultor.trim()].filter(Boolean).join(' | ') || null
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
  activeCatalogs = [],
  lensSearchRim = null,
  lensSearchFields = []
}: {
  activeCatalog: ActiveCatalogContext
  activeCatalogs?: ActiveCatalogSummary[]
  lensSearchRim?: LensRimPoint[] | null
  lensSearchFields?: LensSearchField[]
}) {
  const params = useParams()
  const router = useRouter()
  const storeId = parseInt(params.storeId as string, 10)
  const { preference } = useBackgroundPreference()

  const [query, setQuery] = useState('')
  const [customerResults, setCustomerResults] = useState<CustomerSearchResult[]>([])
  const [allRecentEvaluations, setAllRecentEvaluations] = useState<OpticalEvaluationListItem[]>([])
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
  const [dependentes, setDependentes] = useState<Dependente[]>([])
  const [selectedSubjectType, setSelectedSubjectType] = useState<SubjectType | null>(null)
  const [selectedDependenteId, setSelectedDependenteId] = useState<string>('')
  const [history, setHistory] = useState<OpticalEvaluationListItem[]>([])
  const [form, setForm] = useState(createEmptyForm())
  const [evaluationId, setEvaluationId] = useState<number | null>(null)
  const evaluationIdRef = useRef<number | null>(null)
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
  const [lensTechnicalTriage, setLensTechnicalTriage] = useState<LensTechnicalTriage | null>(null)
  const [lensAudit, setLensAudit] = useState<string | null>(null)
  const [lensAuditPayload, setLensAuditPayload] = useState<Record<string, unknown> | null>(null)
  const [lensSalesAssist, setLensSalesAssist] = useState<LensSalesAssist | null>(null)
  const [isGeneratingAudit, setIsGeneratingAudit] = useState(false)
  const [isGeneratingSalesAssist, setIsGeneratingSalesAssist] = useState(false)
  const [copiedDebugBox, setCopiedDebugBox] = useState<'audit' | 'payload' | 'triage' | null>(null)
  const [quickRetentionReply, setQuickRetentionReply] = useState<string | null>(null)
  const [ivisionReferenceSuggestion, setIvisionReferenceSuggestion] = useState<string | null>(null)
  const [ivisionReferenceSummary, setIvisionReferenceSummary] = useState<string | null>(null)

  const selectedDependente = useMemo(
    () => dependentes.find((dep) => dep.id === Number(selectedDependenteId)) || null,
    [dependentes, selectedDependenteId]
  )

  useEffect(() => {
    evaluationIdRef.current = evaluationId
  }, [evaluationId])

  const setCurrentEvaluationId = (id: number | null) => {
    evaluationIdRef.current = id
    setEvaluationId(id)
  }

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
      getRecentEvaluationsForStore(storeId, 30).then(all => {
        setAllRecentEvaluations(all)
        setIsLoadingDashboard(false)
      })
    }
  }, [authenticatedEmployee, selectedCustomer, query.length, storeId])

  // Auto-derive usaMultifocalHoje from tipoLenteAtual; reset adaptation fields when not applicable
  useEffect(() => {
    const derived =
      form.tipoLenteAtual === 'multifocal' || form.tipoLenteAtual === 'bifocal' ? 'sim'
      : form.tipoLenteAtual === 'nao_informado' ? 'nao_informado'
      : 'nao'
    const used = form.tipoLenteAtual === 'multifocal' || form.tipoLenteAtual === 'bifocal'
    setForm(prev => {
      const updates: Partial<ReturnType<typeof createEmptyForm>> = {}
      if (prev.usaMultifocalHoje !== derived) updates.usaMultifocalHoje = derived
      if (!used && prev.dificuldadeAdaptacao !== 'nao_informado') updates.dificuldadeAdaptacao = 'nao_informado'
      if (!used && prev.historicoTrocasRecentes !== 'nao_informado') updates.historicoTrocasRecentes = 'nao_informado'
      return Object.keys(updates).length ? { ...prev, ...updates } : prev
    })
  }, [form.tipoLenteAtual])

  // Reset child-only fields when patient is not a child
  useEffect(() => {
    const age = parseNullableInteger(form.ageYears)
    const childNow = age !== null && age <= 14
    if (!childNow) {
      setForm(prev => {
        if (prev.queixaCriancaAtiva === 'nao' && prev.queixaProgressaoRapida === 'nao') return prev
        return { ...prev, queixaCriancaAtiva: 'nao', queixaProgressaoRapida: 'nao' }
      })
    }
  }, [form.ageYears])

  const clearSubject = () => {
    setSelectedCustomer(null)
    setDependentes([])
    setSelectedDependenteId('')
    setSelectedSubjectType(null)
    setQuery('')
    setCustomerResults([])
    setHistory([])
    setForm(createEmptyForm())
    setCurrentEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
    setAiState(null)
    setAiRecommendations([])
    setAiFeedback(null)
    setAiConversationInput('')
    setLensTechnicalTriage(null)
    setLensAudit(null)
    setLensAuditPayload(null)
    setLensSalesAssist(null)
    setIsGeneratingSalesAssist(false)
    setIsGeneratingAudit(false)
    setIsGeneratingSalesAssist(false)
    setIvisionReferenceSuggestion(null)
    setIvisionReferenceSummary(null)
    setFormError(null)
    setFeedback(null)
  }

  
  const handleSelectEvaluation = (ev: OpticalEvaluationListItem) => {
    // Restaurar estado da avaliaÃ§Ã£o
    setCurrentEvaluationId(ev.id)
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
    setAllRecentEvaluations((prev) => prev.filter((ev) => ev.id !== evaluationId))
  }

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    setSelectedCustomer(customer)
    setQuery(customer.full_name)
    setCustomerResults([])
    setSelectedDependenteId('')
    setSelectedSubjectType(null)
    setHistory([])
    setForm(createEmptyForm())
    setCurrentEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
    setAiState(null)
    setAiRecommendations([])
    setAiFeedback(null)
    setAiConversationInput('')
    setLensTechnicalTriage(null)
    setLensAudit(null)
    setLensAuditPayload(null)
    setLensSalesAssist(null)
    setIsGeneratingAudit(false)
    setIsGeneratingSalesAssist(false)
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

    setQuickRetentionReply(null)

    setAiState(null)
    setAiRecommendations([])
    setAiConversationInput('')
    setLensTechnicalTriage(null)
    setLensAudit(null)
    setLensAuditPayload(null)
    setLensSalesAssist(null)
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

    if (aiCaseInput.esferico === null) {
      setFormError('Preencha pelo menos o esfÃ©rico para a IA recomendar. CilÃ­ndrico e eixo sÃ£o opcionais.')
      return
    }

    setFormError(null)
    setAiFeedback(null)
    setQuickRetentionReply(null)
    setManualSuggestion(null)
    setLensTechnicalTriage(null)
    setLensAudit(null)
    setLensAuditPayload(null)
    setLensSalesAssist(null)
    setIsGeneratingSalesAssist(false)

    startAiGenerationTransition(async () => {
      const auditPatientContext = buildPatientAuditContext(form, aiCaseInput)
      const triageResult = await generateLensTechnicalTriageAction(auditPatientContext, aiCaseInput)
      const technicalTriage = triageResult.success ? triageResult.triage : null
      const recommendationCaseInput = applyTechnicalTriageToCaseInput(aiCaseInput, technicalTriage)

      setLensTechnicalTriage(technicalTriage)

      const result = await generateLensRecommendationsAction({
        versionId: activeCatalog.versionId,
        versionIds:
          activeCatalogs.length > 0
            ? activeCatalogs.map((catalog) => catalog.versionId)
            : undefined,
        storeId,
        ...recommendationCaseInput,
        topN: 3
      })

      if (!result.success || !result.data) {
        if (!fallbackToSystemSuggestion()) {
          setAiRecommendations([])
          setAiState(null)
          setAiFeedback(null)
          setLensTechnicalTriage(null)
          setLensAudit(null)
          setLensAuditPayload(null)
          setLensSalesAssist(null)
          setFormError(result.message)
        }
        return
      }

      const payload = result.data as LensRecommendationActionPayload
      setAiState(payload.state)
      setAiRecommendations(payload.recommendations)
      setSyncStatus(evaluationIdRef.current ? 'saved' : 'idle')
      setManualSuggestion(null)
      setAiFeedback(
        technicalTriage
          ? 'Triagem e sugestÃµes geradas.'
          : 'SugestÃµes geradas.'
      )

      // Auditoria Gemini assÃ­ncrona (nÃ£o bloqueia o ranking)
      if (payload.recommendations.length > 0) {
        setLensAudit(null)
        setLensSalesAssist(null)
        setIsGeneratingSalesAssist(true)
        const auditDebugPayload = {
          patient: auditPatientContext,
          technicalTriage,
          motorInput: recommendationCaseInput,
          recommendations: payload.recommendations,
        }
        setLensAuditPayload(auditDebugPayload)
        generateLensSalesAssistAction({
          patientContext: auditPatientContext,
          technicalTriage,
          motorInput: recommendationCaseInput,
          recommendations: payload.recommendations,
        }).then((assistResult) => {
          if (assistResult.success && assistResult.assist) {
            setLensSalesAssist(assistResult.assist)
          }
          setIsGeneratingSalesAssist(false)
        }).catch(() => {
          setIsGeneratingSalesAssist(false)
        })
      } else {
        setLensAuditPayload(null)
        setLensSalesAssist(null)
      }
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
      setLensSalesAssist(null)
      setSyncStatus(evaluationIdRef.current ? 'saved' : 'idle')
      setManualSuggestion(null)
      setAiFeedback(`SugestÃ£o refinada para: "${currentInput}"`)
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
    setAiFeedback('Resposta rÃ¡pida gerada para ajudar o consultor a segurar o cliente na loja.')

    if (evaluationId && storeId) {
      updateEvaluationPanicReason(evaluationId, storeId, intent).catch(() => {
        // silencioso â€” nÃ£o bloqueia o fluxo do consultor
      })
    }
  }

  const handleApplyAiRecommendation = (option: RecommendationOption) => {
    setForm((prev) => ({
      ...prev,
      recommendedLensName: buildAiRecommendationLabel(option),
      commercialRecommendationRaw:
        getSalesAssistOptionText(option, lensSalesAssist) ||
        buildAiCommercialSummary(option)
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
        setCurrentEvaluationId(null)
    setSyncStatus('idle')
    setManualSuggestion(null)
        setAiState(null)
        setAiRecommendations([])
        setAiFeedback(null)
        setAiConversationInput('')
        setLensTechnicalTriage(null)
        setLensAudit(null)
        setLensAuditPayload(null)
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
      setFormError('Consultor nÃ£o identificado. ImpossÃ­vel criar venda diretamente.')
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
         setFormError(result.message || 'Erro ao converter avaliaÃ§Ã£o em Venda.')
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
        evaluationId: evaluationIdRef.current || undefined,
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
      const evaluations = await getOpticalEvaluationsForSubject({
        storeId,
        customerId: selectedSubjectType === 'customer' ? selectedCustomer.id : null,
        dependenteId: selectedSubjectType === 'dependente' ? Number(selectedDependenteId) : null
      })
      setHistory(evaluations)
      setForm((prev) => ({
        ...createEmptyForm(),
        sourceUrl: prev.sourceUrl
      }))
      setCurrentEvaluationId(null)
      setSelectedCustomer(null)
      setSelectedSubjectType(null)
      setSelectedDependenteId('')
      setDependentes([])
      setQuery('')
      setCustomerResults([])
      setSyncStatus('idle')
      setManualSuggestion(null)
      setAiState(null)
      setAiRecommendations([])
      setAiFeedback(null)
      setAiConversationInput('')
      setLensTechnicalTriage(null)
      setLensAudit(null)
      setLensAuditPayload(null)
      setIvisionReferenceSuggestion(null)
      setIvisionReferenceSummary(null)
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
  const lensAuditPayloadText = lensAuditPayload
    ? JSON.stringify(lensAuditPayload, null, 2)
    : ''
  const lensTechnicalTriageText = lensTechnicalTriage
    ? [
        LENS_ENGINE_DIAGNOSTIC_SUITE_NAME,
        `Restore key: ${LENS_ENGINE_DIAGNOSTIC_SUITE_RESTORE_KEY}`,
        '',
        'Etapa 1 - Triagem tecnica IA',
        '',
        lensTechnicalTriage.parecer,
        lensTechnicalTriage.sellerBrief ? `\nLeitura para vendedor: ${lensTechnicalTriage.sellerBrief}` : null,
        '',
        ...lensTechnicalTriage.technicalSignals.map((signal) => signal.replace(/_/g, ' ')),
        lensTechnicalTriage.salesContext.tradeoff ? `\n${lensTechnicalTriage.salesContext.tradeoff}` : null,
        lensTechnicalTriage.salesContext.caution ? `\n${lensTechnicalTriage.salesContext.caution}` : null,
      ].filter(Boolean).join('\n')
    : ''

  const handleCopyDebugText = async (text: string, box: 'audit' | 'payload' | 'triage') => {
    if (!text) return

    try {
      await navigator.clipboard.writeText(text)
      setCopiedDebugBox(box)
      window.setTimeout(() => {
        setCopiedDebugBox((current) => current === box ? null : current)
      }, 1600)
    } catch (err) {
      console.error('Erro ao copiar debug da IA:', err)
      setFormError('Nao foi possivel copiar o debug da IA.')
    }
  }

  // CRM Auto-save
  useEffect(() => {
    // SÃ³ salva automaticamente se tiver paciente escolhido E funcionÃ¡rio autenticado
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
            evaluationId: evaluationIdRef.current || undefined,
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
            setCurrentEvaluationId(result.data.id)
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
  const patientAge = aiCaseInput.idade ?? null
  const isChild = patientAge !== null && patientAge <= 14
  const hasAdicao = aiCaseInput.adicao !== null
  const usedMultifocalBefore = form.tipoLenteAtual === 'multifocal' || form.tipoLenteAtual === 'bifocal'
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
          title="Assinatura de AvaliaÃ§Ã£o"
          description="Acesso restrito. Insira o seu PIN de consultor para assumir a titularidade desta avaliaÃ§Ã£o."
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
            <div className="flex items-center gap-3">
              <Link
                href={`/dashboard/loja/${storeId}?menu=atendimento`}
                className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                title="Voltar para o Painel"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="flex items-center gap-2 text-lg font-black uppercase tracking-tight text-white">
                  <Sparkles className="h-5 w-5 text-indigo-300" />
                  AvaliaÃ§Ã£o
                </h1>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300/80">
                  PrÃ©-venda e histÃ³rico individual
                </p>
              </div>
            </div>
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
                    {selectedCustomer.cpf || 'Sem CPF'} Ã¢â‚¬Â¢ {selectedCustomer.fone_movel || 'Sem telefone'}
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
                          {new Date(item.created_at).toLocaleDateString('pt-BR')} Ã¢â‚¬Â¢ {item.source_system}
                        </p>
                        <p className="mt-1 text-sm font-black text-white">
                          {item.evaluated_patient_name || item.patient_name_raw || 'Paciente'}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          OS {item.source_os_number || 'N/A'} Ã¢â‚¬Â¢ {item.source_exam_type || 'AvaliaÃ§Ã£o'}
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
              <EvaluationDashboard
                employeeName={authenticatedEmployee?.full_name || ''}
                evaluations={allRecentEvaluations}
                onSelectEvaluation={handleSelectEvaluation}
                isLoading={isLoadingDashboard}
                title="Pacientes Recentes"
                subtitle="Clique para retomar ou iniciar nova avaliaÃ§Ã£o"
              />
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
              <div className="mx-auto max-w-5xl space-y-5 pb-28">
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

                {/* Demo profiles preserved for internal calibration (`demo_quick_fill_profiles`). */}
                {SHOW_LENS_DEMO_QUICK_FILL && (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/5 p-4 mb-5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Preenchimento RÃ¡pido (DEMO):
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.enzo }))
                      setFeedback('Perfil da Lia (miopia infantil complexa) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Baby className="h-3.5 w-3.5" /> Lia (Miopia)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.maria }))
                      setFeedback('Perfil do Caio (alto grau ativo) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Caio (Alto Grau)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.roberto }))
                      setFeedback('Perfil da Helena (orcamento apertado) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Helena (Orcamento)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.baixoGrauEconomico }))
                      setFeedback('Perfil do Bruno (baixo grau economico) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Bruno (Baixo Grau)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.presbitaPremium }))
                      setFeedback('Perfil da Renata (presbita premium adaptavel) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Renata (Premium)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.primeiraMultifocal }))
                      setFeedback('Perfil da Marina (primeira multifocal) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Marina (1a Multi)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.solarOutdoor }))
                      setFeedback('Perfil do Sergio (solar outdoor) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Sergio (Solar)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.altaMiopiaBaixoOrcamento }))
                      setFeedback('Perfil do Tiago (alta miopia com orcamento baixo) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Tiago (Alto Grau $)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.ocupacionalVerdadeiro }))
                      setFeedback('Perfil do Otavio (ocupacional verdadeiro) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Otavio (Ocupacional)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.fotossensivelPrioritario }))
                      setFeedback('Perfil do Fabio (fotossensivel prioritario) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Fabio (Foto)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.adaptacaoMultifocalDificil }))
                      setFeedback('Perfil da Marta (adaptacao multifocal dificil) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Briefcase className="h-3.5 w-3.5" /> Marta (Adaptacao)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.hipermetropiaAltaEstetica }))
                      setFeedback('Perfil do Claudio (hipermetropia alta estetica) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Claudio (Hiper +)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.add400Disponibilidade }))
                      setFeedback('Perfil da Dora (ADD +4 disponibilidade) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Dora (ADD +4)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm(createEmptyForm())
                      setFormError(null)
                      setFeedback('FormulÃ¡rio limpo com sucesso!')
                    }}
                    className="ml-auto inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-all hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Limpar Tudo
                  </button>
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
                    {/* SUBSECTION 1: HISTÃƒâ€œRICO E Ãƒâ€œCULOS ATUAL */}
                    <div className="col-span-12">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        HistÃ³rico e Ãƒâ€œculos Atual
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
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="visao_simples">VisÃ£o simples</option>
                        <option value="multifocal">Multifocal / progressiva</option>
                        <option value="ocupacional">Ocupacional</option>
                        <option value="bifocal">Bifocal</option>
                      </select>
                    </div>
                    {usedMultifocalBefore && !isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>AdaptaÃ§Ã£o com lentes anteriores</label>
                        <select
                          value={form.dificuldadeAdaptacao}
                          onChange={(e) => handleFormChange('dificuldadeAdaptacao', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao_informado">NÃ£o informado</option>
                          <option value="baixa">Boa adaptaÃ§Ã£o</option>
                          <option value="media">Alguma dificuldade</option>
                          <option value="alta">Muita dificuldade</option>
                        </select>
                      </div>
                    )}
                    {usedMultifocalBefore && !isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>Trocas recentes de lente</label>
                        <select
                          value={form.historicoTrocasRecentes}
                          onChange={(e) => handleFormChange('historicoTrocasRecentes', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao_informado">NÃ£o informado</option>
                          <option value="nenhuma">Nenhuma recente</option>
                          <option value="uma">Uma troca recente</option>
                          <option value="mais_de_duas">VÃ¡rias trocas / retrabalho</option>
                        </select>
                      </div>
                    )}

                    {/* SUBSECTION 2: OBJETIVOS E PREFERÃƒÅ NCIAS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Objetivos e PreferÃªncias
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prioridade principal</label>
                      <select
                        value={form.prioridadePrincipal}
                        onChange={(e) => handleFormChange('prioridadePrincipal', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="equilibrio">EquilÃ­brio geral</option>
                        <option value="economia">Melhor custo-benefÃ­cio</option>
                        <option value="adaptacao">AdaptaÃ§Ã£o mais fÃ¡cil</option>
                        <option value="resistencia">Mais resistÃªncia</option>
                        <option value="controle_miopia">Controle de miopia</option>
                        <option value="premium">Desempenho premium</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Principal incÃ´modo atual</label>
                      <select
                        value={form.principalIncomodoAtual}
                        onChange={(e) => handleFormChange('principalIncomodoAtual', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="nenhum">Nenhum especÃ­fico</option>
                        <option value="perto">NÃ£o enxerga bem de perto</option>
                        <option value="longe">NÃ£o enxerga bem de longe</option>
                        <option value="intermediario">IntermediÃ¡rio / computador</option>
                        <option value="peso_espessura">Peso / espessura</option>
                        <option value="reflexo">Reflexo / brilho</option>
                        <option value="adaptacao">Dificuldade de adaptaÃ§Ã£o</option>
                        <option value="preco">PreÃ§o</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Objetivo desta compra</label>
                      <select
                        value={form.objetivoCompra}
                        onChange={(e) => handleFormChange('objetivoCompra', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="primeira_multifocal">Primeira multifocal</option>
                        <option value="upgrade">Upgrade de lente</option>
                        <option value="resolver_queixa">Resolver queixa especÃ­fica</option>
                        <option value="economizar">Economizar</option>
                        <option value="trocar_marca">Trocar marca/laboratÃ³rio</option>
                        <option value="ocupacional_escritorio">Ã“culos para trabalho/escritÃ³rio</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>OrÃ§amento (R$)</label>
                      <input
                        value={form.budgetTarget}
                        onChange={(e) => handleFormChange('budgetTarget', e.target.value)}
                        className={inputStyle}
                        placeholder="Ex: 2500"
                        type="number"
                        min="0"
                      />
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>ImportÃ¢ncia de estÃ©tica/finura</label>
                      <select
                        value={form.importanciaEstetica}
                        onChange={(e) => handleFormChange('importanciaEstetica', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">MÃ©dia</option>
                        <option value="alta">Alta</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>ImportÃ¢ncia de resistÃªncia</label>
                      <select
                        value={form.importanciaResistencia}
                        onChange={(e) => handleFormChange('importanciaResistencia', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="baixa">Baixa</option>
                        <option value="media">MÃ©dia</option>
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
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">NÃ£o</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prefere Blue/UV?</label>
                      <select
                        value={form.prefereBlueUv}
                        onChange={(e) => handleFormChange('prefereBlueUv', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">NÃ£o informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">NÃ£o</option>
                      </select>
                    </div>

                    {/* SUBSECTION 3: SINTOMAS E COMPORTAMENTOS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Sintomas e Comportamentos
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Dificuldade para dirigir Ã  noite</label>
                      <select
                        value={form.queixaDirigirNoite}
                        onChange={(e) => handleFormChange('queixaDirigirNoite', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Sensibilidade Ã  luz</label>
                      <select
                        value={form.queixaSensibilidadeLuz}
                        onChange={(e) => handleFormChange('queixaSensibilidadeLuz', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Quebra Ã³culos com frequÃªncia</label>
                      <select
                        value={form.queixaQuebraOculos}
                        onChange={(e) => handleFormChange('queixaQuebraOculos', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">NÃ£o</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    {isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>CrianÃ§a muito ativa</label>
                        <select
                          value={form.queixaCriancaAtiva}
                          onChange={(e) => handleFormChange('queixaCriancaAtiva', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao">NÃ£o</option>
                          <option value="sim">Sim</option>
                        </select>
                      </div>
                    )}
                    {isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>Grau aumentando rÃ¡pido</label>
                        <select
                          value={form.queixaProgressaoRapida}
                          onChange={(e) => handleFormChange('queixaProgressaoRapida', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao">NÃ£o</option>
                          <option value="sim">Sim</option>
                        </select>
                      </div>
                    )}

                    {/* SUBSECTION 4: OBSERVAÃƒâ€¡Ãƒâ€¢ES ADICIONAIS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        ObservaÃ§Ãµes Adicionais
                      </h4>
                    </div>
                    <div className="col-span-12">
                      <label className={labelStyle}>ObservaÃ§Ãµes do consultor</label>
                      <textarea
                        value={form.observacoesConsultor}
                        onChange={(e) => handleFormChange('observacoesConsultor', e.target.value)}
                        className="block min-h-[92px] w-full rounded-xl border border-white/20 bg-slate-900/60 shadow-inner text-slate-100 px-3 py-3 text-sm font-bold placeholder:font-normal placeholder:text-slate-500 outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-all disabled:opacity-50"
                        placeholder="Ex: cliente muito sensÃ­vel a preÃ§o, jÃ¡ devolveu multifocal, quer lente mais fina, compara muito com concorrente..."
                      />
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
                          </div>
                          <button
                            type="button"
                            onClick={handleGenerateAiRecommendation}
                            disabled={isGeneratingAi || !canGenerateAi}
                            className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-500/30 bg-fuchsia-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-fuchsia-200 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isGeneratingAi ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />}
                            Gerar sugestões
                          </button>
                        </div>

                        {aiFeedback && (
                          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                            {aiFeedback}
                          </div>
                        )}

                        {isGeneratingAi && (
                          <LensSearchAnimation
                            lensRim={lensSearchRim}
                            searchFields={lensSearchFields}
                          />
                        )}

                        {lensTechnicalTriage?.sellerBrief && (
                          <div className="mt-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                              Leitura rapida para o vendedor
                            </p>
                            <p className="mt-2 text-sm leading-6 text-emerald-50">
                              {lensTechnicalTriage.sellerBrief}
                            </p>
                          </div>
                        )}

                        {isGeneratingSalesAssist && aiRecommendations.length > 0 && (
                          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 px-4 py-3 text-sm text-cyan-100">
                            <span className="inline-flex items-center gap-2">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Preparando argumentos de venda para as lentes indicadas...
                            </span>
                          </div>
                        )}

                        {lensSalesAssist?.sellerOpening && (
                          <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4">
                            <p className="text-sm leading-6 text-cyan-50">
                              {lensSalesAssist.sellerOpening}
                            </p>
                          </div>
                        )}

                        <details className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3">
                          <summary className="cursor-pointer text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                            Dossie Triplice do Motor (debug)
                          </summary>
                          <p className="mt-2 text-xs text-slate-400">
                            Perfis demo de preenchimento rapido preservados no codigo para calibracao: <code>{LENS_DEMO_QUICK_FILL_RESTORE_KEY}</code>.
                          </p>

                        {/* Dossie Triplice do Motor (`dossie_triplice_motor`): preserve este conjunto.
                            Ele junta Triagem IA -> Payload/Motor -> Auditoria IA para calibrar novas tabelas globais. */}
                        {(isGeneratingAudit || lensAudit) && (
                          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                              {LENS_ENGINE_DIAGNOSTIC_SUITE_NAME} - Etapa 3: Auditoria IA
                            </p>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-400 flex items-center gap-2">
                                <Sparkles className="h-3 w-3" /> Debug IA â€” Auditoria da IndicaÃ§Ã£o
                              </p>
                              <button
                                type="button"
                                onClick={() => handleCopyDebugText(lensAudit || '', 'audit')}
                                disabled={!lensAudit}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-amber-100 hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {copiedDebugBox === 'audit' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                {copiedDebugBox === 'audit' ? 'Copiado' : 'Copiar'}
                              </button>
                            </div>
                            {isGeneratingAudit && !lensAudit
                              ? <span className="flex items-center gap-2 text-amber-400/70 text-sm italic"><Loader2 className="h-3 w-3 animate-spin" />Analisando indicaÃ§Ãµes...</span>
                              : <p className="text-sm leading-6 text-amber-100/90 whitespace-pre-wrap">{lensAudit}</p>
                            }
                          </div>
                        )}

                        {lensAuditPayload && (
                          <div className="mt-4 rounded-xl border border-slate-500/30 bg-slate-900/60 p-4">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">
                              {LENS_ENGINE_DIAGNOSTIC_SUITE_NAME} - Etapa 2: Payload/Motor
                            </p>
                            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 flex items-center gap-2">
                                <FileSearch className="h-3 w-3" /> Debug IA â€” Payload da Auditoria
                              </p>
                              <button
                                type="button"
                                onClick={() => handleCopyDebugText(lensAuditPayloadText, 'payload')}
                                disabled={!lensAuditPayloadText}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-400/30 bg-slate-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-slate-100 hover:bg-slate-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {copiedDebugBox === 'payload' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                {copiedDebugBox === 'payload' ? 'Copiado' : 'Copiar'}
                              </button>
                            </div>
                            <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/20 p-3 text-xs leading-5 text-slate-200">
                              {lensAuditPayloadText}
                            </pre>
                          </div>
                        )}

                        {lensTechnicalTriage && (
                          <div className="mt-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
                            <p className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200">
                              {LENS_ENGINE_DIAGNOSTIC_SUITE_NAME} - Etapa 1: Triagem IA
                            </p>
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                                Triagem tecnica IA
                              </p>
                              <button
                                type="button"
                                onClick={() => handleCopyDebugText(lensTechnicalTriageText, 'triage')}
                                disabled={!lensTechnicalTriageText}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-50 hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {copiedDebugBox === 'triage' ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                {copiedDebugBox === 'triage' ? 'Copiado' : 'Copiar'}
                              </button>
                            </div>
                            {lensTechnicalTriage.parecer && (
                              <p className="mt-2 text-sm leading-6 text-emerald-50">
                                {lensTechnicalTriage.parecer}
                              </p>
                            )}
                            {lensTechnicalTriage.technicalSignals.length > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                {lensTechnicalTriage.technicalSignals.map((signal) => (
                                  <span
                                    key={signal}
                                    className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-emerald-100"
                                  >
                                    {signal.replace(/_/g, ' ')}
                                  </span>
                                ))}
                              </div>
                            )}
                            {(lensTechnicalTriage.salesContext.tradeoff || lensTechnicalTriage.salesContext.caution) && (
                              <div className="mt-3 space-y-2 text-xs leading-5 text-emerald-100">
                                {lensTechnicalTriage.salesContext.tradeoff && <p>{lensTechnicalTriage.salesContext.tradeoff}</p>}
                                {lensTechnicalTriage.salesContext.caution && <p>{lensTechnicalTriage.salesContext.caution}</p>}
                              </div>
                            )}
                          </div>
                        )}

                        </details>

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
                                  <p className="mt-3 whitespace-pre-line rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                    {buildSellerVisibleOptionNarrative(aiTopRecommendation, 0, aiTopRecommendation, lensSalesAssist)}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyAiRecommendation(aiTopRecommendation)}
                                    className="mt-auto ml-auto inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400"
                                  >
                                    Aplicar esta opÃ§Ã£o
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
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-stretch lg:justify-between">
                                  <div>
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
                                          OpÃ§Ã£o {index + 1}
                                        </p>
                                        <p className="mt-2 text-lg font-black text-white">{buildAiRecommendationLabel(option)}</p>
                                        <p className="mt-2 text-sm font-bold text-fuchsia-100">
                                          {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(option.finalPrice)}
                                        </p>
                                      </div>
                                      <AiOptionInfoButton option={option} />
                                    </div>
                                    <p className="mt-3 whitespace-pre-line rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                      {buildSellerVisibleOptionNarrative(option, index, aiRecommendations[0] || option, lensSalesAssist)}
                                    </p>
                                  </div>
                                  <div className="flex lg:min-w-[220px] lg:max-w-sm lg:flex-col lg:justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleApplyAiRecommendation(option)}
                                      className="mt-auto ml-auto inline-flex items-center gap-2 self-end rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400"
                                    >
                                      Aplicar esta opÃ§Ã£o
                                    </button>
                                  </div>
                                </div>
                              </div>
                            ))}
                            {lensSalesAssist?.comparisonTip && (
                              <div className="col-span-12 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-50">
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">
                                  Dica para comparar as opcoes
                                </p>
                                <p className="mt-2">{lensSalesAssist.comparisonTip}</p>
                              </div>
                            )}
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
                              Resposta rÃ¡pida para retenÃ§Ã£o
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {[
                                { id: 'pesquisar', label: 'Vou dar uma pesquisada' },
                                { id: 'pensar', label: 'Vou falar com meu marido' },
                                { id: 'armacoes', label: 'NÃ£o gostei das armaÃ§Ãµes' },
                                { id: 'concorrencia', label: 'Achei mais barato na concorrÃªncia' }
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

                        {!isGeneratingAi && !aiRecommendations.length && null}
                      </div>
                    )}
                    {showManualSuggestionBlock && (
                      <div className="col-span-12 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                              SugestÃ£o do Sistema
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

                <div className="sticky bottom-0 z-20 -mx-2 mt-4 border-t border-white/10 bg-slate-950/90 px-2 pt-4 pb-2 backdrop-blur-md">
                  <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-indigo-600 px-6 py-3 text-xs font-black uppercase tracking-[0.2em] text-white shadow-lg shadow-indigo-500/20 hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    Salvar AvaliaÃ§Ã£o
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

