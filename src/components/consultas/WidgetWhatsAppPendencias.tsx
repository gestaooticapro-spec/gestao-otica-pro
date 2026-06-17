'use client'

import { useState } from 'react'
import { MessageSquareText, ChevronDown, ChevronUp, Receipt, Navigation } from 'lucide-react'
import { WhatsAppPendencia } from '@/lib/actions/consultas.actions'
import { useModals } from '@/lib/contexts/ModalsContext'

export default function WidgetWhatsAppPendencias({ pendencias }: { pendencias: WhatsAppPendencia[] }) {
    const [isOpen, setIsOpen] = useState(false)
    const { openParcelaModal } = useModals()

    return (
        <div className="bg-black/20 rounded-3xl shadow-xl border border-white/5 overflow-hidden h-fit transition-all duration-300 backdrop-blur-sm ring-1 ring-white/10">

            {/* CABEÇALHO */}
            <div
                className="px-6 py-5 flex justify-between items-center bg-green-500/10 cursor-pointer hover:bg-green-500/20 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-green-500/20 text-green-400 rounded-2xl shadow-inner border border-green-500/10">
                        <MessageSquareText className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-green-100 text-sm">WHATSAPP</h3>
                        <p className="text-[10px] text-green-200/60 font-medium uppercase tracking-wider">Aguardando Atendimento</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {pendencias.length > 0 && (
                        <span className="bg-green-500 text-green-950 text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-green-900/20">
                            {pendencias.length}
                        </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
                </div>
            </div>

            {/* CONTEÚDO */}
            {isOpen && (
                <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200 bg-black/40">
                    {pendencias.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium italic">
                            Nenhum cliente aguardando atendimento. ✨
                        </p>
                    ) : (
                        pendencias.map((item) => {
                            const waitMinutes = Math.floor((new Date().getTime() - new Date(item.updated_at).getTime()) / 60000)
                            
                            return (
                                <div key={item.id} className="group p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-green-500/50 hover:bg-white/10 transition-all flex flex-col gap-2">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1 overflow-hidden pr-2">
                                            <p className="font-bold text-slate-200 text-xs truncate group-hover:text-white transition-colors">
                                                {item.remote_phone}
                                            </p>
                                        </div>
                                        <div className="shrink-0 text-[10px] font-bold text-slate-400 bg-black/40 px-2 py-0.5 rounded-full">
                                            {waitMinutes}m
                                        </div>
                                    </div>
                                    
                                    {item.ai_extracted_receipt?.is_receipt && (
                                        <div className="mt-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
                                            <div className="flex items-center gap-2 text-emerald-400 mb-2">
                                                <Receipt className="h-4 w-4" />
                                                <span className="text-xs font-bold uppercase tracking-wider">Comprovante Identificado</span>
                                            </div>
                                            <div className="space-y-1 mb-3">
                                                <p className="text-sm font-black text-white">{item.ai_extracted_receipt.amount}</p>
                                                <p className="text-[10px] text-emerald-100/70 truncate">Por: {item.ai_extracted_receipt.payer_name}</p>
                                                <p className="text-[10px] text-emerald-100/70">Data: {item.ai_extracted_receipt.payment_date}</p>
                                            </div>
                                            <button 
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    openParcelaModal(item.remote_phone);
                                                }}
                                                className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold py-2 rounded-lg transition-colors uppercase tracking-wide"
                                            >
                                                <Navigation className="h-3 w-3" />
                                                Acessar Parcela
                                            </button>
                                        </div>
                                    )}

                                    {item.internal_note ? (
                                        <div className="p-2 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] text-green-100/90 italic">
                                            <span className="font-bold text-green-400 not-italic mr-1">Resumo IA:</span>
                                            {item.internal_note}
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 mt-0.5 group-hover:text-slate-300">
                                            <span className="font-bold text-green-500/70">Motivo:</span> Handoff manual ou intenção não automatizada.
                                        </p>
                                    )}
                                </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}
