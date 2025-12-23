'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ShoppingBag, DollarSign, FileText, User,
    Briefcase, Wrench, ArrowLeft
} from 'lucide-react'

import AddItemForm from '@/components/vendas/AddItemForm'
import AddPagamentoForm from '@/components/vendas/AddPagamentoForm'
import FinanciamentoBox from '@/components/vendas/FinanciamentoBox'
import ListaItens from '@/components/vendas/ListaItens'
import ListaPagamentos from '@/components/vendas/ListaPagamentos'
import ResumoFinanceiro from '@/components/vendas/ResumoFinanceiro'
import VendaActions from '@/components/vendas/VendaActions'
import ListaOS from '@/components/vendas/ListaOS'
import ReceiptSelectionModal from '@/components/modals/ReceiptSelectionModal'

import { Database } from '@/lib/database.types'

type Venda = Database['public']['Tables']['vendas']['Row']
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type ServiceOrder = Database['public']['Tables']['service_orders']['Row']
type Pagamento = Database['public']['Tables']['pagamentos']['Row']
type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row']

interface VendaInterfaceProps {
    venda: Venda
    customer: Customer | null
    employee: Employee | null
    vendaItens: VendaItem[]
    serviceOrders: ServiceOrder[]
    pagamentos: Pagamento[]
    financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
    // Lentes, Armações, Tratamentos não são usados diretamente aqui, mas vêm da props
    lentes: any[]
    armacoes: any[]
    tratamentos: any[]
    isQuitado: boolean
    isVendaFechadaOuCancelada: boolean
    onDataReload: () => Promise<void>
}

