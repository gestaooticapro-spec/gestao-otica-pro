'use client'

import { useEffect, useState, useTransition } from 'react'
import { X, CheckCircle, Printer, Plus, CreditCard, FileText, Loader2, Search, QrCode } from 'lucide-react'
import FinanciamentoBox from '@/components/vendas/FinanciamentoBox'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import FiscalEmissionModal from '@/components/modals/FiscalEmissionModal'
import {
    finalizarVendaExpress,
    criarVendaExpressPixPendente,
    descartarVendaExpressPixCancelado,
    criarVendaParcialCarnê,
    searchCustomersByName,
    markPaymentsAsPrinted,
    type CustomerSearchResult
} from '@/lib/actions/vendas.actions'
import { getSaleData } from '@/lib/actions/fiscal-db.actions'
import { type CartItem } from '@/components/vendas/PdvExpressInterface'
import { Database } from '@/lib/database.types'
import { useStoreModules } from '@/lib/contexts/StoreModulesContext'
import { getPixProviderForStore } from '@/lib/actions/pix-installment.actions'
import { createPixSaleChargeWithExpressAuthorization } from '@/lib/actions/pix-sale.actions'
import PixSaleChargeModal from '@/components/modals/PixSaleChargeModal'

// Tipo para o funcionário autenticado
type Employee = Database['public']['Tables']['employees']['Row']

const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const getToday = () => new Date().toISOString().split('T')[0]

interface PaymentModalProps {
    isOpen: boolean
    onClose: () => void
    onReset: () => void
    storeId: number
    employeeId: number // ID vindo da seleção anterior (pode ser sobrescrito pela auth)
    valorTotal: number
    cartItems: CartItem[]
}

