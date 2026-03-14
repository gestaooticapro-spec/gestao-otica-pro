'use client'

import { useState, useTransition } from 'react'
import { updateTicketStatus } from '@/lib/actions/assistance.actions'
import NewAssistanceModal from '@/components/modals/NewAssistanceModal'
import AssistanceTimelineModal from '@/components/modals/AssistanceTimelineModal'
import {
  Plus, ArrowRight, Clock, CheckCircle,
  Package, MessageCircle, RefreshCw, MessageSquare
} from 'lucide-react'
import { getWhatsAppLink } from '@/lib/utils'

const COLUMNS = {
  'Triagem': { label: 'Triagem / Análise', color: 'bg-slate-500/5 border-white/10', accent: 'text-slate-400' },
  'EmTratativa': { label: 'Em Tratativa', color: 'bg-blue-500/5 border-blue-500/10', accent: 'text-blue-400' },
  'AguardandoChegada': { label: 'Aguardando Peça', color: 'bg-amber-500/5 border-amber-500/10', accent: 'text-amber-400' },
  'AguardandoCliente': { label: 'Pronto / Retirada', color: 'bg-emerald-500/5 border-emerald-500/10', accent: 'text-emerald-400' },
  'LogisticaReversa': { label: 'Logística Reversa', color: 'bg-rose-500/5 border-rose-500/10', accent: 'text-rose-400' }
}

