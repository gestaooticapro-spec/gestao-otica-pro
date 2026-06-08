'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
    AlertTriangle,
    Archive,
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock,
    DollarSign,
    Loader2,
    MessageCircle,
    Microscope,
    Save,
    Search,
    Truck,
    User,
    Wallet,
    Wrench
} from 'lucide-react'
import { toast } from 'sonner'
import { getWhatsAppLink } from '@/lib/utils'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import {
    EmployeeSimple,
    LabOSResult,
    getEmployees,
    getReadyOSForDelivery,
    updateLabTracking
} from '@/lib/actions/lab.actions'
import { currentPathWithSearch, withReturnTo } from '@/lib/return-navigation'


function formatForInput(isoString: string | null) {
    if (!isoString) return ''
    return new Date(isoString).toISOString().slice(0, 16)
}

function getDaysWaiting(dateString: string | null) {
    if (!dateString) return 0
    const readyDate = new Date(dateString)
    const today = new Date()
    const diffTime = Math.abs(today.getTime() - readyDate.getTime())
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

export default function EntregaPage() {
    const params = useParams()
    const pathname = usePathname()
    const router = useRouter()
    const searchParams = useSearchParams()
    const storeId = parseInt(params.storeId as string, 10)
    const { preference } = useBackgroundPreference()
    const currentUrl = currentPathWithSearch(pathname, searchParams)

    const [items, setItems] = useState<LabOSResult[]>([])
    const [employees, setEmployees] = useState<EmployeeSimple[]>([])
    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [isPending, startTransition] = useTransition()

    async function loadData() {
        setLoading(true)
        const [deliveryItems, employeeList] = await Promise.all([
            getReadyOSForDelivery(storeId),
            getEmployees(storeId)
        ])

        setItems(deliveryItems)
        setEmployees(employeeList)
        setSelectedOS((current) => {
            if (!current) return null
            return deliveryItems.find((item) => item.id === current.id) || null
        })
        setLoading(false)
    }

    useEffect(() => {
        if (!isNaN(storeId)) {
            loadData()
        }
    }, [storeId])

    const filteredItems = useMemo(() => {
        const term = search.trim().toLowerCase()
        if (!term) return items

        return items.filter((item) => {
            const patientName = (item.dependente_name || item.customer_name || '').toLowerCase()
            const customerName = (item.customer_name || '').toLowerCase()
            const protocol = (item.protocolo_fisico || '').toLowerCase()
            return (
                patientName.includes(term) ||
                customerName.includes(term) ||
                protocol.includes(term) ||
                String(item.id).includes(term)
            )
        })
    }, [items, search])

    const handleSelect = (item: LabOSResult) => {
        if (item.status === 'Em Aberto') {
            if (item.venda_id) {
                router.push(withReturnTo(`/dashboard/loja/${storeId}/vendas/${item.venda_id}/experimental`, currentUrl))
            } else {
                router.push(`/dashboard/loja/${storeId}/vendas`)
            }
            return
        }

        setSelectedOS(item)
    }

    const handleSave = async (formData: FormData) => {
        if (!selectedOS) return

        startTransition(async () => {
            const result = await updateLabTracking(selectedOS.id, storeId, formData)
            if (!result.success) {
                toast.error(result.message || 'Erro ao confirmar entrega.')
                return
            }

            toast.success('Entrega confirmada.')
            setItems((current) => current.filter((item) => item.id !== selectedOS.id))
            setSelectedOS(null)
        })
    }

    return (
        <div className="relative min-h-[calc(100vh-64px)] flex flex-col bg-slate-950 overflow-hidden">
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <img src="/gaveta.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-25 fixed" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950" />
            </div>

            <div className="relative z-10 p-6 max-w-7xl mx-auto w-full flex-1 flex flex-col gap-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div className="flex items-center gap-3">
                        <Link
                            href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
                            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                            title="Voltar para o Painel"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>

                        <div>
                            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-amber-300 to-orange-400 flex items-center gap-3 tracking-wider">
                                <Truck className="h-8 w-8 text-amber-400" />
                                Entrega de Óculos
                            </h1>
                            <p className="text-slate-400 font-medium mt-1">
                                OS prontas aguardando retirada. Clique no card para finalizar entrega ou seguir para o fechamento da venda.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <BackgroundToggle />
                        <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 px-4 py-2 rounded-2xl font-bold flex items-center gap-3 shadow-[0_0_20px_rgba(245,158,11,0.08)]">
                            <span className="text-2xl">{items.length}</span>
                            <span className="text-xs uppercase tracking-widest opacity-70">Prontas</span>
                        </div>
                    </div>
                </div>

                <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-3xl p-4 lg:p-5 shadow-2xl">
                    <div className="flex flex-col lg:flex-row gap-4 lg:items-center">
                        <div className="flex-1 relative">
                            <Search className="absolute left-4 top-3.5 h-4 w-4 text-slate-500" />
                            <input
                                type="text"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                placeholder="Buscar por OS, protocolo, cliente ou dependente..."
                                className="w-full rounded-2xl bg-black/30 border border-white/10 pl-11 pr-4 py-3 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/30 transition-all"
                            />
                        </div>
                        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1">
                            Clique no card para decidir o próximo passo
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-amber-400" />
                        <p className="font-bold uppercase tracking-widest text-xs">Carregando entregas...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm px-6 py-16">
                        <Archive className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-bold text-slate-300">Nenhuma OS pronta para entrega.</p>
                        <p className="text-sm mt-2 text-slate-500 max-w-md text-center">
                            Assim que uma ordem for marcada como montada e ainda não entregue, ela aparece aqui automaticamente.
                        </p>
                    </div>
                ) : (
                    <div className={`grid gap-6 ${selectedOS ? 'xl:grid-cols-[minmax(0,1fr)_420px]' : 'grid-cols-1'}`}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 content-start">
                            {filteredItems.length === 0 ? (
                                <div className="md:col-span-2 bg-white/5 backdrop-blur-sm rounded-3xl border border-white/10 p-12 text-center text-slate-500">
                                    Nenhuma OS encontrada para esse filtro.
                                </div>
                            ) : (
                                filteredItems.map((item) => {
                                    const diasEspera = getDaysWaiting(item.dt_montado_em)
                                    const isAtrasado = diasEspera > 7
                                    const isOpenSale = item.status === 'Em Aberto'
                                    const patientName = item.dependente_name || item.customer_name || 'Consumidor'
                                    const customerName = item.customer_name || 'Cliente'
                                    const phone = item.customer_phone || ''
                                    const whatsappMessage = `Olá ${customerName.split(' ')[0]}! Tudo bem? Aqui é da Ótica. Os óculos de *${patientName}* ficaram prontos e estão aguardando retirada.`
                                    const whatsappLink = getWhatsAppLink(phone, whatsappMessage)

                                    return (
                                        <div
                                            key={item.id}
                                            onClick={() => handleSelect(item)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault()
                                                    handleSelect(item)
                                                }
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            className={`text-left bg-white/5 backdrop-blur-md rounded-2xl shadow-lg border overflow-hidden hover:shadow-2xl hover:bg-white/10 transition-all group cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400/50 ${isAtrasado ? 'border-rose-500/30' : 'border-white/10'} ${selectedOS?.id === item.id ? 'ring-2 ring-emerald-400/60 border-emerald-400/40' : ''}`}
                                        >
                                            <div className={`px-4 py-2 text-xs font-bold uppercase tracking-wider flex justify-between items-center ${isAtrasado ? 'bg-rose-500/20 text-rose-300 border-b border-rose-500/20' : 'bg-emerald-500/20 text-emerald-300 border-b border-emerald-500/20'}`}>
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    Pronto há {diasEspera} dia{diasEspera !== 1 && 's'}
                                                </span>
                                                <span className="opacity-70">OS #{item.id}</span>
                                            </div>

                                            <div className="p-5 space-y-5">
                                                <div>
                                                    <h3 className="font-bold text-slate-100 text-lg truncate flex items-center gap-2" title={patientName}>
                                                        <User className="h-5 w-5 text-slate-500 shrink-0" />
                                                        {patientName}
                                                    </h3>
                                                    {item.dependente_name && (
                                                        <p className="text-xs text-slate-400 pl-7 truncate">
                                                            Resp: {customerName}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-slate-500 pl-7 mt-1">
                                                        Montado em: {item.dt_montado_em ? new Date(item.dt_montado_em).toLocaleDateString('pt-BR') : 'N/A'}
                                                    </p>
                                                    {item.protocolo_fisico && (
                                                        <p className="text-[10px] text-amber-300/80 pl-7 mt-1 font-mono uppercase tracking-widest">
                                                            Protocolo: {item.protocolo_fisico}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex items-center justify-between gap-3">
                                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full border ${isOpenSale ? 'bg-amber-500/15 text-amber-300 border-amber-500/25' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25'}`}>
                                                        {isOpenSale ? 'Pagamento pendente' : 'Pronto para entregar'}
                                                    </span>

                                                    {phone ? (
                                                        <a
                                                            href={whatsappLink}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={(event) => event.stopPropagation()}
                                                            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600/80 text-white hover:bg-emerald-500 shadow-lg shadow-emerald-900/20 border border-emerald-500/40 transition-all"
                                                        >
                                                            <MessageCircle className="h-4 w-4" />
                                                            Avisar
                                                        </a>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-white/5 text-slate-600 border border-white/5 opacity-60">
                                                            <AlertTriangle className="h-4 w-4" />
                                                            Sem Whats
                                                        </span>
                                                    )}
                                                </div>

                                                <div className="grid grid-cols-2 gap-3">
                                                    <div className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-300 border border-white/5">
                                                        <DollarSign className="h-4 w-4" />
                                                        Ver Venda
                                                    </div>
                                                    <div className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold border ${isOpenSale ? 'bg-amber-500/15 text-amber-200 border-amber-500/25' : 'bg-emerald-500/15 text-emerald-200 border-emerald-500/25'}`}>
                                                        {isOpenSale ? <Wallet className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                                                        {isOpenSale ? 'Ir para Fechamento' : 'Confirmar Entrega'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )
                                })
                            )}
                        </div>

                        {selectedOS && (
                            <div className="xl:sticky xl:top-6 h-fit bg-slate-950/80 backdrop-blur-xl rounded-3xl border border-emerald-500/20 shadow-2xl overflow-hidden">
                                <div className="bg-emerald-950/30 border-b border-emerald-500/20 p-5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                                            <Truck className="h-5 w-5 text-emerald-400" />
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-lg text-emerald-100">
                                                Entregar OS #{selectedOS.id}
                                            </h2>
                                            <p className="text-[10px] uppercase tracking-wider text-emerald-500/60 font-bold">
                                                Confirmação de recebimento
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedOS(null)}
                                        className="text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                                    >
                                        Fechar
                                    </button>
                                </div>

                                <form key={selectedOS.id} action={handleSave} className="flex flex-col">
                                    <div className="p-5 space-y-5">
                                        <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-2xl p-4 text-emerald-100">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400/80 mb-2">
                                                Paciente
                                            </p>
                                            <p className="font-bold text-lg">{selectedOS.dependente_name || selectedOS.customer_name}</p>
                                            {selectedOS.dependente_name && (
                                                <p className="text-xs text-emerald-100/70 mt-1">
                                                    Responsável: {selectedOS.customer_name}
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5 mb-1.5">
                                                    <Calendar className="h-3 w-3" /> Pedido Em
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_pedido_em"
                                                    defaultValue={formatForInput(selectedOS.dt_pedido_em)}
                                                    className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none transition-colors"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5 mb-1.5">
                                                    <User className="h-3 w-3" /> Pedido Por
                                                </label>
                                                <select
                                                    name="lab_pedido_por_id"
                                                    defaultValue={selectedOS.lab_pedido_por_id || ''}
                                                    className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none appearance-none cursor-pointer"
                                                >
                                                    <option value="" className="bg-slate-900 text-slate-400">Selecione...</option>
                                                    {employees.map((employee) => (
                                                        <option key={employee.id} value={employee.id} className="bg-slate-900 text-white">
                                                            {employee.name}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5 mb-1.5">
                                                    <Microscope className="h-3 w-3" /> Laboratório
                                                </label>
                                                <input
                                                    type="text"
                                                    name="lab_nome"
                                                    defaultValue={selectedOS.lab_nome || ''}
                                                    className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5 mb-1.5">
                                                    <Calendar className="h-3 w-3" /> Lente Chegou
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_lente_chegou"
                                                    defaultValue={formatForInput(selectedOS.dt_lente_chegou)}
                                                    className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-emerald-500/70 flex items-center gap-1.5 mb-1.5">
                                                    <Wrench className="h-3 w-3" /> Montado Em
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_montado_em"
                                                    defaultValue={formatForInput(selectedOS.dt_montado_em)}
                                                    className="w-full bg-emerald-950/40 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-emerald-300 bg-emerald-500/20 border border-emerald-500/30 px-2 py-1 rounded-full inline-flex items-center gap-1.5 mb-2">
                                                    <CheckCircle2 className="h-3 w-3" /> Entregue Cliente
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_entregue_em"
                                                    defaultValue={formatForInput(selectedOS.dt_entregue_em) || formatForInput(new Date().toISOString())}
                                                    className="w-full bg-emerald-950 border border-emerald-400/50 rounded-xl px-3 py-2.5 text-sm font-bold text-emerald-300 shadow-lg shadow-emerald-900/40 focus:ring-2 focus:ring-emerald-500/50 outline-none"
                                                    autoFocus
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                                        <button
                                            type="button"
                                            onClick={() => selectedOS.venda_id && router.push(withReturnTo(
                                                `/dashboard/loja/${storeId}/vendas/${selectedOS.venda_id}/os?os_id=${selectedOS.id}`,
                                                withReturnTo(`/dashboard/loja/${storeId}/vendas/${selectedOS.venda_id}/experimental`, currentUrl)
                                            ))}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 transition-all"
                                        >
                                            <Search className="h-4 w-4" />
                                            Abrir OS Completa
                                        </button>

                                        <button
                                            disabled={isPending}
                                            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all active:scale-95 text-sm uppercase tracking-wide disabled:opacity-60"
                                        >
                                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            Confirmar Entrega
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <style jsx global>{`
                .custom-scrollbar::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                .custom-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 10px;
                }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                    background: rgba(245, 158, 11, 0.35);
                }
            `}</style>
        </div>
    )
}
