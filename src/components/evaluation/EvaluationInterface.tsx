'use client'

import React, { useEffect, useId, useMemo, useRef, useState, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  AlertTriangle,
  Bot,
  Calendar,
  ChevronDown,
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
  Trash2, ShoppingCart, ArrowLeft, Minus
} from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import QuickCustomerModal from '@/components/modals/QuickCustomerModal'
import AddDependenteModal from '@/components/modals/AddDependenteModal'
import { getDependentes } from '@/lib/actions/dependents.actions'
import { searchCustomersByName, createNewVenda, type CustomerSearchResult } from '@/lib/actions/vendas.actions'
import {
  getOpticalEvaluationsForSubject,
  createSaleAndServiceOrderFromEvaluation,
  upsertOpticalEvaluation,
  type OpticalEvaluationListItem
} from '@/lib/actions/evaluation.actions'
import {
  continueLensRecommendationConversationAction,
  generateLensRecommendationsAction
} from '@/lib/actions/lens-recommendation.actions'
import {
  generateLensSalesAssistAction,
  type LensSalesAssist,
  type LensTechnicalTriage,
  type PatientAuditContext,
} from '@/lib/actions/gemini-narratives.actions'
import { Database } from '@/lib/database.types'
import { EvaluationDashboard } from './EvaluationDashboard'
import { getRecentEvaluationsForEmployee, updateEvaluationPanicReason, updateEvaluationExportedVendaId, updateEvaluationOutcomeStatus } from '@/lib/actions/evaluation.actions'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import type {
  RecommendationCaseInput,
  RecommendationConversationState,
  RecommendationOption,
  RecommendationPresentationStrategy
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
  presentationStrategy?: RecommendationPresentationStrategy
}

