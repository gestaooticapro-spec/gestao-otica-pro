'use client'

import { useState } from 'react'
import { X, Printer, CheckSquare, Square, Loader2, Eye, FileText } from 'lucide-react'
import { Database } from '@/lib/database.types'
import { markPaymentsAsPrinted } from '@/lib/actions/vendas.actions'
import { getReceiptPDFBase64 } from '@/lib/actions/print-remote'

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
    const [isProcessing, setIsProcessing] = useState<string | null>(null) // 'view' | 'print' | null

    if (!isOpen) return null

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

    // --- FUNÇÃO CENTRAL QUE GERA O BLOB ---
    const generateBlob = async () => {
        const result = await getReceiptPDFBase64(selectedIds)
        if (!result.success || !result.pdfBase64) {
            throw new Error(result.error || 'Erro ao gerar PDF')
        }
        
        const byteCharacters = atob(result.pdfBase64)
        const byteNumbers = new Array(byteCharacters.length)
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i)
        }
        const byteArray = new Uint8Array(byteNumbers)
        return new Blob([byteArray], { type: 'application/pdf' })
    }

    // OPÇÃO 1: VISUALIZAR (Abre Nova Aba)
    const handlePreview = async () => {
        if (selectedIds.length === 0) return
        setIsProcessing('view')
        try {
            const blob = await generateBlob()
            const fileURL = URL.createObjectURL(blob)
            window.open(fileURL, '_blank')
            // Não marcamos como impresso aqui, pois é só visualização
        } catch (error: any) {
            alert(error.message)
        } finally {
            setIsProcessing(null)
        }
    }

    // OPÇÃO 2: IMPRIMIR (Iframe Oculto)
    const handleDirectPrint = async () => {
        if (selectedIds.length === 0) return
        setIsProcessing('print')
        try {
            const blob = await generateBlob()
            const fileURL = URL.createObjectURL(blob)

            // Iframe Invisível
            const iframe = document.createElement('iframe')
            iframe.style.position = 'fixed'
            iframe.style.right = '0'
            iframe.style.bottom = '0'
            iframe.style.width = '0'
            iframe.style.height = '0'
            iframe.style.border = '0'
            iframe.src = fileURL
            
            document.body.appendChild(iframe)

            iframe.onload = () => {
                setTimeout(() => {
                    try {
                        iframe.contentWindow?.focus()
                        iframe.contentWindow?.print()
                    } catch (e) {
                        window.open(fileURL, '_blank') // Fallback se falhar
                    } finally {
                        // Limpa memória após 1 minuto
                        setTimeout(() => {
                            document.body.removeChild(iframe)
                            URL.revokeObjectURL(fileURL)
                        }, 60000)
                    }
                }, 500)
            }

            // Marca como impresso no banco
            await markPaymentsAsPrinted(selectedIds)
            await onReload()

        } catch (error: any) {
            alert(error.message)
        } finally {
            setIsProcessing(null)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
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

                {/* RODAPÉ COM DOIS BOTÕES */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex gap-3">
                    
                    {/* BOTÃO 1: VISUALIZAR */}
                    <button 
                        onClick={handlePreview}
                        disabled={selectedIds.length === 0 || isProcessing !== null}
                        className="flex-1 py-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl font-bold shadow-sm flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                    >
                        {isProcessing === 'view' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Eye className="h-5 w-5" />
                        )}
                        Visualizar
                    </button>

                    {/* BOTÃO 2: IMPRIMIR DIRETO */}
                    <button 
                        onClick={handleDirectPrint}
                        disabled={selectedIds.length === 0 || isProcessing !== null}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-50"
                    >
                        {isProcessing === 'print' ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                        ) : (
                            <Printer className="h-5 w-5" />
                        )}
                        Imprimir
                    </button>

                </div>
            </div>
        </div>
    )
}