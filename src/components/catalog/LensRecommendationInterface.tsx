'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDollarSign,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  Stethoscope,
} from 'lucide-react'
import {
  continueLensRecommendationConversationAction,
  generateLensRecommendationsAction,
} from '@/lib/actions/lens-recommendation.actions'
import type {
  RecommendationConversationState,
  RecommendationOption,
} from '@/lib/server/lens-recommendation'

type RecommendationStartPayload = {
  state: RecommendationConversationState
  recommendations: RecommendationOption[]
}

type RecommendationContinuePayload = {
  nextState: RecommendationConversationState
  recommendations: RecommendationOption[]
  intents: Array<{ type: string; raw: string }>
}

type QuickTagGroup = {
  label: string
  value: string
}

type ChatMessage = {
  id: string
  role: 'assistant' | 'user'
  content: string
}

const rotinaOptions: QuickTagGroup[] = [
  { label: 'Computador', value: 'computador' },
  { label: 'Celular', value: 'celular' },
  { label: 'Dirigir à noite', value: 'dirigir_noite' },
  { label: 'Golfe', value: 'golfe' },
  { label: 'Esporte outdoor', value: 'esporte_outdoor' },
]

const objetivoOptions: QuickTagGroup[] = [
  { label: 'Custo-benefício', value: 'custo_beneficio' },
  { label: 'Conforto visual', value: 'conforto_visual' },
  { label: 'Adaptação rápida', value: 'adaptacao_rapida' },
  { label: 'Nitidez', value: 'nitidez' },
]

const desiredBenefitOptions: QuickTagGroup[] = [
  { label: 'Adaptação rápida', value: 'adaptacao_rapida' },
  { label: 'Conforto no dia todo', value: 'conforto_visual' },
  { label: 'Conforto externo', value: 'conforto_externo' },
  { label: 'Nitidez', value: 'nitidez' },
]

const preferredFeatureOptions: QuickTagGroup[] = [
  { label: 'Transitions', value: 'transitions' },
  { label: 'Blue UV', value: 'blue_uv' },
  { label: 'Solar', value: 'solar' },
  { label: 'Coloração', value: 'coloracao' },
]

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value)
}

function splitTags(value: string) {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  )
}

