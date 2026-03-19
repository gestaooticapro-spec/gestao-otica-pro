// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/ServiceOrderForm.tsx
'use client'

import {
    useState,
    useEffect,
    useCallback,
    useTransition,
    useRef,
} from 'react'
import { useFormStatus } from 'react-dom'
import { useRouter, useSearchParams } from 'next/navigation'
import {
    Loader2, Save, Trash2, ChevronLeft, ChevronRight,
    Eye, Glasses, User, Ruler, Truck, Plus, History, FileDown, CalendarClock,
    MessageCircle, Sparkles, FileText
} from 'lucide-react'
import {
    deleteServiceOrder,
    type OSPageData,
    type SaveSOResult,
    type PrescriptionHistoryItem
} from '@/lib/actions/vendas.actions'
import { checkLensStock, reserveLens, type LensStockMatch } from '@/lib/actions/stock.actions'
import { Database } from '@/lib/database.types'
import AddDependenteModal from '@/components/modals/AddDependenteModal'
import PrescriptionHistoryModal from '@/components/modals/PrescriptionHistoryModal'
import { PrintProtocoloButton } from '@/components/vendas/PrintProtocoloButton'

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

// --- ESTILOS DO DESIGN SYSTEM Dark Glassmorphic ---
const cardBase = "rounded-xl shadow-xl border border-white/5 bg-white/5 backdrop-blur-xl p-3 flex flex-col relative overflow-hidden transition-all hover:bg-white/10"
const cardBlue = cardBase
const cardSlate = cardBase
const cardViolet = cardBase
const cardTeal = cardBase
const cardAmber = cardBase

const labelStyle = 'block text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-wider'
// Estilo de input transparente/escuro
const inputStyle = 'block w-full rounded-lg border border-white/10 bg-black/20 shadow-inner text-white h-8 text-xs px-3 focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 focus:outline-none font-medium placeholder:font-normal placeholder:text-slate-500 disabled:opacity-50 transition-all'
const gridInput = `${inputStyle} text-center`

const baseButtonStyle = 'px-3 py-1.5 text-xs rounded-lg shadow-sm disabled:opacity-50 focus:outline-none transition-all duration-200 font-bold flex items-center gap-2'

// --- COMPONENTE: INPUT DE GRAU ---
function DegreeInput({ name, value, onChange, placeholder, className }: { name: string, value: string, onChange: (val: string) => void, placeholder?: string, className?: string }) {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        let raw = e.target.value.replace(/\D/g, '')
        if (!raw) { onChange(''); return }
        const val = parseInt(raw, 10) / 100
        const isNegative = value.includes('-')
        const formatted = val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        const finalValue = isNegative ? `-${formatted}` : `+${formatted}`
        onChange(finalValue)
    }

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === '-') {
            e.preventDefault()
            if (!value.includes('-')) onChange(value.replace('+', '').replace('-', '') ? `-${value.replace('+', '')}` : '-')
        }
        if (e.key === '+') {
            e.preventDefault()
            if (value.includes('-')) onChange(value.replace('-', '+'))
            else if (!value.includes('+')) onChange(`+${value}`)
        }
    }

    const isNegative = value.includes('-')
    const isPositive = value.includes('+')
    const textColor = isNegative ? 'text-rose-400' : isPositive ? 'text-emerald-400' : 'text-slate-200'

    return (
        <input
            name={name}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            className={`${className} ${textColor}`}
            placeholder={placeholder || "0,00"}
            autoComplete="off"
        />
    )
}

// --- BADGE DE ESTOQUE (SMART CHECK) ---
const StockBadge = ({
    matches,
    label,
    onOpen
}: {
    matches: { exact: LensStockMatch[], similar: LensStockMatch[] },
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
    matches: { exact: LensStockMatch[], similar: LensStockMatch[] }
    label: string
    onReserve: (variantId: number, productId: number) => void
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
                                                Olho {formatLensEye(m.olho)} Add {formatDegreeValue(m.adicao)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onReserve(m.variant_id, m.product_id)}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm transition-colors border border-emerald-500/30"
                                        >
                                            RESERVAR
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
                                                Olho {formatLensEye(m.olho)} Add {formatDegreeValue(m.adicao)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onReserve(m.variant_id, m.product_id)}
                                            className="bg-amber-600 hover:bg-amber-500 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm transition-colors border border-amber-500/30"
                                        >
                                            RESERVAR
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-white/5 px-4 py-2 text-center text-[10px] text-slate-500 border-t border-white/5">
                    A reserva bloqueia o item no estoque imediatamente.
                </div>
            </div>
        </div>
    )
}

