// Caminho: src/components/cobranca/CobrancaInterface.tsx
'use client'

import { useState, useEffect, useTransition, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { 
  DevedorResumo, 
  CobrancaHistoricoItem, 
  registrarCobranca, 
  toggleSpcStatus,
  getHistoricoCobranca,
  getDetalhesDivida 
} from '@/lib/actions/collection.actions'
import { 
  User, Phone, MessageCircle, AlertTriangle, 
  CheckCircle2, History, Send, ShieldAlert, Loader2, Filter,
  ShoppingBag, Calendar, ChevronDown, ChevronUp, Wallet, Megaphone
} from 'lucide-react'

// --- Helpers de Formatação ---
const formatCurrency = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const formatDate = (dateStr: string | null) => dateStr ? new Date(dateStr).toLocaleDateString('pt-BR') : '-'
const formatDateTime = (dateStr: string) => new Date(dateStr).toLocaleString('pt-BR')

// --- DESIGN SYSTEM (ALTO CONTRASTE) ---
const labelStyle = "block text-[10px] font-bold text-slate-700 uppercase mb-0.5 tracking-wider"
const inputStyle = "block w-full rounded-md border border-slate-300 bg-white shadow-sm text-slate-900 h-9 text-xs px-2 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-bold transition-all placeholder:font-normal"

// --- Componente: Badge de Atraso ---
function AtrasoBadge({ dias }: { dias: number }) {
    let color = 'bg-slate-100 text-slate-600 border-slate-200'
    let label = 'Em dia'
    
    if (dias > 30) { color = 'bg-red-100 text-red-700 border-red-200'; label = `${dias} dias` }
    else if (dias > 5) { color = 'bg-orange-100 text-orange-700 border-orange-200'; label = `${dias} dias` }
    else if (dias > 0) { color = 'bg-amber-100 text-amber-800 border-amber-200'; label = `${dias} dias` }
    
    return <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase tracking-wide ${color}`}>{label} atraso</span>
}

// --- Componente: Card de Venda Detalhada ---
function CardVendaDetalhada({ dados }: { dados: any }) {
    const [isExpanded, setIsExpanded] = useState(false)
    
    const venda = dados.vendas
    const parcelas = dados.financiamento_parcelas || []
    
    parcelas.sort((a: any, b: any) => a.numero_parcela - b.numero_parcela)

    const parcelasAtrasadas = parcelas.filter((p: any) => {
         if (p.status !== 'Pendente') return false;
        return new Date(p.data_vencimento) < new Date();
    });

    const isCritical = parcelasAtrasadas.length > 0;
    const valorTotal = venda ? venda.valor_final : dados.valor_total;
    const dataVenda = venda ? venda.created_at : dados.created_at;

    return (
        <div className={`mb-3 rounded-xl border ${isCritical ? 'border-red-200 bg-white' : 'border-slate-200 bg-white'} shadow-sm overflow-hidden`}>
            <div 
                onClick={() => setIsExpanded(!isExpanded)}
                className={`p-3 flex justify-between items-center cursor-pointer transition-colors ${isCritical ? 'bg-red-50 hover:bg-red-100' : 'bg-slate-50 hover:bg-slate-100'}`}
            >
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${isCritical ? 'bg-white text-red-600 shadow-sm' : 'bg-white text-slate-500 shadow-sm'}`}>
                        <ShoppingBag className="h-5 w-5" />
                    </div>
                    <div>
                        <p className="text-sm font-bold text-slate-800">
                            {venda ? `Venda #${venda.id}` : `Carnê Avulso #${dados.id}`}
                        </p>
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 font-medium">
                            <Calendar className="h-3 w-3" /> {formatDate(dataVenda)}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Total</p>
                        <p className="text-sm font-black text-slate-800">{formatCurrency(valorTotal)}</p>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400"/> : <ChevronDown className="h-4 w-4 text-slate-400"/>}
                </div>
            </div>

            {isExpanded && (
                <div className="p-4 border-t border-slate-100 animate-in slide-in-from-top-2">
                    {venda && venda.venda_itens && (
                        <div className="mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                             <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Itens Comprados</p>
                            <ul className="space-y-1">
                                {venda.venda_itens.map((item: any, idx: number) => (
                                    <li key={idx} className="text-xs text-slate-700 flex justify-between border-b border-slate-200 pb-1 last:border-0">
                                         <span className="font-medium">{item.quantidade}x {item.descricao}</span>
                                        <span className="font-bold text-slate-600">{formatCurrency(item.valor_total_item)}</span>
                                    </li>
                                ))}
                             </ul>
                        </div>
                    )}

                    <div>
                        <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Parcelamento</p>
                        <div className="bg-white rounded border border-slate-200 overflow-hidden">
                            {parcelas.map((p: any) => {
                                const vencimento = new Date(p.data_vencimento);
                                vencimento.setHours(0,0,0,0)
                                const hoje = new Date();
                                hoje.setHours(0,0,0,0);

                                const isVencida = p.status === 'Pendente' && vencimento < hoje;
                                const isPaga = p.status === 'Pago';
                                
                                let rowClass = 'bg-white text-slate-600';
                                let statusLabel = 'A Vencer';
                                let statusColor = 'text-slate-400';
                                
                                if (isPaga) {
                                    rowClass = 'bg-emerald-50/50';
                                    statusLabel = `Pago ${p.data_pagamento ? formatDate(p.data_pagamento) : ''}`;
                                    statusColor = 'text-emerald-600 font-bold';
                                } else if (isVencida) {
                                    rowClass = 'bg-red-50/50';
                                    statusLabel = 'VENCIDA';
                                    statusColor = 'text-red-600 font-black';
                                }

                                return (
                                     <div key={p.id} className={`flex justify-between items-center p-2 text-xs border-b border-slate-100 last:border-0 ${rowClass}`}>
                                        <span className="w-8 text-center font-bold text-slate-500">{p.numero_parcela}ª</span>
                                        <span className="flex-1 text-center font-mono">{formatDate(p.data_vencimento)}</span>
                                        <span className="flex-1 text-right pr-4 font-bold">{formatCurrency(p.valor_parcela)}</span>
                                        <span className={`w-24 text-right text-[9px] uppercase tracking-wide ${statusColor}`}>{statusLabel}</span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

interface Props {
    initialDevedores: DevedorResumo[]
    storeId: number
    filtroAtual: string
}

export default function CobrancaInterface({ initialDevedores, storeId, filtroAtual }: Props) {
    const router = useRouter()
    const [selectedId, setSelectedId] = useState<number | null>(null)
    
    const [historico, setHistorico] = useState<CobrancaHistoricoItem[]>([])
    const [detalhesVendas, setDetalhesVendas] = useState<any[]>([])
    
    const [loadingData, setLoadingData] = useState(false)
    const [isPending, startTransition] = useTransition()
    const formRef = useRef<HTMLFormElement>(null)

    const selectedClient = initialDevedores.find(d => d.customer_id === selectedId)

    useEffect(() => {
        if (selectedId) {
            setLoadingData(true)
            Promise.all([
                getHistoricoCobranca(selectedId),
                getDetalhesDivida(selectedId, storeId)
            ]).then(([histData, dividaData]) => {
                setHistorico(histData as CobrancaHistoricoItem[])
                setDetalhesVendas(dividaData)
                setLoadingData(false)
            })
        } else {
            setHistorico([])
            setDetalhesVendas([])
        }
    }, [selectedId, storeId])

    const handleFilterChange = (novoFiltro: string) => {
        router.push(`/dashboard/loja/${storeId}/cobranca?filtro=${novoFiltro}`)
        router.refresh()
    }

    const handleToggleSpc = () => {
        if(!selectedClient) return
        const novoStatus = !selectedClient.is_spc
        if(!confirm(`Confirma ${novoStatus ? 'NEGATIVAR' : 'REMOVER DO SPC'} o cliente ${selectedClient.full_name}?`)) return

        startTransition(async () => {
            await toggleSpcStatus(selectedClient.customer_id, selectedClient.is_spc, storeId)
            router.refresh()
        })
    }

    const handleRegistrarContato = async (formData: FormData) => {
        if(!selectedClient) return
        formData.append('customer_id', selectedClient.customer_id.toString())
        
        startTransition(async () => {
            const res = await registrarCobranca(null, formData)
            if (res.success) {
                formRef.current?.reset()
                getHistoricoCobranca(selectedClient.customer_id).then(data => setHistorico(data as any))
            } else {
                alert(res.message)
            }
        })
    }

    const abrirWhatsApp = () => {
        if (!selectedClient?.fone_movel) return alert("Cliente sem celular cadastrado.")
        const refVenda = detalhesVendas[0] ? `(Ref: Venda #${detalhesVendas[0].vendas?.id || detalhesVendas[0].id})` : '';
        const num = selectedClient.fone_movel.replace(/\D/g, '')
        const msg = `Olá ${selectedClient.full_name}, tudo bem? Aqui é da Ótica. Notamos uma pendência financeira em seu cadastro ${refVenda} e gostaríamos de regularizar. Podemos conversar?`
        window.open(`https://wa.me/55${num}?text=${encodeURIComponent(msg)}`, '_blank')
    }

    return (
        <div className="flex h-full overflow-hidden bg-slate-100">
            
            {/* --- COLUNA ESQUERDA (LISTA) --- */}
            <div className="w-1/3 flex flex-col border-r border-slate-200 bg-white z-10 shadow-sm">
                
                {/* Header Gradiente (Alerta/Laranja) */}
                <div className="bg-gradient-to-br from-orange-500 to-rose-600 p-4 flex flex-col gap-3 shadow-md z-20">
                    <div className="flex justify-between items-center text-white">
                        <h2 className="font-bold text-sm flex items-center gap-2 uppercase tracking-wide">
                            <Megaphone className="h-4 w-4" /> Cobrança
                        </h2>
                        <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-medium">
                            {initialDevedores.length} pendentes
                        </span>
                    </div>
                    
                    {/* Filtros Integrados */}
                    <div className="flex p-1 bg-black/10 rounded-lg">
                         <button 
                            onClick={() => handleFilterChange('todos')}
                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroAtual === 'todos' ? 'bg-white text-rose-600 shadow-sm' : 'text-white/70 hover:bg-white/10'}`}
                        >
                            Todos
                        </button>
                        <button 
                            onClick={() => handleFilterChange('sem_spc')}
                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${filtroAtual === 'sem_spc' ? 'bg-white text-rose-600 shadow-sm' : 'text-white/70 hover:bg-white/10'}`}
                        >
                            Sem SPC
                        </button>
                    </div>
                </div>

                {/* Lista Rolável */}
                <div className="flex-1 overflow-y-auto">
                    {initialDevedores.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-64 text-center text-slate-400 p-6">
                            <CheckCircle2 className="h-12 w-12 mb-2 text-emerald-400 opacity-50" />
                            <p className="text-sm">Nenhuma pendência encontrada.</p>
                        </div>
                    ) : (
                        initialDevedores.map(dev => (
                            <div 
                                key={dev.customer_id}
                                onClick={() => setSelectedId(dev.customer_id)}
                                className={`p-3 border-b border-slate-100 cursor-pointer transition-colors group
                                    ${selectedId === dev.customer_id ? 'bg-orange-50 border-l-4 border-l-orange-500' : 'hover:bg-slate-50 border-l-4 border-l-transparent'}
                                `}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <span className={`font-bold text-xs truncate pr-2 ${selectedId === dev.customer_id ? 'text-orange-800' : 'text-slate-700'}`}>{dev.full_name}</span>
                                    <span className="text-rose-600 font-black text-xs whitespace-nowrap">{formatCurrency(dev.total_atrasado)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <AtrasoBadge dias={dev.dias_atraso} />
                                        {dev.is_spc && <span className="text-[9px] bg-slate-800 text-white px-1.5 py-0.5 rounded font-bold">SPC</span>}
                                    </div>
                                    <span className="text-[10px] text-slate-400">{dev.quantidade_parcelas_atrasadas} parc.</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* --- COLUNA DIREITA (DETALHES) --- */}
            <div className="flex-1 flex flex-col bg-slate-50 relative overflow-hidden">
                {selectedClient ? (
                    <>
                        {/* 1. Header do Cliente */}
                        <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-start shadow-sm shrink-0">
                            <div>
                                <h2 className="text-xl font-black text-slate-800 flex items-center gap-2">
                                    <User className="h-5 w-5 text-slate-400" />
                                    {selectedClient.full_name}
                                </h2>
                                <div className="flex gap-4 mt-1 text-xs text-slate-500 font-medium">
                                    <span className="flex items-center gap-1"><Phone className="h-3 w-3"/> {selectedClient.fone_movel || 'S/ Celular'}</span>
                                    <span className="flex items-center gap-1 text-rose-600 font-bold"><AlertTriangle className="h-3 w-3"/> Atraso Máx: {selectedClient.dias_atraso} dias</span>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-2">
                                <button onClick={abrirWhatsApp} className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg shadow-sm font-bold text-xs flex items-center gap-2 transition-all hover:-translate-y-0.5">
                                     <MessageCircle className="h-4 w-4" /> WhatsApp
                                </button>
                                <button onClick={handleToggleSpc} disabled={isPending} className={`text-[10px] border px-3 py-2 rounded-lg font-bold flex items-center gap-1 transition-colors uppercase tracking-wide ${selectedClient.is_spc ? 'border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100' : 'border-slate-300 text-slate-500 hover:text-rose-600 hover:border-rose-300'}`}>
                                    {isPending ? <Loader2 className="h-3 w-3 animate-spin"/> : <ShieldAlert className="h-3 w-3" />}
                                    {selectedClient.is_spc ? 'Remover SPC' : 'Negativar'}
                                </button>
                            </div>
                        </div>

                        {/* 2. Área de Conteúdo (Scroll) */}
                        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar pb-40"> {/* pb-40 para dar espaço ao form fixo */}
                            
                            {/* Card de Resumo da Dívida */}
                            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mb-6">
                                <h3 className="text-slate-800 font-bold text-sm mb-3 flex items-center gap-2 uppercase tracking-wide border-b border-slate-100 pb-2">
                                    <Wallet className="h-4 w-4 text-orange-500"/> Detalhamento da Dívida
                                </h3>
                                {loadingData ? (
                                    <div className="py-8 text-center text-slate-400">
                                        <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-orange-400"/>
                                        <p className="text-xs">Carregando contratos...</p>
                                    </div>
                                ) : detalhesVendas.length === 0 ? (
                                    <p className="text-xs text-slate-500 italic">Nenhum detalhe encontrado.</p>
                                ) : (
                                    detalhesVendas.map(dado => <CardVendaDetalhada key={dado.id} dados={dado} />)
                                )}
                            </div>

                            {/* Histórico de Conversas */}
                            <h3 className="text-slate-500 font-bold text-xs uppercase tracking-wide mb-3 flex items-center gap-2 px-1">
                                <History className="h-4 w-4"/> Histórico de Contatos
                            </h3>
                            <div className="space-y-3 pl-2 border-l-2 border-slate-200 ml-2">
                                {historico.length === 0 ? (
                                     <p className="text-slate-400 text-xs italic pl-4">Nenhum contato registrado.</p>
                                ) : (
                                    historico.map(item => (
                                        <div key={item.id} className="relative pl-6">
                                            <div className="absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300 border-2 border-slate-100"></div>
                                            <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                                                <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-bold uppercase">
                                                    <span>{formatDateTime(item.created_at)}</span>
                                                    <span className="text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">{item.tipo_contato}</span>
                                                </div>
                                                <p className="text-xs text-slate-700 leading-relaxed">{item.resumo_conversa}</p>
                                                {item.proxima_acao && (
                                                    <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-1 text-[10px] font-bold text-orange-600">
                                                        <Calendar className="h-3 w-3"/> Lembrar: {formatDate(item.proxima_acao)}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* 3. Painel Fixo de Registro (Novo Visual) */}
                        <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 z-30 shadow-[0_-5px_20px_rgba(0,0,0,0.05)]">
                             <div className="bg-orange-50 p-4 rounded-xl border border-orange-100">
                                <h3 className="text-orange-800 font-bold text-xs uppercase mb-3 flex items-center gap-2">
                                    <Send className="h-3 w-3" /> Registrar Novo Contato
                                </h3>
                                <form ref={formRef} action={handleRegistrarContato} className="flex gap-3 items-end">
                                    <div className="w-32 shrink-0">
                                        <label className={labelStyle}>Meio</label>
                                        <select name="tipo_contato" className={inputStyle}>
                                            <option value="WhatsApp">WhatsApp</option>
                                            <option value="Ligação">Ligação</option>
                                            <option value="Presencial">Presencial</option>
                                            <option value="Email">Email</option>
                                        </select>
                                    </div>
                                    <div className="w-32 shrink-0">
                                        <label className={labelStyle}>Lembrar Em</label>
                                        <input type="date" name="proxima_acao" className={inputStyle} />
                                    </div>
                                    <div className="flex-1">
                                        <label className={labelStyle}>Resumo da Conversa</label>
                                        <input 
                                            name="resumo" 
                                            type="text" 
                                            placeholder="Ex: Cliente prometeu pagar dia 15..." 
                                            className={inputStyle}
                                            required
                                            autoComplete="off"
                                        />
                                    </div>
                                    <button type="submit" disabled={isPending} className="h-9 bg-orange-600 hover:bg-orange-700 text-white px-4 rounded-lg shadow-sm font-bold text-xs flex items-center gap-2 transition-all active:scale-95">
                                        {isPending ? <Loader2 className="h-3 w-3 animate-spin"/> : 'SALVAR'}
                                    </button>
                                </form>
                             </div>
                        </div>

                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-300">
                        <Filter className="h-16 w-16 mb-4 opacity-20" />
                        <p className="text-lg font-light">Selecione um cliente para ver detalhes</p>
                    </div>
                )}
            </div>
        </div>
    )
}