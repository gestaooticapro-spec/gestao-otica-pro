'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ShoppingBag, DollarSign, FileText, User,
    Briefcase, Wrench, ArrowLeft, Printer, Plus, X
} from 'lucide-react'

import AddItemFormExperimental from '@/components/vendas/AddItemFormExperimental'
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
    lentes: any[]
    armacoes: any[]
    tratamentos: any[]
    isQuitado: boolean
    isVendaFechadaOuCancelada: boolean
    onDataReload: () => Promise<void>
}

// Componente de Modal Simples Local
function SimpleModal({ isOpen, onClose, title, children, headerClass = "bg-gray-50 text-gray-800" }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode, headerClass?: string }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className={`${headerClass} px-4 py-3 border-b border-gray-200 flex justify-between items-center`}>
                    <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wide">
                        {title}
                    </h3>
                    <button onClick={onClose} type="button" className="p-1 rounded-full hover:bg-white/20 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-4 max-h-[80vh] overflow-y-auto custom-scrollbar">
                    {children}
                </div>
            </div>
        </div>
    );
}

// Tipos de Tema
type SectionTheme = 'blue' | 'emerald' | 'amber' | 'slate';

// Configuração de Cores por Tema
const themeStyles: Record<SectionTheme, { headerBg: string; borderColor: string; titleColor: string; iconColor: string }> = {
    blue: {
        headerBg: 'bg-blue-50',
        borderColor: 'border-blue-200',
        titleColor: 'text-blue-800',
        iconColor: 'text-blue-600',
    },
    emerald: {
        headerBg: 'bg-emerald-50',
        borderColor: 'border-emerald-200',
        titleColor: 'text-emerald-800',
        iconColor: 'text-emerald-600',
    },
    amber: {
        headerBg: 'bg-amber-50',
        borderColor: 'border-amber-200',
        titleColor: 'text-amber-800',
        iconColor: 'text-amber-600',
    },
    slate: {
        headerBg: 'bg-slate-50',
        borderColor: 'border-slate-200',
        titleColor: 'text-slate-800',
        iconColor: 'text-slate-600',
    }
};

