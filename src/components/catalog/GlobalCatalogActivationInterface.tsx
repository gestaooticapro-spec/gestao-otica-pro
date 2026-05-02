'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import {
  CheckCircle2,
  Clock3,
  Database,
  Layers3,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Tag,
  ArrowLeft,
} from 'lucide-react'
import {
  activateGlobalCatalogForStore,
  type StoreCatalogOverview,
  type StoreCatalogVersionSummary,
} from '@/lib/actions/global-catalog.actions'

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR')
}

function VersionStatusBadge({ status }: { status: string }) {
  const tone =
    status === 'published'
      ? 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30'
      : status === 'draft'
        ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
        : 'bg-slate-500/15 text-slate-300 border-slate-400/20'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${tone}`}
    >
      {status}
    </span>
  )
}

function ActivationBadge({
  activation,
}: {
  activation: StoreCatalogVersionSummary['activation']
}) {
  if (!activation) return null

  const tone =
    activation.status === 'active'
      ? 'bg-cyan-500/15 text-cyan-300 border-cyan-400/30'
      : activation.status === 'inactive'
        ? 'bg-slate-500/15 text-slate-300 border-slate-400/20'
        : 'bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-400/30'

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] ${tone}`}
    >
      {activation.status === 'active' ? 'Ativa nesta loja' : activation.status}
    </span>
  )
}

function VersionCard({
  storeId,
  version,
  isCurrent,
  replacesSameLabActive,
}: {
  storeId: number
  version: StoreCatalogVersionSummary
  isCurrent: boolean
  replacesSameLabActive: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const buttonLabel = isCurrent
    ? 'Re-sincronizar versão'
    : replacesSameLabActive
      ? 'Ativar e substituir versão'
      : 'Ativar nesta loja'

  const handleActivate = () => {
    startTransition(async () => {
      const result = await activateGlobalCatalogForStore(storeId, version.id)
      if (!result.success) {
        toast.error(result.message)
        return
      }

      toast.success(
        isCurrent ? 'Catálogo re-sincronizado com sucesso.' : 'Catálogo ativado nesta loja.',
      )
      router.refresh()
    })
  }

  return (
    <div className="rounded-3xl border border-white/10 bg-slate-900/70 p-6 shadow-[0_18px_60px_rgba(2,6,23,0.35)] backdrop-blur-md">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <VersionStatusBadge status={version.status} />
            <ActivationBadge activation={version.activation} />
            {isCurrent && (
              <span className="inline-flex items-center gap-1 rounded-full border border-cyan-400/25 bg-cyan-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Catálogo ativo deste laboratório
              </span>
            )}
            {!isCurrent && replacesSameLabActive && (
              <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-200">
                Substitui a versão ativa deste laboratório
              </span>
            )}
          </div>

          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
              {version.laboratorio}
            </p>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-white">
              {version.versao}
            </h2>
          </div>

          <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-3">
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Layers3 className="h-4 w-4" />
                Famílias
              </div>
              <div className="mt-2 text-xl font-black text-white">{version.familiesCount}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Tag className="h-4 w-4" />
                Ofertas
              </div>
              <div className="mt-2 text-xl font-black text-white">{version.offersCount}</div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Sparkles className="h-4 w-4" />
                Tratamentos
              </div>
              <div className="mt-2 text-xl font-black text-white">{version.treatmentsCount}</div>
            </div>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-black/20 p-4 md:max-w-xs">
          <div className="space-y-3 text-sm text-slate-300">
            <div className="flex items-start gap-3">
              <Clock3 className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Criada em
                </p>
                <p>{formatDate(version.createdAt)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Publicação
                </p>
                <p>{formatDate(version.publishedAt)}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Última sincronização
                </p>
                <p>{formatDate(version.activation?.lastSyncedAt || null)}</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleActivate}
            disabled={isPending}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-500 px-4 py-3 font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending ? (
              <RefreshCcw className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="h-4 w-4" />
            )}
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function GlobalCatalogActivationInterface({
  overview,
}: {
  overview: StoreCatalogOverview
}) {
  const [search, setSearch] = useState('')

  const filteredVersions = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return overview.versions

    return overview.versions.filter((version) =>
      `${version.laboratorio} ${version.versao}`.toLowerCase().includes(term),
    )
  }, [overview.versions, search])

  const activeByLaboratorio = useMemo(
    () =>
      new Map(
        overview.activeActivations.map((activation) => [activation.laboratorio, activation.id]),
      ),
    [overview.activeActivations],
  )

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-8">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-slate-900 via-slate-950 to-cyan-950/50 p-7 shadow-[0_25px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <div className="flex items-center gap-3">
                <Link
                  href={`/dashboard/loja/${overview.storeId}`}
                  className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                  title="Voltar para o Painel"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Link>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300/80">
                  Catálogo Global
                </p>
              </div>
              <h1 className="mt-2 text-4xl font-black tracking-tight text-white">
                Ative tabelas de laboratório nesta loja
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300">
                A loja pode manter vários fornecedores ativos ao mesmo tempo. Ao ativar uma nova
                versão do <span className="font-semibold text-white">mesmo laboratório</span>, a
                versão anterior desse fornecedor é substituída. Cada ativação cria um snapshot
                local em <span className="font-semibold text-white">ofertas</span> e{' '}
                <span className="font-semibold text-white">tratamentos</span>, preservando o
                histórico e preparando a base para recomendação por IA e tabela visual.
              </p>
            </div>

            <div className="w-full max-w-md rounded-3xl border border-cyan-400/15 bg-black/20 p-5">
              <p className="text-[11px] font-black uppercase tracking-[0.22em] text-slate-500">
                Catálogos ativos
              </p>
              {overview.activeActivations.length ? (
                <div className="mt-3 space-y-3">
                  {overview.activeActivations.map((activation) => (
                    <div
                      key={activation.id}
                      className="rounded-2xl border border-white/8 bg-white/5 px-4 py-3"
                    >
                      <p className="text-sm font-black text-white">{activation.laboratorio}</p>
                      <p className="text-sm text-slate-300">{activation.versao}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Ativado em {formatDate(activation.activation?.activatedAt || null)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-sm text-slate-400">
                  Ainda não existe nenhuma tabela global ativa nesta loja.
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-md md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-300">
              Versões disponíveis para ativação
            </p>
            <p className="text-xs text-slate-500">
              Você pode ativar fornecedores diferentes em paralelo e re-sincronizar qualquer
              versão já ativa. Ao ativar uma nova versão do mesmo laboratório, a anterior é
              desativada automaticamente.
            </p>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por laboratório ou versão"
            className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-400/40 md:max-w-sm"
          />
        </div>

        <div className="grid gap-6">
          {filteredVersions.map((version) => (
            <VersionCard
              key={version.id}
              storeId={overview.storeId}
              version={version}
              isCurrent={version.activation?.status === 'active'}
              replacesSameLabActive={
                Boolean(activeByLaboratorio.get(version.laboratorio)) &&
                activeByLaboratorio.get(version.laboratorio) !== version.id
              }
            />
          ))}

          {!filteredVersions.length && (
            <div className="rounded-3xl border border-dashed border-white/10 bg-slate-900/50 px-6 py-10 text-center text-slate-400">
              Nenhuma versão encontrada para esse filtro.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