function parseNullableNumber(value: string) {
  if (!value.trim()) return null
  const normalized = value.replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function tagsToText(tags: string[]) {
  return tags.join(', ')
}

function buildAssistantSummary(recommendations: RecommendationOption[]) {
  if (!recommendations.length) {
    return 'Não encontrei combinações elegíveis com esse filtro. Tente afrouxar preço, features ou grau de referência.'
  }

  const top = recommendations[0]
  const tratamento = top.treatmentName ? ` + ${top.treatmentName}` : ''
  return `Minha melhor leitura agora é ${top.familyName} | ${top.offerLabel}${tratamento} por ${formatCurrency(top.finalPrice)}. Se quiser, você pode pedir uma alternativa mais barata, mais premium ou manter alguma feature como Transitions.`
}

function QuickTagPicker({
  title,
  options,
  value,
  onChange,
}: {
  title: string
  options: QuickTagGroup[]
  value: string
  onChange: (next: string) => void
}) {
  const currentTags = splitTags(value)

  const toggleTag = (tag: string) => {
    const next = currentTags.includes(tag)
      ? currentTags.filter((item) => item !== tag)
      : [...currentTags, tag]
    onChange(tagsToText(next))
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = currentTags.includes(option.value)
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggleTag(option.value)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? 'border-cyan-400/35 bg-cyan-500/15 text-cyan-100'
                  : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function RecommendationCard({
  option,
  rank,
}: {
  option: RecommendationOption
  rank: number
}) {
  return (
    <article className="rounded-3xl border border-white/10 bg-slate-900/70 p-5 shadow-[0_18px_50px_rgba(2,6,23,0.28)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
              Opção {rank}
            </span>
            <span className="inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
              {option.clinicalCategory}
            </span>
            {rank === 1 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Recomendo
              </span>
            )}
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
              {option.familyName}
            </p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-white">{option.offerLabel}</h3>
            <p className="mt-1 text-sm text-cyan-100">
              {option.treatmentName ? option.treatmentName : 'Sem tratamento complementar'}
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Preço final
              </p>
              <p className="mt-2 text-2xl font-black text-white">{formatCurrency(option.finalPrice)}</p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Origem
              </p>
              <p className="mt-2 text-sm font-semibold text-slate-200">
                {option.sourcePageReference || 'Catálogo ativo'}
              </p>
            </div>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 lg:max-w-md">
          <div className="space-y-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                Por que entrou
              </p>
              <ul className="mt-2 space-y-2 text-sm text-slate-300">
                {option.reasons.map((reason, index) => (
                  <li key={`${option.configKey}-reason-${index}`} className="rounded-xl bg-white/5 px-3 py-2">
                    {reason}
                  </li>
                ))}
              </ul>
            </div>

            {(option.commercialSummary || option.treatmentExplainWhy) && (
              <div className="space-y-2">
                {option.commercialSummary && (
                  <p className="text-sm leading-6 text-slate-300">{option.commercialSummary}</p>
                )}
                {option.treatmentExplainWhy && (
                  <p className="rounded-2xl border border-cyan-400/15 bg-cyan-500/5 px-3 py-3 text-sm leading-6 text-cyan-100">
                    {option.treatmentExplainWhy}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  )
}

export default function LensRecommendationInterface({
  storeId,
  versionId,
  laboratorio,
  versao,
}: {
  storeId: number
  versionId: string
  laboratorio: string
  versao: string
}) {
  const [idade, setIdade] = useState('')
  const [marcaAtual, setMarcaAtual] = useState('')
  const [esferico, setEsferico] = useState('')
  const [cilindrico, setCilindrico] = useState('')
  const [adicao, setAdicao] = useState('')
  const [rotinaTags, setRotinaTags] = useState('computador')
  const [objetivoTags, setObjetivoTags] = useState('custo_beneficio')
  const [desiredBenefits, setDesiredBenefits] = useState('adaptacao_rapida')
  const [preferredFeatures, setPreferredFeatures] = useState('transitions')
  const [budgetMode, setBudgetMode] = useState<'economico' | 'intermediario' | 'premium'>('intermediario')
  const [adaptationDifficulty, setAdaptationDifficulty] = useState<'baixa' | 'media' | 'alta'>('media')
  const [notes, setNotes] = useState('')
  const [conversationInput, setConversationInput] = useState('')
  const [conversationState, setConversationState] = useState<RecommendationConversationState | null>(null)
  const [recommendations, setRecommendations] = useState<RecommendationOption[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isGenerating, startGenerateTransition] = useTransition()
  const [isContinuing, startConversationTransition] = useTransition()

  const disabledGenerate = useMemo(() => {
    return !esferico.trim() || !cilindrico.trim()
  }, [esferico, cilindrico])

  const activeTagsSummary = useMemo(() => {
    return {
      rotina: splitTags(rotinaTags),
      objetivos: splitTags(objetivoTags),
      beneficios: splitTags(desiredBenefits),
      features: splitTags(preferredFeatures),
    }
  }, [rotinaTags, objetivoTags, desiredBenefits, preferredFeatures])

  const handleGenerate = () => {
    startGenerateTransition(async () => {
      const result = await generateLensRecommendationsAction({
        versionId,
        idade: parseNullableNumber(idade),
        marca_atual: marcaAtual || null,
        esferico: parseNullableNumber(esferico),
        cilindrico: parseNullableNumber(cilindrico),
        adicao: parseNullableNumber(adicao),
        rotina_tags: splitTags(rotinaTags),
        objetivo_tags: splitTags(objetivoTags),
        desired_benefits: splitTags(desiredBenefits),
        preferred_features: splitTags(preferredFeatures),
        budget_mode: budgetMode,
        adaptation_difficulty: adaptationDifficulty,
        notes: notes || null,
        topN: 3,
      })

      if (!result.success || !result.data) {
        toast.error(result.message)
        return
      }

      const payload = result.data as RecommendationStartPayload
      setConversationState(payload.state)
      setRecommendations(payload.recommendations)
      setMessages([
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: buildAssistantSummary(payload.recommendations),
        },
      ])
      toast.success('Recomendação inicial pronta.')
    })
  }

  const handleContinueConversation = () => {
    if (!conversationState || !conversationInput.trim()) return

    const currentInput = conversationInput.trim()
    setConversationInput('')

    startConversationTransition(async () => {
      const result = await continueLensRecommendationConversationAction({
        state: conversationState,
        userMessage: currentInput,
        topN: 3,
      })

      if (!result.success || !result.data) {
        toast.error(result.message)
        setConversationInput(currentInput)
        return
      }

      const payload = result.data as RecommendationContinuePayload
      setConversationState(payload.nextState)
      setRecommendations(payload.recommendations)
      setMessages((current) => [
        ...current,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content: currentInput,
        },
        {
          id: `assistant-${Date.now() + 1}`,
          role: 'assistant',
          content: buildAssistantSummary(payload.recommendations),
        },
      ])

      toast.success('Sugestões atualizadas.')
    })
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-fuchsia-950/40 p-7 shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-[11px] font-black uppercase tracking-[0.3em] text-fuchsia-300/80">
                Recomendação por IA
              </p>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
                Monte uma indicação técnica e comercial para esta loja
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                A recomendação usa o catálogo global já ativado na loja e devolve combinações no
                formato <span className="font-semibold text-white">oferta + tratamento + preço final</span>,
                com justificativa da lente e do tratamento.
              </p>
            </div>

            <div className="w-full max-w-md rounded-3xl border border-fuchsia-400/15 bg-black/20 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                Catálogo em uso
              </p>
              <div className="mt-3">
                <p className="text-lg font-black text-white">{laboratorio}</p>
                <p className="text-sm text-slate-300">{versao}</p>
                <p className="mt-2 text-xs text-slate-500">Loja #{storeId}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)]">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-fuchsia-500/10 p-3 text-fuchsia-200">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-black tracking-tight text-white">Caso do cliente</h2>
                <p className="text-sm text-slate-400">
                  Use por enquanto o grau mais exigente como referência do filtro técnico.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Idade</span>
                <input
                  value={idade}
                  onChange={(event) => setIdade(event.target.value)}
                  placeholder="Ex: 47"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Marca atual</span>
                <input
                  value={marcaAtual}
                  onChange={(event) => setMarcaAtual(event.target.value)}
                  placeholder="Ex: Hoya"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Esférico de referência</span>
                <input
                  value={esferico}
                  onChange={(event) => setEsferico(event.target.value)}
                  placeholder="Ex: +1,50"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Cilíndrico de referência</span>
                <input
                  value={cilindrico}
                  onChange={(event) => setCilindrico(event.target.value)}
                  placeholder="Ex: -2,00"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Adição</span>
                <input
                  value={adicao}
                  onChange={(event) => setAdicao(event.target.value)}
                  placeholder="Ex: +2,75"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/40"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Faixa de preço</span>
                <select
                  value={budgetMode}
                  onChange={(event) => setBudgetMode(event.target.value as typeof budgetMode)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-400/40"
                >
                  <option value="economico">Econômico</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="premium">Premium</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm font-semibold text-slate-300">Dificuldade de adaptação</span>
                <select
                  value={adaptationDifficulty}
                  onChange={(event) => setAdaptationDifficulty(event.target.value as typeof adaptationDifficulty)}
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition focus:border-fuchsia-400/40"
                >
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                </select>
              </label>
            </div>

            <div className="mt-6 space-y-5">
              <QuickTagPicker title="Rotina" options={rotinaOptions} value={rotinaTags} onChange={setRotinaTags} />
              <QuickTagPicker title="Objetivos" options={objetivoOptions} value={objetivoTags} onChange={setObjetivoTags} />
              <QuickTagPicker title="Benefícios desejados" options={desiredBenefitOptions} value={desiredBenefits} onChange={setDesiredBenefits} />
              <QuickTagPicker title="Features preferidas" options={preferredFeatureOptions} value={preferredFeatures} onChange={setPreferredFeatures} />
            </div>

            <label className="mt-6 block space-y-2">
              <span className="text-sm font-semibold text-slate-300">Observações livres</span>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={4}
                placeholder="Ex: passa o dia no computador, no fim de semana joga golfe e reclama de adaptação."
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-fuchsia-400/40"
              />
            </label>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={disabledGenerate || isGenerating}
                className="inline-flex items-center gap-2 rounded-2xl bg-fuchsia-500 px-5 py-3 font-black text-white transition hover:bg-fuchsia-400 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Gerar recomendação
              </button>

              <Link
                href={`/dashboard/loja/${storeId}/catalogo-global`}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
              >
                Ver catálogo ativo
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-cyan-500/10 p-3 text-cyan-200">
                  <CircleDollarSign className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">Leitura rápida do caso</h2>
                  <p className="text-sm text-slate-400">Os sinais usados no ranking aparecem aqui.</p>
                </div>
              </div>

              <div className="mt-5 space-y-4 text-sm text-slate-300">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Rotina</p>
                  <p className="mt-2">{activeTagsSummary.rotina.length ? activeTagsSummary.rotina.join(', ') : '—'}</p>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Objetivos</p>
                  <p className="mt-2">
                    {activeTagsSummary.objetivos.length ? activeTagsSummary.objetivos.join(', ') : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">Features preferidas</p>
                  <p className="mt-2">
                    {activeTagsSummary.features.length ? activeTagsSummary.features.join(', ') : '—'}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)]">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-amber-500/10 p-3 text-amber-200">
                  <MessageSquare className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-xl font-black tracking-tight text-white">Conversa incremental</h2>
                  <p className="text-sm text-slate-400">
                    Depois da primeira resposta, refine com frases como “ficou caro”.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {['Essa lente ficou cara pro meu cliente', 'Quero outra opção', 'Quero manter Transitions', 'Quero algo mais fácil de adaptar'].map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => setConversationInput(suggestion)}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:bg-white/10"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>

                <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                  <div className="max-h-64 space-y-3 overflow-y-auto pr-1">
                    {messages.length ? (
                      messages.map((message) => (
                        <div
                          key={message.id}
                          className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                            message.role === 'assistant'
                              ? 'border border-cyan-400/15 bg-cyan-500/5 text-cyan-50'
                              : 'border border-white/10 bg-white/5 text-slate-200'
                          }`}
                        >
                          <p className="mb-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-500">
                            {message.role === 'assistant' ? 'IA' : 'Você'}
                          </p>
                          <p>{message.content}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-dashed border-white/10 px-4 py-5 text-sm text-slate-400">
                        Gere a primeira recomendação para abrir a conversa.
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3">
                    <input
                      value={conversationInput}
                      onChange={(event) => setConversationInput(event.target.value)}
                      placeholder="Ex: essa lente ficou cara, me dê outra sugestão"
                      className="flex-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40"
                    />
                    <button
                      type="button"
                      onClick={handleContinueConversation}
                      disabled={!conversationState || !conversationInput.trim() || isContinuing}
                      className="inline-flex items-center justify-center rounded-2xl bg-cyan-500 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isContinuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>

        <section className="space-y-5">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl bg-emerald-500/10 p-3 text-emerald-200">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white">Sugestões atuais</h2>
              <p className="text-sm text-slate-400">
                A IA devolve configuração específica com preço final e justificativa.
              </p>
            </div>
          </div>

          {recommendations.length ? (
            <div className="grid gap-5">
              {recommendations.map((option, index) => (
                <RecommendationCard key={option.configKey} option={option} rank={index + 1} />
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/50 px-6 py-10 text-center text-slate-400">
              Preencha o caso do cliente e gere a primeira recomendação para ver as opções.
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
