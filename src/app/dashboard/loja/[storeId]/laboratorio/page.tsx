'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock3,
    GripVertical,
    Loader2,
    Microscope,
    PackageCheck,
    Save,
    Search,
    Truck,
    User,
    Wrench
} from 'lucide-react'
import { toast } from 'sonner'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import {
    EmployeeSimple,
    LabOSResult,
    advanceLabStage,
    getEmployees,
    getOpenLabOS,
    updateLabTracking
} from '@/lib/actions/lab.actions'

type LabStage = 'falta_pedir' | 'lentes_pedidas' | 'lentes_chegaram' | 'oculos_montado'

const STAGE_META: Record<LabStage, { title: string, subtitle: string, color: string, border: string, badge: string }> = {
    falta_pedir: {
        title: 'Falta Pedir',
        subtitle: 'OS sem pedido ao laboratório',
        color: 'text-rose-300',
        border: 'border-rose-500/25',
        badge: 'bg-rose-500/15 text-rose-200 border-rose-500/20'
    },
    lentes_pedidas: {
        title: 'Lentes Pedidas',
        subtitle: 'Pedido feito, aguardando chegada',
        color: 'text-amber-300',
        border: 'border-amber-500/25',
        badge: 'bg-amber-500/15 text-amber-200 border-amber-500/20'
    },
    lentes_chegaram: {
        title: 'Lentes Chegaram',
        subtitle: 'Lente recebida, aguardando montagem',
        color: 'text-sky-300',
        border: 'border-sky-500/25',
        badge: 'bg-sky-500/15 text-sky-200 border-sky-500/20'
    },
    oculos_montado: {
        title: 'Óculos Montado',
        subtitle: 'Pronto para retirada',
        color: 'text-emerald-300',
        border: 'border-emerald-500/25',
        badge: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/20'
    }
}

const STAGE_ORDER: LabStage[] = ['falta_pedir', 'lentes_pedidas', 'lentes_chegaram', 'oculos_montado']

function formatForInput(isoString: string | null) {
    if (!isoString) return ''
    return new Date(isoString).toISOString().slice(0, 16)
}

function getLabStage(item: LabOSResult): LabStage {
    if (!item.dt_pedido_em) return 'falta_pedir'
    if (!item.dt_lente_chegou) return 'lentes_pedidas'
    if (!item.dt_montado_em) return 'lentes_chegaram'
    return 'oculos_montado'
}

function getDaysSince(dateString: string | null) {
    if (!dateString) return 0
    const date = new Date(dateString)
    const now = new Date()
    return Math.ceil(Math.abs(now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))
}

function getNextStage(currentStage: LabStage): LabStage | null {
    const currentIndex = STAGE_ORDER.indexOf(currentStage)
    return STAGE_ORDER[currentIndex + 1] || null
}

function getAutoAdvanceField(currentStage: LabStage): 'dt_pedido_em' | 'dt_lente_chegou' | 'dt_montado_em' | null {
    if (currentStage === 'falta_pedir') return 'dt_pedido_em'
    if (currentStage === 'lentes_pedidas') return 'dt_lente_chegou'
    if (currentStage === 'lentes_chegaram') return 'dt_montado_em'
    return null
}

