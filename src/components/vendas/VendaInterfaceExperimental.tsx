'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    ShoppingBag, DollarSign, FileText, User,
    Briefcase, Wrench, ArrowLeft, Printer, Plus, X
} from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';

import AddItemFormExperimental from '@/components/vendas/AddItemFormExperimental'
import AddPagamentoForm from '@/components/vendas/AddPagamentoForm'
import FinanciamentoBox from '@/components/vendas/FinanciamentoBox'
import ListaItens from '@/components/vendas/ListaItens'
import ListaPagamentos from '@/components/vendas/ListaPagamentos'
import ResumoFinanceiro from '@/components/vendas/ResumoFinanceiro'
import VendaActions from '@/components/vendas/VendaActions'
import ListaOS from '@/components/vendas/ListaOS'
import { updateVendaExperimentalFields } from '@/lib/actions/vendas.actions'
import { toast } from 'sonner'
import ReceiptSelectionModal from '@/components/modals/ReceiptSelectionModal'
import UpdateCpfModal from '@/components/modals/UpdateCpfModal'

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
function SimpleModal({ isOpen, onClose, title, children, headerClass = "bg-white/5 text-slate-200" }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode, headerClass?: string }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200">
                <div className={`${headerClass} px-4 py-3 border-b border-white/10 flex justify-between items-center shadow-sm`}>
                    <h3 className="font-bold flex items-center gap-2 text-sm uppercase tracking-wide text-white">
                        {title}
                    </h3>
                    <button onClick={onClose} type="button" className="p-1 rounded-full hover:bg-white/10 text-slate-400 hover:text-white transition-colors">
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
type SectionTheme = 'blue' | 'orange' | 'slate' | 'rose' | 'green';

// Configuração de Cores por Tema (Dark Mode Glass)
const themeStyles: Record<SectionTheme, { headerBg: string; borderColor: string; titleColor: string; iconColor: string; iconBg: string }> = {
    blue: {
        headerBg: 'bg-blue-500/5',
        borderColor: 'border-blue-500/20',
        titleColor: 'text-blue-400',
        iconColor: 'text-blue-300',
        iconBg: 'bg-blue-500/20'
    },
    orange: {
        headerBg: 'bg-amber-500/5',
        borderColor: 'border-amber-500/20',
        titleColor: 'text-amber-400',
        iconColor: 'text-amber-300',
        iconBg: 'bg-amber-500/20'
    },
    green: {
        headerBg: 'bg-emerald-500/5',
        borderColor: 'border-emerald-500/20',
        titleColor: 'text-emerald-400',
        iconColor: 'text-emerald-300',
        iconBg: 'bg-emerald-500/20'
    },
    slate: {
        headerBg: 'bg-white/5',
        borderColor: 'border-white/10',
        titleColor: 'text-slate-300',
        iconColor: 'text-slate-400',
        iconBg: 'bg-white/10'
    },
    rose: {
        headerBg: 'bg-rose-500/5',
        borderColor: 'border-rose-500/20',
        titleColor: 'text-rose-400',
        iconColor: 'text-rose-300',
        iconBg: 'bg-rose-500/20'
    }
};

