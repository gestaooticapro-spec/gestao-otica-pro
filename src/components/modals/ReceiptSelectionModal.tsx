'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, Printer, CheckSquare, Square, Loader2 } from 'lucide-react'
import { Database } from '@/lib/database.types'
import { markPaymentsAsPrinted } from '@/lib/actions/vendas.actions'

type Pagamento = Database['public']['Tables']['pagamentos']['Row']

interface Props {
    isOpen: boolean
    onClose: () => void
    pagamentos: Pagamento[]
    onReload: () => Promise<void>
}

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ReceiptSelectionModal({ isOpen, onClose, pagamentos, onReload }: Props) {
    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    const toggleSelection = (id: number) => {
        setSelectedIds(prev => 
            prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
        )
    }

    const toggleAll = () => {
        if (selectedIds.length === pagamentos.length) {
            setSelectedIds([])
        } else {
            setSelectedIds(pagamentos.map(p => p.id))
        }
    }



    const handleDirectPrint = async () => {
        if (selectedIds.length === 0) return
        setIsProcessing(true)
        try {
            const idsString = selectedIds.join('-')
            // Checa ANTES de marcar se já foi impresso alguma vez, para passar o param correto
            const selectedPagamentos = pagamentos.filter(p => selectedIds.includes(p.id))
            const wasAlreadyPrinted = selectedPagamentos.some(p => p.receipt_printed_at)
            const reprintParam = wasAlreadyPrinted ? '&reprint=true' : ''
            const allSelectedAreInstallments = selectedPagamentos.length > 0 && selectedPagamentos.every(p => p.parcela_id != null)
            const installmentReceiptParam = allSelectedAreInstallments ? '&installment_receipt=true' : ''
            window.open(`/print/recibo/${idsString}?t=${Date.now()}${reprintParam}${installmentReceiptParam}`, '_blank')

            // Marca como impresso no banco
            await markPaymentsAsPrinted(selectedIds)
            await onReload()
            onClose()

        } catch (error: any) {
            alert(error.message)
        } finally {
            setIsProcessing(false)
        }
    }

    return createPortal(
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto custom-scrollbar animate-in fade-in">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
                
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Printer className="h-5 w-5 text-indigo-600" />
                        Gerar Recibos
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-4 overflow-y-auto flex-1">
                    <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Selecione os pagamentos</span>
                        <button 
                            onClick={toggleAll}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
                        >
                            {selectedIds.length === pagamentos.length ? <CheckSquare className="h-3 w-3"/> : <Square className="h-3 w-3"/>}
                            {selectedIds.length === pagamentos.length ? 'Desmarcar Todos' : 'Marcar Todos'}
                        </button>
                    </div>

                    <div className="space-y-2">
                        {pagamentos.map(pag => {
                            const isSelected = selectedIds.includes(pag.id)
                            return (
                                <div 
                                    key={pag.id}
                                    onClick={() => toggleSelection(pag.id)}
                                    className={`
                                        p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between group
                                        ${isSelected 
                                            ? 'border-indigo-500 bg-indigo-50/50' 
                                            : 'border-gray-100 hover:border-gray-200 bg-white'
                                        }
                                    `}
                                >
                                    <div className="flex flex-col">
                                        <span className={`text-sm font-bold ${isSelected ? 'text-indigo-900' : 'text-gray-700'}`}>
                                            {formatMoney(pag.valor_pago)}
                                        </span>
                                        <span className="text-xs text-gray-500 capitalize">
                                            {pag.forma_pagamento} • {new Date(pag.created_at).toLocaleDateString('pt-BR')}
                                        </span>
                                    </div>
                                    
                                    <div className={`
                                        h-6 w-6 rounded-md flex items-center justify-center transition-colors
                                        ${isSelected ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-300 group-hover:bg-gray-200'}
                                    `}>
                                        <CheckSquare className="h-4 w-4" />
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="p-4 bg-gray-50 border-t border-gray-100">
                    <button
                        onClick={handleDirectPrint}
                        disabled={selectedIds.length === 0 || isProcessing}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                    >
                        {isProcessing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Printer className="h-5 w-5" />}
                        Imprimir
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}
