'use client'

import { useState } from 'react'
import { Loader2, AlertTriangle, CheckCircle2, X } from 'lucide-react'
import { emitirNFCe } from '@/lib/actions/fiscal.actions'

interface FiscalEmissionModalProps {
    isOpen: boolean
    onClose: () => void
    venda: any
    vendaItens: any[]
    customer: any
    onSuccess: () => void
}

export default function FiscalEmissionModal({
    isOpen,
    onClose,
    venda,
    vendaItens,
    customer,
    onSuccess
}: FiscalEmissionModalProps) {
    const [environment, setEnvironment] = useState<'homologation' | 'production'>('homologation')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)

    if (!isOpen) return null

    const handleEmission = async () => {
        setIsLoading(true)
        setError(null)
        setSuccessMsg(null)

        try {
            const payload = {
                organization_id: venda.store_id,
                cliente: {
                    cpf_cnpj: customer?.cpf_cnpj || '',
                    nome: customer?.full_name || 'Consumidor Final',
                    email: customer?.email,
                    endereco: customer?.address ? {
                        logradouro: customer.address,
                        numero: customer.address_number || 'S/N',
                        bairro: customer.neighborhood || '',
                        codigo_municipio: '0000000', // TODO: Ajustar
                        cep: customer.zip_code
                    } : undefined
                },
                itens: vendaItens.map((item: any) => ({
                    codigo: item.product_id?.toString() || '0',
                    descricao: item.product_name || 'Item',
                    ncm: '00000000', // TODO: Ajustar
                    cfop: '5102',
                    unidade: 'UN',
                    quantidade: item.quantity,
                    valor_unitario: item.unit_price,
                    valor_total: item.total_price
                })),
                valor_total: venda.total_amount,
                meio_pagamento: '01',
                environment: environment
            }

            const result = await emitirNFCe(payload as any)

            if (result.success) {
                setSuccessMsg("NFC-e emitida com sucesso!")
                setTimeout(() => {
                    onSuccess()
                    onClose()
                }, 2000)
            } else {
                setError(result.error || "Erro desconhecido na emissão.")
            }

        } catch (e: any) {
            setError(e.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Emitir NFC-e</h2>
                        <p className="text-sm text-gray-500">Confirme os dados para emissão.</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">

                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    <div className="space-y-2">
                        <label className="text-sm font-semibold text-gray-700">Ambiente de Emissão</label>
                        <div className="flex flex-col gap-2">
                            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${environment === 'homologation' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input
                                    type="radio"
                                    name="environment"
                                    value="homologation"
                                    checked={environment === 'homologation'}
                                    onChange={() => setEnvironment('homologation')}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <div>
                                    <span className="block text-sm font-medium text-gray-900">Homologação (Teste)</span>
                                    <span className="block text-xs text-gray-500">Sem valor fiscal, para testes.</span>
                                </div>
                            </label>

                            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${environment === 'production' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-gray-200 hover:bg-gray-50'}`}>
                                <input
                                    type="radio"
                                    name="environment"
                                    value="production"
                                    checked={environment === 'production'}
                                    onChange={() => setEnvironment('production')}
                                    className="w-4 h-4 text-blue-600"
                                />
                                <div>
                                    <span className="block text-sm font-medium text-gray-900">Produção (Valendo)</span>
                                    <span className="block text-xs text-gray-500">Nota fiscal válida com valor legal.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded-md space-y-1">
                        <div className="flex justify-between">
                            <span>Cliente:</span>
                            <span className="font-medium text-gray-900">{customer?.full_name || 'Consumidor Final'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Valor Total:</span>
                            <span className="font-medium text-gray-900">R$ {venda.total_amount?.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Itens:</span>
                            <span className="font-medium text-gray-900">{vendaItens.length}</span>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleEmission}
                        disabled={isLoading || !!successMsg}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Emitindo...
                            </>
                        ) : (
                            'Emitir Nota'
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