const LENS_ENGINE_DIAGNOSTIC_SUITE_NAME = 'Dossie Triplice do Motor'
const LENS_ENGINE_DIAGNOSTIC_SUITE_RESTORE_KEY = 'dossie_triplice_motor'
const LENS_DEMO_QUICK_FILL_RESTORE_KEY = 'demo_quick_fill_profiles'
// Painel de debug usado apenas em testes/calibracao do motor de recomendacao.
const SHOW_LENS_ENGINE_DIAGNOSTIC_SUITE = false
// Preserve os perfis demo para calibracao futura, mas mantenha o card fora da UI.
const SHOW_LENS_DEMO_QUICK_FILL = false

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
const selectStyle = 'hidden'
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
    prioridadePrincipal: 'economia',
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
    prioridadePrincipal: 'equilibrio',
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
    prioridadePrincipal: 'economia',
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
    prioridadePrincipal: 'adaptacao',
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
    prioridadePrincipal: 'equilibrio',
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
    prioridadePrincipal: 'premium',
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
  },
  solarPlanoSemGrau: {
    patientNameRaw: 'Nina Sol (Solar Plano Sem Grau)',
    ageYears: '33',
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
    prioridadePrincipal: 'equilibrio',
    principalIncomodoAtual: 'luz',
    objetivoCompra: 'oculos_sol_grau',
    faixaOrcamento: 'ate_800',
    budgetTarget: '450',
    importanciaEstetica: 'media',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'nao',
    aceitaPremium: 'nao',
    queixaDirigirNoite: 'nao',
    queixaSensibilidadeLuz: 'sim',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Cliente quer apenas oculos de sol plano, sem grau. Testa se solares planas aparecem somente como 0/0 e se o motor nao inventa disponibilidade com grau.',
    receitaLongeOdEsferico: '0,00',
    receitaLongeOdCilindrico: '0,00',
    receitaLongeOdEixo: '',
    receitaLongeOeEsferico: '0,00',
    receitaLongeOeCilindrico: '0,00',
    receitaLongeOeEixo: '',
    receitaAdicao: '',
    receitaPertoOdEsferico: '',
    receitaPertoOdCilindrico: '',
    receitaPertoOdEixo: '',
    receitaPertoOeEsferico: '',
    receitaPertoOeCilindrico: '',
    receitaPertoOeEixo: '',
    medidaDnpOd: '32',
    medidaDnpOe: '32',
    medidaAlturaOd: '18',
    medidaAlturaOe: '18'
  },
  multifocalAcabadaConservadora: {
    patientNameRaw: 'Irene Paiva (Multifocal Acabada Conservadora)',
    ageYears: '63',
    estiloVidaUsoComputadorHoras: '1',
    estiloVidaDirigirHoras: '1',
    estiloVidaLeituraHoras: '4',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '1',
    estiloVidaAmbienteInternoHoras: '10',
    estiloVidaAmbienteExternoHoras: '1',
    estiloVidaAssistirTvHoras: '3',
    marcaAtual: 'Oculos pronto antigo',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'baixa',
    historicoTrocasRecentes: 'nao_informado',
    prioridadePrincipal: 'economia',
    principalIncomodoAtual: 'perto',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: 'ate_800',
    budgetTarget: '700',
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
    observacoesConsultor: 'Multifocal simples, grau dentro da faixa conservadora de acabadas e adicao ate +3.00. Testa se acabadas multifocais entram sem ultrapassar grade.',
    receitaLongeOdEsferico: '+2,00',
    receitaLongeOdCilindrico: '-1,00',
    receitaLongeOdEixo: '90',
    receitaLongeOeEsferico: '+1,75',
    receitaLongeOeCilindrico: '-0,75',
    receitaLongeOeEixo: '85',
    receitaAdicao: '3,00',
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
  astigmatismoForaConservadora: {
    patientNameRaw: 'Rafael Torres (Cilindro Alto Limite)',
    ageYears: '40',
    estiloVidaUsoComputadorHoras: '6',
    estiloVidaDirigirHoras: '2',
    estiloVidaLeituraHoras: '2',
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
    prioridadePrincipal: 'premium',
    principalIncomodoAtual: 'longe',
    objetivoCompra: 'resolver_queixa',
    faixaOrcamento: '2000_5000',
    budgetTarget: '2600',
    importanciaEstetica: 'media',
    importanciaResistencia: 'baixa',
    prefereTransitions: 'nao',
    prefereBlueUv: 'sim',
    aceitaPremium: 'sim',
    queixaDirigirNoite: 'sim',
    queixaSensibilidadeLuz: 'nao',
    queixaQuebraOculos: 'nao',
    queixaCriancaAtiva: 'nao',
    queixaProgressaoRapida: 'nao',
    observacoesConsultor: 'Cilindro -4.50 deve derrubar lentes acabadas/conservadoras que so aceitam ate -2.00 ou -4.00. Testa se o motor filtra por grade antes de ranquear.',
    receitaLongeOdEsferico: '-3,00',
    receitaLongeOdCilindrico: '-4,50',
    receitaLongeOdEixo: '175',
    receitaLongeOeEsferico: '-2,75',
    receitaLongeOeCilindrico: '-4,25',
    receitaLongeOeEixo: '5',
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
  visionHaytekPremium: {
    patientNameRaw: 'Paula Mendes (Vision Haytek Premium)',
    ageYears: '55',
    estiloVidaUsoComputadorHoras: '5',
    estiloVidaDirigirHoras: '3',
    estiloVidaLeituraHoras: '3',
    estiloVidaUsoCelularHoras: '2',
    estiloVidaExposicaoSolHoras: '2',
    estiloVidaAmbienteInternoHoras: '8',
    estiloVidaAmbienteExternoHoras: '2',
    estiloVidaAssistirTvHoras: '2',
    marcaAtual: 'Multifocal atual',
    tipoLenteAtual: 'multifocal',
    usaMultifocalHoje: 'sim',
    dificuldadeAdaptacao: 'media',
    historicoTrocasRecentes: 'uma',
    prioridadePrincipal: 'premium',
    principalIncomodoAtual: 'longe_perto',
    objetivoCompra: 'melhorar_conforto',
    faixaOrcamento: '2000_5000',
    budgetTarget: '4200',
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
    observacoesConsultor: 'Caso para testar equivalencia Vision/Haytek em multifocal premium: deve favorecer familias superiores quando Vision/Haytek estiverem ativas e semanticamente alinhadas.',
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

const getSalesAssistOptionText = (
  option: RecommendationOption,
  salesAssist: LensSalesAssist | null,
) => {
  const argument = salesAssist?.options.find((item) => item.configKey === option.configKey)
  if (!argument) return null

  return [
    argument.headline,
    argument.sellerArgument || argument.whyThisLens,
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

  // Histórico de trocas com dificuldade alta = caso crítico de adaptação
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
    // só sugere transitions se o paciente não recusou explicitamente
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

  const wantsOfficeLens =
    form.objetivoCompra === 'oculos_escritorio' ||
    form.objetivoCompra === 'ocupacional_escritorio'

  if (
    parseNullableNumber(form.receitaAdicao) !== null &&
    !wantsOfficeLens &&
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

  if (wantsOfficeLens) {
    objetivoTags.push('ocupacional')
    rotinaTags.push('computador')
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

function AgeStepper({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const rawValue = Number.isFinite(Number(value)) && value !== '' ? Number(value) : 0
  const numericValue = Math.max(0, Math.min(120, rawValue))
  const updateAge = (nextValue: number) => {
    onChange(String(Math.max(0, Math.min(120, nextValue))))
  }

  return (
    <div className="flex h-12 overflow-hidden rounded-xl border border-white/20 bg-slate-900/60 shadow-inner">
      <button
        type="button"
        onClick={() => updateAge(numericValue - 1)}
        className="flex w-12 shrink-0 items-center justify-center border-r border-white/10 text-slate-300 transition-colors hover:bg-white/10 active:bg-white/15"
        title="Diminuir idade"
      >
        <Minus className="h-4 w-4" />
      </button>
      <input
        type="number"
        min="0"
        max="120"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-center text-base font-black text-slate-100 outline-none"
      />
      <button
        type="button"
        onClick={() => updateAge(numericValue + 1)}
        className="flex w-12 shrink-0 items-center justify-center border-l border-white/10 text-slate-300 transition-colors hover:bg-white/10 active:bg-white/15"
        title="Aumentar idade"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  )
}

function HourSlider({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const rawValue = Number.isFinite(Number(value)) && value !== '' ? Number(value) : 0
  const numericValue = Math.max(0, Math.min(12, rawValue))

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">
          {label}
        </label>
        <span className="min-w-12 rounded-lg border border-indigo-400/20 bg-indigo-400/10 px-2 py-1 text-center text-xs font-black text-indigo-100">
          {numericValue}h
        </span>
      </div>
      <input
        type="range"
        min="0"
        max="12"
        step="1"
        value={numericValue}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 w-full cursor-pointer accent-indigo-400"
      />
      <div className="-mt-1 flex justify-between px-1 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-600">
        <span>0</span>
        <span>6</span>
        <span>12</span>
      </div>
    </div>
  )
}

type TabletChoiceOption = {
  value: string
  label: string
}

function TabletChoicePicker({
  id,
  label,
  value,
  options,
  activePicker,
  onOpen,
  onChange,
}: {
  id: string
  label: string
  value: string
  options: TabletChoiceOption[]
  activePicker: string | null
  onOpen: (id: string | null) => void
  onChange: (value: string) => void
}) {
  const isOpen = activePicker === id
  const selectedLabel = options.find((option) => option.value === value)?.label || label

  return (
    <div>
      <button
        type="button"
        onClick={() => onOpen(isOpen ? null : id)}
        className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
          isOpen
            ? 'border-indigo-400/40 bg-indigo-500/15 text-indigo-50'
            : 'border-white/10 bg-slate-900/60 text-slate-100 hover:bg-white/10'
        }`}
        aria-expanded={isOpen}
      >
        <span className="min-w-0 truncate text-sm font-black">{selectedLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-indigo-200 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="mt-3 flex flex-wrap gap-2 rounded-2xl border border-indigo-400/20 bg-indigo-500/5 p-2">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value)
                onOpen(null)
              }}
              className={`min-h-11 rounded-xl border px-3 py-2 text-sm font-bold transition-colors ${
                option.value === value
                  ? 'border-indigo-300/50 bg-indigo-500 text-white'
                  : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const LENS_TYPE_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'visao_simples', label: 'Visao simples' },
  { value: 'multifocal', label: 'Multifocal / progressiva' },
  { value: 'ocupacional', label: 'Ocupacional' },
  { value: 'bifocal', label: 'Bifocal' },
]

const ADAPTATION_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'baixa', label: 'Boa adaptacao' },
  { value: 'media', label: 'Alguma dificuldade' },
  { value: 'alta', label: 'Muita dificuldade' },
]

const CHANGE_HISTORY_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'nenhuma', label: 'Nenhuma recente' },
  { value: 'uma', label: 'Uma troca recente' },
  { value: 'mais_de_duas', label: 'Varias trocas / retrabalho' },
]

const PRIORITY_OPTIONS: TabletChoiceOption[] = [
  { value: 'equilibrio', label: 'Equilibrio geral' },
  { value: 'economia', label: 'Melhor custo-beneficio' },
  { value: 'adaptacao', label: 'Adaptacao mais facil' },
  { value: 'resistencia', label: 'Mais resistencia' },
  { value: 'controle_miopia', label: 'Controle de miopia' },
  { value: 'premium', label: 'Desempenho premium' },
]

const DISCOMFORT_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'nenhum', label: 'Nenhum especifico' },
  { value: 'perto', label: 'Perto' },
  { value: 'longe', label: 'Longe' },
  { value: 'intermediario', label: 'Intermediario / computador' },
  { value: 'peso_espessura', label: 'Peso / espessura' },
  { value: 'reflexo', label: 'Reflexo / brilho' },
  { value: 'adaptacao', label: 'Dificuldade de adaptacao' },
  { value: 'preco', label: 'Preco' },
]

const OBJECTIVE_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'primeira_multifocal', label: 'Primeira multifocal' },
  { value: 'upgrade', label: 'Upgrade de lente' },
  { value: 'resolver_queixa', label: 'Resolver queixa' },
  { value: 'economizar', label: 'Economizar' },
  { value: 'trocar_marca', label: 'Trocar marca/lab' },
  { value: 'oculos_escritorio', label: 'Oculos escritorio' },
]