export default function VendaInterface({
    venda, customer, employee, vendaItens, serviceOrders,
    pagamentos, financiamento, isQuitado, isVendaFechadaOuCancelada, onDataReload
}: VendaInterfaceProps) {

    const router = useRouter()
    const [activeTab, setActiveTab] = useState<'produtos' | 'pagamento' | 'carne'>('produtos')

    // NOVO: Estado para controlar o modal de impressão
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

    const vendedorNome = employee?.full_name || 'N/A'
    const employeeIdFinanceiro = employee?.id || 0

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">

            {/* 1. CABEÇALHO SUPERIOR */}
            <div className="bg-white border-b border-gray-200 px-4 py-1.5 flex items-center shrink-0 shadow-sm z-30 h-10">
                <div className="flex items-center gap-2">
                    <button onClick={() => router.back()} className="p-1 hover:bg-gray-100 rounded-full text-gray-500 transition-colors" title="Voltar">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="h-5 w-px bg-gray-300 mx-1"></div>
                    <h1 className="text-xs font-bold text-gray-800 whitespace-nowrap uppercase tracking-wide flex items-center gap-2">
                        Venda #{venda.id}
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-black border ${venda.status === 'Fechada' ? 'bg-green-50 text-green-700 border-green-200' :
                                venda.status === 'Cancelada' ? 'bg-red-50 text-red-700 border-red-200' :
                                    'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                            {venda.status}
                        </span>
                    </h1>
                </div>

                <div className="ml-auto flex items-center gap-3 text-[10px]">
                    <div className="flex items-center gap-1 font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        <User className="h-3 w-3" />
                        <span className="truncate max-w-[200px]">{customer?.full_name}</span>
                    </div>
                    <div className="hidden sm:flex items-center gap-1 text-gray-500">
                        <Briefcase className="h-3 w-3" />
                        <span className="truncate max-w-[120px]">{vendedorNome}</span>
                    </div>
                </div>
            </div>

            {/* 2. MIOLO (ÁREA DE SCROLL) */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3 p-2 overflow-hidden min-h-0 bg-gray-100">

                {/* COLUNA ESQUERDA (50%) - INPUTS */}
                <div className="flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden h-full">

                    {/* Abas */}
                    <div className="flex border-b border-gray-200 bg-white flex-shrink-0 h-10">
                        <button
                            onClick={() => setActiveTab('produtos')}
                            className={`flex-1 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all border-b-2 
                        ${activeTab === 'produtos'
                                    ? 'bg-blue-50 text-blue-700 border-blue-600'
                                    : 'bg-white text-blue-300 border-transparent hover:bg-blue-50 hover:text-blue-600'
                                }`}
                        >
                            <ShoppingBag className="h-4 w-4" /> Produtos
                        </button>
                        <button
                            onClick={() => setActiveTab('pagamento')}
                            className={`flex-1 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all border-b-2 
                        ${activeTab === 'pagamento'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-600'
                                    : 'bg-white text-emerald-300 border-transparent hover:bg-emerald-50 hover:text-emerald-600'
                                }`}
                        >
                            <DollarSign className="h-4 w-4" /> Pagamento
                        </button>
                        <button
                            onClick={() => setActiveTab('carne')}
                            className={`flex-1 text-xs font-bold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all border-b-2 
                        ${activeTab === 'carne'
                                    ? 'bg-amber-50 text-amber-700 border-amber-600'
                                    : 'bg-white text-amber-300 border-transparent hover:bg-amber-50 hover:text-amber-600'
                                }`}
                        >
                            <FileText className="h-4 w-4" /> Carnê
                        </button>
                    </div>

                    {/* Conteúdo da Aba */}
                    <div className="flex-1 p-3 overflow-y-auto custom-scrollbar relative">
                        {activeTab === 'produtos' && (
                            <div className="space-y-3">
                                {!isVendaFechadaOuCancelada ? (
                                    <AddItemForm vendaId={venda.id} storeId={venda.store_id} onItemAdded={onDataReload} disabled={isVendaFechadaOuCancelada} />
                                ) : (
                                    <div className="p-4 bg-gray-50 rounded-lg text-center text-gray-400 font-bold border-2 border-dashed border-gray-200 text-xs">
                                        Venda Fechada. Edição Bloqueada.
                                    </div>
                                )}
                                <div className="p-2 bg-blue-50 rounded border border-blue-100 text-blue-800 text-[10px] flex gap-2 items-center justify-center">
                                    <ShoppingBag className="h-3 w-3" />
                                    <span>Itens adicionados aparecem na lista à direita ➔</span>
                                </div>
                            </div>
                        )}

                        {activeTab === 'pagamento' && (
                            <div className="space-y-3">
                                <div className="bg-white p-1 rounded-lg border border-gray-100 shadow-sm">
                                    <AddPagamentoForm vendaId={venda.id} customerId={venda.customer_id} storeId={venda.store_id} valorRestante={venda.valor_restante ?? 0} onPaymentAdded={onDataReload} disabled={isVendaFechadaOuCancelada} isQuitado={isQuitado} />
                                </div>
                            </div>
                        )}

                        {activeTab === 'carne' && (
                            <div className="space-y-3">
                                <FinanciamentoBox financiamento={financiamento} vendaId={venda.id} customerId={venda.customer_id} storeId={venda.store_id} employeeId={employeeIdFinanceiro} valorRestante={venda.valor_restante ?? 0} onFinanceAdded={onDataReload} disabled={isVendaFechadaOuCancelada} isQuitado={isQuitado} />
                            </div>
                        )}
                    </div>
                </div>

                {/* COLUNA DIREITA (50%) - LISTAS */}
                <div className="flex flex-col gap-2 h-full overflow-hidden">
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1 pb-2">

                        {/* Lista de Itens */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200 flex justify-between items-center">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Itens ({vendaItens.length})</span>
                            </div>
                            <div className="p-1">
                                <ListaItens itens={vendaItens} vendaId={venda.id} storeId={venda.store_id} onItemDeleted={onDataReload} disabled={isVendaFechadaOuCancelada} />
                            </div>
                        </div>

                        {/* Extrato Pagamentos */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                            <div className="bg-gray-50 px-3 py-1.5 border-b border-gray-200">
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Extrato Financeiro</span>
                            </div>
                            <div className="p-1">
                                <ListaPagamentos pagamentos={pagamentos} vendaId={venda.id} storeId={venda.store_id} onDelete={onDataReload} disabled={isVendaFechadaOuCancelada} />
                            </div>
                        </div>

                        {/* Resumo OS */}
                        <div className="bg-purple-50 rounded-xl border border-purple-100 p-2">
                            <div className="flex justify-between items-center mb-1">
                                <h4 className="text-[10px] font-bold text-purple-800 uppercase flex items-center gap-1">
                                    <Wrench className="h-3 w-3" /> Ordens de Serviço
                                </h4>
                            </div>
                            <div className="mt-1">
                                <ListaOS vendaId={venda.id} storeId={venda.store_id} serviceOrders={serviceOrders} employeeId={employee?.id.toString() || '0'} employeeName={vendedorNome} disabled={isVendaFechadaOuCancelada} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 3. RODAPÉ FIXO (TOTALIZADORES) */}
            <div className="bg-white border-t border-gray-300 shadow-[0_-2px_10px_rgba(0,0,0,0.1)] shrink-0 z-50 px-4 py-2 flex items-center justify-between h-16">
                <div className="flex-1">
                    <ResumoFinanceiro
                        venda={venda}
                        onUpdate={onDataReload}
                        disabled={isVendaFechadaOuCancelada}
                    />
                </div>
                <div className="pl-4 border-l border-gray-200 ml-4">
                    <VendaActions
                        venda={venda}
                        vendaItens={vendaItens}
                        onStatusChange={onDataReload}
                        isVendaFechada={isVendaFechadaOuCancelada}
                        // NOVO: Passamos a função de abrir o modal
                        onPrint={() => setIsPrintModalOpen(true)}
                    />
                </div>
            </div>

            {/* 4. MODAL DE SELEÇÃO DE RECIBO (NOVO) */}
            <ReceiptSelectionModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                pagamentos={pagamentos}
                onReload={onDataReload} // <--- ESSA LINHA FAZ A MÁGICA
            />

        </div>
    )
}