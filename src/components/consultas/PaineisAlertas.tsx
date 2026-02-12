// Caminho: src/components/consultas/PaineisAlertas.tsx
'use client'

import { useState } from 'react'
import { AlertaEntrega, AlertaLaboratorio } from '@/lib/actions/consultas.actions'
import { AlertCircle, Clock, CalendarCheck, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react'
import Link from 'next/link'

const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

// --- WIDGET 1: LABORATÓRIO (Lentes Paradas) ---
export function WidgetLaboratorio({ data, storeId }: { data: AlertaLaboratorio[], storeId: number }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="flex flex-col bg-black/20 rounded-3xl shadow-xl border border-white/5 overflow-hidden h-fit transition-all duration-300 backdrop-blur-sm ring-1 ring-white/10">
            <div
                className="px-6 py-5 flex justify-between items-center cursor-pointer hover:bg-rose-500/20 transition-colors bg-rose-500/10"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-rose-500/20 text-rose-400 rounded-2xl shadow-inner border border-rose-500/10">
                        <AlertCircle className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-rose-100 text-sm">Lentes Paradas</h3>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {data.length > 0 && <span className="bg-rose-500 text-rose-950 text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-rose-900/20">{data.length}</span>}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 pt-0 overflow-y-auto custom-scrollbar space-y-3 max-h-[400px] animate-in slide-in-from-top-2 duration-200 bg-black/40 pt-4">
                    {data.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium">Laboratório em dia.</p>
                    ) : (
                        data.map(item => (
                            <div key={item.id} className="group p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-rose-500/50 hover:bg-white/10 hover:shadow-md transition-all flex justify-between items-center">
                                <div>
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-slate-200 group-hover:text-white text-xs transition-colors">{item.customer_name}</span>
                                        <span className="text-[10px] bg-white/10 border border-white/10 px-1.5 rounded text-slate-400 font-mono">#{item.id}</span>
                                    </div>
                                    <div className="flex gap-2 text-xs">
                                        <span className="text-rose-400 font-bold flex items-center gap-1">
                                            <Clock className="h-3 w-3" /> {item.tempo_decorrido_horas}h parado
                                        </span>
                                    </div>
                                </div>
                                <Link href={`/dashboard/loja/${storeId}/vendas/${item.venda_id}/os?os_id=${item.id}`}>
                                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-rose-500/20 text-rose-400 hover:bg-rose-500 hover:text-white transition-all shadow-sm cursor-pointer border border-rose-500/20">
                                        <ArrowRight className="h-5 w-5" />
                                    </div>
                                </Link>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    )
}

// --- WIDGET 2: ENTREGAS (Entregar Hoje) ---
export function WidgetEntregas({ data, storeId }: { data: AlertaEntrega[], storeId: number }) {
    const [isOpen, setIsOpen] = useState(false)

    return (
        <div className="flex flex-col bg-black/20 rounded-3xl shadow-xl border border-white/5 overflow-hidden h-fit transition-all duration-300 backdrop-blur-sm ring-1 ring-white/10">
            <div
                className="px-6 py-5 flex justify-between items-center cursor-pointer hover:bg-indigo-500/20 transition-colors bg-indigo-500/10"
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-2xl shadow-inner border border-indigo-500/10">
                        <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-indigo-100 text-sm">Entregar Hoje</h3>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {data.length > 0 && <span className="bg-indigo-500 text-indigo-950 text-xs font-black px-2.5 py-1 rounded-full shadow-lg shadow-indigo-900/20">{data.length}</span>}
                    {isOpen ? <ChevronUp className="h-4 w-4 text-white/50" /> : <ChevronDown className="h-4 w-4 text-white/50" />}
                </div>
            </div>

            {isOpen && (
                <div className="p-4 pt-0 overflow-y-auto custom-scrollbar space-y-3 max-h-[400px] animate-in slide-in-from-top-2 duration-200 bg-black/40 pt-4">
                    {data.length === 0 ? (
                        <p className="text-center text-xs text-slate-400 py-6 font-medium">Sem entregas urgentes.</p>
                    ) : (
                        data.map(item => {
                            const isAtrasado = new Date(item.dt_prometido_para) < new Date(new Date().setHours(0, 0, 0, 0));
                            return (
                                <div key={item.id} className="p-3 rounded-2xl bg-white/5 border border-white/5 hover:border-indigo-500/50 hover:bg-white/10 hover:shadow-md transition-all flex justify-between items-center group">
                                    <div>
                                        <div className="flex justify-between items-start mb-1 gap-2">
                                            <span className="font-bold text-slate-200 group-hover:text-white text-xs truncate max-w-[150px] transition-colors">{item.customer_name}</span>
                                            {isAtrasado && <span className="text-[9px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded shadow-lg shadow-rose-900/50">ATRASADO</span>}
                                        </div>
                                        <div className="flex justify-between text-[10px] items-center gap-2">
                                            <span className="text-slate-400">OS #{item.id}</span>
                                            <span className="text-indigo-400 font-bold">{formatDate(item.dt_prometido_para)}</span>
                                        </div>
                                    </div>

                                    <Link href={`/dashboard/loja/${storeId}/vendas/${item.venda_id}/os?os_id=${item.id}`}>
                                        <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 hover:text-white transition-all shadow-sm cursor-pointer border border-indigo-500/20">
                                            <ArrowRight className="h-5 w-5" />
                                        </div>
                                    </Link>
                                </div>
                            )
                        })
                    )}
                </div>
            )}
        </div>
    )
}

// --- MANTIDO PARA COMPATIBILIDADE COM PÁGINA DE CONSULTAS ---
export default function PaineisAlertas({
    entregas,
    laboratorio,
    storeId
}: {
    entregas: AlertaEntrega[],
    laboratorio: AlertaLaboratorio[],
    storeId: number
}) {
    return (
        <div className="flex flex-col gap-6">
            <WidgetLaboratorio data={laboratorio} storeId={storeId} />
            <WidgetEntregas data={entregas} storeId={storeId} />
        </div>
    )
}