const UNKNOWN_YES_NO_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'sim', label: 'Sim' },
  { value: 'nao', label: 'Nao' },
]

const YES_NO_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao', label: 'Nao' },
  { value: 'sim', label: 'Sim' },
]

const IMPORTANCE_OPTIONS: TabletChoiceOption[] = [
  { value: 'nao_informado', label: 'Nao informado' },
  { value: 'baixa', label: 'Baixa' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
]

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
  ageYears: '30',
  estiloVidaUsoComputadorHoras: '4',
  estiloVidaDirigirHoras: '1',
  estiloVidaLeituraHoras: '1',
  estiloVidaUsoCelularHoras: '3',
  estiloVidaExposicaoSolHoras: '1',
  estiloVidaAmbienteInternoHoras: '8',
  estiloVidaAmbienteExternoHoras: '1',
  estiloVidaAssistirTvHoras: '2',
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

type RecommendationConsistencyIssue = {
  severity: 'blocker' | 'warning'
  message: string
  suggestion: string
}

function validateRecommendationFormConsistency(form: ReturnType<typeof createEmptyForm>): RecommendationConsistencyIssue[] {
  const issues: RecommendationConsistencyIssue[] = []
  const age = parseNullableInteger(form.ageYears)
  const isChild = age !== null && age <= 14
  const sphere = parseNullableNumber(form.receitaLongeOdEsferico) ?? parseNullableNumber(form.receitaLongeOeEsferico)
  const cylinder = parseNullableNumber(form.receitaLongeOdCilindrico) ?? parseNullableNumber(form.receitaLongeOeCilindrico)
  const add = parseNullableNumber(form.receitaAdicao)
  const targetBudget = parseNullableNumber(form.budgetTarget)
  const wantsFirstMultifocal = form.objetivoCompra === 'primeira_multifocal'
  const wantsOfficeLens = form.objetivoCompra === 'oculos_escritorio' || form.objetivoCompra === 'ocupacional_escritorio'
  const wantsSolar = form.objetivoCompra === 'oculos_sol_grau'
  const hasNearOrIntermediateComplaint =
    form.principalIncomodoAtual === 'perto' ||
    form.principalIncomodoAtual === 'intermediario' ||
    form.principalIncomodoAtual === 'adaptacao'
  const hasPresbyopicContext =
    form.usaMultifocalHoje === 'sim' ||
    form.tipoLenteAtual === 'multifocal' ||
    form.tipoLenteAtual === 'bifocal' ||
    wantsFirstMultifocal ||
    wantsOfficeLens ||
    hasNearOrIntermediateComplaint
  const wantsPremium =
    form.prioridadePrincipal === 'premium' ||
    form.aceitaPremium === 'sim' ||
    form.importanciaEstetica === 'alta' ||
    form.importanciaResistencia === 'alta' ||
    form.prefereTransitions === 'sim'
  const wantsManyUpgrades = [
    form.prioridadePrincipal === 'premium',
    form.aceitaPremium === 'sim',
    form.importanciaEstetica === 'alta',
    form.importanciaResistencia === 'alta',
    form.prefereTransitions === 'sim',
    form.prefereBlueUv === 'sim',
  ].filter(Boolean).length >= 3

  if (isChild && wantsFirstMultifocal) {
    issues.push({
      severity: 'blocker',
      message: 'Paciente infantil não deve ser marcado como primeira multifocal/progressiva.',
      suggestion: 'Troque o objetivo para resolver queixa, controle de miopia ou outra necessidade coerente com a idade.',
    })
  }

  if ((wantsFirstMultifocal || wantsOfficeLens) && add === null) {
    issues.push({
      severity: 'blocker',
      message: wantsOfficeLens
        ? 'Óculos de escritório/ocupacional precisam de adição informada para o motor avaliar corretamente.'
        : 'Primeira multifocal precisa de adição informada.',
      suggestion: 'Preencha a adição ou altere o objetivo da compra.',
    })
  }

  if (add !== null && add > 0 && !hasPresbyopicContext) {
    issues.push({
      severity: 'warning',
      message: 'Há adição preenchida, mas o restante do formulário ainda não indica claramente necessidade de multifocal ou ocupacional.',
      suggestion: 'Confirme se o cliente precisa de lente para perto/intermediário, primeira multifocal ou óculos de escritório.',
    })
  }

  if (isChild && add !== null && add > 0) {
    issues.push({
      severity: 'warning',
      message: 'Criança com adição preenchida merece dupla checagem da receita e do objetivo da compra.',
      suggestion: 'Confirme se a adição está correta e se o caso é realmente multifocal/ocupacional, não apenas controle de miopia ou visão simples.',
    })
  }

  if (wantsSolar && add !== null) {
    issues.push({
      severity: 'warning',
      message: 'Objetivo solar com adição preenchida pode misturar necessidades diferentes.',
      suggestion: 'Confirme se o cliente quer solar plano, solar com grau de longe ou multifocal solar.',
    })
  }

  if (targetBudget !== null && targetBudget <= 800 && wantsPremium) {
    issues.push({
      severity: 'warning',
      message: 'Há desejo por recursos premium com orçamento muito baixo.',
      suggestion: 'Confirme se a prioridade é manter preço baixo ou abrir espaço para uma solução superior.',
    })
  }

  if (targetBudget !== null && targetBudget <= 1600 && wantsManyUpgrades) {
    issues.push({
      severity: 'warning',
      message: 'O cliente pediu várias melhorias ao mesmo tempo dentro de um alvo de preço apertado.',
      suggestion: 'Alinhe uma prioridade principal antes de gerar: preço, estética, resistência, fotossensível ou tratamento.',
    })
  }

  if (form.queixaDirigirNoite === 'sim' && targetBudget !== null && targetBudget <= 800) {
    issues.push({
      severity: 'warning',
      message: 'Queixa de dirigir à noite costuma exigir melhor antirreflexo, mas o orçamento está baixo.',
      suggestion: 'Confirme se o cliente aceita ultrapassar o alvo para priorizar segurança/conforto noturno.',
    })
  }

  if (form.queixaProgressaoRapida === 'sim' && isChild && form.prioridadePrincipal !== 'controle_miopia') {
    issues.push({
      severity: 'warning',
      message: 'Criança com progressão rápida deve ter controle de miopia como prioridade clínica.',
      suggestion: 'Considere mudar a prioridade principal para controle de miopia antes de gerar.',
    })
  }

  if (Math.abs(cylinder || 0) >= 4) {
    issues.push({
      severity: 'warning',
      message: 'Cilindro alto restringe disponibilidade e pode derrubar lentes prontas/conservadoras.',
      suggestion: 'Confira se a receita esta correta; o motor deve priorizar opcoes compativeis com a grade.',
    })
  }

  if (add !== null && add >= 3.5) {
    issues.push({
      severity: 'warning',
      message: 'Adição alta restringe disponibilidade de multifocais.',
      suggestion: 'Mantenha atenção à grade; talvez apareçam menos opções e isso pode estar correto.',
    })
  }

  if (sphere !== null && Math.abs(sphere) >= 6 && targetBudget !== null && targetBudget <= 1600) {
    issues.push({
      severity: 'warning',
      message: 'Grau alto com orçamento apertado pode limitar estética, espessura e tratamentos.',
      suggestion: 'Confirme se o cliente prioriza preço ou melhor resultado estético/visual.',
    })
  }

  return issues
}

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
  const isCreatingSaleRef = useRef(false)
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
  const [isLifestyleOpen, setIsLifestyleOpen] = useState(false)
  const [isPrioritiesOpen, setIsPrioritiesOpen] = useState(false)
  const [activePriorityPicker, setActivePriorityPicker] = useState<string | null>(null)

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
    if (!authenticatedEmployee || selectedCustomer || query.length !== 0) {
      setAllRecentEvaluations([])
      setIsLoadingDashboard(false)
      return
    }

    setIsLoadingDashboard(true)
    getRecentEvaluationsForEmployee(authenticatedEmployee.id, storeId, 8, true, 7)
      .then((recent) => {
        setAllRecentEvaluations(recent)
      })
      .finally(() => {
        setIsLoadingDashboard(false)
      })
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
    setIsGeneratingAudit(false)
    setIsGeneratingSalesAssist(false)
    setIvisionReferenceSuggestion(null)
    setIvisionReferenceSummary(null)
    setFormError(null)
    setFeedback(null)
  }

  
  const handleSelectEvaluation = (ev: OpticalEvaluationListItem) => {
    // Restaurar estado da avaliação
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
    if (field === 'budgetTarget') {
      const targetBudget = parseNullableNumber(value)
      const faixaOrcamento =
        targetBudget === null
          ? 'nao_informado'
          : targetBudget <= 800
            ? 'ate_800'
            : targetBudget <= 2000
              ? '800_2000'
              : targetBudget <= 5000
                ? '2000_5000'
                : 'acima_5000'

      setForm((prev) => ({
        ...prev,
        budgetTarget: value,
        faixaOrcamento,
      }))
      return
    }

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
    setLensTechnicalTriage(null)
    setLensAudit(null)
    setLensAuditPayload(null)
    setLensSalesAssist(null)
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

    if (aiCaseInput.esferico === null) {
      setFormError('Preencha pelo menos o esférico para a IA recomendar. Cilíndrico e eixo são opcionais.')
      return
    }

    if (recommendationBlockingIssues.length > 0) {
      setFormError(`Corrija antes de gerar sugestao: ${recommendationBlockingIssues[0].message}`)
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
    setIsGeneratingAudit(false)
    setIsGeneratingSalesAssist(false)

    startAiGenerationTransition(async () => {
      const auditPatientContext = buildPatientAuditContext(form, aiCaseInput)
      const technicalTriage: LensTechnicalTriage | null = null
      const recommendationCaseInput = aiCaseInput

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
      setAiFeedback('Sugestões geradas sem triagem IA.')

      // Debug preservado: payload + Sales Assist. A auditoria IA fica comentada para evitar custo/delay nos testes.
      if (payload.recommendations.length > 0) {
        setLensAudit(null)
        setLensSalesAssist(null)
        setIsGeneratingAudit(false)
        setIsGeneratingSalesAssist(true)
        const auditDebugPayload = {
          debugProfileName: form.patientNameRaw || selectedSubjectName || null,
          patient: auditPatientContext,
          technicalTriage,
          motorInput: recommendationCaseInput,
          presentationStrategy: payload.presentationStrategy || null,
          recommendations: payload.recommendations,
        }
        setLensAuditPayload(auditDebugPayload)
        // Restore key: dossie_triplice_motor / Etapa 3 - Auditoria IA.
        // Para religar o debug profundo, reimporte `generateLensAuditAction` de
        // `@/lib/actions/gemini-narratives.actions` e restaure esta chamada:
        //
        // setIsGeneratingAudit(true)
        // generateLensAuditAction(auditPatientContext, payload.recommendations).then((auditResult) => {
        //   if (auditResult.success && auditResult.audit) {
        //     setLensAudit(auditResult.audit)
        //   }
        //   setIsGeneratingAudit(false)
        // }).catch(() => {
        //   setIsGeneratingAudit(false)
        // })
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
        setIsGeneratingAudit(false)
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

  const persistEvaluationForSale = async (recommendation: {
    displayName: string
    commercialSummary: string | null
    recommendedItems: unknown[] | null
  }) => {
    if (!selectedCustomer) {
      setFormError('Selecione o titular antes de criar a venda.')
      return null
    }
    if (!isSubjectChosen) {
      setFormError('Escolha primeiro o paciente avaliado antes de criar a venda.')
      return null
    }
    if (selectedSubjectType === 'dependente' && !selectedDependente) {
      setFormError('Selecione o dependente avaliado antes de criar a venda.')
      return null
    }

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
      recommendedLensName: recommendation.displayName,
      commercialRecommendationRaw: recommendation.commercialSummary,
      recommendedItems: recommendation.recommendedItems,
      extractedText: form.extractedText || null,
      rawPayloadJson: form.rawPayloadJson,
      parseWarning: form.parseWarning || null,
      documentHash: form.documentHash || null
    })

    if (!result.success || !result.data) {
      setFormError(result.message || 'Nao foi possivel salvar a avaliacao antes de criar a venda.')
      return null
    }

    setCurrentEvaluationId(result.data.id)
    return result.data.id
  }

  const handleCreateSaleFromRecommendation = (recommendation: {
    source: 'ai' | 'ivision'
    displayName: string
    globalOfferId?: string | null
    finalPrice?: number | null
    commercialSummary?: string | null
    optionSnapshot?: Record<string, unknown> | null
  }) => {
    if (isCreatingSaleRef.current || isCreatingVenda) return

    isCreatingSaleRef.current = true

    const confirmed = window.confirm(
      `Confirmar criacao da venda?\n\nPaciente: ${selectedSubjectLabel}\nLente: ${recommendation.displayName}\n\nA venda sera criada e a OS abrira pre-configurada com grau, medidas e lente escolhida.`
    )
    if (!confirmed) {
      isCreatingSaleRef.current = false
      return
    }

    setFormError(null)
    setFeedback('Criando venda e OS com a opcao escolhida...')

    startCreateVendaTransition(async () => {
      try {
        const evaluationIdForSale = await persistEvaluationForSale({
          displayName: recommendation.displayName,
          commercialSummary: recommendation.commercialSummary || null,
          recommendedItems: recommendation.optionSnapshot ? [recommendation.optionSnapshot] : null,
        })
        if (!evaluationIdForSale) return

        const result = await createSaleAndServiceOrderFromEvaluation({
          storeId,
          evaluationId: evaluationIdForSale,
          employeeId: authenticatedEmployee?.id ?? null,
          source: recommendation.source,
          displayName: recommendation.displayName,
          globalOfferId: recommendation.globalOfferId || null,
          finalPrice: recommendation.finalPrice ?? null,
          commercialSummary: recommendation.commercialSummary || null,
          optionSnapshot: recommendation.optionSnapshot || null,
        })

        if (!result.success || !result.data) {
          setFormError(result.message || 'Nao foi possivel criar a venda com esta opcao.')
          return
        }

        router.push(`/dashboard/loja/${storeId}/vendas/${result.data.vendaId}/experimental`)
      } finally {
        isCreatingSaleRef.current = false
      }
    })
  }

  const handleApplyAiRecommendation = (option: RecommendationOption) => {
    const displayName = buildAiRecommendationLabel(option)
    const commercialSummary =
      getSalesAssistOptionText(option, lensSalesAssist) ||
      buildAiCommercialSummary(option)

    setForm((prev) => ({
      ...prev,
      recommendedLensName: displayName,
      commercialRecommendationRaw: commercialSummary
    }))
    setFeedback('Sugestao da IA aplicada aos campos comerciais.')
    setFormError(null)

    handleCreateSaleFromRecommendation({
      source: 'ai',
      displayName,
      globalOfferId: option.offerId,
      finalPrice: option.finalPrice,
      commercialSummary,
      optionSnapshot: option as unknown as Record<string, unknown>,
    })
  }

  const handleApplyIvisionRecommendation = () => {
    if (!ivisionReferenceSuggestion) return

    const commercialSummary = ivisionReferenceSummary || form.commercialRecommendationRaw || null
    setForm((prev) => ({
      ...prev,
      recommendedLensName: ivisionReferenceSuggestion,
      commercialRecommendationRaw: commercialSummary || ''
    }))
    setFeedback('Sugestao do iVision aplicada aos campos comerciais.')
    setFormError(null)

    handleCreateSaleFromRecommendation({
      source: 'ivision',
      displayName: ivisionReferenceSuggestion,
      finalPrice: null,
      commercialSummary,
      optionSnapshot: {
        source: 'ivision',
        displayName: ivisionReferenceSuggestion,
        summary: commercialSummary,
        sourceOsNumber: form.sourceOsNumber || null,
        sourceExamType: form.sourceExamType || null,
      },
    })
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
  const recommendationConsistencyIssues = useMemo(
    () => validateRecommendationFormConsistency(form),
    [form]
  )
  const recommendationBlockingIssues = recommendationConsistencyIssues.filter((issue) => issue.severity === 'blocker')
  const patientAge = aiCaseInput.idade ?? null
  const isChild = patientAge !== null && patientAge <= 14
  const hasAdicao = aiCaseInput.adicao !== null
  const usedMultifocalBefore = form.tipoLenteAtual === 'multifocal' || form.tipoLenteAtual === 'bifocal'
  const canGenerateAi =
    hasCatalogForAi &&
    isSubjectChosen &&
    aiCaseInput.esferico !== null &&
    recommendationBlockingIssues.length === 0
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
  const renderPriorityChoice = (
    id: string,
    label: string,
    field: keyof ReturnType<typeof createEmptyForm>,
    options: TabletChoiceOption[]
  ) => (
    <TabletChoicePicker
      id={id}
      label={label}
      value={String(form[field] || '')}
      options={options}
      activePicker={activePriorityPicker}
      onOpen={setActivePriorityPicker}
      onChange={(value) => handleFormChange(field, value)}
    />
  )

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
                  Avaliação
                </h1>
                <p className="mt-1 text-[10px] font-black uppercase tracking-[0.2em] text-indigo-300/80">
                  Pré-venda e histórico individual
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
                    {selectedCustomer.cpf || 'Sem CPF'} • {selectedCustomer.fone_movel || 'Sem telefone'}
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
                          {new Date(item.created_at).toLocaleDateString('pt-BR')} • {item.source_system}
                        </p>
                        <p className="mt-1 text-sm font-black text-white">
                          {item.evaluated_patient_name || item.patient_name_raw || 'Paciente'}
                        </p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          OS {item.source_os_number || 'N/A'} • {item.source_exam_type || 'Avaliação'}
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
              <EvaluationDashboard
                employeeName={authenticatedEmployee?.full_name || ''}
                evaluations={allRecentEvaluations}
                onSelectEvaluation={handleSelectEvaluation}
                isLoading={isLoadingDashboard}
                title="Pacientes Recentes"
                subtitle="Clique para retomar ou iniciar nova avaliação"
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
                    Depois de selecionar o titular, escolha quem foi avaliado na coluna à esquerda. Só então a nova avaliação será aberta.
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
                    Preenchimento Rápido (DEMO):
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
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.solarPlanoSemGrau }))
                      setFeedback('Perfil da Nina (solar plano sem grau) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <UserRound className="h-3.5 w-3.5" /> Nina (Solar 0/0)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.multifocalAcabadaConservadora }))
                      setFeedback('Perfil da Irene (multifocal acabada conservadora) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <ShoppingCart className="h-3.5 w-3.5" /> Irene (Acabada)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.astigmatismoForaConservadora }))
                      setFeedback('Perfil do Rafael (cilindro alto limite) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <CircleHelp className="h-3.5 w-3.5" /> Rafael (Cil Alto)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setForm((prev) => ({ ...prev, ...TEST_PROFILES.visionHaytekPremium }))
                      setFeedback('Perfil da Paula (Vision/Haytek premium) carregado com sucesso!')
                    }}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-300 transition-all hover:border-indigo-500/30 hover:bg-indigo-500/10 hover:text-indigo-200"
                  >
                    <Sparkles className="h-3.5 w-3.5" /> Paula (Vision)
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
                      <p className="mt-1 text-sm font-bold text-slate-200">
                        {form.sourceSystem === 'ivision' ? 'iVision' : 'Manual'}
                      </p>
                    </div>
                    {isIvisionMode && (
                      <div className="col-span-12 md:col-span-8">
                        <label className={labelStyle}>Leitura do PDF</label>
                        {canOpenImportedPdf ? (
                          <p className={`mt-1 text-sm font-bold ${form.parseStatus === 'success' ? 'text-emerald-300' : form.parseStatus === 'partial' ? 'text-amber-300' : 'text-red-300'}`}>
                            {getParseStatusLabel(form.parseStatus)}
                          </p>
                        ) : (
                          <p className="mt-1 text-sm font-bold text-slate-500">
                            Aguardando importação
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className={`${cardStyle} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLifestyleOpen((current) => !current)
                      setIsPrioritiesOpen(false)
                      setActivePriorityPicker(null)
                    }}
                    className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
                    aria-expanded={isLifestyleOpen}
                  >
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                        Estilo de Vida
                      </h3>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {isLifestyleOpen ? 'Rotina diaria aberta' : 'Rotina diaria recolhida'}
                      </p>
                    </div>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-indigo-200 transition-transform ${isLifestyleOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isLifestyleOpen && (
                  <div className="grid grid-cols-12 gap-x-4 gap-y-5 border-t border-white/10 px-5 pb-5 pt-4">
                    <div className="col-span-12 md:col-span-3">
                      <label className={labelStyle}>Idade</label>
                      <AgeStepper
                        value={form.ageYears}
                        onChange={(value) => handleFormChange('ageYears', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Computador"
                        value={form.estiloVidaUsoComputadorHoras}
                        onChange={(value) => handleFormChange('estiloVidaUsoComputadorHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Dirigir"
                        value={form.estiloVidaDirigirHoras}
                        onChange={(value) => handleFormChange('estiloVidaDirigirHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Leitura"
                        value={form.estiloVidaLeituraHoras}
                        onChange={(value) => handleFormChange('estiloVidaLeituraHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Celular"
                        value={form.estiloVidaUsoCelularHoras}
                        onChange={(value) => handleFormChange('estiloVidaUsoCelularHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Exposicao ao Sol"
                        value={form.estiloVidaExposicaoSolHoras}
                        onChange={(value) => handleFormChange('estiloVidaExposicaoSolHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Ambiente Interno"
                        value={form.estiloVidaAmbienteInternoHoras}
                        onChange={(value) => handleFormChange('estiloVidaAmbienteInternoHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Ambiente Externo"
                        value={form.estiloVidaAmbienteExternoHoras}
                        onChange={(value) => handleFormChange('estiloVidaAmbienteExternoHoras', value)}
                      />
                    </div>
                    <div className="col-span-12 md:col-span-3">
                      <HourSlider
                        label="Assistir TV"
                        value={form.estiloVidaAssistirTvHoras}
                        onChange={(value) => handleFormChange('estiloVidaAssistirTvHoras', value)}
                      />
                    </div>
                  </div>
                  )}
                </div>

                <div className={`${cardStyle} overflow-hidden`}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextOpen = !isPrioritiesOpen
                      setIsPrioritiesOpen(nextOpen)
                      setIsLifestyleOpen(false)
                      setActivePriorityPicker(null)
                    }}
                    className="flex min-h-16 w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
                    aria-expanded={isPrioritiesOpen}
                  >
                    <div>
                      <h3 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-300">
                        Queixas e Prioridades
                      </h3>
                      <p className="mt-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                        {isPrioritiesOpen ? 'Preferencias abertas' : 'Preferencias recolhidas'}
                      </p>
                    </div>
                    <ChevronDown className={`h-5 w-5 shrink-0 text-indigo-200 transition-transform ${isPrioritiesOpen ? 'rotate-180' : ''}`} />
                  </button>

                  {isPrioritiesOpen && (
                  <div className="grid grid-cols-12 gap-4 border-t border-white/10 px-5 pb-5 pt-4">
                    {/* SUBSECTION 1: HISTÓRICO E ÓCULOS ATUAL */}
                    <div className="col-span-12">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Histórico e Óculos Atual
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
                      {renderPriorityChoice('tipoLenteAtual', 'Tipo da lente atual', 'tipoLenteAtual', LENS_TYPE_OPTIONS)}
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
                    {usedMultifocalBefore && !isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>Adaptação com lentes anteriores</label>
                        <select
                          value={form.dificuldadeAdaptacao}
                          hidden
                          onChange={(e) => handleFormChange('dificuldadeAdaptacao', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao_informado">Não informado</option>
                          <option value="baixa">Boa adaptação</option>
                          <option value="media">Alguma dificuldade</option>
                          <option value="alta">Muita dificuldade</option>
                        </select>
                        {renderPriorityChoice('dificuldadeAdaptacao', 'Adaptacao com lentes anteriores', 'dificuldadeAdaptacao', ADAPTATION_OPTIONS)}
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
                          <option value="nao_informado">Não informado</option>
                          <option value="nenhuma">Nenhuma recente</option>
                          <option value="uma">Uma troca recente</option>
                          <option value="mais_de_duas">Várias trocas / retrabalho</option>
                        </select>
                        {renderPriorityChoice('historicoTrocasRecentes', 'Trocas recentes de lente', 'historicoTrocasRecentes', CHANGE_HISTORY_OPTIONS)}
                      </div>
                    )}

                    {/* SUBSECTION 2: OBJETIVOS E PREFERÊNCIAS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Objetivos e Preferências
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Prioridade principal</label>
                      {renderPriorityChoice('prioridadePrincipal', 'Prioridade principal', 'prioridadePrincipal', PRIORITY_OPTIONS)}
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
                      {renderPriorityChoice('principalIncomodoAtual', 'Principal incomodo atual', 'principalIncomodoAtual', DISCOMFORT_OPTIONS)}
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
                      {renderPriorityChoice('objetivoCompra', 'Objetivo desta compra', 'objetivoCompra', OBJECTIVE_OPTIONS)}
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
                        <option value="oculos_escritorio">Óculos para trabalho/escritório</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Orçamento (R$)</label>
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
                      <label className={labelStyle}>Aceita Lentes Premium?</label>
                      {renderPriorityChoice('aceitaPremium', 'Aceita lentes premium?', 'aceitaPremium', UNKNOWN_YES_NO_OPTIONS)}
                      <select
                        value={form.aceitaPremium}
                        onChange={(e) => handleFormChange('aceitaPremium', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao_informado">Nao informado</option>
                        <option value="sim">Sim</option>
                        <option value="nao">Nao</option>
                      </select>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Importância de estética/finura</label>
                      {renderPriorityChoice('importanciaEstetica', 'Importancia de estetica/finura', 'importanciaEstetica', IMPORTANCE_OPTIONS)}
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
                      {renderPriorityChoice('importanciaResistencia', 'Importancia de resistencia', 'importanciaResistencia', IMPORTANCE_OPTIONS)}
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
                      {renderPriorityChoice('prefereTransitions', 'Prefere Transitions?', 'prefereTransitions', UNKNOWN_YES_NO_OPTIONS)}
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
                      {renderPriorityChoice('prefereBlueUv', 'Prefere Blue/UV?', 'prefereBlueUv', UNKNOWN_YES_NO_OPTIONS)}
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

                    {/* SUBSECTION 3: SINTOMAS E COMPORTAMENTOS */}
                    <div className="col-span-12 mt-4">
                      <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2 pb-2 border-b border-white/5">
                        Sintomas e Comportamentos
                      </h4>
                    </div>
                    <div className="col-span-12 md:col-span-4">
                      <label className={labelStyle}>Dificuldade para dirigir à noite</label>
                      {renderPriorityChoice('queixaDirigirNoite', 'Dificuldade para dirigir a noite', 'queixaDirigirNoite', YES_NO_OPTIONS)}
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
                      {renderPriorityChoice('queixaSensibilidadeLuz', 'Sensibilidade a luz', 'queixaSensibilidadeLuz', YES_NO_OPTIONS)}
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
                      {renderPriorityChoice('queixaQuebraOculos', 'Quebra oculos com frequencia', 'queixaQuebraOculos', YES_NO_OPTIONS)}
                      <select
                        value={form.queixaQuebraOculos}
                        onChange={(e) => handleFormChange('queixaQuebraOculos', e.target.value)}
                        className={selectStyle}
                      >
                        <option value="nao">Não</option>
                        <option value="sim">Sim</option>
                      </select>
                    </div>
                    {isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>Criança muito ativa</label>
                        {renderPriorityChoice('queixaCriancaAtiva', 'Crianca muito ativa', 'queixaCriancaAtiva', YES_NO_OPTIONS)}
                        <select
                          value={form.queixaCriancaAtiva}
                          onChange={(e) => handleFormChange('queixaCriancaAtiva', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao">Não</option>
                          <option value="sim">Sim</option>
                        </select>
                      </div>
                    )}
                    {isChild && (
                      <div className="col-span-12 md:col-span-4">
                        <label className={labelStyle}>Grau aumentando rápido</label>
                        {renderPriorityChoice('queixaProgressaoRapida', 'Grau aumentando rapido', 'queixaProgressaoRapida', YES_NO_OPTIONS)}
                        <select
                          value={form.queixaProgressaoRapida}
                          onChange={(e) => handleFormChange('queixaProgressaoRapida', e.target.value)}
                          className={selectStyle}
                        >
                          <option value="nao">Não</option>
                          <option value="sim">Sim</option>
                        </select>
                      </div>
                    )}

                    {/* SUBSECTION 4: OBSERVAÇÕES ADICIONAIS */}
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
                  )}
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
                        {recommendationConsistencyIssues.length > 0 && (
                          <div className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                            recommendationBlockingIssues.length > 0
                              ? 'border-red-500/30 bg-red-500/10 text-red-100'
                              : 'border-amber-500/30 bg-amber-500/10 text-amber-100'
                          }`}>
                            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em]">
                              <AlertTriangle className="h-4 w-4" />
                              {recommendationBlockingIssues.length > 0
                                ? 'Corrija antes de gerar sugestão'
                                : 'Atenção antes de gerar sugestão'}
                            </div>
                            <div className="mt-3 space-y-3">
                              {recommendationConsistencyIssues.map((issue, index) => (
                                <div key={`${issue.severity}-${index}`} className="rounded-lg border border-white/10 bg-black/10 p-3">
                                  <p className="font-bold">{issue.message}</p>
                                  <p className="mt-1 text-xs opacity-80">{issue.suggestion}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-fuchsia-300">
                              Sugestão assistida por IA
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

                        {SHOW_LENS_ENGINE_DIAGNOSTIC_SUITE && (
                        <details
                          open={Boolean(lensTechnicalTriage || lensAuditPayload || lensAudit || isGeneratingAudit)}
                          className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-3"
                        >
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
                                <Sparkles className="h-3 w-3" /> Debug IA — Auditoria da Indicação
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
                              ? <span className="flex items-center gap-2 text-amber-400/70 text-sm italic"><Loader2 className="h-3 w-3 animate-spin" />Analisando indicações...</span>
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
                                <FileSearch className="h-3 w-3" /> Debug IA — Payload da Auditoria
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
                              <button
                                type="button"
                                onClick={handleApplyIvisionRecommendation}
                                disabled={isCreatingVenda}
                                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isCreatingVenda ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                Aplicar opção iVision
                              </button>
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
                                  <p className="mt-3 whitespace-pre-line rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                    {buildSellerVisibleOptionNarrative(aiTopRecommendation, 0, aiTopRecommendation, lensSalesAssist)}
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => handleApplyAiRecommendation(aiTopRecommendation)}
                                    disabled={isCreatingVenda}
                                    className="mt-auto ml-auto inline-flex items-center gap-2 rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {isCreatingVenda ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
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
                                    <p className="mt-3 whitespace-pre-line rounded-xl border border-cyan-500/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                                      {buildSellerVisibleOptionNarrative(option, index, aiRecommendations[0] || option, lensSalesAssist)}
                                    </p>
                                  </div>
                                  <div className="flex lg:min-w-[220px] lg:max-w-sm lg:flex-col lg:justify-end">
                                    <button
                                      type="button"
                                      onClick={() => handleApplyAiRecommendation(option)}
                                      disabled={isCreatingVenda}
                                      className="mt-auto ml-auto inline-flex items-center gap-2 self-end rounded-xl bg-fuchsia-500 px-4 py-2 text-xs font-black uppercase tracking-[0.15em] text-white hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      {isCreatingVenda ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                                      Aplicar esta opção
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

                        {!isGeneratingAi && !aiRecommendations.length && null}
                      </div>
                    )}
                    {showManualSuggestionBlock && (
                      <div className="col-span-12 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                          <div>
                            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                              Sugestão do Sistema
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

                <div className="sticky bottom-0 z-20 -mx-2 mt-4 border-t border-white/10 bg-slate-950/90 px-2 pt-4 pb-2 backdrop-blur-md">
                  <div className="flex justify-end gap-3">
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


