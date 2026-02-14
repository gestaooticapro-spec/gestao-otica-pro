'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useState } from 'react'
import { Search, Filter, ArrowRightLeft, ArrowDownUp, Loader2, Plus } from 'lucide-react'
import StockMovementModalClientWrapper from './StockMovementModalClientWrapper'

// --- ESTILOS DO DESIGN SYSTEM (Dark Glassmorphism) ---
const labelStyle = "block text-[10px] font-bold text-slate-500 uppercase mb-1 tracking-wider pl-1"
const inputStyle = "block w-full rounded-xl border border-white/10 bg-black/20 shadow-sm text-slate-200 h-9 text-xs px-3 focus:outline-none focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 font-medium transition-all placeholder:text-slate-600"

const getTodayString = () => new Date().toISOString().split('T')[0]
const getFirstDayOfMonthString = () => {
    const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]
}

export default function StockFiltersBar({ storeId }: { storeId: number }) {
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const [isPending, startTransition] = useTransition()

    // Estado local sincronizado com URL ou Padrão
    const [tipo, setTipo] = useState(searchParams.get('tipo') || 'Todos')
    const [busca, setBusca] = useState(searchParams.get('busca') || '')
    const [dataInicio, setDataInicio] = useState(searchParams.get('inicio') || getTodayString())
    const [dataFim, setDataFim] = useState(searchParams.get('fim') || getTodayString())

    const applyFilter = () => {
        const params = new URLSearchParams(searchParams)

        if (tipo !== 'Todos') params.set('tipo', tipo); else params.delete('tipo')
        if (busca) params.set('busca', busca); else params.delete('busca')

        params.set('inicio', dataInicio)
        params.set('fim', dataFim)

        startTransition(() => {
            router.replace(`${pathname}?${params.toString()}`)
        })
    }

    const handlePresetDate = (preset: 'hoje' | 'mes') => {
        const hoje = getTodayString()
        if (preset === 'hoje') {
            setDataInicio(hoje); setDataFim(hoje);
        } else {
            setDataInicio(getFirstDayOfMonthString()); setDataFim(hoje);
        }
    }

    return (
        <div className="h-full flex flex-col bg-slate-900/30 backdrop-blur-md border-r border-white/5">

            {/* Header com Gradiente Suave */}
            <div className="bg-gradient-to-br from-amber-500/10 to-orange-600/10 p-5 flex flex-col gap-4 border-b border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-slate-900/20 pointer-events-none"></div>

                <div className="flex justify-between items-center text-amber-500 relative z-10">
                    <h2 className="font-black text-sm flex items-center gap-2 uppercase tracking-wide">
                        <ArrowRightLeft className="h-4 w-4" /> Filtros
                    </h2>
                </div>

                {/* Busca Principal */}
                <div className="relative z-10">
                    <input
                        type="text"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                        placeholder="Buscar produto, motivo..."
                        className="w-full h-10 pl-10 pr-3 rounded-xl border border-white/10 bg-black/20 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-amber-500/50 font-medium text-xs shadow-inner"
                    />
                    <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                </div>
            </div>

            {/* Corpo dos Filtros */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar">
                <div className="space-y-5">

                    {/* Botões de Período Rápido */}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handlePresetDate('hoje')} className="px-2 py-2 bg-slate-800/50 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-white/5 hover:border-amber-500/20 text-[10px] font-bold rounded-lg transition-all">
                            HOJE
                        </button>
                        <button onClick={() => handlePresetDate('mes')} className="px-2 py-2 bg-slate-800/50 hover:bg-amber-500/10 text-slate-400 hover:text-amber-400 border border-white/5 hover:border-amber-500/20 text-[10px] font-bold rounded-lg transition-all">
                            ESTE MÊS
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div>
                                <label className={labelStyle}>Data Início</label>
                                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={`${inputStyle} text-slate-400`} />
                            </div>

                            <div>
                                <label className={labelStyle}>Data Fim</label>
                                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={`${inputStyle} text-slate-400`} />
                            </div>
                        </div>
                    </div>

                    <div className="border-t border-white/5 my-2"></div>

                    <div>
                        <label className={labelStyle}>Tipo de Movimento</label>
                        <div className="relative">
                            <ArrowDownUp className="absolute left-3 top-2.5 h-4 w-4 text-slate-500 pointer-events-none" />
                            <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inputStyle} pl-9 cursor-pointer appearance-none`}>
                                <option value="Todos" className="bg-slate-900 text-slate-200">Todos os Tipos</option>
                                <option value="Entrada" className="bg-slate-900 text-slate-200">Entrada (Suprimento)</option>
                                <option value="Saida" className="bg-slate-900 text-slate-200">Saída (Venda/Baixa)</option>
                                <option value="Perda" className="bg-slate-900 text-slate-200">Perda / Quebra</option>
                                <option value="Brinde" className="bg-slate-900 text-slate-200">Brinde / Cortesia</option>
                                <option value="Ajuste" className="bg-slate-900 text-slate-200">Ajuste de Inventário</option>
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={applyFilter}
                        disabled={isPending}
                        className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white h-10 rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-orange-900/20 transition-all active:scale-[0.98] mt-2"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Filter className="h-4 w-4" />}
                        FILTRAR RESULTADOS
                    </button>

                    {/* NOVA POSIÇÃO: Abaixo do botão Filtrar */}
                    <div className="pt-6 mt-2 border-t border-white/5">
                        <p className="text-[10px] font-bold text-slate-600 uppercase mb-3 pl-1 tracking-wider">Ações</p>
                        <StockMovementModalClientWrapper storeId={storeId} initialSearchTerm={busca} />
                    </div>

                </div>
            </div>
        </div>
    )
}