
"use client"

import { useState, useEffect, useCallback, useRef, useTransition } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { useFormState, useFormStatus } from 'react-dom'
import {
    Loader2, Save, Trash2, ChevronLeft, ChevronRight,
    Eye, Glasses, User, Ruler, Truck, Plus, History, FileDown, CalendarClock,
    MessageCircle, Sparkles, Printer, FileText, ArrowLeft, ExternalLink, Import, Link2, Unlink2
} from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'
import { OSPhotoViewer } from './OSPhotoViewer'

import { getOSPageData, getVendaPageData, saveServiceOrder, deleteServiceOrder, type OSPageData, type SaveSOResult, type PrescriptionHistoryItem } from '@/lib/actions/vendas.actions'
import {
    checkLensStock,
    type LensStockMatch,
    type LensStockSearchResult,
    type LensReservationSlot
} from '@/lib/actions/stock.actions'
import { Database } from '@/lib/database.types'
import AddDependenteModal from '@/components/modals/AddDependenteModal'
import AddOftalmoModal from '@/components/modals/AddOftalmoModal'
import PrescriptionHistoryModal from '@/components/modals/PrescriptionHistoryModal'
import OpticalEvaluationImportModal from '@/components/modals/OpticalEvaluationImportModal'
import EmployeeAuthModal from '@/components/modals/EmployeeAuthModal'
import { DegreeInput } from '@/components/ui/DegreeInput'
import {
    applyOpticalEvaluationToServiceOrder,
    getOpticalEvaluationSummaryById,
    type OpticalEvaluationImportOption,
    type OpticalEvaluationSummary
} from '@/lib/actions/evaluation.actions'

type ServiceOrderWithLinks = any
type Dependente = Database['public']['Tables']['dependentes']['Row']
type LensEye = 'OD' | 'OE' | 'AMBOS'

const toDateTimeInput = (isoString: string | null | undefined) => {
    if (!isoString) return '';
    return new Date(isoString).toISOString().slice(0, 16);
}

const formatDate = (d: string) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

const parseDegreeValue = (value: string, fallback?: number) => {
    if (!value || !value.trim()) return fallback ?? null
    const parsed = parseFloat(value.replace(',', '.').replace('+', ''))
    return Number.isNaN(parsed) ? fallback ?? null : parsed
}

const parseAxisValue = (value: string) => {
    if (!value || !value.trim()) return null
    const parsed = parseInt(value.replace(/\D/g, ''), 10)
    return Number.isNaN(parsed) ? null : parsed
}

const formatDegreeValue = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '-'
    return `${value > 0 ? '+' : ''}${value.toFixed(2)}`
}

const formatLensEye = (eye: LensEye | null | undefined) => {
    if (eye === 'OD') return 'OD'
    if (eye === 'OE') return 'OE'
    return 'Ambos'
}

type PendingLensSelection = {
    slot: LensReservationSlot
    variantId: number
    productId: number
    productName: string
    variantName: string
}

const emptyPendingReservations = (): Record<LensReservationSlot, PendingLensSelection | null> => ({
    OD: null,
    OE: null
})

// --- ESTILOS DO DESIGN SYSTEM (Refatorado para Dark Glassmorphism) ---
const cardBase = "rounded-xl shadow-xl border backdrop-blur-md p-3 flex flex-col relative overflow-hidden transition-all"
const cardBlue = `${cardBase} bg-cyan-950/20 border-cyan-500/10 hover:bg-cyan-900/20`
const cardSlate = `${cardBase} bg-slate-950/20 border-slate-500/10 hover:bg-slate-900/20`
const cardViolet = `${cardBase} bg-purple-950/20 border-purple-500/10 hover:bg-purple-900/20`
const cardTeal = `${cardBase} bg-emerald-950/20 border-emerald-500/10 hover:bg-emerald-900/20`
const cardAmber = `${cardBase} bg-amber-950/20 border-amber-500/10 hover:bg-amber-900/20`

const labelStyle = 'block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider'
// REVERTIDO: Manter rótulos neutros para melhor hierarquia visual, conforme pedido do usuário.
const labelBlue = labelStyle
const labelSlate = labelStyle
const labelViolet = labelStyle
const labelTeal = labelStyle
const labelAmber = labelStyle
// Estilo de input transparente/escuro
const inputStyle = 'block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-8 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium placeholder:font-normal placeholder:text-slate-500 disabled:opacity-50 transition-all'
const gridInput = `${inputStyle} text-center`

const baseButtonStyle = 'px-3 py-1.5 text-xs rounded-lg shadow-sm disabled:opacity-50 focus:outline-none transition-all duration-200 font-bold flex items-center gap-2'



// --- BADGE DE ESTOQUE (SMART CHECK) ---
const StockBadge = ({
    matches,
    label,
    onOpen
}: {
    matches: LensStockSearchResult,
    label: string,
    onOpen: () => void
}) => {
    const total = matches.exact.length + matches.similar.length
    if (total === 0) return null

    const hasExact = matches.exact.length > 0
    const colorClass = hasExact ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-amber-500/10 border-amber-500/20 text-amber-400"
    const iconColor = hasExact ? "text-emerald-400" : "text-amber-400"

    return (
        <div
            onClick={onOpen}
            className={`col-span-7 ${colorClass} backdrop-blur-sm border rounded p-1 mb-1 flex items-center justify-between animate-in slide-in-from-top-2 shadow-sm cursor-pointer hover:brightness-95 transition-all`}
        >
            <div className="flex items-center gap-1 text-[10px] font-bold">
                <Sparkles className={`h-3 w-3 ${iconColor} fill-current animate-pulse`} />
                {hasExact ? 'Estoque Disponível!' : 'Estoque Similar Encontrado'} ({label})
            </div>
            <div className="flex gap-1 items-center">
                {hasExact && <span className="text-[9px] bg-emerald-500/20 px-1 rounded font-bold border border-emerald-500/30 text-emerald-300">EXATO</span>}
                <span className="text-[9px] underline opacity-80">Ver {total} opções</span>
            </div>
        </div>
    )
}

