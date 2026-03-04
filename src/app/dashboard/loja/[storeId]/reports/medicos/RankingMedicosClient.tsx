'use client'

import { useState, useMemo } from 'react'
import { MedicoRankingItem } from '@/lib/actions/reports.actions'
import {
    Stethoscope, Trophy, TrendingUp, DollarSign,
    ArrowUp, ArrowDown, ArrowUpDown, FileText, Medal
} from 'lucide-react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type SortKey = 'total_receitas' | 'total_vendido' | 'ticket_medio'

export default function RankingMedicosClient({ data }: { data: MedicoRankingItem[] }) {
    const [sortBy, setSortBy] = useState<SortKey>('total_receitas')
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

    const sorted = useMemo(() => {
        return [...data].sort((a, b) => {
            const diff = a[sortBy] - b[sortBy]
            return sortDir === 'desc' ? -diff : diff
        })
    }, [data, sortBy, sortDir])

    const handleSort = (key: SortKey) => {
        if (sortBy === key) {
            setSortDir(d => d === 'desc' ? 'asc' : 'desc')
        } else {
            setSortBy(key)
            setSortDir('desc')
        }
    }

    const SortIcon = ({ col }: { col: SortKey }) => {
        if (sortBy !== col) return <ArrowUpDown className="h-3 w-3 text-slate-600" />
        return sortDir === 'desc'
            ? <ArrowDown className="h-3 w-3 text-teal-400" />
            : <ArrowUp className="h-3 w-3 text-teal-400" />
    }

    // Top doctors for KPI cards
    const topReceitas = [...data].sort((a, b) => b.total_receitas - a.total_receitas)[0]
    const topVendido = [...data].sort((a, b) => b.total_vendido - a.total_vendido)[0]
    const topTicket = [...data].sort((a, b) => b.ticket_medio - a.ticket_medio)[0]

    if (data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
                <Stethoscope className="h-16 w-16 mb-4 opacity-10" />
                <p className="text-lg font-light">Nenhum médico com receitas no período.</p>
                <p className="text-xs mt-1">Ajuste as datas e tente novamente.</p>
            </div>
        )
    }

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* TOP 3 CARDS */}
            <div className="grid grid-cols-3 gap-4">
                {/* Top Receitas */}
                <div className="bg-gradient-to-br from-amber-600/10 to-amber-900/20 rounded-2xl p-5 border border-amber-500/20 relative overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10"><Trophy className="h-16 w-16 text-amber-400" /></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <Medal className="h-4 w-4 text-amber-400" />
                            <span className="text-[9px] font-bold text-amber-400/70 uppercase tracking-wider">Mais Receitas</span>
                        </div>
                        <p className="text-xl font-black text-white truncate">Dr(a). {topReceitas?.nome || '-'}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{topReceitas?.clinica || ''}</p>
                        <p className="text-3xl font-black text-amber-400 mt-3">{topReceitas?.total_receitas || 0}</p>
                        <p className="text-[9px] text-slate-500 uppercase font-bold">receitas no período</p>
                    </div>
                </div>

                {/* Top Valor */}
                <div className="bg-gradient-to-br from-emerald-600/10 to-emerald-900/20 rounded-2xl p-5 border border-emerald-500/20 relative overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10"><DollarSign className="h-16 w-16 text-emerald-400" /></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <TrendingUp className="h-4 w-4 text-emerald-400" />
                            <span className="text-[9px] font-bold text-emerald-400/70 uppercase tracking-wider">Mais Faturamento</span>
                        </div>
                        <p className="text-xl font-black text-white truncate">Dr(a). {topVendido?.nome || '-'}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{topVendido?.clinica || ''}</p>
                        <p className="text-3xl font-black text-emerald-400 mt-3">{formatCurrency(topVendido?.total_vendido || 0)}</p>
                        <p className="text-[9px] text-slate-500 uppercase font-bold">em vendas fechadas</p>
                    </div>
                </div>

                {/* Top Ticket */}
                <div className="bg-gradient-to-br from-teal-600/10 to-teal-900/20 rounded-2xl p-5 border border-teal-500/20 relative overflow-hidden">
                    <div className="absolute top-3 right-3 opacity-10"><FileText className="h-16 w-16 text-teal-400" /></div>
                    <div className="relative z-10">
                        <div className="flex items-center gap-2 mb-3">
                            <DollarSign className="h-4 w-4 text-teal-400" />
                            <span className="text-[9px] font-bold text-teal-400/70 uppercase tracking-wider">Maior Ticket Médio</span>
                        </div>
                        <p className="text-xl font-black text-white truncate">Dr(a). {topTicket?.nome || '-'}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{topTicket?.clinica || ''}</p>
                        <p className="text-3xl font-black text-teal-400 mt-3">{formatCurrency(topTicket?.ticket_medio || 0)}</p>
                        <p className="text-[9px] text-slate-500 uppercase font-bold">por receita</p>
                    </div>
                </div>
            </div>

            {/* TABLE */}
            <div className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden backdrop-blur-md">
                <div className="bg-slate-900/50 px-5 py-3 border-b border-white/10 flex items-center justify-between">
                    <h2 className="font-bold text-slate-300 text-sm flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-teal-400" />
                        Ranking Completo — {data.length} médico{data.length !== 1 ? 's' : ''}
                    </h2>
                </div>

                <table className="w-full text-left text-xs">
                    <thead className="bg-slate-800/50 text-[9px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5">
                        <tr>
                            <th className="px-5 py-3 w-10">#</th>
                            <th className="px-5 py-3">Médico</th>
                            <th className="px-5 py-3">Clínica</th>
                            <th className="px-5 py-3 text-right cursor-pointer select-none hover:text-teal-400 transition-colors" onClick={() => handleSort('total_receitas')}>
                                <span className="flex items-center justify-end gap-1">Receitas <SortIcon col="total_receitas" /></span>
                            </th>
                            <th className="px-5 py-3 text-right cursor-pointer select-none hover:text-teal-400 transition-colors" onClick={() => handleSort('total_vendido')}>
                                <span className="flex items-center justify-end gap-1">Total Vendido <SortIcon col="total_vendido" /></span>
                            </th>
                            <th className="px-5 py-3 text-right cursor-pointer select-none hover:text-teal-400 transition-colors" onClick={() => handleSort('ticket_medio')}>
                                <span className="flex items-center justify-end gap-1">Ticket Médio <SortIcon col="ticket_medio" /></span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {sorted.map((med, i) => (
                            <tr key={med.oftalmologista_id} className={`hover:bg-white/5 transition-colors ${i < 3 ? 'bg-teal-500/[0.03]' : ''}`}>
                                <td className="px-5 py-3">
                                    {i < 3 ? (
                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${i === 0 ? 'bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30' :
                                                i === 1 ? 'bg-slate-400/20 text-slate-300 ring-1 ring-slate-400/30' :
                                                    'bg-orange-500/20 text-orange-400 ring-1 ring-orange-500/30'
                                            }`}>
                                            {i + 1}
                                        </span>
                                    ) : (
                                        <span className="text-slate-600 font-bold">{i + 1}</span>
                                    )}
                                </td>
                                <td className="px-5 py-3">
                                    <span className={`font-bold ${i < 3 ? 'text-white' : 'text-slate-300'}`}>
                                        Dr(a). {med.nome}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-slate-500 text-[10px]">{med.clinica || '-'}</td>
                                <td className="px-5 py-3 text-right">
                                    <span className="font-black text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 text-[11px]">
                                        {med.total_receitas}
                                    </span>
                                </td>
                                <td className="px-5 py-3 text-right font-bold text-emerald-400">{formatCurrency(med.total_vendido)}</td>
                                <td className="px-5 py-3 text-right font-bold text-teal-400">{formatCurrency(med.ticket_medio)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
