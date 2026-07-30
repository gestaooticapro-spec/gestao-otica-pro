'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useFormState, useFormStatus } from 'react-dom'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
    ShoppingBag, DollarSign, FileText, User,
    Briefcase, Wrench, ArrowLeft, Plus, X, Save, Loader2, UserPlus, Stethoscope,
    ChevronLeft, ChevronRight, ChevronDown, ChevronUp
} from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';

import AddItemFormExperimental from '@/components/vendas/AddItemFormExperimental'
import AddPagamentoForm from '@/components/vendas/AddPagamentoForm'
import FinanciamentoBox from '@/components/vendas/FinanciamentoBox'
import ListaItens from '@/components/vendas/ListaItens'
import ListaPagamentos from '@/components/vendas/ListaPagamentos'
import ResumoFinanceiro from '@/components/vendas/ResumoFinanceiro'
import VendaActions from '@/components/vendas/VendaActions'
import { saveServiceOrder, updateVendaExperimentalFields, type SaveSOResult } from '@/lib/actions/vendas.actions'
import { toast } from 'sonner'
import ReceiptSelectionModal from '@/components/modals/ReceiptSelectionModal'
import UpdateCpfModal from '@/components/modals/UpdateCpfModal'
import TransferVendaModal from '@/components/modals/TransferVendaModal'
import CustomerQuickInfoModal from '@/components/modals/CustomerQuickInfoModal'
import AddDependenteModal from '@/components/modals/AddDependenteModal'
import AddOftalmoModal from '@/components/modals/AddOftalmoModal'
import { useStoreModules } from '@/lib/contexts/StoreModulesContext'
import { currentPathWithSearch, withReturnTo } from '@/lib/return-navigation'
import { DegreeInput } from '@/components/ui/DegreeInput'
import { StoreSettings } from '@/lib/store-modules'

import { Database } from '@/lib/database.types'

type Venda = Database['public']['Tables']['vendas']['Row']
type VendaItem = Database['public']['Tables']['venda_itens']['Row']
type ServiceOrder = Database['public']['Tables']['service_orders']['Row']
type Pagamento = Database['public']['Tables']['pagamentos']['Row']
type Financiamento = Database['public']['Tables']['financiamento_loja']['Row']
type FinanciamentoParcela = Database['public']['Tables']['financiamento_parcelas']['Row']
type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row']
type Dependente = Database['public']['Tables']['dependentes']['Row']
type Oftalmologista = Database['public']['Tables']['oftalmologistas']['Row']
type ServiceOrderWithLinks = ServiceOrder & {
    links?: { venda_item_id: number; uso_na_os: string }[]
}

interface VendaInterfaceProps {
    venda: Venda
    customer: Customer | null
    employee: Employee | null
    vendaItens: VendaItem[]
    serviceOrders: ServiceOrderWithLinks[]
    pagamentos: Pagamento[]
    financiamento: (Financiamento & { financiamento_parcelas: FinanciamentoParcela[] }) | null
    storeSettings: StoreSettings
    dependentes: Dependente[]
    oftalmologistas: Oftalmologista[]
    employees: Employee[]
    lentes: any[]
    armacoes: any[]
    tratamentos: any[]
    isQuitado: boolean
    isVendaFechadaOuCancelada: boolean
    onDataReload: () => Promise<void>
}