// --- MODAL DE RESERVA ---
function StockReservationModal({
    isOpen,
    onClose,
    matches,
    label,
    onReserve
}: {
    isOpen: boolean
    onClose: () => void
    matches: LensStockSearchResult
    label: LensReservationSlot
    onReserve: (match: LensStockMatch, slot: LensReservationSlot) => void
}) {
    if (!isOpen) return null

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-white/10">
                <div className="bg-slate-800/50 px-4 py-3 border-b border-white/5 flex justify-between items-center bg-white/5">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Glasses className="h-4 w-4 text-cyan-400" /> Estoque Disponível ({label})
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white"><Trash2 className="h-4 w-4 rotate-45" /></button>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4 custom-scrollbar">
                    {matches.exact.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2 flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> Exatamente o que você precisa
                            </h4>
                            <div className="space-y-2">
                                {matches.exact.map(m => (
                                    <div key={m.variant_id} className="border border-emerald-500/20 bg-emerald-500/5 rounded-lg p-2 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-xs text-white">{m.product_name}</p>
                                            <p className="text-[10px] text-slate-400">{m.variant_name} • {m.is_sobra ? 'SOBRA/RECUP.' : 'NOVO'}</p>
                                            <p className="text-[10px] font-mono text-slate-500">
                                                Sph {formatDegreeValue(m.esferico)} Cyl {formatDegreeValue(m.cilindrico)}
                                            </p>
                                            <p className="text-[10px] font-mono text-slate-500">
                                                Olho {formatLensEye(m.olho)} Add {formatDegreeValue(m.adicao)} Eixo {m.eixo ?? '-'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onReserve(m, label)}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm transition-colors border border-emerald-500/30"
                                        >
                                            SELECIONAR
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {matches.similar.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-amber-400 uppercase mb-2 flex items-center gap-1">
                                <History className="h-3 w-3" /> Similares / Aproximados
                            </h4>
                            <div className="space-y-2">
                                {matches.similar.map(m => (
                                    <div key={m.variant_id} className="border border-amber-500/20 bg-amber-500/5 rounded-lg p-2 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-xs text-white">{m.product_name}</p>
                                            <p className="text-[10px] text-slate-400">{m.variant_name} • {m.is_sobra ? 'SOBRA' : 'NOVO'}</p>
                                            <p className="text-[10px] font-mono text-slate-500">
                                                Sph {formatDegreeValue(m.esferico)} Cyl {formatDegreeValue(m.cilindrico)}
                                            </p>
                                            <p className="text-[10px] font-mono text-slate-500">
                                                Olho {formatLensEye(m.olho)} Add {formatDegreeValue(m.adicao)} Eixo {m.eixo ?? '-'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onReserve(m, label)}
                                            className="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm transition-colors border border-amber-500/30"
                                        >
                                            SELECIONAR
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white/5 px-4 py-2 text-center text-[10px] text-slate-500 border-t border-white/5">
                    A escolha so sera aplicada ao salvar a OS.
                </div>
            </div>
        </div>
    )
}

// TIPO DO FORMULÁRIO
type FormProps = Omit<OSPageData, 'oftalmologistas'> & {
    storeId: number
    vendaId: number
    customer: NonNullable<OSPageData['customer']>
    venda: NonNullable<OSPageData['venda']>
    oftalmosList: OSPageData['oftalmologistas']
    authedEmployeeName: string
    onListChange: (l: any) => void
    saveState: SaveSOResult
    dispatch: (payload: FormData) => void
    preSaleAnalysisEnabled: boolean
}

function ServiceOrderFormContent({
    storeId, vendaId, customer, vendaItens, dependentes: initialDependentes, oftalmosList, employees, existingOrders, authedEmployeeName, onListChange, saveState, dispatch, preSaleAnalysisEnabled,
    venda
}: FormProps) {

    const searchParams = useSearchParams()
    const targetOsId = searchParams.get('os_id')
    const returnTo = searchParams.get('returnTo')
    const vendaUrl = returnTo || `/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`
    const handleReturnToSale = () => window.location.assign(vendaUrl)

    const { pending: isSaving } = useFormStatus()
    const [isDeleting, startDeleteTransition] = useTransition()

    // WhatsApp Logic State
    const formRef = useRef<HTMLFormElement>(null)
    const [pendingWhatsApp, setPendingWhatsApp] = useState(false)
    const isSilentSave = useRef(false)

    const [currentIndex, setCurrentIndex] = useState(() => {
        if (targetOsId && existingOrders.length > 0) {
            const foundIndex = existingOrders.findIndex((o: any) => o.id === parseInt(targetOsId))
            return foundIndex !== -1 ? foundIndex : -1
        }
        return -1
    })

    const [isDepModalOpen, setIsDepModalOpen] = useState(false)
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [isEvaluationModalOpen, setIsEvaluationModalOpen] = useState(false)
    const [isOftalmoModalOpen, setIsOftalmoModalOpen] = useState(false) // MANTIDO: Logic Button for Doctor Modal
    const [localDependentes, setLocalDependentes] = useState<Dependente[]>(initialDependentes)
    const [localOftalmos, setLocalOftalmos] = useState(oftalmosList)
    const [sourceOpticalEvaluationId, setSourceOpticalEvaluationId] = useState('')
    const [linkedEvaluationSummary, setLinkedEvaluationSummary] = useState<OpticalEvaluationSummary | null>(null)
    const [isEvaluationUnlinkAuthOpen, setIsEvaluationUnlinkAuthOpen] = useState(false)
    const [evaluationUnlinkAuthorizer, setEvaluationUnlinkAuthorizer] = useState<Pick<Database['public']['Tables']['employees']['Row'], 'id' | 'full_name' | 'role'> | null>(null)
    const [isLoadingLinkedEvaluation, setIsLoadingLinkedEvaluation] = useState(false)
    const [isApplyingEvaluation, startApplyEvaluationTransition] = useTransition()

    const lastSuccessRef = useRef<number | undefined>(0);

    useEffect(() => {
        setLocalOftalmos(oftalmosList)
    }, [oftalmosList])

    // --- STATES DO FORM ---
    const { preference } = useBackgroundPreference()
    const [protocolo, setProtocolo] = useState('')
    const [dependenteId, setDependenteId] = useState('')
    const [oftalmologistaId, setOftalmologistaId] = useState('')

    // Vínculos
    const [lenteOdItemId, setLenteOdItemId] = useState('')
    const [lenteOeItemId, setLenteOeItemId] = useState('')
    const [armacaoItemId, setArmacaoItemId] = useState('')

    // Receita
    const [longeOdEsf, setLongeOdEsf] = useState(''); const [longeOdCil, setLongeOdCil] = useState(''); const [longeOdEixo, setLongeOdEixo] = useState('')
    const [longeOeEsf, setLongeOeEsf] = useState(''); const [longeOeCil, setLongeOeCil] = useState(''); const [longeOeEixo, setLongeOeEixo] = useState('')
    const [pertoOdEsf, setPertoOdEsf] = useState(''); const [pertoOdCil, setPertoOdCil] = useState(''); const [pertoOdEixo, setPertoOdEixo] = useState('')
    const [pertoOeEsf, setPertoOeEsf] = useState(''); const [pertoOeCil, setPertoOeCil] = useState(''); const [pertoOeEixo, setPertoOeEixo] = useState('')
    const [adicao, setAdicao] = useState('')

    // Medidas
    const [medH, setMedH] = useState(''); const [medV, setMedV] = useState(''); const [medDiag, setMedDiag] = useState(''); const [medPonte, setMedPonte] = useState('')
    const [dnpOd, setDnpOd] = useState(''); const [dnpOe, setDnpOe] = useState('');
    const [altOd, setAltOd] = useState(''); const [altOe, setAltOe] = useState(''); const [diametro, setDiametro] = useState('')
    const [diamOd, setDiamOd] = useState(''); const [diamOe, setDiamOe] = useState('')
    const [palpebraOd, setPalpebraOd] = useState(''); const [palpebraOe, setPalpebraOe] = useState('')
    const [tipoLente, setTipoLente] = useState(''); const [fotoMedicaoUrl, setFotoMedicaoUrl] = useState(''); const [tokenLab, setTokenLab] = useState<string | null>(null)

    // Lab e Prazos
    const [dtPedido, setDtPedido] = useState(''); const [pedidoPorId, setPedidoPorId] = useState(''); const [labNome, setLabNome] = useState('')
    const [armacaoComCliente, setArmacaoComCliente] = useState(false); const [osEnviadaAoLab, setOsEnviadaAoLab] = useState(false)
    const [dtChegou, setDtChegou] = useState(''); const [dtMontado, setDtMontado] = useState(''); const [dtEntregue, setDtEntregue] = useState('')
    const [dtPrometido, setDtPrometido] = useState(''); const [obsOs, setObsOs] = useState('')

    // Smart Stock Check
    const emptyStockSearchResult: LensStockSearchResult = { exact: [], similar: [], autoReserveCandidate: null, targetProductHasGrid: false }
    const [odMatches, setOdMatches] = useState<LensStockSearchResult>(emptyStockSearchResult)
    const [oeMatches, setOeMatches] = useState<LensStockSearchResult>(emptyStockSearchResult)
    const [stockModalOpen, setStockModalOpen] = useState<'OD' | 'OE' | null>(null)
    const [pendingReservationBySlot, setPendingReservationBySlot] = useState<Record<LensReservationSlot, PendingLensSelection | null>>(emptyPendingReservations)

    // Monitora OD para sobras e estoque
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (longeOdEsf) {
                const esf = parseDegreeValue(longeOdEsf)
                const cil = parseDegreeValue(longeOdCil, 0)

                // Busca Produto ID
                const item = vendaItens.find(i => i.id.toString() === lenteOdItemId)
                const pid = item ? item.product_id : null

                // Busca Adição
                const add = parseDegreeValue(adicao)
                const axis = parseAxisValue(longeOdEixo)

                if (esf !== null && cil !== null) {
                    const matches = await checkLensStock(storeId, esf, cil, pid, add, 'OD', axis)
                    setOdMatches(matches)
                } else {
                    setOdMatches(emptyStockSearchResult)
                }
            } else setOdMatches(emptyStockSearchResult)
        }, 500)
        return () => clearTimeout(timer)
    }, [longeOdEsf, longeOdCil, longeOdEixo, adicao, lenteOdItemId, storeId, vendaItens])

    // Monitora OE para sobras e estoque
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (longeOeEsf) {
                const esf = parseDegreeValue(longeOeEsf)
                const cil = parseDegreeValue(longeOeCil, 0)

                // Busca Produto ID
                const item = vendaItens.find(i => i.id.toString() === lenteOeItemId)
                const pid = item ? item.product_id : null

                // Busca Adição
                const add = parseDegreeValue(adicao)
                const axis = parseAxisValue(longeOeEixo)

                if (esf !== null && cil !== null) {
                    const matches = await checkLensStock(storeId, esf, cil, pid, add, 'OE', axis)
                    setOeMatches(matches)
                } else {
                    setOeMatches(emptyStockSearchResult)
                }
            } else setOeMatches(emptyStockSearchResult)
        }, 500)
        return () => clearTimeout(timer)
    }, [longeOeEsf, longeOeCil, longeOeEixo, adicao, lenteOeItemId, storeId, vendaItens])

    // Helper para disponibilidade
    const isLenteDisponivel = (item: any, olho: 'OD' | 'OE') => {
        if (item.unidade === 'Par') return true;
        const outroOlhoId = olho === 'OD' ? lenteOeItemId : lenteOdItemId;
        if (!outroOlhoId || outroOlhoId !== item.id.toString()) return true;
        if (item.quantidade >= 2) return true;
        return false;
    }

    const itensLente = vendaItens.filter(i => i.item_tipo === 'Lente' || i.item_tipo === 'Lente de Contato')
    const lentesDisponiveisOD = itensLente.filter(i => isLenteDisponivel(i, 'OD'));
    const lentesDisponiveisOE = itensLente.filter(i => isLenteDisponivel(i, 'OE'));

    const itensArmacao = vendaItens.filter(i => i.item_tipo === 'Armacao' || i.item_tipo === 'Solar')

    // Cast 'as any' no currentOrder
    const currentOrder = (currentIndex >= 0 && currentIndex < existingOrders.length ? existingOrders[currentIndex] : undefined) as any

    // CORREÇÃO: activeId garante que usamos o ID recém-salvo mesmo se o currentIndex ainda não atualizou
    const activeId = currentOrder?.id || (saveState?.success && saveState?.data?.id ? saveState.data.id : undefined)
    const currentPatientName = dependenteId
        ? localDependentes.find(d => d.id === parseInt(dependenteId))?.full_name || customer?.full_name || 'Paciente'
        : customer?.full_name || 'Paciente'

    useEffect(() => {
        if (!saveState.success && saveState.message && saveState.timestamp !== lastSuccessRef.current) {
            alert(`Erro ao salvar OS: ${saveState.message}`);
            lastSuccessRef.current = saveState.timestamp;
            return;
        }

        if (saveState.success && saveState.data && saveState.timestamp !== lastSuccessRef.current) {
            // Se não for save silencioso, mostra alert
            if (!isSilentSave.current) {
                alert(saveState.message)
            }

            const savedOS = saveState.data as ServiceOrderWithLinks
            const newList = [...existingOrders]
            const idx = newList.findIndex(o => o.id === savedOS.id)
            if (idx > -1) newList[idx] = savedOS; else newList.push(savedOS)
            newList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            onListChange(newList)
            setCurrentIndex(newList.findIndex(o => o.id === savedOS.id))
            lastSuccessRef.current = saveState.timestamp;

            // Se tinha WhatsApp pendente, envia agora
            if (pendingWhatsApp) {
                sendWhatsAppPedido(savedOS.id)
                setPendingWhatsApp(false)
                isSilentSave.current = false
            }
        }
    }, [existingOrders, onListChange, pendingWhatsApp, saveState])

    const resetForm = useCallback(() => {
        setDependenteId(''); setOftalmologistaId(''); setLenteOdItemId(''); setLenteOeItemId(''); setArmacaoItemId('')
        setLongeOdEsf(''); setLongeOdCil(''); setLongeOdEixo(''); setLongeOeEsf(''); setLongeOeCil(''); setLongeOeEixo('')
        setPertoOdEsf(''); setPertoOdCil(''); setPertoOdEixo(''); setPertoOeEsf(''); setPertoOeCil(''); setPertoOeEixo(''); setAdicao('')
        setMedH(''); setMedV(''); setMedDiag(''); setMedPonte(''); setDnpOd(''); setDnpOe(''); setAltOd(''); setAltOe(''); setDiametro('')
        setDiamOd(''); setDiamOe(''); setPalpebraOd(''); setPalpebraOe(''); setTipoLente(''); setFotoMedicaoUrl(''); setTokenLab(null)
        setDtPedido(''); setPedidoPorId(''); setLabNome(''); setDtChegou(''); setDtMontado(''); setDtEntregue(''); setDtPrometido(''); setObsOs('')
        setArmacaoComCliente(false); setOsEnviadaAoLab(false)
        setProtocolo('')
        setSourceOpticalEvaluationId('')
        setLinkedEvaluationSummary(null)
        setEvaluationUnlinkAuthorizer(null)
        setPendingReservationBySlot(emptyPendingReservations())
    }, [])

    useEffect(() => {
        if (!currentOrder) { resetForm() } else {
            const os = currentOrder
            setPendingReservationBySlot(emptyPendingReservations())
            setDependenteId(os.dependente_id?.toString() ?? '')
            setOftalmologistaId(os.oftalmologista_id?.toString() ?? '')
            const linkLenteOd = os.links?.find((l: any) => l.uso_na_os === 'lente_od'); setLenteOdItemId(linkLenteOd?.venda_item_id.toString() ?? '')
            const linkLenteOe = os.links?.find((l: any) => l.uso_na_os === 'lente_oe'); setLenteOeItemId(linkLenteOe?.venda_item_id.toString() ?? '')
            const linkArmacao = os.links?.find((l: any) => l.uso_na_os === 'armacao'); setArmacaoItemId(linkArmacao?.venda_item_id.toString() ?? '')
            setLongeOdEsf(os.receita_longe_od_esferico ?? ''); setLongeOdCil(os.receita_longe_od_cilindrico ?? ''); setLongeOdEixo(os.receita_longe_od_eixo ?? '')
            setLongeOeEsf(os.receita_longe_oe_esferico ?? ''); setLongeOeCil(os.receita_longe_oe_cilindrico ?? ''); setLongeOeEixo(os.receita_longe_oe_eixo ?? '')
            setPertoOdEsf(os.receita_perto_od_esferico ?? ''); setPertoOdCil(os.receita_perto_od_cilindrico ?? ''); setPertoOdEixo(os.receita_perto_od_eixo ?? '')
            setPertoOeEsf(os.receita_perto_oe_esferico ?? ''); setPertoOeCil(os.receita_perto_oe_cilindrico ?? ''); setPertoOeEixo(os.receita_perto_oe_eixo ?? '')
            setAdicao(os.receita_adicao ?? '')
            setMedH(os.medida_horizontal ?? ''); setMedV(os.medida_vertical ?? ''); setMedDiag(os.medida_diagonal ?? ''); setMedPonte(os.medida_ponte ?? '')
            setDnpOd(os.medida_dnp_od ?? ''); setDnpOe(os.medida_dnp_oe ?? ''); setAltOd(os.medida_altura_od ?? ''); setAltOe(os.medida_altura_oe ?? ''); setDiametro(os.medida_diametro ?? '')
            setDiamOd(os.medida_diametro_od ?? ''); setDiamOe(os.medida_diametro_oe ?? '')
            setPalpebraOd(os.medida_palpebra_od ?? ''); setPalpebraOe(os.medida_palpebra_oe ?? '')
            setTipoLente(os.medida_tipo_lente ?? ''); setFotoMedicaoUrl(os.foto_medicao_url ?? ''); setTokenLab((os as any).token_lab ?? null)
            setDtPedido(toDateTimeInput(os.dt_pedido_em)); setPedidoPorId(os.lab_pedido_por_id?.toString() ?? ''); setLabNome(os.lab_nome ?? '')
            setArmacaoComCliente((os as any).armacao_com_cliente ?? false); setOsEnviadaAoLab((os as any).os_enviada_ao_lab ?? false)
            setDtChegou(toDateTimeInput(os.dt_lente_chegou)); setDtMontado(toDateTimeInput(os.dt_montado_em)); setDtEntregue(toDateTimeInput(os.dt_entregue_em))
            setDtPrometido(toDateTimeInput(os.dt_prometido_para)); setObsOs(os.obs_os ?? '')
            setProtocolo(os.protocolo_fisico || os.id.toString())
            setSourceOpticalEvaluationId(os.source_optical_evaluation_id?.toString() ?? '')
        }
    }, [currentIndex, currentOrder, resetForm])

    useEffect(() => {
        if (!sourceOpticalEvaluationId) {
            setLinkedEvaluationSummary(null)
            return
        }

        setIsLoadingLinkedEvaluation(true)
        getOpticalEvaluationSummaryById({
            storeId,
            evaluationId: Number(sourceOpticalEvaluationId)
        })
            .then((summary) => setLinkedEvaluationSummary(summary))
            .finally(() => setIsLoadingLinkedEvaluation(false))
    }, [sourceOpticalEvaluationId, storeId])

    const handleNavigate = (dir: 'prev' | 'next' | 'new') => {
        if (dir === 'new') { setCurrentIndex(-1); return; }
        if (existingOrders.length === 0) return;
        let newIndex = currentIndex
        if (dir === 'prev') newIndex = currentIndex <= 0 ? existingOrders.length - 1 : currentIndex - 1
        else newIndex = currentIndex >= existingOrders.length - 1 ? 0 : currentIndex + 1
        setCurrentIndex(newIndex)
    }

    const handleDelete = () => {
        if (!activeId) return; if (!confirm('Excluir OS?')) return;
        startDeleteTransition(async () => {
            const res = await deleteServiceOrder(activeId, storeId, vendaId)
            if (res.success) { onListChange(existingOrders.filter((o: any) => o.id !== activeId)); setCurrentIndex(-1) }
            else { alert(res.message) }
        })
    }

    const handleDependenteAdded = useCallback((newDep: Dependente) => {
        setLocalDependentes(prev => [...prev, newDep])
        setDependenteId(newDep.id.toString())
    }, [])

    const handleOftalmoAdded = useCallback((newDoc: any) => {
        setLocalOftalmos(prev => [...prev, newDoc])
        setOftalmologistaId(newDoc.id.toString())
    }, [])

    const handleImportPrescription = (data: PrescriptionHistoryItem) => {
        if (confirm("Deseja preencher os campos com os dados desta receita antiga?")) {
            setLongeOdEsf(data.receita_longe_od_esferico || ''); setLongeOdCil(data.receita_longe_od_cilindrico || ''); setLongeOdEixo(data.receita_longe_od_eixo || '');
            setLongeOeEsf(data.receita_longe_oe_esferico || ''); setLongeOeCil(data.receita_longe_oe_cilindrico || ''); setLongeOeEixo(data.receita_longe_oe_eixo || '');
            setAdicao(data.receita_adicao || ''); setDnpOd(data.medida_dnp_od || ''); setDnpOe(data.medida_dnp_oe || '');
            setIsHistoryModalOpen(false);
        }
    }

    const handleSelectEvaluation = (evaluation: OpticalEvaluationImportOption) => {
        startApplyEvaluationTransition(async () => {
            const result = await applyOpticalEvaluationToServiceOrder({
                storeId,
                evaluationId: evaluation.id,
                customerId: customer.id,
                dependenteId: dependenteId ? parseInt(dependenteId) : null,
                serviceOrderId: activeId || null,
                currentReceitaLongeOdEsferico: longeOdEsf || null,
                currentReceitaLongeOdCilindrico: longeOdCil || null,
                currentReceitaLongeOdEixo: longeOdEixo || null,
                currentReceitaLongeOeEsferico: longeOeEsf || null,
                currentReceitaLongeOeCilindrico: longeOeCil || null,
                currentReceitaLongeOeEixo: longeOeEixo || null,
                currentReceitaPertoOdEsferico: pertoOdEsf || null,
                currentReceitaPertoOdCilindrico: pertoOdCil || null,
                currentReceitaPertoOdEixo: pertoOdEixo || null,
                currentReceitaPertoOeEsferico: pertoOeEsf || null,
                currentReceitaPertoOeCilindrico: pertoOeCil || null,
                currentReceitaPertoOeEixo: pertoOeEixo || null,
                currentReceitaAdicao: adicao || null,
                currentMedidaDnpOd: dnpOd || null,
                currentMedidaDnpOe: dnpOe || null,
                currentMedidaAlturaOd: altOd || null,
                currentMedidaAlturaOe: altOe || null
            })

            if (!result.success || !result.data) {
                alert(result.message)
                return
            }

            if (result.data.wouldOverwriteExistingData) {
                const confirmed = confirm(`Esta avaliação vai sobrescrever os campos já preenchidos na OS:\n\n${result.data.overwriteFields.join('\n')}\n\nDeseja continuar?`)
                if (!confirmed) return
            }

            setLongeOdEsf(result.data.receitaLongeOdEsferico || '')
            setLongeOdCil(result.data.receitaLongeOdCilindrico || '')
            setLongeOdEixo(result.data.receitaLongeOdEixo || '')
            setLongeOeEsf(result.data.receitaLongeOeEsferico || '')
            setLongeOeCil(result.data.receitaLongeOeCilindrico || '')
            setLongeOeEixo(result.data.receitaLongeOeEixo || '')
            setPertoOdEsf(result.data.receitaPertoOdEsferico || '')
            setPertoOdCil(result.data.receitaPertoOdCilindrico || '')
            setPertoOdEixo(result.data.receitaPertoOdEixo || '')
            setPertoOeEsf(result.data.receitaPertoOeEsferico || '')
            setPertoOeCil(result.data.receitaPertoOeCilindrico || '')
            setPertoOeEixo(result.data.receitaPertoOeEixo || '')
            setAdicao(result.data.receitaAdicao || '')
            setDnpOd(result.data.medidaDnpOd || '')
            setDnpOe(result.data.medidaDnpOe || '')
            setAltOd(result.data.medidaAlturaOd || '')
            setAltOe(result.data.medidaAlturaOe || '')
            if (result.data.recommendedLensName) {
                const recommendedLensName = result.data.recommendedLensName
                setObsOs((prev) => {
                    const evaluationNote = `Avaliação sugeriu: ${recommendedLensName}`
                    if (prev.includes(evaluationNote)) return prev
                    return prev ? `${prev} | ${evaluationNote}` : evaluationNote
                })
            }
            setSourceOpticalEvaluationId(String(result.data.evaluationId))
            setLinkedEvaluationSummary({
                id: result.data.evaluationId,
                created_at: result.data.createdAt,
                source_system: result.data.sourceSystem,
                source_document_url: result.data.sourceDocumentUrl,
                source_exam_type: result.data.sourceExamType,
                source_os_number: result.data.sourceOsNumber,
                evaluated_patient_name: result.data.evaluatedPatientName
            })
            setIsEvaluationModalOpen(false)
            alert('Avaliação importada para a OS. Salve a OS para persistir o vínculo.')
        })
    }

    const handleClearEvaluationLink = () => {
        const confirmed = confirm('Deseja remover o vínculo com a avaliação importada? Os campos copiados permanecerão na OS até você alterá-los.')
        if (!confirmed) return

        setIsEvaluationUnlinkAuthOpen(true)
    }

    const handleEvaluationUnlinkAuthSuccess = (employee: Pick<Database['public']['Tables']['employees']['Row'], 'id' | 'full_name' | 'role'>) => {
        if (employee.role !== 'gerente') {
            alert('Desvinculacao nao autorizada. Apenas um gerente pode remover o vinculo com a avaliacao.')
            setEvaluationUnlinkAuthorizer(null)
            return
        }

        setEvaluationUnlinkAuthorizer(employee)
        setSourceOpticalEvaluationId('')
        setLinkedEvaluationSummary(null)
    }

    const sendWhatsAppPedido = (overrideId?: number) => {
        // Silent Save Trigger
        const finalId = overrideId || activeId
        if (!finalId) {
            isSilentSave.current = true
            setPendingWhatsApp(true)
            formRef.current?.requestSubmit()
            return
        }

        const lenteOdDesc = vendaItens.find(i => i.id === parseInt(lenteOdItemId))?.descricao || 'Não informado';
        const lenteOeDesc = vendaItens.find(i => i.id === parseInt(lenteOeItemId))?.descricao || 'Não informado';
        const medico = localOftalmos.find(o => o.id === parseInt(oftalmologistaId));
        const medicoTexto = medico ? `${medico.nome_completo} ${medico.crm ? 'CRM ' + medico.crm : ''}` : 'Não informado';
        const pacienteNome = dependenteId
            ? localDependentes.find(d => d.id === parseInt(dependenteId))?.full_name || customer?.full_name
            : customer?.full_name || 'Paciente';
        const prometidoPara = dtPrometido ? formatDate(dtPrometido) : 'A combinar';

        const addIf = (label: string, value: any) => value ? `${label}: ${value}` : null;

        const hasComplexMeasures = medH || medV || medDiag || medPonte || diametro
        const hasBasicMeasures = dnpOd || dnpOe || altOd || altOe

        let medidasBlock = ''
        if (hasComplexMeasures) {
            medidasBlock = `
--Medidas--
${[
                    addIf('Hor', medH),
                    addIf('Vert', medV),
                    addIf('Diag', medDiag),
                    addIf('Ponte', medPonte),
                    addIf('DP', (dnpOd || dnpOe) ? `${dnpOd}/${dnpOe}` : null),
                    addIf('Diam', diametro),
                    addIf('Alt', (altOd || altOe) ? `${altOd}/${altOe}` : null)
                ].filter(Boolean).join('\n')}`
        }

        const msg = `
*Pedido de Lentes*

Protocolo/OS #${protocolo || finalId}
Prometido para: ${prometidoPara}

--Receita--
Lente OD: ${lenteOdDesc}
Lente OE: ${lenteOeDesc}
OD: ${longeOdEsf} ${longeOdCil} ${longeOdEixo}
OE: ${longeOeEsf} ${longeOeCil} ${longeOeEixo}
${addIf('AD', adicao) || ''}
${medidasBlock}

--Dados Pessoais--
Cliente: ${pacienteNome}
Médico: ${medicoTexto}

${addIf('Obs.', obsOs) || ''}
${tokenLab ? `\nFoto das medidas:\nhttps://gestao-otica-pro.vercel.app/lab/${tokenLab}` : ''}
`.trim();
        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    const handleReserve = (match: LensStockMatch, slot: LensReservationSlot) => {
        setPendingReservationBySlot(prev => ({
            ...prev,
            [slot]: {
                slot,
                variantId: match.variant_id,
                productId: match.product_id,
                productName: match.product_name,
                variantName: match.variant_name
            }
        }))
        setStockModalOpen(null)

        if (activeId) {
            alert(`Lente selecionada para ${slot}. A troca sera aplicada ao salvar a OS.`)
        } else {
            alert(`Lente selecionada para ${slot}. Ela sera baixada quando a OS for salva.`)
        }
    }

    if (!customer) return <div className="p-4">Carregando dados do cliente...</div>

    return (
        <>
            <form ref={formRef} action={dispatch} className="flex-1 flex flex-col min-h-0 relative">
                {/* BACKGROUND IMAGE - VENDASOS.JPG */}
                <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                    <div className="absolute inset-0 bg-cover bg-center opacity-50" style={{ backgroundImage: "url('/os.jpg')" }} />
                    <div className="absolute inset-0 bg-gradient-to-b from-slate-950/50 via-slate-950/70 to-slate-950/60" />
                </div>

                {/* ÁREA DE SCROLL (HEADER + CONTEÚDO) */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar z-10 relative">

                    {/* HEADER INFO */}
                    <div className="p-3 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 flex justify-between items-center mb-3 shadow-lg">
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleReturnToSale}
                                className="mr-1 p-1.5 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white rounded-lg transition-colors border border-white/10 shadow-sm"
                                title="Voltar para a Venda"
                                type="button"
                            >
                                <ArrowLeft className="h-5 w-5" />
                            </button>
                            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                                <User className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente</p>
                                <p className="font-black text-white text-sm leading-none tracking-tight">{customer.full_name}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atendente</p>
                                <p className="font-bold text-slate-200 text-xs">{authedEmployeeName}</p>
                            </div>
                            <BackgroundToggle />
                        </div>
                    </div>

                    {/* NAV BAR RE-DESIGNED */}
                    <div className="bg-white/5 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/10 flex items-center justify-between gap-3 mb-3 relative h-14 z-20">

                        {/* LEFT: PROTOCOLO (MATCHING PATIENT INPUT) */}
                        <div className="flex items-center gap-2 ml-2 z-20 w-48">
                            <div className="w-full">
                                <label htmlFor="protocolo_input" className={labelStyle}>
                                    Protocolo
                                </label>
                                <input
                                    id="protocolo_input"
                                    name="protocolo_fisico"
                                    type="text"
                                    value={protocolo}
                                    onChange={(e) => setProtocolo(e.target.value)}
                                    className={inputStyle}
                                    placeholder="AUTO"
                                />
                            </div>
                        </div>

                        {/* CENTER: FICHA TITLE (ABSOLUTE) */}
                        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2 z-10 pointer-events-none">
                            <Eye className="h-5 w-5 text-cyan-400 opacity-80" />
                            <h2 className="text-lg font-black text-white tracking-widest uppercase opacity-90">
                                {activeId ? `Ficha #${activeId}` : 'Nova Ficha'}
                            </h2>
                        </div>

                        {/* RIGHT: CONTROLS & ACTIONS */}
                        <div className="flex items-center gap-2 min-w-fit z-20">
                            {/* NAV ARROWS */}
                            <div className="flex gap-1 mr-2">
                                <button type="button" onClick={() => handleNavigate('prev')} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 transition-colors border border-transparent hover:border-white/10"><ChevronLeft className="h-4 w-4" /></button>
                                <button type="button" onClick={() => handleNavigate('next')} className="p-1.5 hover:bg-white/10 rounded-lg text-slate-400 transition-colors border border-transparent hover:border-white/10"><ChevronRight className="h-4 w-4" /></button>
                            </div>

                            {/* COUNTER */}
                            <span className="bg-white/5 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-white/10 whitespace-nowrap shadow-inner mr-2">
                                {currentIndex === -1 ? 'NOVA' : `${currentIndex + 1}/${existingOrders.length}`}
                            </span>

                            {/* VER VENDA BUTTON */}
                            <button
                                type="button"
                                onClick={handleReturnToSale}
                                className="mr-2 flex items-center gap-1.5 px-3 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 transition-colors shadow-sm text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                title="Voltar para a Venda que gerou esta OS"
                            >
                                <FileText className="h-3 w-3 text-cyan-400" />
                                <span className="hidden sm:inline">Ver Venda</span>
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 pb-24">

                        {/* COLUNA 1: Dados Gerais e Medidas (4 colunas) */}
                        <div className="lg:col-span-4 space-y-2 flex flex-col">

                            {/* CARD AZUL (DADOS) */}
                            <div className={cardBlue}>
                                <div className="flex justify-between border-b border-white/10 pb-3 mb-4 items-center">
                                    <h3 className="text-cyan-400 font-black flex items-center gap-3 text-lg tracking-[0.15em] uppercase drop-shadow-sm">
                                        <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-inner">
                                            <User className="h-5 w-5" />
                                        </div>
                                        DADOS E VÍNCULOS
                                    </h3>
                                </div>
                                <div className="space-y-2 flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <label className={`w-16 ${labelBlue} text-right shrink-0 mb-0`}>Paciente</label>
                                        <div className="flex-1 flex gap-1">
                                            <select name="dependente_id" value={dependenteId} onChange={e => setDependenteId(e.target.value)} className={`${inputStyle} text-slate-200`}>
                                                <option value="" className="bg-slate-800">{customer.full_name} (Titular)</option>
                                                {localDependentes.map(dep => (
                                                    <option key={dep.id} value={dep.id} className="bg-slate-800">
                                                        {dep.full_name} ({dep.parentesco || 'Dep.'})
                                                    </option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => setIsDepModalOpen(true)} className="bg-white/5 hover:bg-white/10 text-cyan-400 p-1 rounded-lg shadow-sm border border-white/10 h-8 w-8 flex items-center justify-center transition-colors" title="Novo Dependente">
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mb-2">
                                        <label className={`w-16 ${labelBlue} text-right shrink-0 mb-0`}>Médico</label>
                                        <div className="flex-1 flex gap-1">
                                            <select name="oftalmologista_id" value={oftalmologistaId} onChange={e => setOftalmologistaId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">Selecione...</option>
                                                {localOftalmos.map(oft => <option key={oft.id} value={oft.id} className="bg-slate-800">{oft.nome_completo}</option>)}
                                            </select>
                                            <button
                                                type="button"
                                                onClick={() => setIsOftalmoModalOpen(true)}
                                                className="bg-white/5 hover:bg-white/10 text-cyan-400 p-1 rounded-lg shadow-sm border border-white/10 h-8 w-8 flex items-center justify-center transition-colors"
                                                title="Novo Médico"
                                            >
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="pt-3 border-t border-white/5 mt-2 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <label className={`w-16 ${labelBlue} text-right shrink-0 mb-0`}>Lente OD</label>
                                            <select value={lenteOdItemId} onChange={e => setLenteOdItemId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">-- Selecione --</option>
                                                {lentesDisponiveisOD.map(i => <option key={i.id} value={i.id} className="bg-slate-800">{i.descricao} ({i.unidade})</option>)}
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className={`w-16 ${labelBlue} text-right shrink-0 mb-0`}>Lente OE</label>
                                            <select value={lenteOeItemId} onChange={e => setLenteOeItemId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">-- Selecione --</option>
                                                {lentesDisponiveisOE.map(i => <option key={i.id} value={i.id} className="bg-slate-800">{i.descricao} ({i.unidade})</option>)}
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <label className={`w-16 ${labelBlue} text-right shrink-0 mb-0`}>Armação</label>
                                            <select value={armacaoItemId} onChange={e => setArmacaoItemId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">-- Selecione --</option>
                                                {itensArmacao.map(i => <option key={i.id} value={i.id} className="bg-slate-800">{i.descricao}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CARD SLATE (MEDIDAS) */}
                            <div className={cardSlate}>
                                <div className="flex justify-between border-b border-white/10 pb-3 mb-4 items-center">
                                    <h3 className="text-slate-200 font-black flex items-center gap-3 text-lg tracking-[0.15em] uppercase drop-shadow-sm">
                                        <div className="p-1.5 bg-slate-500/10 rounded-lg border border-slate-500/20 shadow-inner">
                                            <Ruler className="h-5 w-5" />
                                        </div>
                                        MEDIDAS TÉCNICAS
                                    </h3>
                                </div>
                                <div className="space-y-2 mb-3">
                                    {/* OD / OE Headers */}
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 shrink-0"></div>
                                        <div className="w-20 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">OD</div>
                                        <div className="w-20 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">OE</div>
                                    </div>
                                    {/* DNP */}
                                    <div className="flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>DNP</label>
                                        <input name="medida_dnp_od" value={dnpOd} onChange={e => setDnpOd(e.target.value)} className="block w-20 rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-8 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium text-center" />
                                        <input name="medida_dnp_oe" value={dnpOe} onChange={e => setDnpOe(e.target.value)} className="block w-20 rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-8 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium text-center" />
                                    </div>
                                    {/* ALTURA */}
                                    <div className="flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Altura</label>
                                        <input name="medida_altura_od" value={altOd} onChange={e => setAltOd(e.target.value)} className="block w-20 rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-8 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium text-center" />
                                        <input name="medida_altura_oe" value={altOe} onChange={e => setAltOe(e.target.value)} className="block w-20 rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-8 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium text-center" />
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
                                    <div className="flex items-center gap-2"><label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Horiz.</label><input name="medida_horizontal" value={medH} onChange={e => setMedH(e.target.value)} className={inputStyle} /></div>
                                    <div className="flex items-center gap-2"><label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Vert.</label><input name="medida_vertical" value={medV} onChange={e => setMedV(e.target.value)} className={inputStyle} /></div>
                                    <div className="flex items-center gap-2"><label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Diag.</label><input name="medida_diagonal" value={medDiag} onChange={e => setMedDiag(e.target.value)} className={inputStyle} /></div>
                                    <div className="flex items-center gap-2"><label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Ponte</label><input name="medida_ponte" value={medPonte} onChange={e => setMedPonte(e.target.value)} className={inputStyle} /></div>

                                    {/* DIÂMETRO COM WHATSAPP */}
                                    <div className="col-span-2 flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Diâmetro</label>
                                        <div className="flex-1 flex gap-1 items-center">
                                            <input name="medida_diametro" value={diametro} onChange={e => setDiametro(e.target.value)} className={inputStyle} />
                                            <button
                                                type="button"
                                                onClick={() => sendWhatsAppPedido()}
                                                className="h-8 px-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg shadow-sm flex items-center gap-2 transition-all hover:scale-105"
                                                title="Enviar Pedido via WhatsApp"
                                            >
                                                <MessageCircle className="h-4 w-4" /> <span className="font-bold text-[10px] hidden xl:inline">PEDIR</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Diâmetro OD/OE e Pálpebra (preenchidos pelo tablet) */}
                                    <div className="flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Diâm. OD</label>
                                        <input name="medida_diametro_od" value={diamOd} onChange={e => setDiamOd(e.target.value)} className={inputStyle} placeholder="—" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Diâm. OE</label>
                                        <input name="medida_diametro_oe" value={diamOe} onChange={e => setDiamOe(e.target.value)} className={inputStyle} placeholder="—" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Pálp. OD</label>
                                        <input name="medida_palpebra_od" value={palpebraOd} onChange={e => setPalpebraOd(e.target.value)} className={inputStyle} placeholder="—" />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Pálp. OE</label>
                                        <input name="medida_palpebra_oe" value={palpebraOe} onChange={e => setPalpebraOe(e.target.value)} className={inputStyle} placeholder="—" />
                                    </div>
                                    <div className="col-span-2 flex items-center gap-2">
                                        <label className={`w-16 ${labelSlate} text-right shrink-0 mb-0`}>Tipo</label>
                                        <select name="medida_tipo_lente" value={tipoLente} onChange={e => setTipoLente(e.target.value)} className={inputStyle}>
                                            <option value="">—</option>
                                            <option value="surfacada">Surfaçada</option>
                                            <option value="bifocal">Bifocal</option>
                                            <option value="pronto">Pronto</option>
                                        </select>
                                    </div>

                                    {/* Foto da medição (capturada pelo tablet) */}
                                    {fotoMedicaoUrl && <OSPhotoViewer url={fotoMedicaoUrl} osId={activeId} onDelete={() => setFotoMedicaoUrl('')} />}
                                    <input type="hidden" name="foto_medicao_url" value={fotoMedicaoUrl} />
                                </div>
                            </div>
                        </div>

                        {/* COLUNA 2: Receita, Prazos e Lab (8 colunas) */}
                        <div className="lg:col-span-8 space-y-2 flex flex-col">

                            {/* CARD VIOLETA (RECEITA) */}
                            <div className={`${cardViolet} flex flex-col`}>
                                <div className="flex justify-between border-b border-white/10 pb-3 mb-4 items-center">
                                    <h3 className="font-black text-purple-300 flex items-center gap-3 text-lg tracking-[0.15em] uppercase drop-shadow-sm">
                                        <div className="p-1.5 bg-purple-500/10 rounded-lg border border-purple-500/20 shadow-inner">
                                            <Glasses className="h-5 w-5" />
                                        </div>
                                        RECEITA
                                    </h3>
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsHistoryModalOpen(true)}
                                            className="text-[10px] font-bold text-cyan-400 bg-cyan-500/10 hover:bg-cyan-500/20 px-3 py-1 rounded-lg border border-cyan-500/20 shadow-sm flex items-center gap-1 transition-all uppercase tracking-wide"
                                        >
                                            <History className="h-3 w-3" /> Histórico
                                        </button>
                                        {preSaleAnalysisEnabled && (
                                            <button
                                                type="button"
                                                onClick={() => setIsEvaluationModalOpen(true)}
                                                className="text-[10px] font-bold text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1 rounded-lg border border-emerald-500/20 shadow-sm flex items-center gap-1 transition-all uppercase tracking-wide"
                                            >
                                                {isApplyingEvaluation ? <Loader2 className="h-3 w-3 animate-spin" /> : <Import className="h-3 w-3" />} Avaliação
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => { setLongeOdEsf('+0,00'); setLongeOdCil('+0,00'); setLongeOdEixo('0'); setLongeOeEsf('+0,00'); setLongeOeCil('+0,00'); setLongeOeEixo('0'); setAdicao('+0,00'); }}
                                            className="text-[10px] font-bold text-slate-400 border border-white/10 hover:bg-white/5 hover:text-white px-3 py-1 rounded-lg transition-colors uppercase tracking-wide"
                                        >
                                            <FileDown className="h-3 w-3 inline mr-1" /> Zerar
                                        </button>
                                    </div>
                                </div>

                                {(isLoadingLinkedEvaluation || linkedEvaluationSummary) && (
                                    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                                        {isLoadingLinkedEvaluation ? (
                                            <div className="flex items-center gap-2 text-sm text-emerald-200">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Carregando avaliação vinculada...
                                            </div>
                                        ) : linkedEvaluationSummary && (
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                                                <div>
                                                    <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-300">
                                                        <Link2 className="h-3.5 w-3.5" />
                                                        Baseada na Avaliação #{linkedEvaluationSummary.id}
                                                    </p>
                                                    <p className="mt-1 text-sm font-bold text-white">
                                                        {linkedEvaluationSummary.evaluated_patient_name || currentPatientName}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-400">
                                                        {formatDate(linkedEvaluationSummary.created_at)}
                                                        {linkedEvaluationSummary.source_exam_type ? ` • ${linkedEvaluationSummary.source_exam_type}` : ''}
                                                        {linkedEvaluationSummary.source_os_number ? ` • OS origem ${linkedEvaluationSummary.source_os_number}` : ''}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2">
                                                    {linkedEvaluationSummary.source_document_url && (
                                                        <a
                                                            href={linkedEvaluationSummary.source_document_url}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-cyan-200 transition-colors hover:bg-cyan-500/20"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                            Ver PDF
                                                        </a>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={handleClearEvaluationLink}
                                                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-slate-300 transition-colors hover:bg-white/10"
                                                    >
                                                        <Unlink2 className="h-3.5 w-3.5" />
                                                        Desvincular
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            <div className="col-span-1"></div><div className="col-span-2">Esférico</div><div className="col-span-2">Cilíndrico</div><div className="col-span-2">Eixo</div>
                                        </div>

                                        <StockBadge matches={odMatches} label="OD" onOpen={() => setStockModalOpen('OD')} />
                                        {pendingReservationBySlot.OD && (
                                            <div className="mb-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold text-cyan-200">
                                                OD selecionada para salvar: {pendingReservationBySlot.OD.productName} - {pendingReservationBySlot.OD.variantName}
                                            </div>
                                        )}

                                        {/* OD */}
                                        <div className="grid grid-cols-7 gap-2 mb-3 items-center p-3 bg-black/20 rounded-xl border border-white/5 shadow-inner">
                                            <div className="col-span-1 font-black text-right pr-3 text-xl text-cyan-400">OD</div>
                                            <div className="col-span-2"><DegreeInput name="receita_longe_od_esferico" value={longeOdEsf} onChange={setLongeOdEsf} className={gridInput} /></div>
                                            <div className="col-span-2"><DegreeInput name="receita_longe_od_cilindrico" value={longeOdCil} onChange={setLongeOdCil} className={gridInput} /></div>
                                            <div className="col-span-2"><input name="receita_longe_od_eixo" value={longeOdEixo} onChange={e => setLongeOdEixo(e.target.value)} className={gridInput} placeholder="0º" /></div>
                                        </div>

                                        <StockBadge matches={oeMatches} label="OE" onOpen={() => setStockModalOpen('OE')} />
                                        {pendingReservationBySlot.OE && (
                                            <div className="mb-2 rounded-lg border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[10px] font-bold text-cyan-200">
                                                OE selecionada para salvar: {pendingReservationBySlot.OE.productName} - {pendingReservationBySlot.OE.variantName}
                                            </div>
                                        )}

                                        {/* OE */}
                                        <div className="grid grid-cols-7 gap-2 mb-3 items-center p-3 bg-black/20 rounded-xl border border-white/5 shadow-inner">
                                            <div className="col-span-1 font-black text-right pr-3 text-xl text-cyan-400">OE</div>
                                            <div className="col-span-2"><DegreeInput name="receita_longe_oe_esferico" value={longeOeEsf} onChange={setLongeOeEsf} className={gridInput} /></div>
                                            <div className="col-span-2"><DegreeInput name="receita_longe_oe_cilindrico" value={longeOeCil} onChange={setLongeOeCil} className={gridInput} /></div>
                                            <div className="col-span-2"><input name="receita_longe_oe_eixo" value={longeOeEixo} onChange={e => setLongeOeEixo(e.target.value)} className={gridInput} placeholder="0º" /></div>
                                        </div>
                                    </div>

                                    {/* COLUNA DA ADIÇÃO */}
                                    <div className="w-24 flex flex-col">
                                        <div className="mb-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider h-[15px]">Adição</div>
                                        <div className="flex-1 bg-black/20 rounded-xl border border-white/5 shadow-inner p-1 flex items-center justify-center">
                                            <div className="w-full">
                                                <DegreeInput
                                                    name="receita_adicao"
                                                    value={adicao}
                                                    onChange={setAdicao}
                                                    className="w-full bg-transparent text-center font-bold text-white text-xl placeholder-slate-700 h-full min-h-[80px]"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            {/* CARD TEAL (PRAZOS) */}
                            <div className={cardTeal}>
                                <div className="flex justify-between border-b border-white/10 pb-3 mb-4 items-center">
                                    <h3 className="text-emerald-300 font-black flex items-center gap-3 text-lg tracking-[0.15em] uppercase drop-shadow-sm">
                                        <div className="p-1.5 bg-emerald-500/10 rounded-lg border border-emerald-500/20 shadow-inner">
                                            <CalendarClock className="h-5 w-5" />
                                        </div>
                                        PRAZOS E OBS
                                    </h3>
                                </div>
                                <div className="flex gap-2 items-start">
                                    <div className="w-1/3">
                                        <label className={labelTeal}>Prometido Para</label>
                                        <input
                                            type="datetime-local"
                                            name="dt_prometido_para"
                                            value={dtPrometido}
                                            onChange={e => setDtPrometido(e.target.value)}
                                            className={`${inputStyle} h-10 font-bold`}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className={labelTeal}>Observações</label>
                                        <input
                                            name="obs_os"
                                            value={obsOs}
                                            onChange={e => setObsOs(e.target.value)}
                                            className={`${inputStyle} h-10`}
                                            placeholder="Detalhes..."
                                        />
                                    </div>
                                </div>
                            </div>


                            {/* CARD AMBER (LAB) */}
                            <div className={cardAmber}>
                                <div className="flex justify-between border-b border-white/10 pb-3 mb-4 items-center">
                                    <h3 className="text-amber-300 font-black flex items-center gap-3 text-lg tracking-[0.15em] uppercase drop-shadow-sm">
                                        <div className="p-1.5 bg-amber-500/10 rounded-lg border border-amber-500/20 shadow-inner">
                                            <Truck className="h-5 w-5" />
                                        </div>
                                        LABORATÓRIO
                                    </h3>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <div><label className={labelAmber}>Pedido Em</label><input type="datetime-local" name="dt_pedido_em" value={dtPedido} onChange={e => setDtPedido(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelAmber}>Pedido Por</label>
                                        <select name="lab_pedido_por_id" value={pedidoPorId} onChange={e => setPedidoPorId(e.target.value)} className={inputStyle}>
                                            <option value="" className="bg-slate-800">Selecione...</option>
                                            {employees.map(emp => <option key={emp.id} value={emp.id} className="bg-slate-800">{emp.full_name}</option>)}
                                        </select>
                                    </div>
                                    <div><label className={labelAmber}>Laboratório</label><input type="text" name="lab_nome" value={labNome} onChange={e => setLabNome(e.target.value)} className={inputStyle} placeholder="Ex: Hoya" /></div>

                                    <div className="col-span-2 flex gap-6 pt-1">
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input type="checkbox" name="armacao_com_cliente" checked={armacaoComCliente} onChange={e => setArmacaoComCliente(e.target.checked)} className="w-4 h-4 rounded accent-emerald-500" />
                                            <span className="text-xs font-medium text-slate-300">Armação com o cliente</span>
                                        </label>
                                        <label className="flex items-center gap-2 cursor-pointer select-none">
                                            <input type="checkbox" name="os_enviada_ao_lab" checked={osEnviadaAoLab} onChange={e => setOsEnviadaAoLab(e.target.checked)} className="w-4 h-4 rounded accent-sky-500" />
                                            <span className="text-xs font-medium text-slate-300">OS enviada ao laboratório para montagem</span>
                                        </label>
                                    </div>
                                    <div aria-hidden="true" />

                                    <div><label className={labelAmber}>Lente Chegou</label><input type="datetime-local" name="dt_lente_chegou" value={dtChegou} onChange={e => setDtChegou(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelAmber}>Montado Em</label><input type="datetime-local" name="dt_montado_em" value={dtMontado} onChange={e => setDtMontado(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelAmber}>Entregue</label><input type="datetime-local" name="dt_entregue_em" value={dtEntregue} onChange={e => setDtEntregue(e.target.value)} className={inputStyle} /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 3. RODAPÉ FIXO (Pattern from VendaInterfaceExperimental) */}
                <div className="relative z-30 bg-black/60 backdrop-blur-xl border-t border-white/10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] shrink-0 px-4 py-3 flex justify-end gap-3">
                    <button type="button" onClick={handleReturnToSale} className="px-4 py-2 text-xs font-bold rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 transition-all flex items-center gap-2">VOLTAR</button>

                    {/* Botão de Impressão (Matching Theme) */}
                    <button
                        type="button"
                        onClick={() => {
                            if (!activeId) return
                            const url = `/print/os/${activeId}`
                            const width = 900
                            const height = 800
                            const left = (window.screen.width - width) / 2
                            const top = (window.screen.height - height) / 2
                            window.open(url, 'PrintWindow', `width=${width},height=${height},top=${top},left=${left},scrollbars=yes,resizable=yes`)
                        }}
                        disabled={!activeId}
                        className="px-4 py-2 text-xs font-bold rounded-lg border border-indigo-500/20 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Imprimir Protocolo"
                    >
                        <Printer className="h-4 w-4" /> <span className="hidden sm:inline">IMPRIMIR</span>
                    </button>

                    <button type="button" onClick={() => handleNavigate('new')} className="px-4 py-2 text-xs font-bold rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all flex items-center gap-2">
                        <Plus className="h-4 w-4" /> NOVA
                    </button>

                    {activeId && (
                        <button type="button" onClick={handleDelete} disabled={isDeleting} className="px-4 py-2 text-xs font-bold rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-all flex items-center gap-2">
                            {isDeleting ? <Loader2 className="animate-spin h-3 w-3" /> : <Trash2 className="h-3 w-3" />} EXCLUIR
                        </button>
                    )}
                    <button type="submit" disabled={isSaving} className="px-6 py-2 text-xs font-bold rounded-lg border border-cyan-500/20 bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.15)] transition-all flex items-center gap-2">
                        {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} SALVAR OS
                    </button>
                </div>

                {/* Hidden Inputs */}
                {currentOrder && <input type="hidden" name="id" value={currentOrder.id} />}
                <input type="hidden" name="store_id" value={storeId} />
                <input type="hidden" name="venda_id" value={vendaId} />
                <input type="hidden" name="customer_id" value={customer.id} />
                <input type="hidden" name="source_optical_evaluation_id" value={sourceOpticalEvaluationId} />
                <input type="hidden" name="evaluation_unlink_authorizer_id" value={evaluationUnlinkAuthorizer?.id ?? ''} />
                <input type="hidden" name="item_links_json" value={JSON.stringify([{ item_id: lenteOdItemId, uso: 'lente_od' }, { item_id: lenteOeItemId, uso: 'lente_oe' }, { item_id: armacaoItemId, uso: 'armacao' }].filter(x => x.item_id))} />
                <input type="hidden" name="pending_reservations_json" value={JSON.stringify(Object.values(pendingReservationBySlot).filter(Boolean))} />

            </form>

            {/* --- MODAIS EXTERNOS --- */}
            {
                isDepModalOpen && (
                    <AddDependenteModal
                        isOpen={isDepModalOpen}
                        onClose={() => setIsDepModalOpen(false)}
                        onSuccess={handleDependenteAdded}
                        storeId={storeId}
                        customerId={customer.id}
                    />
                )
            }

            {
                isOftalmoModalOpen && (
                    <AddOftalmoModal
                        isOpen={isOftalmoModalOpen}
                        onClose={() => setIsOftalmoModalOpen(false)}
                        onSuccess={handleOftalmoAdded}
                    />
                )
            }

            <PrescriptionHistoryModal
                isOpen={isHistoryModalOpen}
                onClose={() => setIsHistoryModalOpen(false)}
                onSelect={handleImportPrescription}
                customerId={customer.id}
                storeId={storeId}
                dependenteId={dependenteId ? parseInt(dependenteId) : null}
                dependenteNome={dependenteId ? localDependentes.find(d => d.id === parseInt(dependenteId))?.full_name : customer.full_name}
            />

            <StockReservationModal
                isOpen={!!stockModalOpen}
                onClose={() => setStockModalOpen(null)}
                matches={stockModalOpen === 'OD' ? odMatches : oeMatches}
                label={stockModalOpen || 'OD'}
                onReserve={handleReserve}
            />
            <OpticalEvaluationImportModal
                isOpen={isEvaluationModalOpen}
                onClose={() => setIsEvaluationModalOpen(false)}
                onSelect={handleSelectEvaluation}
                storeId={storeId}
                customerId={customer.id}
                dependenteId={dependenteId ? parseInt(dependenteId) : null}
                serviceOrderId={activeId || null}
                patientName={currentPatientName}
            />
            <EmployeeAuthModal
                storeId={storeId}
                isOpen={isEvaluationUnlinkAuthOpen}
                onClose={() => setIsEvaluationUnlinkAuthOpen(false)}
                onSuccess={handleEvaluationUnlinkAuthSuccess}
                title="Autorizar desvinculaÃ§Ã£o"
                description="Apenas o PIN de um gerente pode remover o vÃ­nculo com a avaliaÃ§Ã£o."
            />
        </>
    )
}

export default function ServiceOrderPage() {
    const params = useParams()
    const storeId = parseInt(params.storeId as string)
    const vendaId = parseInt(params.vendaId as string)
    const [data, setData] = useState<OSPageData | null>(null)
    const [loading, setLoading] = useState(true)
    const [errorMsg, setErrorMsg] = useState('')
    const [saveState, dispatch] = useFormState(saveServiceOrder, { success: false, message: '' })
    const [existingOrders, setExistingOrders] = useState<any[]>([])
    const [authedEmployeeName, setAuthedEmployeeName] = useState('')

    useEffect(() => {
        async function load() {
            try {
                if (isNaN(storeId) || isNaN(vendaId)) {
                    throw new Error(`IDs inválidos: Store=${params.storeId}, Venda=${params.vendaId}`)
                }

                const vendaRes = await getVendaPageData(vendaId, storeId)
                if (!vendaRes.success || !vendaRes.data || !vendaRes.data.venda) {
                    throw new Error(vendaRes.message || "Venda não encontrada.")
                }

                const venda = vendaRes.data.venda
                const customerId = venda.customer_id

                if (vendaRes.data.employee) {
                    setAuthedEmployeeName(vendaRes.data.employee.full_name)
                }

                const res = await getOSPageData(vendaId, storeId, customerId)
                if (!res.success || !res.data) {
                    throw new Error(res.message || "Erro desconhecido ao carregar dados da OS.")
                }

                setData(res.data)
                setExistingOrders(res.data.existingOrders)

            } catch (e: any) {
                console.error(e)
                setErrorMsg(e.message || "Erro inesperado.")
            } finally {
                setLoading(false)
            }
        }
        load()
    }, [storeId, vendaId, params.storeId, params.vendaId])

    if (loading) return <div className="p-10 flex justify-center"><Loader2 className="animate-spin h-8 w-8 text-blue-600" /></div>

    if (errorMsg) return (
        <div className="p-10 text-center">
            <div className="text-red-600 font-bold mb-2">Erro ao carregar dados:</div>
            <div className="text-gray-700 bg-gray-100 p-2 rounded inline-block mb-4">{errorMsg}</div>
            <button
                onClick={() => window.location.reload()}
                className="block mx-auto bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
            >
                Tentar Novamente
            </button>
        </div>
    )

    if (!data?.customer || !data?.venda) return null

    return (
        <div className="h-full bg-slate-950 flex flex-col overflow-hidden relative z-0">
            <ServiceOrderFormContent
                storeId={storeId}
                vendaId={vendaId}
                customer={data.customer}
                vendaItens={data.vendaItens}
                dependentes={data.dependentes}
                oftalmosList={data.oftalmologistas}
                employees={data.employees}
                existingOrders={existingOrders}
                authedEmployeeName={authedEmployeeName}
                onListChange={setExistingOrders}
                saveState={saveState}
                dispatch={dispatch}
                preSaleAnalysisEnabled={data.preSaleAnalysisEnabled}
                venda={data.venda}
            />
        </div>
    )
}
