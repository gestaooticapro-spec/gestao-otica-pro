'use client'

import { useState } from 'react'
import { X, Printer, Calendar, DollarSign, CheckSquare, Square, AlertTriangle, Loader2 } from 'lucide-react'
import { Database } from '@/lib/database.types'
import { markPaymentsAsPrinted } from '@/lib/actions/vendas.actions'

type Pagamento = Database['public']['Tables']['pagamentos']['Row']

interface Props {
    isOpen: boolean
    onClose: () => void
    pagamentos: Pagamento[]
    onReload: () => Promise<void> // <--- NOVO: Função para recarregar dados
}

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export default function ReceiptSelectionModal({ isOpen, onClose, pagamentos, onReload }: Props) {
    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [isProcessing, setIsProcessing] = useState(false)

    if (!isOpen) return null

    // Toggle de seleção
    const toggleSelect = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        )
    }

    // Cálculos
    const totalSelecionado = pagamentos
        .filter(p => selectedIds.includes(p.id))
        .reduce((acc, p) => acc + p.valor_pago, 0)

    const handlePrint = async () => {
        if (selectedIds.length === 0) return

        // Verifica Reimpressão (Olha para o dado atual da tela)
        const itensJaImpressos = pagamentos.filter(p => selectedIds.includes(p.id) && p.receipt_printed_at)
        let isReimpressao = false

        if (itensJaImpressos.length > 0) {
            const confirm = window.confirm(`Atenção: ${itensJaImpressos.length} pagamento(s) já possuem recibo.\n\nDeseja gerar uma 2ª VIA (Reimpressão)?`)
            if (!confirm) return
            isReimpressao = true
        }

        setIsProcessing(true)

        // 1. Marca como impresso no banco
        await markPaymentsAsPrinted(selectedIds)

        // 2. Recarrega os dados da tela (Para que na próxima vez já apareça como impresso)
        await onReload()

        setIsProcessing(false)

        // 3. Gera a URL e abre a impressão
        const idsParam = selectedIds.join('-')
        const url = `/print/recibo/${idsParam}?reprint=${isReimpressao ? 'true' : 'false'}`
        
        window.open(url, '_blank')
        onClose()
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <Printer className="h-5 w-5" /> Gerar Recibo Unificado
                    </h3>
                    <button onClick={onClose} disabled={isProcessing}><X className="h-5 w-5"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto bg-slate-50">
                    <p className="text-sm text-slate-500 mb-4 font-medium">Selecione os pagamentos para somar no recibo:</p>
                    
                    <div className="space-y-2">
                        {pagamentos.length === 0 ? (
                            <p className="text-center text-slate-400 italic">Nenhum pagamento registrado.</p>
                        ) : (
                            pagamentos.map(pg => {
                                const isSelected = selectedIds.includes(pg.id)
                                const isPrinted = !!pg.receipt_printed_at
                                
                                return (
                                    <div 
                                        key={pg.id}
                                        onClick={() => !isProcessing && toggleSelect(pg.id)}
                                        className={`w-full flex items-center justify-between p-3 rounded-xl border cursor-pointer transition-all
                                            ${isSelected 
                                                ? 'bg-blue-50 border-blue-500 shadow-sm' 
                                                : 'bg-white border-slate-200 hover:border-blue-300'}
                                            ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
                                        `}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`text-slate-400 ${isSelected ? 'text-blue-600' : ''}`}>
                                                {isSelected ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5" />}
                                            </div>
                                            <div>
                                                <div className="flex items-center gap-2 text-slate-800 font-bold">
                                                    {formatMoney(pg.valor_pago)}
                                                </div>
                                                <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 uppercase font-bold">
                                                    <span className="bg-slate-200 px-1.5 py-0.5 rounded">{pg.forma_pagamento}</span>
                                                    <span>{formatDate(pg.created_at)}</span>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {isPrinted && (
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100" title="Já impresso">
                                                <Printer className="h-3 w-3" /> 2ª VIA
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Rodapé com Total e Ação */}
                <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-bold text-slate-400 uppercase">Total do Recibo</span>
                        <span className="text-2xl font-black text-slate-800">{formatMoney(totalSelecionado)}</span>
                    </div>
                    <button 
                        onClick={handlePrint}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-md transition-all flex justify-center items-center gap-2"
                    >
                        {isProcessing ? <Loader2 className="h-5 w-5 animate-spin"/> : <Printer className="h-5 w-5" />}
                        {isProcessing ? 'PROCESSANDO...' : `IMPRIMIR (${selectedIds.length})`}
                    </button>
                </div>
            </div>
        </div>
    )
}