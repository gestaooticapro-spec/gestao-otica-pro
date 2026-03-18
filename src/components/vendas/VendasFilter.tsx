'use client'

import { useState, useEffect, useTransition } from 'react'
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
    const [search, setSearch] = useState(searchParams.get('search') || '')

    const [isPending, startTransition] = useTransition()

    // Sincroniza o estado com a URL quando ela muda (navegação externa)
    useEffect(() => {
        const urlMode = searchParams.get('mode') as 'pendencias' | 'historico'
        if (urlMode && urlMode !== mode) {
            setMode(urlMode)
        }
        setSearch(searchParams.get('search') || '')
    }, [searchParams, mode])

    // Atualiza a URL quando clica em filtrar ou muda a aba
    const applyFilter = (newMode: 'pendencias' | 'historico', newSearch?: string) => {
        startTransition(() => {
            setMode(newMode)
            const params = new URLSearchParams(searchParams.toString())
            params.set('mode', newMode)

            // Se passar newSearch string (mesmo vazia), usa ela. Se undefined, usa o state atual.
            const termo = newSearch !== undefined ? newSearch : search
            if (termo) params.set('search', termo)
            else params.delete('search')

            if (newMode === 'historico') {
                params.set('inicio', dataInicio)
                params.set('fim', dataFim)
            } else {
                // Limpa datas se for modo pendência para não poluir a URL
                params.delete('inicio')
                params.delete('fim')
            }

            router.push(`?${params.toString()}`)
        })
    }

    // EFEITO REATIVO (DEBOUNCE) PARA A BUSCA
    useEffect(() => {
        const timer = setTimeout(() => {
            // Só aplica o filtro automaticamente se limpar o campo ou digitar >= 3 letras
            if (search.length >= 3 || search.length === 0) {
                // Verifica se a URL já está com esse valor de busca para não rodar à toa
                const urlSearch = searchParams.get('search') || '';
                if (search !== urlSearch) {
                    applyFilter(mode, search);
                }
            }
        }, 500)

        return () => clearTimeout(timer)
    }, [search, mode]) // eslint-disable-line react-hooks/exhaustive-deps

    const handleSearchSubmit = (e?: React.FormEvent) => {
        e?.preventDefault()
        applyFilter(mode, search)
    }

    // Busca ao limpar o input
    const handleClearSearch = () => {
        setSearch('')
        applyFilter(mode, '')
    }

    return (
        <div className={`bg-white/5 backdrop-blur-md p-4 rounded-xl border border-white/10 shadow-lg mb-6 flex flex-col xl:flex-row items-start xl:items-center gap-4 transition-opacity duration-300 ${isPending ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
            
            {/* 1ª COLUNA: Abas Superiores */}
            <div className="flex p-1 bg-black/20 rounded-lg w-fit border border-white/5 flex-shrink-0">
                <button
                    onClick={() => applyFilter('pendencias')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'pendencias'
                        ? 'bg-amber-500/20 text-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.2)] border border-amber-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <ListFilter className="h-4 w-4" />
                    Pendências (Em Aberto)
                </button>
                <button
                    onClick={() => applyFilter('historico')}
                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all ${mode === 'historico'
                        ? 'bg-purple-500/20 text-purple-400 shadow-[0_0_10px_rgba(168,85,247,0.2)] border border-purple-500/30'
                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                        }`}
                >
                    <Calendar className="h-4 w-4" />
                    Histórico por Período
                </button>
            </div>

            {/* 2ª COLUNA: Controles de Data (Só aparecem no modo Histórico) */}
            {mode === 'historico' && (
                <div className="flex flex-wrap items-center gap-3 animate-in slide-in-from-left-2 flex-shrink-0">
                    <div className="flex items-center gap-2 bg-slate-900/50 p-1 rounded-lg border border-white/10 h-10">
                        <div className="flex items-center gap-2 pl-2 pr-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">De</span>
                            <input
                                type="date"
                                value={dataInicio}
                                onChange={e => setDataInicio(e.target.value)}
                                className="h-8 rounded bg-transparent border-none text-white text-sm font-bold focus:ring-0 cursor-pointer p-0"
                            />
                        </div>
                        <div className="w-px h-6 bg-white/10" />
                        <div className="flex items-center gap-2 pl-2 pr-1">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Até</span>
                            <input
                                type="date"
                                value={dataFim}
                                onChange={e => setDataFim(e.target.value)}
                                className="h-8 rounded bg-transparent border-none text-white text-sm font-bold focus:ring-0 cursor-pointer p-0"
                            />
                        </div>
                    </div>
                    <button
                        onClick={() => applyFilter('historico')}
                        className="h-10 px-4 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-sm flex items-center gap-2 shadow-[0_0_15px_rgba(147,51,234,0.3)] transition-transform active:scale-95 border border-purple-500/50"
                    >
                        Filtrar
                    </button>
                </div>
            )}

            {/* 3ª COLUNA: Barra de Busca Global */}
            <form onSubmit={handleSearchSubmit} className="relative flex-1 w-full min-w-[250px]">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nome do cliente (mín. 3 letras)..."
                        className="w-full h-10 pl-9 pr-14 rounded-lg bg-slate-900/50 border border-white/10 text-white text-sm focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 placeholder:text-slate-600 transition-all font-medium"
                    />
                    {search && (
                        <button type="button" onClick={handleClearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white transition-colors text-[10px] uppercase font-bold">
                            Limpar
                        </button>
                    )}
                </div>
            </form>

        </div>
    )
}