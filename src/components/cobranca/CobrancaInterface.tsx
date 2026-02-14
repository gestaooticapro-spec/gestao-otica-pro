'use client'

import { useState, useTransition, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import {
    Search, AlertCircle, Calendar,
    Phone, MessageSquare, Clock, CheckCircle2,
    FileText, Wallet, Ban, ExternalLink, Trash2
} from 'lucide-react'
import {
    DevedorResumo, registrarCobranca,
    toggleSpcStatus, getHistoricoCobranca, CobrancaHistoricoItem,
    getDetalhesDivida, updateCobrancaStatus
} from '@/lib/actions/collection.actions'
import { toast } from 'sonner'

// --- COMPONENTES UI SIMPLES ---
const Badge = ({ children, className }: { children: React.ReactNode, className?: string }) => (
    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${className}`}>
        {children}
    </span>
)

export default function CobrancaInterface({
    initialData,
    storeId,
    defaultTab = 'cobrar'
}: {
    initialData: DevedorResumo[],
    storeId: number,
    defaultTab?: 'cobrar' | 'ja_cobrados'
}) {
    const router = useRouter()

    // ESTADOS DE FILTRO E SELEÇÃO
    const [activeTab, setActiveTab] = useState<'cobrar' | 'ja_cobrados'>(defaultTab)
    const [spcFilter, setSpcFilter] = useState<'com_spc' | 'sem_spc'>('sem_spc')
    const [searchTerm, setSearchTerm] = useState('')
    const [selectedCustomer, setSelectedCustomer] = useState<DevedorResumo | null>(null)

    // Sincroniza a aba ativa com a prop (URL) para navegação via browser
    useEffect(() => {
        setActiveTab(defaultTab)
    }, [defaultTab])

    // DADOS CARREGADOS SOB DEMANDA
    const [historico, setHistorico] = useState<CobrancaHistoricoItem[]>([])
    const [detalhesDivida, setDetalhesDivida] = useState<any[]>([])
    const [loadingDetails, setLoadingDetails] = useState(false)

    // ESTADO DO FORMULÁRIO DE CONTATO
    const [tipoContato, setTipoContato] = useState('Whatsapp')
    const [resumo, setResumo] = useState('')
    const [proximaAcao, setProximaAcao] = useState('')
    const [isPending, startTransition] = useTransition()

    // --- LÓGICA DE FILTRAGEM (CLIENT SIDE PARA SPC E BUSCA) ---
    // A lista 'initialData' já vem filtrada do servidor pelo critério da ABA (Cobrar vs Já Cobrados)
    // Então aqui filtramos apenas por busca textual e SPC
    const filteredCustomers = initialData.filter(c => {
        const matchesSearch = c.full_name.toLowerCase().includes(searchTerm.toLowerCase())

        if (!matchesSearch) return false

        if (spcFilter === 'com_spc') return c.is_spc
        if (spcFilter === 'sem_spc') return !c.is_spc

        return true
    })

    // --- AÇÕES ---
    async function handleSelectCustomer(customer: DevedorResumo) {
        setSelectedCustomer(customer)
        setLoadingDetails(true)
        setHistorico([])
        setDetalhesDivida([])

        try {
            const [hist, dividas] = await Promise.all([
                getHistoricoCobranca(customer.customer_id),
                getDetalhesDivida(customer.customer_id, storeId)
            ])
            setHistorico(hist)
            setDetalhesDivida(dividas)
        } catch {
            toast.error("Erro ao carregar detalhes")
        } finally {
            setLoadingDetails(false)
        }
    }

    const handleRegistrarContato = async () => {
        if (!selectedCustomer) return
        if (!resumo.trim()) return toast.error("Digite um resumo da conversa")

        const formData = new FormData()
        formData.append('customer_id', String(selectedCustomer.customer_id))
        formData.append('tipo_contato', tipoContato)
        formData.append('resumo', resumo)
        if (proximaAcao) formData.append('proxima_acao', proximaAcao)

        startTransition(async () => {
            const res = await registrarCobranca(null, formData)
            if (res.success) {
                toast.success("Contato registrado!")
                setResumo('')
                setProximaAcao('')
                // Recarrega histórico
                const hist = await getHistoricoCobranca(selectedCustomer.customer_id)
                setHistorico(hist)
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleToggleSpc = async () => {
        if (!selectedCustomer) return
        const novoStatus = !selectedCustomer.is_spc

        if (!confirm(`Deseja realmente ${novoStatus ? 'INCLUIR' : 'REMOVER'} este cliente do SPC?`)) return

        startTransition(async () => {
            const res = await toggleSpcStatus(selectedCustomer.customer_id, selectedCustomer.is_spc, storeId)
            if (res.success) {
                toast.success(res.message)
                setSelectedCustomer(prev => prev ? { ...prev, is_spc: novoStatus } : null)
            } else {
                toast.error(res.message)
            }
        })
    }

    const handleChangeStatus = async (status: 'Normal' | 'Perdido' | 'Externa') => {
        if (!selectedCustomer) return
        if (!confirm(`Deseja alterar o status desse cliente para ${status}? Ele sairá desta lista.`)) return

        startTransition(async () => {
            const res = await updateCobrancaStatus(selectedCustomer.customer_id, status, storeId)
            if (res.success) {
                toast.success(res.message)
                setSelectedCustomer(null) // Fecha o painel pois ele sumirá da lista
            } else {
                toast.error(res.message)
            }
        })
    }

    const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    const totalAtrasadoLista = filteredCustomers.reduce((acc, curr) => acc + curr.total_atrasado, 0)

    const handleTabChange = (tab: 'cobrar' | 'ja_cobrados') => {
        setActiveTab(tab)
        setSelectedCustomer(null)
        // Usa router.replace para evitar reload total da página (piscada)
        router.replace(`?filtro=${tab}`, { scroll: false })
    }

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] gap-6">

            {/* HEADER DA PÁGINA */}
            <div className="grid grid-cols-12 gap-6 h-full">

                {/* COLUNA ESQUERDA: LISTA DE CLIENTES */}
                <div className="col-span-12 lg:col-span-4 flex flex-col gap-4 h-full">

                    {/* ABAS SUPERIORES */}
                    <div className="bg-slate-900/50 p-1 rounded-xl flex gap-1 border border-white/5 backdrop-blur-md">
                        <button
                            onClick={() => handleTabChange('cobrar')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'cobrar'
                                ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <AlertCircle className="w-4 h-4" /> Cobrar
                            </span>
                        </button>
                        <button
                            onClick={() => handleTabChange('ja_cobrados')}
                            className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'ja_cobrados'
                                ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/20'
                                : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <span className="flex items-center justify-center gap-2">
                                <Clock className="w-4 h-4" /> Já Cobrados
                            </span>
                        </button>
                    </div>

                    {/* FILTROS E BUSCA */}
                    <div className="bg-slate-900/60 p-4 rounded-2xl border border-white/5 backdrop-blur-md space-y-3 shadow-xl">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input
                                type="text"
                                placeholder="Buscar cliente..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full bg-black/20 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 transition-all"
                            />
                        </div>

                        {/* TOGGLE SPC FILTER */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSpcFilter('com_spc')}
                                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${spcFilter === 'com_spc' ? 'bg-red-500/20 border-red-500/30 text-red-400' : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'}`}
                            >
                                Com SPC
                            </button>
                            <button
                                onClick={() => setSpcFilter('sem_spc')}
                                className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${spcFilter === 'sem_spc' ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' : 'bg-transparent border-slate-800 text-slate-500 hover:border-slate-700'}`}
                            >
                                Sem SPC
                            </button>
                        </div>

                        <div className="flex justify-between items-center pt-2 border-t border-white/5">
                            <span className="text-xs text-slate-500 font-medium">Total na Lista</span>
                            <span className="text-sm font-black text-white">{formatMoney(totalAtrasadoLista)}</span>
                        </div>
                    </div>

                    {/* LISTA DE CLIENTES SCROLLAVEL */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-2">
                        {filteredCustomers.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-500 opacity-50">
                                <CheckCircle2 className="w-12 h-12 mb-2" />
                                <p className="text-sm">Nenhum cliente encontrado</p>
                            </div>
                        ) : (
                            filteredCustomers.map(cliente => (
                                <div
                                    key={cliente.customer_id}
                                    onClick={() => handleSelectCustomer(cliente)}
                                    className={`
                                        p-4 rounded-xl border cursor-pointer transition-all group relative overflow-hidden
                                        ${selectedCustomer?.customer_id === cliente.customer_id
                                            ? 'bg-orange-500/10 border-orange-500/50 shadow-lg shadow-orange-900/20'
                                            : 'bg-slate-900/40 border-white/5 hover:bg-slate-800/60 hover:border-white/10'}
                                    `}
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <h3 className={`text-sm font-bold truncate pr-2 ${selectedCustomer?.customer_id === cliente.customer_id ? 'text-orange-200' : 'text-slate-200'}`}>
                                            {cliente.full_name}
                                        </h3>
                                        <div className="flex gap-1 shrink-0">
                                            {cliente.is_spc && (
                                                <Badge className="bg-red-500/20 text-red-400 border border-red-500/20 shadow-sm">SPC</Badge>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex justify-between items-end mt-2">
                                        <div className="space-y-0.5">
                                            <p className="text-[10px] text-slate-400 font-medium flex items-center gap-1">
                                                <Clock className="w-3 h-3" /> {cliente.dias_atraso} dias de atraso
                                            </p>
                                            <p className="text-[10px] text-slate-500 font-mono">
                                                {cliente.quantidade_parcelas_atrasadas} parcela(s)
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className={`font-mono font-black text-sm ${selectedCustomer?.customer_id === cliente.customer_id ? 'text-white' : 'text-slate-300'}`}>
                                                {formatMoney(cliente.total_atrasado)}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Indicador de Seleção */}
                                    {selectedCustomer?.customer_id === cliente.customer_id && (
                                        <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500"></div>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* COLUNA DIREITA: DETALHES E AÇÃO */}
                <div className="col-span-12 lg:col-span-8 h-full overflow-hidden flex flex-col">
                    {selectedCustomer ? (
                        <div className="h-full flex flex-col gap-6 overflow-y-auto custom-scrollbar pr-2 pb-10">

                            {/* CARTÃO DE INFO DO CLIENTE */}
                            <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-6 rounded-3xl border border-white/5 shadow-2xl relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-[80px] -mr-16 -mt-16 pointer-events-none"></div>

                                <div className="flex justify-between items-start relative z-10">
                                    <div>
                                        <div className="flex items-center gap-3 mb-1">
                                            <h2 className="text-2xl font-black text-white tracking-tight">{selectedCustomer.full_name}</h2>
                                            {selectedCustomer.is_spc && (
                                                <span className="px-2 py-1 bg-red-500 text-white text-[10px] font-black uppercase rounded tracking-wider shadow-lg shadow-red-900/50 animate-pulse">
                                                    Negativado SPC
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-slate-400 text-sm font-medium flex items-center gap-2">
                                            <Phone className="w-4 h-4 text-emerald-500" />
                                            {selectedCustomer.fone_movel || 'Sem telefone móvel'}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Dívida Total</p>
                                        <p className="text-3xl font-black text-white drop-shadow-lg">{formatMoney(selectedCustomer.total_atrasado)}</p>
                                    </div>
                                </div>

                                {/* AÇÕES RÁPIDAS */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 relative z-10">
                                    <button
                                        onClick={() => {
                                            if (selectedCustomer.fone_movel) {
                                                const num = selectedCustomer.fone_movel.replace(/\D/g, '')
                                                const msg = `Olá ${selectedCustomer.full_name.split(' ')[0]}, estamos entrando em contato referente à sua pendência na Ótica.`
                                                window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
                                            } else {
                                                toast.error("Sem telefone cadastrado")
                                            }
                                        }}
                                        className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95"
                                    >
                                        <MessageSquare className="w-4 h-4" /> Whatsapp
                                    </button>

                                    <button
                                        onClick={handleToggleSpc}
                                        disabled={isPending}
                                        className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold border transition-all hover:scale-[1.02] active:scale-95 ${selectedCustomer.is_spc
                                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                                            : 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                                            }`}
                                    >
                                        <Ban className="w-4 h-4" />
                                        {selectedCustomer.is_spc ? 'Remover SPC' : 'Negativar SPC'}
                                    </button>

                                    {/* AÇÕES DE GESTÃO DE CARTEIRA */}
                                    <button
                                        onClick={() => handleChangeStatus('Externa')}
                                        className="bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 hover:text-white flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95"
                                        title="Enviar para Cobrança Externa (Remove da lista)"
                                    >
                                        <ExternalLink className="w-4 h-4" /> Externa
                                    </button>

                                    <button
                                        onClick={() => handleChangeStatus('Perdido')}
                                        className="bg-slate-800 text-slate-300 border border-slate-700 hover:bg-red-900/30 hover:text-red-300 hover:border-red-900/50 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-xs font-bold transition-all hover:scale-[1.02] active:scale-95"
                                        title="Marcar como Perdido/Prejuízo (Remove da lista)"
                                    >
                                        <Trash2 className="w-4 h-4" /> Perdido
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 min-h-[400px]">
                                {/* COLUNA ESQUERDA: REGISTRAR CONTATO E HISTÓRICO */}
                                <div className="space-y-6">
                                    {/* FORMULÁRIO DE REGISTRO */}
                                    <div className="bg-slate-900/60 rounded-3xl border border-white/5 p-6 backdrop-blur-sm shadow-xl">
                                        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                                            <FileText className="w-5 h-5 text-orange-400" /> Registrar Contato
                                        </h3>
                                        <div className="space-y-4">
                                            <div className="flex gap-2 p-1 bg-black/20 rounded-lg">
                                                {['Whatsapp', 'Ligação', 'Presencial'].map(tipo => (
                                                    <button
                                                        key={tipo}
                                                        onClick={() => setTipoContato(tipo)}
                                                        className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${tipoContato === tipo ? 'bg-orange-500 text-white shadow' : 'text-slate-500 hover:text-slate-300'}`}
                                                    >
                                                        {tipo}
                                                    </button>
                                                ))}
                                            </div>

                                            <textarea
                                                placeholder="Resumo da conversa..."
                                                value={resumo}
                                                onChange={e => setResumo(e.target.value)}
                                                className="w-full bg-black/20 border border-white/10 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-orange-500/50 min-h-[80px] resize-none"
                                            />

                                            <div>
                                                <label className="text-[10px] uppercase font-bold text-slate-500 mb-1 block pl-1">Lembrar em (Opcional)</label>
                                                <input
                                                    type="date"
                                                    value={proximaAcao}
                                                    onChange={e => setProximaAcao(e.target.value)}
                                                    className="w-full bg-black/20 border border-white/10 rounded-xl p-2.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-orange-500/50"
                                                />
                                                <p className="text-[10px] text-slate-500 mt-1 pl-1 italic">
                                                    *Ao definir uma data futura, o cliente irá para a aba &quot;Já Cobrados&quot;.
                                                </p>
                                            </div>

                                            <button
                                                onClick={handleRegistrarContato}
                                                disabled={isPending || !resumo.trim()}
                                                className="w-full bg-orange-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-orange-900/20 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
                                            >
                                                {isPending ? 'Salvando...' : 'Registrar Ação'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* HISTÓRICO DE MENSAGENS */}
                                    <div className="space-y-3">
                                        <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider pl-1">Histórico Recente</h3>
                                        {historico.length === 0 ? (
                                            <div className="bg-slate-900/30 rounded-2xl p-6 text-center border dashed border-white/10">
                                                <p className="text-slate-500 text-xs">Nenhum histórico encontrado.</p>
                                            </div>
                                        ) : (
                                            historico.map(item => (
                                                <div key={item.id} className="bg-slate-900/40 rounded-2xl p-4 border border-white/5 relative">
                                                    <div className="flex justify-between items-start mb-2">
                                                        <span className="text-xs font-bold text-slate-300">{item.tipo_contato}</span>
                                                        <span className="text-[10px] text-slate-500">{new Date(item.created_at || '').toLocaleString('pt-BR')}</span>
                                                    </div>
                                                    <p className="text-sm text-slate-400 leading-relaxed bg-black/20 p-3 rounded-xl border border-white/5">
                                                        &quot;{item.resumo_conversa}&quot;
                                                    </p>
                                                    {item.proxima_acao && (
                                                        <div className="mt-2 flex items-center gap-1.5 text-[10px] text-orange-400 font-bold bg-orange-500/10 w-fit px-2 py-1 rounded-lg border border-orange-500/10">
                                                            <Calendar className="w-3 h-3" />
                                                            Próxima revisão: {new Date(item.proxima_acao).toLocaleDateString()}
                                                        </div>
                                                    )}
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* COLUNA DIREITA: DETALHES DE DÉBITOS */}
                                <div className="bg-slate-900/40 rounded-3xl border border-white/5 overflow-hidden flex flex-col max-h-[600px]">
                                    <div className="p-5 border-b border-white/5 bg-slate-900/60 sticky top-0 z-10 backdrop-blur-sm">
                                        <h3 className="text-white font-bold flex items-center gap-2">
                                            <Wallet className="w-5 h-5 text-indigo-400" /> Detalhes dos Débitos
                                        </h3>
                                    </div>

                                    <div className="overflow-y-auto custom-scrollbar p-4 space-y-4">
                                        {loadingDetails ? (
                                            <div className="text-center py-10 text-slate-500 animate-pulse">Carregando detalhes...</div>
                                        ) : detalhesDivida.length === 0 ? (
                                            <div className="text-center py-10 text-slate-500">Nenhum débito pendente encontrado.</div>
                                        ) : (
                                            detalhesDivida.map((financiamento: any) => (
                                                <div key={financiamento.id} className="bg-black/20 rounded-2xl p-4 border border-white/5 hover:bg-black/30 transition-colors">
                                                    <div className="flex justify-between items-start mb-3 border-b border-white/5 pb-2">
                                                        <div>
                                                            <p className="text-xs text-slate-400">Venda #{financiamento.venda_id}</p>
                                                            <p className="text-xs font-bold text-slate-200 mt-1">{new Date(financiamento.created_at).toLocaleDateString()}</p>
                                                        </div>
                                                        <span className="text-xs font-black text-indigo-300 bg-indigo-500/10 px-2 py-1 rounded-lg">
                                                            {formatMoney(financiamento.valor_total)}
                                                        </span>
                                                    </div>

                                                    <div className="space-y-2">
                                                        {financiamento.financiamento_parcelas.map((parc: any) => {
                                                            const isAtrasado = parc.status === 'Pendente' && new Date(parc.data_vencimento) < new Date()
                                                            return (
                                                                <div key={parc.id} className={`flex justify-between items-center text-xs p-2 rounded-lg ${parc.status === 'Pago' ? 'bg-emerald-500/5 text-emerald-500/50 line-through' :
                                                                    isAtrasado ? 'bg-red-500/10 text-red-200 border border-red-500/20' :
                                                                        'bg-slate-700/30 text-slate-400'
                                                                    }`}>
                                                                    <span>{parc.numero_parcela}ª Parc - {new Date(parc.data_vencimento).toLocaleDateString()}</span>
                                                                    <span className="font-bold">{formatMoney(parc.valor_parcela)}</span>
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-60">
                            <Search className="w-16 h-16 mb-4 text-slate-700" />
                            <p className="text-lg font-medium">Selecione um cliente para ver os detalhes</p>
                            <p className="text-sm">Use os filtros laterais para encontrar quem você precisa cobrar.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}