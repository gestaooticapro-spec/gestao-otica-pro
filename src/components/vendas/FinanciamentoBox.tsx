//============================
//📄 ARQUIVO: src/components/vendas/FinanciamentoBox.tsx
//============================

'use client'

import { useState, useEffect, useRef } from 'react'
import { useFormState } from 'react-dom'

import {
    saveFinanciamentoLoja,
    receberParcela,
    renegociarFinanciamentoLoja,
    type CreateFinanciamentoResult,
} from '@/lib/actions/vendas.actions'
import { sendInstallmentReceiptWhatsApp } from '@/lib/actions/manual-whatsapp.actions'
import ParcelaSearchModal from '@/components/modals/ParcelaSearchModal'
import ReverseInstallmentReceiptModal, { type ReversibleReceiptOperation } from '@/components/financeiro/ReverseInstallmentReceiptModal'
import { getPixChargesForInstallments, getPixProviderForStore, type PixInstallmentCharge } from '@/lib/actions/pix-installment.actions'
import PixInstallmentChargeModal from '@/components/modals/PixInstallmentChargeModal'

import { Database } from '@/lib/database.types'
import { Calendar, ClipboardList, AlertTriangle, CheckCircle2, Wallet, DollarSign, X, RefreshCw, Trash2, Calculator, Loader2, MessageCircle, Printer, RotateCcw, QrCode } from 'lucide-react'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import UpdateCpfModal from '@/components/modals/UpdateCpfModal'
import CollapsibleBox from './CollapsibleBox'
import { useStoreModules } from '@/lib/contexts/StoreModulesContext'
import { toast } from 'sonner'
import { getDefaultPartialReceiptStrategy, getInstallmentChargeTotal, getInstallmentOutstanding, getInstallmentReceiptPreview } from '@/lib/installment-balance'
import { getPixInstallmentActionLabel, shouldOpenExistingPixInstallmentCharge } from '@/lib/pix/installment-charge-presentation'

type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row'] & {
    reversible_receipt_operation?: ReversibleReceiptOperation | null
    valor_pago?: number | null
}
type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type ParcelaGridItem = Pick<FinanciamentoParcela, 'numero_parcela' | 'data_vencimento' | 'valor_parcela'>
type ReceiptOperation = {
    id: number
    origin_installment_id: number
    received_amount: number
    payment_method: string
    received_on: string
    state: string
    reversed_at?: string | null
    strategy?: string | null
    transferred_amount?: number | null
    destination_installment_id?: number | null
    installments_before?: Array<Record<string, unknown>> | null
}
type PaymentAllocation = { parcela_id?: number | null; valor_pago: number; receipt_operation_id?: number | null }

type FinanciamentoBoxProps = {
    financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
    vendaId: number
    customerId: number
    customer: Customer | null
    storeId: number
    employeeId: number
    valorRestante: number
    onFinanceAdded: () => Promise<void>
    disabled: boolean
    isQuitado?: boolean
    isModal?: boolean
    whatsappReceiptEnabled?: boolean
    isHistoricalImport?: boolean
    receiptOperations?: ReceiptOperation[]
    pagamentos?: PaymentAllocation[]
}

// Helpers
const formatCurrency = (value: number | null | undefined) => (value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const parseLocaleFloat = (str: string) => parseFloat(str.replace(/\./g, '').replace(',', '.') || '0')
const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    // Fix timezone: se a data está no formato YYYY-MM-DD, faz split direto para evitar interpretação UTC
    if (dateStr.length === 10 && dateStr.includes('-')) {
        const [year, month, day] = dateStr.split('-')
        return `${day}/${month}/${year}`
    }
    return new Date(dateStr).toLocaleDateString('pt-BR')
}
const getToday = () => new Date().toISOString().split('T')[0]

function PaymentChoiceModal({
    parcela,
    onClose,
    onManual,
    onPix,
}: {
    parcela: FinanciamentoParcela
    onClose: () => void
    onManual: () => void
    onPix: () => void
}) {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="w-full max-w-sm overflow-hidden rounded-xl border border-white/10 bg-slate-900 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                    <div>
                        <p className="text-sm font-black text-white">Parcela {parcela.numero_parcela}</p>
                        <p className="mt-1 text-xs text-slate-400">Escolha como deseja receber esta parcela.</p>
                    </div>
                    <button type="button" onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3 p-5">
                    <button type="button" onClick={onManual} className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-left transition-colors hover:bg-amber-500/20">
                        <Wallet className="h-5 w-5 text-amber-300" />
                        <span><strong className="block text-sm text-amber-100">Baixa manual</strong><small className="text-xs text-slate-400">Registrar o recebimento agora.</small></span>
                    </button>
                    <button type="button" onClick={onPix} className="flex items-center gap-3 rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-left transition-colors hover:bg-cyan-500/20">
                        <QrCode className="h-5 w-5 text-cyan-300" />
                        <span><strong className="block text-sm text-cyan-100">Gerar QR Code Pix</strong><small className="text-xs text-slate-400">Criar uma cobrança para o cliente pagar.</small></span>
                    </button>
                </div>
            </div>
        </div>
    )
}

// Sugere data: mesmo dia do próximo mês
const getFirstDueMonth = () => {
    const today = new Date();
    const nextMonth = new Date(today);
    nextMonth.setMonth(today.getMonth() + 1);

    if (nextMonth.getMonth() !== (today.getMonth() + 1) % 12) {
        nextMonth.setDate(0);
    }

    return nextMonth.toISOString().split('T')[0];
}

const ParcelaInput = ({ valor, index, onChange }: { valor: number, index: number, onChange: (idx: number, val: string) => void }) => {
    const [localStr, setLocalStr] = useState(formatCurrency(valor))
    const [isFocused, setIsFocused] = useState(false)
    useEffect(() => { if (!isFocused) setLocalStr(formatCurrency(valor)) }, [valor, isFocused])
    return (
        <div className="flex items-center gap-1 w-full justify-end">
            <span className="text-slate-500 text-[10px] font-bold">R$</span>
            <input
                type="text" value={localStr} onFocus={() => setIsFocused(true)}
                onBlur={() => { setIsFocused(false); setLocalStr(formatCurrency(parseLocaleFloat(localStr))) }}
                onChange={(e) => { setLocalStr(e.target.value); onChange(index, e.target.value) }}
                className="w-20 text-right font-bold text-slate-200 bg-white/5 border border-white/10 rounded px-1 h-6 text-xs focus:ring-amber-500/50 focus:border-amber-500/50 focus:outline-none placeholder:text-slate-600 transition-all"
            />
        </div>
    )
}