// Componente de Modal Simples Local
function SimpleModal({ isOpen, onClose, title, children, headerClass = "bg-white/5 text-slate-200" }: { isOpen: boolean; onClose: () => void; title: string; children: React.ReactNode, headerClass?: string }) {
    const [mounted, setMounted] = useState(false)
    const mouseDownTargetRef = useRef<EventTarget | null>(null)

    useEffect(() => {
        setMounted(true)
    }, [])

    if (!isOpen || !mounted) return null;

    const handleMouseDown = (e: React.MouseEvent) => {
        mouseDownTargetRef.current = e.target
    }

    const handleClick = (e: React.MouseEvent) => {
        // Se o mousedown e click foram no mesmo elemento (overlay), fecha o modal
        // Isso evita que o modal feche quando o usuário está selecionando texto
        if (e.target === mouseDownTargetRef.current) {
            onClose()
        }
        mouseDownTargetRef.current = null
    }

    return createPortal(
        <div 
            className="fixed inset-0 z-[100] grid place-items-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto custom-scrollbar animate-in fade-in duration-200" 
            onMouseDown={handleMouseDown}
            onClick={handleClick}
        >
            <div className="bg-slate-900 border border-white/10 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-200" onClick={e => e.stopPropagation()}>
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
        </div>,
        document.body
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

const osInputStyle = 'block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-9 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium placeholder:text-slate-500 disabled:opacity-50 transition-all'
const osSelectStyle = `${osInputStyle} bg-slate-950/90 text-slate-100 [color-scheme:dark]`
const osOptionStyle = 'bg-slate-950 text-slate-100'
const osLabelStyle = 'block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider'
const osGridInput = `${osInputStyle} text-center`

function SingleOSSubmitButton({ hasOrder }: { hasOrder: boolean }) {
    const { pending } = useFormStatus()

    return (
        <button
            type="submit"
            disabled={pending}
            className="h-10 px-5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-black uppercase tracking-[0.12em] border border-cyan-400/20 shadow-lg shadow-cyan-500/10 disabled:opacity-50 flex items-center justify-center gap-2"
        >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {hasOrder ? 'Salvar OS' : 'Criar OS'}
        </button>
    )
}

function SingleServiceOrderCard({
    venda,
    customer,
    vendaItens,
    serviceOrder,
    serviceOrders,
    dependentes,
    oftalmologistas,
    employees,
    onDataReload,
    onCancelDraft,
    orderIndex,
    orderCount,
    isCollapsed,
    onToggleCollapsed,
    onPreviousOrder,
    onNextOrder,
    disabled,
}: {
    venda: Venda
    customer: Customer | null
    vendaItens: VendaItem[]
    serviceOrder?: ServiceOrderWithLinks
    serviceOrders: ServiceOrderWithLinks[]
    dependentes: Dependente[]
    oftalmologistas: Oftalmologista[]
    employees: Employee[]
    onDataReload: () => Promise<void>
    onCancelDraft: () => void
    orderIndex: number
    orderCount: number
    isCollapsed: boolean
    onToggleCollapsed: () => void
    onPreviousOrder: () => void
    onNextOrder: () => void
    disabled: boolean
}) {
    const initialState: SaveSOResult = { success: false, message: '' }
    const [saveState, dispatch] = useFormState(saveServiceOrder, initialState)
    const [localDependentes, setLocalDependentes] = useState(dependentes)
    const [localOftalmos, setLocalOftalmos] = useState(oftalmologistas)
    const [isDepModalOpen, setIsDepModalOpen] = useState(false)
    const [isOftalmoModalOpen, setIsOftalmoModalOpen] = useState(false)
    const lastHandledSaveRef = useRef<number | undefined>(0)

    const [dependenteId, setDependenteId] = useState('')
    const [oftalmologistaId, setOftalmologistaId] = useState('')
    const [protocolo, setProtocolo] = useState('')
    const [lenteOdItemId, setLenteOdItemId] = useState('')
    const [lenteOeItemId, setLenteOeItemId] = useState('')
    const [armacaoItemId, setArmacaoItemId] = useState('')
    const [armacaoComCliente, setArmacaoComCliente] = useState(false)
    const [osEnviadaAoLab, setOsEnviadaAoLab] = useState(false)

    const [longeOdEsf, setLongeOdEsf] = useState('')
    const [longeOdCil, setLongeOdCil] = useState('')
    const [longeOdEixo, setLongeOdEixo] = useState('')
    const [longeOeEsf, setLongeOeEsf] = useState('')
    const [longeOeCil, setLongeOeCil] = useState('')
    const [longeOeEixo, setLongeOeEixo] = useState('')
    const [adicao, setAdicao] = useState('')

    const [dnpOd, setDnpOd] = useState('')
    const [dnpOe, setDnpOe] = useState('')
    const [altOd, setAltOd] = useState('')
    const [altOe, setAltOe] = useState('')
    const [diamOd, setDiamOd] = useState('')
    const [diamOe, setDiamOe] = useState('')
    const [medH, setMedH] = useState('')
    const [medV, setMedV] = useState('')
    const [medDiag, setMedDiag] = useState('')
    const [medPonte, setMedPonte] = useState('')

    useEffect(() => {
        setLocalDependentes(dependentes)
    }, [dependentes])

    useEffect(() => {
        setLocalOftalmos(oftalmologistas)
    }, [oftalmologistas])

    useEffect(() => {
        const os = serviceOrder as any
        if (!os) {
            setDependenteId('')
            setOftalmologistaId('')
            setProtocolo('')
            setLenteOdItemId('')
            setLenteOeItemId('')
            setArmacaoItemId('')
            setArmacaoComCliente(false)
            setOsEnviadaAoLab(false)
            setLongeOdEsf('')
            setLongeOdCil('')
            setLongeOdEixo('')
            setLongeOeEsf('')
            setLongeOeCil('')
            setLongeOeEixo('')
            setAdicao('')
            setDnpOd('')
            setDnpOe('')
            setAltOd('')
            setAltOe('')
            setDiamOd('')
            setDiamOe('')
            setMedH('')
            setMedV('')
            setMedDiag('')
            setMedPonte('')
            return
        }

        setDependenteId(os.dependente_id?.toString() ?? '')
        setOftalmologistaId(os.oftalmologista_id?.toString() ?? '')
        setProtocolo(os.protocolo_fisico ?? '')
        setLenteOdItemId(os.links?.find((l: any) => l.uso_na_os === 'lente_od')?.venda_item_id?.toString() ?? '')
        setLenteOeItemId(os.links?.find((l: any) => l.uso_na_os === 'lente_oe')?.venda_item_id?.toString() ?? '')
        setArmacaoItemId(os.links?.find((l: any) => l.uso_na_os === 'armacao')?.venda_item_id?.toString() ?? '')
        setArmacaoComCliente(Boolean(os.armacao_com_cliente))
        setOsEnviadaAoLab(Boolean(os.os_enviada_ao_lab))
        setLongeOdEsf(os.receita_longe_od_esferico ?? '')
        setLongeOdCil(os.receita_longe_od_cilindrico ?? '')
        setLongeOdEixo(os.receita_longe_od_eixo ?? '')
        setLongeOeEsf(os.receita_longe_oe_esferico ?? '')
        setLongeOeCil(os.receita_longe_oe_cilindrico ?? '')
        setLongeOeEixo(os.receita_longe_oe_eixo ?? '')
        setAdicao(os.receita_adicao ?? '')
        setDnpOd(os.medida_dnp_od ?? '')
        setDnpOe(os.medida_dnp_oe ?? '')
        setAltOd(os.medida_altura_od ?? '')
        setAltOe(os.medida_altura_oe ?? '')
        setDiamOd(os.medida_diametro_od ?? '')
        setDiamOe(os.medida_diametro_oe ?? '')
        setMedH(os.medida_horizontal ?? '')
        setMedV(os.medida_vertical ?? '')
        setMedDiag(os.medida_diagonal ?? '')
        setMedPonte(os.medida_ponte ?? '')
    }, [serviceOrder])

    useEffect(() => {
        if (!saveState.timestamp || saveState.timestamp === lastHandledSaveRef.current) return
        lastHandledSaveRef.current = saveState.timestamp

        if (saveState.success) {
            toast.success(saveState.message || 'OS salva')
            void onDataReload()
            return
        }

        if (saveState.message) {
            toast.error(saveState.message)
        }
    }, [saveState, onDataReload])

    const itensLente = vendaItens.filter((item) => item.item_tipo === 'Lente')
    const itensArmacao = vendaItens.filter((item) => item.item_tipo === 'Armacao' || item.item_tipo === 'Solar')
    const firstEmployeeId = venda.employee_id || employees[0]?.id || null
    const lenteItemIdsEmOutraOs = new Set(
        serviceOrders
            .filter((order) => order.id !== serviceOrder?.id)
            .flatMap((order) => order.links || [])
            .filter((link) => link.uso_na_os === 'lente_od' || link.uso_na_os === 'lente_oe')
            .map((link) => link.venda_item_id)
    )

    const isLenteDisponivel = (item: VendaItem, olho: 'OD' | 'OE') => {
        if ((item as any).unidade === 'Par') return true
        const outroOlhoId = olho === 'OD' ? lenteOeItemId : lenteOdItemId
        if (!outroOlhoId || outroOlhoId !== item.id.toString()) return true
        return Number((item as any).quantidade || 0) >= 2
    }

    const isLenteDisponivelEmOutraOs = (item: VendaItem, olho: 'OD' | 'OE') => {
        const selecaoAtual = olho === 'OD' ? lenteOdItemId : lenteOeItemId
        return selecaoAtual === item.id.toString() || !lenteItemIdsEmOutraOs.has(item.id)
    }

    const itemLinks = [
        { item_id: lenteOdItemId, uso: 'lente_od' },
        { item_id: lenteOeItemId, uso: 'lente_oe' },
        { item_id: armacaoItemId, uso: 'armacao' },
    ].filter((link) => link.item_id)
    const selectedPatientName = dependenteId
        ? localDependentes.find((dep) => dep.id === Number(dependenteId))?.full_name || customer?.full_name || 'Paciente'
        : customer?.full_name || 'Paciente'
    const selectedDoctorName = oftalmologistaId
        ? localOftalmos.find((doc) => doc.id === Number(oftalmologistaId))?.nome_completo || 'Médico não informado'
        : 'Médico não informado'
    const canNavigateOrders = orderCount > 1 && !!serviceOrder

    const cardHeader = (
        <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-black/20 p-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black uppercase tracking-[0.16em] text-cyan-300">
                        {serviceOrder ? `OS #${serviceOrder.id}` : 'Nova OS'}
                    </span>
                    {serviceOrder && (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                            OS {orderIndex + 1} de {orderCount}
                        </span>
                    )}
                </div>
                <p className="mt-1 truncate text-xs font-semibold text-slate-300">
                    {selectedPatientName}
                    <span className="mx-2 text-slate-600">/</span>
                    {selectedDoctorName}
                </p>
            </div>

            <div className="flex items-center gap-2">
                {canNavigateOrders && (
                    <div className="flex items-center overflow-hidden rounded-lg border border-white/10 bg-white/5">
                        <button
                            type="button"
                            onClick={onPreviousOrder}
                            className="h-9 w-9 text-slate-300 hover:bg-white/10 hover:text-white"
                            title="OS anterior"
                        >
                            <ChevronLeft className="mx-auto h-4 w-4" />
                        </button>
                        <div className="h-5 w-px bg-white/10" />
                        <button
                            type="button"
                            onClick={onNextOrder}
                            className="h-9 w-9 text-slate-300 hover:bg-white/10 hover:text-white"
                            title="Próxima OS"
                        >
                            <ChevronRight className="mx-auto h-4 w-4" />
                        </button>
                    </div>
                )}

                <button
                    type="button"
                    onClick={onToggleCollapsed}
                    className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 text-[10px] font-black uppercase tracking-[0.12em] text-slate-300 hover:bg-white/10 hover:text-white"
                    title={isCollapsed ? 'Expandir OS' : 'Recolher OS'}
                >
                    {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    {isCollapsed ? 'Expandir' : 'Recolher'}
                </button>
            </div>
        </div>
    )

    return (
        <div className="p-3">
            {cardHeader}
            {isCollapsed ? null : (
            <form action={dispatch} className="mt-3 space-y-4">
                {serviceOrder && <input type="hidden" name="id" value={serviceOrder.id} />}
                <input type="hidden" name="store_id" value={venda.store_id} />
                <input type="hidden" name="venda_id" value={venda.id} />
                <input type="hidden" name="customer_id" value={customer?.id || venda.customer_id} />
                <input type="hidden" name="lab_pedido_por_id" value={firstEmployeeId || ''} />
                <input type="hidden" name="item_links_json" value={JSON.stringify(itemLinks)} />

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-4 space-y-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <label htmlFor={`single-os-protocolo-${serviceOrder?.id ?? 'new'}`} className={osLabelStyle}>
                                Protocolo
                            </label>
                            <input
                                id={`single-os-protocolo-${serviceOrder?.id ?? 'new'}`}
                                name="protocolo_fisico"
                                type="text"
                                value={protocolo}
                                onChange={(e) => setProtocolo(e.target.value)}
                                disabled={disabled}
                                className={`${osInputStyle} font-bold uppercase text-center`}
                                placeholder="Numero local da OS"
                            />
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200 flex items-center gap-2">
                                    <User className="h-4 w-4 text-cyan-300" />
                                    Paciente
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsDepModalOpen(true)}
                                    disabled={disabled || !customer}
                                    className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-cyan-300 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                                    title="Incluir paciente"
                                >
                                    <UserPlus className="h-4 w-4" />
                                </button>
                            </div>
                            <select name="dependente_id" value={dependenteId} onChange={(e) => setDependenteId(e.target.value)} disabled={disabled} className={osSelectStyle}>
                                <option value="" className={osOptionStyle}>Titular: {customer?.full_name || 'Cliente'}</option>
                                {localDependentes.map((dep) => (
                                    <option key={dep.id} value={dep.id} className={osOptionStyle}>{dep.full_name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200 flex items-center gap-2">
                                    <Stethoscope className="h-4 w-4 text-cyan-300" />
                                    Médico
                                </h3>
                                <button
                                    type="button"
                                    onClick={() => setIsOftalmoModalOpen(true)}
                                    disabled={disabled}
                                    className="h-8 w-8 rounded-lg border border-white/10 bg-white/5 text-cyan-300 hover:bg-white/10 disabled:opacity-50 flex items-center justify-center"
                                    title="Incluir medico"
                                >
                                    <Plus className="h-4 w-4" />
                                </button>
                            </div>
                            <select name="oftalmologista_id" value={oftalmologistaId} onChange={(e) => setOftalmologistaId(e.target.value)} disabled={disabled} className={osSelectStyle}>
                                <option value="" className={osOptionStyle}>Selecione...</option>
                                {localOftalmos.map((doc) => (
                                    <option key={doc.id} value={doc.id} className={osOptionStyle}>{doc.nome_completo}</option>
                                ))}
                            </select>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200 flex items-center gap-2">
                                <ShoppingBag className="h-4 w-4 text-cyan-300" />
                                Itens da Venda
                            </h3>
                            <div>
                                <label className={osLabelStyle}>Lente OD</label>
                                <select value={lenteOdItemId} onChange={(e) => setLenteOdItemId(e.target.value)} disabled={disabled} className={osSelectStyle}>
                                    <option value="" className={osOptionStyle}>Selecione...</option>
                                    {itensLente.filter((item) => isLenteDisponivel(item, 'OD') && isLenteDisponivelEmOutraOs(item, 'OD')).map((item) => (
                                        <option key={item.id} value={item.id} className={osOptionStyle}>{item.descricao}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={osLabelStyle}>Lente OE</label>
                                <select value={lenteOeItemId} onChange={(e) => setLenteOeItemId(e.target.value)} disabled={disabled} className={osSelectStyle}>
                                    <option value="" className={osOptionStyle}>Selecione...</option>
                                    {itensLente.filter((item) => isLenteDisponivel(item, 'OE') && isLenteDisponivelEmOutraOs(item, 'OE')).map((item) => (
                                        <option key={item.id} value={item.id} className={osOptionStyle}>{item.descricao}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className={osLabelStyle}>Armação</label>
                                <select value={armacaoItemId} onChange={(e) => setArmacaoItemId(e.target.value)} disabled={disabled} className={osSelectStyle}>
                                    <option value="" className={osOptionStyle}>Selecione...</option>
                                    {itensArmacao.map((item) => (
                                        <option key={item.id} value={item.id} className={osOptionStyle}>{item.descricao}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="lg:col-span-8 space-y-3">
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200 mb-3 flex items-center gap-2">
                                <FileText className="h-4 w-4 text-cyan-300" />
                                Receita
                            </h3>
                            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <div></div>
                                <div className="col-span-2">Esférico</div>
                                <div className="col-span-2">Cilíndrico</div>
                                <div className="col-span-2">Eixo</div>
                            </div>
                            <div className="grid grid-cols-7 gap-2 mb-2 items-center">
                                <div className="font-black text-right pr-2 text-cyan-300">OD</div>
                                <div className="col-span-2"><DegreeInput name="receita_longe_od_esferico" value={longeOdEsf} onChange={setLongeOdEsf} className={osGridInput} /></div>
                                <div className="col-span-2"><DegreeInput name="receita_longe_od_cilindrico" value={longeOdCil} onChange={setLongeOdCil} className={osGridInput} /></div>
                                <div className="col-span-2"><input name="receita_longe_od_eixo" value={longeOdEixo} onChange={(e) => setLongeOdEixo(e.target.value)} disabled={disabled} className={osGridInput} /></div>
                            </div>
                            <div className="grid grid-cols-7 gap-2 mb-3 items-center">
                                <div className="font-black text-right pr-2 text-cyan-300">OE</div>
                                <div className="col-span-2"><DegreeInput name="receita_longe_oe_esferico" value={longeOeEsf} onChange={setLongeOeEsf} className={osGridInput} /></div>
                                <div className="col-span-2"><DegreeInput name="receita_longe_oe_cilindrico" value={longeOeCil} onChange={setLongeOeCil} className={osGridInput} /></div>
                                <div className="col-span-2"><input name="receita_longe_oe_eixo" value={longeOeEixo} onChange={(e) => setLongeOeEixo(e.target.value)} disabled={disabled} className={osGridInput} /></div>
                            </div>
                            <div className="max-w-44">
                                <label className={osLabelStyle}>Adição</label>
                                <DegreeInput name="receita_adicao" value={adicao} onChange={setAdicao} className={osGridInput} />
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200 mb-3 flex items-center gap-2">
                                <Wrench className="h-4 w-4 text-cyan-300" />
                                Medidas Técnicas
                            </h3>
                            <div className="grid grid-cols-3 gap-2 mb-3 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                <div></div>
                                <div>OD</div>
                                <div>OE</div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-2 items-center">
                                <label className={`${osLabelStyle} text-right pr-1 mb-0`}>DNP</label>
                                <input name="medida_dnp_od" value={dnpOd} onChange={(e) => setDnpOd(e.target.value)} disabled={disabled} className={osGridInput} />
                                <input name="medida_dnp_oe" value={dnpOe} onChange={(e) => setDnpOe(e.target.value)} disabled={disabled} className={osGridInput} />
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-2 items-center">
                                <label className={`${osLabelStyle} text-right pr-1 mb-0`}>Altura</label>
                                <input name="medida_altura_od" value={altOd} onChange={(e) => setAltOd(e.target.value)} disabled={disabled} className={osGridInput} />
                                <input name="medida_altura_oe" value={altOe} onChange={(e) => setAltOe(e.target.value)} disabled={disabled} className={osGridInput} />
                            </div>
                            <div className="grid grid-cols-3 gap-2 mb-4 items-center">
                                <label className={`${osLabelStyle} text-right pr-1 mb-0`}>Diâm.</label>
                                <input name="medida_diametro_od" value={diamOd} onChange={(e) => setDiamOd(e.target.value)} disabled={disabled} className={osGridInput} />
                                <input name="medida_diametro_oe" value={diamOe} onChange={(e) => setDiamOe(e.target.value)} disabled={disabled} className={osGridInput} />
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                <div><label className={osLabelStyle}>Horizontal</label><input name="medida_horizontal" value={medH} onChange={(e) => setMedH(e.target.value)} disabled={disabled} className={osInputStyle} /></div>
                                <div><label className={osLabelStyle}>Vertical</label><input name="medida_vertical" value={medV} onChange={(e) => setMedV(e.target.value)} disabled={disabled} className={osInputStyle} /></div>
                                <div><label className={osLabelStyle}>Diagonal</label><input name="medida_diagonal" value={medDiag} onChange={(e) => setMedDiag(e.target.value)} disabled={disabled} className={osInputStyle} /></div>
                                <div><label className={osLabelStyle}>Ponte</label><input name="medida_ponte" value={medPonte} onChange={(e) => setMedPonte(e.target.value)} disabled={disabled} className={osInputStyle} /></div>
                            </div>
                        </div>

                        <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                            <h3 className="text-xs font-black uppercase tracking-[0.16em] text-slate-200 mb-3 flex items-center gap-2">
                                <Briefcase className="h-4 w-4 text-cyan-300" />
                                Laboratório
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
                                    <input type="checkbox" name="armacao_com_cliente" checked={armacaoComCliente} onChange={(e) => setArmacaoComCliente(e.target.checked)} disabled={disabled} className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
                                    Armação com cliente
                                </label>
                                <label className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300">
                                    <input type="checkbox" name="os_enviada_ao_lab" checked={osEnviadaAoLab} onChange={(e) => setOsEnviadaAoLab(e.target.checked)} disabled={disabled} className="h-4 w-4 rounded border-white/20 bg-slate-900 text-cyan-500 focus:ring-cyan-500" />
                                    OS enviada pra montagem no laboratório
                                </label>
                            </div>
                        </div>
                    </div>
                </div>

                <input type="hidden" name="medida_diametro" value="" />
                <input type="hidden" name="pending_reservations_json" value="[]" />

                <div className="flex justify-end gap-2 border-t border-white/10 pt-3">
                    {!serviceOrder && (
                        <button
                            type="button"
                            onClick={onCancelDraft}
                            className="h-10 px-4 rounded-lg border border-white/10 bg-white/5 text-xs font-bold uppercase tracking-[0.12em] text-slate-400 hover:bg-white/10"
                        >
                            Cancelar
                        </button>
                    )}
                    <SingleOSSubmitButton hasOrder={!!serviceOrder} />
                </div>
            </form>
            )}

            {customer && (
                <AddDependenteModal
                    isOpen={isDepModalOpen}
                    onClose={() => setIsDepModalOpen(false)}
                    onSuccess={(newDep) => {
                        setLocalDependentes((prev) => [...prev, newDep])
                        setDependenteId(newDep.id.toString())
                    }}
                    storeId={venda.store_id}
                    customerId={customer.id}
                />
            )}

            <AddOftalmoModal
                isOpen={isOftalmoModalOpen}
                onClose={() => setIsOftalmoModalOpen(false)}
                onSuccess={(newDoc) => {
                    setLocalOftalmos((prev) => [...prev, newDoc])
                    setOftalmologistaId(newDoc.id.toString())
                }}
            />
        </div>
    )
}

export default function VendaInterfaceExperimental({
    venda, customer, employee, vendaItens, serviceOrders,
    pagamentos, financiamento, storeSettings, dependentes, oftalmologistas, employees, isQuitado, isVendaFechadaOuCancelada, onDataReload
}: VendaInterfaceProps) {

    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const modules = useStoreModules()
    const { preference } = useBackgroundPreference();
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false)

    // Estado para controlar qual modal está aberto
    const [activeModal, setActiveModal] = useState<'none' | 'produto' | 'pagamento' | 'parcelamento'>('none')
    const [isCpfModalOpen, setIsCpfModalOpen] = useState(false)
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
    const [isCustomerInfoModalOpen, setIsCustomerInfoModalOpen] = useState(false)
    const [isSingleOSDraftOpen, setIsSingleOSDraftOpen] = useState(false)
    const [singleOSIndex, setSingleOSIndex] = useState(0)
    const [isSingleOSCollapsed, setIsSingleOSCollapsed] = useState(false)

    // Novos campos experimentais
    const [obsGeral, setObsGeral] = useState(venda.obs_geral || '')
    const [nfEmitida, setNfEmitida] = useState(venda.nf_emitida || false)
    const [isSavingObs, setIsSavingObs] = useState(false)
    const savedObsGeral = venda.obs_geral?.trim() || ''

    const vendedorNome = employee?.full_name || 'N/A'
    const employeeIdFinanceiro = employee?.id || 0
    const returnTo = searchParams.get('returnTo')
    const currentSaleUrl = currentPathWithSearch(pathname, searchParams)
    const latestServiceOrder = serviceOrders[serviceOrders.length - 1]
    const serviceOrderParams = new URLSearchParams({
        employee_id: employee?.id?.toString() || '',
        employee_name: employee?.full_name || '',
    })
    const newServiceOrderUrl = withReturnTo(
        `/dashboard/loja/${venda.store_id}/vendas/${venda.id}/os?${serviceOrderParams.toString()}`,
        currentSaleUrl
    )
    const existingServiceOrderUrl = latestServiceOrder
        ? withReturnTo(
            `/dashboard/loja/${venda.store_id}/vendas/${venda.id}/os?os_id=${latestServiceOrder.id}&${serviceOrderParams.toString()}`,
            currentSaleUrl
        )
        : null

    const closeModal = () => setActiveModal('none')
    const hasCpf = !!customer?.cpf?.toString().replace(/\D/g, '')
    const hasPhone = !!(customer?.fone_movel || customer?.phone)?.toString().replace(/\D/g, '')
    const canOpenParcelamento = modules.installments && hasCpf && hasPhone
    const isSingleOSMode = storeSettings?.service_order_mode === 'single'
    const isWhatsAppAutomaticEnabled = storeSettings?.whatsapp_automation?.enabled === true
    const singleServiceOrder = serviceOrders[singleOSIndex] || serviceOrders[0]
    const showSingleOSCard = isSingleOSMode && (!!singleServiceOrder || isSingleOSDraftOpen)
    const canLaunchSingleOS = isSingleOSMode && !singleServiceOrder && !isSingleOSDraftOpen && !isVendaFechadaOuCancelada

    useEffect(() => {
        if (!modules.installments && activeModal === 'parcelamento') {
            setActiveModal('none')
        }
    }, [activeModal, modules.installments])

    useEffect(() => {
        if (serviceOrders.length === 0) {
            setSingleOSIndex(0)
            return
        }
        if (singleOSIndex > serviceOrders.length - 1) {
            setSingleOSIndex(serviceOrders.length - 1)
        }
    }, [serviceOrders.length, singleOSIndex])

    useEffect(() => {
        if (isSingleOSDraftOpen) {
            setIsSingleOSCollapsed(false)
        }
    }, [isSingleOSDraftOpen])

    const handleLaunchSingleOS = () => {
        setSingleOSIndex(0)
        setIsSingleOSCollapsed(false)
        setIsSingleOSDraftOpen(true)
    }

    const handlePreviousSingleOS = () => {
        if (serviceOrders.length <= 1) return
        setSingleOSIndex((current) => current <= 0 ? serviceOrders.length - 1 : current - 1)
        setIsSingleOSDraftOpen(false)
    }

    const handleNextSingleOS = () => {
        if (serviceOrders.length <= 1) return
        setSingleOSIndex((current) => current >= serviceOrders.length - 1 ? 0 : current + 1)
        setIsSingleOSDraftOpen(false)
    }

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

    const handleNFCeSuccess = async (environment: 'production' | 'homologation') => {
        if (environment === 'production') {
            setNfEmitida(true)
            await updateVendaExperimentalFields(venda.id, venda.store_id, { nf_emitida: true })
        }
        // onDataReload() deliberadamente omitido aqui: revalidatePath desmontaria o modal
        // antes da mensagem de sucesso ser exibida. O reload acontece ao fechar o modal.
    }

    const handleNFCeModalClose = async () => {
        await onDataReload()
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
                    <button
                        onClick={() => {
                            if (returnTo) {
                                router.push(returnTo)
                                return
                            }
                            router.back()
                        }}
                        className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                        title="Voltar"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </button>
                    <div className="h-6 w-px bg-white/10 mx-1"></div>
                    <div className="flex flex-col">
                        <h1 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-3">
                            Venda #{venda.id}
                            <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border shadow-lg backdrop-blur-md ${
                                venda.status === 'Fechada' ? 'bg-green-500/20 text-green-300 border-green-500/30' :
                                venda.status === 'Cancelada' ? 'bg-red-500/20 text-red-300 border-red-500/30' :
                                venda.status === 'Devolvida' ? 'bg-purple-500/20 text-purple-300 border-purple-500/30' :
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
                        <button
                            onClick={() => customer && setIsCustomerInfoModalOpen(true)}
                            className="truncate max-w-[350px] text-sm hover:underline underline-offset-2 cursor-pointer"
                            title="Ver / editar dados do cliente"
                        >
                            {customer?.full_name}
                        </button>
                        <button
                            className="ml-1 p-1 rounded-full hover:bg-amber-500/20 text-blue-300/50 hover:text-amber-300 transition-all"
                            title="Transferir Titularidade"
                            onClick={() => setIsTransferModalOpen(true)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="m21 8-4-4-4 4"/><path d="M17 4v16"/></svg>
                        </button>
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

                    {savedObsGeral && (
                        <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-amber-100 shadow-lg shadow-amber-950/10">
                            <div className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">
                                Observação da venda
                            </div>
                            <p className="whitespace-pre-wrap text-sm leading-relaxed text-amber-50">
                                {savedObsGeral}
                            </p>
                        </div>
                    )}

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
                        onAdd={
                            isSingleOSMode
                                ? canLaunchSingleOS
                                    ? handleLaunchSingleOS
                                    : undefined
                                : isVendaFechadaOuCancelada
                                    ? undefined
                                    : () => router.push(newServiceOrderUrl)
                        }
                        actionLabel={isSingleOSMode ? 'Lançar OS' : 'Nova OS'}
                        theme="slate"
                    >
                        {isSingleOSMode ? (
                            showSingleOSCard ? (
                                <SingleServiceOrderCard
                                    venda={venda}
                                    customer={customer}
                                    vendaItens={vendaItens}
                                    serviceOrder={singleServiceOrder}
                                    serviceOrders={serviceOrders}
                                    dependentes={dependentes}
                                    oftalmologistas={oftalmologistas}
                                    employees={employees}
                                    onDataReload={async () => {
                                        setIsSingleOSDraftOpen(false)
                                        setIsSingleOSCollapsed(false)
                                        await onDataReload()
                                    }}
                                    onCancelDraft={() => setIsSingleOSDraftOpen(false)}
                                    orderIndex={singleOSIndex}
                                    orderCount={serviceOrders.length}
                                    isCollapsed={isSingleOSCollapsed}
                                    onToggleCollapsed={() => setIsSingleOSCollapsed((current) => !current)}
                                    onPreviousOrder={handlePreviousSingleOS}
                                    onNextOrder={handleNextSingleOS}
                                    disabled={isVendaFechadaOuCancelada}
                                />
                            ) : (
                                <div className="p-2">
                                    <div className="text-center py-6 text-slate-500 text-xs font-medium italic border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                                        Nenhuma OS registrada. Clique em "Lançar OS" para criar a OS desta venda.
                                    </div>
                                </div>
                            )
                        ) : (
                            <div className="p-2">
                                {existingServiceOrderUrl ? (
                                    <button
                                        type="button"
                                        onClick={() => router.push(existingServiceOrderUrl)}
                                        className="w-full rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-5 text-left transition-all hover:border-blue-500/30 hover:bg-blue-500/5"
                                    >
                                        <div className="flex items-center justify-between gap-4">
                                            <div>
                                                <div className="text-sm font-black uppercase tracking-[0.2em] text-slate-200">
                                                    Ordens de Serviço
                                                </div>
                                            </div>
                                            <div className="shrink-0 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-blue-300">
                                                Abrir OS
                                            </div>
                                        </div>
                                    </button>
                                ) : (
                                    <div className="text-center py-6 text-slate-500 text-xs font-medium italic border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                                        Nenhuma OS registrada nesta venda.
                                    </div>
                                )}
                            </div>
                        )}
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
                            <ListaPagamentos
                                pagamentos={pagamentos}
                                vendaId={venda.id}
                                storeId={venda.store_id}
                                onDelete={onDataReload}
                                disabled={isVendaFechadaOuCancelada}
                                whatsappReceiptEnabled={isWhatsAppAutomaticEnabled}
                            />
                        </div>
                    </SectionCard>

                    {/* QUADRO 4: PARCELAMENTO (LARANJA - Financeiro) */}
                    {modules.installments && <SectionCard
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
                                    whatsappReceiptEnabled={isWhatsAppAutomaticEnabled}
                                />
                            ) : (
                                <div className="text-center py-6 text-slate-500 text-xs font-medium italic border-2 border-dashed border-white/10 rounded-xl bg-white/5">
                                    Nenhum parcelamento registrado. Clique em "Novo Parcelamento" para criar.
                                </div>
                            )}
                        </div>
                    </SectionCard>}

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
                                disabled={venda.status === 'Cancelada' || isSavingObs}
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
                </div>
                <div className="pl-6 border-l border-white/10 ml-6">
                    <VendaActions
                        venda={venda}
                        vendaItens={vendaItens}
                        customer={customer}
                        onStatusChange={onDataReload}
                        isVendaFechada={isVendaFechadaOuCancelada}
                        onPrint={() => setIsPrintModalOpen(true)}
                        nfEmitida={nfEmitida}
                        onNFCeSuccess={handleNFCeSuccess}
                        onNFCeModalClose={handleNFCeModalClose}
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
            {modules.installments && <SimpleModal
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
                    whatsappReceiptEnabled={isWhatsAppAutomaticEnabled}
                />
            </SimpleModal>}

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

            {/* Modal de Transferência de Titularidade */}
            {customer && (
                <TransferVendaModal
                    isOpen={isTransferModalOpen}
                    onClose={() => setIsTransferModalOpen(false)}
                    vendaId={venda.id}
                    storeId={venda.store_id}
                    currentCustomerId={customer.id}
                    onSuccess={onDataReload}
                />
            )}

            {/* Modal de Dados Rápidos do Cliente */}
            {customer && (
                <CustomerQuickInfoModal
                    isOpen={isCustomerInfoModalOpen}
                    onClose={() => setIsCustomerInfoModalOpen(false)}
                    customer={customer}
                    storeId={venda.store_id}
                />
            )}

        </div>
    )
}

