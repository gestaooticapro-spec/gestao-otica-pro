'use client'

import { useState } from 'react'
import { MessageCircle, Send, ChevronDown, ChevronUp } from 'lucide-react'
import { RetornoCobranca } from '@/lib/actions/collection.actions'

export default function RetornosCobrancaWidget({ retornos }: { retornos: RetornoCobranca[] }) {
    const [isOpen, setIsOpen] = useState(false)

    const handleZap = (item: RetornoCobranca) => {
        if (!item.fone_movel) return alert("Cliente sem celular cadastrado.")
        const num = item.fone_movel.replace(/\D/g, '')
        const msg = `Olá ${item.customer_name.split(' ')[0]}, tudo bem? Aqui é da Ótica. Estou entrando em contato conforme combinamos anteriormente sobre sua pendência. Podemos conversar?`
        window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div className="bg-black/20 rounded-3xl shadow-xl border border-white/5 overflow-hidden h-fit transition-all duration-300 backdrop-blur-sm ring-1 ring-white/10">

            {/* CABEÇALHO */}
            <div
                className="px-6 py-5 flex justify-between items-center bg-orange-500/10 cursor-pointer hover:bg-orange-500/20 transition-colors"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-orange-500/20 text-orange-400 rounded-2xl shadow-inner border border-orange-500/10">
                        <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-orange-100 text-sm">Retornos</h3>
                        <p className="text-[10px] text-orange-200/60 font-medium uppercase tracking-wider">Cobrança Agendada</p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {retornos.length > 0 && (
                        <span className="bg-orange-500 text-orange-950 text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-orange-900/20">
                            {retornos.length}
                        </span>
                    )}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
                </div>
            </div>

            {/* CONTEÚDO */}
            {isOpen && (
                <div className="p-4 space-y-3 animate-in slide-in-from-top-2 duration-200 bg-black/40">
                    {retornos.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium italic">
                            Nenhum retorno agendado para hoje. ☀️
                        </p>
                    ) : (
                        retornos.map((item) => (
                            <div key={item.id} className="group p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-orange-500/50 hover:bg-white/10 transition-all flex justify-between items-center">
                                <div className="flex-1 overflow-hidden pr-2">
                                    <p className="font-bold text-slate-200 text-xs truncate group-hover:text-white transition-colors">
                                        {item.customer_name}
                                    </p>
                                    <p className="text-[10px] text-slate-400 mt-0.5 group-hover:text-slate-300 truncate">
                                        <span className="font-bold text-orange-500/70">{item.tipo_contato}:</span> {item.resumo_conversa}
                                    </p>
                                </div>
                                <button
                                    onClick={() => handleZap(item)}
                                    className="flex items-center justify-center w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-white transition-all shadow-sm border border-emerald-500/20 shrink-0"
                                    title="Enviar WhatsApp"
                                >
                                    <Send className="h-4 w-4" />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}
