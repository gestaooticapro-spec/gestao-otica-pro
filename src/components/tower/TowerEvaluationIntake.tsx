'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ChevronDown, Loader2, Minus, Plus, Search, Sparkles, User } from 'lucide-react'
import { searchCustomersByName } from '@/lib/actions/vendas.actions'
import { createQuickCustomer } from '@/lib/actions/customer.actions'
import { upsertOpticalEvaluation } from '@/lib/actions/evaluation.actions'
import { generateLensRecommendationsAction } from '@/lib/actions/lens-recommendation.actions'
import { linkCustomerToTowerSession, linkEvaluationToTowerSession, type TowerSessionContext } from '@/lib/actions/tower-session.actions'
import type { RecommendationOption } from '@/lib/server/lens-recommendation'
import { buildRecommendationCaseInput } from '@/lib/recommendation/evaluation-case-input'

type CustomerOption = { id: number; full_name: string; fone_movel?: string | null }

type Props = {
  storeId: number
  towerSessionId: string
  heatmapSessionId: string
  activeCatalogVersionId: string | null
  initialSessionContext?: TowerSessionContext
}

const prescriptionFields = [
  ['receitaLongeOdEsferico', 'OD Esf.', '0.00'],
  ['receitaLongeOdCilindrico', 'OD Cil.', '0.00'],
  ['receitaLongeOdEixo', 'OD Eixo', '0'],
  ['receitaLongeOeEsferico', 'OE Esf.', '0.00'],
  ['receitaLongeOeCilindrico', 'OE Cil.', '0.00'],
  ['receitaLongeOeEixo', 'OE Eixo', '0'],
  ['receitaAdicao', 'Adição', '0.00'],
] as const

type PrescriptionFieldKey = typeof prescriptionFields[number][0]
type PrescriptionPickerKind = 'sphere' | 'cylinder' | 'axis' | 'addition'
type PrescriptionPickerField = { key: PrescriptionFieldKey; label: string; kind: PrescriptionPickerKind }

const prescriptionPickerFields: PrescriptionPickerField[] = [
  { key: 'receitaLongeOdEsferico', label: 'OD Esf.', kind: 'sphere' },
  { key: 'receitaLongeOdCilindrico', label: 'OD Cil.', kind: 'cylinder' },
  { key: 'receitaLongeOdEixo', label: 'OD Eixo', kind: 'axis' },
  { key: 'receitaLongeOeEsferico', label: 'OE Esf.', kind: 'sphere' },
  { key: 'receitaLongeOeCilindrico', label: 'OE Cil.', kind: 'cylinder' },
  { key: 'receitaLongeOeEixo', label: 'OE Eixo', kind: 'axis' },
  { key: 'receitaAdicao', label: 'Adição', kind: 'addition' },
]

function formatQuarter(value: number, withPositiveSign = false) {
  if (Math.abs(value) < 0.001) return '0.00'
  return `${value > 0 && withPositiveSign ? '+' : ''}${value.toFixed(2)}`
}

const sphereValues = Array.from({ length: 97 }, (_, index) => formatQuarter((index - 48) * 0.25, true))
const cylinderValues = Array.from({ length: 25 }, (_, index) => formatQuarter(-index * 0.25))
const additionValues = Array.from({ length: 17 }, (_, index) => formatQuarter(index * 0.25, true))

function getPickerValues(kind: PrescriptionPickerKind) {
  if (kind === 'sphere') return sphereValues
  if (kind === 'cylinder') return cylinderValues
  if (kind === 'addition') return additionValues
  return []
}

function DegreeWheel({
  values,
  selectedValue,
  onSelect,
}: {
  values: string[]
  selectedValue: string
  onSelect: (value: string) => void
}) {
  const selectedRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedRef.current?.scrollIntoView({ block: 'center' })
  }, [selectedValue, values])

  return (
    <div className="max-h-64 snap-y overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl shadow-black/30">
      {values.map((value) => {
        const selected = value === selectedValue
        return (
          <button
            key={value}
            ref={selected ? selectedRef : null}
            type="button"
            onClick={() => onSelect(value)}
            className={`flex min-h-11 w-full snap-center items-center justify-center rounded-xl text-lg font-black transition ${selected ? 'bg-cyan-400 text-slate-950' : 'text-slate-200 hover:bg-white/10'}`}
          >
            {value}
          </button>
        )
      })}
    </div>
  )
}