// Componente de Seção (Quadro)
function SectionCard({
    title,
    count,
    icon: Icon,
    onAdd,
    children,
    actionLabel = "Novo",
    theme = 'slate'
}: {
    title: string,
    count?: number,
    icon: any,
    onAdd?: () => void,
    children: React.ReactNode,
    actionLabel?: string,
    theme?: SectionTheme
}) {
    const styles = themeStyles[theme];

    return (
        <div className={`bg-white rounded-xl shadow-sm border ${styles.borderColor} overflow-hidden flex flex-col transition-all hover:shadow-md`}>
            <div className={`${styles.headerBg} px-4 py-2 border-b ${styles.borderColor} flex justify-between items-center h-10 shrink-0`}>
                <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${styles.iconColor}`} />
                    <span className={`text-xs font-bold ${styles.titleColor} uppercase tracking-wide`}>{title} {count !== undefined && `(${count})`}</span>
                </div>
                {onAdd && (
                    // Botão sempre VERDE conforme solicitado
                    <button onClick={onAdd} className="flex items-center gap-1 bg-green-600 border border-green-700 text-white px-2 py-1 rounded text-[10px] font-bold uppercase transition-all shadow-sm active:scale-95 hover:bg-green-700">
                        <Plus className="h-3 w-3" /> {actionLabel}
                    </button>
                )}
            </div>
            <div className="p-0 flex-1 min-h-0 overflow-hidden flex flex-col">
                {children}
            </div>
        </div>
    )
}

export default function VendaInterfaceExperimental({
    venda, customer, employee, vendaItens, serviceOrders,
    pagamentos, financiamento, isQuitado, isVendaFechadaOuCancelada, onDataReload
}: VendaInterfaceProps) {

    const router = useRouter()
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

    // Estado para controlar qual modal está aberto
    const [activeModal, setActiveModal] = useState<'none' | 'produto' | 'pagamento' | 'parcelamento'>('none')

    const vendedorNome = employee?.full_name || 'N/A'
    const employeeIdFinanceiro = employee?.id || 0

    const closeModal = () => setActiveModal('none')

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gradient-to-br from-slate-200 to-slate-300 overflow-hidden font-sans">

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

            {/* 2. MIOLO (ÁREA DE SCROLL ÚNICA) */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-3">
                <div className="max-w-4xl mx-auto w-full space-y-3">

                    {/* QUADRO 1: PRODUTOS */}
                    <SectionCard
                        title="Produtos"
                        count={vendaItens.length}
                        icon={ShoppingBag}
                        onAdd={() => setActiveModal('produto')}
                        actionLabel="Novo Produto"
                        theme="blue"
                    >
                        <div className="p-1">
                            <ListaItens itens={vendaItens} vendaId={venda.id} storeId={venda.store_id} onItemDeleted={onDataReload} disabled={isVendaFechadaOuCancelada} />
                        </div>
                    </SectionCard>

                    {/* QUADRO 2: PAGAMENTOS */}
                    <SectionCard
                        title="Pagamentos"
                        count={pagamentos.length}
                        icon={DollarSign}
                        onAdd={() => setActiveModal('pagamento')}
                        actionLabel="Novo Pagamento"
                        theme="emerald"
                    >
                        <div className="p-1">
                            <ListaPagamentos pagamentos={pagamentos} vendaId={venda.id} storeId={venda.store_id} onDelete={onDataReload} disabled={isVendaFechadaOuCancelada} />
                        </div>
                    </SectionCard>

                    {/* QUADRO 3: PARCELAMENTO (CARNÊ) */}
                    <SectionCard
                        title="Parcelamento"
                        icon={FileText}
                        onAdd={!financiamento ? () => setActiveModal('parcelamento') : undefined} // Só mostra botão se não tiver financiamento
                        actionLabel="Novo Parcelamento"
                        theme="amber"
                    >
                        <div className="p-2">
                            {financiamento ? (
                                <FinanciamentoBox
                                    financiamento={financiamento}
                                    vendaId={venda.id}
                                    customerId={venda.customer_id}
                                    storeId={venda.store_id}
                                    employeeId={employeeIdFinanceiro}
                                    valorRestante={venda.valor_restante ?? 0}
                                    onFinanceAdded={onDataReload}
                                    disabled={isVendaFechadaOuCancelada}
                                    isQuitado={isQuitado}
                                />
                            ) : (
                                <div className="text-center py-4 text-gray-400 text-xs italic border-2 border-dashed border-gray-100 rounded-lg">
                                    Nenhum parcelamento registrado. Clique em "Novo Parcelamento" para criar.
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    {/* QUADRO 4: PROTOCOLO (OS) */}
                    <SectionCard
                        title="Protocolo (OS)"
                        count={serviceOrders.length}
                        icon={Wrench}
                        onAdd={() => router.push(`/dashboard/loja/${venda.store_id}/vendas/${venda.id}/os?employee_id=${employee?.id}&employee_name=${employee?.full_name}`)}
                        actionLabel="Nova OS"
                        theme="slate"
                    >
                        <div className="p-2">
                            <ListaOS
                                vendaId={venda.id}
                                storeId={venda.store_id}
                                serviceOrders={serviceOrders}
                                employeeId={employee?.id.toString() || '0'}
                                employeeName={vendedorNome}
                                disabled={isVendaFechadaOuCancelada}
                                hideHeader={true}
                            />
                        </div>
                    </SectionCard>

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
                        onPrint={() => setIsPrintModalOpen(true)}
                    />
                </div>
            </div>

            {/* --- MODAIS --- */}

            {/* Modal de Produto */}
            <SimpleModal
                isOpen={activeModal === 'produto'}
                onClose={closeModal}
                title="Adicionar Produto"
                headerClass="bg-blue-600 text-white"
            >
                <AddItemFormExperimental
                    vendaId={venda.id}
                    storeId={venda.store_id}
                    onItemAdded={async () => { await onDataReload(); closeModal(); }}
                    disabled={isVendaFechadaOuCancelada}
                />
            </SimpleModal>

            {/* Modal de Pagamento */}
            <SimpleModal
                isOpen={activeModal === 'pagamento'}
                onClose={closeModal}
                title="Registrar Pagamento"
                headerClass="bg-emerald-600 text-white"
            >
                <AddPagamentoForm
                    vendaId={venda.id}
                    customerId={venda.customer_id}
                    storeId={venda.store_id}
                    valorRestante={venda.valor_restante ?? 0}
                    onPaymentAdded={async () => { await onDataReload(); closeModal(); }}
                    disabled={isVendaFechadaOuCancelada}
                    isQuitado={isQuitado}
                    isModal={true}
                />
            </SimpleModal>

            {/* Modal de Parcelamento */}
            <SimpleModal
                isOpen={activeModal === 'parcelamento'}
                onClose={closeModal}
                title="Gerar Parcelamento"
                headerClass="bg-amber-600 text-white"
            >
                <FinanciamentoBox
                    financiamento={financiamento}
                    vendaId={venda.id}
                    customerId={venda.customer_id}
                    storeId={venda.store_id}
                    employeeId={employeeIdFinanceiro}
                    valorRestante={venda.valor_restante ?? 0}
                    onFinanceAdded={async () => { await onDataReload(); closeModal(); }}
                    disabled={isVendaFechadaOuCancelada}
                    isQuitado={isQuitado}
                    isModal={true}
                />
            </SimpleModal>

            {/* Modal de Impressão (Já existente) */}
            <ReceiptSelectionModal
                isOpen={isPrintModalOpen}
                onClose={() => setIsPrintModalOpen(false)}
                pagamentos={pagamentos}
                onReload={onDataReload}
            />

        </div>
    )
}
