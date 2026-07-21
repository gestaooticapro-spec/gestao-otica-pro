'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { TowerSessionSummary } from '@/lib/actions/tower-session.actions'
import { getOperationalTowerSessions, getOrCreateOperationalTowerSession } from '@/lib/tower/local-operations'
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CircleHelp,
  Clock3,
  Eye,
  GitCompareArrows,
  Glasses,
  Monitor,
  Play,
  RefreshCw,
  RotateCcw,
  Ruler,
  ScanEye,
  Settings2,
  Sparkles,
  UserRoundPlus,
  Video,
} from 'lucide-react'
import type { TowerRemoteConfig } from '@/lib/tower/remote-config'

type MockAction = 'new' | 'resume' | null
type ExperienceKey = 'style' | 'field' | 'measurements' | 'information' | null
type InformationKey = 'look' | 'ar' | 'optifog' | 'polarized' | 'thickness' | 'fieldComparison' | null

interface TowerWelcomeMockProps {
  storeId: number
  remoteConfig: TowerRemoteConfig
  remoteConfigUnavailable?: boolean
  initialExperienceMenu?: boolean
  initialInformationMenu?: boolean
  initialSessionId?: string
}

type DeviceStatus = {
  label: string
  detail: string
  icon: typeof Monitor
  color: string
}

const initialDeviceStatus: DeviceStatus[] = [
  { label: 'Tela cliente', detail: 'Verificando', icon: Monitor, color: 'text-slate-400' },
  { label: 'Câmera', detail: 'Verificando', icon: Video, color: 'text-slate-400' },
]

const experiences = [
  {
    key: 'style' as const,
    title: 'Visagismo',
    description: 'Descubra estilos e armações que combinam com o cliente.',
    note: 'Pode começar sem identificar o cliente.',
    icon: Glasses,
    color: 'text-violet-300',
    background: 'from-violet-400/20 to-fuchsia-500/5',
  },
  {
    key: 'field' as const,
    title: 'Campo Visual',
    description: 'Leitura visual para apoiar a conversa sobre lentes.',
    note: 'A identificação será pedida ao salvar o resultado.',
    icon: ScanEye,
    color: 'text-teal-300',
    background: 'from-teal-400/20 to-cyan-500/5',
  },
  {
    key: 'measurements' as const,
    title: 'Medidas',
    description: 'Capture medidas técnicas para a armação escolhida.',
    note: 'Captura frontal e perfil direito em fluxo guiado.',
    icon: Ruler,
    color: 'text-amber-300',
    background: 'from-amber-400/20 to-orange-500/5',
  },
  {
    key: 'information' as const,
    title: 'Informações Úteis',
    description: 'Conteúdos para explicar lentes, tratamentos e tecnologias ao cliente.',
    note: 'Demonstrações e materiais didáticos.',
    icon: BookOpen,
    color: 'text-rose-300',
    background: 'from-rose-400/20 to-pink-500/5',
  },
]

const informationItems = [
  {
    key: 'look' as const,
    title: 'Seu Jeito de Olhar',
    description: 'Uma demonstração guiada sobre como usamos diferentes áreas das lentes.',
    note: 'Disponível para demonstrar.',
    icon: Eye,
    color: 'text-sky-300',
    background: 'from-sky-400/20 to-blue-500/5',
  },
  {
    key: 'ar' as const,
    title: 'Tratamento AR',
    description: 'Entenda como o antirreflexo melhora a transparência e o conforto visual.',
    note: 'Conteúdo em preparação.',
    icon: Sparkles,
    color: 'text-violet-300',
    background: 'from-violet-400/20 to-fuchsia-500/5',
  },
  {
    key: 'optifog' as const,
    title: 'Opti Fog',
    description: 'Conheça a tecnologia que ajuda a reduzir o embaçamento das lentes.',
    note: 'Conteúdo em preparação.',
    icon: CircleHelp,
    color: 'text-teal-300',
    background: 'from-teal-400/20 to-cyan-500/5',
  },
  {
    key: 'polarized' as const,
    title: 'Lentes Polarizadas',
    description: 'Veja como a polarização ajuda a filtrar reflexos incômodos.',
    note: 'Conteúdo em preparação.',
    icon: Glasses,
    color: 'text-amber-300',
    background: 'from-amber-400/20 to-orange-500/5',
  },
  {
    key: 'thickness' as const,
    title: 'Espessura das Lentes',
    description: 'Veja como grau, índice, armação e centro óptico influenciam a aparência da lente.',
    note: 'Demonstração interativa disponível.',
    icon: Ruler,
    color: 'text-cyan-300',
    background: 'from-cyan-400/20 to-blue-500/5',
  },
  {
    key: 'fieldComparison' as const,
    title: 'Comparativo de Campos',
    description: 'Compare lado a lado as áreas de longe, corredor e perto de duas lentes.',
    note: 'Demonstração interativa disponível.',
    icon: GitCompareArrows,
    color: 'text-emerald-300',
    background: 'from-emerald-400/20 to-teal-500/5',
  },
]