// Componente de Seção (Quadro Glassmorphism)
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
        <div className={`bg-black/20 backdrop-blur-md rounded-2xl shadow-xl border ${styles.borderColor} overflow-hidden flex flex-col transition-all hover:bg-black/30 hover:shadow-2xl hover:border-white/10`}>
            <div className={`${styles.headerBg} px-6 py-3 border-b ${styles.borderColor} relative flex items-center justify-center h-20 shrink-0`}>
                {/* ICON (LEFT) */}
                <div className="absolute left-6 top-1/2 -translate-y-1/2">
                    <div className={`p-2.5 rounded-xl ${styles.iconBg} shadow-lg ring-1 ring-white/10`}>
                        <Icon className={`h-8 w-8 ${styles.iconColor}`} strokeWidth={2.5} />
                    </div>
                </div>

                {/* TITLE (CENTERED) */}
                <span className={`text-2xl font-black ${styles.titleColor} uppercase tracking-[0.25em] leading-none drop-shadow-sm pointer-events-none`}>
                    {title}
                </span>

                {/* QUANTITY AND BUTTON (RIGHT) */}
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center gap-8">
                    {count !== undefined && (
                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-white/20 font-black uppercase tracking-widest mb-0.5">Qtd</span>
                            <span className="text-2xl font-black text-white/20 leading-none">{count}</span>
                        </div>
                    )}
                    {onAdd && (
                        <button onClick={onAdd} className={`flex items-center justify-center gap-2 text-white px-4 h-11 rounded-xl text-[10px] font-black uppercase transition-all shadow-xl active:scale-95 hover:brightness-110 w-48 shrink-0 border border-white/10
                            ${theme === 'blue' ? 'bg-blue-600 hover:bg-blue-500 shadow-blue-900/40' :
                                theme === 'orange' ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/40' :
                                    theme === 'green' ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-900/40' :
                                        'bg-slate-700 hover:bg-slate-600 shadow-slate-900/40'
                            }`}>
                            <Plus className="h-5 w-5 shrink-0" strokeWidth={4} /> <span className="truncate">{actionLabel}</span>
                        </button>
                    )}
                </div>
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
    const { preference } = useBackgroundPreference();
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

    // Estado para controlar qual modal está aberto
    const [activeModal, setActiveModal] = useState<'none' | 'produto' | 'pagamento' | 'parcelamento'>('none')
    const [isCpfModalOpen, setIsCpfModalOpen] = useState(false)

    // Novos campos experimentais
    const [obsGeral, setObsGeral] = useState(venda.obs_geral || '')
    const [nfEmitida, setNfEmitida] = useState(venda.nf_emitida || false)
    const [isSavingObs, setIsSavingObs] = useState(false)
    const [isSavingNF, setIsSavingNF] = useState(false)

    const vendedorNome = employee?.full_name || 'N/A'
    const employeeIdFinanceiro = employee?.id || 0

    const closeModal = () => setActiveModal('none')
    const hasCpf = !!customer?.cpf?.toString().replace(/\D/g, '')
    const hasPhone = !!(customer?.fone_movel || customer?.phone)?.toString().replace(/\D/g, '')
    const canOpenParcelamento = hasCpf && hasPhone

    const handleOpenParcelamento = () => {
        if (!canOpenParcelamento) {
            setIsCpfModalOpen(true)
            return
        }
        setActiveModal('parcelamento')
    }

    const handleSaveObs = async () => {
        if (obsGeral === venda.obs_geral) return
        setIsSavingObs(true)
        const res = await updateVendaExperimentalFields(venda.id, venda.store_id, { obs_geral: obsGeral })
        if (res.success) {
            toast.success("Observação salva")
            await onDataReload()
        } else {
            toast.error("Erro ao salvar observação")
        }
        setIsSavingObs(false)
    }

    const handleToggleNF = async (checked: boolean) => {
        setNfEmitida(checked)
        setIsSavingNF(true)
        const res = await updateVendaExperimentalFields(venda.id, venda.store_id, { nf_emitida: checked })
        if (res.success) {
            toast.success(checked ? "Nota marcada como emitida" : "Nota desmarcada")
            await onDataReload()
        } else {
            toast.error("Erro ao atualizar status da nota")
            setNfEmitida(!checked)
        }
        setIsSavingNF(false)
    }

    return (
        <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">

            {/* BACKGROUND PREMIUM (Igual Atendimento, controlado pelo preference) */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 z-0 bg-[url('/vendasos.jpg')] bg-cover bg-center opacity-30 blur-[2px]" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/70 via-slate-950/80 to-slate-950" />
            </div>

            {/* 1. CABEÇALHO SUPERIOR (Glassmorphism) */}
            <div className="relative z-30 bg-white/5 backdrop-blur-xl border-b border-white/10 px-4 py-2 flex items-center justify-between shrink-0 shadow-lg h-14">
                {/* Esquerda: Voltar e ID */}
                <div className="flex items-center gap-3 relative z-10">
                    <button onClick={() => router.back()} className="p-2 hover:bg-white/10 rounded-full text-slate-300 hover:text-white transition-colors" title="Voltar">
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-1"></div>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-3">
                            Venda #{venda.id}
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border shadow-lg backdrop-blur-md ${venda.status === 'Fechada' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                venda.status === 'Cancelada' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                    'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                }`}>
                                {venda.status}
                            </span>
                        </h1>
                    </div>
                </div>

                {/* Centro: Nome do Cliente (Centralizado Absoluto) */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-0 w-full pointer-events-none">
                    <div className="pointer-events-auto flex items-center gap-2 font-bold text-blue-200 bg-blue-500/10 px-4 py-1.5 rounded-full border border-blue-500/20 backdrop-blur-md shadow-lg hover:bg-blue-500/20 transition-colors">
                        <User className="h-3.5 w-3.5 text-blue-400" />
                        <span className="truncate max-w-[350px] text-sm">{customer?.full_name}</span>
                    </div>
                </div>

                {/* Direita: Vendedor e Toggle */}
                <div className="flex items-center gap-4 text-xs relative z-10">
                    <div className="hidden sm:flex items-center gap-2 text-slate-400 bg-white/5 px-3 py-1.5 rounded-lg border border-white/5 backdrop-blur-md">
                        <Briefcase className="h-3.5 w-3.5 text-slate-500" />
                        <span className="truncate max-w-[120px]">{vendedorNome}</span>
                    </div>
                    {/* Toggle de Fundo (No Header) */}
                    <BackgroundToggle />
                </div>
            </div>

            {/* 2. MIOLO (ÁREA DE SCROLL ÚNICA) */}
            <div className="relative z-10 flex-1 overflow-y-auto custom-scrollbar p-4">
                <div className="max-w-5xl mx-auto w-full space-y-4">

                    {/* QUADRO 1: PRODUTOS (AZUL - Comercial) */}
                    <SectionCard
                        title="Produtos"
                        count={vendaItens.length}
                        icon={ShoppingBag}
                        onAdd={isVendaFechadaOuCancelada ? undefined : () => setActiveModal('produto')}
                        actionLabel="Novo Produto"
                        theme="blue"
                    >
                        <div className="p-1">
                            <ListaItens itens={vendaItens} vendaId={venda.id} storeId={venda.store_id} onItemDeleted={onDataReload} disabled={isVendaFechadaOuCancelada} />
                        </div>
                    </SectionCard>

                    {/* QUADRO 2: PROTOCOLO (OS) (SLATE/CINZA - Operacional) */}
                    <SectionCard
                        title="Protocolo (OS)"
                        count={serviceOrders.length}
                        icon={Wrench}
                        onAdd={isVendaFechadaOuCancelada ? undefined : () => router.push(`/dashboard/loja/${venda.store_id}/vendas/${venda.id}/os?employee_id=${employee?.id}&employee_name=${employee?.full_name}`)}
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

                    {/* QUADRO 3: PAGAMENTOS (VERDE - Financeiro) */}
                    <SectionCard
                        title="Pagamentos"
                        count={pagamentos.length}
                        icon={DollarSign}
                        onAdd={isVendaFechadaOuCancelada ? undefined : () => setActiveModal('pagamento')}
                        actionLabel="Novo Pagamento"
                        theme="green"
                    >
                        <div className="p-1">
                            <ListaPagamentos pagamentos={pagamentos} vendaId={venda.id} storeId={venda.store_id} onDelete={onDataReload} disabled={isVendaFechadaOuCancelada} />
                        </div>
                    </SectionCard>

                    {/* QUADRO 4: PARCELAMENTO (LARANJA - Financeiro) */}
                    <SectionCard
                        title="Parcelamento"
                        icon={FileText}
                        onAdd={(!financiamento && !isVendaFechadaOuCancelada) ? handleOpenParcelamento : undefined} // Só mostra botão se não tiver financiamento e não estiver fechada
                        actionLabel="Novo Parcelamento"
                        theme="orange"
                    >
                        <div className="p-2">
                            {financiamento ? (
                                <FinanciamentoBox
                                    financiamento={financiamento}
                                    vendaId={venda.id}
                                    customerId={venda.customer_id}
                                    customer={customer}
                                    storeId={venda.store_id}
                                    employeeId={employeeIdFinanceiro}
                                    valorRestante={venda.valor_restante ?? 0}
                                    onFinanceAdded={onDataReload}
                                    disabled={venda.status === 'Cancelada'}
                                    isQuitado={isQuitado}
                                />
                            ) : (
                                <div className="text-center py-6 text-slate-500 text-xs font-medium italic border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                                    Nenhum parcelamento registrado. Clique em "Novo Parcelamento" para criar.
                                </div>
                            )}
                        </div>
                    </SectionCard>

                    {/* QUADRO 5: OBSERVAÇÕES GERAIS (NOVO) */}
                    <SectionCard
                        title="Observações"
                        icon={FileText}
                        theme="slate"
                    >
                        <div className="p-4">
                            <textarea
                                value={obsGeral}
                                onChange={(e) => setObsGeral(e.target.value)}
                                onBlur={handleSaveObs}
                                disabled={isVendaFechadaOuCancelada || isSavingObs}
                                placeholder="Digite observações gerais sobre esta venda..."
                                className="w-full h-24 bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all placeholder:text-slate-600 resize-none"
                            />
                            {isSavingObs && (
                                <div className="flex justify-end mt-1">
                                    <span className="text-[10px] text-blue-400 animate-pulse font-bold uppercase tracking-widest">Salvando...</span>
                                </div>
                            )}
                        </div>
                    </SectionCard>

                </div>
            </div>

            {/* 3. RODAPÉ FIXO (TOTALIZADORES PRETO/GLASS) */}
            <div className="relative z-30 bg-black/60 backdrop-blur-xl border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] shrink-0 px-6 py-3 flex items-center justify-between h-20">
                <div className="flex-1">
                    <ResumoFinanceiro
                        venda={venda}
                        vendaItens={vendaItens}
                        onUpdate={onDataReload}
                        disabled={isVendaFechadaOuCancelada}
                    />
                    {/* Checkbox NF Experimental */}
                    <div className="flex items-center gap-3 ml-6 pl-6 border-l border-white/10">
                        <label className="flex items-center gap-3 cursor-pointer group">
                            <div className="relative">
                                <input
                                    type="checkbox"
                                    checked={nfEmitida}
                                    onChange={(e) => handleToggleNF(e.target.checked)}
                                    disabled={isVendaFechadaOuCancelada || isSavingNF}
                                    className="peer sr-only"
                                />
                                <div className={`w-10 h-5 rounded-full border border-white/20 transition-all duration-300 ${nfEmitida ? 'bg-blue-600 border-blue-500 shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'bg-white/5'}`}></div>
                                <div className={`absolute left-1 top-1 w-3 h-3 rounded-full bg-white transition-all duration-300 ${nfEmitida ? 'translate-x-5 shadow-lg' : 'translate-x-0 opacity-40'}`}></div>
                            </div>
                            <div className="flex flex-col leading-none">
                                <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${nfEmitida ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'}`}>
                                    Nota Fiscal
                                </span>
                                <span className="text-[8px] text-slate-600 font-bold uppercase mt-0.5">
                                    Controle Interno
                                </span>
                            </div>
                        </label>
                    </div>
                </div>
                <div className="pl-6 border-l border-white/10 ml-6">
                    <VendaActions
                        venda={venda}
                        vendaItens={vendaItens}
                        customer={customer}
                        onStatusChange={onDataReload}
                        isVendaFechada={isVendaFechadaOuCancelada}
                        onPrint={() => setIsPrintModalOpen(true)}
                    />
                </div>
            </div>

            {/* --- MODAIS --- */}

            {/* Modal de Produto (AZUL) */}
            <SimpleModal
                isOpen={activeModal === 'produto'}
                onClose={closeModal}
                title="Adicionar Produto"
                headerClass="bg-blue-600/20 text-white border-b border-white/10"
            >
                <AddItemFormExperimental
                    vendaId={venda.id}
                    storeId={venda.store_id}
                    onItemAdded={async () => { await onDataReload(); closeModal(); }}
                    disabled={isVendaFechadaOuCancelada}
                />
            </SimpleModal>

            {/* Modal de Pagamento (LARANJA) */}
            <SimpleModal
                isOpen={activeModal === 'pagamento'}
                onClose={closeModal}
                title="Registrar Pagamento"
                headerClass="bg-amber-600/20 text-white border-b border-white/10"
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

            {/* Modal de Parcelamento (LARANJA) */}
            <SimpleModal
                isOpen={activeModal === 'parcelamento'}
                onClose={closeModal}
                title="Gerar Parcelamento"
                headerClass="bg-amber-600/20 text-white border-b border-white/10"
            >
                <FinanciamentoBox
                    financiamento={financiamento}
                    vendaId={venda.id}
                    customerId={venda.customer_id}
                    customer={customer}
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

            {customer && (
                <UpdateCpfModal
                    isOpen={isCpfModalOpen}
                    onClose={() => setIsCpfModalOpen(false)}
                    onSuccess={async () => {
                        setIsCpfModalOpen(false)
                        await onDataReload()
                        setActiveModal('parcelamento')
                    }}
                    customerId={customer.id}
                    customerName={customer.full_name}
                    currentCpf={customer.cpf || ''}
                    currentPhone={customer.fone_movel || customer.phone || ''}
                />
            )}

        </div>
    )
}

