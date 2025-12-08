'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useTransition, useState } from 'react'
import { Search, Filter, ArrowRightLeft, ArrowDownUp, Loader2, Plus } from 'lucide-react'
import StockMovementModalClientWrapper from './StockMovementModalClientWrapper'

// --- ESTILOS DO DESIGN SYSTEM (Alto Contraste) ---
const labelStyle = "block text-[9px] font-bold text-slate-700 uppercase mb-0.5 tracking-wider"
const inputStyle = "block w-full rounded-md border border-slate-300 bg-white shadow-sm text-slate-900 h-8 text-xs px-2 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-bold transition-all"

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
        // O usuário clica em filtrar depois para confirmar
    }

    return (
        <div className="h-full flex flex-col">
            
            {/* Header Gradiente Laranja */}
            <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-4 flex flex-col gap-3 shadow-md z-20 shrink-0">
                <div className="flex justify-between items-center text-white">
                    <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                        <ArrowRightLeft className="h-4 w-4" /> Filtros
                    </h2>
                </div>
                
                {/* Busca Principal */}
                <div className="relative">
                    <input 
                        type="text" 
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && applyFilter()}
                        placeholder="Buscar produto, motivo..." 
                        className="w-full h-9 pl-9 pr-3 rounded-lg border-0 bg-white shadow-lg text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-amber-300 font-bold text-xs"
                    />
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                </div>
            </div>

            {/* Corpo dos Filtros */}
            <div className="flex-1 overflow-y-auto p-4 bg-white">
                <div className="space-y-4">
                    
                    {/* Botões de Período Rápido */}
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => handlePresetDate('hoje')} className="px-2 py-1.5 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 text-[10px] font-bold rounded border border-slate-200 transition-colors">
                            Hoje
                        </button>
                        <button onClick={() => handlePresetDate('mes')} className="px-2 py-1.5 bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-700 text-[10px] font-bold rounded border border-slate-200 transition-colors">
                            Este Mês
                        </button>
                    </div>

                    <div>
                        <label className={labelStyle}>Data Início</label>
                        <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={inputStyle} />
                    </div>
                    
                    <div>
                        <label className={labelStyle}>Data Fim</label>
                        <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={inputStyle} />
                    </div>

                    <div className="border-t border-slate-100 my-2"></div>

                    <div>
                        <label className={labelStyle}>Tipo de Movimento</label>
                        <div className="relative">
                            <ArrowDownUp className="absolute left-2 top-2 h-4 w-4 text-slate-400 pointer-events-none" />
                            <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inputStyle} pl-8 cursor-pointer`}>
                                <option value="Todos">Todos</option>
                                <option value="Entrada">Entrada (Suprimento)</option>
                                <option value="Saida">Saída (Venda/Baixa)</option>
                                <option value="Perda">Perda / Quebra</option>
                                <option value="Brinde">Brinde / Cortesia</option>
                                <option value="Ajuste">Ajuste de Inventário</option>
                            </select>
                        </div>
                    </div>

                    <button 
                        onClick={applyFilter}
                        disabled={isPending}
                        className="w-full bg-slate-800 hover:bg-slate-900 text-white h-9 rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all active:scale-95"
                    >
                        {isPending ? <Loader2 className="h-3 w-3 animate-spin"/> : <Filter className="h-3 w-3" />}
                        FILTRAR RESULTADOS
                    </button>
                    
                    {/* NOVA POSIÇÃO: Abaixo do botão Filtrar */}
                    <div className="pt-4 mt-4 border-t border-slate-100">
                        <StockMovementModalClientWrapper storeId={storeId} />
                    </div>

                </div>
            </div>
        </div>
    )
}