export default function TowerWelcomeMock({ storeId, remoteConfig, remoteConfigUnavailable = false, initialExperienceMenu = false, initialInformationMenu = false, initialSessionId }: TowerWelcomeMockProps) {
  const router = useRouter()
  const [effectiveRemoteConfig, setEffectiveRemoteConfig] = useState(remoteConfig)
  const [configurationUnavailable, setConfigurationUnavailable] = useState(remoteConfigUnavailable)
  const [isPending, startTransition] = useTransition()
  const [selectedAction, setSelectedAction] = useState<MockAction>(initialSessionId ? 'resume' : initialExperienceMenu ? 'new' : null)
  const [selectedExperience, setSelectedExperience] = useState<ExperienceKey>(null)
  const [selectedInformation, setSelectedInformation] = useState<InformationKey>(null)
  const [showingInformation, setShowingInformation] = useState(initialInformationMenu)
  const [activeSessions, setActiveSessions] = useState<TowerSessionSummary[] | null>(null)
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(initialSessionId ?? null)
  const [resumeMessage, setResumeMessage] = useState<string | null>(null)
  const [deviceStatus, setDeviceStatus] = useState<DeviceStatus[]>(initialDeviceStatus)
  const [hardwareLoading, setHardwareLoading] = useState(false)
  const choosingExperience = selectedAction !== null
  const isResuming = selectedAction === 'resume'
  const enabledExperiences = experiences.filter((experience) => {
    if (experience.key === 'style') return effectiveRemoteConfig.experiences.visagismo
    if (experience.key === 'field') return effectiveRemoteConfig.experiences.campoVisual
    if (experience.key === 'measurements') return effectiveRemoteConfig.experiences.medidas
    return effectiveRemoteConfig.experiences.informacoesUteis
  })
  const enabledInformationItems = informationItems.filter((item) => {
    if (item.key === 'look') return effectiveRemoteConfig.information.seuJeitoDeOlhar
    if (item.key === 'ar') return effectiveRemoteConfig.information.tratamentoAr
    if (item.key === 'optifog') return effectiveRemoteConfig.information.optiFog
    if (item.key === 'polarized') return effectiveRemoteConfig.information.lentesPolarizadas
    if (item.key === 'thickness') return effectiveRemoteConfig.information.espessuraLentes
    return effectiveRemoteConfig.information.comparativoCampos
  })

  useEffect(() => {
    let active = true
    const loadLocalConfiguration = async () => {
      const result = await window.towerDesktop?.getLocalConfiguration({ refresh: true })
      if (active && result?.success && result.snapshot?.storeId === storeId) {
        setEffectiveRemoteConfig(result.snapshot.remoteConfig)
        setConfigurationUnavailable(false)
      }
    }
    void loadLocalConfiguration()
    return () => { active = false }
  }, [storeId])

  const refreshDeviceStatus = useCallback(async () => {
    const desktop = window.towerDesktop
    if (!desktop) {
      setDeviceStatus([
        { label: 'Tela cliente', detail: 'Indisponível no navegador', icon: Monitor, color: 'text-slate-500' },
        { label: 'Câmera', detail: 'Indisponível no navegador', icon: Video, color: 'text-slate-500' },
      ])
      return
    }

    setHardwareLoading(true)
    try {
      const [diagnostics, approvals] = await Promise.all([
        desktop.getHardwareDiagnostics(),
        desktop.getHardwareApprovalStatus(),
      ])
      const customerDisplayDetected = diagnostics.displays.some((display) => !display.primary)
      const approval = approvals.success ? approvals.data : null
      setDeviceStatus([
        {
          label: 'Tela cliente',
          detail: approval?.displayApprovedAt
            ? 'Aprovada'
            : customerDisplayDetected ? 'Pendente' : 'Ausente',
          icon: Monitor,
          color: approval?.displayApprovedAt
            ? 'text-emerald-300'
            : customerDisplayDetected ? 'text-amber-300' : 'text-rose-300',
        },
        {
          label: 'Câmera',
          detail: approval?.cameraApprovedAt ? 'Aprovada' : 'Pendente',
          icon: Video,
          color: approval?.cameraApprovedAt ? 'text-emerald-300' : 'text-amber-300',
        },
      ])
    } catch {
      setDeviceStatus([
        { label: 'Tela cliente', detail: 'Não foi possível verificar', icon: Monitor, color: 'text-rose-300' },
        { label: 'Câmera', detail: 'Não foi possível verificar', icon: Video, color: 'text-rose-300' },
      ])
    } finally {
      setHardwareLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!initialSessionId) return
    startTransition(async () => {
      const result = await getOperationalTowerSessions(storeId)
      if (!result.success) {
        setResumeMessage(result.message)
        setActiveSessions([])
        return
      }
      setActiveSessions(result.data ?? [])
    })
  }, [initialSessionId, storeId])

  useEffect(() => {
    void refreshDeviceStatus()
  }, [refreshDeviceStatus])

  function startExperience(experience: Exclude<ExperienceKey, null>) {
    if (experience === 'information') {
      setSelectedExperience(null)
      setShowingInformation(true)
      return
    }

    const destination = experience === 'style'
      ? `/torre/${storeId}/visagismo`
      : experience === 'field'
          ? `/torre/${storeId}/campo-visual`
        : experience === 'measurements'
          ? `/torre/${storeId}/medidas`
        : null
    const sessionExperience = experience === 'style'
      ? 'visagismo'
        : experience === 'field'
          ? 'campo_visual'
          : experience === 'measurements'
            ? 'medidas'
          : null

    if (!destination || !sessionExperience) {
      setSelectedExperience(experience)
      return
    }

    startTransition(async () => {
      // "Novo atendimento" nunca deve reaproveitar a sessao presente na URL.
      const result = await getOrCreateOperationalTowerSession({
        storeId,
        experience: sessionExperience,
        sessionId: isResuming ? selectedSessionId ?? undefined : undefined,
      })
      if (!result.success || !result.data) {
        setSelectedExperience(experience)
        return
      }
      router.push(`${destination}?session=${result.data.id}`)
    })
  }

  function openInformation(item: Exclude<InformationKey, null>) {
    if (item === 'look') {
      router.push(`/torre/${storeId}/seu-jeito-de-olhar`)
      return
    }
    if (item === 'ar') {
      router.push(`/torre/${storeId}/informacoes/tratamento-ar`)
      return
    }
    if (item === 'optifog') {
      router.push(`/torre/${storeId}/informacoes/opti-fog`)
      return
    }
    if (item === 'polarized') {
      router.push(`/torre/${storeId}/informacoes/lentes-polarizadas`)
      return
    }
    if (item === 'thickness') {
      startTransition(async () => {
        const result = await getOrCreateOperationalTowerSession({
          storeId,
          experience: 'thickness',
          sessionId: isResuming ? selectedSessionId ?? undefined : undefined,
        })
        if (!result.success || !result.data) return
        router.push(`/torre/${storeId}/informacoes/espessura-lentes?session=${result.data.id}`)
      })
      return
    }
    if (item === 'fieldComparison') {
      router.push(`/torre/${storeId}/informacoes/comparativo-campos`)
      return
    }
    setSelectedInformation(item)
  }

  function loadActiveSessions() {
    setSelectedAction('resume')
    setResumeMessage(null)
    setActiveSessions(null)
    setSelectedSessionId(null)
    startTransition(async () => {
      const result = await getOperationalTowerSessions(storeId)
      if (!result.success) {
        setResumeMessage(result.message)
        setActiveSessions([])
        return
      }
      setActiveSessions(result.data ?? [])
    })
  }

  return (
    <main className="h-[100dvh] overflow-hidden bg-slate-950 text-slate-100">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_16%_6%,rgba(14,165,233,0.18),transparent_28%),radial-gradient(circle_at_88%_88%,rgba(37,99,235,0.18),transparent_32%)]" />

      <div className="relative mx-auto flex h-full w-full max-w-[1280px] flex-col px-5 py-4 sm:px-7 sm:py-5">
        <header className="flex items-center justify-between gap-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400 text-slate-950 shadow-lg shadow-sky-500/20">
              <Sparkles size={22} strokeWidth={2.4} />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-300">Ótica Pro</p>
              <h1 className="text-lg font-semibold tracking-tight text-white">Torre de experiência</h1>
            </div>
          </div>

          {effectiveRemoteConfig.interface.mostrarConfiguracoes && <button
            type="button"
            onClick={() => router.push('/torre/configuracao')}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 active:scale-[0.98]"
          >
            <Settings2 size={20} />
            <span className="hidden sm:inline">Configurações</span>
          </button>}
        </header>

        <section className={`flex min-h-0 flex-1 flex-col ${choosingExperience ? 'justify-start pt-4' : 'justify-center py-4'}`}>
          {choosingExperience ? (
            <ExperienceChooser
              selectedExperience={selectedExperience}
              selectedInformation={selectedInformation}
              showingInformation={showingInformation}
              onBack={() => {
                setSelectedAction(null)
                setSelectedExperience(null)
                setSelectedInformation(null)
                setShowingInformation(false)
                setSelectedSessionId(null)
              }}
              onBackToExperiences={() => {
                setSelectedExperience(null)
                setSelectedInformation(null)
                setShowingInformation(false)
              }}
              isStarting={isPending}
              onSelect={startExperience}
              onSelectInformation={openInformation}
              enabledExperiences={enabledExperiences}
              enabledInformationItems={enabledInformationItems}
              resumeMode={isResuming}
              resumeSessions={isResuming ? activeSessions : null}
              selectedSessionId={selectedSessionId}
              resumeMessage={isResuming ? resumeMessage : null}
              isLoadingSessions={isResuming && isPending && activeSessions === null}
              onSelectSession={setSelectedSessionId}
            />
          ) : (
            <>
              <div className="max-w-3xl">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Pronta para atender</p>
                <h2 className="max-w-3xl text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">{effectiveRemoteConfig.commercial.headline}</h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">{effectiveRemoteConfig.commercial.supportingText}</p>
                {effectiveRemoteConfig.commercial.mode === 'campaign' && effectiveRemoteConfig.commercial.offerText && <p className="mt-4 inline-flex rounded-xl border border-amber-300/30 bg-amber-300/10 px-4 py-2 text-sm font-bold text-amber-100">{effectiveRemoteConfig.commercial.offerText}</p>}
              </div>

              <div className="mt-6 grid max-w-5xl gap-4 lg:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setSelectedAction('new')}
                  className="group min-h-[185px] rounded-3xl border border-sky-300/40 bg-gradient-to-br from-sky-400 to-blue-600 p-5 text-left text-slate-950 shadow-2xl shadow-sky-950/30 transition hover:-translate-y-1 hover:shadow-sky-500/20 active:translate-y-0 active:scale-[0.99] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/80">
                      <UserRoundPlus size={24} strokeWidth={2.2} />
                    </span>
                    <ArrowRight className="mt-2 transition group-hover:translate-x-1" size={27} />
                  </div>
                  <div className="mt-5">
                    <h3 className="text-xl font-bold">{effectiveRemoteConfig.commercial.callToAction}</h3>
                    <p className="mt-1 max-w-sm text-sm leading-relaxed text-sky-950/80">
                      Inicie o atendimento e escolha a primeira atividade junto ao cliente.
                    </p>
                  </div>
                </button>

                {effectiveRemoteConfig.interface.mostrarContinuarAtendimento && <button
                  type="button"
                  onClick={loadActiveSessions}
                  className="group min-h-[185px] rounded-3xl border border-slate-700 bg-slate-900/85 p-5 text-left shadow-xl shadow-black/20 transition hover:-translate-y-1 hover:border-slate-500 hover:bg-slate-800 active:translate-y-0 active:scale-[0.99] sm:p-6"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-800 text-sky-300 ring-1 ring-slate-700">
                      <RotateCcw size={24} strokeWidth={2.2} />
                    </span>
                    <ArrowRight className="mt-2 text-slate-400 transition group-hover:translate-x-1 group-hover:text-white" size={27} />
                  </div>
                  <div className="mt-5">
                    <h3 className="text-xl font-bold text-white">Continuar atendimento</h3>
                    <p className="mt-1 max-w-sm text-sm leading-relaxed text-slate-400">
                      Retome uma experiência que ficou aberta nesta Torre.
                    </p>
                  </div>
                </button>}
              </div>
            </>
          )}

        </section>

        {configurationUnavailable && <div className="mb-3 rounded-xl border border-amber-300/20 bg-amber-300/10 px-3 py-2 text-xs font-semibold text-amber-100">Não foi possível consultar a configuração remota. A Torre está usando a configuração segura inicial.</div>}

        <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {deviceStatus.map(({ label, detail, icon: Icon, color }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-300 ring-1 ring-slate-800">
                <Icon size={15} className={color} />
                <span>{label}</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span className={`font-medium ${color}`}>{detail}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <button type="button" onClick={() => { void refreshDeviceStatus(); startTransition(() => router.refresh()) }} disabled={isPending || hardwareLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-50"><RefreshCw size={14} className={isPending || hardwareLoading ? 'animate-spin' : ''} />Atualizar</button>
            <span>Loja {storeId}</span>
            <span className="font-medium text-slate-500">Modo Torre</span>
          </div>
        </footer>
      </div>
    </main>
  )
}

function formatSessionStartedAt(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'agora'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date)
}

function ExperienceChooser({
  selectedExperience,
  selectedInformation,
  showingInformation,
  isStarting,
  onBack,
  onBackToExperiences,
  onSelect,
  onSelectInformation,
  enabledExperiences,
  enabledInformationItems,
  resumeMode,
  resumeSessions,
  selectedSessionId,
  resumeMessage,
  isLoadingSessions,
  onSelectSession,
}: {
  selectedExperience: ExperienceKey
  selectedInformation: InformationKey
  showingInformation: boolean
  isStarting: boolean
  onBack: () => void
  onBackToExperiences: () => void
  onSelect: (experience: Exclude<ExperienceKey, null>) => void
  onSelectInformation: (item: Exclude<InformationKey, null>) => void
  enabledExperiences: typeof experiences
  enabledInformationItems: typeof informationItems
  resumeMode: boolean
  resumeSessions: TowerSessionSummary[] | null
  selectedSessionId: string | null
  resumeMessage: string | null
  isLoadingSessions: boolean
  onSelectSession: (sessionId: string) => void
}) {
  const selected = enabledExperiences.find((experience) => experience.key === selectedExperience)
  const selectedInfo = enabledInformationItems.find((item) => item.key === selectedInformation)

  if (showingInformation) {
    return (
      <div className="w-full max-w-6xl">
        <button
          type="button"
          onClick={onBackToExperiences}
          className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.98]"
          title="Voltar para experiências"
          aria-label="Voltar para experiências"
        >
          <ArrowLeft size={16} />
        </button>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">Informações úteis</p>
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">O que vamos explicar hoje?</h2>
        <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-300">Escolha um conteúdo para apoiar a conversa com o cliente.</p>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
          {enabledInformationItems.map(({ key, title, description, icon: Icon, color, background }) => (
            <button
              key={key}
              type="button"
              onClick={() => onSelectInformation(key)}
              className={`group min-h-[112px] rounded-2xl border border-slate-700 bg-gradient-to-br ${background} p-3 text-left transition hover:-translate-y-1 hover:border-slate-500 hover:bg-slate-800/70 active:translate-y-0 active:scale-[0.99]`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className={`flex h-9 w-9 items-center justify-center rounded-lg bg-slate-950/40 ${color} ring-1 ring-white/10`}>
                  <Icon size={20} />
                </span>
                <ArrowRight className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-white" size={20} />
              </div>
              <h3 className="mt-2 text-base font-bold text-white">{title}</h3>
              <p className="mt-1 text-xs leading-snug text-slate-300">{description}</p>
            </button>
          ))}
          {!enabledInformationItems.length && <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-400 sm:col-span-2">Nenhum conteúdo informativo está liberado para esta loja.</p>}
        </div>

        {selectedInfo && <MockNotice icon={CircleHelp} title={`${selectedInfo.title} em preparação`} text="Este conteúdo aparecerá aqui quando a demonstração estiver pronta." />}
      </div>
    )
  }

  return (
    <div className="w-full max-w-6xl">
      <button
        type="button"
        onClick={onBack}
        className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white active:scale-[0.98]"
        title="Voltar"
        aria-label="Voltar"
      >
        <ArrowLeft size={16} />
      </button>
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">{resumeMode ? 'Continuar atendimento' : 'Novo atendimento'}</p>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Por onde vamos começar?</h2>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-300">Escolha a experiência que faz sentido para este atendimento.</p>

      {resumeMode && <div className="mt-5 max-w-2xl rounded-2xl border border-slate-700 bg-slate-900/80 p-4">
        <label htmlFor="tower-session" className="block text-sm font-semibold text-white">Atendimento aberto</label>
        <p className="mt-1 text-xs text-slate-400">Selecione o atendimento para carregar ou complementar uma etapa já iniciada.</p>
        {isLoadingSessions ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-sky-200"><Clock3 size={16} className="animate-pulse" /> Buscando atendimentos abertos…</div>
        ) : resumeMessage ? (
          <p className="mt-3 text-sm text-amber-200">{resumeMessage}</p>
        ) : resumeSessions?.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">Não há atendimentos abertos nesta loja.</p>
        ) : (
          <select
            id="tower-session"
            value={selectedSessionId ?? ''}
            onChange={(event) => onSelectSession(event.target.value)}
            className="mt-3 min-h-12 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 text-sm font-medium text-white outline-none transition focus:border-sky-300"
          >
            <option value="">Selecione um atendimento</option>
            {(resumeSessions ?? []).map((session) => (
              <option key={session.id} value={session.id}>{formatSessionOption(session)}</option>
            ))}
          </select>
        )}
      </div>}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {enabledExperiences.map(({ key, title, description, note, icon: Icon, color, background }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            disabled={isStarting || (resumeMode && !selectedSessionId)}
            className={`group min-h-[145px] rounded-2xl border border-slate-700 bg-gradient-to-br ${background} p-4 text-left transition hover:-translate-y-1 hover:border-slate-500 hover:bg-slate-800/70 active:translate-y-0 active:scale-[0.99] disabled:cursor-wait disabled:opacity-60`}
          >
            <div className="flex items-start justify-between gap-4">
              <span className={`flex h-10 w-10 items-center justify-center rounded-xl bg-slate-950/40 ${color} ring-1 ring-white/10`}>
                <Icon size={22} />
              </span>
              <ArrowRight className="text-slate-500 transition group-hover:translate-x-1 group-hover:text-white" size={23} />
            </div>
            <h3 className="mt-3 text-lg font-bold text-white">{title}</h3>
            <p className="mt-1 text-sm leading-snug text-slate-300">{description}</p>
            <p className="mt-2 text-xs font-medium text-slate-400">{note}</p>
          </button>
        ))}
        {!enabledExperiences.length && <p className="rounded-xl border border-slate-700 bg-slate-900/70 p-4 text-sm text-slate-400 sm:col-span-2">Nenhuma experiência está liberada para esta loja. Atualize a configuração remota.</p>}
      </div>

      {selected && <MockNotice icon={Play} title={`${selected.title} selecionado`} text="Mock visual: a próxima etapa será definida depois." />}
    </div>
  )
}

function formatSessionOption(session: TowerSessionSummary) {
  const customerName = session.customer?.full_name?.trim()
  return `${formatSessionStartedAt(session.started_at)}${customerName ? ` — ${customerName}` : ''}`
}

function MockNotice({
  icon: Icon,
  title,
  text,
}: {
  icon: typeof Play
  title: string
  text: string
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-700/80 bg-slate-900/70 px-3 py-2 text-xs text-slate-300">
      <Icon size={20} className="shrink-0 text-sky-300" />
      <p>
        <span className="font-semibold text-white">{title}.</span> {text}
      </p>
    </div>
  )
}
