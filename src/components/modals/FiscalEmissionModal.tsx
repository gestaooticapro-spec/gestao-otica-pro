'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, AlertTriangle, CheckCircle2, X, FileText } from 'lucide-react'
import { emitirNFCe } from '@/lib/actions/fiscal.actions'
import { getTenantIdByStore, getProductFiscalData } from '@/lib/actions/fiscal-db.actions'

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
    const [mounted, setMounted] = useState(false)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen) return null

    const valorTotal = venda.valor_final ?? venda.total_amount ?? 0

    const handleEmission = async () => {
        setIsLoading(true)
        setError(null)
        setSuccessMsg(null)

        try {
            const storeId: number = venda.store_id

            // Buscar tenant_id (organization_id real — UUID do dono)
            const tenantId = await getTenantIdByStore(storeId)
            if (!tenantId) {
                setError("Organização não encontrada para esta loja.")
                return
            }

            // Enriquecer itens com NCM/CFOP do cadastro de produtos
            const itensMapeados = await Promise.all(
                vendaItens.map(async (item: any) => {
                    let ncm = '00000000'
                    let cfop = '5102'
                    let unidade = 'UN'

                    if (item.product_id) {
                        const fiscal = await getProductFiscalData(item.product_id)
                        if (fiscal) {
                            ncm = fiscal.ncm || '00000000'
                            cfop = fiscal.cfop || '5102'
                            unidade = fiscal.unidade || 'UN'
                        }
                    }

                    const quant = item.quantidade ?? item.quantity ?? 1;
                    const vUnit = item.valor_unitario ?? item.unit_price ?? 0;
                    const vTot = item.valor_total_item ?? item.total_price ?? item.valor_total ?? (quant * vUnit);

                    return {
                        codigo: item.product_id?.toString() || '0',
                        descricao: item.descricao || item.product_name || item.nome || 'Item',
                        ncm,
                        cfop,
                        unidade,
                        quantidade: quant,
                        valor_unitario: vUnit,
                        valor_total: vTot,
                    }
                })
            )

            const result = await emitirNFCe({
                organization_id: tenantId,
                store_id: storeId,
                work_order_id: venda.id,
                cliente: {
                    cpf_cnpj: customer?.cpf || customer?.cpf_cnpj || '',
                    nome: customer?.full_name || customer?.nome || 'Consumidor Final',
                    email: customer?.email,
                },
                itens: itensMapeados,
                valor_total: valorTotal,
                meio_pagamento: '01',
                environment,
            })

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

    if (!isOpen || !mounted) return null

    return createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto custom-scrollbar animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-white/10 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-300">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3">
                        <div className="bg-blue-500/20 p-2 rounded-lg">
                            <FileText className="h-5 w-5 text-blue-400" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-100">Emitir NFC-e</h2>
                            <p className="text-xs text-slate-400">Confirme os dados para emissão</p>
                        </div>
                    </div>
                    <button onClick={onClose} disabled={isLoading} className="text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-50">
                        <X className="h-5 w-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                            <span>{error}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-lg text-sm flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    {/* Ambiente */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ambiente de Emissão</label>
                        <div className="flex flex-col gap-2">
                            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${environment === 'homologation' ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                <input
                                    type="radio"
                                    name="environment"
                                    value="homologation"
                                    checked={environment === 'homologation'}
                                    onChange={() => setEnvironment('homologation')}
                                    className="w-4 h-4 text-blue-500"
                                />
                                <div>
                                    <span className="block text-sm font-semibold text-slate-200">Homologação (Teste)</span>
                                    <span className="block text-xs text-slate-400">Sem valor fiscal, para testes.</span>
                                </div>
                            </label>

                            <label className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${environment === 'production' ? 'border-emerald-500/50 bg-emerald-500/10' : 'border-white/10 bg-white/5 hover:bg-white/10'}`}>
                                <input
                                    type="radio"
                                    name="environment"
                                    value="production"
                                    checked={environment === 'production'}
                                    onChange={() => setEnvironment('production')}
                                    className="w-4 h-4 text-emerald-500"
                                />
                                <div>
                                    <span className="block text-sm font-semibold text-slate-200">Produção (Valendo)</span>
                                    <span className="block text-xs text-slate-400">Nota fiscal válida com valor legal.</span>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Resumo */}
                    <div className="text-sm bg-white/5 border border-white/10 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Cliente:</span>
                            <span className="font-semibold text-slate-200">{customer?.full_name || customer?.nome || 'Consumidor Final'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">CPF:</span>
                            <span className="font-semibold text-slate-200">{customer?.cpf || customer?.cpf_cnpj || '—'}</span>
                        </div>
                        <div className="flex justify-between border-t border-white/10 pt-2 mt-2">
                            <span className="text-slate-400">Valor Total:</span>
                            <span className="font-bold text-emerald-400">R$ {valorTotal.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-slate-400">Itens:</span>
                            <span className="font-semibold text-slate-200">{vendaItens.length}</span>
                        </div>
                    </div>

                    {environment === 'production' && (
                        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-300 px-4 py-3 rounded-lg text-xs flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>Você está emitindo em <strong>PRODUÇÃO</strong>. Esta nota terá valor legal e não poderá ser cancelada após 30 minutos.</span>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 bg-white/5 border-t border-white/10 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-bold text-slate-300 bg-white/5 border border-white/10 rounded-lg hover:bg-white/10 transition-colors disabled:opacity-50 uppercase tracking-wide"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleEmission}
                        disabled={isLoading || !!successMsg}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Emitindo...
                            </>
                        ) : (
                            <>
                                <FileText className="h-4 w-4" />
                                Emitir NFC-e
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    )
}