export default function PaymentModal({
    isOpen,
    onClose,
    onReset,
    storeId,
    employeeId,
    valorTotal,
    cartItems
}: PaymentModalProps) {

    const modules = useStoreModules()
    const [activeTab, setActiveTab] = useState<'pagamento' | 'carne'>('pagamento')
    const [isCompleted, setIsCompleted] = useState(false)
    const [vendaIdGerada, setVendaIdGerada] = useState<number | null>(null)
    const [pagamentoIdGerado, setPagamentoIdGerado] = useState<number | null>(null)
    const [isPrinting, setIsPrinting] = useState(false)

    // Estados do Pagamento
    const [valorPago, setValorPago] = useState(formatCurrency(valorTotal))
    const [formaPagamento, setFormaPagamento] = useState('PIX Remoto')
    const [pixProvider, setPixProvider] = useState<'manual' | 'sicredi'>('manual')
    const [parcelas, setParcelas] = useState(1)
    const [cpfNota, setCpfNota] = useState('')

    const [isProcessing, startProcess] = useTransition()
    const [isAuthOpen, setIsAuthOpen] = useState(false) // <--- 2. Estado do Modal de Auth
    const [isPixSaleModalOpen, setIsPixSaleModalOpen] = useState(false)

    // Estados do Carnê
    const [customerQuery, setCustomerQuery] = useState('')
    const [customersFound, setCustomersFound] = useState<CustomerSearchResult[]>([])
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
    const [vendaParcialId, setVendaParcialId] = useState<number | null>(null)

    // Estados da NFC-e
    const [isFiscalModalOpen, setIsFiscalModalOpen] = useState(false)
    const [vendaCompleta, setVendaCompleta] = useState<any>(null)
    const [vendaItens, setVendaItens] = useState<any[]>([])
    const [isLoadingFiscal, setIsLoadingFiscal] = useState(false)
    const [nfceEmitida, setNfceEmitida] = useState(false)

    useEffect(() => {
        if (!modules.installments && activeTab === 'carne') {
            setActiveTab('pagamento')
        }
    }, [activeTab, modules.installments])

    useEffect(() => {
        void getPixProviderForStore(storeId).then(setPixProvider)
    }, [storeId])

    const triggerPrint = async (pagamentoId: number): Promise<boolean> => {
        try {
            window.open(`/print/recibo/${pagamentoId}?t=${Date.now()}`, '_blank')
            await markPaymentsAsPrinted([pagamentoId])
            return true
        } catch (err) {
            console.error('Erro na impressão:', err)
            alert('Erro ao enviar para impressora. Tente reimprimir.')
            return false
        }
    }

    // 3. Validação antes de abrir a senha
    const handlePrePayment = () => {
        const valorLimpo = valorPago.replace(/[^\d,]/g, '').replace(',', '.')
        const valorNumerico = parseFloat(valorLimpo) || 0

        if (valorNumerico <= 0) {
            alert("Valor inválido.")
            return
        }
        // Se passou na validação, abre a senha
        setIsAuthOpen(true)
    }

    // 4. Executa o pagamento APÓS a senha correta
    const handleAuthSuccess = (authedEmployee: Pick<Employee, 'id' | 'full_name'> & { authorization_token?: string }) => {
        setIsAuthOpen(false)

        const valorLimpo = valorPago.replace(/[^\d,]/g, '').replace(',', '.')
        const valorNumerico = parseFloat(valorLimpo) || 0

        if (formaPagamento === 'Pix Sicredi') {
            const token = authedEmployee.authorization_token
            if (!token) { alert('Nao foi possivel autorizar o Pix Sicredi.'); return }
            startProcess(async () => {
                const pendingSale = await criarVendaExpressPixPendente({ storeId, amount: valorNumerico, items: cartItems, authorizationToken: token })
                if (!pendingSale.success) { alert(pendingSale.message); return }
                const pendingVendaId = pendingSale.vendaId
                if (!pendingVendaId) { alert('Nao foi possivel identificar a venda expressa.'); return }
                const charge = await createPixSaleChargeWithExpressAuthorization({ storeId, vendaId: pendingVendaId, amount: valorNumerico, authorizationToken: token })
                if (!charge.success) { alert(charge.message); return }
                setVendaIdGerada(pendingVendaId)
                setIsPixSaleModalOpen(true)
            })
            return
        }

        const formData = new FormData()
        formData.append('store_id', storeId.toString())

        // AQUI ESTÁ A LIGAÇÃO: Usamos o ID de quem digitou a senha [cite: 1502]
        formData.append('employee_id', authedEmployee.id.toString())

        formData.append('itens', JSON.stringify(cartItems))

        const pgtoData = {
            valor: valorNumerico,
            forma: formaPagamento,
            parcelas: parcelas,
            data: getToday()
        }
        formData.append('pagamento', JSON.stringify(pgtoData))
        if (cpfNota) formData.append('cpf_nota', cpfNota)

        startProcess(async () => {
            const res = await finalizarVendaExpress(formData)
            if (res.success) {
                setVendaIdGerada(res.vendaId!)
                setPagamentoIdGerado(res.pagamentoId ?? null)
                setIsCompleted(true)
                if (res.pagamentoId) {
                    setIsPrinting(true)
                    triggerPrint(res.pagamentoId).finally(() => setIsPrinting(false))
                }
            } else {
                alert(res.message)
            }
        })
    }

    const handleSearchCustomer = async () => {
        if (customerQuery.length < 2) return
        const res = await searchCustomersByName(customerQuery, storeId)
        if (res.success && res.data) setCustomersFound(res.data)
    }

    const handleSelectCustomer = (cust: CustomerSearchResult) => {
        setSelectedCustomer(cust)
        startProcess(async () => {
            const formData = new FormData()
            formData.append('store_id', storeId.toString())
            formData.append('employee_id', employeeId.toString())
            formData.append('customer_id', cust.id.toString())
            formData.append('itens', JSON.stringify(cartItems))

            const res = await criarVendaParcialCarnê(formData)
            if (res.success) {
                setVendaParcialId(res.vendaId!)
            } else {
                alert("Erro: " + res.message)
                setSelectedCustomer(null)
            }
        })
    }

    const handleOpenFiscalModal = async () => {
        if (!vendaIdGerada) return
        setIsLoadingFiscal(true)
        const venda = await getSaleData(vendaIdGerada)
        if (venda) {
            setVendaCompleta(venda)
            setVendaItens(venda.venda_itens || [])
            setIsFiscalModalOpen(true)
        } else {
            alert("Não foi possível carregar os dados da venda.")
        }
        setIsLoadingFiscal(false)
    }

    const handleFiscalSuccess = async (_environment: 'production' | 'homologation') => {
        setIsFiscalModalOpen(false)
        setVendaCompleta(null)
        setVendaItens([])
        setNfceEmitida(true)
    }

    if (!isOpen) return null

    // Estilos
    const labelStyle = 'block text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-[0.1em]'
    const inputStyle = 'block w-full rounded-xl border border-white/10 bg-white/5 text-white h-11 text-sm px-4 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 focus:outline-none font-bold transition-all placeholder:font-normal placeholder:text-slate-500 backdrop-blur-md'

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
                <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 w-full max-w-2xl rounded-[2rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">

                    {!isCompleted && (
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-full transition-colors z-20">
                            <X className="h-5 w-5" />
                        </button>
                    )}

                    <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                        {isCompleted ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-6 py-10 animate-in zoom-in duration-300">
                                <div className="w-24 h-24 bg-emerald-500/20 rounded-[2rem] border border-emerald-500/20 flex items-center justify-center mb-4 shadow-[0_0_30px_rgba(16,185,129,0.2)]">
                                    {isPrinting ? <Loader2 className="w-12 h-12 text-emerald-400 animate-spin" /> : <CheckCircle className="w-12 h-12 text-emerald-400" />}
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-3xl font-black text-white tracking-tight">Venda Realizada!</h3>
                                    <p className="text-slate-400 font-bold tracking-wide">
                                        {isPrinting ? 'Enviando recibo para impressora...' : `Venda #${vendaIdGerada} registrada com sucesso.`}
                                    </p>
                                </div>
                                <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full max-w-md">
                                    {modules.fiscal && <button
                                        onClick={handleOpenFiscalModal}
                                        disabled={isLoadingFiscal || nfceEmitida}
                                        className={`flex-1 py-4 rounded-xl border font-bold transition-all flex flex-col items-center gap-2 disabled:cursor-not-allowed ${
                                            nfceEmitida
                                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                                                : 'border-white/10 bg-white/5 hover:bg-white/10 text-white disabled:opacity-50'
                                        }`}
                                    >
                                        {isLoadingFiscal ? <Loader2 className="h-6 w-6 animate-spin text-blue-400" /> : nfceEmitida ? <CheckCircle className="h-6 w-6 text-emerald-400" /> : <FileText className="h-6 w-6 text-blue-400" />}
                                        {nfceEmitida ? 'NFC-e Emitida ✓' : 'Emitir NFC-e'}
                                    </button>}
                                    <button onClick={onReset} className="flex-1 py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-emerald-950 shadow-emerald-500/20 shadow-lg font-black tracking-widest uppercase transition-all flex flex-col items-center gap-2">
                                        <Plus className="h-6 w-6" /> Nova Venda (Sair)
                                    </button>
                                </div>
                                {pagamentoIdGerado && (
                                    <button
                                        onClick={() => { setIsPrinting(true); triggerPrint(pagamentoIdGerado).finally(() => setIsPrinting(false)) }}
                                        disabled={isPrinting}
                                        className="text-slate-500 hover:text-slate-300 font-bold text-sm flex items-center gap-2 transition-colors disabled:opacity-50"
                                    >
                                        <Printer className="h-4 w-4" /> Reimprimir Recibo
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col h-full gap-6">

                                <div className="flex flex-col items-center justify-center space-y-2 pt-2 pb-4 border-b border-white/5">
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Total do Investimento</p>
                                    <p className="text-5xl md:text-6xl font-black text-white tracking-tighter drop-shadow-2xl">{formatCurrency(valorTotal)}</p>
                                </div>

                                {!vendaParcialId && (
                                    <div className="flex p-1 bg-white/5 border border-white/10 rounded-2xl mx-auto w-full max-w-md backdrop-blur-md">
                                        <button onClick={() => setActiveTab('pagamento')} className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === 'pagamento' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                                            <CreditCard className="h-4 w-4" /> Pagamento
                                        </button>
                                        {modules.installments && <button onClick={() => setActiveTab('carne')} className={`flex-1 py-3 text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 transition-all ${activeTab === 'carne' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/20 shadow-lg' : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'}`}>
                                            <FileText className="h-4 w-4" /> Carnê
                                        </button>}
                                    </div>
                                )}

                                <div className="flex-1 min-h-0">
                                    {activeTab === 'pagamento' ? (
                                        // CARD VERDE (PAGAMENTO)
                                        <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl relative overflow-hidden animate-in slide-in-from-bottom-4">
                                            {/* Glow decorativo */}
                                            <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 blur-[80px] rounded-full pointer-events-none" />

                                            <div className="space-y-5 relative z-10">
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                    <div>
                                                        <label className={labelStyle}>Valor Pago (R$)</label>
                                                        <input type="text" value={valorPago} onChange={e => setValorPago(e.target.value)} className={`${inputStyle} text-right text-lg text-emerald-400 focus:ring-emerald-500/50 focus:border-emerald-500/50`} />
                                                    </div>
                                                    <div>
                                                        <label className={labelStyle}>Forma</label>
                                                        <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className={`${inputStyle} cursor-pointer appearance-none`}>
                                                            <option className="bg-slate-900 text-white">PIX Remoto</option>{pixProvider === 'sicredi' && <option className="bg-slate-900 text-white">Pix Sicredi</option>}<option className="bg-slate-900 text-white">PIX na maquininha</option><option className="bg-slate-900 text-white">Dinheiro</option><option className="bg-slate-900 text-white">Cartão Débito</option><option className="bg-slate-900 text-white">Cartão Crédito</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                {formaPagamento !== 'Pix Sicredi' && <>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                    <div>
                                                        <label className={labelStyle}>Parcelas</label>
                                                        <select value={parcelas} onChange={e => setParcelas(parseInt(e.target.value))} className={`${inputStyle} cursor-pointer appearance-none`}>
                                                            {[...Array(12)].map((_, i) => <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">{i + 1}x</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className={labelStyle}>Data</label>
                                                        <div className={`${inputStyle} flex items-center text-white/80 cursor-not-allowed opacity-70`}>
                                                            {new Date().toLocaleDateString('pt-BR')}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div>
                                                    <label className={labelStyle}>Observação / CPF</label>
                                                    <input type="text" value={cpfNota} onChange={(e) => setCpfNota(e.target.value)} placeholder="Ex: CPF na nota..." className={inputStyle} />
                                                </div>
                                                </>}

                                                {formaPagamento === 'Pix Sicredi' && <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">O QR Code será gerado após a autorização por PIN. Enquanto ele estiver pendente, cancele a cobrança para alterar esta venda.</div>}

                                                <button
                                                    onClick={handlePrePayment}
                                                    disabled={isProcessing}
                                                    className="w-full mt-6 bg-emerald-500 hover:bg-emerald-400 text-emerald-950 font-black tracking-widest uppercase py-4 rounded-[1.25rem] shadow-emerald-500/20 hover:shadow-emerald-500/40 shadow-xl flex justify-center gap-3 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {isProcessing ? <Loader2 className="animate-spin h-5 w-5" /> : (
                                                        <>
                                                            <span>{formaPagamento === 'Pix Sicredi' ? 'Gerar Pix da venda' : 'Confirmar Pagamento'}</span>
                                                            {formaPagamento === 'Pix Sicredi' ? <QrCode className="h-5 w-5" /> : <CheckCircle className="h-5 w-5" />}
                                                        </>
                                                    )}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        // CARD CARNÊ
                                        <div>
                                            {!vendaParcialId ? (
                                                <div className="bg-white/5 border border-white/10 p-6 md:p-8 rounded-[2rem] shadow-2xl relative overflow-hidden text-center space-y-6 animate-in slide-in-from-bottom-4">
                                                    <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 blur-[80px] rounded-full pointer-events-none" />

                                                    <div className="relative z-10">
                                                        <p className="font-black text-slate-300 text-sm uppercase tracking-widest mb-4">Identifique o cliente para o carnê</p>
                                                        <div className="flex gap-3">
                                                            <input type="text" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="Digite o nome..." className={`${inputStyle} flex-1`} />
                                                            <button onClick={handleSearchCustomer} className="bg-white/10 hover:bg-white/20 text-white px-5 rounded-xl border border-white/10 transition-colors flex items-center justify-center">
                                                                <Search className="h-5 w-5" />
                                                            </button>
                                                        </div>

                                                        {customersFound.length > 0 && (
                                                            <div className="mt-4 bg-slate-900/80 border border-white/10 backdrop-blur-md rounded-2xl overflow-hidden text-left max-h-48 overflow-y-auto custom-scrollbar">
                                                                {customersFound.map(c => (
                                                                    <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-4 hover:bg-white/5 cursor-pointer border-b border-white/5 last:border-0 transition-colors group">
                                                                        <p className="font-bold text-slate-200 group-hover:text-white text-sm">{c.full_name}</p>
                                                                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">CPF: {c.cpf || 'N/A'}</p>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                        {isProcessing && <Loader2 className="animate-spin mt-4 h-6 w-6 mx-auto text-amber-400" />}
                                                    </div>
                                                </div>
                                            ) : (
                                                <FinanciamentoBox
                                                    financiamento={null}
                                                    vendaId={vendaParcialId}
                                                    customerId={selectedCustomer!.id}
                                                    customer={null}
                                                    storeId={storeId}
                                                    employeeId={employeeId}
                                                    valorRestante={valorTotal}
                                                    onFinanceAdded={async () => { setIsCompleted(true); setVendaIdGerada(vendaParcialId) }}
                                                    disabled={false}
                                                    isModal={true}
                                                />
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 6. MODAL DE AUTH (PIN) */}
            {isAuthOpen && (
                <EmployeeAuthModal
                    storeId={storeId}
                    isOpen={isAuthOpen}
                    onClose={() => setIsAuthOpen(false)}
                    onSuccess={handleAuthSuccess}
                    title={formaPagamento === 'Pix Sicredi' ? 'Autorizar geração do Pix' : 'Autorizar Pagamento'}
                    description={formaPagamento === 'Pix Sicredi' ? 'Insira seu PIN para gerar o QR Code Sicredi.' : 'Insira seu PIN para confirmar o recebimento.'}
                    purpose={formaPagamento === 'Pix Sicredi' ? 'pix_charge_create' : undefined}
                    authorizationContext={formaPagamento === 'Pix Sicredi' ? `express:${(parseFloat(valorPago.replace(/[^\d,]/g, '').replace(',', '.')) || 0).toFixed(2)}` : undefined}
                />
            )}

            {vendaIdGerada && isPixSaleModalOpen && (
                <PixSaleChargeModal
                    isOpen={isPixSaleModalOpen}
                    storeId={storeId}
                    vendaId={vendaIdGerada}
                    amount={parseFloat(valorPago.replace(/[^\d,]/g, '').replace(',', '.')) || 0}
                    requireCancellationToClose
                    onClose={() => { setIsPixSaleModalOpen(false); if (!isCompleted) setVendaIdGerada(null) }}
                    onPendingChargeCancelled={async (charge) => {
                        const result = await descartarVendaExpressPixCancelado({ storeId, vendaId: vendaIdGerada, chargeId: charge.id })
                        if (!result.success) {
                            alert(result.message)
                            return false
                        }
                        return true
                    }}
                    onPaymentAdded={async (confirmedCharge) => {
                        setIsPixSaleModalOpen(false)
                        setPagamentoIdGerado(confirmedCharge?.settlementPagamentoId || null)
                        setIsCompleted(true)
                        if (confirmedCharge?.settlementPagamentoId) {
                            setIsPrinting(true)
                            triggerPrint(confirmedCharge.settlementPagamentoId).finally(() => setIsPrinting(false))
                        }
                    }}
                />
            )}

            {/* 7. MODAL FISCAL (NFC-e) */}
            {isFiscalModalOpen && vendaCompleta && (
                <FiscalEmissionModal
                    isOpen={isFiscalModalOpen}
                    onClose={() => { setIsFiscalModalOpen(false); setVendaCompleta(null); setVendaItens([]) }}
                    venda={vendaCompleta}
                    vendaItens={vendaItens}
                    customer={vendaCompleta.customers}
                    onSuccess={handleFiscalSuccess}
                />
            )}
        </>
    )
}