function RecebimentoModal({
    parcela,
    hasNextInstallment,
    onClose,
    onConfirm,
    storeId
}: {
    parcela: FinanciamentoParcela,
    hasNextInstallment: boolean,
    onClose: () => void,
    onConfirm: (dados: any) => void,
    storeId: number
}) {
    const saldoParcela = getInstallmentOutstanding(parcela)
    const [valorPagoStr, setValorPagoStr] = useState(formatCurrency(saldoParcela))
    const [forma, setForma] = useState('Dinheiro')
    const [dataPagto, setDataPagto] = useState(getToday())
    const [estrategia, setEstrategia] = useState<'baixa_parcial' | 'somar_proxima'>(() => getDefaultPartialReceiptStrategy(hasNextInstallment))
    const [isAuthOpen, setIsAuthOpen] = useState(false)
    const [dadosParaEnviar, setDadosParaEnviar] = useState<any>(null)

    const valorOriginal = saldoParcela
    const valorPago = parseLocaleFloat(valorPagoStr)
    const { difference: diferenca, isPartial: isParcial } = getInstallmentReceiptPreview({ outstanding: valorOriginal, receivedAmount: valorPago })

    const handlePreConfirm = (e: React.FormEvent) => {
        e.preventDefault()
        setDadosParaEnviar({
            parcela_id: parcela.id,
            valor_pago_total: valorPago,
            forma_pagamento: forma,
            data_pagamento: dataPagto,
            estrategia: isParcial ? estrategia : 'quitacao_total'
        })
        setIsAuthOpen(true)
    }

    const handleAuthSuccess = (employee: Pick<Employee, 'id' | 'full_name'>) => {
        setIsAuthOpen(false)
        onConfirm({ ...dadosParaEnviar, employee_id: employee.id })
    }

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="bg-amber-950/30 px-6 py-4 border-b border-amber-500/20 flex justify-between items-center">
                    <h3 className="font-bold text-amber-500 flex items-center gap-2">
                        <Wallet className="h-5 w-5" /> Receber Parcela {parcela.numero_parcela}
                    </h3>
                    <button onClick={onClose} type="button" className="p-1 rounded hover:bg-white/10 transition-colors"><X className="h-5 w-5 text-amber-500" /></button>
                </div>
                <form onSubmit={handlePreConfirm} className="p-6 space-y-5">
                    <div className="space-y-1 text-center">
                        <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Valor da Parcela</p>
                        <p className="text-3xl font-black text-slate-700">R$ {formatCurrency(valorOriginal)}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Valor a Receber</label>
                            <input type="text" value={valorPagoStr} onChange={e => setValorPagoStr(e.target.value)} className="w-full rounded-lg border-gray-300 focus:ring-amber-500 font-bold text-lg text-right" />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Forma</label>
                            <select value={forma} onChange={e => setForma(e.target.value)} className="w-full rounded-lg border-gray-300 focus:ring-amber-500 h-[46px]">
                                <option>Dinheiro</option><option>PIX Remoto</option><option>PIX na maquininha</option><option>Cartão Débito</option><option>Cartão Crédito</option>
                            </select>
                        </div>
                    </div>
                    {isParcial && (
                        <div className="bg-red-50 p-4 rounded-xl border border-red-100 animate-in slide-in-from-top-2">
                            <div className="flex items-center gap-2 text-red-700 font-bold text-sm mb-3">
                                <AlertTriangle className="h-4 w-4" /><span>Diferença: R$ {formatCurrency(diferenca)}</span>
                            </div>
                            <div className="space-y-2">
                                <label className="flex items-start gap-3 cursor-pointer p-2 rounded hover:bg-red-100/50 transition-colors">
                                    <input type="radio" name="strat" checked={estrategia === 'baixa_parcial'} onChange={() => setEstrategia('baixa_parcial')} className="mt-1 text-red-600 focus:ring-red-500" />
                                    <div><span className="block text-sm font-bold text-gray-800">Baixa parcial</span><span className="block text-xs text-gray-500">Mantém o restante nesta parcela.</span></div>
                                </label>
                                <label className={`flex items-start gap-3 p-2 rounded transition-colors ${hasNextInstallment ? 'cursor-pointer hover:bg-red-100/50' : 'cursor-not-allowed opacity-50'}`}>
                                    <input type="radio" name="strat" disabled={!hasNextInstallment} checked={estrategia === 'somar_proxima'} onChange={() => setEstrategia('somar_proxima')} className="mt-1 text-red-600 focus:ring-red-500" />
                                    <div><span className="block text-sm font-bold text-gray-800">Jogar para a próxima</span><span className="block text-xs text-gray-500">Transfere o restante para a próxima cobrança.</span></div>
                                </label>
                            </div>
                        </div>
                    )}
                    <button type="submit" className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-xl shadow-md transition-transform active:scale-95">CONFIRMAR RECEBIMENTO</button>
                </form>
                {isAuthOpen && (<EmployeeAuthModal storeId={storeId} isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} onSuccess={handleAuthSuccess} title="Autorizar Baixa" description="Insira seu PIN." />)}
            </div>
        </div>
    )
}

