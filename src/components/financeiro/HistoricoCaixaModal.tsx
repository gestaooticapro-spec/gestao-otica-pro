'use client'

import { useState, useEffect, useMemo } from 'react'
import { getHistoricoCaixa, absorverQuebraCaixa } from '@/lib/actions/cashflow.actions'
import { Loader2, X, AlertTriangle, ArrowUpRight, ArrowDownLeft, DollarSign, Eye, CheckCircle2, HelpCircle } from 'lucide-react'

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string) => {
    return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
}

export default function HistoricoCaixaModal({ storeId, onClose, onAuditDate }: { storeId: number, onClose: () => void, onAuditDate?: (dateStr: string) => void }) {
    const [loading, setLoading] = useState(true)
    const [extrato, setExtrato] = useState<any[]>([])
    const [showOnlyDivergences, setShowOnlyDivergences] = useState(false)
    const [isAbsorving, setIsAbsorving] = useState<number | null>(null)

    const handleAbsorver = async (id: number, quebra: number) => {
        const isFalta = Number(quebra) < 0;
        const msgTipo = isFalta ? "Faltas Totais" : "Sobras Totais";
        const msgLancamento = isFalta ? "SAÍDA" : "ENTRADA";
        const msgSituacao = isFalta ? "a perda" : "a sobra";
        
        if (!confirm(`ATENÇÃO: Este botão APENAS retira esse valor da tela de auditoria (para limpar as ${msgTipo} do topo).\n\nPara que a divergência seja assumida nas finanças e relatada oficialmente no fluxo de caixa contínuo da loja, você TEM QUE criar um "Novo Lançamento" manual de ${msgLancamento} no seu caixa aberto de hoje informando ${msgSituacao}!\n\nDeseja ocultar este alerta do painel de cima agora?`)) return;
        setIsAbsorving(id)
        const res = await absorverQuebraCaixa(id)
        if (res.success) {
            setExtrato(prev => prev.map(item => item.id === id ? { ...item, obs: (item.obs || '') + ' [ABSORVIDO]' } : item))
        } else {
            alert(res.message)
        }
        setIsAbsorving(null)
    }

    useEffect(() => {
        getHistoricoCaixa(storeId).then(res => {
            setExtrato(res || [])
            setLoading(false)
        })
    }, [storeId])

    const filteredExtrato = useMemo(() => {
        if (!showOnlyDivergences) return extrato;
        return extrato.filter(item => Number(item.quebra) !== 0)
    }, [extrato, showOnlyDivergences])

    const { totalFaltas, totalSobras } = useMemo(() => {
        let faltas = 0;
        let sobras = 0;
        extrato.forEach(item => {
            const isAbsorvido = item.obs?.includes('[ABSORVIDO]');
            if (isAbsorvido) return;
            const q = Number(item.quebra || 0);
            if (q < 0) faltas += q;
            else if (q > 0) sobras += q;
        })
        return { totalFaltas: faltas, totalSobras: sobras }
    }, [extrato])

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="w-full max-w-5xl bg-slate-900/95 backdrop-blur-xl rounded-xl shadow-2xl shadow-black/50 overflow-hidden flex flex-col max-h-[90vh] border border-white/10" onClick={(e) => e.stopPropagation()}>

                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-800/60 backdrop-blur-md">
                    <div className="flex-1">
                        <div className="flex items-center gap-3">
                            <h3 className="text-lg font-bold text-white flex items-center gap-2">
                                <DollarSign className="h-5 w-5 text-emerald-400" />
                                Histórico do Caixa (Auditoria)
                            </h3>
                            <button 
                                className="text-[10px] text-slate-400 font-normal bg-white/5 hover:bg-white/10 transition-colors px-2 py-1 rounded-full flex items-center gap-1.5 cursor-help" 
                                title="Os totais abaixo somam apenas as divergências em aberto. Depois de você lançar a quebra oficialmente no seu caixa de HOJE, venha aqui e clique em 'Ocultar Alerta' para limpar o painel desta advertência antiga."
                            >
                                <HelpCircle className="w-3.5 h-3.5"/>
                                O que são os totais?
                            </button>
                        </div>
                        {/* Summary Totals */}
                        <div className="flex gap-4 mt-2">
                            <div className="bg-red-500/10 border border-red-500/20 px-3 py-1 rounded text-xs font-bold text-red-400">
                                Faltas Totais: {formatCurrency(totalFaltas)}
                            </div>
                            <div className="bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded text-xs font-bold text-emerald-400">
                                Sobras Totais: {formatCurrency(totalSobras)}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        <label className="flex items-center gap-2 cursor-pointer bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-colors">
                            <input
                                type="checkbox"
                                className="accent-amber-500 w-4 h-4"
                                checked={showOnlyDivergences}
                                onChange={(e) => setShowOnlyDivergences(e.target.checked)}
                            />
                            <span className="text-xs font-bold text-amber-400">Mostrar apenas divergências</span>
                        </label>
                        <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg transition-colors">
                            <X className="h-5 w-5 text-slate-500 hover:text-red-400" />
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-auto p-0">
                    {loading ? (
                        <div className="flex items-center justify-center h-64">
                            <Loader2 className="h-8 w-8 animate-spin text-emerald-400" />
                        </div>
                    ) : filteredExtrato.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                            <AlertTriangle className="h-10 w-10 mb-2 opacity-50" />
                            <p>Nenhuma movimentação para mostrar.</p>
                        </div>
                    ) : (
                        <table className="w-full text-xs text-left">
                            <thead className="bg-white/5 text-slate-500 font-bold text-[10px] uppercase sticky top-0 z-10 border-b border-white/10 tracking-wider">
                                <tr>
                                    <th className="px-4 py-3">Fechamento</th>
                                    <th className="px-4 py-3 text-right text-emerald-400">Entradas</th>
                                    <th className="px-4 py-3 text-right text-red-400">Saídas</th>
                                    <th className="px-4 py-3 text-right font-black bg-white/5">Esperado</th>
                                    <th className="px-4 py-3 text-right font-black text-slate-300 bg-white/10">Físico</th>
                                    <th className="px-4 py-3 text-right font-black text-amber-400 bg-amber-500/10">Diferença</th>
                                    {onAuditDate && <th className="px-3 py-3 text-center">Ações</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {filteredExtrato.map((item: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                                        <td className="px-4 py-2 font-mono text-[11px] font-bold text-slate-400">
                                            <div className="flex flex-col">
                                                <span>{formatDate(item.data?.split('T')[0] || '')}</span>
                                                <span className={`text-[9px] uppercase tracking-wider ${item.status === 'Fechado' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                                    {item.status === 'Fechado' ? 'Fechado' : 'Aberto'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-emerald-400 bg-emerald-500/5">
                                            {item.entradas > 0 ? `+ ${formatCurrency(item.entradas)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-red-400 bg-red-500/5">
                                            {item.saidas > 0 ? `- ${formatCurrency(item.saidas)}` : '-'}
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium text-slate-300 bg-white/5 border-l border-white/10">
                                            {formatCurrency(item.saldo_esperado)}
                                        </td>
                                        <td className="px-4 py-2 text-right font-black text-white bg-white/10 border-l border-white/10">
                                            {formatCurrency(item.saldo_final)}
                                        </td>
                                        <td className={`px-4 py-2 text-right font-black border-l border-amber-500/20 bg-amber-500/5 ${Number(item.quebra) === 0 ? 'text-slate-500 opacity-50' : Number(item.quebra) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                            {item.obs?.includes('[ABSORVIDO]') ? (
                                                <div className="flex flex-col items-end">
                                                    <span className="line-through opacity-50 text-[10px]">{formatCurrency(item.quebra)}</span>
                                                    <span className="text-[9px] text-emerald-500 flex items-center gap-1 leading-tight" title="Divergência já ocultada da auditoria visual"><CheckCircle2 className="w-3 h-3"/> Alerta Oculto</span>
                                                </div>
                                            ) : (
                                                formatCurrency(item.quebra)
                                            )}
                                        </td>
                                        {onAuditDate && (
                                            <td className="px-3 py-2 text-center flex gap-1.5 justify-center items-center">
                                                <button
                                                    onClick={() => onAuditDate(item.data?.split('T')[0])}
                                                    className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 px-2 py-1 rounded flex items-center gap-1 text-[10px] font-bold transition-all whitespace-nowrap"
                                                    title="Ver detalhes deste dia"
                                                >
                                                    <Eye className="h-3 w-3" />
                                                    Detalhes
                                                </button>
                                                {Number(item.quebra) !== 0 && !item.obs?.includes('[ABSORVIDO]') && (
                                                    <button
                                                        onClick={() => handleAbsorver(item.id, Number(item.quebra))}
                                                        disabled={isAbsorving === item.id}
                                                        className="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded flex items-center gap-1 text-[10px] font-bold transition-all disabled:opacity-50 whitespace-nowrap"
                                                        title="Ocultar este alerta visual caso já tenha lançado a divergência no seu caixa atual"
                                                    >
                                                        {isAbsorving === item.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <CheckCircle2 className="w-3 h-3" />}
                                                        Ocultar
                                                    </button>
                                                )}
                                            </td>
                                        )}
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
