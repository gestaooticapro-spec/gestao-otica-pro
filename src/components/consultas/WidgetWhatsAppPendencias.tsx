'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronUp, MessageSquareText } from 'lucide-react'
import { WhatsAppPendencia } from '@/lib/actions/consultas.actions'

export default function WidgetWhatsAppPendencias({
  pendencias,
  humanOverrides = 0,
  isConnected = true,
  onOpen,
}: {
  pendencias: WhatsAppPendencia[]
  humanOverrides?: number
  isConnected?: boolean
  onOpen: () => void
}) {
  const [isOpen, setIsOpen] = useState(false)
  const attachmentPendingCount = pendencias.filter((item) => item.origin === 'attachment').length
  const pendingCount = pendencias.length
  const totalActions = pendingCount + humanOverrides
  const [renderNow] = useState(() => Date.now())
  const oldestUpdate = pendencias
    .map((item) => new Date(item.handoff_at).getTime())
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)[0]

  const waitMinutes = oldestUpdate
    ? Math.max(0, Math.floor((renderNow - oldestUpdate) / 60000))
    : 0

  return (
    <div className="group bg-white/5 hover:bg-white/10 rounded-xl border border-white/5 hover:border-green-500/30 transition-all duration-300 overflow-hidden">
      <div
        className="p-4 flex items-center justify-between cursor-pointer"
        onClick={() => setIsOpen((current) => !current)}
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-green-500/20 text-green-300 flex items-center justify-center transition-colors shadow-lg">
            <MessageSquareText className="w-5 h-5" />
          </div>
          <div>
            <span className="text-slate-200 font-bold text-sm block group-hover:text-white transition-colors">WhatsApp</span>
            <span className={`text-[10px] uppercase font-bold ${isConnected ? 'text-slate-500' : 'text-amber-400'}`}>
              {isConnected ? 'Central Operacional' : 'Canal desconectado'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {totalActions > 0 ? (
            <span className="px-2 py-1 rounded-md text-xs font-bold bg-green-500/20 text-green-300 shadow-lg">
              {totalActions}
            </span>
          ) : null}
          {isOpen ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </div>
      </div>

      {isOpen ? (
        <div className="bg-black/20 p-4 border-t border-white/5 space-y-3 animate-in slide-in-from-top-2">
          <div className="flex items-start justify-between gap-3 rounded-lg bg-white/5 border border-white/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-slate-200">
                {!isConnected
                  ? 'WhatsApp indisponível no momento'
                  : totalActions > 0
                    ? `${totalActions} ${totalActions === 1 ? 'ação' : 'ações'} no radar`
                    : 'Sem ações de WhatsApp agora'}
              </p>
              <p className="mt-1 text-[10px] text-slate-400">
                {!isConnected
                  ? 'Verifique a conexão do canal nas configurações da loja.'
                  : pendingCount > 0
                  ? `Conversa mais antiga aguardando há ${waitMinutes} min`
                  : 'Central pronta para busca, histórico e debug.'}
              </p>
            </div>

            {totalActions > 0 ? (
              <div className={`shrink-0 rounded-lg px-3 py-2 ${pendingCount > 0 ? 'border border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border border-cyan-500/30 bg-cyan-500/10 text-cyan-200'}`}>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="text-[10px] font-black uppercase tracking-wider">
                    {pendingCount > 0 ? 'Atenção' : 'Revisar'}
                  </span>
                </div>
              </div>
            ) : null}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-3 text-[11px]">
              <span className="text-slate-300">Pendências</span>
              <span className="font-bold text-white">{pendingCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-3 text-[11px]">
              <span className="text-slate-300">Dessas, por PDF/imagem</span>
              <span className="font-bold text-slate-300">{attachmentPendingCount}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/5 border border-white/5 px-3 py-3 text-[11px]">
              <span className="text-slate-300">Em humano</span>
              <span className="font-bold text-white">{humanOverrides}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={!isConnected}
            onClick={(event) => {
              event.stopPropagation()
              if (!isConnected) return
              onOpen()
            }}
            className="w-full rounded-lg bg-green-500/20 text-green-300 hover:bg-green-500 hover:text-white transition-all shadow-sm border border-green-500/20 px-4 py-3 text-[11px] font-black uppercase tracking-wider disabled:cursor-not-allowed disabled:border-slate-600/30 disabled:bg-slate-700/30 disabled:text-slate-500"
          >
            {isConnected ? 'Entrar' : 'Canal desconectado'}
          </button>

          {isConnected && totalActions === 0 ? (
            <p className="text-center text-xs text-slate-400 py-3 font-medium">
              Nenhuma pendência de WhatsApp agora.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