function AxisProtractor({ value, onSelect }: { value: string; onSelect: (value: string) => void }) {
  const current = Math.min(180, Math.max(0, Number.parseInt(value || '0', 10) || 0))
  const centerX = 150
  const centerY = 145
  const radius = 112
  const point = (angle: number, length: number) => {
    const radians = (angle * Math.PI) / 180
    return { x: centerX + Math.cos(radians) * length, y: centerY - Math.sin(radians) * length }
  }
  const selectedPoint = point(current, radius - 16)

  function chooseAxis(event: React.PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * 300
    const y = ((event.clientY - rect.top) / rect.height) * 180
    const angle = (Math.atan2(centerY - Math.min(y, centerY), x - centerX) * 180) / Math.PI
    onSelect(String(angle < 0 ? 0 : Math.min(180, Math.round(angle))))
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3">
      <div className="mb-1 flex items-center justify-between gap-3 px-1">
        <p className="text-xs font-bold text-slate-300">Arraste pelo transferidor ou toque no grau.</p>
        <span className="shrink-0 rounded-lg bg-cyan-400 px-2 py-1 text-sm font-black text-slate-950">{String(current).padStart(3, '0')}°</span>
      </div>
      <svg viewBox="0 0 300 180" onPointerDown={chooseAxis} onPointerMove={(event) => event.buttons === 1 && chooseAxis(event)} className="h-auto w-full touch-none select-none" aria-label="Transferidor para selecionar eixo de 0 a 180 graus">
        <path d="M 38 145 A 112 112 0 0 1 262 145" fill="none" stroke="rgba(148,163,184,0.45)" strokeWidth="2" />
        <path d="M 54 145 A 96 96 0 0 1 246 145" fill="none" stroke="rgba(34,211,238,0.16)" strokeWidth="22" />
        {Array.from({ length: 19 }, (_, index) => index * 10).map((angle) => {
          const outer = point(angle, radius)
          const inner = point(angle, radius - (angle % 30 === 0 ? 14 : 8))
          return <line key={angle} x1={outer.x} y1={outer.y} x2={inner.x} y2={inner.y} stroke="rgba(226,232,240,0.8)" strokeWidth={angle % 30 === 0 ? 2 : 1} />
        })}
        {[0, 30, 60, 90, 120, 150, 180].map((angle) => {
          const label = point(angle, radius - 30)
          return <text key={angle} x={label.x} y={label.y + 4} textAnchor="middle" fill="rgba(226,232,240,0.8)" fontSize="11" fontWeight="800">{angle}</text>
        })}
        <line x1={centerX} y1={centerY} x2={selectedPoint.x} y2={selectedPoint.y} stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
        <circle cx={centerX} cy={centerY} r="7" fill="#22d3ee" />
        <circle cx={selectedPoint.x} cy={selectedPoint.y} r="7" fill="#f8fafc" stroke="#22d3ee" strokeWidth="4" />
      </svg>
    </div>
  )
}

type TowerInterview = {
  ageYears: string
  estiloVidaUsoComputadorHoras: string
  estiloVidaDirigirHoras: string
  estiloVidaLeituraHoras: string
  estiloVidaUsoCelularHoras: string
  estiloVidaExposicaoSolHoras: string
  estiloVidaAmbienteInternoHoras: string
  estiloVidaAmbienteExternoHoras: string
  estiloVidaAssistirTvHoras: string
  marcaAtual: string
  tipoLenteAtual: string
  usaMultifocalHoje: string
  dificuldadeAdaptacao: string
  historicoTrocasRecentes: string
  prioridadePrincipal: string
  principalIncomodoAtual: string
  objetivoCompra: string
  budgetTarget: string
  aceitaPremium: string
  importanciaEstetica: string
  importanciaResistencia: string
  prefereTransitions: string
  prefereBlueUv: string
  queixaDirigirNoite: string
  queixaSensibilidadeLuz: string
  queixaQuebraOculos: string
  queixaCriancaAtiva: string
  queixaProgressaoRapida: string
  observacoesConsultor: string
}

const emptyInterview = (): TowerInterview => ({
  ageYears: '30', estiloVidaUsoComputadorHoras: '0', estiloVidaDirigirHoras: '0', estiloVidaLeituraHoras: '0', estiloVidaUsoCelularHoras: '0', estiloVidaExposicaoSolHoras: '0', estiloVidaAmbienteInternoHoras: '0', estiloVidaAmbienteExternoHoras: '0', estiloVidaAssistirTvHoras: '0',
  marcaAtual: '', tipoLenteAtual: 'nao_informado', usaMultifocalHoje: 'nao_informado', dificuldadeAdaptacao: 'nao_informado', historicoTrocasRecentes: 'nao_informado', prioridadePrincipal: 'equilibrio', principalIncomodoAtual: 'nao_informado', objetivoCompra: 'nao_informado', budgetTarget: '', aceitaPremium: 'nao_informado', importanciaEstetica: 'nao_informado', importanciaResistencia: 'nao_informado', prefereTransitions: 'nao_informado', prefereBlueUv: 'nao_informado', queixaDirigirNoite: 'nao', queixaSensibilidadeLuz: 'nao', queixaQuebraOculos: 'nao', queixaCriancaAtiva: 'nao', queixaProgressaoRapida: 'nao', observacoesConsultor: '',
})

