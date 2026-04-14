'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Loader2, AlertTriangle, CheckCircle2, X, FileText, Save, ExternalLink, UserX } from 'lucide-react'
import Link from 'next/link'
import { emitirNFCe } from '@/lib/actions/fiscal.actions'
import { getTenantIdByStore, getProductFiscalData, updateCustomerCpf } from '@/lib/actions/fiscal-db.actions'

function validaCPF(cpf: string): boolean {
    const stripped = cpf.replace(/\D/g, '')
    if (stripped.length !== 11) return false
    if (/^(\d)\1{10}$/.test(stripped)) return false
    let sum = 0
    for (let i = 0; i < 9; i++) sum += parseInt(stripped[i]) * (10 - i)
    let rev = 11 - (sum % 11)
    if (rev >= 10) rev = 0
    if (rev !== parseInt(stripped[9])) return false
    sum = 0
    for (let i = 0; i < 10; i++) sum += parseInt(stripped[i]) * (11 - i)
    rev = 11 - (sum % 11)
    if (rev >= 10) rev = 0
    return rev === parseInt(stripped[10])
}

function formatCPF(value: string): string {
    const digits = value.replace(/\D/g, '').slice(0, 11)
    return digits
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

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
    const [environment, setEnvironment] = useState<'homologation' | 'production'>('production')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [successMsg, setSuccessMsg] = useState<string | null>(null)
    const [mounted, setMounted] = useState(false)

    const existingCpf = customer?.cpf || customer?.cpf_cnpj || ''
    const [cpfInput, setCpfInput] = useState(existingCpf)
    const [cpfSaving, setCpfSaving] = useState(false)
    const [cpfSaved, setCpfSaved] = useState(false)
    const [identificarCliente, setIdentificarCliente] = useState(true)

    const cpfDigits = cpfInput.replace(/\D/g, '')
    const cpfIsValid = validaCPF(cpfInput)
    const cpfEditable = !existingCpf

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null

    const valorTotal = venda.valor_final ?? venda.total_amount ?? 0

    const handleSaveCpf = async () => {
        if (!cpfIsValid || !customer?.id) return
        setCpfSaving(true)
        const result = await updateCustomerCpf(customer.id, cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'))
        setCpfSaving(false)
        if (result.success) setCpfSaved(true)
        else setError('Não foi possível salvar o CPF.')
    }

    const handleEmission = async () => {
        setIsLoading(true)
        setError(null)
        setSuccessMsg(null)

        try {
            const storeId: number = venda.store_id

            const tenantId = await getTenantIdByStore(storeId)
            if (!tenantId) {
                setError("Organização não encontrada para esta loja.")
                return
            }

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

            const cpfFinal = identificarCliente
                ? (cpfEditable ? (cpfIsValid ? cpfDigits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '') : existingCpf)
                : ''

            const result = await emitirNFCe({
                organization_id: tenantId,
                store_id: storeId,
                work_order_id: venda.id,
                cliente: {
                    cpf_cnpj: cpfFinal,
                    nome: identificarCliente ? (customer?.full_name || customer?.nome || 'Consumidor Final') : 'Consumidor Final',
                    email: identificarCliente ? customer?.email : undefined,
                },
                itens: itensMapeados,
                valor_total: valorTotal,
                meio_pagamento: '01',
                environment,
            })

            if (result.success) {
                setSuccessMsg("NFC-e emitida com sucesso!")
                onSuccess()
            } else {
                setError(result.error || "Erro desconhecido na emissão.")
            }

        } catch (e: any) {
            setError(e.message)
        } finally {
            setIsLoading(false)
        }
    }

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
                        <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm space-y-2">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-red-400" />
                                <span>{error}</span>
                            </div>
                            <Link
                                href={`/dashboard/loja/${venda.store_id}/fiscal`}
                                className="flex items-center gap-1.5 text-xs font-bold text-red-300 hover:text-red-100 underline underline-offset-2 transition-colors"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Ver notas fiscais emitidas
                            </Link>
                        </div>
                    )}

                    {successMsg && (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 px-4 py-3 rounded-lg text-sm space-y-2">
                            <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                <span>{successMsg}</span>
                            </div>
                            <Link
                                href={`/dashboard/loja/${venda.store_id}/fiscal`}
                                className="flex items-center gap-1.5 text-xs font-bold text-emerald-300 hover:text-emerald-100 underline underline-offset-2 transition-colors"
                            >
                                <ExternalLink className="h-3 w-3" />
                                Ver notas fiscais emitidas
                            </Link>
                        </div>
                    )}

                    {/* Ambiente */}
                    <div className="space-y-2">
                        <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Ambiente</label>
                        <div className="flex gap-2">
                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${environment === 'production' ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                                <input
                                    type="radio"
                                    name="environment"
                                    value="production"
                                    checked={environment === 'production'}
                                    onChange={() => setEnvironment('production')}
                                    className="sr-only"
                                />
                                <span className="text-sm font-bold uppercase tracking-wide">Produção</span>
                            </label>

                            <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-all ${environment === 'homologation' ? 'border-blue-500/50 bg-blue-500/10 text-blue-300' : 'border-white/10 bg-white/5 text-slate-400 hover:bg-white/10'}`}>
                                <input
                                    type="radio"
                                    name="environment"
                                    value="homologation"
                                    checked={environment === 'homologation'}
                                    onChange={() => setEnvironment('homologation')}
                                    className="sr-only"
                                />
                                <span className="text-sm font-bold uppercase tracking-wide">Homologação</span>
                            </label>
                        </div>
                    </div>

                    {/* Resumo */}
                    <div className="text-sm bg-white/5 border border-white/10 p-4 rounded-lg space-y-2">
                        <div className="flex justify-between">
                            <span className="text-slate-400">Cliente:</span>
                            <span className="font-semibold text-slate-200">
                                {identificarCliente ? (customer?.full_name || customer?.nome || 'Consumidor Final') : 'Consumidor Final'}
                            </span>
                        </div>

                        {/* Toggle identificação */}
                        <div className="flex items-center justify-between gap-2 py-1">
                            <div className="flex items-center gap-1.5 text-slate-400">
                                <UserX className="h-3.5 w-3.5" />
                                <span className="text-xs">Identificar cliente na nota</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIdentificarCliente(v => !v)}
                                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                                    identificarCliente ? 'bg-blue-500' : 'bg-slate-600'
                                }`}
                                role="switch"
                                aria-checked={identificarCliente}
                            >
                                <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                                    identificarCliente ? 'translate-x-4' : 'translate-x-0'
                                }`} />
                            </button>
                        </div>

                        {/* CPF */}
                        {identificarCliente && (
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-slate-400 shrink-0">CPF:</span>
                                {cpfEditable ? (
                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                        <div className="relative">
                                            <input
                                                type="text"
                                                value={cpfInput}
                                                onChange={e => {
                                                    setCpfInput(formatCPF(e.target.value))
                                                    setCpfSaved(false)
                                                }}
                                                placeholder="000.000.000-00"
                                                maxLength={14}
                                                className={`w-36 bg-slate-800 border rounded px-2 py-1 text-sm font-mono text-slate-200 outline-none transition-colors ${
                                                    cpfDigits.length === 0 ? 'border-white/20' :
                                                    cpfIsValid ? 'border-emerald-500/60' : 'border-red-500/60'
                                                }`}
                                            />
                                        </div>
                                        {cpfIsValid && !cpfSaved && (
                                            <button
                                                onClick={handleSaveCpf}
                                                disabled={cpfSaving}
                                                title="Salvar CPF no cadastro do cliente"
                                                className="flex items-center gap-1 px-2 py-1 text-xs font-bold rounded bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
                                            >
                                                {cpfSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                                                Salvar
                                            </button>
                                        )}
                                        {cpfSaved && (
                                            <span className="flex items-center gap-1 text-xs text-emerald-400 font-bold">
                                                <CheckCircle2 className="h-3 w-3" /> Salvo
                                            </span>
                                        )}
                                        {cpfDigits.length > 0 && !cpfIsValid && (
                                            <span className="text-xs text-red-400 font-bold">Inválido</span>
                                        )}
                                    </div>
                                ) : (
                                    <span className="font-semibold text-slate-200 font-mono">{existingCpf}</span>
                                )}
                            </div>
                        )}

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
