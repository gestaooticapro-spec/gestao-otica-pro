'use client'

import { useState } from 'react'
import { X, Printer, CheckSquare, Square, Loader2, Mail } from 'lucide-react'
import { Database } from '@/lib/database.types'
import { markPaymentsAsPrinted } from '@/lib/actions/vendas.actions'
// Agora que você renomeou, o import vai funcionar:
import { sendReceiptToHP } from '@/lib/actions/print-remote'

type Pagamento = Database['public']['Tables']['pagamentos']['Row']

interface Props {
    isOpen: boolean
    onClose: () => void
    pagamentos: Pagamento[]
    onReload: () => Promise<void>
}

const formatMoney = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (d: string) => new Date(d).toLocaleDateString('pt-BR')

export default function ReceiptSelectionModal({ isOpen, onClose, pagamentos, onReload }: Props) {
    const [selectedIds, setSelectedIds] = useState<number[]>([])
    const [isProcessing, setIsProcessing] = useState(false)
    const [statusMessage, setStatusMessage] = useState<string | null>(null)

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

    // Verifica se é reimpressão
    const checkReprint = () => {
        const itensJaImpressos = pagamentos.filter(p => selectedIds.includes(p.id) && p.receipt_printed_at)
        let isReimpressao = false
        if (itensJaImpressos.length > 0) {
            const confirm = window.confirm(`Atenção: ${itensJaImpressos.length} pagamento(s) já possuem recibo.\n\nDeseja gerar uma 2ª VIA (Reimpressão)?`)
            if (!confirm) return null // Cancelou
            isReimpressao = true
        }
        return isReimpressao
    }

    // --- OPÇÃO 1: IMPRIMIR NA TELA (VISUALIZAR) ---
    const handlePrintScreen = async () => {
        if (selectedIds.length === 0) return
        const isReimpressao = checkReprint()
        if (isReimpressao === null) return // Usuário cancelou

        setIsProcessing(true)
        setStatusMessage('Gerando visualização...')

        // 1. Marca como impresso
        await markPaymentsAsPrinted(selectedIds)
        await onReload()

        setIsProcessing(false)
        setStatusMessage(null)

        // 2. Abre a tela
        const idsParam = selectedIds.join('-')
        const url = `/print/recibo/${idsParam}?reprint=${isReimpressao ? 'true' : 'false'}`
        window.open(url, '_blank')
        
        onClose()
    }

    // --- OPÇÃO 2: ENVIAR PARA IMPRESSORA HP (EMAIL) ---
    const handlePrintHP = async () => {
        if (selectedIds.length === 0) return
        const isReimpressao = checkReprint()
        if (isReimpressao === null) return

        setIsProcessing(true)
        setStatusMessage('Enviando para Impressora HP...')

        try {
            // 1. Envia o email (Server Action)
            const resultado = await sendReceiptToHP(selectedIds, isReimpressao)

            if (!resultado.success) {
                alert('Erro ao enviar: ' + resultado.error)
                setIsProcessing(false)
                setStatusMessage(null)
                return
            }

            // 2. Se deu certo, marca como impresso
            await markPaymentsAsPrinted(selectedIds)
            await onReload()
            
            alert('✅ Enviado com sucesso para a impressora HP!')
            onClose()

        } catch (err) {
            console.error(err)
            alert('Erro inesperado ao conectar com a impressora.')
        } finally {
            setIsProcessing(false)
            setStatusMessage(null)
        }
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
                <div className="bg-slate-800 px-6 py-4 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <Printer className="h-5 w-5" /> Gerar Recibo
                    </h3>
                    <button onClick={onClose} disabled={isProcessing}><X className="h-5 w-5"/></button>
                </div>
                
                <div className="p-6 overflow-y-auto bg-slate-50">
                    <p className="text-sm text-slate-500 mb-4 font-medium">Selecione os pagamentos:</p>
                    
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
                                            <div className="flex items-center gap-1 text-[9px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100">
                                                <Printer className="h-3 w-3" /> 2ª VIA
                                            </div>
                                        )}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>

                {/* Rodapé com Total e Botões */}
                <div className="p-4 bg-white border-t border-slate-200 shrink-0 space-y-3">
                    <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-slate-400 uppercase">Total Selecionado</span>
                        <span className="text-2xl font-black text-slate-800">{formatMoney(totalSelecionado)}</span>
                    </div>

                    {statusMessage && (
                        <div className="text-center text-xs font-bold text-blue-600 animate-pulse bg-blue-50 p-2 rounded">
                            {statusMessage}
                        </div>
                    )}

                    <div className="flex gap-3">
                        {/* Botão HP */}
                        <button 
                            onClick={handlePrintHP}
                            disabled={selectedIds.length === 0 || isProcessing}
                            className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-md transition-all flex justify-center items-center gap-2"
                            title="Enviar por e-mail para impressora HP"
                        >
                            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin"/> : <Mail className="h-5 w-5" />}
                            <span className="text-sm">ENVIAR HP</span>
                        </button>

                        {/* Botão Tela */}
                        <button 
                            onClick={handlePrintScreen}
                            disabled={selectedIds.length === 0 || isProcessing}
                            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl font-bold shadow-md transition-all flex justify-center items-center gap-2"
                        >
                            {isProcessing ? <Loader2 className="h-5 w-5 animate-spin"/> : <Printer className="h-5 w-5" />}
                            <span className="text-sm">VISUALIZAR</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}