'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Eye,
  Glasses,
  Monitor,
  Play,
  RotateCcw,
  Ruler,
  ScanEye,
  Settings2,
  Sparkles,
  UserRoundPlus,
  Video,
} from 'lucide-react'

type MockAction = 'new' | 'resume' | null
type ExperienceKey = 'look' | 'style' | 'field' | 'measurements' | null

interface TowerWelcomeMockProps {
  storeId: number
  initialExperienceMenu?: boolean
}

const deviceStatus = [
  { label: 'Tela cliente', detail: 'Conectada', icon: Monitor },
  { label: 'Câmera', detail: 'Pronta', icon: Video },
]

const experiences = [
  {
    key: 'look' as const,
    title: 'Seu Jeito de Olhar',
    description: 'Uma demonstração guiada para explorar como a pessoa usa as lentes.',
    note: 'Pode começar sem identificar o cliente.',
    icon: Eye,
    color: 'text-sky-300',
    background: 'from-sky-400/20 to-blue-500/5',
  },
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
    note: 'Precisa identificar o cliente antes de começar.',
    icon: Ruler,
    color: 'text-amber-300',
    background: 'from-amber-400/20 to-orange-500/5',
  },
]

export default function TowerWelcomeMock({ storeId, initialExperienceMenu = false }: TowerWelcomeMockProps) {
  const router = useRouter()
  const [selectedAction, setSelectedAction] = useState<MockAction>(initialExperienceMenu ? 'new' : null)
  const [selectedExperience, setSelectedExperience] = useState<ExperienceKey>(null)
  const choosingExperience = selectedAction === 'new'

  useEffect(() => {
    setSelectedAction(initialExperienceMenu ? 'new' : null)
    setSelectedExperience(null)
  }, [initialExperienceMenu])

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

          <button
            type="button"
            onClick={() => setSelectedAction(null)}
            className="flex min-h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-3 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800 active:scale-[0.98]"
          >
            <Settings2 size={20} />
            <span className="hidden sm:inline">Configurações</span>
          </button>
        </header>

        <section className="flex min-h-0 flex-1 flex-col justify-center py-4">
          {choosingExperience ? (
            <ExperienceChooser
              selectedExperience={selectedExperience}
              onBack={() => {
                setSelectedAction(null)
                setSelectedExperience(null)
              }}
              onSelect={(experience) => {
                if (experience === 'look') {
                  router.push(`/torre/${storeId}/seu-jeito-de-olhar`)
                  return
                }
                if (experience === 'style') {
                  router.push(`/torre/${storeId}/visagismo`)
                  return
                }
                setSelectedExperience(experience)
              }}
            />
          ) : (
            <>
              <div className="max-w-3xl">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Pronta para atender</p>
                <h2 className="max-w-3xl text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Vamos iniciar uma nova experiência?
                </h2>
                <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300 sm:text-lg">
                  Escolha como deseja começar. A identificação do cliente pode ficar para depois.
                </p>
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
                    <h3 className="text-xl font-bold">Nova experiência</h3>
                    <p className="mt-1 max-w-sm text-sm leading-relaxed text-sky-950/80">
                      Inicie o atendimento e escolha a primeira atividade junto ao cliente.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setSelectedAction('resume')}
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
                </button>
              </div>
            </>
          )}

          <div className="mt-3 min-h-11 max-w-5xl" aria-live="polite">
            {selectedAction === 'resume' && (
              <MockNotice icon={Clock3} title="Nenhum atendimento em andamento" text="Mock visual: a lista de sessões abertas entrará aqui." />
            )}
          </div>
        </section>

        <footer className="flex shrink-0 flex-col gap-3 border-t border-slate-800 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-2">
            {deviceStatus.map(({ label, detail, icon: Icon }) => (
              <div key={label} className="flex items-center gap-2 rounded-lg bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-300 ring-1 ring-slate-800">
                <Icon size={15} className="text-emerald-400" />
                <span>{label}</span>
                <span className="h-1 w-1 rounded-full bg-slate-600" />
                <span className="font-medium text-emerald-300">{detail}</span>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span>Loja {storeId}</span>
            <span className="font-medium text-slate-500">Modo Torre</span>
          </div>
        </footer>
      </div>
    </main>
  )
}

function ExperienceChooser({
  selectedExperience,
  onBack,
  onSelect,
}: {
  selectedExperience: ExperienceKey
  onBack: () => void
  onSelect: (experience: ExperienceKey) => void
}) {
  const selected = experiences.find((experience) => experience.key === selectedExperience)

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
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">Nova experiência</p>
      <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Por onde vamos começar?</h2>
      <p className="mt-2 max-w-2xl text-base leading-relaxed text-slate-300">Escolha a experiência que faz sentido para este atendimento.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {experiences.map(({ key, title, description, note, icon: Icon, color, background }) => (
          <button
            key={key}
            type="button"
            onClick={() => onSelect(key)}
            className={`group min-h-[145px] rounded-2xl border border-slate-700 bg-gradient-to-br ${background} p-4 text-left transition hover:-translate-y-1 hover:border-slate-500 hover:bg-slate-800/70 active:translate-y-0 active:scale-[0.99]`}
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
      </div>

      {selected && <MockNotice icon={Play} title={`${selected.title} selecionado`} text="Mock visual: a próxima etapa será definida depois." />}
    </div>
  )
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
