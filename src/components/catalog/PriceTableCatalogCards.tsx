'use client'

import { useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Power } from 'lucide-react'
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

export default function PriceTableCatalogCards({
  overview,
  canManage = true,
  embedded = false,
}: {
  overview: StoreCatalogOverview
  canManage?: boolean
  embedded?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const activeByVersionId = useMemo(() => {
    const map = new Map<string, string>()
    for (const version of overview.versions) {
      if (version.activation?.status === 'active') {
        map.set(version.id, version.activation.id)
      }
    }
    return map
  }, [overview.versions])

  const activeByLaboratorio = useMemo(() => {
    const map = new Map<string, string>()
    for (const version of overview.versions) {
      if (version.activation?.status === 'active') {
        map.set(version.laboratorio, version.id)
      }
    }
    return map
  }, [overview.versions])

  const handleToggle = (versionId: string, laboratorio: string, versao: string) => {
    const isActive = activeByVersionId.has(versionId)
    const replacesSameLabActive =
      !isActive &&
      Boolean(activeByLaboratorio.get(laboratorio)) &&
      activeByLaboratorio.get(laboratorio) !== versionId

    const question = isActive
      ? `Desligar a tabela ${laboratorio} (${versao}) nesta loja?`
      : replacesSameLabActive
        ? `Ligar a tabela ${laboratorio} (${versao}) nesta loja? Isso vai substituir a versão ativa atual desse laboratório.`
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
    <div className={embedded ? 'text-white' : 'min-h-screen bg-slate-950 text-white'}>
      <div className={embedded ? 'w-full' : 'mx-auto w-full max-w-6xl px-6 py-8'}>
        <div className="flex items-end justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-cyan-300/80">
              Tabelas de Preços
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white">
              Tabelas globais disponíveis
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {canManage
                ? 'Clique em um card para ligar ou desligar. Confirmação obrigatória.'
                : 'Visualização das tabelas disponíveis nesta loja.'}
            </p>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
                    : 'border-white/10 bg-slate-900/60 hover:bg-slate-900/80'
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
                  <Power className="h-4 w-4 text-slate-500 transition group-hover:text-slate-300" />
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
