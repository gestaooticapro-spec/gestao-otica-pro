'use client'

import { useState, useRef, useTransition } from 'react'
import { X, RefreshCcw, AlertTriangle, CheckCircle2, Wallet, CreditCard, ArrowRight, Loader2 } from 'lucide-react'
import { Database } from '@/lib/database.types'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { processarDevolucao } from '@/lib/actions/return.actions'

type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type Employee = Database['public']['Tables']['employees']['Row']

interface ReturnModalProps {
    isOpen: boolean
    onClose: () => void
    vendaId: number
    storeId: number
    customerId: number
    itens: VendaItem[]
}

type SelectedItemState = {
    selected: boolean
    condicao: 'Intacto' | 'Defeito' | 'Sobra'
    diametro?: string
    olho?: 'OD' | 'OE'
}

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ReturnModal({ isOpen, onClose, vendaId, storeId, customerId, itens }: ReturnModalProps) {
    // Estado dos Itens (Controle de seleção e condição)
    const [itemsState, setItemsState] = useState<Record<number, SelectedItemState>>(() => {
        const initial: Record<number, SelectedItemState> = {}
        itens.forEach(item => {
            initial[item.id] = { selected: false, condicao: 'Intacto' }
        })
        return initial
    })

    const [refundMethod, setRefundMethod] = useState<'Carteira' | 'Estorno'>('Carteira')
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    // Cálculos
    const selectedItemsIds = Object.keys(itemsState).filter(id => itemsState[parseInt(id)].selected).map(Number)
    const totalRefund = selectedItemsIds.reduce((acc, id) => {
        const item = itens.find(i => i.id === id)
        return acc + (item ? item.valor_total_item : 0) // Assume devolução total do item (qtd total)
    }, 0)

    // Handlers
    const toggleSelect = (id: number) => {
        setItemsState(prev => ({
            ...prev,
            [id]: { ...prev[id], selected: !prev[id].selected }
        }))
    }

    const updateCondition = (id: number, condicao: 'Intacto' | 'Defeito' | 'Sobra') => {
        setItemsState(prev => ({
            ...prev,
            [id]: { ...prev[id], condicao }
        }))
    }

    const updateDetails = (id: number, field: 'diametro' | 'olho', value: string) => {
        setItemsState(prev => ({
            ...prev,
            [id]: { ...prev[id], [field]: value }
        }))
    }

    // Fluxo de Confirmação
    const handlePreConfirm = () => {
        if (selectedItemsIds.length === 0) return alert("Selecione pelo menos um item.")
        
        // Validação de Sobras
        for (const id of selectedItemsIds) {
            const state = itemsState[id]
            if (state.condicao === 'Sobra') {
                if (!state.diametro || !state.olho) {
                    return alert("Para itens marcados como SOBRA, informe o Diâmetro e o Olho.")
                }
            }
        }

        setIsAuthOpen(true)
    }

    const handleAuthSuccess = (employee: { id: number, full_name: string, role: string }) => {
        // TRAVA DE SEGURANÇA: Estorno exige Gerente
        if (refundMethod === 'Estorno' && employee.role !== 'gerente' && employee.role !== 'admin') {
            alert("⛔ Acesso Negado: Apenas Gerentes podem autorizar Estorno Financeiro.\nPara vendedores, use a opção 'Crédito em Loja'.")
            // Não fecha o modal de auth, força tentar de novo ou cancelar
            return 
        }

        setIsAuthOpen(false)

        // Prepara Payload
        const itensPayload = selectedItemsIds.map(id => {
            const original = itens.find(i => i.id === id)!
            const state = itemsState[id]
            return {
                venda_item_id: id,
                product_id: original.product_id,
                quantidade: original.quantidade, // Devolução total da linha
                valor_unitario: original.valor_unitario,
                condicao: state.condicao,
                detalhes_sobra: state.condicao === 'Sobra' ? {
                    diametro: parseFloat(state.diametro || '0'),
                    olho: state.olho
                } : undefined
            }
        })

        const formData = new FormData()
        formData.append('store_id', storeId.toString())
        formData.append('venda_id', vendaId.toString())
        formData.append('customer_id', customerId.toString())
        formData.append('employee_id', employee.id.toString())
        formData.append('tipo_reembolso', refundMethod)
        formData.append('itens_json', JSON.stringify(itensPayload))

        startTransition(async () => {
            const res = await processarDevolucao(null, formData)
            if (res.success) {
                alert("Devolução processada com sucesso!")
                onClose()
            } else {
                alert(`Erro: ${res.message}`)
            }
        })
    }

    if (!isOpen) return null

    return (
        <>
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-red-900 flex items-center gap-2">
                            <RefreshCcw className="h-6 w-6" /> Devolução / Troca
                        </h2>
                        <p className="text-xs text-red-700">Selecione os itens e o destino.</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-red-100 rounded-full text-red-400"><X className="h-6 w-6"/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    
                    {/* 1. Lista de Itens */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Itens da Venda</h3>
                        {itens.map(item => {
                            const state = itemsState[item.id]
                            const isLente = item.item_tipo === 'Lente'
                            
                            return (
                                <div key={item.id} className={`p-4 rounded-xl border transition-all ${state.selected ? 'border-red-500 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex items-start gap-3">
                                        <input 
                                            type="checkbox" 
                                            checked={state.selected} 
                                            onChange={() => toggleSelect(item.id)}
                                            className="mt-1 w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
                                        />
                                        <div className="flex-1">
                                            <div className="flex justify-between">
                                                <span className="font-bold text-gray-800">{item.descricao}</span>
                                                <span className="font-mono text-gray-600">{formatCurrency(item.valor_total_item)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2">{item.quantidade}x {item.item_tipo}</p>

                                            {/* Opções Condicionais (Só aparecem se selecionado) */}
                                            {state.selected && (
                                                <div className="mt-3 flex flex-wrap gap-4 items-end animate-in slide-in-from-top-2">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Estado / Destino</label>
                                                        <select 
                                                            value={state.condicao} 
                                                            onChange={(e) => updateCondition(item.id, e.target.value as any)}
                                                            className="h-8 text-xs rounded border-gray-300 focus:ring-red-500 bg-white"
                                                        >
                                                            <option value="Intacto">Intacto (Estoque)</option>
                                                            <option value="Defeito">Defeito (Lixo/Perda)</option>
                                                            {isLente && <option value="Sobra">Sobra (Banco de Lentes)</option>}
                                                        </select>
                                                    </div>

                                                    {/* Campos Extras para Sobra */}
                                                    {state.condicao === 'Sobra' && (
                                                        <>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Diâmetro Útil</label>
                                                                <input 
                                                                    type="number" 
                                                                    placeholder="Ex: 65"
                                                                    value={state.diametro || ''}
                                                                    onChange={(e) => updateDetails(item.id, 'diametro', e.target.value)}
                                                                    className="h-8 w-20 text-xs rounded border-blue-300 focus:ring-blue-500"
                                                                />
                                                            </div>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Olho</label>
                                                                <select 
                                                                    value={state.olho || ''}
                                                                    onChange={(e) => updateDetails(item.id, 'olho', e.target.value)}
                                                                    className="h-8 w-20 text-xs rounded border-blue-300 focus:ring-blue-500"
                                                                >
                                                                    <option value="">--</option>
                                                                    <option value="OD">OD</option>
                                                                    <option value="OE">OE</option>
                                                                </select>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* 2. Resumo e Método */}
                    <div className="bg-gray-50 p-5 rounded-xl border border-gray-200">
                        <div className="flex justify-between items-center mb-4">
                            <span className="text-sm font-bold text-gray-600 uppercase">Total do Reembolso</span>
                            <span className="text-2xl font-black text-gray-800">{formatCurrency(totalRefund)}</span>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <button 
                                onClick={() => setRefundMethod('Carteira')}
                                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${refundMethod === 'Carteira' ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 bg-white text-gray-500 hover:border-blue-200'}`}
                            >
                                <Wallet className="h-6 w-6" />
                                <span className="font-bold text-sm">Gerar Crédito (Carteira)</span>
                                <span className="text-[10px] bg-blue-200 text-blue-800 px-2 py-0.5 rounded">Recomendado</span>
                            </button>

                            <button 
                                onClick={() => setRefundMethod('Estorno')}
                                className={`p-4 rounded-xl border-2 flex flex-col items-center gap-2 transition-all ${refundMethod === 'Estorno' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-500 hover:border-red-200'}`}
                            >
                                <CreditCard className="h-6 w-6" />
                                <span className="font-bold text-sm">Estorno Financeiro</span>
                                <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded flex items-center gap-1">
                                    <AlertTriangle className="h-3 w-3"/> Exige Gerente
                                </span>
                            </button>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors">Cancelar</button>
                    <button 
                        onClick={handlePreConfirm}
                        disabled={selectedItemsIds.length === 0 || isPending}
                        className="px-8 py-3 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold shadow-lg shadow-red-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isPending ? <Loader2 className="h-5 w-5 animate-spin"/> : <ArrowRight className="h-5 w-5" />}
                        Confirmar Devolução
                    </button>
                </div>

            </div>
        </div>

        {/* Modal de Autenticação */}
        {isAuthOpen && (
            <EmployeeAuthModal 
                storeId={storeId} 
                isOpen={isAuthOpen} 
                onClose={() => setIsAuthOpen(false)} 
                onSuccess={handleAuthSuccess}
                title={refundMethod === 'Estorno' ? "Autorização de Gerente Necessária" : "Autorizar Devolução"}
                description={refundMethod === 'Estorno' ? "Para estornos financeiros, é necessário o PIN de um gerente." : "Insira seu PIN para confirmar a devolução."}
            />
        )}
        </>
    )
}