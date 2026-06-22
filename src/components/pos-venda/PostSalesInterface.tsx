// Caminho: src/components/pos-venda/PostSalesInterface.tsx
'use client'

import { useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    PostSaleQueueItem,
    Interaction,
    saveInteraction,
    concludePostSale,
    getInteractions,
    updateCustomerPhoneByOs,
    getPostSaleDetails
} from '@/lib/actions/postsales.actions'
import {
    User, Phone, MessageCircle, Star, CheckCircle,
    Clock, Send, Eye, Wallet, Loader2, Edit3, Check, X, HeartHandshake, Search, BarChart3, ArrowLeft
} from 'lucide-react'
import SaleDetailsModal from '@/components/modals/SaleDetailsModal'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'
import { getWhatsAppLink } from '@/lib/utils'

// Helpers
const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const normalizeSearchText = (value: string | null | undefined) =>
    (value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()

function StarRating({ value, onChange }: { value: number, onChange: (v: number) => void }) {
    return (
        <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
                <button
                    key={star}
                    type="button"
                    onClick={() => onChange(star)}
                    className={`p-1 transition-all hover:scale-125 focus:outline-none`}
                >
                    <Star
                        className={`h-8 w-8 drop-shadow-sm ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-slate-600'}`}
                    />
                </button>
            ))}
        </div>
    )
}

