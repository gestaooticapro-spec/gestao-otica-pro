'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation'
import {
    ArrowLeft,
    Calendar,
    CheckCircle2,
    Clock3,
    Grid3X3,
    GripVertical,
    Loader2,
    MessageCircle,
    Microscope,
    PackageCheck,
    Save,
    Search,
    Tag,
    Truck,
    User,
    Wrench
} from 'lucide-react'
import { toast } from 'sonner'
import { BackgroundToggle, useBackgroundPreference } from '@/components/ui/BackgroundToggle'
import { sendManualWhatsAppFromClient } from '@/lib/whatsapp/manual-client'
import { currentPathWithSearch, withReturnTo } from '@/lib/return-navigation'
import {
    EmployeeSimple,
    LabOSResult,
    NfcTagResult,
    advanceLabStage,
    getEmployees,
    getNfcTagsForLab,
    getOpenLabOS,
    regressLabStage,
    updateLabTracking
} from '@/lib/actions/lab.actions'
import LensGradeMonitorModal from '@/components/modals/LensGradeMonitorModal'

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
    const date = new Date(isoString)
    const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    return localDate.toISOString().slice(0, 16)
}

function getLabStage(item: LabOSResult): LabStage {
    if (!item.dt_pedido_em) return 'falta_pedir'
    if (!item.dt_lente_chegou) return 'lentes_pedidas'
    if (item.os_enviada_ao_lab && item.dt_montado_no_lab) return 'oculos_montado'
    if (!item.dt_montado_em) return 'lentes_chegaram'
    return 'oculos_montado'
}

function formatDateTime(isoString: string | null) {
    if (!isoString) return ''
    return new Date(isoString).toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
    })
}

function formatStageElapsed(dateString: string | null) {
    if (!dateString) return 'Agora'

    const date = new Date(dateString)
    const now = new Date()
    const diffMs = Math.max(0, now.getTime() - date.getTime())
    const isSameLocalDay = date.toLocaleDateString('pt-BR') === now.toLocaleDateString('pt-BR')

    if (isSameLocalDay) {
        const totalMinutes = Math.floor(diffMs / (1000 * 60))
        const hours = Math.floor(totalMinutes / 60)
        const minutes = totalMinutes % 60
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    }

    const days = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
    return `${days} dia${days !== 1 ? 's' : ''}`
}

function getNextStage(currentStage: LabStage): LabStage | null {
    const currentIndex = STAGE_ORDER.indexOf(currentStage)
    return STAGE_ORDER[currentIndex + 1] || null
}

function getPrevStage(currentStage: LabStage): LabStage | null {
    const currentIndex = STAGE_ORDER.indexOf(currentStage)
    return STAGE_ORDER[currentIndex - 1] || null
}

function getAutoAdvanceField(currentStage: LabStage, item?: LabOSResult): 'dt_pedido_em' | 'dt_lente_chegou' | 'dt_montado_em' | 'dt_montado_no_lab' | null {
    if (currentStage === 'falta_pedir') return 'dt_pedido_em'
    if (currentStage === 'lentes_pedidas') return 'dt_lente_chegou'
    if (currentStage === 'lentes_chegaram' && item?.os_enviada_ao_lab) return 'dt_montado_no_lab'
    if (currentStage === 'lentes_chegaram') return 'dt_montado_em'
    return null
}

function getRegressField(currentStage: LabStage, item?: LabOSResult): 'dt_pedido_em' | 'dt_lente_chegou' | 'dt_montado_em' | 'dt_montado_no_lab' | null {
    if (currentStage === 'lentes_pedidas') return 'dt_pedido_em'
    if (currentStage === 'lentes_chegaram') return 'dt_lente_chegou'
    if (currentStage === 'oculos_montado' && item?.os_enviada_ao_lab && !item.dt_montado_em) return 'dt_montado_no_lab'
    if (currentStage === 'oculos_montado') return 'dt_montado_em'
    return null
}