export default function FinanciamentoBox({
    financiamento,
    vendaId,
    customerId,
    customer,
    storeId,
    employeeId,
    valorRestante,
    onFinanceAdded,
    disabled,
    isQuitado = false,
    isModal = false,
    whatsappReceiptEnabled = false,
    isHistoricalImport = false,
    receiptOperations = [],
    pagamentos = [],
}: FinanciamentoBoxProps) {

    const modules = useStoreModules()
    const formRef = useRef<HTMLFormElement>(null)

    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false)
    const [isCpfModalOpen, setIsCpfModalOpen] = useState(false)
    const [authedEmployee, setAuthedEmployee] = useState<Pick<Employee, 'id' | 'full_name'> | null>(null)
    const [selectedParcela, setSelectedParcela] = useState<FinanciamentoParcela | null>(null)
    const [parcelaAtalho, setParcelaAtalho] = useState<FinanciamentoParcela | null>(null)
    const [isParcelaSearchModalOpen, setIsParcelaSearchModalOpen] = useState(false)
    const [pixCharges, setPixCharges] = useState<Record<number, PixInstallmentCharge>>({})
    const [pixProvider, setPixProvider] = useState<'manual' | 'sicredi'>('manual')
    const [paymentChoiceParcela, setPaymentChoiceParcela] = useState<FinanciamentoParcela | null>(null)
    const [pixInstallment, setPixInstallment] = useState<FinanciamentoParcela | null>(null)
    const [sendingReceiptInstallmentId, setSendingReceiptInstallmentId] = useState<number | null>(null)
    const [sentReceiptInstallmentIds, setSentReceiptInstallmentIds] = useState<number[]>([])
    const [receiptToReverse, setReceiptToReverse] = useState<{
        installmentNumber: number
        operation: ReversibleReceiptOperation
    } | null>(null)

    const [isDeletedLocally, setIsDeletedLocally] = useState(false)
    const [isRenegotiating, setIsRenegotiating] = useState(false)

    const [valorFinanciadoStr, setValorFinanciadoStr] = useState('')
    const [qtdeParcelas, setQtdeParcelas] = useState(1)
    const [vencimentoPrimeira, setVencimentoPrimeira] = useState(getFirstDueMonth())
    const [parcelasGrid, setParcelasGrid] = useState<ParcelaGridItem[]>([])
    const [obs, setObs] = useState('')
    const [isCreatingCarne, setIsCreatingCarne] = useState(false)

    const initialState: CreateFinanciamentoResult = { success: false, message: '' }
    // NOTA: saveState removido pois usaremos chamada manual
    const [recebimentoState, dispatchRecebimento] = useFormState(receberParcela, { success: false, message: '' })

    const isFinanced = !!financiamento && !isDeletedLocally;
    const existeDivergencia = !isHistoricalImport && isFinanced && valorRestante > 0.01;
    const temParcelaPaga = financiamento?.financiamento_parcelas.some(p => p.status === 'Pago')
    const hasNextPendingInstallment = (parcela: FinanciamentoParcela) =>
        (financiamento?.financiamento_parcelas || []).some((candidate) =>
            candidate.numero_parcela > parcela.numero_parcela
            && String(candidate.status).toLowerCase() === 'pendente'
            && getInstallmentOutstanding(candidate) > 0.01
        )
    const recebimentosDoCarne = receiptOperations.filter((operation) => operation.state === 'completed' && !operation.reversed_at)
    const parcelasPorId = new Map((financiamento?.financiamento_parcelas || []).map((parcela) => [parcela.id, parcela]))
    const installmentIdsKey = (financiamento?.financiamento_parcelas || []).map((parcela) => parcela.id).join(',')
    const recebidoAntesPorParcela = new Map<number, number>()
    const recebimentosPorParcela = new Map<number, Array<{ valor: number; saldoAntes: number; data: string; forma: string; transferido: number }>>()
    for (const operation of [...recebimentosDoCarne].sort((a, b) => String(a.received_on).localeCompare(String(b.received_on)) || a.id - b.id)) {
        const origem = parcelasPorId.get(operation.origin_installment_id)
        if (!origem) continue
        const pagoAntes = recebidoAntesPorParcela.get(origem.id) || 0
        const snapshotOrigem = Array.isArray(operation.installments_before)
            ? operation.installments_before.find((item) => Number(item.id) === Number(origem.id))
            : undefined
        const saldoAntes = snapshotOrigem
            ? getInstallmentOutstanding(snapshotOrigem)
            : Math.max(0, getInstallmentChargeTotal(origem) - pagoAntes - Number(origem.valor_transferido_saida || 0))
        recebimentosPorParcela.set(origem.id, [...(recebimentosPorParcela.get(origem.id) || []), {
            valor: Number(operation.received_amount || 0),
            saldoAntes,
            data: operation.received_on,
            forma: operation.payment_method,
            transferido: Number(operation.transferred_amount || 0),
        }])
        for (const pagamento of pagamentos.filter((item) => Number(item.receipt_operation_id) === operation.id && item.parcela_id)) {
            const parcelaId = Number(pagamento.parcela_id)
            recebidoAntesPorParcela.set(parcelaId, (recebidoAntesPorParcela.get(parcelaId) || 0) + Number(pagamento.valor_pago || 0))
        }
    }
    const valorRecebidoCarne = (financiamento?.financiamento_parcelas || [])
        .reduce((total, parcela) => total + Number(parcela.valor_pago || 0), 0)

    useEffect(() => {
        if (isDeletedLocally) return;

        if (!isFinanced) {
            if (valorRestante > 0.01) {
                setValorFinanciadoStr(formatCurrency(valorRestante));
            }
        } else {
            setValorFinanciadoStr(formatCurrency(financiamento?.valor_total_financiado));
        }
    }, [valorRestante, isFinanced, financiamento, isDeletedLocally])

    useEffect(() => {
        let active = true
        const installmentIds = (financiamento?.financiamento_parcelas || []).map((parcela) => Number(parcela.id))
        if (!isFinanced || !installmentIds.length) {
            setPixCharges({})
            return () => { active = false }
        }

        void getPixProviderForStore(storeId).then((provider) => {
            if (!active) return
            setPixProvider(provider)
            if (provider !== 'sicredi') {
                setPixCharges({})
                return
            }
            return getPixChargesForInstallments(storeId, installmentIds)
                .then((charges) => {
                    if (active) setPixCharges(charges)
                })
                .catch(() => {
                    if (active) setPixCharges({})
                })
        })

        return () => { active = false }
    }, [financiamento?.id, installmentIdsKey, isFinanced, storeId])

    useEffect(() => {
        if (!financiamento && isDeletedLocally) {
            setIsDeletedLocally(false);
        }
    }, [financiamento, isDeletedLocally])

    useEffect(() => {
        if (recebimentoState.success) { setSelectedParcela(null); onFinanceAdded(); }
        else if (recebimentoState.message) { alert(recebimentoState.message); }
    }, [recebimentoState, onFinanceAdded])

    const handleCalcular = () => {
        const valorTotal = parseLocaleFloat(valorFinanciadoStr);
        if (valorTotal <= 0) return;
        const parteInteira = Math.floor(valorTotal);
        const centavos = valorTotal - parteInteira;
        const valorBaseInteiro = Math.floor(parteInteira / qtdeParcelas);
        const restoInteiro = parteInteira % qtdeParcelas;
        const novas: ParcelaGridItem[] = [];
        const [y, m, d] = vencimentoPrimeira.split('-').map(Number);
        const dataBase = new Date(y, m - 1, d, 12);
        for (let i = 0; i < qtdeParcelas; i++) {
            let val = valorBaseInteiro;
            if (i < restoInteiro) val += 1;
            if (i === 0) val += centavos;
            const dt = new Date(dataBase); dt.setMonth(dataBase.getMonth() + i);
            novas.push({ numero_parcela: i + 1, data_vencimento: dt.toISOString().split('T')[0], valor_parcela: parseFloat(val.toFixed(2)) });
        }
        setParcelasGrid(novas);
    }

    const handleParcelaChange = (index: number, novoValorStr: string) => {
        const novoValor = parseLocaleFloat(novoValorStr);
        const gridAtualizado = [...parcelasGrid];
        gridAtualizado[index] = { ...gridAtualizado[index], valor_parcela: novoValor };
        setParcelasGrid(gridAtualizado);
    };

    const handleResetCarne = () => {
        if (!financiamento) return

        const saldoParaRenegociar = financiamento.financiamento_parcelas
            .reduce((total, parcela) => total + getInstallmentOutstanding(parcela), 0)

        if (saldoParaRenegociar <= 0.01) {
            alert('Este carnê não possui saldo em aberto para renegociar.')
            return
        }
        if (!confirm(`Renegociar o saldo de R$ ${formatCurrency(saldoParaRenegociar)}? Os recebimentos já feitos serão preservados.`)) return

        resetFormularioCriacao(saldoParaRenegociar)
        setIsRenegotiating(true)
    }

    const resetFormularioCriacao = (valorSugerido?: number) => {
        const valorInicial = valorSugerido !== undefined ? valorSugerido : valorRestante;
        setValorFinanciadoStr(formatCurrency(valorInicial));
        setQtdeParcelas(1);
        setVencimentoPrimeira(getFirstDueMonth());
        setParcelasGrid([]);
        setObs('');
        setAuthedEmployee(null);
        setIsConfigModalOpen(false);
    }

    const handleAuthSuccess = (employee: Pick<Employee, 'id' | 'full_name'>) => {
        setAuthedEmployee(employee);
        setIsConfigModalOpen(false);
    }

    const handleConfirmRecebimento = (dados: any) => {
        const formData = new FormData();
        Object.keys(dados).forEach(key => formData.append(key, dados[key]));
        formData.append('venda_id', vendaId.toString());
        formData.append('store_id', storeId.toString());

        // Chamada direta para evitar complexidade
        receberParcela(null, formData).then(res => {
            if (res.success) {
                setSelectedParcela(null)
                onFinanceAdded()

                const paymentIds = Array.isArray((res as any).payment_ids)
                    ? (res as any).payment_ids.filter((id: unknown): id is number => typeof id === 'number')
                    : []
                if (paymentIds.length > 0) {
                    window.open(`/print/recibo/${paymentIds.join('-')}?t=${Date.now()}`, '_blank')
                }
            }
            else { alert(res.message); }
        });
    }

    const handleSendInstallmentReceipt = async (installmentId: number) => {
        if (sendingReceiptInstallmentId === installmentId) return

        setSendingReceiptInstallmentId(installmentId)
        try {
            const result = await sendInstallmentReceiptWhatsApp({
                storeId,
                installmentId,
            })

            if (!result.success) {
                toast.error(result.message)
                return
            }

            setSentReceiptInstallmentIds((current) =>
                current.includes(installmentId) ? current : [...current, installmentId]
            )
            toast.success('Recibo enviado em PDF pelo WhatsApp da loja.')
        } catch (error) {
            console.error('[FinanciamentoBox] Erro ao enviar recibo da parcela:', error)
            toast.error('Nao foi possivel enviar o recibo por WhatsApp.')
        } finally {
            setSendingReceiptInstallmentId(null)
        }
    }

    // Estilos
    const labelStyle = 'block text-[10px] font-bold text-slate-400 mb-0.5 uppercase tracking-wider';
    const inputStyle = 'block w-full rounded-md border border-white/10 bg-white/5 shadow-sm text-slate-200 h-9 text-xs px-2 focus:ring-1 focus:ring-amber-500/50 focus:outline-none disabled:bg-white/5 disabled:text-slate-500 placeholder:text-slate-600 transition-all';

    if (!modules.installments) {
        return null
    }

    const renderContent = () => (
        <>
            {isFinanced && !isRenegotiating ? (
                /* MODO VISUALIZAÇÃO */
                <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden shadow-lg backdrop-blur-sm">
                    <div className="bg-amber-500/5 px-4 py-3 border-b border-amber-500/10 flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-amber-500/20 rounded-lg text-amber-400 ring-1 ring-amber-500/30">
                                <ClipboardList className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-amber-400">Carnê Ativo</h3>
                            </div>
                        </div>
                        {!disabled && !isQuitado && !isHistoricalImport && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => window.open(`/print/promissoria/${financiamento.id}`, '_blank')}
                                    className="text-[10px] font-bold text-blue-400 hover:bg-blue-500/10 px-2 py-1 rounded border border-transparent hover:border-blue-500/20 transition-all flex items-center gap-1"
                                    title="Imprimir Compromisso de Pagamento"
                                >
                                    <Printer className="h-3 w-3" /> IMPRIMIR DUPLICATA
                                </button>
                                <button
                                    onClick={() => window.open(`/print/carne/${financiamento.id}`, '_blank')}
                                    className="text-[10px] font-bold text-amber-400 hover:bg-amber-500/10 px-2 py-1 rounded border border-transparent hover:border-amber-500/20 transition-all flex items-center gap-1"
                                    title="Imprimir Carnê de Pagamento"
                                >
                                    <Printer className="h-3 w-3" /> IMPRIMIR CARNÊ
                                </button>
                                <button
                                    onClick={handleResetCarne}
                                    className="text-[10px] font-bold text-red-400 hover:bg-red-500/10 px-2 py-1 rounded border border-transparent hover:border-red-500/20 transition-all flex items-center gap-1"
                                >
                                    <RefreshCw className="h-3 w-3" />
                                    RENEGOCIAR
                                </button>
                            </div>
                        )}
                    </div>

                    {existeDivergencia && (
                        <div className="bg-orange-900/20 p-2 text-[10px] text-orange-300 border-b border-orange-500/20 flex items-center gap-2 justify-center font-bold">
                            <AlertTriangle className="h-3 w-3" />
                            Há R$ {formatCurrency(valorRestante)} não financiados.
                            <button onClick={handleResetCarne} className="underline hover:text-orange-200">Renegociar?</button>
                        </div>
                    )}

                    <div className="divide-y divide-white/5 overflow-x-auto">
                        <div className="grid min-w-[820px] grid-cols-[42px_minmax(160px,1fr)_145px_190px_230px] gap-2 bg-white/[0.02] px-3 py-2 text-[9px] font-bold uppercase tracking-wide text-slate-500">
                            <span>Parc.</span><span>Valor parcela</span><span>A receber</span><span>Recebido</span><span></span>
                        </div>
                        {[...(financiamento?.financiamento_parcelas || [])]
                            .sort((a, b) => {
                                const dateOrder = String(a.data_vencimento || '').localeCompare(String(b.data_vencimento || ''))
                                return dateOrder || (a.id - b.id)
                            })
                            .map((p) => {
                            const isPago = p.status === 'Pago';
                            const valorPago = Number(p.valor_pago || 0)
                            const valorRenegociado = Number(p.valor_renegociado_saida || 0)
                            const valorRestante = getInstallmentOutstanding(p)
                            const isParcialmentePaga = !isPago && valorPago > 0.01
                            const recibosDaParcela = recebimentosPorParcela.get(p.id) || []
                            const valorAReceber = recibosDaParcela[0]?.saldoAntes ?? valorRestante
                            const isAtrasado = !isPago && new Date(p.data_vencimento) < new Date(new Date().setHours(0, 0, 0, 0));
                            const pixCharge = pixCharges[Number(p.id)]
                            const pixActionLabel = getPixInstallmentActionLabel(pixCharge, valorRestante)
                            const shouldOpenPixCharge = shouldOpenExistingPixInstallmentCharge(pixCharge, valorRestante)
                            return (
                                <div key={p.id} className={`grid min-w-[820px] grid-cols-[42px_minmax(160px,1fr)_145px_190px_230px] items-center gap-2 p-3 hover:bg-white/5 transition-colors ${isPago ? 'bg-green-500/5' : ''}`}>
                                    <div className="contents">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${isPago ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                                            isAtrasado ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                                                'bg-white/5 text-slate-400 border-white/10'
                                            }`}>
                                            {p.numero_parcela}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-200">R$ {formatCurrency(p.valor_parcela)}</p>
                                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                                <Calendar className="h-3 w-3" /> {formatDate(p.data_vencimento)}
                                            </p>
                                            {isParcialmentePaga ? (
                                                <p className="text-[10px] text-amber-300/90 mt-0.5">
                                                    Pago {formatCurrency(valorPago)} · Falta {formatCurrency(valorRestante)}
                                                </p>
                                            ) : null}
                                            {valorRenegociado > 0.01 ? (
                                                <p className="text-[10px] text-amber-300/90 mt-0.5">
                                                    R$ {formatCurrency(valorRenegociado)} transferidos para renegociação
                                                </p>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className={`text-xs font-bold ${valorAReceber > 0.01 ? 'text-amber-300' : 'text-slate-500'}`}>
                                        R$ {formatCurrency(valorAReceber)}
                                        {isParcialmentePaga ? <p className="mt-0.5 text-[9px] font-medium text-slate-500">Atual: {formatCurrency(valorRestante)}</p> : null}
                                    </div>
                                    <div className="space-y-1">
                                        {recibosDaParcela.length ? recibosDaParcela.map((recibo, index) => (
                                            <div key={`${recibo.data}-${index}`}>
                                                <p className="text-xs font-bold text-emerald-400">R$ {formatCurrency(recibo.valor)}</p>
                                                <p className="text-[9px] text-slate-500">{formatDate(recibo.data)} · {recibo.forma}</p>
                                                {recibo.transferido > 0.01 ? <p className="text-[9px] font-bold text-amber-300">R$ {formatCurrency(recibo.transferido)} transferidos para a próxima</p> : null}
                                            </div>
                                        )) : <span className="text-slate-600">—</span>}
                                    </div>
                                    <div className="flex justify-end">
                                        {isPago ? (
                                            <div className="flex items-center justify-end gap-2">
                                                {whatsappReceiptEnabled ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => void handleSendInstallmentReceipt(p.id)}
                                                        disabled={sendingReceiptInstallmentId === p.id}
                                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-300 text-[10px] font-bold border border-emerald-500/20 hover:bg-emerald-500/20 transition-all disabled:opacity-50"
                                                    >
                                                        {sendingReceiptInstallmentId === p.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin" />
                                                        ) : (
                                                            <MessageCircle className="h-3 w-3" />
                                                        )}
                                                        {sentReceiptInstallmentIds.includes(p.id) ? 'ENVIADO' : 'RECIBO'}
                                                    </button>
                                                ) : null}
                                                {p.reversible_receipt_operation ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setReceiptToReverse({
                                                            installmentNumber: p.numero_parcela,
                                                            operation: p.reversible_receipt_operation as ReversibleReceiptOperation,
                                                        })}
                                                        className="inline-flex items-center gap-1 rounded-lg border border-rose-500/20 bg-rose-500/10 px-2 py-1 text-[10px] font-bold text-rose-300 transition-all hover:bg-rose-500/20"
                                                        title="Reverter esta operacao de recebimento"
                                                    >
                                                        <RotateCcw className="h-3 w-3" /> REVERTER
                                                    </button>
                                                ) : null}
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={(e) => {
                                                    e.stopPropagation()
                                                    if (shouldOpenPixCharge) {
                                                        setPixInstallment(p)
                                                    } else if (pixProvider === 'sicredi') {
                                                        setPaymentChoiceParcela(p)
                                                    } else {
                                                        setParcelaAtalho(p)
                                                        setIsParcelaSearchModalOpen(true)
                                                    }
                                                }}
                                                disabled={disabled || isQuitado}
                                                className="px-3 py-1.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-lg hover:bg-amber-500/30 border border-amber-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-amber-900/20"
                                            >
                                                {pixActionLabel.toUpperCase()}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                /* MODO CRIAÇÃO */
                <div className={isModal ? "bg-transparent p-3 h-full flex flex-col" : "relative bg-gradient-to-br from-amber-600/20 to-orange-700/20 backdrop-blur-md p-3 rounded-xl shadow-lg border border-amber-500/20"}>
                    {isRenegotiating ? (
                        <div className="mb-2 flex items-center justify-between border-b border-amber-500/20 pb-2 text-xs font-bold text-amber-300">
                            <span>Renegociar carnê</span>
                            <button type="button" onClick={() => setIsRenegotiating(false)} className="text-[10px] text-slate-400 hover:text-slate-200">
                                CANCELAR
                            </button>
                        </div>
                    ) : null}
                    {!isModal && (
                        <div className="flex items-center gap-1.5 mb-2 border-b border-amber-500/20 pb-2">
                            <div className="p-1 bg-amber-500/20 rounded-md text-amber-400">
                                <Calculator className="h-4 w-4" />
                            </div>
                            <h3 className="text-xs font-bold text-amber-300">Gerar Carnê</h3>
                        </div>
                    )}

                    {isQuitado && !isDeletedLocally && (
                        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-2xl text-center p-4">
                            <div className="bg-green-50 border border-green-200 p-2 rounded-full mb-2"><CheckCircle2 className="h-5 w-5 text-green-600" /></div>
                            <p className="text-green-800 font-bold text-xs">Venda Quitada. Sem saldo para financiar.</p>
                        </div>
                    )}

                    {/* CRIAÇÃO MANUAL (SEM FORMULÁRIO HTML) */}
                    {(() => {
                        // Cálculo da soma das parcelas editadas
                        const somaParcelasEditadas = parcelasGrid.reduce((acc, p) => acc + p.valor_parcela, 0);
                        const valorTotalEsperado = parseLocaleFloat(valorFinanciadoStr);
                        const diferencaSoma = Math.abs(somaParcelasEditadas - valorTotalEsperado);
                        const somaValida = diferencaSoma < 0.02; // Tolerância de 2 centavos

                        const handleCriarCarneManual = async (empIdOverride?: number) => {
                            if (isCreatingCarne) return;

                            if (parcelasGrid.length === 0) {
                                alert("Por favor, clique em CALCULAR antes de gerar o carnê.");
                                return;
                            }

                            if (!somaValida) {
                                alert("A soma das parcelas não corresponde ao valor total. Ajuste os valores.");
                                return;
                            }

                            // Prepara parcelas customizadas para enviar ao backend
                            const parcelasCustomizadas = parcelasGrid.map(p => ({
                                numero_parcela: p.numero_parcela,
                                data_vencimento: p.data_vencimento,
                                valor_parcela: p.valor_parcela
                            }));

                            const payload = {
                                venda_id: vendaId,
                                customer_id: customerId,
                                employee_id: empIdOverride ?? authedEmployee?.id ?? employeeId,
                                valor_total: parseLocaleFloat(valorFinanciadoStr),
                                qtd_parcelas: qtdeParcelas,
                                data_primeiro_vencimento: vencimentoPrimeira,
                                obs: obs,
                                parcelas_customizadas: parcelasCustomizadas
                            };

                            setIsCreatingCarne(true);

                            try {
                                const resultado = isRenegotiating && financiamento
                                    ? await renegociarFinanciamentoLoja({
                                        financiamento_id: financiamento.id,
                                        venda_id: vendaId,
                                        store_id: storeId,
                                        employee_id: payload.employee_id,
                                        parcelas: parcelasCustomizadas,
                                    })
                                    : await saveFinanciamentoLoja(null, payload);

                                if (!resultado.success) {
                                    alert(resultado.message || "Erro desconhecido ao criar carnê.");
                                    return;
                                }

                                setParcelasGrid([]);
                                setIsDeletedLocally(false);
                                setIsRenegotiating(false);

                                // Atualiza e fecha o modal antes de abrir a impressão em outra aba.
                                // Assim, a venda já estará consistente se o saldo for zerado.
                                await onFinanceAdded();

                                if (!isRenegotiating && resultado.data?.id) {
                                    window.open(`/print/promissoria/${resultado.data.id}`, '_blank');
                                }
                            } catch (error) {
                                console.error('[FinanciamentoBox] Erro inesperado ao gerar carnê:', error);
                                alert('O carnê pode ter sido criado, mas a tela não conseguiu atualizar. Volte à venda e confira antes de tentar novamente.');
                            } finally {
                                setIsCreatingCarne(false);
                            }
                        };

                        // AUTO-TRIGGER: Assim que autenticar, já chama a criação
                        const handleAuthSuccessAuto = (employee: Pick<Employee, 'id' | 'full_name'>) => {
                            setAuthedEmployee(employee);
                            setIsConfigModalOpen(false);
                            void handleCriarCarneManual(employee.id);
                        }

                        return (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className={labelStyle}>Valor Total (R$)</label>
                                        <input type="text" value={valorFinanciadoStr} onChange={e => { setValorFinanciadoStr(e.target.value); setParcelasGrid([]); }} className={`${inputStyle} font-bold text-amber-400 text-right`} />
                                    </div>
                                    <div>
                                        <label className={labelStyle}>1º Vencimento</label>
                                        <input type="date" value={vencimentoPrimeira} onChange={e => { setVencimentoPrimeira(e.target.value); setParcelasGrid([]); }} className={`${inputStyle} text-[10px]`} />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 items-end">
                                    <div>
                                        <label className={labelStyle}>Qtd. Parcelas</label>
                                        <select value={qtdeParcelas} onChange={e => { setQtdeParcelas(parseInt(e.target.value)); setParcelasGrid([]); }} className={`${inputStyle} font-bold cursor-pointer text-slate-300`}>
                                            {[...Array(24)].map((_, i) => <option key={i} value={i + 1} className="bg-slate-800">{i + 1}x</option>)}
                                        </select>
                                    </div>
                                    <button type="button" onClick={handleCalcular} className="h-8 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold uppercase rounded shadow-lg shadow-amber-900/30 transition-colors flex items-center justify-center gap-1">
                                        <RefreshCw className="h-3 w-3" /> Calcular
                                    </button>
                                </div>

                                {parcelasGrid.length > 0 && (
                                    <div className="bg-white/5 rounded-lg p-2 max-h-[180px] overflow-y-auto custom-scrollbar border border-white/10 shadow-inner mt-2">
                                        <table className="w-full text-[10px]">
                                            <thead>
                                                <tr className="text-amber-400 border-b border-white/10">
                                                    <th className="text-left py-1 px-1">#</th>
                                                    <th className="text-left py-1 px-1">Vencimento</th>
                                                    <th className="text-right py-1 px-1">Valor</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-white/5">
                                                {parcelasGrid.map((p, i) => (
                                                    <tr key={i} className="hover:bg-white/5 transition-colors">
                                                        <td className="py-1 px-1 font-bold text-slate-400">{p.numero_parcela}x</td>
                                                        <td className="py-1 px-1 text-slate-300">{formatDate(p.data_vencimento)}</td>
                                                        <td className="py-1 px-1">
                                                            <ParcelaInput valor={p.valor_parcela} index={i} onChange={handleParcelaChange} />
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            {/* Linha de totais com validação visual */}
                                            <tfoot>
                                                <tr className={`border-t-2 font-bold ${somaValida ? 'border-green-500/30 bg-green-500/10' : 'border-red-500/30 bg-red-500/10'}`}>
                                                    <td colSpan={2} className={`py-1.5 px-1 text-right ${somaValida ? 'text-green-400' : 'text-red-400'}`}>
                                                        {somaValida ? '✓ Total:' : '✗ Soma inválida:'}
                                                    </td>
                                                    <td className={`py-1.5 px-1 text-right ${somaValida ? 'text-green-400' : 'text-red-400'}`}>
                                                        R$ {formatCurrency(somaParcelasEditadas)}
                                                    </td>
                                                </tr>
                                                {!somaValida && (
                                                    <tr className="bg-red-500/10">
                                                        <td colSpan={3} className="py-1 px-1 text-center text-red-400 text-[9px]">
                                                            Esperado: R$ {formatCurrency(valorTotalEsperado)} | Diferença: R$ {formatCurrency(diferencaSoma)}
                                                        </td>
                                                    </tr>
                                                )}
                                            </tfoot>
                                        </table>
                                    </div>
                                )}

                                <div>
                                    <label className={labelStyle}>Observação</label>
                                    <input type="text" value={obs} onChange={(e) => setObs(e.target.value)} className={inputStyle} placeholder="Opcional..." />
                                </div>

                                <div className="pt-2">
                                    {/* MODAL DE AUTH AGORA CHAMA O AUTO-TRIGGER */}
                                    {isConfigModalOpen && <EmployeeAuthModal storeId={storeId} isOpen={isConfigModalOpen} onClose={() => setIsConfigModalOpen(false)} onSuccess={handleAuthSuccessAuto} title="Autorizar Emissão" description="PIN do responsável." />}

                                    {!authedEmployee ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const customerDocument = customer?.person_type === 'PJ' ? customer?.cnpj : customer?.cpf
                                                if (!customerDocument || !customer?.fone_movel) {
                                                    setIsCpfModalOpen(true)
                                                    return
                                                }
                                                setIsConfigModalOpen(true)
                                            }}
                                            disabled={parcelasGrid.length === 0 || !somaValida || isCreatingCarne}
                                            className={`w-full h-9 font-bold text-xs rounded-lg shadow-lg shadow-amber-900/20 transition-all active:scale-95 flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide ${somaValida ? 'bg-amber-500 hover:bg-amber-600 text-white border border-amber-500/50' : 'bg-white/10 text-slate-500 border border-white/10'}`}
                                        >
                                            {isCreatingCarne ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} {isCreatingCarne ? 'GERANDO...' : 'GERAR CARNÊ'}
                                        </button>
                                    ) : (
                                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2">
                                            <div className="flex-1 bg-white/20 text-white text-[10px] font-bold px-2 py-1.5 rounded flex items-center justify-between border border-white/30">
                                                <span>{authedEmployee.full_name}</span>
                                                <button type="button" onClick={() => setAuthedEmployee(null)}><X className="h-3 w-3" /></button>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => handleCriarCarneManual()}
                                                disabled={isCreatingCarne}
                                                className="h-9 px-4 bg-green-500 hover:bg-green-600 text-white font-bold text-xs rounded-lg shadow-md transition-all active:scale-95 flex items-center gap-1"
                                            >
                                                {isCreatingCarne ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                                                {isCreatingCarne ? 'GERANDO...' : 'CONFIRMAR'}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })()}
                </div>
            )}
        </>
    );

    if (isModal) {
        return (
            <div className="h-full overflow-y-auto custom-scrollbar pr-1 pt-2">
                {renderContent()}

                {selectedParcela && <RecebimentoModal parcela={selectedParcela} hasNextInstallment={hasNextPendingInstallment(selectedParcela)} storeId={storeId} onClose={() => setSelectedParcela(null)} onConfirm={handleConfirmRecebimento} />}

                <ParcelaSearchModal
                    isOpen={isParcelaSearchModalOpen}
                    onClose={() => {
                        setIsParcelaSearchModalOpen(false)
                        setParcelaAtalho(null)
                    }}
                    storeId={storeId}
                    initialParcela={parcelaAtalho ? { ...parcelaAtalho, venda_id: vendaId, has_next_installment: (financiamento?.financiamento_parcelas || []).some((candidate) => candidate.numero_parcela > parcelaAtalho.numero_parcela && String(candidate.status).toLowerCase() === 'pendente') } : undefined}
                    onPaymentRecorded={onFinanceAdded}
                />

                {isCpfModalOpen && customer && (
                    <UpdateCpfModal
                        isOpen={isCpfModalOpen}
                        onClose={() => setIsCpfModalOpen(false)}
                        onSuccess={() => {
                            setIsCpfModalOpen(false);
                            setIsConfigModalOpen(true);
                        }}
                        customerId={customer.id}
                        customerName={customer.full_name}
                        currentCpf={customer.person_type === 'PJ' ? customer.cnpj || '' : customer.cpf || ''}
                        personType={customer.person_type === 'PJ' ? 'PJ' : 'PF'}
                        currentPhone={customer.fone_movel || customer.phone || ''}
                    />
                )}
            </div>
        );
    }

    return (
        <>
            {isFinanced && !isRenegotiating ? (
                <CollapsibleBox
                    title="Carnê da Loja"
                    icon={<Wallet className="h-5 w-5 text-amber-400" />}
                    color="amber"
                    defaultOpen={true}
                    badge="EMITIDO"
                    subtitle={
                        <div className="absolute inset-0 pointer-events-none hidden md:flex items-center">
                            {/* This inner div mimics the column spacing of the Pagamentos table above */}
                            <div className="w-full flex px-2" style={{ marginRight: '16px' }}>
                                {/* 2/12 (Data) + 3/12 (Forma) = 5/12 offset */}
                                <div className="w-5/12"></div>
                                {/* 3/12 (Responsável) */}
                                <div className="w-3/12 font-bold text-xs text-slate-500 uppercase truncate pl-1" title={(financiamento as any)?.employee?.full_name}>
                                    {(financiamento as any)?.employee?.full_name?.split(' ')[0] || ''}
                                </div>
                                {/* 2/12 (Valor) */}
                                <div className="w-2/12 flex flex-col items-end gap-1">
                                    <span className="font-bold text-xs text-amber-400">{formatCurrency(financiamento?.valor_total_financiado)}</span>
                                    {valorRecebidoCarne > 0.01 ? <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-300">Recebido {formatCurrency(valorRecebidoCarne)}</span> : null}
                                </div>
                                {/* 1/12 + 1/12 (Parc + Actions) */}
                                <div className="w-2/12"></div>
                            </div>
                        </div>
                    }
                >
                    {renderContent()}
                </CollapsibleBox>
            ) : renderContent()}


            {selectedParcela && <RecebimentoModal parcela={selectedParcela} hasNextInstallment={hasNextPendingInstallment(selectedParcela)} storeId={storeId} onClose={() => setSelectedParcela(null)} onConfirm={handleConfirmRecebimento} />}

            {paymentChoiceParcela && (
                <PaymentChoiceModal
                    parcela={paymentChoiceParcela}
                    onClose={() => setPaymentChoiceParcela(null)}
                    onManual={() => {
                        setParcelaAtalho(paymentChoiceParcela)
                        setPaymentChoiceParcela(null)
                        setIsParcelaSearchModalOpen(true)
                    }}
                    onPix={() => {
                        setPixInstallment(paymentChoiceParcela)
                        setPaymentChoiceParcela(null)
                    }}
                />
            )}

            {pixInstallment && (
                <PixInstallmentChargeModal
                    isOpen={Boolean(pixInstallment)}
                    storeId={storeId}
                    installment={{ ...(pixInstallment as any), venda_id: vendaId }}
                    hasNextInstallment={hasNextPendingInstallment(pixInstallment)}
                    initialCharge={pixCharges[Number(pixInstallment.id)]}
                    onClose={() => setPixInstallment(null)}
                    onChargeChanged={(charge) => setPixCharges((current) => {
                        const next = { ...current }
                        if (charge) next[Number(pixInstallment.id)] = charge
                        else delete next[Number(pixInstallment.id)]
                        return next
                    })}
                    onSettled={onFinanceAdded}
                />
            )}

            {receiptToReverse && (
                <ReverseInstallmentReceiptModal
                    storeId={storeId}
                    installmentNumber={receiptToReverse.installmentNumber}
                    operation={receiptToReverse.operation}
                    onClose={() => setReceiptToReverse(null)}
                    onReversed={onFinanceAdded}
                />
            )}

            <ParcelaSearchModal
                isOpen={isParcelaSearchModalOpen}
                onClose={() => {
                    setIsParcelaSearchModalOpen(false)
                    setParcelaAtalho(null)
                }}
                storeId={storeId}
                initialParcela={parcelaAtalho ? { ...parcelaAtalho, venda_id: vendaId, has_next_installment: hasNextPendingInstallment(parcelaAtalho) } : undefined}
                onPaymentRecorded={onFinanceAdded}
            />

            {isCpfModalOpen && customer && (
                <UpdateCpfModal
                    isOpen={isCpfModalOpen}
                    onClose={() => setIsCpfModalOpen(false)}
                    onSuccess={() => {
                        setIsCpfModalOpen(false);
                        setIsConfigModalOpen(true);
                    }}
                    customerId={customer.id}
                    customerName={customer.full_name}
                    currentCpf={customer.person_type === 'PJ' ? customer.cnpj || '' : customer.cpf || ''}
                    personType={customer.person_type === 'PJ' ? 'PJ' : 'PF'}
                    currentPhone={customer.fone_movel || customer.phone || ''}
                />
            )}
        </>
    )
}
