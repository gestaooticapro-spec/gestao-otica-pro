'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Filter } from 'lucide-react'

interface Props {
    storeId: number
    inicio: string
    fim: string
    tipo?: string
}

const inputStyle = "block w-full rounded-xl border border-white/10 bg-black/20 shadow-sm text-slate-200 h-8 text-[11px] px-2 focus:ring-1 focus:ring-amber-500/50 focus:border-amber-500/50 font-bold placeholder:font-normal placeholder:text-slate-600 transition-all outline-none"
const labelStyle = "block text-[9px] font-bold text-slate-500 uppercase mb-1 tracking-wider"

export default function HistoryFilters({ storeId, inicio, fim, tipo }: Props) {
    const router = useRouter()
    const [dataInicio, setDataInicio] = useState(inicio)
    const [dataFim, setDataFim] = useState(fim)
    const [tipoFiltro, setTipoFiltro] = useState(tipo || '')

    const handleFilter = () => {
        const params = new URLSearchParams()
        params.set('inicio', dataInicio)
        params.set('fim', dataFim)
        if (tipoFiltro) params.set('tipo', tipoFiltro)
        router.push(`/dashboard/loja/${storeId}/estoque/movimentacoes?${params.toString()}`)
    }

    const handleQuick = (preset: 'hoje' | 'mes') => {
        const hoje = new Date().toISOString().split('T')[0]
        if (preset === 'hoje') {
            setDataInicio(hoje)
            setDataFim(hoje)
            const params = new URLSearchParams({ inicio: hoje, fim: hoje })
            if (tipoFiltro) params.set('tipo', tipoFiltro)
            router.push(`/dashboard/loja/${storeId}/estoque/movimentacoes?${params.toString()}`)
        } else {
            const primeiroDia = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]
            setDataInicio(primeiroDia)
            setDataFim(hoje)
            const params = new URLSearchParams({ inicio: primeiroDia, fim: hoje })
            if (tipoFiltro) params.set('tipo', tipoFiltro)
            router.push(`/dashboard/loja/${storeId}/estoque/movimentacoes?${params.toString()}`)
        }
    }

    return (
        <div className="px-4 py-3 border-b border-white/5 flex-shrink-0 space-y-2">
            <div className="flex gap-2">
                <button onClick={() => handleQuick('hoje')} className="flex-1 h-7 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 rounded-lg transition-colors">
                    HOJE
                </button>
                <button onClick={() => handleQuick('mes')} className="flex-1 h-7 text-[10px] font-bold bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/5 rounded-lg transition-colors">
                    ESTE MÊS
                </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                    <label className={labelStyle}>Início</label>
                    <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={inputStyle} />
                </div>
                <div>
                    <label className={labelStyle}>Fim</label>
                    <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={inputStyle} />
                </div>
            </div>
            <div>
                <label className={labelStyle}>Tipo</label>
                <select value={tipoFiltro} onChange={e => setTipoFiltro(e.target.value)} className={`${inputStyle} cursor-pointer`}>
                    <option value="" className="bg-slate-900">Todos</option>
                    <option value="Entrada" className="bg-slate-900">Entrada</option>
                    <option value="Saida" className="bg-slate-900">Saída</option>
                    <option value="Reserva" className="bg-slate-900">Reserva</option>
                    <option value="Perda" className="bg-slate-900">Perda</option>
                    <option value="Ajuste" className="bg-slate-900">Ajuste</option>
                    <option value="Brinde" className="bg-slate-900">Brinde</option>
                </select>
            </div>
            <button
                onClick={handleFilter}
                className="w-full h-8 bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold uppercase rounded-xl flex items-center justify-center gap-1.5 transition-colors"
            >
                <Filter className="h-3 w-3" /> Filtrar
            </button>
        </div>
    )
}