const customerProfiles: Array<{ key: string; label: string; description: string; values: Partial<TowerInterview> }> = [
  { key: 'primeira_multifocal', label: 'Primeira multifocal', description: 'Telas e leitura; prioridade em adaptação.', values: { ageYears: '48', estiloVidaUsoComputadorHoras: '6', estiloVidaLeituraHoras: '2', estiloVidaUsoCelularHoras: '3', estiloVidaAmbienteInternoHoras: '9', tipoLenteAtual: 'visao_simples', usaMultifocalHoje: 'nao', dificuldadeAdaptacao: 'alta', prioridadePrincipal: 'adaptacao', principalIncomodoAtual: 'perto', objetivoCompra: 'primeira_multifocal', budgetTarget: '2500', prefereBlueUv: 'sim' } },
  { key: 'conforto_progressivo', label: 'Conforto progressivo', description: 'Já usa multifocal e busca mais conforto.', values: { ageYears: '58', estiloVidaUsoComputadorHoras: '4', estiloVidaDirigirHoras: '2', estiloVidaLeituraHoras: '3', estiloVidaUsoCelularHoras: '2', tipoLenteAtual: 'multifocal', usaMultifocalHoje: 'sim', dificuldadeAdaptacao: 'baixa', prioridadePrincipal: 'equilibrio', principalIncomodoAtual: 'intermediario', objetivoCompra: 'upgrade', budgetTarget: '4500', aceitaPremium: 'sim' } },
  { key: 'telas_intenso', label: 'Uso intenso de telas', description: 'Computador e celular por muitas horas.', values: { ageYears: '45', estiloVidaUsoComputadorHoras: '9', estiloVidaUsoCelularHoras: '4', estiloVidaLeituraHoras: '2', estiloVidaAmbienteInternoHoras: '10', prioridadePrincipal: 'adaptacao', principalIncomodoAtual: 'intermediario', objetivoCompra: 'oculos_escritorio', budgetTarget: '3000', prefereBlueUv: 'sim' } },
  { key: 'direcao_sol', label: 'Direção e sol', description: 'Rotina externa, direção e conforto à luz.', values: { ageYears: '55', estiloVidaDirigirHoras: '4', estiloVidaExposicaoSolHoras: '3', estiloVidaAmbienteExternoHoras: '4', tipoLenteAtual: 'multifocal', usaMultifocalHoje: 'sim', prioridadePrincipal: 'premium', principalIncomodoAtual: 'reflexo', objetivoCompra: 'upgrade', budgetTarget: '4500', aceitaPremium: 'sim', prefereTransitions: 'sim', queixaDirigirNoite: 'sim', queixaSensibilidadeLuz: 'sim' } },
  { key: 'economia_equilibrio', label: 'Economia equilibrada', description: 'Prioriza solução adequada com investimento controlado.', values: { ageYears: '52', estiloVidaUsoComputadorHoras: '3', estiloVidaLeituraHoras: '2', tipoLenteAtual: 'visao_simples', prioridadePrincipal: 'economia', principalIncomodoAtual: 'perto', objetivoCompra: 'resolver_queixa', budgetTarget: '1800', aceitaPremium: 'nao' } },
]

const currentLensBrands = ['Varilux', 'Zeiss', 'Hoya', 'Nikon', 'Kodak', 'Shamir', 'Rodenstock', 'Essilor']

