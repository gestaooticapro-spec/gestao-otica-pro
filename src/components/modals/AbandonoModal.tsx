'use client'

import { useState, useTransition } from 'react'
import { AlertTriangle, Loader2, PackageX, ArchiveRestore, ArchiveX } from 'lucide-react'
import { declararVendaAbandonada } from '@/lib/actions/venda-abandono.actions'

interface AbandonoModalProps {
    isOpen: boolean
    onClose: () => void
    vendaId: number
    onSuccess: () => void
}

export default function AbandonoModal({ isOpen, onClose, vendaId, onSuccess }: AbandonoModalProps) {
    const [isPending, startTransition] = useTransition()
    const [devolveArmacao, setDevolveArmacao] = useState(true)
    const [acaoLente, setAcaoLente] = useState<'estoque' | 'perda' | 'nenhuma'>('estoque')
    const [motivo, setMotivo] = useState('')

    if (!isOpen) return null

    const handleConfirm = () => {
        if (!motivo.trim()) {
            alert('Por favor, informe um motivo ou observação para o abandono.')
            return
        }

        startTransition(async () => {
             const motivoNormalizado = motivo.trim()
             const result = await declararVendaAbandonada(vendaId, {
                 devolveArmacao,
                 acaoLente,
                 motivo: motivoNormalizado
             })

             if (result.success) {
                 alert(result.message)
                 onSuccess()
                 onClose()
             } else {
                 alert(`Erro: ${result.message}`)
             }
        })
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center gap-3">
                    <div className="p-2 bg-red-100 text-red-600 rounded-full">
                        <AlertTriangle className="h-6 w-6" />
                    </div>
                    <div>
                        <h3 className="font-bold text-red-900 text-lg">Declarar Abandono de Pedido</h3>
                        <p className="text-sm text-red-700">Esta ação cancelará a venda #{vendaId} permanentemente.</p>
                    </div>
                </div>

                {/* Body */}
                <div className="p-6 space-y-6">
                    
                    {/* Armação */}
                    <div className="space-y-3">
                        <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Tratamento da Armação</h4>
                        <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                            <input 
                                type="checkbox" 
                                checked={devolveArmacao}
                                onChange={(e) => setDevolveArmacao(e.target.checked)}
                                className="mt-1 h-4 w-4 text-red-600 rounded border-gray-300 focus:ring-red-500"
                            />
                            <div>
                                <p className="font-semibold text-gray-800 text-sm">Retornar armação ao estoque</p>
                                <p className="text-xs text-gray-500">Se a armação já foi baixada do estoque, ela será devolvida automaticamente.</p>
                            </div>
                        </label>
                    </div>

                    {/* Lentes */}
                    <div className="space-y-3 border-t border-gray-100 pt-4">
                        <h4 className="font-bold text-gray-800 text-sm uppercase tracking-wide">Tratamento das Lentes</h4>
                        <div className="space-y-2">
                            
                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${acaoLente === 'estoque' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input 
                                    type="radio" 
                                    name="acaoLente"
                                    value="estoque"
                                    checked={acaoLente === 'estoque'}
                                    onChange={() => setAcaoLente('estoque')}
                                    className="mt-1 h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                                />
                                <ArchiveRestore className={`h-5 w-5 mt-0.5 ${acaoLente === 'estoque' ? 'text-blue-600' : 'text-gray-400'}`} />
                                <div>
                                    <p className={`font-semibold text-sm ${acaoLente === 'estoque' ? 'text-blue-900' : 'text-gray-800'}`}>Devolver ao Estoque</p>
                                    <p className={`text-xs ${acaoLente === 'estoque' ? 'text-blue-700' : 'text-gray-500'}`}>A lente não foi cortada e pode ser vendida novamente.</p>
                                </div>
                            </label>

                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${acaoLente === 'perda' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input 
                                    type="radio" 
                                    name="acaoLente"
                                    value="perda"
                                    checked={acaoLente === 'perda'}
                                    onChange={() => setAcaoLente('perda')}
                                    className="mt-1 h-4 w-4 text-red-600 border-gray-300 focus:ring-red-500"
                                />
                                <PackageX className={`h-5 w-5 mt-0.5 ${acaoLente === 'perda' ? 'text-red-600' : 'text-gray-400'}`} />
                                <div>
                                    <p className={`font-semibold text-sm ${acaoLente === 'perda' ? 'text-red-900' : 'text-gray-800'}`}>Lançar como PERDA</p>
                                    <p className={`text-xs ${acaoLente === 'perda' ? 'text-red-700' : 'text-gray-500'}`}>A lente já foi cortada/montada e não tem serventia. Ficará registrada como perda financeira.</p>
                                </div>
                            </label>

                            <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${acaoLente === 'nenhuma' ? 'border-gray-500 bg-gray-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input 
                                    type="radio" 
                                    name="acaoLente"
                                    value="nenhuma"
                                    checked={acaoLente === 'nenhuma'}
                                    onChange={() => setAcaoLente('nenhuma')}
                                    className="mt-1 h-4 w-4 text-gray-600 border-gray-300 focus:ring-gray-500"
                                />
                                <ArchiveX className={`h-5 w-5 mt-0.5 ${acaoLente === 'nenhuma' ? 'text-gray-600' : 'text-gray-400'}`} />
                                <div>
                                    <p className={`font-semibold text-sm ${acaoLente === 'nenhuma' ? 'text-gray-900' : 'text-gray-800'}`}>Nenhuma Ação</p>
                                    <p className={`text-xs ${acaoLente === 'nenhuma' ? 'text-gray-700' : 'text-gray-500'}`}>A lente nem chegou a ser pedida ou você resolverá manualmente depois.</p>
                                </div>
                            </label>

                        </div>
                    </div>

                    {/* Motivo */}
                    <div className="space-y-2 border-t border-gray-100 pt-4">
                        <label className="font-bold text-gray-800 text-sm uppercase tracking-wide">Observação / Histórico</label>
                        <p className="text-xs text-gray-500 mb-2">Este texto ficará gravado no dossiê do cliente e nas OS do pedido.</p>
                        <textarea 
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Ex: Cliente não veio buscar após 30 dias. Tentativas de contato via WhatsApp sem sucesso..."
                            className="w-full text-sm rounded-lg border border-gray-300 bg-white p-3 focus:ring-2 focus:ring-red-500 focus:border-red-500 h-24 resize-none"
                        />
                    </div>

                </div>

                {/* Footer */}
                <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
                    <button 
                        disabled={isPending}
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-200 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button 
                        disabled={isPending}
                        onClick={handleConfirm}
                        className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-bold text-white bg-red-600 hover:bg-red-700 transition-colors shadow-md disabled:opacity-50"
                    >
                        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                        Confirmar Abandono
                    </button>
                </div>

            </div>
        </div>
    )
}
