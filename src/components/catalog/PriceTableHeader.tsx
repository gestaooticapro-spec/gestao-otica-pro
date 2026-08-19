'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, Search, Layers, Power, X, ArrowLeft } from 'lucide-react'
import {
  activateGlobalCatalogForStore,
  deactivateGlobalCatalogForStore,
  type StoreCatalogOverview,
} from '@/lib/actions/global-catalog.actions'

function CatalogToggleDot({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`h-2.5 w-2.5 rounded-full ${active ? 'bg-emerald-400' : 'bg-slate-600'}`}
    />
  )
}

export default function PriceTableHeader({
  storeId,
  scope,
  overview,
  canManage,
}: {
  storeId: number
  scope: 'laboratorio' | 'lente'
  overview: StoreCatalogOverview
  canManage: boolean
}) {
  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  const activeVersionIds = new Set(
    overview.versions
      .filter((v) => v.activation?.status === 'active')
      .map((v) => v.id),
  )

  const activeByLaboratorio = new Map(
    overview.versions
      .filter((v) => v.activation?.status === 'active')
      .map((v) => [v.laboratorio, v.id]),
  )

  const activeCount = activeVersionIds.size

  const handleToggle = (versionId: string, laboratorio: string, versao: string) => {
    const isActive = activeVersionIds.has(versionId)
    const replacesSameLab =
      !isActive &&
      Boolean(activeByLaboratorio.get(laboratorio)) &&
      activeByLaboratorio.get(laboratorio) !== versionId

    const question = isActive
      ? `Desligar a tabela ${laboratorio} (${versao}) nesta loja?`
      : replacesSameLab
        ? `Ligar a tabela ${laboratorio} (${versao})? Isso vai substituir a versão ativa atual desse laboratório.`
        : `Ligar a tabela ${laboratorio} (${versao}) nesta loja?`

    if (!canManage) return
    if (!window.confirm(question)) return

    startTransition(async () => {
      let result:
        | { success: boolean; message: string }
        | undefined
        | null = null

      try {
        result = isActive
          ? await deactivateGlobalCatalogForStore(overview.storeId, versionId)
          : await activateGlobalCatalogForStore(overview.storeId, versionId)
      } catch (error) {
        console.error('Erro ao alternar catalogo global:', error)
        toast.error('Falha ao alternar a tabela. Verifique os logs do servidor.')
        return
      }

      // Em alguns cenarios de falha de server action, o retorno pode vir como undefined.
      if (!result || typeof result !== 'object' || typeof result.success !== 'boolean') {
        console.error('Retorno inesperado ao alternar catalogo global:', result)
        toast.error('Falha ao alternar a tabela. Retorno inesperado da API.')
        return
      }

      if (!result.success) {
        toast.error(result.message || 'Falha ao alternar a tabela.')
        return
      }

      toast.success(isActive ? 'Tabela desligada.' : 'Tabela ligada.')
      router.refresh()
    })
  }

  return (
    <>
      <div className="rounded-3xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-md">
        <div className="flex flex-wrap items-stretch gap-3">
          {/* Tabs — metade esquerda */}
          <div className="flex flex-1 items-end gap-1.5 border-b border-white/10 pb-0">
            {/* Botão Voltar */}
            <Link
              href={`/dashboard/loja/${storeId}`}
              className="relative -mb-px mr-2 inline-flex items-center justify-center rounded-t-2xl border border-transparent bg-slate-800/70 px-4 py-3 text-slate-400 transition hover:bg-slate-800 hover:text-white"
              title="Voltar para o Painel"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <Link
              href={`/dashboard/loja/${storeId}/tabela-precos?scope=laboratorio`}
              aria-current={scope === 'laboratorio' ? 'page' : undefined}
              className={`relative -mb-px inline-flex items-center gap-2 rounded-t-2xl border px-4 py-3 transition ${
                scope === 'laboratorio'
                  ? 'border-white/15 border-b-slate-900 bg-slate-950 text-white shadow-[0_-1px_0_rgba(255,255,255,0.04)]'
                  : 'border-transparent bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  scope === 'laboratorio' ? 'bg-cyan-400/15 text-cyan-200' : 'bg-black/20 text-slate-500'
                }`}
              >
                <Building2 className="h-4 w-4" />
              </span>
              <span className="text-xs font-black uppercase tracking-[0.18em]"><span className="sm:hidden">Por lab</span><span className="hidden sm:inline">Por laboratório</span></span>
            </Link>

            <Link
              href={`/dashboard/loja/${storeId}/tabela-precos?scope=lente`}
              aria-current={scope === 'lente' ? 'page' : undefined}
              className={`relative -mb-px inline-flex items-center gap-2 rounded-t-2xl border px-4 py-3 transition ${
                scope === 'lente'
                  ? 'border-white/15 border-b-slate-900 bg-slate-950 text-white shadow-[0_-1px_0_rgba(255,255,255,0.04)]'
                  : 'border-transparent bg-slate-800/70 text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  scope === 'lente' ? 'bg-cyan-400/15 text-cyan-200' : 'bg-black/20 text-slate-500'
                }`}
              >
                <Search className="h-4 w-4" />
              </span>
              <span className="text-xs font-black uppercase tracking-[0.18em]">Por lente</span>
            </Link>
          </div>

          {/* Botão Tabelas Disponíveis — metade direita */}
          <div className="flex items-center justify-end">
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-800/70 px-4 py-2.5 text-xs font-black uppercase tracking-[0.18em] text-slate-300 transition hover:bg-slate-700 hover:text-white"
            >
              <Layers className="h-4 w-4" />
              Tabelas disponíveis
              {activeCount > 0 && (
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-[10px] font-black text-emerald-300">
                  {activeCount}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-white/10 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header do modal */}
            <div className="mb-5 flex items-start justify-between">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300/80">
                  Tabelas de Preços
                </p>
                <h2 className="mt-1 text-xl font-black tracking-tight text-white">
                  Tabelas disponíveis
                </h2>
                {canManage && (
                  <p className="mt-1 text-xs text-slate-400">
                    Clique para ligar ou desligar. Confirmação obrigatória.
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/10 bg-slate-800 text-slate-400 transition hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Cards */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {overview.versions.map((version) => {
                const active = version.activation?.status === 'active'
                return (
                  <button
                    key={version.id}
                    type="button"
                    disabled={isPending || !canManage}
                    onClick={() => handleToggle(version.id, version.laboratorio, version.versao)}
                    className={`group relative flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                      active
                        ? 'border-emerald-400/25 bg-emerald-500/10 hover:bg-emerald-500/15'
                        : 'border-white/10 bg-slate-800/60 hover:bg-slate-800/90'
                    } ${isPending || !canManage ? 'opacity-70' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-white">{version.laboratorio}</p>
                      <p className="truncate text-xs text-slate-400">{version.versao}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-2">
                      <CatalogToggleDot active={active} />
                      <span className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-300">
                        {active ? 'Ligado' : 'Desligado'}
                      </span>
                      {canManage && (
                        <Power className="h-4 w-4 text-slate-500 transition group-hover:text-slate-300" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
