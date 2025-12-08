// Caminho: src/components/consultas/PaineisAlertas.tsx
'use client'

import { AlertaEntrega, AlertaLaboratorio } from '@/lib/actions/consultas.actions'
import { AlertCircle, Clock, CalendarCheck, ArrowRight } from 'lucide-react'
import Link from 'next/link'

const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

// --- WIDGET 1: LABORATÓRIO (Lentes Paradas) ---
export function WidgetLaboratorio({ data, storeId }: { data: AlertaLaboratorio[], storeId: number }) {
    return (
        <div className="flex flex-col bg-white rounded-3xl shadow-[0_10px_30px_-10px_rgba(225,29,72,0.15)] border border-white/50 overflow-hidden h-fit max-h-[400px]">
            <div className="px-6 py-5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-rose-50 text-rose-500 rounded-2xl shadow-sm">
                        <AlertCircle className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-700 text-sm">Lentes Paradas</h3>
                    </div>
                </div>
                {data.length > 0 && <span className="bg-rose-100 text-rose-600 text-xs font-black px-2.5 py-1 rounded-full">{data.length}</span>}
            </div>

            <div className="p-4 pt-0 overflow-y-auto custom-scrollbar space-y-3">
                {data.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-6 font-medium">Laboratório em dia.</p>
                ) : (
                    data.map(item => (
                        <div key={item.id} className="group p-3 rounded-2xl bg-slate-50/50 border border-transparent hover:border-rose-200 hover:bg-white hover:shadow-md transition-all flex justify-between items-center">
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="font-bold text-slate-700 text-xs">{item.customer_name}</span>
                                    <span className="text-[10px] bg-white border border-slate-200 px-1.5 rounded text-slate-400 font-mono">#{item.id}</span>
                                </div>
                                <div className="flex gap-2 text-xs">
                                    <span className="text-rose-500 font-bold flex items-center gap-1">
                                        <Clock className="h-3 w-3" /> {item.tempo_decorrido_horas}h parado
                                    </span>
                                </div>
                            </div>
                            <Link href={`/dashboard/loja/${storeId}/vendas/${item.venda_id}/os?os_id=${item.id}`}>
                                <div className="flex items-center justify-center w-9 h-9 rounded-full bg-rose-100 text-rose-600 hover:bg-rose-500 hover:text-white transition-all shadow-sm cursor-pointer">
                                    <ArrowRight className="h-5 w-5" />
                                </div>
                            </Link>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}

// --- WIDGET 2: ENTREGAS (Entregar Hoje) ---
export function WidgetEntregas({ data, storeId }: { data: AlertaEntrega[], storeId: number }) {
    return (
        <div className="flex flex-col bg-white rounded-3xl shadow-[0_10px_30px_-10px_rgba(79,70,229,0.15)] border border-white/50 overflow-hidden h-fit max-h-[400px]">
            <div className="px-6 py-5 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-indigo-50 text-indigo-500 rounded-2xl shadow-sm">
                        <CalendarCheck className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-700 text-sm">Entregar Hoje</h3>
                    </div>
                </div>
                {data.length > 0 && <span className="bg-indigo-100 text-indigo-600 text-xs font-black px-2.5 py-1 rounded-full">{data.length}</span>}
            </div>

            <div className="p-4 pt-0 overflow-y-auto custom-scrollbar space-y-3">
                {data.length === 0 ? (
                    <p className="text-center text-xs text-slate-400 py-6 font-medium">Sem entregas urgentes.</p>
                ) : (
                    data.map(item => {
                        const isAtrasado = new Date(item.dt_prometido_para) < new Date(new Date().setHours(0,0,0,0));
                        return (
                            <div key={item.id} className="p-3 rounded-2xl bg-slate-50/50 border border-transparent hover:border-indigo-200 hover:bg-white hover:shadow-md transition-all flex justify-between items-center">
                                <div>
                                    <div className="flex justify-between items-start mb-1 gap-2">
                                        <span className="font-bold text-slate-700 text-xs truncate max-w-[150px]">{item.customer_name}</span>
                                        {isAtrasado && <span className="text-[9px] font-black text-white bg-rose-500 px-1.5 py-0.5 rounded">ATRASADO</span>}
                                    </div>
                                    <div className="flex justify-between text-[10px] items-center gap-2">
                                        <span className="text-slate-400">OS #{item.id}</span>
                                        <span className="text-indigo-600 font-bold">{formatDate(item.dt_prometido_para)}</span>
                                    </div>
                                </div>

                                <Link href={`/dashboard/loja/${storeId}/vendas/${item.venda_id}/os?os_id=${item.id}`}>
                                    <div className="flex items-center justify-center w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 hover:bg-indigo-500 hover:text-white transition-all shadow-sm cursor-pointer">
                                        <ArrowRight className="h-5 w-5" />
                                    </div>
                                </Link>
                            </div>
                        )
                    })
                )}
            </div>
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