import Link from 'next/link'
import { Power, Settings } from 'lucide-react'

interface ModuleDisabledStateProps {
  storeId: number
  moduleLabel: string
  backHref?: string
}

export default function ModuleDisabledState({
  storeId,
  moduleLabel,
  backHref,
}: ModuleDisabledStateProps) {
  const href = backHref || `/dashboard/loja/${storeId}`

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center p-6 bg-slate-950">
      <div className="max-w-xl w-full rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500/15 border border-amber-400/20">
          <Power className="h-8 w-8 text-amber-300" />
        </div>
        <h1 className="text-2xl font-black text-white tracking-tight">
          Modulo desativado
        </h1>
        <p className="mt-3 text-sm text-slate-300 leading-relaxed">
          O recurso <strong className="text-white">{moduleLabel}</strong> esta desligado para esta loja.
          Para reativar, abra <strong className="text-white">Config &gt; Recursos</strong>.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Link
            href={`/dashboard/loja/${storeId}/config`}
            className="inline-flex items-center gap-2 rounded-xl bg-cyan-500/20 px-4 py-2 text-sm font-bold text-cyan-200 border border-cyan-400/20 hover:bg-cyan-500/30 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Abrir Recursos
          </Link>
          <Link
            href={href}
            className="inline-flex items-center rounded-xl border border-white/10 px-4 py-2 text-sm font-bold text-slate-200 hover:bg-white/5 transition-colors"
          >
            Voltar
          </Link>
        </div>
      </div>
    </div>
  )
}