function numberValue(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function buildRecommendationInput(recipe: Record<string, string>, interview: TowerInterview) {
  return buildRecommendationCaseInput({ ...interview, ...recipe })
}

function ChoiceChips({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div>
    <p className="text-sm font-black text-slate-100">{label}</p>
    <div className="mt-2 flex flex-wrap gap-2">
      {options.map(([optionValue, optionLabel]) => <button key={optionValue} type="button" onClick={() => onChange(optionValue)} className={`rounded-xl border px-3 py-2 text-xs font-black transition ${value === optionValue ? 'border-cyan-300 bg-cyan-400 text-slate-950' : 'border-white/10 bg-slate-950 text-slate-300 hover:border-cyan-300/50'}`}>{optionLabel}</button>)}
    </div>
  </div>
}

function HourControl({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const amount = Math.max(0, Math.min(16, Math.round(numberValue(value))))
  return <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/70 px-3 py-3">
    <p className="text-sm font-bold text-slate-100">{label}</p>
    <div className="flex items-center gap-2">
      <button type="button" aria-label={`Diminuir ${label}`} onClick={() => onChange(String(Math.max(0, amount - 1)))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-200"><Minus className="h-4 w-4" /></button>
      <span className="w-9 text-center text-lg font-black text-cyan-200">{amount}h</span>
      <button type="button" aria-label={`Aumentar ${label}`} onClick={() => onChange(String(Math.min(16, amount + 1)))} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-slate-200"><Plus className="h-4 w-4" /></button>
    </div>
  </div>
}

export default function TowerEvaluationIntake({
  storeId,
  towerSessionId,
  heatmapSessionId,
  activeCatalogVersionId,
  initialSessionContext,
}: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CustomerOption[]>([])
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(initialSessionContext?.customer ?? null)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [quickName, setQuickName] = useState('')
  const [quickPhone, setQuickPhone] = useState('')
  const [recipe, setRecipe] = useState<Record<string, string>>(() => {
    const snapshot = initialSessionContext?.session.prescription_snapshot as { od?: { sphere?: number; cylinder?: number; axis?: number }; oe?: { sphere?: number; cylinder?: number; axis?: number }; addition?: number } | null
    if (!snapshot) return {} as Record<string, string>
    return {
      receitaLongeOdEsferico: formatQuarter(snapshot.od?.sphere ?? 0, true),
      receitaLongeOdCilindrico: formatQuarter(snapshot.od?.cylinder ?? 0),
      receitaLongeOdEixo: String(snapshot.od?.axis ?? 0),
      receitaLongeOeEsferico: formatQuarter(snapshot.oe?.sphere ?? 0, true),
      receitaLongeOeCilindrico: formatQuarter(snapshot.oe?.cylinder ?? 0),
      receitaLongeOeEixo: String(snapshot.oe?.axis ?? 0),
      receitaAdicao: formatQuarter(snapshot.addition ?? 0, true),
    }
  })
  const [activePrescriptionField, setActivePrescriptionField] = useState<PrescriptionFieldKey | null>(null)
  const [interview, setInterview] = useState<TowerInterview>(emptyInterview)
  const [selectedProfileKey, setSelectedProfileKey] = useState<string | null>(null)
  const [activeInterviewModal, setActiveInterviewModal] = useState<'lifestyle' | 'priorities' | null>(null)
  const [brandDropdownOpen, setBrandDropdownOpen] = useState(false)
  const brandInputRef = useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [suggestions, setSuggestions] = useState<RecommendationOption[]>([])

  async function selectCustomer(customer: CustomerOption) {
    setBusy(true)
    const linked = await linkCustomerToTowerSession({ storeId, sessionId: towerSessionId, customerId: customer.id })
    if (linked.success) {
      setSelectedCustomer(customer)
      setResults([])
      setMessage('Cliente titular selecionado.')
    } else {
      setMessage(linked.message)
    }
    setBusy(false)
  }

  async function searchCustomers() {
    if (!query.trim()) return
    setBusy(true)
    const response = await searchCustomersByName(query, storeId)
    setResults((response.success ? response.data : []) as CustomerOption[])
    setMessage(response.success ? '' : response.message || 'Não foi possível buscar clientes.')
    setBusy(false)
  }

  async function createCustomer() {
    setBusy(true)
    const form = new FormData()
    form.set('store_id', String(storeId))
    form.set('full_name', quickName)
    form.set('fone_movel', quickPhone)
    const created = await createQuickCustomer(form)
    if (created.success && created.data) {
      setQuickCreateOpen(false)
      await selectCustomer({ id: created.data.id, full_name: created.data.full_name, fone_movel: created.data.fone_movel })
    } else {
      setMessage(created.message)
    }
    setBusy(false)
  }

  async function generateSuggestions() {
    if (!selectedCustomer) {
      setMessage('Selecione o cliente titular antes de gerar sugestões.')
      return
    }
    if (!activeCatalogVersionId) {
      setMessage('Não existe catálogo ativo para gerar sugestões nesta loja.')
      return
    }

    setBusy(true)
    const recommendationInput = buildRecommendationInput(recipe, interview)
    const saved = await upsertOpticalEvaluation({
      storeId,
      evaluatedCustomerId: selectedCustomer.id,
      evaluatedDependenteId: null,
      responsibleCustomerId: selectedCustomer.id,
      evaluatedNameSnapshot: selectedCustomer.full_name,
      responsibleNameSnapshot: selectedCustomer.full_name,
      relationshipSnapshot: 'Titular',
      sourceSystem: 'manual',
      status: 'em_andamento',
      parseStatus: 'success',
      receitaLongeOdEsferico: recipe.receitaLongeOdEsferico || null,
      receitaLongeOdCilindrico: recipe.receitaLongeOdCilindrico || null,
      receitaLongeOdEixo: recipe.receitaLongeOdEixo || null,
      receitaLongeOeEsferico: recipe.receitaLongeOeEsferico || null,
      receitaLongeOeCilindrico: recipe.receitaLongeOeCilindrico || null,
      receitaLongeOeEixo: recipe.receitaLongeOeEixo || null,
      receitaAdicao: recipe.receitaAdicao || null,
      ageYears: Math.round(numberValue(interview.ageYears)) || null,
      estiloVidaUsoComputadorHoras: numberValue(interview.estiloVidaUsoComputadorHoras),
      estiloVidaDirigirHoras: numberValue(interview.estiloVidaDirigirHoras),
      estiloVidaLeituraHoras: numberValue(interview.estiloVidaLeituraHoras),
      estiloVidaUsoCelularHoras: numberValue(interview.estiloVidaUsoCelularHoras),
      estiloVidaExposicaoSolHoras: numberValue(interview.estiloVidaExposicaoSolHoras),
      estiloVidaAmbienteInternoHoras: numberValue(interview.estiloVidaAmbienteInternoHoras),
      estiloVidaAmbienteExternoHoras: numberValue(interview.estiloVidaAmbienteExternoHoras),
      estiloVidaAssistirTvHoras: numberValue(interview.estiloVidaAssistirTvHoras),
      rawPayloadJson: { tower_session_id: towerSessionId, tower_heatmap_session_id: heatmapSessionId, tower_profile: interview, tower_profile_key: selectedProfileKey },
    })

    if (!saved.success || !saved.data) {
      setMessage(saved.message)
      setBusy(false)
      return
    }

    const linked = await linkEvaluationToTowerSession({ storeId, sessionId: towerSessionId, evaluationId: saved.data.id })
    if (!linked.success) {
      setMessage(linked.message)
      setBusy(false)
      return
    }

    const generated = await generateLensRecommendationsAction({
      storeId,
      versionId: activeCatalogVersionId,
      ...recommendationInput,
      heatmapSessionId,
    })

    if (!generated.success) {
      setMessage(generated.message)
      setBusy(false)
      return
    }

    const data = generated.data as { recommendations?: RecommendationOption[] } | undefined
    setSuggestions(data?.recommendations ?? [])
    setMessage('Sugestões geradas a partir da receita, entrevista e Campo Visual.')
    setBusy(false)
  }

  const activeField = prescriptionPickerFields.find((field) => field.key === activePrescriptionField) ?? null
  const activeValue = activeField ? recipe[activeField.key] ?? (activeField.kind === 'axis' ? '0' : '0.00') : ''

  function choosePrescriptionValue(value: string) {
    if (!activeField) return
    setRecipe((current) => ({ ...current, [activeField.key]: value }))
    if (activeField.kind !== 'axis') setActivePrescriptionField(null)
  }

  function updateInterview<K extends keyof TowerInterview>(key: K, value: TowerInterview[K]) {
    setInterview((current) => ({ ...current, [key]: value }))
  }

  function applyProfile(profile: typeof customerProfiles[number]) {
    setInterview((current) => ({ ...current, ...profile.values }))
    setSelectedProfileKey(profile.key)
    setMessage(`Perfil “${profile.label}” aplicado. Ajuste os detalhes da conversa se necessário.`)
  }

  function chooseCurrentLensBrand(brand: string) {
    updateInterview('marcaAtual', `${brand} `)
    setBrandDropdownOpen(false)
    window.requestAnimationFrame(() => brandInputRef.current?.focus())
  }

  const lifestyleSummary = [
    numberValue(interview.estiloVidaUsoComputadorHoras) > 0 && `Computador ${interview.estiloVidaUsoComputadorHoras}h`,
    numberValue(interview.estiloVidaDirigirHoras) > 0 && `Direção ${interview.estiloVidaDirigirHoras}h`,
    numberValue(interview.estiloVidaLeituraHoras) > 0 && `Leitura ${interview.estiloVidaLeituraHoras}h`,
  ].filter(Boolean).join(' · ') || 'Defina a rotina do cliente'
  const prioritiesSummary = `${interview.prioridadePrincipal === 'equilibrio' ? 'Equilíbrio' : interview.prioridadePrincipal} · ${interview.principalIncomodoAtual === 'nao_informado' ? 'sem queixa principal' : interview.principalIncomodoAtual}`

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-5 py-4 text-white sm:px-7 sm:py-5">
      <header className="mx-auto flex w-full max-w-5xl items-center gap-3">
        <Link href={`/torre/${storeId}/campo-visual?session=${towerSessionId}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:bg-white/10">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.22em] text-cyan-300">Torre de experiência</p>
          <h1 className="text-xl font-black">Avaliação</h1>
        </div>
      </header>

      <div className="mx-auto mt-5 grid w-full max-w-5xl gap-5 lg:grid-cols-[0.9fr_1.1fr]">
        <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">1. Cliente titular</p>
          {selectedCustomer ? (
            <div className="mt-4 rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4">
              <p className="text-sm text-emerald-100">Titular selecionado</p>
              <p className="mt-1 text-lg font-black">{selectedCustomer.full_name}</p>
              <button type="button" onClick={() => setSelectedCustomer(null)} className="mt-3 text-xs font-bold text-slate-300 underline">Trocar cliente</button>
            </div>
          ) : (
            <>
              <div className="mt-4 flex gap-2">
                <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void searchCustomers()} placeholder="Buscar por nome ou CPF" className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm outline-none focus:border-cyan-300" />
                <button type="button" onClick={() => void searchCustomers()} disabled={busy} className="rounded-xl bg-cyan-400 px-3 text-slate-950"><Search className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 space-y-2">
                {results.map((customer) => <button key={customer.id} type="button" onClick={() => void selectCustomer(customer)} className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-slate-950/60 px-3 py-3 text-left hover:border-cyan-300/40"><span className="font-bold">{customer.full_name}</span><User className="h-4 w-4 text-slate-400" /></button>)}
              </div>
              <button type="button" onClick={() => setQuickCreateOpen(!quickCreateOpen)} className="mt-4 inline-flex items-center gap-2 text-sm font-black text-cyan-200"><Plus className="h-4 w-4" /> Cadastrar cliente rapidamente</button>
              {quickCreateOpen && <div className="mt-3 space-y-2 rounded-2xl border border-white/10 bg-slate-950/60 p-3"><input value={quickName} onChange={(event) => setQuickName(event.target.value)} placeholder="Nome completo" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm" /><input value={quickPhone} onChange={(event) => setQuickPhone(event.target.value)} placeholder="Celular" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm" /><button type="button" onClick={() => void createCustomer()} disabled={busy} className="w-full rounded-xl bg-cyan-400 px-3 py-2.5 text-sm font-black text-slate-950">Salvar cliente</button></div>}
            </>
          )}
        </section>

        <section className="rounded-[28px] border border-white/10 bg-slate-900/70 p-5">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-200">2. Receita e entrevista</p>
          <h2 className="mt-2 text-xl font-black">Campos da receita</h2>
          <p className="mt-1 text-sm text-slate-400">Toque em um campo para escolher o grau. Esfera usa sinal positivo e negativo; cilindro fica sempre negativo.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {prescriptionPickerFields.map((field) => {
              const value = recipe[field.key] ?? (field.kind === 'axis' ? '0' : '0.00')
              const isActive = activePrescriptionField === field.key
              return (
                <div key={field.key} className="text-xs font-bold text-slate-300">
                  <span className="mb-1 block">{field.label}</span>
                  <button
                    type="button"
                    onClick={() => setActivePrescriptionField(isActive ? null : field.key)}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3 text-left text-base font-black outline-none transition ${isActive ? 'border-cyan-300 bg-cyan-400/10 text-cyan-100' : 'border-white/10 bg-slate-950 text-white hover:border-cyan-300/50'}`}
                  >
                    <span>{field.kind === 'axis' ? `${String(Number.parseInt(value || '0', 10) || 0).padStart(3, '0')}°` : value}</span>
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition ${isActive ? 'rotate-180 text-cyan-200' : ''}`} />
                  </button>
                </div>
              )
            })}
          </div>
          <h2 className="mt-6 text-xl font-black">Perfil do cliente</h2>
          <p className="mt-1 text-sm text-slate-400">Comece por um perfil comum. Ele preenche a entrevista, sem alterar o cliente ou a receita.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {customerProfiles.map((profile) => (
              <button key={profile.key} type="button" onClick={() => applyProfile(profile)} className={`rounded-2xl border p-3 text-left transition ${selectedProfileKey === profile.key ? 'border-cyan-300 bg-cyan-400/15' : 'border-slate-700/80 bg-slate-950/45 hover:border-slate-500'}`}>
                <p className="text-sm font-black text-white">{profile.label}</p>
                <p className="mt-1 text-xs leading-4 text-slate-400">{profile.description}</p>
              </button>
            ))}
          </div>
          <div className="mt-5 border-t border-cyan-300/15 pt-4">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Entrevista do cliente</p>
            <p className="mt-1 text-sm text-slate-400">Complete os detalhes que dão contexto à indicação.</p>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button type="button" onClick={() => setActiveInterviewModal('lifestyle')} className="flex min-h-20 items-center justify-between rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-3 text-left shadow-lg shadow-cyan-950/20 transition hover:border-cyan-200 hover:bg-cyan-400/15">
              <span><span className="block text-sm font-black text-cyan-50">Estilo de vida</span><span className="mt-1 block text-xs text-cyan-100/65">{lifestyleSummary}</span></span><ChevronDown className="h-4 w-4 text-cyan-200" />
            </button>
            <button type="button" onClick={() => setActiveInterviewModal('priorities')} className="flex min-h-20 items-center justify-between rounded-2xl border border-cyan-300/35 bg-cyan-400/10 p-3 text-left shadow-lg shadow-cyan-950/20 transition hover:border-cyan-200 hover:bg-cyan-400/15">
              <span><span className="block text-sm font-black text-cyan-50">Queixas e prioridades</span><span className="mt-1 block text-xs capitalize text-cyan-100/65">{prioritiesSummary}</span></span><ChevronDown className="h-4 w-4 text-cyan-200" />
            </button>
          </div>
          <button type="button" onClick={() => void generateSuggestions()} disabled={!selectedCustomer || busy} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-4 text-sm font-black text-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar sugestões</button>
        </section>
      </div>

      {(message || suggestions.length > 0) && <section className="mx-auto mt-5 w-full max-w-5xl rounded-[28px] border border-white/10 bg-slate-900/70 p-5"><p className="text-sm text-cyan-100">{message}</p>{suggestions.length > 0 && <div className="mt-4 grid gap-3 sm:grid-cols-3">{suggestions.map((option) => <article key={option.configKey} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4"><p className="font-black">{option.familyName}</p><p className="mt-1 text-sm text-slate-300">{option.offerLabel}</p><p className="mt-3 text-xs leading-5 text-slate-400">{option.reasons[0] || option.commercialSummary}</p></article>)}</div>}</section>}
      {activeInterviewModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label={activeInterviewModal === 'lifestyle' ? 'Estilo de vida' : 'Queixas e prioridades'}>
          <button type="button" aria-label="Fechar entrevista" onClick={() => setActiveInterviewModal(null)} className="absolute inset-0 cursor-default" />
          <section className="relative z-10 flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-t-[28px] border border-white/15 bg-slate-900 shadow-2xl shadow-black/60 sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-5">
              <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Entrevista</p><h3 className="mt-1 text-xl font-black">{activeInterviewModal === 'lifestyle' ? 'Estilo de vida' : 'Queixas e prioridades'}</h3></div>
              <button type="button" onClick={() => setActiveInterviewModal(null)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300">Concluir</button>
            </div>
            {activeInterviewModal === 'lifestyle' ? (
              <div className="space-y-5 overflow-y-auto p-5">
                <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3"><p className="text-sm font-black">Idade</p><div className="mt-2 flex items-center gap-2"><button type="button" onClick={() => updateInterview('ageYears', String(Math.max(1, numberValue(interview.ageYears) - 1)))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10"><Minus className="h-4 w-4" /></button><span className="w-16 text-center text-xl font-black text-cyan-200">{Math.max(1, Math.round(numberValue(interview.ageYears)))}</span><button type="button" onClick={() => updateInterview('ageYears', String(Math.min(110, numberValue(interview.ageYears) + 1)))} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10"><Plus className="h-4 w-4" /></button><span className="text-sm text-slate-400">anos</span></div></div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <HourControl label="Computador" value={interview.estiloVidaUsoComputadorHoras} onChange={(value) => updateInterview('estiloVidaUsoComputadorHoras', value)} />
                  <HourControl label="Dirigir" value={interview.estiloVidaDirigirHoras} onChange={(value) => updateInterview('estiloVidaDirigirHoras', value)} />
                  <HourControl label="Leitura" value={interview.estiloVidaLeituraHoras} onChange={(value) => updateInterview('estiloVidaLeituraHoras', value)} />
                  <HourControl label="Celular" value={interview.estiloVidaUsoCelularHoras} onChange={(value) => updateInterview('estiloVidaUsoCelularHoras', value)} />
                  <HourControl label="Exposição ao sol" value={interview.estiloVidaExposicaoSolHoras} onChange={(value) => updateInterview('estiloVidaExposicaoSolHoras', value)} />
                  <HourControl label="Ambiente interno" value={interview.estiloVidaAmbienteInternoHoras} onChange={(value) => updateInterview('estiloVidaAmbienteInternoHoras', value)} />
                  <HourControl label="Ambiente externo" value={interview.estiloVidaAmbienteExternoHoras} onChange={(value) => updateInterview('estiloVidaAmbienteExternoHoras', value)} />
                  <HourControl label="Assistir TV" value={interview.estiloVidaAssistirTvHoras} onChange={(value) => updateInterview('estiloVidaAssistirTvHoras', value)} />
                </div>
              </div>
            ) : (
              <div className="space-y-5 overflow-y-auto p-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <ChoiceChips label="Tipo de lente atual" value={interview.tipoLenteAtual} onChange={(value) => updateInterview('tipoLenteAtual', value)} options={[["nao_informado", "Não informado"], ["visao_simples", "Visão simples"], ["multifocal", "Multifocal"], ["ocupacional", "Ocupacional"], ["bifocal", "Bifocal"]]} />
                  <ChoiceChips label="Já usa multifocal?" value={interview.usaMultifocalHoje} onChange={(value) => updateInterview('usaMultifocalHoje', value)} options={[["nao_informado", "Não sei"], ["sim", "Sim"], ["nao", "Não"]]} />
                  <ChoiceChips label="Adaptação anterior" value={interview.dificuldadeAdaptacao} onChange={(value) => updateInterview('dificuldadeAdaptacao', value)} options={[["nao_informado", "Não sei"], ["baixa", "Tranquila"], ["media", "Alguma dificuldade"], ["alta", "Difícil"]]} />
                  <ChoiceChips label="Trocas recentes" value={interview.historicoTrocasRecentes} onChange={(value) => updateInterview('historicoTrocasRecentes', value)} options={[["nao_informado", "Não sei"], ["nenhuma", "Nenhuma"], ["uma", "Uma"], ["mais_de_duas", "Mais de duas"]]} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <ChoiceChips label="Prioridade principal" value={interview.prioridadePrincipal} onChange={(value) => updateInterview('prioridadePrincipal', value)} options={[["equilibrio", "Equilíbrio"], ["economia", "Economia"], ["adaptacao", "Adaptação"], ["resistencia", "Resistência"], ["controle_miopia", "Controle de miopia"], ["premium", "Premium"]]} />
                  <ChoiceChips label="Incômodo principal" value={interview.principalIncomodoAtual} onChange={(value) => updateInterview('principalIncomodoAtual', value)} options={[["nao_informado", "Nenhum"], ["perto", "Perto"], ["longe", "Longe"], ["intermediario", "Intermediário"], ["peso_espessura", "Peso/espessura"], ["reflexo", "Reflexo"], ["adaptacao", "Adaptação"], ["preco", "Preço"]]} />
                  <ChoiceChips label="Objetivo da compra" value={interview.objetivoCompra} onChange={(value) => updateInterview('objetivoCompra', value)} options={[["nao_informado", "Não informado"], ["primeira_multifocal", "Primeira multifocal"], ["upgrade", "Melhorar a atual"], ["resolver_queixa", "Resolver queixa"], ["economizar", "Economizar"], ["trocar_marca", "Trocar marca"], ["oculos_escritorio", "Óculos escritório"], ["controle_miopia", "Controle de miopia"]]} />
                  <ChoiceChips label="Aceita investimento premium?" value={interview.aceitaPremium} onChange={(value) => updateInterview('aceitaPremium', value)} options={[["nao_informado", "Não sei"], ["sim", "Sim"], ["nao", "Não"]]} />
                  <ChoiceChips label="Importância da estética" value={interview.importanciaEstetica} onChange={(value) => updateInterview('importanciaEstetica', value)} options={[["nao_informado", "Não sei"], ["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]]} />
                  <ChoiceChips label="Importância da resistência" value={interview.importanciaResistencia} onChange={(value) => updateInterview('importanciaResistencia', value)} options={[["nao_informado", "Não sei"], ["baixa", "Baixa"], ["media", "Média"], ["alta", "Alta"]]} />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <ChoiceChips label="Prefere Transitions?" value={interview.prefereTransitions} onChange={(value) => updateInterview('prefereTransitions', value)} options={[["nao_informado", "Não sei"], ["sim", "Sim"], ["nao", "Não"]]} />
                  <ChoiceChips label="Prefere proteção azul/UV?" value={interview.prefereBlueUv} onChange={(value) => updateInterview('prefereBlueUv', value)} options={[["nao_informado", "Não sei"], ["sim", "Sim"], ["nao", "Não"]]} />
                  <ChoiceChips label="Dificuldade ao dirigir à noite?" value={interview.queixaDirigirNoite} onChange={(value) => updateInterview('queixaDirigirNoite', value)} options={[["sim", "Sim"], ["nao", "Não"]]} />
                  <ChoiceChips label="Sensibilidade à luz?" value={interview.queixaSensibilidadeLuz} onChange={(value) => updateInterview('queixaSensibilidadeLuz', value)} options={[["sim", "Sim"], ["nao", "Não"]]} />
                  <ChoiceChips label="Quebra óculos com frequência?" value={interview.queixaQuebraOculos} onChange={(value) => updateInterview('queixaQuebraOculos', value)} options={[["sim", "Sim"], ["nao", "Não"]]} />
                  {numberValue(interview.ageYears) <= 14 && <><ChoiceChips label="Criança muito ativa?" value={interview.queixaCriancaAtiva} onChange={(value) => updateInterview('queixaCriancaAtiva', value)} options={[["sim", "Sim"], ["nao", "Não"]]} /><ChoiceChips label="Progressão rápida da miopia?" value={interview.queixaProgressaoRapida} onChange={(value) => updateInterview('queixaProgressaoRapida', value)} options={[["sim", "Sim"], ["nao", "Não"]]} /></>}
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="text-sm font-black">Lente atual
                    <span className="relative mt-2 block">
                      <input ref={brandInputRef} value={interview.marcaAtual} onChange={(event) => updateInterview('marcaAtual', event.target.value)} placeholder="Ex.: Varilux Comfort Max" className="w-full rounded-xl border border-white/10 bg-slate-950 py-3 pl-3 pr-12 text-sm font-normal outline-none focus:border-cyan-300" />
                      <button type="button" aria-label="Escolher marca da lente" aria-expanded={brandDropdownOpen} onClick={() => setBrandDropdownOpen((current) => !current)} className="absolute inset-y-1 right-1 flex w-10 items-center justify-center rounded-lg text-cyan-200 transition hover:bg-white/10"><ChevronDown className={`h-4 w-4 transition ${brandDropdownOpen ? 'rotate-180' : ''}`} /></button>
                      {brandDropdownOpen && <span className="absolute z-20 mt-2 grid w-full grid-cols-2 gap-1 rounded-2xl border border-white/15 bg-slate-900 p-2 shadow-2xl shadow-black/50">{currentLensBrands.map((brand) => <button key={brand} type="button" onClick={() => chooseCurrentLensBrand(brand)} className="rounded-xl px-3 py-2 text-left text-xs font-black text-slate-200 transition hover:bg-cyan-400 hover:text-slate-950">{brand}</button>)}</span>}
                    </span>
                    <span className="mt-2 block text-xs font-normal leading-4 text-slate-400">Escolha a marca, depois complete livremente o modelo da lente.</span>
                  </label>
                  <ChoiceChips label="Faixa de investimento" value={interview.budgetTarget} onChange={(value) => updateInterview('budgetTarget', value)} options={[["", "Ainda não definido"], ["1000", "Até R$ 1.000"], ["2000", "Até R$ 2.000"], ["3000", "Até R$ 3.000"], ["4000", "Até R$ 4.000"], ["5000", "Até R$ 5.000"], ["6000", "R$ 5.000+"]]} />
                </div>
                <label className="block text-sm font-black">Observações do consultor<textarea value={interview.observacoesConsultor} onChange={(event) => updateInterview('observacoesConsultor', event.target.value)} rows={3} placeholder="Algo importante que surgiu na conversa?" className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-3 text-sm font-normal outline-none focus:border-cyan-300" /></label>
              </div>
            )}
          </section>
        </div>
      )}
      {activeField && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Selecionar ${activeField.label}`}>
          <button type="button" aria-label="Fechar seletor" onClick={() => setActivePrescriptionField(null)} className="absolute inset-0 cursor-default" />
          <section className={`relative z-10 w-full rounded-[28px] border border-white/15 bg-slate-900 p-4 shadow-2xl shadow-black/60 ${activeField.kind === 'axis' ? 'max-w-xl' : 'max-w-xs'}`}>
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">Receita</p>
                <h3 className="mt-1 text-lg font-black text-white">{activeField.label}</h3>
              </div>
              <button type="button" onClick={() => setActivePrescriptionField(null)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-slate-300 transition hover:bg-white/10">Fechar</button>
            </div>
            {activeField.kind === 'axis' ? (
              <AxisProtractor value={activeValue} onSelect={choosePrescriptionValue} />
            ) : (
              <DegreeWheel values={getPickerValues(activeField.kind)} selectedValue={activeValue} onSelect={choosePrescriptionValue} />
            )}
          </section>
        </div>
      )}
    </main>
  )
}