export default function AssistanceKanban({ initialData, storeId }: { initialData: any[], storeId: number }) {
  const [tickets, setTickets] = useState(initialData)

  const [isNewModalOpen, setIsNewModalOpen] = useState(false)

  // Controle do Modal de Timeline
  const [selectedTicket, setSelectedTicket] = useState<any>(null)
  const [isTimelineOpen, setIsTimelineOpen] = useState(false)

  const [isPending, startTransition] = useTransition()

  const moveTicket = (ticketId: number, nextStatus: string, actionMsg: string) => {
    if (!confirm(actionMsg)) return

    startTransition(async () => {
      const res = await updateTicketStatus(ticketId, nextStatus, storeId)
      if (res.success) {
        setTickets(prev => prev.map(t => t.id === ticketId ? { ...t, status: nextStatus } : t))
      } else {
        alert(res.message)
      }
    })
  }

  const sendTrackingLink = (ticket: any) => {
    if (!ticket.customers?.fone_movel) return alert('Cliente sem telefone.')
    const link = `${window.location.origin}/rastreio/${ticket.tracking_token}`
    const msg = `Olá ${ticket.customers.full_name.split(' ')[0]}, acompanhe sua garantia aqui: ${link}`
    window.open(getWhatsAppLink(ticket.customers.fone_movel, msg), '_blank')
  }

  const openTimeline = (ticket: any) => {
    setSelectedTicket(ticket)
    setIsTimelineOpen(true)
  }

  const handleTicketCreated = (newTicket: any) => {
    // Adiciona o novo ticket no topo da lista local
    setTickets(prev => [newTicket, ...prev])
  }

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 flex justify-end bg-transparent border-b border-transparent">
        <button
          onClick={() => setIsNewModalOpen(true)}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg font-bold shadow-lg shadow-indigo-500/20 flex items-center gap-2 text-sm transition-all"
        >
          <Plus className="h-5 w-5" /> Nova Assistência
        </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6 pt-0">
        <div className="flex gap-4 h-full min-w-[1200px]">

          {Object.entries(COLUMNS).map(([key, config]) => {
            const items = tickets.filter(t => t.status === key)

            return (
              <div key={key} className={`flex-1 flex flex-col rounded-xl border ${config.color} min-w-[280px] backdrop-blur-sm transition-colors`}>
                <div className="p-3 border-b border-white/5 bg-white/5 backdrop-blur-md rounded-t-xl">
                  <h3 className={`font-bold text-xs uppercase tracking-wider flex justify-between items-center ${config.accent}`}>
                    {config.label}
                    <span className="bg-slate-800 px-2 py-0.5 rounded-md text-slate-400 font-mono shadow-sm border border-white/5">{items.length}</span>
                  </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
                  {items.map(ticket => (
                    <div key={ticket.id} className="bg-slate-900/60 p-3 rounded-lg shadow-sm border border-white/5 hover:bg-slate-800/60 hover:border-white/10 transition-all relative group backdrop-blur-md">

                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-[9px] font-black uppercase px-2 py-1 rounded-md border text-xs tracking-wide
                             ${ticket.modalidade === 'TrocaGarantida' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
                            ticket.modalidade === 'TrocaImediata' ? 'bg-orange-500/20 text-orange-300 border-orange-500/30' :
                              'bg-blue-500/20 text-blue-300 border-blue-500/30'}`}>
                          {ticket.modalidade === 'TrocaGarantida' ? 'Troca Garantida' :
                            ticket.modalidade === 'TrocaImediata' ? 'Troca Imediata' : 'Padrão'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-mono bg-black/20 px-1.5 py-0.5 rounded">#{ticket.id}</span>
                      </div>

                      <p className="font-bold text-slate-200 text-sm mb-1 line-clamp-2">{ticket.product_descricao}</p>
                      <p className="text-xs text-slate-400 flex items-center gap-1 mb-3">
                        <span className="truncate max-w-[150px]">{ticket.customers.full_name}</span>
                      </p>

                      <div className="border-t border-white/5 pt-3 mt-2 flex justify-between items-center">
                        <div className="flex gap-1">
                          <button onClick={() => sendTrackingLink(ticket)} className="p-1.5 hover:bg-emerald-500/20 rounded-lg text-slate-500 hover:text-emerald-400 transition-colors" title="Rastreio WhatsApp">
                            <MessageCircle className="h-4 w-4" />
                          </button>
                          <button onClick={() => openTimeline(ticket)} className="p-1.5 hover:bg-blue-500/20 rounded-lg text-slate-500 hover:text-blue-400 transition-colors" title="Histórico / Chat">
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Ações de Transição */}
                        {key === 'Triagem' && (
                          <button onClick={() => moveTicket(ticket.id, 'EmTratativa', 'Confirmar contato com fornecedor?')} className="text-[10px] font-bold text-blue-300 bg-blue-500/20 border border-blue-500/30 px-3 py-1.5 rounded-lg hover:bg-blue-500/30 flex items-center gap-1.5 transition-colors">
                            Iniciar <ArrowRight className="h-3 w-3" />
                          </button>
                        )}

                        {key === 'EmTratativa' && (
                          <button onClick={() => moveTicket(ticket.id, 'AguardandoChegada', 'A peça foi solicitada?')} className="text-[10px] font-bold text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 rounded-lg hover:bg-indigo-500/30 flex items-center gap-1.5 transition-colors">
                            Solicitado <Clock className="h-3 w-3" />
                          </button>
                        )}

                        {key === 'AguardandoChegada' && (
                          <button onClick={() => moveTicket(ticket.id, 'AguardandoCliente', 'A peça chegou?')} className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-3 py-1.5 rounded-lg hover:bg-emerald-500/30 flex items-center gap-1.5 transition-colors">
                            Chegou <Package className="h-3 w-3" />
                          </button>
                        )}

                        {key === 'AguardandoCliente' && (
                          <button onClick={() => moveTicket(ticket.id, ticket.modalidade === 'Padrao' ? 'Concluido' : 'LogisticaReversa', 'Cliente retirou?')} className="text-[10px] font-bold text-amber-300 bg-amber-500/20 border border-amber-500/30 px-3 py-1.5 rounded-lg hover:bg-amber-500/30 flex items-center gap-1.5 transition-colors">
                            Entregue <RefreshCw className="h-3 w-3" />
                          </button>
                        )}

                        {key === 'LogisticaReversa' && (
                          <button onClick={() => moveTicket(ticket.id, 'Concluido', 'Peça enviada ao fornecedor?')} className="text-[10px] font-bold text-rose-300 bg-rose-500/20 border border-rose-500/30 px-3 py-1.5 rounded-lg hover:bg-rose-500/30 flex items-center gap-1.5 transition-colors">
                            Finalizar <CheckCircle className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {isNewModalOpen && (
        <NewAssistanceModal
          isOpen={true}
          onClose={() => setIsNewModalOpen(false)}
          storeId={storeId}
          onSuccess={handleTicketCreated} // Atualização sem F5
        />
      )}

      <AssistanceTimelineModal
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        ticket={selectedTicket}
      />
    </div>
  )
}