export default function LaboratorioPage() {
    const params = useParams()
    const router = useRouter()
    const storeId = parseInt(params.storeId as string, 10)
    const { preference } = useBackgroundPreference()

    const [items, setItems] = useState<LabOSResult[]>([])
    const [employees, setEmployees] = useState<EmployeeSimple[]>([])
    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [draggedId, setDraggedId] = useState<number | null>(null)
    const [dropStage, setDropStage] = useState<LabStage | null>(null)
    const [isPending, startTransition] = useTransition()

    async function loadData() {
        setLoading(true)
        const [labItems, employeeList] = await Promise.all([
            getOpenLabOS(storeId),
            getEmployees(storeId)
        ])

        setItems(labItems)
        setEmployees(employeeList)
        setSelectedOS((current) => {
            if (!current) return null
            return labItems.find((item) => item.id === current.id) || null
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

    const itemsByStage = useMemo(() => {
        return STAGE_ORDER.reduce((acc, stage) => {
            acc[stage] = filteredItems.filter((item) => getLabStage(item) === stage)
            return acc
        }, {
            falta_pedir: [] as LabOSResult[],
            lentes_pedidas: [] as LabOSResult[],
            lentes_chegaram: [] as LabOSResult[],
            oculos_montado: [] as LabOSResult[]
        })
    }, [filteredItems])

    const handleSave = async (formData: FormData) => {
        if (!selectedOS) return

        startTransition(async () => {
            const result = await updateLabTracking(selectedOS.id, storeId, formData)
            if (!result.success) {
                toast.error(result.message || 'Erro ao salvar laboratório.')
                return
            }

            toast.success('Rastreio atualizado.')
            await loadData()
        })
    }

    const handleDrop = (targetStage: LabStage) => {
        if (!draggedId) return
        const draggedItem = items.find((item) => item.id === draggedId)
        if (!draggedItem) return

        const currentStage = getLabStage(draggedItem)
        const nextStage = getNextStage(currentStage)
        const field = getAutoAdvanceField(currentStage)

        setDropStage(null)
        setDraggedId(null)

        if (!field || !nextStage) {
            toast.error('Esta OS já está na última etapa do laboratório.')
            return
        }

        if (targetStage !== nextStage) {
            toast.error('Arraste apenas para a próxima coluna.')
            return
        }

        startTransition(async () => {
            const result = await advanceLabStage(draggedItem.id, storeId, field)
            if (!result.success) {
                toast.error(result.message)
                return
            }

            toast.success(result.message)
            await loadData()
        })
    }

    return (
        <div className="relative min-h-[calc(100vh-64px)] flex flex-col bg-slate-950 overflow-hidden">
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/vendasos.jpg')] bg-cover bg-center opacity-30 fixed" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950" />
            </div>

            <div className="relative z-10 p-6 max-w-[1600px] mx-auto w-full flex-1 flex flex-col gap-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="space-y-3">
                        <Link
                            href={`/dashboard/loja/${storeId}`}
                            className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-white transition-colors"
                        >
                            <ArrowLeft className="h-4 w-4" />
                            Voltar
                        </Link>

                        <div>
                            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-400 flex items-center gap-3 tracking-tight">
                                <Microscope className="h-8 w-8 text-sky-300" />
                                Fluxo de Laboratório
                            </h1>
                            <p className="text-slate-400 font-medium mt-1">
                                Arraste os cards para a próxima etapa ou clique para editar as datas manualmente.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <BackgroundToggle />
                        <div className="bg-sky-500/10 border border-sky-500/20 text-sky-200 px-4 py-2 rounded-2xl font-bold flex items-center gap-3 shadow-[0_0_20px_rgba(56,189,248,0.08)]">
                            <span className="text-2xl">{items.length}</span>
                            <span className="text-xs uppercase tracking-widest opacity-70">OS abertas</span>
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
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder="Buscar por OS, protocolo, cliente ou dependente..."
                                className="w-full rounded-2xl bg-black/30 border border-white/10 pl-11 pr-4 py-3 text-sm font-medium text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-500/30 transition-all"
                            />
                        </div>
                        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 px-1">
                            Drag and drop sequencial entre colunas
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-4">
                        <Loader2 className="h-10 w-10 animate-spin text-sky-300" />
                        <p className="font-bold uppercase tracking-widest text-xs">Carregando laboratório...</p>
                    </div>
                ) : items.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 border-2 border-dashed border-white/10 rounded-3xl bg-white/5 backdrop-blur-sm px-6 py-16">
                        <PackageCheck className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-bold text-slate-300">Nenhuma OS aberta no laboratório.</p>
                        <p className="text-sm mt-2 text-slate-500 max-w-md text-center">
                            Assim que uma OS for criada e ainda não entregue, ela aparece aqui para acompanhamento.
                        </p>
                    </div>
                ) : (
                    <div className={`grid gap-6 ${selectedOS ? '2xl:grid-cols-[minmax(0,1fr)_420px]' : 'grid-cols-1'}`}>
                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-start">
                            {STAGE_ORDER.map((stage) => {
                                const meta = STAGE_META[stage]
                                const stageItems = itemsByStage[stage]
                                const isDropActive = dropStage === stage

                                return (
                                    <div
                                        key={stage}
                                        onDragOver={(event) => {
                                            event.preventDefault()
                                            setDropStage(stage)
                                        }}
                                        onDragLeave={() => setDropStage((current) => current === stage ? null : current)}
                                        onDrop={(event) => {
                                            event.preventDefault()
                                            handleDrop(stage)
                                        }}
                                        className={`rounded-3xl border bg-black/20 backdrop-blur-xl shadow-2xl min-h-[420px] transition-all ${meta.border} ${isDropActive ? 'ring-2 ring-white/20 bg-white/5' : 'border-white/10'}`}
                                    >
                                        <div className={`p-4 border-b border-white/10 ${meta.color}`}>
                                            <div className="flex items-center justify-between gap-3">
                                                <div>
                                                    <h2 className="text-sm font-bold uppercase tracking-wider">{meta.title}</h2>
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mt-1">
                                                        {meta.subtitle}
                                                    </p>
                                                </div>
                                                <div className={`px-2.5 py-1 rounded-full text-xs font-bold border ${meta.badge}`}>
                                                    {stageItems.length}
                                                </div>
                                            </div>
                                        </div>

                                        <div className="p-3 space-y-3">
                                            {stageItems.length === 0 ? (
                                                <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-8 text-center text-xs font-medium text-slate-500">
                                                    Nenhuma OS nesta etapa.
                                                </div>
                                            ) : (
                                                stageItems.map((item) => {
                                                    const patientName = item.dependente_name || item.customer_name || 'Consumidor'
                                                    const currentStage = getLabStage(item)
                                                    const canDrag = currentStage !== 'oculos_montado'
                                                    const isSelected = selectedOS?.id === item.id
                                                    const waitDate =
                                                        currentStage === 'falta_pedir'
                                                            ? item.created_at
                                                            : currentStage === 'lentes_pedidas'
                                                                ? item.dt_pedido_em
                                                                : currentStage === 'lentes_chegaram'
                                                                    ? item.dt_lente_chegou
                                                                    : item.dt_montado_em
                                                    const waitingDays = getDaysSince(waitDate)

                                                    return (
                                                        <div
                                                            key={item.id}
                                                            draggable={canDrag}
                                                            onDragStart={() => setDraggedId(item.id)}
                                                            onDragEnd={() => {
                                                                setDraggedId(null)
                                                                setDropStage(null)
                                                            }}
                                                            onClick={() => setSelectedOS(item)}
                                                            onKeyDown={(event) => {
                                                                if (event.key === 'Enter' || event.key === ' ') {
                                                                    event.preventDefault()
                                                                    setSelectedOS(item)
                                                                }
                                                            }}
                                                            role="button"
                                                            tabIndex={0}
                                                            className={`rounded-2xl border bg-white/5 hover:bg-white/10 transition-all p-4 cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-400/40 ${isSelected ? 'border-sky-400/40 ring-2 ring-sky-400/30' : 'border-white/10'} ${draggedId === item.id ? 'opacity-40 scale-[0.98]' : ''}`}
                                                        >
                                                            <div className="flex items-start justify-between gap-3 mb-3">
                                                                <div>
                                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">OS #{item.id}</p>
                                                                    <h3 className="text-base font-bold text-white leading-tight mt-1">
                                                                        {patientName}
                                                                    </h3>
                                                                    {item.dependente_name && (
                                                                        <p className="text-xs text-slate-400 mt-1">
                                                                            Resp: {item.customer_name}
                                                                        </p>
                                                                    )}
                                                                </div>
                                                                <div className="flex items-center gap-1 text-slate-500">
                                                                    {canDrag && <GripVertical className="h-4 w-4" />}
                                                                </div>
                                                            </div>

                                                            <div className="space-y-2 text-xs text-slate-400">
                                                                {item.protocolo_fisico && (
                                                                    <p className="font-mono uppercase tracking-widest text-slate-500">
                                                                        Protocolo: {item.protocolo_fisico}
                                                                    </p>
                                                                )}
                                                                <div className="flex items-center gap-2">
                                                                    <Clock3 className="h-3.5 w-3.5 text-slate-500" />
                                                                    <span>Há {waitingDays} dia{waitingDays !== 1 && 's'} nesta etapa</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )
                                                })
                                            )}
                                        </div>
                                    </div>
                                )
                            })}
                        </div>

                        {selectedOS && (
                            <div className="2xl:sticky 2xl:top-6 h-fit bg-slate-950/80 backdrop-blur-xl rounded-3xl border border-sky-500/20 shadow-2xl overflow-hidden">
                                <div className="bg-sky-950/30 border-b border-sky-500/20 p-5 flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-sky-500/10 rounded-xl border border-sky-500/20">
                                            <Microscope className="h-5 w-5 text-sky-300" />
                                        </div>
                                        <div>
                                            <h2 className="font-bold text-lg text-sky-100">
                                                OS #{selectedOS.id}
                                            </h2>
                                            <p className="text-[10px] uppercase tracking-wider text-sky-500/60 font-bold">
                                                {STAGE_META[getLabStage(selectedOS)].title}
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
                                        <div className="bg-sky-900/20 border border-sky-500/20 rounded-2xl p-4 text-sky-100">
                                            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-300/80 mb-2">
                                                Paciente
                                            </p>
                                            <p className="font-bold text-lg">{selectedOS.dependente_name || selectedOS.customer_name}</p>
                                            {selectedOS.dependente_name && (
                                                <p className="text-xs text-sky-100/70 mt-1">
                                                    Responsável: {selectedOS.customer_name}
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-1 gap-4">
                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-sky-300/70 flex items-center gap-1.5 mb-1.5">
                                                    <Calendar className="h-3 w-3" /> Pedido Em
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_pedido_em"
                                                    defaultValue={formatForInput(selectedOS.dt_pedido_em)}
                                                    className="w-full bg-sky-950/40 border border-sky-500/20 rounded-xl px-3 py-2 text-sm font-bold text-sky-100 shadow-sm focus:border-sky-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-sky-300/70 flex items-center gap-1.5 mb-1.5">
                                                    <User className="h-3 w-3" /> Pedido Por
                                                </label>
                                                <select
                                                    name="lab_pedido_por_id"
                                                    defaultValue={selectedOS.lab_pedido_por_id || ''}
                                                    className="w-full bg-sky-950/40 border border-sky-500/20 rounded-xl px-3 py-2 text-sm font-bold text-sky-100 shadow-sm focus:border-sky-400/50 outline-none appearance-none cursor-pointer"
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
                                                <label className="text-[10px] font-bold uppercase text-sky-300/70 flex items-center gap-1.5 mb-1.5">
                                                    <Microscope className="h-3 w-3" /> Laboratório
                                                </label>
                                                <input
                                                    type="text"
                                                    name="lab_nome"
                                                    defaultValue={selectedOS.lab_nome || ''}
                                                    className="w-full bg-sky-950/40 border border-sky-500/20 rounded-xl px-3 py-2 text-sm font-bold text-sky-100 shadow-sm focus:border-sky-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-sky-300/70 flex items-center gap-1.5 mb-1.5">
                                                    <Truck className="h-3 w-3" /> Lente Chegou
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_lente_chegou"
                                                    defaultValue={formatForInput(selectedOS.dt_lente_chegou)}
                                                    className="w-full bg-sky-950/40 border border-sky-500/20 rounded-xl px-3 py-2 text-sm font-bold text-sky-100 shadow-sm focus:border-sky-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-sky-300/70 flex items-center gap-1.5 mb-1.5">
                                                    <Wrench className="h-3 w-3" /> Montado Em
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_montado_em"
                                                    defaultValue={formatForInput(selectedOS.dt_montado_em)}
                                                    className="w-full bg-sky-950/40 border border-sky-500/20 rounded-xl px-3 py-2 text-sm font-bold text-sky-100 shadow-sm focus:border-sky-400/50 outline-none"
                                                />
                                            </div>

                                            <div>
                                                <label className="text-[10px] font-bold uppercase text-slate-500 flex items-center gap-1.5 mb-1.5">
                                                    <CheckCircle2 className="h-3 w-3" /> Entregue Cliente
                                                </label>
                                                <input
                                                    type="datetime-local"
                                                    name="dt_entregue_em"
                                                    defaultValue={formatForInput(selectedOS.dt_entregue_em)}
                                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-slate-300 shadow-sm focus:border-white/20 outline-none"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-4 border-t border-white/10 bg-white/5 flex flex-col sm:flex-row gap-3 sm:justify-between sm:items-center">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                if (getLabStage(selectedOS) === 'oculos_montado') {
                                                    router.push(`/dashboard/loja/${storeId}/entrega`)
                                                } else if (selectedOS.venda_id) {
                                                    router.push(`/dashboard/loja/${storeId}/vendas/${selectedOS.venda_id}/os?os_id=${selectedOS.id}`)
                                                }
                                            }}
                                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-white/5 text-slate-300 hover:bg-white/10 border border-white/10 transition-all"
                                        >
                                            {getLabStage(selectedOS) === 'oculos_montado' ? <PackageCheck className="h-4 w-4" /> : <Search className="h-4 w-4" />}
                                            {getLabStage(selectedOS) === 'oculos_montado' ? 'Ir para Entrega' : 'Abrir OS Completa'}
                                        </button>

                                        <button
                                            disabled={isPending}
                                            className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl shadow-lg shadow-sky-900/30 transition-all active:scale-95 text-sm uppercase tracking-wide disabled:opacity-60"
                                        >
                                            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                            Salvar Ajustes
                                        </button>
                                    </div>
                                </form>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    )
}
