'use client'

import { useState, useEffect } from 'react'
import { getExtratoDiario } from '@/lib/actions/cashflow.actions'
import { Loader2, X, AlertTriangle, ArrowUpRight, ArrowDownLeft, DollarSign } from 'lucide-react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => {
    // dateStr vem como YYYY-MM-DD. Adicionamos T12:00 para evitar que o timezone do browser volte um dia
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
                // Fallback caso a API antiga ainda esteja cacheada ou algo assim
                setExtrato(res as any)
            }
            setLoading(false)
        })
    }, [storeId])

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-5xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                    <div>
                        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-emerald-600" />
                            Extrato de Fluxo de Caixa (Últimos 30 dias)
                        </h3>
                        <p className="text-xs text-slate-500">Saldo Anterior ao período: <strong className="text-slate-700">{formatCurrency(saldoAnterior)}</strong></p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
                        <X className="h-5 w-5 text-slate-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
                        </div>
                    ) : extrato.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                            <AlertTriangle className="h-10 w-10 mb-2 opacity-50" />
                            <p>Nenhuma movimentação registrada no período.</p>
                        </div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-100 text-slate-600 font-bold text-xs uppercase sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-6 py-3">Data</th>
                                    <th className="px-6 py-3 text-right text-indigo-600">Vendas (Dinheiro)</th>
                                    <th className="px-6 py-3 text-right text-emerald-600">Entradas</th>
                                    <th className="px-6 py-3 text-right text-red-600">Saídas</th>
                                    <th className="px-6 py-3 text-right font-black bg-slate-200/50">Res. Dia</th>
                                    <th className="px-6 py-3 text-right font-black text-slate-800 bg-slate-200">Saldo Acumulado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {extrato.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-slate-50 transition-colors">
                                        <td className="px-6 py-3 font-mono text-xs font-bold text-slate-700">{formatDate(item.data)}</td>
                                        <td className="px-6 py-3 text-right font-medium text-slate-600">{formatCurrency(item.vendas)}</td>
                                        <td className="px-6 py-3 text-right font-medium text-emerald-600 bg-emerald-50/30">
                                            {item.entradas > 0 ? `+ ${formatCurrency(item.entradas)}` : '-'}
                                        </td>
                                        <td className="px-6 py-3 text-right font-medium text-red-600 bg-red-50/30">
                                            {item.saidas > 0 ? `- ${formatCurrency(item.saidas)}` : '-'}
                                        </td>
                                        <td className={`px-6 py-3 text-right font-black border-l border-slate-200 bg-slate-50 ${item.saldo_dia >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                                            {formatCurrency(item.saldo_dia)}
                                        </td>
                                        <td className="px-6 py-3 text-right font-black text-slate-800 bg-slate-100 border-l border-slate-300">
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
