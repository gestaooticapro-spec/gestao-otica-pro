// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/os/page.tsx
'use client'

import {
    useState,
    useEffect,
    useCallback,
    useTransition,
    useRef,
} from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import {
    Loader2, Save, Trash2, ChevronLeft, ChevronRight,
    Eye, Glasses, User, Ruler, Truck, Plus, History, FileDown, CalendarClock,
    MessageCircle, Sparkles
} from 'lucide-react'
import {
    saveServiceOrder,
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

const toDateTimeInput = (isoString: string | null | undefined) => {
    if (!isoString) return '';
    return new Date(isoString).toISOString().slice(0, 16);
}

const formatDate = (d: string) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// --- ESTILOS DO DESIGN SYSTEM (COMPACTO) ---
const cardBase = "rounded-xl shadow-sm border border-white/20 p-3 flex flex-col relative overflow-hidden" // p-5 -> p-3
const cardBlue = `${cardBase} bg-gradient-to-br from-blue-600 to-indigo-700 shadow-blue-100`
const cardSlate = `${cardBase} bg-gradient-to-br from-slate-600 to-slate-700 shadow-slate-200`
const cardViolet = `${cardBase} bg-gradient-to-br from-indigo-600 to-violet-700 shadow-indigo-100`
const cardTeal = `${cardBase} bg-gradient-to-br from-teal-500 to-emerald-600 shadow-emerald-100`
const cardAmber = `${cardBase} bg-gradient-to-br from-amber-500 to-orange-600 shadow-orange-100`

const labelStyle = 'block text-[10px] font-bold text-white/80 mb-0.5 uppercase tracking-wider' // mb-1 -> mb-0.5
const inputStyle = 'block w-full rounded border-0 bg-white shadow-sm text-gray-900 h-7 text-xs px-2 focus:ring-1 focus:ring-white/50 focus:outline-none font-semibold placeholder:font-normal placeholder:text-gray-400 disabled:bg-gray-200 disabled:text-gray-500' // h-10 -> h-7, text-sm -> text-xs
const gridInput = `${inputStyle} text-center` // removido text-lg

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
    const textColor = isNegative ? 'text-red-600' : isPositive ? 'text-green-600' : 'text-gray-900'

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
    const colorClass = hasExact ? "bg-green-100 border-green-200 text-green-900" : "bg-amber-100 border-amber-200 text-amber-900"
    const iconColor = hasExact ? "text-green-600" : "text-amber-600"

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
                {hasExact && <span className="text-[9px] bg-white px-1 rounded font-bold border border-green-300">EXATO</span>}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <Glasses className="h-4 w-4 text-blue-600" /> Estoque Disponível ({label})
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><Trash2 className="h-4 w-4 rotate-45" /></button>
                </div>

                <div className="p-4 max-h-[60vh] overflow-y-auto space-y-4">
                    {matches.exact.length > 0 && (
                        <div>
                            <h4 className="text-xs font-bold text-green-700 uppercase mb-2 flex items-center gap-1">
                                <Sparkles className="h-3 w-3" /> Exatamente o que você precisa
                            </h4>
                            <div className="space-y-2">
                                {matches.exact.map(m => (
                                    <div key={m.variant_id} className="border border-green-200 bg-green-50 rounded-lg p-2 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-xs text-gray-800">{m.product_name}</p>
                                            <p className="text-[10px] text-gray-500">{m.variant_name} • {m.is_sobra ? 'SOBRA/RECUP.' : 'NOVO'}</p>
                                            <p className="text-[10px] font-mono text-gray-600">
                                                Sph {m.esferico > 0 ? '+' : ''}{m.esferico.toFixed(2)} Cyl {m.cilindrico > 0 ? '+' : ''}{m.cilindrico.toFixed(2)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onReserve(m.variant_id, m.product_id)}
                                            className="bg-green-600 hover:bg-green-700 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm transition-colors"
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
                            <h4 className="text-xs font-bold text-amber-700 uppercase mb-2 flex items-center gap-1">
                                <History className="h-3 w-3" /> Similares / Aproximados
                            </h4>
                            <div className="space-y-2">
                                {matches.similar.map(m => (
                                    <div key={m.variant_id} className="border border-amber-200 bg-amber-50 rounded-lg p-2 flex justify-between items-center">
                                        <div>
                                            <p className="font-bold text-xs text-gray-800">{m.product_name}</p>
                                            <p className="text-[10px] text-gray-500">{m.variant_name} • {m.is_sobra ? 'SOBRA' : 'NOVO'}</p>
                                            <p className="text-[10px] font-mono text-gray-600">
                                                Sph {m.esferico > 0 ? '+' : ''}{m.esferico.toFixed(2)} Cyl {m.cilindrico > 0 ? '+' : ''}{m.cilindrico.toFixed(2)}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => onReserve(m.variant_id, m.product_id)}
                                            className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold px-3 py-1.5 rounded shadow-sm transition-colors"
                                        >
                                            RESERVAR
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-gray-50 px-4 py-2 text-center text-[10px] text-gray-500 border-t border-gray-100">
                    A reserva bloqueia o item no estoque imediatamente.
                </div>
            </div>
        </div>
    )
}

// TIPO DO FORMULÁRIO
type FormProps = Omit<OSPageData, 'oftalmologistas'> & {
    storeId: number
    vendaId: number
    oftalmosList: OSPageData['oftalmologistas']
    authedEmployeeName: string
    onListChange: (l: any) => void
    saveState: SaveSOResult
    dispatch: (payload: FormData) => void
    venda: any
}

function ServiceOrderFormContent({
    storeId, vendaId, customer, vendaItens, dependentes: initialDependentes, oftalmosList, employees, existingOrders, authedEmployeeName, onListChange, saveState, dispatch,
    venda
}: FormProps) {

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
            if (longeOdEsf && longeOdCil) {
                const esf = parseFloat(longeOdEsf.replace(',', '.').replace('+', ''))
                const cil = parseFloat(longeOdCil.replace(',', '.').replace('+', ''))
                if (!isNaN(esf) && !isNaN(cil)) {
                    const matches = await checkLensStock(storeId, esf, cil)
                    setOdMatches(matches)
                }
            } else setOdMatches({ exact: [], similar: [] })
        }, 800)
        return () => clearTimeout(timer)
    }, [longeOdEsf, longeOdCil, storeId])

    // Monitora OE para sobras e estoque
    useEffect(() => {
        const timer = setTimeout(async () => {
            if (longeOeEsf && longeOeCil) {
                const esf = parseFloat(longeOeEsf.replace(',', '.').replace('+', ''))
                const cil = parseFloat(longeOeCil.replace(',', '.').replace('+', ''))
                if (!isNaN(esf) && !isNaN(cil)) {
                    const matches = await checkLensStock(storeId, esf, cil)
                    setOeMatches(matches)
                }
            } else setOeMatches({ exact: [], similar: [] })
        }, 800)
        return () => clearTimeout(timer)
    }, [longeOeEsf, longeOeCil, storeId])

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

    const itensLente = vendaItens.filter(i => i.item_tipo === 'Lente')
    const itensArmacao = vendaItens.filter(i => i.item_tipo === 'Armacao')

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
        const clienteNome = customer?.full_name || 'Cliente';
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
Cliente: ${clienteNome}
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
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-2">

                    {/* HEADER INFO */}
                    <div className="p-2 rounded-lg bg-white shadow-sm border border-gray-200 flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-blue-100 rounded-full text-blue-700">
                                <User className="h-4 w-4" />
                            </div>
                            <div>
                                <p className="text-[10px] font-bold text-gray-500 uppercase">Cliente</p>
                                <p className="font-bold text-gray-800 text-sm leading-none">{customer.full_name}</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold text-gray-500 uppercase">Atendente</p>
                            <p className="font-bold text-gray-800 text-xs">{authedEmployeeName}</p>
                        </div>
                    </div>

                    {/* NAV BAR */}
                    <div className="bg-white p-1 rounded-lg shadow-sm border border-gray-200 flex justify-between items-center gap-2 mb-2">
                        <div className="flex items-center gap-2 ml-2 min-w-fit">
                            <Eye className="h-4 w-4 text-blue-600" />
                            <h2 className="text-sm font-bold text-gray-800 hidden sm:block">
                                {currentOrder ? `Ficha #${currentOrder.id}` : 'Nova Ficha'}
                            </h2>
                            <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold border border-gray-300 whitespace-nowrap">
                                {currentIndex === -1 ? 'NOVA' : `${currentIndex + 1}/${existingOrders.length}`}
                            </span>
                        </div>

                        <div className="flex-1 flex justify-center">
                            <div className="flex items-center gap-2 bg-gray-50 px-2 py-0.5 rounded border border-gray-200 w-full max-w-[200px]">
                                <label htmlFor="protocolo_input" className="text-[9px] font-bold text-gray-500 uppercase whitespace-nowrap">
                                    Protocolo
                                </label>
                                <input
                                    id="protocolo_input"
                                    name="protocolo_fisico"
                                    type="text"
                                    value={protocolo}
                                    onChange={(e) => setProtocolo(e.target.value)}
                                    className="bg-transparent border-none text-gray-900 text-xs focus:ring-0 block w-full h-6 px-1 font-bold text-center uppercase p-0"
                                    placeholder="Auto"
                                />
                            </div>
                        </div>

                        <div className="flex gap-1 min-w-fit">
                            <button type="button" onClick={() => handleNavigate('prev')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ChevronLeft className="h-4 w-4" /></button>
                            <button type="button" onClick={() => handleNavigate('next')} className="p-1.5 hover:bg-gray-100 rounded text-gray-600"><ChevronRight className="h-4 w-4" /></button>
                            <button type="button" onClick={() => handleNavigate('new')} className="bg-green-600 text-white text-[10px] font-bold px-3 py-1 rounded hover:bg-green-700 ml-1 shadow-sm">NOVA</button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-2">

                        {/* COLUNA 1: Dados Gerais e Medidas (4 colunas) */}
                        <div className="lg:col-span-4 space-y-2 flex flex-col">

                            {/* CARD AZUL (DADOS) */}
                            <div className={cardBlue}>
                                <h3 className="text-white font-bold text-xs mb-2 flex items-center gap-2 border-b border-white/20 pb-1">
                                    <User className="h-3 w-3" /> DADOS E VÍNCULOS
                                </h3>
                                <div className="space-y-2 flex-1">
                                    <div>
                                        <label className={labelStyle}>Paciente</label>
                                        <div className="flex gap-1">
                                            <select name="dependente_id" value={dependenteId} onChange={e => setDependenteId(e.target.value)} className={inputStyle}>
                                                <option value="">{customer.full_name} (Titular)</option>
                                                {localDependentes.map(dep => (
                                                    <option key={dep.id} value={dep.id}>
                                                        {dep.full_name} ({dep.parentesco || 'Dep.'})
                                                    </option>
                                                ))}
                                            </select>
                                            <button type="button" onClick={() => setIsDepModalOpen(true)} className="bg-white/20 hover:bg-white/30 text-white p-1 rounded shadow-sm border border-white/20 h-7 w-7 flex items-center justify-center" title="Novo Dependente">
                                                <Plus className="h-4 w-4" />
                                            </button>
                                        </div>
                                    </div>

                                    <div>
                                        <label className={labelStyle}>Médico</label>
                                        <select name="oftalmologista_id" value={oftalmologistaId} onChange={e => setOftalmologistaId(e.target.value)} className={inputStyle}>
                                            <option value="">Selecione...</option>
                                            {oftalmosList.map(oft => <option key={oft.id} value={oft.id}>{oft.nome_completo}</option>)}
                                        </select>
                                    </div>

                                    <div className="pt-2 border-t border-white/20 mt-1 space-y-2">
                                        <div>
                                            <label className={labelStyle}>Lente OD</label>
                                            <select value={lenteOdItemId} onChange={e => setLenteOdItemId(e.target.value)} className={inputStyle}>
                                                <option value="">-- Selecione --</option>
                                                {itensLente.map(i => <option key={i.id} value={i.id}>{i.descricao}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Lente OE</label>
                                            <select value={lenteOeItemId} onChange={e => setLenteOeItemId(e.target.value)} className={inputStyle}>
                                                <option value="">-- Selecione --</option>
                                                {itensLente.map(i => <option key={i.id} value={i.id}>{i.descricao}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelStyle}>Armação</label>
                                            <select value={armacaoItemId} onChange={e => setArmacaoItemId(e.target.value)} className={inputStyle}>
                                                <option value="">-- Selecione --</option>
                                                {itensArmacao.map(i => <option key={i.id} value={i.id}>{i.descricao}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* CARD SLATE (MEDIDAS) */}
                            <div className={cardSlate}>
                                <h3 className="text-white font-bold text-xs mb-2 flex items-center gap-2 border-b border-white/20 pb-1">
                                    <Ruler className="h-3 w-3" /> MEDIDAS TÉCNICAS
                                </h3>
                                <div className="grid grid-cols-3 gap-1 mb-2 items-end">
                                    <div className="col-span-1"></div>
                                    <div className="text-center text-[10px] font-bold text-white/70">OD</div>
                                    <div className="text-center text-[10px] font-bold text-white/70">OE</div>

                                    <label className="text-right text-[10px] font-bold text-white/90 pr-1 self-center">DNP</label>
                                    <input name="medida_dnp_od" value={dnpOd} onChange={e => setDnpOd(e.target.value)} className={gridInput} />
                                    <input name="medida_dnp_oe" value={dnpOe} onChange={e => setDnpOe(e.target.value)} className={gridInput} />

                                    <label className="text-right text-[10px] font-bold text-white/90 pr-1 self-center">Altura</label>
                                    <input name="medida_altura_od" value={altOd} onChange={e => setAltOd(e.target.value)} className={gridInput} />
                                    <input name="medida_altura_oe" value={altOe} onChange={e => setAltOe(e.target.value)} className={gridInput} />
                                </div>

                                <div className="grid grid-cols-2 gap-2 border-t border-white/20 pt-2">
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
                                            className="h-7 px-2 bg-green-500 hover:bg-green-600 text-white rounded shadow-md flex items-center gap-1 transition-all hover:scale-105"
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

                            {/* CARD VIOLETA (RECEITA) */}
                            <div className={cardViolet}>
                                <div className="flex justify-between border-b border-white/20 pb-1 mb-2 items-center">
                                    <h3 className="font-bold text-white flex items-center gap-2 text-xs">
                                        <Glasses className="h-3 w-3" /> RECEITA
                                    </h3>
                                    <div className="flex gap-1">
                                        <button
                                            type="button"
                                            onClick={() => setIsHistoryModalOpen(true)}
                                            className="text-[10px] font-bold text-indigo-900 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded shadow-sm flex items-center gap-1 transition-colors uppercase tracking-wide"
                                        >
                                            <History className="h-3 w-3" /> Histórico
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setLongeOdEsf('+0,00'); setLongeOdCil('+0,00'); setLongeOdEixo('0'); setLongeOeEsf('+0,00'); setLongeOeCil('+0,00'); setLongeOeCil('+0,00'); setLongeOeEixo('0'); }}
                                            className="text-[10px] font-bold text-white border border-white/40 hover:bg-white/10 px-2 py-0.5 rounded transition-colors uppercase tracking-wide"
                                        >
                                            <FileDown className="h-3 w-3 inline mr-1" /> Zerar
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[10px] font-bold text-white/60 uppercase tracking-wider">
                                    <div className="col-span-1"></div><div className="col-span-2">Esférico</div><div className="col-span-2">Cilíndrico</div><div className="col-span-2">Eixo</div>
                                </div>

                                <StockBadge matches={odMatches} label="OD" onOpen={() => setStockModalOpen('OD')} />

                                {/* OD */}
                                <div className="grid grid-cols-7 gap-1 mb-2 items-center p-2 bg-white/10 rounded-lg border border-white/10">
                                    <div className="col-span-1 font-black text-right pr-2 text-xl text-white">OD</div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_od_esferico" value={longeOdEsf} onChange={setLongeOdEsf} className={gridInput} /></div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_od_cilindrico" value={longeOdCil} onChange={setLongeOdCil} className={gridInput} /></div>
                                    <div className="col-span-2"><input name="receita_longe_od_eixo" value={longeOdEixo} onChange={e => setLongeOdEixo(e.target.value)} className={gridInput} placeholder="0º" /></div>
                                </div>

                                <StockBadge matches={oeMatches} label="OE" onOpen={() => setStockModalOpen('OE')} />

                                {/* OE */}
                                <div className="grid grid-cols-7 gap-1 mb-2 items-center p-2 bg-white/10 rounded-lg border border-white/10">
                                    <div className="col-span-1 font-black text-right pr-2 text-xl text-white">OE</div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_oe_esferico" value={longeOeEsf} onChange={setLongeOeEsf} className={gridInput} /></div>
                                    <div className="col-span-2"><DegreeInput name="receita_longe_oe_cilindrico" value={longeOeCil} onChange={setLongeOeCil} className={gridInput} /></div>
                                    <div className="col-span-2"><input name="receita_longe_oe_eixo" value={longeOeEixo} onChange={e => setLongeOeEixo(e.target.value)} className={gridInput} placeholder="0º" /></div>
                                </div>

                                <div className="flex justify-center mt-1">
                                    <div className="w-32 bg-white/10 border border-white/20 p-2 rounded-lg text-center">
                                        <label className="text-[10px] font-bold text-white uppercase block mb-1">Adição</label>
                                        <DegreeInput name="receita_adicao" value={adicao} onChange={setAdicao} className={`${gridInput} h-9 text-xl`} />
                                    </div>
                                </div>
                            </div>

                            {/* CARD TEAL (PRAZOS E OBS) */}
                            <div className={cardTeal}>
                                <h3 className="text-white font-bold text-xs mb-2 flex items-center gap-2 border-b border-white/20 pb-1">
                                    <CalendarClock className="h-3 w-3" /> PRAZOS E OBS
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

                            {/* CARD AMBER (LAB) */}
                            <div className={cardAmber}>
                                <h3 className="text-white font-bold text-xs mb-2 flex items-center gap-2 border-b border-white/20 pb-1">
                                    <Truck className="h-3 w-3" /> LABORATÓRIO
                                </h3>
                                <div className="grid grid-cols-3 gap-2">
                                    <div><label className={labelStyle}>Pedido Em</label><input type="datetime-local" name="dt_pedido_em" value={dtPedido} onChange={e => setDtPedido(e.target.value)} className={inputStyle} /></div>
                                    <div><label className={labelStyle}>Pedido Por</label>
                                        <select name="lab_pedido_por_id" value={pedidoPorId} onChange={e => setPedidoPorId(e.target.value)} className={inputStyle}>
                                            <option value="">Selecione...</option>
                                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
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

{/* FOOTER FIXO (Barra Branca) */}
                <div className="shrink-0 bg-white border-t border-gray-300 px-4 py-3 flex justify-end gap-2 z-20 shadow-[0_-5px_15px_rgba(0,0,0,0.05)]">
                    <button type="button" onClick={() => router.back()} className={`${baseButtonStyle} bg-gray-500 text-white hover:bg-gray-600`}>VOLTAR</button>
                    
                    {/* Botão de Impressão */}
                    <PrintProtocoloButton osId={currentOrder?.id} disabled={!currentOrder} />

                    {currentOrder && (
                        <button type="button" onClick={handleDelete} disabled={isDeleting} className={`${baseButtonStyle} bg-red-100 text-red-700 hover:bg-red-200 border border-red-200`}>
                            {isDeleting ? <Loader2 className="animate-spin h-3 w-3" /> : <Trash2 className="h-3 w-3" />} EXCLUIR
                        </button>
                    )}
                    <button type="submit" disabled={isSaving} className={`${baseButtonStyle} bg-blue-600 text-white hover:bg-blue-700 px-6 text-sm shadow-md`}>
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
            <AddDependenteModal
                isOpen={isDepModalOpen}
                onClose={() => setIsDepModalOpen(false)}
                onSuccess={handleDependenteAdded}
                storeId={storeId}
                customerId={customer.id}
            />

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

function ServiceOrderPageWrapper({ storeId, vendaId, authedEmployeeName }: { storeId: number, vendaId: number, authedEmployeeName: string }) {
    const [data, setData] = useState<OSPageData | null>(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const load = async () => {
            const { getVendaPageData, getOSPageData } = await import('@/lib/actions/vendas.actions')
            const vendaData = await getVendaPageData(vendaId, storeId)
            if (vendaData.success && vendaData.data?.venda) {
                const customerId = vendaData.data.venda.customer_id
                const osData = await getOSPageData(vendaId, storeId, customerId)
                if (osData.success && osData.data) {
                    setData({ ...osData.data, venda: vendaData.data.venda })
                }
            }
            setLoading(false)
        }
        load()
    }, [vendaId, storeId])

    const initialState: SaveSOResult = { success: false, message: '', timestamp: 0 }
    const [saveState, dispatch] = useFormState(saveServiceOrder, initialState)

    if (loading) return <div className="flex h-screen items-center justify-center bg-gray-100"><Loader2 className="animate-spin h-10 w-10 text-gray-400" /></div>
    if (!data) return <div className="p-10 text-center">Erro ao carregar. Verifique a venda.</div>

    return (
        <div className="flex-1 flex flex-col bg-gray-100 p-2 h-[calc(100vh-64px)] overflow-hidden">
            <ServiceOrderFormContent
                storeId={storeId} vendaId={vendaId}
                customer={data.customer}
                venda={data.venda}
                vendaItens={data.vendaItens}
                dependentes={data.dependentes} oftalmosList={data.oftalmologistas} employees={data.employees}
                existingOrders={data.existingOrders} authedEmployeeName={authedEmployeeName}
                onListChange={(newList) => setData({ ...data, existingOrders: newList })}
                saveState={saveState}
                dispatch={dispatch}
            />
        </div>
    )
}

export default function ServiceOrderPage() {
    const params = useParams()
    const searchParams = useSearchParams()
    const storeId = parseInt(params.storeId as string, 10)
    const vendaId = parseInt(params.vendaId as string, 10)
    const employeeName = searchParams.get('employee_name') || 'Vendedor'
    return <ServiceOrderPageWrapper storeId={storeId} vendaId={vendaId} authedEmployeeName={employeeName} />
}