// TIPO DO FORMULÁRIO
export type ServiceOrderFormProps = Omit<OSPageData, 'oftalmologistas'> & {
    storeId: number
    vendaId: number
    oftalmosList: OSPageData['oftalmologistas']
    authedEmployeeName: string
    onListChange: (l: any) => void
    saveState: SaveSOResult
    dispatch: (payload: FormData) => void
    venda: any
}

export default function ServiceOrderFormContent({
    storeId, vendaId, customer, vendaItens, dependentes: initialDependentes, oftalmosList, employees, existingOrders, authedEmployeeName, onListChange, saveState, dispatch,
    venda
}: ServiceOrderFormProps) {

    const router = useRouter()
    const searchParams = useSearchParams()
    const targetOsId = searchParams.get('os_id')

    const { pending: isSaving } = useFormStatus()
    const [isDeleting, startDeleteTransition] = useTransition()

    const [currentIndex, setCurrentIndex] = useState(() => {
        if (targetOsId && existingOrders.length > 0) {
            const foundIndex = existingOrders.findIndex((o: any) => o.id === parseInt(targetOsId))
            return foundIndex !== -1 ? foundIndex : -1
        }
        return -1
    })

    const [isDepModalOpen, setIsDepModalOpen] = useState(false)
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [localDependentes, setLocalDependentes] = useState<Dependente[]>(initialDependentes)

    const lastSuccessRef = useRef<number | undefined>(0);

    // --- STATES DO FORM ---
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

    // Lab e Prazos
    const [dtPedido, setDtPedido] = useState(''); const [pedidoPorId, setPedidoPorId] = useState(''); const [labNome, setLabNome] = useState('')
    const [dtChegou, setDtChegou] = useState(''); const [dtMontado, setDtMontado] = useState(''); const [dtEntregue, setDtEntregue] = useState('')
    const [dtPrometido, setDtPrometido] = useState(''); const [obsOs, setObsOs] = useState('')

    // Smart Stock Check
    const [odMatches, setOdMatches] = useState<{ exact: LensStockMatch[], similar: LensStockMatch[] }>({ exact: [], similar: [] })
    const [oeMatches, setOeMatches] = useState<{ exact: LensStockMatch[], similar: LensStockMatch[] }>({ exact: [], similar: [] })
    const [stockModalOpen, setStockModalOpen] = useState<'OD' | 'OE' | null>(null)

    // Monitora OD para sobras e estoque
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (longeOdEsf) {
                const esf = parseDegreeValue(longeOdEsf)
                const cil = parseDegreeValue(longeOdCil, 0)
                if (esf !== null && cil !== null) {
                    const matches = await checkLensStock(storeId, esf, cil, null, parseDegreeValue(adicao), 'OD', parseAxisValue(longeOdEixo))
                    setOdMatches(matches)
                }
            } else setOdMatches({ exact: [], similar: [] })
        }, 800)
        return () => clearTimeout(timer)
    }, [longeOdEsf, longeOdCil, longeOdEixo, adicao, storeId])

    // Monitora OE para sobras e estoque
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (longeOeEsf) {
                const esf = parseDegreeValue(longeOeEsf)
                const cil = parseDegreeValue(longeOeCil, 0)
                if (esf !== null && cil !== null) {
                    const matches = await checkLensStock(storeId, esf, cil, null, parseDegreeValue(adicao), 'OE', parseAxisValue(longeOeEixo))
                    setOeMatches(matches)
                }
            } else setOeMatches({ exact: [], similar: [] })
        }, 800)
        return () => clearTimeout(timer)
    }, [longeOeEsf, longeOeCil, longeOeEixo, adicao, storeId])

    const handleReserve = async (variantId: number, productId: number) => {
        if (!currentOrder?.id) {
            alert("Salve a OS primeiro antes de reservar itens.")
            return
        }

        const empId = venda.employee_id || 0 // Fallback

        const res = await reserveLens(storeId, variantId, productId, currentOrder.id, empId)
        if (res.success) {
            alert("Lente reservada com sucesso! O estoque foi atualizado.")
            setStockModalOpen(null)
            // Opcional: Recarregar dados ou atualizar UI
        } else {
            alert(`Erro ao reservar: ${res.message}`)
        }
    }

    // LÓGICA INTELIGENTE DE FILTRAGEM DE LENTES
    const itensLente = vendaItens.filter(i => i.item_tipo === 'Lente')

    // Função auxiliar para verificar disponibilidade
    const isLenteDisponivel = (item: any, olho: 'OD' | 'OE') => {
        // Se for Par, está sempre disponível (pode usar no OD e OE)
        if (item.unidade === 'Par') return true;

        // Se for Unidade, precisamos ver se já foi usada no OUTRO olho
        const outroOlhoId = olho === 'OD' ? lenteOeItemId : lenteOdItemId;

        // Se o outro olho não tem nada selecionado, ou tem OUTRA lente selecionada, esta está livre
        if (!outroOlhoId || outroOlhoId !== item.id.toString()) return true;

        // Se o outro olho está usando ESTA MESMA lente (pelo ID), precisamos ver a quantidade comprada
        // Se comprou 2 unidades, pode usar. Se comprou 1, já era.
        if (item.quantidade >= 2) return true;

        return false;
    }

    const lentesDisponiveisOD = itensLente.filter(i => isLenteDisponivel(i, 'OD'));
    const lentesDisponiveisOE = itensLente.filter(i => isLenteDisponivel(i, 'OE'));

    const itensArmacao = vendaItens.filter(i => i.item_tipo === 'Armacao' || i.item_tipo === 'Solar')

    // Cast 'as any' no currentOrder
    const currentOrder = (currentIndex >= 0 && currentIndex < existingOrders.length ? existingOrders[currentIndex] : undefined) as any

    useEffect(() => {
        if (saveState.success && saveState.data && saveState.timestamp !== lastSuccessRef.current) {
            alert(saveState.message)
            const savedOS = saveState.data as ServiceOrderWithLinks
            let newList = [...existingOrders]
            const idx = newList.findIndex(o => o.id === savedOS.id)
            if (idx > -1) newList[idx] = savedOS; else newList.push(savedOS)
            newList.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
            onListChange(newList)
            setCurrentIndex(newList.findIndex(o => o.id === savedOS.id))
            lastSuccessRef.current = saveState.timestamp;
        }
    }, [saveState, onListChange, existingOrders])

    const resetForm = useCallback(() => {
        setDependenteId(''); setOftalmologistaId(''); setLenteOdItemId(''); setLenteOeItemId(''); setArmacaoItemId('')
        setLongeOdEsf(''); setLongeOdCil(''); setLongeOdEixo(''); setLongeOeEsf(''); setLongeOeCil(''); setLongeOeEixo('')
        setPertoOdEsf(''); setPertoOdCil(''); setPertoOdEixo(''); setPertoOeEsf(''); setPertoOeCil(''); setPertoOeEixo(''); setAdicao('')
        setMedH(''); setMedV(''); setMedDiag(''); setMedPonte(''); setDnpOd(''); setDnpOe(''); setAltOd(''); setAltOe(''); setDiametro('')
        setDtPedido(''); setPedidoPorId(''); setLabNome(''); setDtChegou(''); setDtMontado(''); setDtEntregue(''); setDtPrometido(''); setObsOs('')
        setProtocolo('')
    }, [])

    useEffect(() => {
        if (!currentOrder) { resetForm() } else {
            const os = currentOrder
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
            setDtPedido(toDateTimeInput(os.dt_pedido_em)); setPedidoPorId(os.lab_pedido_por_id?.toString() ?? ''); setLabNome(os.lab_nome ?? '')
            setDtChegou(toDateTimeInput(os.dt_lente_chegou)); setDtMontado(toDateTimeInput(os.dt_montado_em)); setDtEntregue(toDateTimeInput(os.dt_entregue_em))
            setDtPrometido(toDateTimeInput(os.dt_prometido_para)); setObsOs(os.obs_os ?? '')
            setProtocolo(os.protocolo_fisico || os.id.toString())
        }
    }, [currentIndex, currentOrder, resetForm])

    const handleNavigate = (dir: 'prev' | 'next' | 'new') => {
        if (dir === 'new') { setCurrentIndex(-1); return; }
        if (existingOrders.length === 0) return;
        let newIndex = currentIndex
        if (dir === 'prev') newIndex = currentIndex <= 0 ? existingOrders.length - 1 : currentIndex - 1
        else newIndex = currentIndex >= existingOrders.length - 1 ? 0 : currentIndex + 1
        setCurrentIndex(newIndex)
    }

    const handleDelete = () => {
        if (!currentOrder) return; if (!confirm('Excluir OS?')) return;
        startDeleteTransition(async () => {
            const res = await deleteServiceOrder(currentOrder.id, storeId, vendaId)
            if (res.success) { onListChange(existingOrders.filter((o: any) => o.id !== currentOrder.id)); setCurrentIndex(-1) }
            else { alert(res.message) }
        })
    }

    const handleDependenteAdded = (newDep: Dependente) => {
        setLocalDependentes(prev => [...prev, newDep])
        setDependenteId(newDep.id.toString())
    }

    const handleImportPrescription = (data: PrescriptionHistoryItem) => {
        if (confirm("Deseja preencher os campos com os dados desta receita antiga?")) {
            setLongeOdEsf(data.receita_longe_od_esferico || ''); setLongeOdCil(data.receita_longe_od_cilindrico || ''); setLongeOdEixo(data.receita_longe_od_eixo || '');
            setLongeOeEsf(data.receita_longe_oe_esferico || ''); setLongeOeCil(data.receita_longe_oe_cilindrico || ''); setLongeOeEixo(data.receita_longe_oe_eixo || '');
            setAdicao(data.receita_adicao || ''); setDnpOd(data.medida_dnp_od || ''); setDnpOe(data.medida_dnp_oe || '');
            setIsHistoryModalOpen(false);
        }
    }

    const sendWhatsAppPedido = () => {
        const lenteOdDesc = vendaItens.find(i => i.id === parseInt(lenteOdItemId))?.descricao || 'Não informado';
        const lenteOeDesc = vendaItens.find(i => i.id === parseInt(lenteOeItemId))?.descricao || 'Não informado';
        const medico = oftalmosList.find(o => o.id === parseInt(oftalmologistaId));
        const medicoTexto = medico ? `${medico.nome_completo} ${medico.crm ? 'CRM ' + medico.crm : ''}` : 'Não informado';
        // Usa o nome do paciente (dependente se selecionado, senão o titular)
        const pacienteNome = dependenteId
            ? localDependentes.find(d => d.id === parseInt(dependenteId))?.full_name || customer?.full_name
            : customer?.full_name || 'Paciente';
        const prometidoPara = dtPrometido ? formatDate(dtPrometido) : 'A combinar';

        const msg = `
*Pedido de Lentes*

Protocolo/OS #${protocolo || 'Nova'}
Prometido para: ${prometidoPara}

--Receita--
Lente OD: ${lenteOdDesc}
Lente OE: ${lenteOeDesc}
OD: ${longeOdEsf} ${longeOdCil} ${longeOdEixo}
OE: ${longeOeEsf} ${longeOeCil} ${longeOeEixo}
AD: ${adicao}

--Medidas--
Hor: ${medH}
Vert: ${medV}
Diag: ${medDiag}
Ponte: ${medPonte}
DP: ${dnpOd}/${dnpOe}
Diam: ${diametro}
Alt: ${altOd}/${altOe}

--Dados Pessoais--
Cliente: ${pacienteNome}
Médico: ${medicoTexto}

Obs.: ${obsOs}
`.trim();

        const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
        window.open(url, '_blank');
    }

    if (!customer) return <div className="p-4">Carregando dados do cliente...</div>

    return (
        <>
            <form action={dispatch} className="flex-1 flex flex-col h-[calc(100vh-64px)]">

                {/* ÁREA DE SCROLL (HEADER + CONTEÚDO) */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-3 custom-scrollbar">

                    {/* HEADER INFO */}
                    <div className="p-3 rounded-xl bg-white/5 backdrop-blur-xl border border-white/10 flex justify-between items-center mb-3 shadow-lg">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400 border border-cyan-500/20">
                                <User className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cliente</p>
                                <p className="font-black text-white text-sm leading-none tracking-tight">{customer.full_name}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Atendente</p>
                            <p className="font-bold text-slate-200 text-xs">{authedEmployeeName}</p>
                        </div>
                    </div>

                    {/* NAV BAR */}
                    <div className="bg-white/5 backdrop-blur-md p-2 rounded-xl shadow-lg border border-white/10 flex justify-between items-center gap-3 mb-3">
                        <div className="flex items-center gap-3 ml-2 min-w-fit">
                            <Eye className="h-5 w-5 text-cyan-400" />
                            <h2 className="text-sm font-black text-white hidden sm:block tracking-tight">
                                {currentOrder ? `Ficha #${currentOrder.id}` : 'Nova Ficha'}
                            </h2>
                            <span className="bg-white/5 text-slate-300 text-[10px] px-2 py-0.5 rounded-full font-bold border border-white/10 whitespace-nowrap shadow-inner">
                                {currentIndex === -1 ? 'NOVA' : `${currentIndex + 1}/${existingOrders.length}`}
                            </span>
                            <button
                                type="button"
                                onClick={() => router.push(`/dashboard/loja/${storeId}/vendas/${vendaId}`)}
                                className="ml-2 flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded-lg border border-white/10 transition-colors shadow-sm text-[10px] font-bold uppercase tracking-wider whitespace-nowrap"
                                title="Voltar para a Venda que gerou esta OS"
                            >
                                <FileText className="h-3 w-3 text-cyan-400" />
                                Ver Venda
                            </button>
                        </div>

                        <div className="flex-1 flex justify-center">
                            <div className="flex items-center gap-2 bg-black/20 px-3 py-1 rounded-lg border border-white/5 w-full max-w-[200px] shadow-inner">
                                <label htmlFor="protocolo_input" className="text-[9px] font-bold text-slate-500 uppercase whitespace-nowrap tracking-wider">
                                    Protocolo
                                </label>
                                <input
                                    id="protocolo_input"
                                    name="protocolo_fisico"
                                    type="text"
                                    value={protocolo}
                                    onChange={(e) => setProtocolo(e.target.value)}
                                    className="bg-transparent border-none text-white text-xs focus:ring-0 block w-full h-6 px-1 font-bold text-center uppercase p-0 placeholder-slate-600"
                                    placeholder="AUTO"
                                />
                            </div>
                        </div>

                        <div className="flex gap-1 min-w-fit">
                            <button type="button" onClick={() => handleNavigate('prev')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"><ChevronLeft className="h-4 w-4" /></button>
                            <button type="button" onClick={() => handleNavigate('next')} className="p-2 hover:bg-white/10 rounded-lg text-slate-400 transition-colors"><ChevronRight className="h-4 w-4" /></button>
                            <button type="button" onClick={() => handleNavigate('new')} className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-3 py-1 rounded-lg hover:bg-emerald-500/20 ml-1 shadow-sm transition-all uppercase tracking-wide">NOVA</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">

                        {/* COLUNA 1: Dados Gerais e Medidas (4 colunas) */}
                        <div className="lg:col-span-4 space-y-2 flex flex-col">

                            {/* CARD AZUL (DADOS) */}
                            {/* CARD DADOS */}
                            <div className={cardBlue}>
                                <h3 className="text-cyan-400 font-black text-lg mb-4 flex items-center gap-3 border-b border-white/10 pb-3 tracking-[0.15em] uppercase drop-shadow-sm">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-inner">
                                        <User className="h-5 w-5" />
                                    </div>
                                    DADOS E VÍNCULOS
                                </h3>
                                <div className="space-y-2 flex-1">
                                    <div>
                                        <label className={labelStyle}>Paciente</label>
                                        <div className="flex gap-1">
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

                                    <div>
                                        <label className={labelStyle}>Médico</label>
                                        <select name="oftalmologista_id" value={oftalmologistaId} onChange={e => setOftalmologistaId(e.target.value)} className={inputStyle}>
                                            <option value="" className="bg-slate-800">Selecione...</option>
                                            {oftalmosList.map(oft => <option key={oft.id} value={oft.id} className="bg-slate-800">{oft.nome_completo}</option>)}
                                        </select>
                                    </div>

                                    <div className="pt-3 border-t border-white/5 mt-2 space-y-3">
                                        <div>
                                            <label className={labelStyle}>Lente OD</label>
                                            <select value={lenteOdItemId} onChange={e => setLenteOdItemId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">-- Selecione --</option>
                                                {lentesDisponiveisOD.map(i => <option key={i.id} value={i.id} className="bg-slate-800">{i.descricao} ({i.unidade})</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Lente OE</label>
                                            <select value={lenteOeItemId} onChange={e => setLenteOeItemId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">-- Selecione --</option>
                                                {lentesDisponiveisOE.map(i => <option key={i.id} value={i.id} className="bg-slate-800">{i.descricao} ({i.unidade})</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Armação</label>
                                            <select value={armacaoItemId} onChange={e => setArmacaoItemId(e.target.value)} className={inputStyle}>
                                                <option value="" className="bg-slate-800">-- Selecione --</option>
                                                {itensArmacao.map(i => <option key={i.id} value={i.id} className="bg-slate-800">{i.descricao}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CARD MEDIDAS */}
                            <div className={cardSlate}>
                                <h3 className="text-cyan-400 font-black text-lg mb-4 flex items-center gap-3 border-b border-white/10 pb-3 tracking-[0.15em] uppercase drop-shadow-sm">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-inner">
                                        <Ruler className="h-5 w-5" />
                                    </div>
                                    MEDIDAS TÉCNICAS
                                </h3>
                                <div className="grid grid-cols-3 gap-2 mb-3 items-end">
                                    <div className="col-span-1"></div>
                                    <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">OD</div>
                                    <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">OE</div>

                                    <label className="text-right text-[10px] font-bold text-slate-400 pr-1 self-center uppercase tracking-wider">DNP</label>
                                    <input name="medida_dnp_od" value={dnpOd} onChange={e => setDnpOd(e.target.value)} className={gridInput} />
                                    <input name="medida_dnp_oe" value={dnpOe} onChange={e => setDnpOe(e.target.value)} className={gridInput} />

                                    <label className="text-right text-[10px] font-bold text-slate-400 pr-1 self-center uppercase tracking-wider">Altura</label>
                                    <input name="medida_altura_od" value={altOd} onChange={e => setAltOd(e.target.value)} className={gridInput} />
                                    <input name="medida_altura_oe" value={altOe} onChange={e => setAltOe(e.target.value)} className={gridInput} />
                                </div>

                                <div className="grid grid-cols-2 gap-2 border-t border-white/5 pt-3">
                                    <div><label className={labelStyle}>Horizontal</label><input name="medida_horizontal" value={medH} onChange={e => setMedH(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Vertical</label><input name="medida_vertical" value={medV} onChange={e => setMedV(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Diagonal</label><input name="medida_diagonal" value={medDiag} onChange={e => setMedDiag(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Ponte</label><input name="medida_ponte" value={medPonte} onChange={e => setMedPonte(e.target.value)} className={inputStyle} /></div>

                                    {/* DIÂMETRO COM WHATSAPP */}
                                    <div className="col-span-2 flex items-end gap-1">
                                        <div className="flex-1">
                                            <label className={labelStyle}>Diâmetro</label>
                                            <input name="medida_diametro" value={diametro} onChange={e => setDiametro(e.target.value)} className={inputStyle} />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={sendWhatsAppPedido}
                                            className="h-8 px-3 bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 rounded-lg shadow-sm flex items-center gap-2 transition-all hover:scale-105"
                                            title="Enviar Pedido via WhatsApp"
                                        >
                                            <MessageCircle className="h-4 w-4" /> <span className="font-bold text-[10px] hidden xl:inline">PEDIR</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* COLUNA 2: Receita, Prazos e Lab (8 colunas) */}
                        <div className="lg:col-span-8 space-y-2 flex flex-col">

                            {/* CARD RECEITA */}
                            <div className={cardViolet}>
                                <div className="flex justify-between border-b border-white/10 pb-3 mb-4 items-center">
                                    <h3 className="font-black text-cyan-400 flex items-center gap-3 text-lg tracking-[0.15em] uppercase drop-shadow-sm">
                                        <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-inner">
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
                                        <button
                                            type="button"
                                            onClick={() => { setLongeOdEsf('+0,00'); setLongeOdCil('+0,00'); setLongeOdEixo('0'); setLongeOeEsf('+0,00'); setLongeOeCil('+0,00'); setLongeOeCil('+0,00'); setLongeOeEixo('0'); }}
                                            className="text-[10px] font-bold text-slate-400 border border-white/10 hover:bg-white/5 hover:text-white px-3 py-1 rounded-lg transition-colors uppercase tracking-wide"
                                        >
                                            <FileDown className="h-3 w-3 inline mr-1" /> Zerar
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-7 gap-2 mb-2 text-center text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                    <div className="col-span-1"></div><div className="col-span-2">Esférico</div><div className="col-span-2">Cilíndrico</div><div className="col-span-2">Eixo</div>
                                </div>

                                <StockBadge matches={odMatches} label="OD" onOpen={() => setStockModalOpen('OD')} />

                                {/* OD */}
                                <div className="grid grid-cols-7 gap-2 mb-3 items-center p-3 bg-black/20 rounded-xl border border-white/5 shadow-inner">
                                    <div className="col-span-1 font-black text-right pr-3 text-xl text-cyan-400">OD</div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_od_esferico" value={longeOdEsf} onChange={setLongeOdEsf} className={gridInput} /></div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_od_cilindrico" value={longeOdCil} onChange={setLongeOdCil} className={gridInput} /></div>
                                    <div className="col-span-2"><input name="receita_longe_od_eixo" value={longeOdEixo} onChange={e => setLongeOdEixo(e.target.value)} className={gridInput} placeholder="0º" /></div>
                                </div>

                                <StockBadge matches={oeMatches} label="OE" onOpen={() => setStockModalOpen('OE')} />

                                {/* OE */}
                                <div className="grid grid-cols-7 gap-2 mb-3 items-center p-3 bg-black/20 rounded-xl border border-white/5 shadow-inner">
                                    <div className="col-span-1 font-black text-right pr-3 text-xl text-cyan-400">OE</div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_oe_esferico" value={longeOeEsf} onChange={setLongeOeEsf} className={gridInput} /></div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_oe_cilindrico" value={longeOeCil} onChange={setLongeOeCil} className={gridInput} /></div>
                                    <div className="col-span-2"><input name="receita_longe_oe_eixo" value={longeOeEixo} onChange={e => setLongeOeEixo(e.target.value)} className={gridInput} placeholder="0º" /></div>
                                </div>

                                <div className="flex justify-center mt-3">
                                    <div className="w-40 bg-white/5 border border-white/10 p-3 rounded-xl text-center shadow-lg">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1 tracking-wider">Adição</label>
                                        <DegreeInput name="receita_adicao" value={adicao} onChange={setAdicao} className={`${gridInput} h-10 text-2xl font-black bg-transparent border-transparent text-emerald-400 focus:ring-0`} placeholder="+0.00" />
                                    </div>
                                </div>
                            </div>

                            {/* CARD PRAZOS */}
                            <div className={cardTeal}>
                                <h3 className="text-cyan-400 font-black text-lg mb-4 flex items-center gap-3 border-b border-white/10 pb-3 tracking-[0.15em] uppercase drop-shadow-sm">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-inner">
                                        <CalendarClock className="h-5 w-5" />
                                    </div>
                                    PRAZOS E OBS
                                </h3>
                                <div className="flex gap-2 items-start">
                                    <div className="w-1/3">
                                        <label className={labelStyle}>Prometido Para</label>
                                        <input
                                            type="datetime-local"
                                            name="dt_prometido_para"
                                            value={dtPrometido}
                                            onChange={e => setDtPrometido(e.target.value)}
                                            className={`${inputStyle} h-10 font-bold`}
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <label className={labelStyle}>Observações</label>
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

                            {/* CARD LAB */}
                            <div className={cardAmber}>
                                <h3 className="text-cyan-400 font-black text-lg mb-4 flex items-center gap-3 border-b border-white/10 pb-3 tracking-[0.15em] uppercase drop-shadow-sm">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-lg border border-cyan-500/20 shadow-inner">
                                        <Truck className="h-5 w-5" />
                                    </div>
                                    LABORATÓRIO
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <div><label className={labelStyle}>Pedido Em</label><input type="datetime-local" name="dt_pedido_em" value={dtPedido} onChange={e => setDtPedido(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Pedido Por</label>
                                        <select name="lab_pedido_por_id" value={pedidoPorId} onChange={e => setPedidoPorId(e.target.value)} className={inputStyle}>
                                            <option value="" className="bg-slate-800">Selecione...</option>
                                            {employees.map(emp => <option key={emp.id} value={emp.id} className="bg-slate-800">{emp.full_name}</option>)}
                                        </select>
                                    </div>
                                    <div><label className={labelStyle}>Laboratório</label><input type="text" name="lab_nome" value={labNome} onChange={e => setLabNome(e.target.value)} className={inputStyle} placeholder="Ex: Hoya" /></div>

                                    <div><label className={labelStyle}>Lente Chegou</label><input type="datetime-local" name="dt_lente_chegou" value={dtChegou} onChange={e => setDtChegou(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Montado Em</label><input type="datetime-local" name="dt_montado_em" value={dtMontado} onChange={e => setDtMontado(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Entregue</label><input type="datetime-local" name="dt_entregue_em" value={dtEntregue} onChange={e => setDtEntregue(e.target.value)} className={inputStyle} /></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* FOOTER FIXO */}
                <div className="shrink-0 bg-white/5 backdrop-blur-xl border-t border-white/10 px-4 py-3 flex justify-end gap-3 z-20 shadow-[0_-5px_20px_rgba(0,0,0,0.2)]">
                    <button type="button" onClick={() => router.back()} className={`${baseButtonStyle} bg-white/5 text-slate-400 hover:bg-white/10 border border-white/10`}>VOLTAR</button>

                    {/* Botão de Impressão */}
                    <PrintProtocoloButton osId={currentOrder?.id} disabled={!currentOrder} />

                    {currentOrder && (
                        <button type="button" onClick={handleDelete} disabled={isDeleting} className={`${baseButtonStyle} bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20`}>
                            {isDeleting ? <Loader2 className="animate-spin h-3 w-3" /> : <Trash2 className="h-3 w-3" />} EXCLUIR
                        </button>
                    )}
                    <button type="submit" disabled={isSaving} className={`${baseButtonStyle} bg-cyan-600 text-white hover:bg-cyan-500 px-6 text-sm shadow-lg shadow-cyan-500/20 border border-cyan-400/20`}>
                        {isSaving ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="h-4 w-4" />} SALVAR OS
                    </button>
                </div>

                {/* Hidden Inputs */}
                {currentOrder && <input type="hidden" name="id" value={currentOrder.id} />}
                <input type="hidden" name="store_id" value={storeId} />
                <input type="hidden" name="venda_id" value={vendaId} />
                <input type="hidden" name="customer_id" value={customer.id} />
                <input type="hidden" name="item_links_json" value={JSON.stringify([{ item_id: lenteOdItemId, uso: 'lente_od' }, { item_id: lenteOeItemId, uso: 'lente_oe' }, { item_id: armacaoItemId, uso: 'armacao' }].filter(x => x.item_id))} />

            </form>

            {/* --- MODAIS EXTERNOS --- */}
            {isDepModalOpen && (
                <AddDependenteModal
                    isOpen={isDepModalOpen}
                    onClose={() => setIsDepModalOpen(false)}
                    onSuccess={handleDependenteAdded}
                    storeId={storeId}
                    customerId={customer.id}
                />
            )}

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
                label={stockModalOpen || ''}
                onReserve={handleReserve}
            />
        </>
    )
}
