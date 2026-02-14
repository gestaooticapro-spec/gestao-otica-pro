'use client'

import { useState, useEffect } from 'react'
import { getExtratoDiario } from '@/lib/actions/cashflow.actions'
import { Loader2, X, AlertTriangle, ArrowUpRight, ArrowDownLeft, DollarSign } from 'lucide-react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function HistoricoCaixaModal({ storeId, onClose }: { storeId: number, onClose: () => void }) {
    const [loading, setLoading] = useState(true)
    const [extrato, setExtrato] = useState<any[]>([])
    const [saldoAnterior, setSaldoAnterior] = useState(0)

    useEffect(() => {
        getExtratoDiario(storeId).then(res => {
            // @ts-ignore
            if (res.extrato) {
                // @ts-ignore
                setExtrato(res.extrato)
                // @ts-ignore
                setSaldoAnterior(res.saldo_anterior)
            } else {
                setExtrato(res as any)
            }
            setLoading(false)
        })
    }, [storeId])

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-5xl bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh] border border-white/10" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-800/60 backdrop-blur-md">
                    <div>
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-emerald-400" />
                            Extrato de Fluxo de Caixa (Últimos 30 dias)
                        </h3>
                        <p className="text-xs text-slate-500">Saldo Anterior ao período: <strong className="text-slate-300">{formatCurrency(saldoAnterior)}</strong></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                        <X className="h-5 w-5 text-slate-500 hover:text-red-400" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                        </div>
                    ) : extrato.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <AlertTriangle className="h-10 w-10 mb-2 opacity-50" />
                            <p>Nenhuma movimentação registrada no período.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-white/5 text-slate-500 font-bold text-xs uppercase sticky top-0 z-10 border-b border-white/10">
                                <tr>
                                    <th className="px-6 py-3">Data</th>
                                    <th className="px-6 py-3 text-right text-indigo-400">Vendas (Dinheiro)</th>
                                    <th className="px-6 py-3 text-right text-emerald-400">Entradas</th>
                                    <th className="px-6 py-3 text-right text-red-400">Saídas</th>
                                    <th className="px-6 py-3 text-right font-black bg-white/5">Res. Dia</th>
                                    <th className="px-6 py-3 text-right font-black text-slate-300 bg-white/10">Saldo Acumulado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {extrato.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="px-6 py-3 font-mono text-xs font-bold text-slate-400">{formatDate(item.data)}</td>
                                        <td className="px-6 py-3 text-right font-medium text-slate-400">{formatCurrency(item.vendas)}</td>
                                        <td className="px-6 py-3 text-right font-medium text-emerald-400 bg-emerald-500/5">
                                            {item.entradas > 0 ? `+ ${formatCurrency(item.entradas)}` : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-right font-medium text-red-400 bg-red-500/5">
                                            {item.saidas > 0 ? `- ${formatCurrency(item.saidas)}` : '-'}
                                        </td>
                                        <td className={`px-6 py-3 text-right font-black border-l border-white/10 bg-white/5 ${item.saldo_dia >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {formatCurrency(item.saldo_dia)}
                                        </td>
                                        <td className="px-6 py-3 text-right font-black text-white bg-white/10 border-l border-white/10">
                                            {formatCurrency(item.saldo_acumulado)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    )
}
