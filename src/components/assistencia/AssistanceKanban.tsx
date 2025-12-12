'use client'

import { useState, useTransition } from 'react'
import { updateTicketStatus } from '@/lib/actions/assistance.actions'
import NewAssistanceModal from '@/components/modals/NewAssistanceModal'
import AssistanceTimelineModal from '@/components/modals/AssistanceTimelineModal' // Novo Import
import { 
  Plus, ArrowRight, Clock, CheckCircle, 
  Package, MessageCircle, RefreshCw, MessageSquare 
} from 'lucide-react'

const COLUMNS = {
  'Triagem': { label: 'Triagem / Análise', color: 'bg-slate-100 border-slate-200' },
  'EmTratativa': { label: 'Em Tratativa', color: 'bg-blue-50 border-blue-100' },
  'AguardandoChegada': { label: 'Aguardando Peça', color: 'bg-amber-50 border-amber-100' },
  'AguardandoCliente': { label: 'Pronto / Retirada', color: 'bg-emerald-50 border-emerald-100' },
  'LogisticaReversa': { label: 'Logística Reversa', color: 'bg-rose-50 border-rose-100' }
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
     const num = ticket.customers.fone_movel.replace(/\D/g, '')
     const link = `${window.location.origin}/rastreio/${ticket.tracking_token}`
     const msg = `Olá ${ticket.customers.full_name.split(' ')[0]}, acompanhe sua garantia aqui: ${link}`
     window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
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
      <div className="px-6 py-4 flex justify-end bg-slate-50 border-b border-slate-200">
         <button 
           onClick={() => setIsNewModalOpen(true)}
           className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-bold shadow-md flex items-center gap-2 text-sm transition-all"
         >
           <Plus className="h-5 w-5" /> Nova Assistência
         </button>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-hidden p-6">
        <div className="flex gap-4 h-full min-w-[1200px]">
          
          {Object.entries(COLUMNS).map(([key, config]) => {
            const items = tickets.filter(t => t.status === key)
            
            return (
              <div key={key} className={`flex-1 flex flex-col rounded-xl border ${config.color} min-w-[280px]`}>
                <div className="p-3 border-b border-white/50 bg-white/30 backdrop-blur-sm">
                   <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wider flex justify-between">
                     {config.label}
                     <span className="bg-white px-2 py-0.5 rounded-full text-slate-500 shadow-sm">{items.length}</span>
                   </h3>
                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-3 custom-scrollbar">
                  {items.map(ticket => (
                    <div key={ticket.id} className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 hover:shadow-md transition-all relative group">
                       
                       <div className="flex justify-between items-start mb-2">
                          <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border 
                             ${ticket.modalidade === 'TrocaGarantida' ? 'bg-purple-100 text-purple-700 border-purple-200' : 
                               ticket.modalidade === 'TrocaImediata' ? 'bg-orange-100 text-orange-700 border-orange-200' : 
                               'bg-blue-100 text-blue-700 border-blue-200'}`}>
                             {ticket.modalidade === 'TrocaGarantida' ? 'Troca Garantida' : 
                              ticket.modalidade === 'TrocaImediata' ? 'Troca Imediata' : 'Padrão'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">#{ticket.id}</span>
                       </div>

                       <p className="font-bold text-slate-800 text-sm mb-1">{ticket.product_descricao}</p>
                       <p className="text-xs text-slate-500 flex items-center gap-1 mb-3">
                         <span className="truncate max-w-[150px]">{ticket.customers.full_name}</span>
                       </p>

                       <div className="border-t border-slate-100 pt-2 mt-2 flex justify-between items-center">
                          <div className="flex gap-1">
                              <button onClick={() => sendTrackingLink(ticket)} className="p-1.5 hover:bg-green-50 rounded text-slate-400 hover:text-green-600 transition-colors" title="Rastreio WhatsApp">
                                 <MessageCircle className="h-4 w-4" />
                              </button>
                              <button onClick={() => openTimeline(ticket)} className="p-1.5 hover:bg-blue-50 rounded text-slate-400 hover:text-blue-600 transition-colors" title="Histórico / Chat">
                                 <MessageSquare className="h-4 w-4" />
                              </button>
                          </div>

                          {/* Ações de Transição */}
                          {key === 'Triagem' && (
                             <button onClick={() => moveTicket(ticket.id, 'EmTratativa', 'Confirmar contato com fornecedor?')} className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1">
                                Iniciar <ArrowRight className="h-3 w-3"/>
                             </button>
                          )}
                          
                          {key === 'EmTratativa' && (
                             <button onClick={() => moveTicket(ticket.id, 'AguardandoChegada', 'A peça foi solicitada?')} className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 flex items-center gap-1">
                                Solicitado <Clock className="h-3 w-3"/>
                             </button>
                          )}

                          {key === 'AguardandoChegada' && (
                             <button onClick={() => moveTicket(ticket.id, 'AguardandoCliente', 'A peça chegou?')} className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded hover:bg-emerald-100 flex items-center gap-1">
                                Chegou <Package className="h-3 w-3"/>
                             </button>
                          )}

                          {key === 'AguardandoCliente' && (
                             <button onClick={() => moveTicket(ticket.id, ticket.modalidade === 'Padrao' ? 'Concluido' : 'LogisticaReversa', 'Cliente retirou?')} className="text-[10px] font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded hover:bg-orange-100 flex items-center gap-1">
                                Entregue <RefreshCw className="h-3 w-3"/>
                             </button>
                          )}

                          {key === 'LogisticaReversa' && (
                             <button onClick={() => moveTicket(ticket.id, 'Concluido', 'Peça enviada ao fornecedor?')} className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded hover:bg-green-100 flex items-center gap-1">
                                Finalizar <CheckCircle className="h-3 w-3"/>
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

      <NewAssistanceModal 
        isOpen={isNewModalOpen} 
        onClose={() => setIsNewModalOpen(false)} 
        storeId={storeId} 
        onSuccess={handleTicketCreated} // Atualização sem F5
      />

      <AssistanceTimelineModal 
        isOpen={isTimelineOpen}
        onClose={() => setIsTimelineOpen(false)}
        ticket={selectedTicket}
      />
    </div>
  )
}