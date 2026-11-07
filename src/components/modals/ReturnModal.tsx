'use client'

import { useState, useTransition, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X, RefreshCcw, Wallet, ArrowRight, Loader2 } from 'lucide-react'
import { Database } from '@/lib/database.types'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { processarDevolucao } from '@/lib/actions/return.actions'

type VendaItem = Database['public']['Tables']['venda_itens']['Row'] & { unidade?: string | null }
interface ReturnModalProps {
    isOpen: boolean
    onClose: () => void
    vendaId: number
    storeId: number
    customerId: number
    itens: VendaItem[]
    valorReembolso: number
    onSuccess?: () => Promise<void>
}

type SelectedItemState = {
    selected: boolean
    condicao: 'Intacto' | 'Defeito' | 'Sobra'
    diametro?: string
    olho?: 'OD' | 'OE'
}

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default function ReturnModal({ isOpen, onClose, vendaId, storeId, customerId, itens, valorReembolso, onSuccess }: ReturnModalProps) {
    const [returnAttemptKey, setReturnAttemptKey] = useState<string | null>(null)
    // Estado dos Itens (Controle de seleção e condição)
    const [itemsState, setItemsState] = useState<Record<number, SelectedItemState>>(() => {
        const initial: Record<number, SelectedItemState> = {}
        itens.forEach(item => {
            initial[item.id] = { selected: true, condicao: 'Intacto' }
        })
        return initial
    })

    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [isPending, startTransition] = useTransition()

    // Cálculos
    const selectedItemsIds = Object.keys(itemsState).filter(id => itemsState[parseInt(id)].selected).map(Number)
    const totalRefund = valorReembolso

    // Handlers
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
        if (selectedItemsIds.length === 0 || selectedItemsIds.length !== itens.length) return alert('A devolução deve incluir todos os itens da venda.')
        
        // Validação de Sobras
        for (const id of selectedItemsIds) {
            const state = itemsState[id]
            if (state.condicao === 'Sobra') {
                if (!state.diametro || !state.olho) {
                    return alert("Para itens marcados como SOBRA, informe o Diâmetro e o Olho.")
                }
            }
        }

        setReturnAttemptKey(current => current ?? crypto.randomUUID())
        setIsAuthOpen(true)
    }

    const handleAuthSuccess = (employee: { id: number, full_name: string, role: string, authorization_token?: string }) => {
        if (!returnAttemptKey || !employee.authorization_token) return alert('Autorize novamente a devolução pelo PIN.')

        setIsAuthOpen(false)

        // Prepara Payload
        const itensPayload = selectedItemsIds.map(id => {
            const state = itemsState[id]
            return {
                venda_item_id: id,
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
        formData.append('tipo_reembolso', 'Carteira')
        formData.append('itens_json', JSON.stringify(itensPayload))
        formData.append('idempotency_key', returnAttemptKey)
        formData.append('authorization_token', employee.authorization_token)

        startTransition(async () => {
            let res
            try { res = await processarDevolucao(null, formData) }
            catch { alert('Resposta incerta. Consulte o histórico antes de repetir a devolução.'); return }
            if (res.success) {
                alert(res.message)
                onClose()
                try { await onSuccess?.() }
                catch { alert('Devolução concluída. Recarregue a página para atualizar os dados.') }
            } else {
                alert(`Erro: ${res.message}`)
            }
        })
    }

    const [mounted, setMounted] = useState(false)
    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    return createPortal(
        <>
        <div className="fixed inset-0 z-[70] grid place-items-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto custom-scrollbar animate-in fade-in">
            <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex justify-between items-center">
                    <div>
                        <h2 className="text-xl font-bold text-red-900 flex items-center gap-2">
                            <RefreshCcw className="h-6 w-6" /> Devolução integral
                        </h2>
                        <p className="text-xs text-red-700">Venda quitada, sem carnê. Todos os itens serão devolvidos e o valor final virará Crédito em Loja.</p>
                    </div>
                    <button disabled={isPending} onClick={onClose} className="p-2 hover:bg-red-100 rounded-full text-red-400"><X className="h-6 w-6"/></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    
                    {/* 1. Lista de Itens */}
                    <div className="space-y-3">
                        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Itens da Venda</h3>
                        {itens.map(item => {
                            const state = itemsState[item.id]
                            const canReturnLeftover = item.item_tipo === 'Lente' && item.quantidade === 1 && item.unidade !== 'Par' && item.variant_id != null
                            
                            return (
                                <div key={item.id} className={`p-4 rounded-xl border transition-all ${state.selected ? 'border-red-500 bg-red-50/50' : 'border-gray-200 bg-white'}`}>
                                    <div className="flex items-start gap-3">
                                        <input 
                                            type="checkbox" 
                                            checked={state.selected} 
                                            disabled
                                            className="mt-1 w-5 h-5 text-red-600 rounded border-gray-300 focus:ring-red-500"
                                        />
                                        <div className="flex-1">
                                            <div className="flex justify-between">
                                                <span className="font-bold text-gray-800">{item.descricao}</span>
                                                <span className="font-mono text-gray-600">{formatCurrency(item.valor_total_item)}</span>
                                            </div>
                                            <p className="text-xs text-gray-500 mb-2">{item.quantidade}x {item.item_tipo}</p>
                                            {item.product_id == null && <p className="text-xs text-gray-500">Item sem produto cadastrado: não gera entrada no estoque.</p>}

                                            {/* Opções Condicionais (Só aparecem se selecionado) */}
                                            {state.selected && (
                                                <div className="mt-3 flex flex-wrap gap-4 items-end animate-in slide-in-from-top-2">
                                                    <div>
                                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Estado / Destino</label>
                                                        <select 
                                                            value={state.condicao} 
                                                            disabled={isPending}
                                                            onChange={(e) => updateCondition(item.id, e.target.value as any)}
                                                            className="h-8 text-xs rounded border-gray-300 focus:ring-red-500 bg-white"
                                                        >
                                                            <option value="Intacto">Intacto (Estoque)</option>
                                                            <option value="Defeito">Defeito (Lixo/Perda)</option>
                                                            {canReturnLeftover && <option value="Sobra">Sobra (Banco de Lentes)</option>}
                                                        </select>
                                                    </div>

                                                    {/* Campos Extras para Sobra */}
                                                    {state.condicao === 'Sobra' && (
                                                        <>
                                                            <div>
                                                                <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Diâmetro Útil</label>
                                                                <input 
                                                                    type="number" 
                                                                    disabled={isPending}
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
                                                                    disabled={isPending}
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
                            <div className="p-4 rounded-xl border-2 border-blue-500 bg-blue-50 text-blue-700 flex flex-col items-center gap-2">
                                <Wallet className="h-6 w-6" />
                                <span className="font-bold text-sm">Gerar Crédito (Carteira)</span>
                                <span className="text-[10px]">Valor final, incluindo o desconto da venda.</span>
                            </div>
                            <div className="p-4 rounded-xl border border-gray-200 text-gray-500 text-xs flex items-center">
                                Estorno financeiro e devoluções parciais estão indisponíveis neste fluxo.
                            </div>
                        </div>
                    </div>

                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
                    <button disabled={isPending} onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-gray-500 hover:bg-gray-200 transition-colors">Cancelar</button>
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
                title="Autorizar Devolução Integral"
                description="Insira seu PIN para confirmar a devolução em Crédito em Loja."
                purpose="sale_return"
                authorizationContext={`return:${vendaId}:${returnAttemptKey}`}
            />
        )}
        </>,
        document.body
    )
}
