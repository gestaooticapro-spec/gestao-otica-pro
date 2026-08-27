'use client'

import { useEffect } from 'react'
import { Boxes, ClipboardCheck, Handshake, ShoppingCart, TrendingDown, WalletCards, X } from 'lucide-react'
import type { MonthlyProgramUsageSnapshot, ProgramUsageGroupId, ProgramUsageStatus } from '@/lib/monthly-program-usage'

type Props = {
  snapshot: MonthlyProgramUsageSnapshot | null
  onClose: () => void
}

const groups: Array<{ id: ProgramUsageGroupId; label: string; icon: typeof ShoppingCart }> = [
  { id: 'atendimento', label: 'Atendimento e vendas', icon: ShoppingCart },
  { id: 'operacao', label: 'Operação e laboratório', icon: ClipboardCheck },
  { id: 'relacionamento', label: 'Relacionamento', icon: Handshake },
  { id: 'financeiro', label: 'Financeiro e fiscal', icon: WalletCards },
  { id: 'estoque', label: 'Estoque e catálogo', icon: Boxes },
]

const statusPresentation: Record<ProgramUsageStatus, { label: string; card: string; badge: string }> = {
  underused: {
    label: 'Pouco usada',
    card: 'border-amber-300/35 bg-amber-300/[0.06]',
    badge: 'border-amber-300/30 bg-amber-300/10 text-amber-100',
  },
  disabled: {
    label: 'Desabilitada',
    card: 'border-slate-500/35 bg-slate-400/[0.05]',
    badge: 'border-slate-400/25 bg-slate-400/10 text-slate-200',
  },
  never_used: {
    label: 'Nunca usada',
    card: 'border-rose-300/35 bg-rose-300/[0.06]',
    badge: 'border-rose-300/30 bg-rose-300/10 text-rose-100',
  },
}

export default function ProgramUsageModal({ snapshot, onClose }: Props) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const visibleGroups = groups
    .map((group) => ({ ...group, cards: snapshot?.cards.filter((card) => card.group === group.id) || [] }))
    .filter((group) => group.cards.length > 0)

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section role="dialog" aria-modal="true" aria-labelledby="program-usage-title" className="flex max-h-[90vh] w-full max-w-6xl flex-col border border-white/15 bg-[#050a18] shadow-2xl shadow-black/50">
      <header className="flex items-start justify-between gap-5 border-b border-white/10 px-5 py-4 sm:px-7">
        <div>
          <div className="flex items-center gap-3">
            <TrendingDown className="h-6 w-6 text-emerald-200" />
            <h2 id="program-usage-title" className="text-xl font-black text-white">Sub-uso do programa</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
            Funções desabilitadas, nunca utilizadas ou com queda relevante de uso no período mensal.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fechar" title="Fechar" className="inline-flex h-9 w-9 shrink-0 items-center justify-center border border-white/15 text-slate-300 transition-colors hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="overflow-y-auto px-5 py-6 sm:px-7">
        {!snapshot ? <div className="border border-white/10 bg-white/[0.03] px-5 py-6">
          <p className="font-bold text-white">A análise ainda não foi gerada.</p>
          <p className="mt-2 text-sm leading-6 text-slate-400">Ela será incluída automaticamente no próximo snapshot mensal.</p>
        </div> : visibleGroups.length === 0 ? <div className="border border-emerald-300/20 bg-emerald-300/[0.05] px-5 py-6">
          <p className="font-bold text-emerald-100">Nenhum sub-uso relevante foi identificado neste período.</p>
        </div> : <div className="space-y-8">
          {visibleGroups.map((group) => <section key={group.id} aria-label={group.label}>
            <div className="flex items-center gap-3 border-b border-white/10 pb-3">
              <group.icon className="h-5 w-5 text-emerald-200" />
              <h3 className="text-base font-bold text-white">{group.label}</h3>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {group.cards.map((card) => {
                const presentation = statusPresentation[card.status]
                return <article key={card.id} className={`min-h-32 border px-4 py-4 ${presentation.card}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h4 className="text-base font-bold text-white">{card.feature}</h4>
                    <span className={`border px-2 py-1 text-[11px] font-bold uppercase tracking-[0.08em] ${presentation.badge}`}>{presentation.label}</span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-300">{card.detail}</p>
                </article>
              })}
            </div>
          </section>)}
        </div>}
      </div>
    </section>
  </div>
}