export default function PostSalesInterface({ initialQueue, storeId }: { initialQueue: PostSaleQueueItem[], storeId: number }) {
    const router = useRouter()
    const { preference } = useBackgroundPreference()
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [searchName, setSearchName] = useState('')
    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)

    const [tipoContato, setTipoContato] = useState('WhatsApp')
    const [resumoMsg, setResumoMsg] = useState('')
    const [rating, setRating] = useState(0)
    const [obsFinal, setObsFinal] = useState('')

    // post_sales_id ativo para o item selecionado. Pode nascer de um
    // saveInteraction (quando o item ainda nao tinha post_sales). Evita o bug
    // stale em que "Concluir" exige um post_sales_id que so existe apos refresh.
    const [activePostSalesId, setActivePostSalesId] = useState<number | null>(null)

    const [detailsModalOpen, setDetailsModalOpen] = useState(false)
    const [detailsData, setDetailsData] = useState<any>(null)
    const [loadingDetails, setLoadingDetails] = useState(false)

    // Estados para edição de telefone inline
    const [isEditingPhone, setIsEditingPhone] = useState(false)
    const [newPhoneValue, setNewPhoneValue] = useState('')
    const [savingPhone, setSavingPhone] = useState(false)

    const [isPending, startTransition] = useTransition()
    const selectedItem = initialQueue.find(item => item.os_id === selectedId)
    // post_sales_id efetivo: preferencia do estado ativo (recem-criado),
    // fallback para o do item da fila. Resolve a janela stale entre salvar a
    // primeira interacao e o App Router reidratar o initialQueue.
    const effectivePostSalesId = activePostSalesId ?? selectedItem?.post_sales_id ?? null
    const normalizedQuery = normalizeSearchText(searchName.trim())
    const filteredQueue = initialQueue.filter((item) => {
        if (!normalizedQuery) return true
        return (
            normalizeSearchText(item.dependente_nome).includes(normalizedQuery) ||
            normalizeSearchText(item.titular_nome).includes(normalizedQuery)
        )
    })

    const resetClientFormState = () => {
        setTipoContato('WhatsApp')
        setResumoMsg('')
        setRating(0)
        setObsFinal('')
        setIsEditingPhone(false)
        setNewPhoneValue('')
        setActivePostSalesId(null)
    }

    useEffect(() => {
        if (selectedItem && selectedItem.post_sales_id) {
            setLoadingHistory(true)
            getInteractions(selectedItem.post_sales_id).then((data) => {
                setInteractions(data)
                setLoadingHistory(false)
            })
        } else {
            setInteractions([])
        }
    }, [selectedItem])

    const handleSelectItem = (osId: number) => {
        resetClientFormState()
        setSelectedId(osId)
    }

    const handleWhatsApp = () => {
        if (!selectedItem || !selectedItem.titular_tel) return alert("Telefone não cadastrado. Clique em 'Sem fone' ao lado do nome do titular para cadastrar.")
        const nomeTitular = selectedItem.titular_nome.split(' ')[0]
        const dias = selectedItem.dias_desde_entrega
        const ehProprio = selectedItem.dependente_nome === selectedItem.titular_nome || !selectedItem.dependente_nome || selectedItem.dependente_nome === 'Mesmo'

        const msg = ehProprio
            ? `Olá ${nomeTitular}, aqui é da Ótica. Já faz ${dias} dias que vc buscou seu óculos. Como está a adaptação?`
            : `Olá ${nomeTitular}, aqui é da Ótica. Já faz ${dias} dias que ${selectedItem.dependente_nome?.split(' ')[0]} retirou os óculos. Como está a adaptação, você sabe?`

        window.open(getWhatsAppLink(selectedItem.titular_tel, msg), '_blank')
    }

    const handleSaveInteraction = (formData: FormData) => {
        if (!selectedItem) return
        startTransition(async () => {
            const res = await saveInteraction(formData)
            if (res.success) {
                setResumoMsg('')
                // Se a action devolveu o post_sales_id (caso de criacao), guarda
                // no estado ativo para liberar o "Concluir" imediatamente, sem
                // depender do revalidate do App Router.
                const psId = res.post_sales_id
                if (psId) setActivePostSalesId(psId)
                const histId = psId ?? selectedItem.post_sales_id
                if (histId) {
                    const hist = await getInteractions(histId)
                    setInteractions(hist)
                }
                // Refresh para reidratar o initialQueue com o post_sales_id.
                router.refresh()
            } else alert(res.message)
        })
    }

    const handleConclude = () => {
        if (!effectivePostSalesId) return alert("Salve uma interação primeiro.")
        if (rating === 0) return alert("Avaliação obrigatória.")

        const formData = new FormData()
        formData.append('post_sales_id', effectivePostSalesId.toString())
        formData.append('store_id', storeId.toString())
        formData.append('nota', rating.toString())
        formData.append('obs', obsFinal)

        startTransition(async () => {
            const res = await concludePostSale(formData)
            if (!res.success) {
                alert(res.message || 'Erro ao concluir pos-venda.')
                return
            }
            resetClientFormState()
            setSelectedId(null)
            router.refresh()
        })
    }

    const handleSavePhone = async () => {
        if (!selectedItem || !newPhoneValue.trim()) return
        setSavingPhone(true)
        const result = await updateCustomerPhoneByOs(selectedItem.os_id, newPhoneValue.trim(), storeId)
        if (result.success) {
            setIsEditingPhone(false)
            setNewPhoneValue('')
            window.location.reload()
        } else {
            alert(result.message)
        }
        setSavingPhone(false)
    }

    return (
        <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">

            {/* Background Image + Overlay (controlado pelo toggle) */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 z-0 bg-[url('/pos.jpeg')] bg-cover bg-center opacity-70 blur-[1px]" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/20 via-slate-950/60 to-slate-950/95" />
            </div>

            {/* Header Glass */}
            <div className="relative z-10 bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center gap-3 flex-shrink-0 shadow-2xl h-14">
                <Link
                    href={`/dashboard/loja/${storeId}?menu=loja-vazia`}
                    className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                    title="Voltar para o Painel"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>
                <div className="p-2 bg-pink-500/20 text-pink-400 rounded-xl border border-pink-500/20 shadow-[0_0_15px_rgba(236,72,153,0.2)]">
                    <HeartHandshake className="h-5 w-5" />
                </div>
                <div>
                    <h1 className="text-lg font-black text-white tracking-tight uppercase">Pós-Vendas</h1>
                    <p className="text-[10px] text-pink-400 font-black uppercase tracking-[0.2em] opacity-80">
                        Acompanhamento de Adaptação
                    </p>
                </div>
                <div className="ml-auto flex items-center gap-3">
                    <button
                        onClick={() => router.push(`/dashboard/loja/${storeId}/reports/pos-venda`)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-pink-500/30 bg-white/5 hover:bg-white/10 text-pink-400 hover:text-pink-300 transition-colors text-xs font-bold uppercase tracking-wider backdrop-blur-md"
                        title="Análise Gerencial"
                    >
                        <BarChart3 className="h-4 w-4" />
                        <span className="hidden sm:inline">Análise Gerencial</span>
                    </button>
                    <div className="w-px h-6 bg-white/10" />
                    <BackgroundToggle />
                </div>
            </div>

            {/* Área de Trabalho */}
            <div className="relative z-10 flex-1 overflow-hidden p-4 lg:p-6">
                <div className="flex h-full gap-6">

                    {/* --- PAINEL ESQUERDO (LISTA) --- */}
                    <div className="w-72 bg-white/5 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/10 flex flex-col overflow-hidden">
                        <div className="p-4 border-b border-white/5">
                            <h3 className="font-black text-slate-400 text-[10px] tracking-[0.2em] uppercase">Fila de Adaptação</h3>
                        </div>
                        <div className="px-3 pt-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                <input
                                    type="text"
                                    value={searchName}
                                    onChange={(e) => setSearchName(e.target.value)}
                                    placeholder="Buscar nome..."
                                    className="w-full h-10 rounded-xl bg-slate-900/60 border border-white/10 pl-9 pr-10 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                                />
                                {searchName && (
                                    <button
                                        type="button"
                                        onClick={() => setSearchName('')}
                                        aria-label="Limpar filtro"
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-slate-500 hover:text-slate-200 hover:bg-white/10 transition-colors"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-1.5 custom-scrollbar">
                            {initialQueue.length === 0 ? (
                                <div className="p-8 text-center flex flex-col items-center">
                                    <CheckCircle className="h-12 w-12 mb-3 text-emerald-400 opacity-30" />
                                    <p className="text-sm font-medium text-slate-500">Nenhuma pendência.</p>
                                </div>
                            ) : filteredQueue.length === 0 ? (
                                <div className="p-8 text-center flex flex-col items-center">
                                    <Search className="h-10 w-10 mb-3 text-slate-500 opacity-60" />
                                    <p className="text-sm font-medium text-slate-400">Nenhum cliente encontrado.</p>
                                </div>
                            ) : (
                                filteredQueue.map(item => (
                                    <div
                                        key={item.os_id}
                                        onClick={() => handleSelectItem(item.os_id)}
                                        className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border relative group
                                    ${selectedId === item.os_id
                                                ? 'bg-indigo-500/20 text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.15)] border-indigo-500/30'
                                                : 'bg-white/5 hover:bg-white/10 border-transparent hover:border-white/10 text-slate-300'
                                            }`}
                                    >
                                        <div className="flex justify-between items-start mb-1">
                                            <span className={`font-bold text-sm ${selectedId === item.os_id ? 'text-white' : 'text-slate-200'}`}>
                                                {item.dependente_nome}
                                            </span>
                                            {item.status === 'Em Acompanhamento' && (
                                                <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)] animate-pulse"></span>
                                            )}
                                        </div>
                                        <p className={`text-xs mt-1 flex items-center gap-1 ${selectedId === item.os_id ? 'text-indigo-300' : 'text-slate-500'}`}>
                                            <Clock className="h-3 w-3" /> Há {item.dias_desde_entrega} dias
                                        </p>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* --- PAINEL DIREITO (DETALHES) --- */}
                    <div className="flex-1 flex flex-col overflow-hidden">
                        {selectedItem ? (
                            <div className="flex-1 overflow-y-auto pr-2 pb-10 space-y-5 custom-scrollbar">

                                {/* CARD 1: CABEÇALHO DO CLIENTE */}
                                <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 p-6 flex justify-between items-start animate-in slide-in-from-bottom-4 duration-300">
                                    <div>
                                        <h2 className="text-3xl font-black text-white tracking-tight">{selectedItem.dependente_nome}</h2>
                                        <div className="mt-2 flex gap-6 text-sm text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <User className="h-4 w-4" />
                                                <span>Titular: <strong className="text-slate-200">{selectedItem.titular_nome}</strong></span>
                                            </div>
                                            <div className="flex items-center gap-2 group">
                                                <Phone className="h-4 w-4" />
                                                {isEditingPhone ? (
                                                    <div className="flex items-center gap-2">
                                                        <input
                                                            type="tel"
                                                            value={newPhoneValue}
                                                            onChange={(e) => setNewPhoneValue(e.target.value)}
                                                            placeholder="(99) 99999-9999 ou +595..."
                                                            className="w-36 px-2 py-1 text-sm bg-slate-900/50 border border-white/10 rounded-lg text-white placeholder:text-slate-600 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50"
                                                            autoFocus
                                                        />
                                                        <button
                                                            onClick={handleSavePhone}
                                                            disabled={savingPhone}
                                                            className="p-1 bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg hover:bg-emerald-600/40 disabled:opacity-50"
                                                        >
                                                            {savingPhone ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                                        </button>
                                                        <button
                                                            onClick={() => { setIsEditingPhone(false); setNewPhoneValue('') }}
                                                            className="p-1 bg-white/5 text-slate-400 rounded-lg hover:bg-white/10"
                                                        >
                                                            <X className="h-4 w-4" />
                                                        </button>
                                                    </div>
                                                ) : selectedItem.titular_tel ? (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-slate-300">{selectedItem.titular_tel}</span>
                                                        <button
                                                            onClick={() => {
                                                                setNewPhoneValue(selectedItem.titular_tel || '')
                                                                setIsEditingPhone(true)
                                                            }}
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 hover:bg-white/10 rounded-lg text-slate-400"
                                                            title="Editar Telefone"
                                                        >
                                                            <Edit3 className="h-3 w-3" />
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <button
                                                        onClick={() => {
                                                            setNewPhoneValue('')
                                                            setIsEditingPhone(true)
                                                        }}
                                                        className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium"
                                                    >
                                                        <span>Sem fone</span>
                                                        <Edit3 className="h-3 w-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleWhatsApp}
                                        className="bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 px-5 py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.15)] font-bold flex items-center gap-2 transition-all hover:-translate-y-0.5"
                                    >
                                        <MessageCircle className="h-5 w-5" />
                                        Enviar Mensagem
                                    </button>
                                </div>

                                {/* CARD 2: REGISTRAR CONTATO (INLINE) */}
                                <div className="bg-cyan-500/10 backdrop-blur-md rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.08)] border border-cyan-400/30 p-4 animate-in slide-in-from-bottom-5 duration-400">
                                    <form action={handleSaveInteraction} className="flex items-center gap-3">
                                        <input type="hidden" name="os_id" value={selectedItem.os_id} />
                                        <input type="hidden" name="store_id" value={storeId} />
                                        <input type="hidden" name="post_sales_id" value={effectivePostSalesId || ''} />

                                        <select name="tipo" value={tipoContato} onChange={e => setTipoContato(e.target.value)} className="w-28 rounded-xl bg-slate-800/80 border border-cyan-400/20 text-sm h-10 text-cyan-200 font-bold focus:ring-1 focus:ring-cyan-500/50 focus:border-cyan-500/50 cursor-pointer appearance-none px-3">
                                            <option className="bg-slate-800 text-cyan-200">WhatsApp</option>
                                            <option className="bg-slate-800 text-cyan-200">Ligação</option>
                                            <option className="bg-slate-800 text-cyan-200">Presencial</option>
                                        </select>
                                        <input name="resumo" value={resumoMsg} onChange={e => setResumoMsg(e.target.value)} placeholder="O que foi conversado?" className="flex-1 rounded-xl bg-slate-900/50 border border-white/10 text-sm h-10 px-3 text-white placeholder:text-slate-600 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50" required />
                                        <button disabled={isPending} className="bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 border border-indigo-500/30 font-bold px-4 py-2 h-10 rounded-xl transition-all flex items-center gap-2 text-sm whitespace-nowrap">
                                            {isPending ? <Loader2 className="animate-spin h-4 w-4" /> : <Send className="h-4 w-4" />} Salvar Contato
                                        </button>
                                    </form>
                                </div>

                                {/* CARD 3: SITUAÇÃO FINANCEIRA */}
                                <div className="bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 p-5 text-white flex items-center justify-between animate-in slide-in-from-bottom-6 duration-500">
                                    <div className="flex items-center gap-6">
                                        <div className="p-3 bg-emerald-500/10 rounded-xl border border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.15)]">
                                            <Wallet className="h-6 w-6 text-emerald-400" />
                                        </div>
                                        <div>
                                            <p className="text-slate-500 text-[10px] font-black uppercase mb-1 tracking-widest">Status Financeiro</p>
                                            <div className="flex gap-6 items-baseline">
                                                <div>
                                                    <span className="text-slate-500 text-xs mr-1">Total Venda</span>
                                                    <span className="font-bold text-lg text-slate-200">{formatCurrency(selectedItem.valor_final)}</span>
                                                </div>
                                                <div className="h-8 w-px bg-white/10"></div>
                                                {selectedItem.valor_restante > 0.01 ? (
                                                    <div>
                                                        <span className="text-slate-500 text-xs mr-1">A Receber</span>
                                                        <span className="font-bold text-2xl text-amber-400">
                                                            {formatCurrency(selectedItem.valor_restante)}
                                                        </span>
                                                    </div>
                                                ) : selectedItem.status_venda === 'Fechada' ? (
                                                    <span className="text-emerald-400 font-bold text-lg">✓ Venda Fechada</span>
                                                ) : selectedItem.status_venda === 'Devolvida' ? (
                                                    <span className="text-purple-400 font-bold text-lg">↩ Devolvida</span>
                                                ) : selectedItem.status_venda === 'Cancelada' ? (
                                                    <span className="text-red-400 font-bold text-lg">✕ Cancelada</span>
                                                ) : (
                                                    <span className="text-amber-400 font-medium text-sm">⚠ Lembre-se de fechar essa venda</span>
                                                )}
                                                {selectedItem.tem_carne && (
                                                    <span className="text-[10px] bg-white/10 border border-white/10 px-2 py-1 rounded-lg font-bold tracking-wide uppercase text-slate-300">Carnê Ativo</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={async () => {
                                            setLoadingDetails(true)
                                            const res = await getPostSaleDetails(selectedItem.os_id)
                                            if (res.success) {
                                                setDetailsData(res.data)
                                                setDetailsModalOpen(true)
                                            } else {
                                                alert("Erro ao carregar detalhes: " + res.message)
                                            }
                                            setLoadingDetails(false)
                                        }}
                                        disabled={loadingDetails}
                                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors text-sm font-bold text-slate-300 disabled:opacity-50"
                                    >
                                        {loadingDetails ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                                        Ver Detalhes / Receita
                                    </button>
                                </div>

                                {/* GRID DE DETALHES TÉCNICOS E AÇÕES */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

                                    {/* COLUNA 1: HISTÓRICO */}
                                    <div className="space-y-5">
                                        {/* Timeline / Histórico */}
                                        <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 p-5 min-h-[200px]">
                                            <h3 className="font-bold text-slate-300 mb-4 flex items-center gap-2">
                                                <Clock className="h-5 w-5 text-slate-500" /> Histórico de Contatos
                                            </h3>
                                            <div className="space-y-4 pl-2">
                                                {loadingHistory ? <Loader2 className="animate-spin text-slate-600 mx-auto" /> :
                                                    interactions.length === 0 ? <p className="text-slate-600 italic text-sm">Nenhum contato registrado.</p> :
                                                        interactions.map(int => (
                                                            <div key={int.id} className="relative pl-6 border-l-2 border-white/5 pb-2">
                                                                <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-indigo-400 shadow-[0_0_6px_rgba(99,102,241,0.5)]"></div>
                                                                <div className="bg-white/5 p-3 rounded-xl rounded-tl-none border border-white/5">
                                                                    <div className="flex justify-between text-xs text-slate-500 mb-1 font-bold uppercase tracking-wider">
                                                                        <span>{int.tipo_contato}</span>
                                                                        <span>{new Date(int.created_at).toLocaleDateString('pt-BR')}</span>
                                                                    </div>
                                                                    <p className="text-sm text-slate-300">{int.resumo}</p>
                                                                </div>
                                                            </div>
                                                        ))
                                                }
                                            </div>
                                        </div>
                                    </div>

                                    {/* COLUNA 2: FECHAMENTO */}
                                    <div className="space-y-5">
                                        {/* Conclusão */}
                                        <div className="bg-white/5 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 overflow-hidden">
                                            <div className="bg-white/5 p-4 border-b border-white/5">
                                                <h3 className="font-bold text-slate-300 text-sm uppercase tracking-widest">Encerrar Acompanhamento</h3>
                                            </div>
                                            <div className="p-6 flex flex-col items-center">
                                                <p className="text-sm text-slate-500 mb-4 font-medium">Como foi a adaptação do cliente?</p>
                                                <StarRating value={rating} onChange={setRating} />

                                                <textarea
                                                    value={obsFinal}
                                                    onChange={e => setObsFinal(e.target.value)}
                                                    placeholder="Considerações finais..."
                                                    className="w-full mt-6 rounded-xl bg-slate-900/50 border border-white/10 text-sm p-3 h-20 resize-none text-white placeholder:text-slate-600 focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 transition-colors"
                                                />

                                                <button
                                                    onClick={handleConclude}
                                                    disabled={isPending || rating === 0}
                                                    className="w-full mt-4 bg-emerald-600/20 hover:bg-emerald-600/30 disabled:bg-white/5 disabled:text-slate-600 disabled:border-white/5 text-emerald-400 border border-emerald-500/30 font-bold py-3 rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all flex justify-center items-center gap-2"
                                                >
                                                    <CheckCircle className="h-5 w-5" />
                                                    CONCLUIR E ARQUIVAR
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center">
                                <div className="relative mb-8 group">
                                    <div className="absolute inset-0 bg-pink-500/10 rounded-full blur-3xl group-hover:bg-pink-500/20 transition-all duration-1000" />
                                    <div className="relative w-28 h-28 bg-white/5 backdrop-blur-2xl rounded-[2rem] flex items-center justify-center border border-white/10 shadow-2xl group-hover:rotate-6 transition-all duration-700">
                                        <User className="h-12 w-12 text-pink-400 opacity-40 group-hover:scale-110 transition-transform duration-500" />
                                    </div>
                                </div>
                                <p className="text-2xl font-black text-white tracking-widest uppercase">Selecione um cliente</p>
                                <p className="text-slate-500 mt-2 text-sm font-medium">Escolha na lista à esquerda para ver os detalhes</p>
                            </div>
                        )}

                    </div>
                    <SaleDetailsModal
                        isOpen={detailsModalOpen}
                        onClose={() => setDetailsModalOpen(false)}
                        data={detailsData}
                    />

                </div>
            </div>
        </div>
    )
}
