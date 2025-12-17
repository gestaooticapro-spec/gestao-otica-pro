'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { ListFilter, Calendar, Search } from 'lucide-react'

export default function VendasFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()

    // Estado inicial baseado na URL
    const [mode, setMode] = useState<'pendencias' | 'historico'>(
        (searchParams.get('mode') as 'pendencias' | 'historico') || 'pendencias'
    )
    
    // Datas padrão (Mês atual)
    const hoje = new Date()
    const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0]
    const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]

    const [dataInicio, setDataInicio] = useState(searchParams.get('inicio') || inicioMes)
    const [dataFim, setDataFim] = useState(searchParams.get('fim') || fimMes)

    // Atualiza a URL quando clica em filtrar ou muda a aba
    const applyFilter = (newMode: 'pendencias' | 'historico') => {
        setMode(newMode)
        const params = new URLSearchParams()
        params.set('mode', newMode)
        
        if (newMode === 'historico') {
            params.set('inicio', dataInicio)
            params.set('fim', dataFim)
        } else {
            // Limpa datas se for modo pendência para não poluir a URL
            params.delete('inicio')
            params.delete('fim')
        }
        
        router.push(`?${params.toString()}`)
    }

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm mb-6 space-y-4">
            
            {/* Abas Superiores */}
            <div className="flex p-1 bg-gray-100 rounded-lg w-fit">
                <button
                    onClick={() => applyFilter('pendencias')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                        mode === 'pendencias' 
                        ? 'bg-white text-blue-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <ListFilter className="h-4 w-4" />
                    Pendências (Em Aberto)
                </button>
                <button
                    onClick={() => {
                        setMode('historico')
                        // Não aplica direto para deixar o usuário escolher a data, mas muda a UI visualmente
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${
                        mode === 'historico' 
                        ? 'bg-white text-purple-600 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <Calendar className="h-4 w-4" />
                    Histórico por Período
                </button>
            </div>

            {/* Controles de Data (Só aparecem no modo Histórico) */}
            {mode === 'historico' && (
                <div className="flex flex-wrap items-end gap-3 animate-in slide-in-from-top-2">
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">De</label>
                        <input 
                            type="date" 
                            value={dataInicio} 
                            onChange={e => setDataInicio(e.target.value)}
                            className="h-10 rounded-lg border-gray-300 text-sm font-bold" 
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Até</label>
                        <input 
                            type="date" 
                            value={dataFim} 
                            onChange={e => setDataFim(e.target.value)}
                            className="h-10 rounded-lg border-gray-300 text-sm font-bold" 
                        />
                    </div>
                    <button 
                        onClick={() => applyFilter('historico')}
                        className="h-10 px-6 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 shadow-sm transition-transform active:scale-95"
                    >
                        <Search className="h-4 w-4" />
                        Buscar
                    </button>
                </div>
            )}
        </div>
    )
}