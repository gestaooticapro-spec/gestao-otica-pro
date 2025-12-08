// Caminho: src/components/pos-venda/PostSalesInterface.tsx
'use client'

import { useState, useEffect, useRef, useTransition } from 'react'
import { 
  PostSaleQueueItem, 
  Interaction, 
  saveInteraction, 
  concludePostSale,
  getInteractions 
} from '@/lib/actions/postsales.actions'
import { 
  User, Phone, MessageCircle, Star, CheckCircle, 
  Clock, Send, Eye, Wallet, ExternalLink, Loader2, DollarSign 
} from 'lucide-react'
import Link from 'next/link'
// ADICIONE ESTAS DUAS LINHAS:
import { getPostSaleDetails } from '@/lib/actions/postsales.actions'
import SaleDetailsModal from '@/components/modals/SaleDetailsModal'

// Helpers
const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

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
                        className={`h-8 w-8 drop-shadow-sm ${star <= value ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}`} 
                    />
                </button>
            ))}
        </div>
    )
}

export default function PostSalesInterface({ initialQueue, storeId }: { initialQueue: PostSaleQueueItem[], storeId: number }) {
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [interactions, setInteractions] = useState<Interaction[]>([])
    const [loadingHistory, setLoadingHistory] = useState(false)
    
    const [tipoContato, setTipoContato] = useState('WhatsApp')
    const [resumoMsg, setResumoMsg] = useState('')
    const [rating, setRating] = useState(0)
    const [obsFinal, setObsFinal] = useState('')

    const [detailsModalOpen, setDetailsModalOpen] = useState(false)
    const [detailsData, setDetailsData] = useState<any>(null)
    const [loadingDetails, setLoadingDetails] = useState(false)


    const [isPending, startTransition] = useTransition()
    const selectedItem = initialQueue.find(item => item.os_id === selectedId)

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

    const handleWhatsApp = () => {
        if (!selectedItem || !selectedItem.titular_tel) return alert("Telefone não cadastrado.")
        const num = selectedItem.titular_tel.replace(/\D/g, '')
        const nome = selectedItem.titular_nome.split(' ')[0]
        const msg = `Olá ${nome}, aqui é da Ótica. Como está a adaptação com os novos óculos?`
        window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    const handleSaveInteraction = (formData: FormData) => {
        if (!selectedItem) return
        startTransition(async () => {
            const res = await saveInteraction(formData)
            if (res.success) {
                setResumoMsg('')
                if (selectedItem.post_sales_id) {
                    const hist = await getInteractions(selectedItem.post_sales_id)
                    setInteractions(hist)
                }
            } else alert(res.message)
        })
    }

    const handleConclude = () => {
        if (!selectedItem?.post_sales_id) return alert("Salve uma interação primeiro.")
        if (rating === 0) return alert("Avaliação obrigatória.")
        
        const formData = new FormData()
        formData.append('post_sales_id', selectedItem.post_sales_id.toString())
        formData.append('store_id', storeId.toString())
        formData.append('nota', rating.toString())
        formData.append('obs', obsFinal)

        startTransition(async () => {
            await concludePostSale(formData)
            setSelectedId(null)
        })
    }

    return (
        <div className="flex h-full gap-8">
            
            {/* --- PAINEL ESQUERDO (LISTA FLUTUANTE) --- */}
            <div className="w-80 bg-white/80 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/50 flex flex-col overflow-hidden">
                <div className="p-4 border-b border-gray-100 bg-white/50">
                    <h3 className="font-black text-slate-700 text-xs tracking-wider uppercase opacity-70">Fila de Adaptação</h3>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                    {initialQueue.length === 0 ? (
                        <div className="p-8 text-center text-gray-400 flex flex-col items-center">
                            <CheckCircle className="h-12 w-12 mb-3 text-emerald-400 opacity-50" />
                            <p className="text-sm font-medium">Nenhuma pendência.</p>
                        </div>
                    ) : (
                        initialQueue.map(item => (
                            <div 
                                key={item.os_id}
                                onClick={() => setSelectedId(item.os_id)}
                                className={`p-4 rounded-xl cursor-pointer transition-all duration-200 border relative group
                                    ${selectedId === item.os_id 
                                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-200 border-transparent scale-[1.02]' 
                                        : 'bg-white hover:bg-slate-50 border-transparent hover:border-slate-200 shadow-sm'
                                    }`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`font-bold text-sm ${selectedId === item.os_id ? 'text-white' : 'text-slate-800'}`}>
                                        {item.dependente_nome}
                                    </span>
                                    {item.status === 'Em Acompanhamento' && (
                                        <span className="absolute top-4 right-4 h-2 w-2 rounded-full bg-amber-400 shadow-sm animate-pulse"></span>
                                    )}
                                </div>
                                <p className={`text-xs mt-1 flex items-center gap-1 ${selectedId === item.os_id ? 'text-blue-100' : 'text-slate-500'}`}>
                                    <Clock className="h-3 w-3" /> Há {item.dias_desde_entrega} dias
                                </p>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* --- PAINEL DIREITO (CARTÕES DE DETALHES) --- */}
            <div className="flex-1 flex flex-col overflow-hidden">
                {selectedItem ? (
                    <div className="flex-1 overflow-y-auto pr-2 pb-10 space-y-6 custom-scrollbar">
                        
                        {/* CARD 1: CABEÇALHO DO CLIENTE */}
                        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-6 flex justify-between items-start animate-in slide-in-from-bottom-4 duration-300">
                            <div>
                                <h2 className="text-3xl font-black text-slate-800">{selectedItem.dependente_nome}</h2>
                                <div className="mt-2 flex gap-6 text-sm text-slate-500">
                                    <div className="flex items-center gap-2">
                                        <User className="h-4 w-4" /> 
                                        <span>Titular: <strong className="text-slate-700">{selectedItem.titular_nome}</strong></span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Phone className="h-4 w-4" /> 
                                        <span>{selectedItem.titular_tel || 'Sem fone'}</span>
                                    </div>
                                </div>
                            </div>
                            <button 
                                onClick={handleWhatsApp}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white px-5 py-3 rounded-xl shadow-emerald-200 shadow-lg font-bold flex items-center gap-2 transition-all hover:-translate-y-1"
                            >
                                <MessageCircle className="h-5 w-5" />
                                Mensagem de Adaptação
                            </button>
                        </div>

                        {/* CARD 2: SITUAÇÃO FINANCEIRA (NOVO) */}
                        <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl shadow-xl p-5 text-white flex items-center justify-between animate-in slide-in-from-bottom-6 duration-500">
                            <div className="flex items-center gap-6">
                                <div className="p-3 bg-white/10 rounded-lg backdrop-blur-sm">
                                    <Wallet className="h-6 w-6 text-emerald-400" />
                                </div>
                                <div>
                                    <p className="text-slate-400 text-xs font-bold uppercase mb-1">Status Financeiro</p>
                                    <div className="flex gap-6 items-baseline">
                                        <div>
                                            <span className="text-slate-400 text-xs mr-1">Total Venda</span>
                                            <span className="font-bold text-lg">{formatCurrency(selectedItem.valor_final)}</span>
                                        </div>
                                        <div className="h-8 w-px bg-white/20"></div>
                                        <div>
                                            <span className="text-slate-400 text-xs mr-1">A Receber</span>
                                            <span className={`font-bold text-2xl ${selectedItem.valor_restante > 0.01 ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                {formatCurrency(selectedItem.valor_restante)}
                                            </span>
                                        </div>
                                        {selectedItem.tem_carne && (
                                            <span className="text-[10px] bg-white/20 px-2 py-1 rounded font-bold tracking-wide uppercase">Carnê Ativo</span>
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
                                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-sm font-bold text-white disabled:opacity-50"
                            >
                                {loadingDetails ? <Loader2 className="h-4 w-4 animate-spin"/> : <Eye className="h-4 w-4" />}
                                Ver Detalhes / Receita
                            </button>
                        </div>

                        {/* GRID DE DETALHES TÉCNICOS E AÇÕES */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            
                            {/* COLUNA 1: TÉCNICO E HISTÓRICO */}
                            <div className="space-y-6">
                                {/* Card Técnico */}
                                <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        <Eye className="h-5 w-5 text-blue-500" /> Dados da Lente
                                    </h3>
                                    <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                        <p className="text-sm text-blue-900 font-medium">{selectedItem.resumo_lente}</p>
                                        <p className="text-xs text-blue-600 mt-1 opacity-80">OS #{selectedItem.os_id}</p>
                                    </div>
                                </div>

                                {/* Timeline */}
                                <div className="bg-white rounded-2xl shadow-md border border-slate-100 p-5 min-h-[300px]">
                                    <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
                                        <Clock className="h-5 w-5 text-slate-400" /> Histórico
                                    </h3>
                                    <div className="space-y-4 pl-2">
                                        {loadingHistory ? <Loader2 className="animate-spin text-slate-300 mx-auto"/> : 
                                         interactions.length === 0 ? <p className="text-slate-300 italic text-sm">Sem interações.</p> :
                                         interactions.map(int => (
                                            <div key={int.id} className="relative pl-6 border-l-2 border-slate-100 pb-2">
                                                <div className="absolute -left-[5px] top-1 h-2.5 w-2.5 rounded-full bg-slate-300"></div>
                                                <div className="bg-slate-50 p-3 rounded-lg rounded-tl-none border border-slate-100">
                                                    <div className="flex justify-between text-xs text-slate-400 mb-1 font-bold uppercase tracking-wider">
                                                        <span>{int.tipo_contato}</span>
                                                        <span>{new Date(int.created_at).toLocaleDateString('pt-BR')}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-700">{int.resumo}</p>
                                                </div>
                                            </div>
                                         ))
                                        }
                                    </div>
                                </div>
                            </div>

                            {/* COLUNA 2: AÇÃO E FECHAMENTO */}
                            <div className="space-y-6">
                                {/* Novo Registro */}
                                <div className="bg-white rounded-2xl shadow-lg border border-blue-100 overflow-hidden">
                                    <div className="bg-blue-50/50 p-4 border-b border-blue-100">
                                        <h3 className="font-bold text-blue-900 text-sm uppercase">Registrar Contato</h3>
                                    </div>
                                    <div className="p-5">
                                        <form action={handleSaveInteraction} className="space-y-3">
                                            <input type="hidden" name="os_id" value={selectedItem.os_id} />
                                            <input type="hidden" name="store_id" value={storeId} />
                                            <input type="hidden" name="post_sales_id" value={selectedItem.post_sales_id || ''} />
                                            
                                            <div className="flex gap-3">
                                                <select name="tipo" value={tipoContato} onChange={e => setTipoContato(e.target.value)} className="w-1/3 rounded-lg border-slate-300 text-sm h-10 focus:ring-blue-500">
                                                    <option>WhatsApp</option>
                                                    <option>Ligação</option>
                                                    <option>Presencial</option>
                                                </select>
                                                <input name="resumo" value={resumoMsg} onChange={e => setResumoMsg(e.target.value)} placeholder="O que foi conversado?" className="flex-1 rounded-lg border-slate-300 text-sm h-10 focus:ring-blue-500" required />
                                            </div>
                                            <button disabled={isPending} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-lg shadow-md shadow-blue-100 transition-all flex justify-center items-center gap-2 text-sm">
                                                {isPending ? <Loader2 className="animate-spin h-4 w-4"/> : <Send className="h-4 w-4"/>} Salvar Registro
                                            </button>
                                        </form>
                                    </div>
                                </div>

                                {/* Conclusão */}
                                <div className="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                                    <div className="bg-slate-50 p-4 border-b border-slate-100">
                                        <h3 className="font-bold text-slate-700 text-sm uppercase">Encerrar Acompanhamento</h3>
                                    </div>
                                    <div className="p-6 flex flex-col items-center">
                                        <p className="text-sm text-slate-500 mb-4 font-medium">Como foi a adaptação do cliente?</p>
                                        <StarRating value={rating} onChange={setRating} />
                                        
                                        <textarea 
                                            value={obsFinal}
                                            onChange={e => setObsFinal(e.target.value)}
                                            placeholder="Considerações finais..."
                                            className="w-full mt-6 rounded-lg border-slate-200 bg-slate-50 text-sm p-3 h-20 resize-none focus:bg-white transition-colors focus:ring-slate-400 focus:border-slate-400"
                                        />

                                        <button 
                                            onClick={handleConclude}
                                            disabled={isPending || rating === 0}
                                            className="w-full mt-4 bg-green-600 hover:bg-green-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold py-3 rounded-xl shadow-lg shadow-green-100 transition-all flex justify-center items-center gap-2"
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
                    <div className="h-full flex flex-col items-center justify-center text-slate-300">
                        <User className="h-24 w-24 mb-6 opacity-20" />
                        <p className="text-2xl font-light text-slate-400">Selecione um cliente</p>
                    </div>
                )}
                
            </div>
            <SaleDetailsModal 
                isOpen={detailsModalOpen} 
                onClose={() => setDetailsModalOpen(false)} 
                data={detailsData} 
            />

    </div> // <--- Esse fechamento final fecha o container principal ("flex h-full gap-8")
    )
}
