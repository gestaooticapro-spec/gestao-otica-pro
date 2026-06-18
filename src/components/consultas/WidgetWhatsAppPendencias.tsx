'use client'

import { AlertTriangle, ChevronRight, MessageSquareText } from 'lucide-react'
import { WhatsAppPendencia } from '@/lib/actions/consultas.actions'

export default function WidgetWhatsAppPendencias({
  pendencias,
  onOpen,
}: {
  pendencias: WhatsAppPendencia[]
  onOpen: () => void
}) {
  const hasPendencia = pendencias.length > 0
  const oldestUpdate = pendencias
    .map((item) => new Date(item.updated_at).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0]

  const waitMinutes = oldestUpdate
    ? Math.max(0, Math.floor((Date.now() - oldestUpdate) / 60000))
    : 0

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-3xl border border-white/5 bg-black/20 text-left shadow-xl backdrop-blur-sm ring-1 ring-white/10 transition-all duration-300 hover:border-green-500/30 hover:bg-green-500/5"
    >
      <div className="flex items-center justify-between bg-green-500/10 px-6 py-5 transition-colors hover:bg-green-500/20">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-green-500/10 bg-green-500/20 p-2.5 text-green-400 shadow-inner">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-green-100">WHATSAPP</h3>
            <p className="text-[10px] font-medium uppercase tracking-wider text-green-200/60">
              Central Operacional
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {hasPendencia ? (
            <span className="rounded-full bg-green-500 px-2.5 py-1 text-xs font-black text-green-950 shadow-lg shadow-green-900/20">
              {pendencias.length}
            </span>
          ) : null}
          <ChevronRight className="h-4 w-4 text-white/50" />
        </div>
      </div>

      <div className="bg-black/40 p-4">
        <div className="rounded-2xl border border-white/5 bg-white/5 p-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-black text-white">
                {hasPendencia
                  ? `${pendencias.length} conversa${pendencias.length === 1 ? '' : 's'} com handoff`
                  : 'Nenhuma pendencia humana agora'}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {hasPendencia
                  ? `Conversa mais antiga aguardando ha ${waitMinutes} min`
                  : 'Abra o modal para buscar clientes, ver historico e inspecionar o fluxo.'}
              </p>
            </div>

            {hasPendencia ? (
              <div className="shrink-0 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-wider">Atencao</span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-green-300/80">
            <span>Abrir central</span>
            <span>Historico real + debug</span>
          </div>
        </div>
      </div>
    </button>
  )
}