export default function LaboratorioPage() {
    const params = useParams()
    const router = useRouter()
    const pathname = usePathname()
    const searchParams = useSearchParams()
    const currentLabUrl = currentPathWithSearch(pathname, searchParams)
    const storeId = parseInt(params.storeId as string, 10)
    const { preference } = useBackgroundPreference()

    const [items, setItems] = useState<LabOSResult[]>([])
    const [employees, setEmployees] = useState<EmployeeSimple[]>([])
    const [selectedOS, setSelectedOS] = useState<LabOSResult | null>(null)
    const [search, setSearch] = useState('')
    const [loading, setLoading] = useState(true)
    const [draggedId, setDraggedId] = useState<number | null>(null)
    const [dropStage, setDropStage] = useState<LabStage | null>(null)
    const [sendingWhatsAppKey, setSendingWhatsAppKey] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [gradeModalOpen, setGradeModalOpen] = useState(false)
    const [tagsModalOpen, setTagsModalOpen] = useState(false)
    const [nfcTags, setNfcTags] = useState<NfcTagResult[]>([])

    async function loadData() {
        setLoading(true)
        const [labItems, employeeList, tagList] = await Promise.all([
            getOpenLabOS(storeId),
            getEmployees(storeId),
            getNfcTagsForLab(storeId)
        ])

        setItems(labItems)
        setEmployees(employeeList)
        setNfcTags(tagList)
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
        const prevStage = getPrevStage(currentStage)

        setDropStage(null)
        setDraggedId(null)

        if (targetStage === nextStage) {
            const field = getAutoAdvanceField(currentStage, draggedItem)
            if (!field) return
            startTransition(async () => {
                const result = await advanceLabStage(draggedItem.id, storeId, field)
                if (!result.success) {
                    toast.error(result.message)
                    return
                }
                toast.success(result.message)
                await loadData()
            })
            return
        }

        if (targetStage === prevStage) {
            const field = getRegressField(currentStage, draggedItem)
            if (!field) return
            startTransition(async () => {
                const result = await regressLabStage(draggedItem.id, storeId, field)
                if (!result.success) {
                    toast.error(result.message)
                    return
                }
                toast.success(result.message)
                await loadData()
            })
            return
        }

        toast.error('Arraste apenas para a coluna anterior ou a próxima.')
    }

    const sendLabWhatsApp = async (input: {
        key: string
        phone: string
        message: string
        source: string
        osId: number
        stage: LabStage
    }) => {
        if (sendingWhatsAppKey) return
        setSendingWhatsAppKey(input.key)
        try {
            await sendManualWhatsAppFromClient({
                storeId,
                remotePhone: input.phone,
                messageText: input.message,
                messageType: 'service_order',
                source: input.source,
                metadata: {
                    osId: input.osId,
                    stage: input.stage,
                },
            })
        } finally {
            setSendingWhatsAppKey(null)
        }
    }

    return (
        <>
        <LensGradeMonitorModal
            isOpen={gradeModalOpen}
            onClose={() => setGradeModalOpen(false)}
            storeId={storeId}
        />
        {tagsModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
                <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-cyan-500/20 bg-slate-950 shadow-2xl">
                    <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                        <div>
                            <h2 className="flex items-center gap-2 text-lg font-bold text-cyan-100">
                                <Tag className="h-5 w-5 text-cyan-300" />
                                Tags NFC da loja
                            </h2>
                            <p className="mt-1 text-xs text-slate-500">Lista de tags cadastradas e seus vÃ­nculos atuais.</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setTagsModalOpen(false)}
                            className="rounded-xl border border-white/10 px-3 py-2 text-sm font-bold text-slate-400 hover:bg-white/10 hover:text-white"
                        >
                            Fechar
                        </button>
                    </div>

                    <div className="max-h-[65vh] overflow-y-auto p-4">
                        {nfcTags.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-white/10 px-4 py-10 text-center text-sm text-slate-500">
                                Nenhuma tag NFC cadastrada nesta loja.
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {nfcTags.map((tag) => {
                                    const isOccupied = tag.current_service_order_id !== null
                                    const isActive = tag.status === 'active'

                                    return (
                                        <div key={tag.id} className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                            <div>
                                                <p className="font-mono text-sm font-bold text-white">{tag.id}</p>
                                                <p className="mt-1 text-xs text-slate-500">
                                                    {isOccupied ? `OS ${tag.current_service_order_id}` : 'Sem OS vinculada'}
                                                </p>
                                            </div>
                                            <span className={`w-fit rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wider ${isActive && isOccupied ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : isActive ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}>
                                                {!isActive ? 'Inativa' : isOccupied ? 'Ocupada' : 'Livre'}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        )}
        <div className="relative min-h-[calc(100vh-64px)] flex flex-col bg-slate-950 overflow-hidden">
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/vendasos.jpg')] bg-cover bg-center opacity-30 fixed" />
                <div className="absolute inset-0 bg-gradient-to-b from-slate-950/70 via-slate-950/85 to-slate-950" />
            </div>

            <div className="relative z-10 p-6 max-w-[1600px] mx-auto w-full flex-1 flex flex-col gap-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            href={`/dashboard/loja/${storeId}?menu=gerencia`}
                            className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                            title="Voltar para o Painel"
                        >
                            <ArrowLeft className="h-4 w-4" />
                        </Link>

                        <div>
                            <h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-sky-300 to-cyan-400 flex items-center gap-3 tracking-tight">
                                <Microscope className="h-8 w-8 text-sky-300" />
                                Fluxo de Laboratório
                            </h1>
                            <p className="text-slate-400 font-medium mt-1">
                                Arraste para avançar ou voltar etapas. Clique no card para editar manualmente.
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                        <BackgroundToggle />
                        <button
                            type="button"
                            onClick={() => setGradeModalOpen(true)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-bold bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 hover:bg-emerald-500/20 transition-colors shadow-[0_0_20px_rgba(52,211,153,0.06)]"
                        >
                            <Grid3X3 className="h-4 w-4" />
                            Grade de Estoque
                        </button>
                        <button
                            type="button"
                            onClick={() => setTagsModalOpen(true)}
                            className="inline-flex items-center gap-2 rounded-2xl border border-cyan-500/20 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.06)] transition-colors hover:bg-cyan-500/20"
                        >
                            <Tag className="h-4 w-4" />
                            Tags
                        </button>
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
                            Arraste para avançar ou voltar uma coluna
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
                        <div className="grid grid-cols-1 xl:grid-cols-4 gap-5 items-stretch">
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
                                        className={`h-full rounded-3xl border bg-black/20 backdrop-blur-xl shadow-2xl min-h-[420px] transition-all ${meta.border} ${isDropActive ? 'ring-2 ring-white/20 bg-white/5' : 'border-white/10'}`}
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
                                                    const customerName = item.customer_name || patientName
                                                    const customerPhone = item.customer_phone || ''
                                                    const currentStage = getLabStage(item)
                                                    const canDrag = true
                                                    const isSelected = selectedOS?.id === item.id
                                                            const waitDate =
                                                        currentStage === 'falta_pedir'
                                                            ? item.created_at
                                                            : currentStage === 'lentes_pedidas'
                                                                ? item.dt_pedido_em
                                                                : currentStage === 'lentes_chegaram'
                                                                    ? item.dt_lente_chegou
                                                                    : item.os_enviada_ao_lab && item.dt_montado_no_lab && !item.dt_montado_em
                                                                        ? item.dt_montado_no_lab
                                                                        : item.dt_montado_em
                                                    const waitingLabel = formatStageElapsed(waitDate)
                                                    const whatsappMessage = `Olá ${customerName.split(' ')[0]}! Tudo bem? Aqui é da Ótica. Os óculos de *${patientName}* ficaram prontos! Quando puder, passe aqui para retirar e ajustar.`
                                                    const whatsappMsgArmacao = `Olá ${customerName.split(' ')[0]}! Tudo bem? Aqui é da Ótica. As lentes de *${patientName}* chegaram. Quando puder, traga a armação para realizarmos a montagem.`

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
                                                                    <span>Há {waitingLabel} nesta etapa</span>
                                                                </div>

                                                                {/* Flags booleanas — só leitura */}
                                                                <div className="flex flex-wrap gap-1.5 pt-1">
                                                                    {item.armacao_com_cliente && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-amber-500/20 text-amber-300 border-amber-500/30">
                                                                            ✓ Armação c/ cliente
                                                                        </span>
                                                                    )}
                                                                    {item.os_enviada_ao_lab && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-sky-500/20 text-sky-300 border-sky-500/30">
                                                                            ✓ Enviada p/ montagem
                                                                        </span>
                                                                    )}
                                                                    {item.os_enviada_ao_lab && item.dt_montado_no_lab && !item.dt_montado_em && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-violet-500/20 text-violet-300 border-violet-500/30">
                                                                            Montado no laboratório · aguardando retorno
                                                                        </span>
                                                                    )}
                                                                    {item.os_enviada_ao_lab && item.dt_recebido_na_loja && (
                                                                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/20 text-emerald-300 border-emerald-500/30">
                                                                            Recebido na loja · pronto para entrega
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {item.os_enviada_ao_lab && item.dt_lente_chegou && (
                                                                    <p className="text-[11px] text-sky-300/80">
                                                                        Chegou ao laboratório: {formatDateTime(item.dt_lente_chegou)}
                                                                    </p>
                                                                )}
                                                                {item.os_enviada_ao_lab && item.dt_montado_no_lab && (
                                                                    <p className="text-[11px] text-violet-300/80">
                                                                        Montado no laboratório: {formatDateTime(item.dt_montado_no_lab)}
                                                                    </p>
                                                                )}
                                                                {item.os_enviada_ao_lab && item.dt_recebido_na_loja && (
                                                                    <p className="text-[11px] text-emerald-300/80">
                                                                        Recebido na loja: {formatDateTime(item.dt_recebido_na_loja)}
                                                                    </p>
                                                                )}

                                                                {currentStage === 'lentes_chegaram' && item.armacao_com_cliente && customerPhone && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={sendingWhatsAppKey === `lab-frame:${item.id}`}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation()
                                                                            void sendLabWhatsApp({
                                                                                key: `lab-frame:${item.id}`,
                                                                                phone: customerPhone,
                                                                                message: whatsappMsgArmacao,
                                                                                source: 'laboratorio.frame_request_button',
                                                                                osId: item.id,
                                                                                stage: currentStage,
                                                                            })
                                                                        }}
                                                                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:cursor-wait disabled:opacity-50"
                                                                    >
                                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                                        Avisar para trazer armação
                                                                    </button>
                                                                )}
                                                                {currentStage === 'oculos_montado' && customerPhone && (
                                                                    <button
                                                                        type="button"
                                                                        disabled={sendingWhatsAppKey === `lab-ready:${item.id}`}
                                                                        onClick={(event) => {
                                                                            event.stopPropagation()
                                                                            void sendLabWhatsApp({
                                                                                key: `lab-ready:${item.id}`,
                                                                                phone: customerPhone,
                                                                                message: whatsappMessage,
                                                                                source: 'laboratorio.ready_pickup_button',
                                                                                osId: item.id,
                                                                                stage: currentStage,
                                                                            })
                                                                        }}
                                                                        className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[11px] font-bold text-emerald-300 hover:bg-emerald-500/20 transition-colors disabled:cursor-wait disabled:opacity-50"
                                                                    >
                                                                        <MessageCircle className="h-3.5 w-3.5" />
                                                                        Avisar no WhatsApp
                                                                    </button>
                                                                )}
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

                                            {selectedOS.os_enviada_ao_lab && (
                                                <>
                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-violet-300/80 flex items-center gap-1.5 mb-1.5">
                                                            <Wrench className="h-3 w-3" /> Montado no laboratório
                                                        </label>
                                                        <input
                                                            type="datetime-local"
                                                            name="dt_montado_no_lab"
                                                            defaultValue={formatForInput(selectedOS.dt_montado_no_lab)}
                                                            className="w-full bg-violet-950/30 border border-violet-500/20 rounded-xl px-3 py-2 text-sm font-bold text-violet-100 shadow-sm focus:border-violet-400/50 outline-none"
                                                        />
                                                    </div>

                                                    <div>
                                                        <label className="text-[10px] font-bold uppercase text-emerald-300/80 flex items-center gap-1.5 mb-1.5">
                                                            <Truck className="h-3 w-3" /> Recebido na loja
                                                        </label>
                                                        <input
                                                            type="datetime-local"
                                                            name="dt_recebido_na_loja"
                                                            defaultValue={formatForInput(selectedOS.dt_recebido_na_loja)}
                                                            className="w-full bg-emerald-950/30 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm font-bold text-emerald-100 shadow-sm focus:border-emerald-400/50 outline-none"
                                                        />
                                                    </div>
                                                </>
                                            )}

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
                                                    router.push(withReturnTo(
                                                        `/dashboard/loja/${storeId}/vendas/${selectedOS.venda_id}/os?os_id=${selectedOS.id}`,
                                                        currentLabUrl
                                                    ))
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
        </>
    )
}
