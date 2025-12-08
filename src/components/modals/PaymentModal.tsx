'use client'

import { useState, useTransition } from 'react'
import { X, CheckCircle, Printer, Plus, CreditCard, FileText, Loader2, Search } from 'lucide-react'
import FinanciamentoBox from '@/components/vendas/FinanciamentoBox'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal' // <--- 1. Importação do Modal de Auth
import { 
    finalizarVendaExpress, 
    criarVendaParcialCarnê,
    searchCustomersByName, 
    type CustomerSearchResult 
} from '@/lib/actions/vendas.actions'
import { type CartItem } from '@/components/vendas/PdvExpressInterface'
import { Database } from '@/lib/database.types'

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
    
    const [activeTab, setActiveTab] = useState<'pagamento' | 'carne'>('pagamento')
    const [isCompleted, setIsCompleted] = useState(false)
    const [vendaIdGerada, setVendaIdGerada] = useState<number | null>(null)
    
    // Estados do Pagamento
    const [valorPago, setValorPago] = useState(formatCurrency(valorTotal))
    const [formaPagamento, setFormaPagamento] = useState('PIX')
    const [parcelas, setParcelas] = useState(1)
    const [cpfNota, setCpfNota] = useState('')
    
    const [isProcessing, startProcess] = useTransition()
    const [isAuthOpen, setIsAuthOpen] = useState(false) // <--- 2. Estado do Modal de Auth

    // Estados do Carnê
    const [customerQuery, setCustomerQuery] = useState('')
    const [customersFound, setCustomersFound] = useState<CustomerSearchResult[]>([])
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
    const [vendaParcialId, setVendaParcialId] = useState<number | null>(null) 

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
    const handleAuthSuccess = (authedEmployee: Pick<Employee, 'id' | 'full_name'>) => {
        setIsAuthOpen(false)

        const valorLimpo = valorPago.replace(/[^\d,]/g, '').replace(',', '.')
        const valorNumerico = parseFloat(valorLimpo) || 0

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
        if(cpfNota) formData.append('cpf_nota', cpfNota)

        startProcess(async () => {
            const res = await finalizarVendaExpress(formData)
            if (res.success) {
                setVendaIdGerada(res.vendaId!)
                setIsCompleted(true)
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

    if (!isOpen) return null

    // Estilos
    const labelStyle = 'block text-[10px] font-bold text-white/90 uppercase mb-1 tracking-wider'
    const inputStyle = 'block w-full rounded-lg border-0 bg-white shadow-sm text-gray-800 h-10 text-sm px-3 focus:ring-2 focus:ring-white/50 focus:outline-none font-bold transition-all'

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative">
                    
                    {!isCompleted && (
                        <button onClick={onClose} className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full z-20">
                            <X className="h-5 w-5 text-gray-400" />
                        </button>
                    )}

                    <div className="flex-1 overflow-y-auto p-6 bg-white">
                        {isCompleted ? (
                            <div className="h-full flex flex-col items-center justify-center space-y-6 py-10 animate-in zoom-in duration-300">
                                <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-4 shadow-inner">
                                    <CheckCircle className="w-12 h-12 text-green-600" />
                                </div>
                                <div className="text-center space-y-2">
                                    <h3 className="text-3xl font-black text-slate-800">Venda Realizada!</h3>
                                    <p className="text-slate-500 font-medium">Venda #{vendaIdGerada} registrada com sucesso.</p>
                                </div>
                                <div className="flex gap-4 mt-8 w-full max-w-md">
                                    <button 
    // AQUI ESTÁ A MUDANÇA: Usa o ID da venda gerada
    onClick={() => window.open(`/print/recibo/${vendaIdGerada}`, '_blank')} 
    className="flex-1 py-4 rounded-xl border-2 border-slate-200 text-slate-600 font-bold hover:border-blue-500 hover:text-blue-600 transition-all flex flex-col items-center gap-2"
>
    <Printer className="h-6 w-6" /> Imprimir Recibo
</button>
                                    <button onClick={onReset} className="flex-1 py-4 rounded-xl bg-green-600 text-white font-bold hover:bg-green-700 shadow-lg transition-all flex flex-col items-center gap-2">
                                        <Plus className="h-6 w-6" /> Nova Venda
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col h-full gap-6">
                                
                                <div className="flex flex-col items-center justify-center space-y-1 pt-2">
                                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Total a Pagar</p>
                                    <p className="text-5xl font-black text-slate-800 tracking-tight">R$ {formatCurrency(valorTotal)}</p>
                                </div>

                                {!vendaParcialId && (
                                    <div className="flex p-1 bg-gray-100 rounded-xl mx-auto w-full max-w-md">
                                        <button onClick={() => setActiveTab('pagamento')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === 'pagamento' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-400'}`}>
                                            <CreditCard className="h-4 w-4" /> Pagamento
                                        </button>
                                        <button onClick={() => setActiveTab('carne')} className={`flex-1 py-2.5 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${activeTab === 'carne' ? 'bg-white text-amber-600 shadow-sm' : 'text-gray-400'}`}>
                                            <FileText className="h-4 w-4" /> Carnê
                                        </button>
                                    </div>
                                )}

                                <div className="flex-1">
                                    {activeTab === 'pagamento' ? (
                                        // CARD VERDE (PAGAMENTO)
                                        <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-6 rounded-2xl shadow-lg shadow-emerald-100 text-white animate-in slide-in-from-bottom-4">
                                            <div className="space-y-4">
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={labelStyle}>Valor Pago (R$)</label>
                                                        <input type="text" value={valorPago} onChange={e => setValorPago(e.target.value)} className={`${inputStyle} text-right text-lg text-emerald-800`} />
                                                    </div>
                                                    <div>
                                                        <label className={labelStyle}>Forma</label>
                                                        <select value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className={`${inputStyle} cursor-pointer text-emerald-900`}>
                                                            <option>PIX</option><option>Dinheiro</option><option>Cartão Débito</option><option>Cartão Crédito</option>
                                                        </select>
                                                    </div>
                                                </div>
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div>
                                                        <label className={labelStyle}>Parcelas</label>
                                                        <select value={parcelas} onChange={e => setParcelas(parseInt(e.target.value))} className={`${inputStyle} cursor-pointer text-emerald-900`}>
                                                            {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>{i+1}x</option>)}
                                                        </select>
                                                    </div>
                                                    <div>
                                                        <label className={labelStyle}>Data</label>
                                                        <div className={`${inputStyle} flex items-center text-emerald-900`}>
                                                            {new Date().toLocaleDateString('pt-BR')}
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div>
                                                    <label className={labelStyle}>Observação</label>
                                                    <input type="text" value={cpfNota} onChange={(e) => setCpfNota(e.target.value)} placeholder="Ex: CPF na nota..." className={`${inputStyle} text-emerald-900`} />
                                                </div>

                                                <button 
                                                    onClick={handlePrePayment} // <--- 5. Mudança aqui: Chama a pré-validação
                                                    disabled={isProcessing} 
                                                    className="w-full mt-4 bg-white text-emerald-700 hover:bg-emerald-50 font-bold py-3.5 rounded-xl shadow-md flex justify-center gap-2 transition-all active:scale-95"
                                                >
                                                    {isProcessing ? <Loader2 className="animate-spin"/> : 'AUTORIZAR E PAGAR'}
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        // CARD CARNÊ
                                        <div>
                                            {!vendaParcialId ? (
                                                <div className="bg-gradient-to-br from-amber-500 to-orange-600 p-6 rounded-2xl shadow-lg text-white text-center space-y-4 animate-in slide-in-from-bottom-4">
                                                    <p className="font-bold text-white/90 text-sm">Identifique o cliente para emitir o carnê</p>
                                                    <div className="flex gap-2">
                                                        <input type="text" value={customerQuery} onChange={e => setCustomerQuery(e.target.value)} placeholder="Digite nome..." className="flex-1 rounded-lg border-0 h-10 px-3 text-gray-800 font-bold" />
                                                        <button onClick={handleSearchCustomer} className="bg-white/20 hover:bg-white/30 text-white px-4 rounded-lg font-bold"><Search className="h-5 w-5"/></button>
                                                    </div>
                                                    
                                                    {customersFound.length > 0 && (
                                                        <div className="bg-white rounded-xl overflow-hidden text-left max-h-40 overflow-y-auto custom-scrollbar">
                                                            {customersFound.map(c => (
                                                                <div key={c.id} onClick={() => handleSelectCustomer(c)} className="p-3 hover:bg-orange-50 cursor-pointer border-b border-gray-100 last:border-0 text-gray-800">
                                                                    <p className="font-bold text-sm">{c.full_name}</p>
                                                                    <p className="text-[10px] text-gray-400">CPF: {c.cpf || 'N/A'}</p>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                    {isProcessing && <Loader2 className="animate-spin mx-auto text-white"/>}
                                                </div>
                                            ) : (
                                                <FinanciamentoBox 
                                                    financiamento={null}
                                                    vendaId={vendaParcialId}
                                                    customerId={selectedCustomer!.id}
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
                    title="Autorizar Pagamento" 
                    description="Insira seu PIN para confirmar o recebimento." 
                />
            )}
        </>
    )
}