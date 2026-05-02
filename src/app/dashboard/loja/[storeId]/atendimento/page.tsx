// ============================
// 📄 ARQUIVO: src/app/dashboard/loja/[storeId]/atendimento/page.tsx
// ============================

'use client'

import { useState, useTransition, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
    searchCustomersByName,
    createNewVenda,
    type CustomerSearchResult,
    getLastSalesForCustomer,
    type CustomerSaleHistory
} from '@/lib/actions/vendas.actions'
import { getEmployees } from '@/lib/actions/employee.actions'
import {
    Loader2, Search, X, PlusCircle, UserCircle,
    History, ChevronDown, ChevronUp, Eye, Wallet,
    AlertTriangle, CheckCircle2, User, Briefcase,
    ShoppingCart, UserPlus, Ban, ArrowLeft
} from 'lucide-react'
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { Database } from '@/lib/database.types'
import QuickCustomerModal from '@/components/modals/QuickCustomerModal'


type Employee = Database['public']['Tables']['employees']['Row']
type Customer = Database['public']['Tables']['customers']['Row']

// ATUALIZAÇÃO 1: Adicionado prop customerObs na assinatura do componente
function HistoryCard({ data, customerObs }: { data: CustomerSaleHistory, customerObs?: string | null }) {
    const [isOpen, setIsOpen] = useState(false)
    const isAtrasado = data.financeiro.status_geral === 'Atrasado'
    const isQuitado = data.financeiro.status_geral === 'Quitado'
    const formatMoney = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

    return (
        <div className="bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-xl overflow-hidden transition-all hover:shadow-2xl hover:bg-white/10 w-full group">
            <div onClick={() => setIsOpen(!isOpen)} className="p-5 cursor-pointer flex justify-between items-center hover:bg-white/5 transition-colors">
                <div className="flex items-center gap-5 flex-1">
                    <div className={`p-3.5 rounded-2xl flex-shrink-0 transition-transform group-hover:scale-110 shadow-lg ${isAtrasado ? 'bg-red-500/10 text-red-400 border border-red-500/20' : 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20'}`}>
                        {isAtrasado ? <AlertTriangle className="h-7 w-7" /> : <History className="h-7 w-7" />}
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Venda #{data.venda_id}</p>
                            <span className="text-sm font-black text-white">{new Date(data.data).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                            <User className="h-4 w-4 text-slate-400" />
                            <span className="text-xs text-slate-400 font-medium uppercase tracking-tighter">Para:</span>
                            <strong className="text-lg text-white tracking-tight">{data.paciente_nome}</strong>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-8">
                    <div className="text-right hidden sm:block">
                        <p className="text-2xl font-black text-white tracking-tighter">{formatMoney(data.valor_total)}</p>
                        <div className="flex flex-col items-end gap-1 mt-1">
                            <span className="text-[10px] font-black text-slate-400 border border-white/10 bg-white/5 px-2 py-0.5 rounded-full uppercase tracking-widest">{data.financeiro.forma_pagamento_resumo || 'Em Aberto'}</span>
                            {data.financeiro.tem_carne && (
                                <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full shadow-sm ${isQuitado ? 'text-emerald-400 bg-emerald-500/10 border border-emerald-500/20' : isAtrasado ? 'text-rose-400 bg-rose-500/10 border border-rose-500/20' : 'text-amber-400 bg-amber-500/10 border border-amber-500/20'}`}>
                                    {data.financeiro.status_geral}
                                </span>
                            )}
                        </div>
                    </div>
                    {isOpen ? <ChevronUp className="h-6 w-6 text-slate-400" /> : <ChevronDown className="h-6 w-6 text-slate-400" />}
                </div>
            </div>
            {isOpen && (
                <div className="p-6 border-t border-white/5 animate-in slide-in-from-top-4 duration-300">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-7 space-y-6">
                            <div>
                                <h4 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">
                                    <ShoppingCart className="h-3 w-3" /> Produtos Adquiridos
                                </h4>
                                <div className="bg-white/5 rounded-2xl border border-white/5 overflow-hidden shadow-sm">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-white/5 text-slate-400 font-black text-[10px] uppercase tracking-widest">
                                            <tr>
                                                <th className="px-4 py-3">Descrição</th>
                                                <th className="px-4 py-3 text-center">Qtd.</th>
                                                <th className="px-4 py-3 text-right">Vl. Unit.</th>
                                                <th className="px-4 py-3 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {data.itens.map((item, idx) => (
                                                <tr key={idx} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-4 py-3 font-bold text-slate-200">{item.descricao}</td>
                                                    <td className="px-4 py-3 text-center text-slate-500 font-medium">{item.quantidade}</td>
                                                    <td className="px-4 py-3 text-right text-slate-500 font-medium">{formatMoney(item.valor_unitario)}</td>
                                                    <td className="px-4 py-3 text-right font-black text-cyan-400">{formatMoney(item.valor_total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {data.financeiro.tem_carne && data.financeiro.parcelas_detalhes.length > 0 && (
                                <div>
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase mb-3 tracking-widest flex items-center gap-2">
                                        <Wallet className="h-3 w-3" /> Parcelamento (Carnê)
                                    </h4>
                                    <div className="flex gap-3 overflow-x-auto pb-4 custom-scrollbar">
                                        {data.financeiro.parcelas_detalhes.map((p) => (
                                            <div key={p.numero} className={`flex-shrink-0 p-3 rounded-2xl border min-w-[120px] transition-all hover:translate-y-[-2px] shadow-sm ${p.status === 'Pago' ? 'bg-emerald-500/10 border-emerald-500/20' : new Date(p.vencimento) < new Date() ? 'bg-rose-500/10 border-rose-500/20' : 'bg-white/5 border-white/10'}`}>
                                                <p className="text-[9px] text-slate-500 font-black uppercase tracking-widest">{p.numero}ª Parc</p>
                                                <p className={`font-black text-lg tracking-tight ${p.status === 'Pago' ? 'text-emerald-400' : new Date(p.vencimento) < new Date() ? 'text-rose-400' : 'text-slate-200'}`}>{formatMoney(p.valor)}</p>
                                                <p className={`text-[10px] font-bold mt-1 ${p.status === 'Pago' ? 'text-emerald-500' : 'text-slate-500'}`}>
                                                    {new Date(p.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="lg:col-span-5 space-y-4">
                            <div className="bg-white/5 p-6 rounded-3xl border border-white/10 h-full shadow-inner relative overflow-hidden">
                                { /* Glow effect */}
                                <div className="absolute -top-10 -right-10 w-32 h-32 bg-cyan-500/10 blur-[50px] rounded-full pointer-events-none" />

                                <p className="text-[10px] font-black text-cyan-400 uppercase mb-4 flex items-center gap-2 tracking-widest shadow-sm relative z-10">
                                    <Eye className="h-4 w-4" /> DADOS DA RECEITA USADA
                                </p>
                                {data.tecnico ? (
                                    <div className="space-y-5 relative z-10">
                                        <div className="flex justify-between text-sm items-baseline border-b border-white/5 pb-3">
                                            <span className="text-slate-500 font-bold uppercase text-[10px] tracking-widest">Médico:</span>
                                            <span className="font-black text-slate-200 text-right">{data.tecnico.medico}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-3 text-center">
                                            <div className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Olho</div>
                                            <div className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Esf / Cil</div>
                                            <div className="text-[9px] font-black text-cyan-500 uppercase tracking-widest">Adição</div>
                                            <div className="font-black text-cyan-400 text-lg flex items-center justify-center">OD</div>
                                            <div className="bg-black/20 rounded-xl py-2 px-3 text-base font-mono shadow-sm border border-white/5 text-slate-300 font-bold">{data.tecnico.longe_od}</div>
                                            <div className="bg-black/20 rounded-xl py-2 px-3 text-base font-mono shadow-sm border border-white/5 text-slate-300 row-span-2 flex items-center justify-center font-black">{data.tecnico.adicao}</div>
                                            <div className="font-black text-cyan-400 text-lg flex items-center justify-center">OE</div>
                                            <div className="bg-black/20 rounded-xl py-2 px-3 text-base font-mono shadow-sm border border-white/5 text-slate-300 font-bold">{data.tecnico.longe_oe}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-48 text-cyan-200">
                                        <Eye className="h-12 w-12 opacity-30 mb-3" />
                                        <p className="text-xs italic font-bold uppercase tracking-widest opacity-60">Venda sem grau (Solar/Balcão)</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ATUALIZAÇÃO 2: Exibindo a observação do cadastro na parte inferior do card */}
                    {customerObs && (
                        <div className="mt-8 pt-6 border-t border-white/5">
                            <p className="text-[10px] font-black text-rose-400 uppercase mb-3 flex items-center gap-2 tracking-widest">
                                <AlertTriangle className="h-4 w-4" /> Observações do Cadastro
                            </p>
                            <div className="bg-rose-500/10 text-rose-300 text-sm p-4 rounded-2xl border border-rose-500/20 font-bold shadow-inner leading-relaxed">
                                {customerObs}
                            </div>
                        </div>
                    )}

                </div>
            )}
        </div>
    )
}

// --- PÁGINA PRINCIPAL ---
export default function AtendimentoPage() {
    const params = useParams()
    const { push } = useRouter()
    const { preference } = useBackgroundPreference();
    const storeId = parseInt(params.storeId as string, 10)

    // UI States
    const [query, setQuery] = useState('')
    const [isSearching, startSearchTransition] = useTransition()
    const [isCreating, startCreateTransition] = useTransition()
    const [searchError, setSearchError] = useState<string | null>(null)
    const [isQuickModalOpen, setIsQuickModalOpen] = useState(false)

    // Data States
    const [customers, setCustomers] = useState<CustomerSearchResult[]>([])
    const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null)
    const [history, setHistory] = useState<CustomerSaleHistory[]>([])
    const [loadingHistory, startHistoryTransition] = useTransition()

    const [employees, setEmployees] = useState<Employee[]>([])
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>('')

    useEffect(() => {
        if (!isNaN(storeId)) {
            getEmployees(storeId).then(data => setEmployees(data));
        }
    }, [storeId]);

    useEffect(() => {
        if (query.length >= 3 && !selectedCustomer) {
            const timer = setTimeout(() => handleSearch(), 600);
            return () => clearTimeout(timer);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const handleClear = () => {
        setQuery('')
        setCustomers([])
        setSelectedCustomer(null)
        setHistory([])
        setSearchError(null)
    }

    const handleSearch = () => {
        if (query.length < 2) return
        setSearchError(null)

        startSearchTransition(async () => {
            const result = await searchCustomersByName(query, storeId)
            if (result.success && result.data) {
                setCustomers(result.data)
            } else {
                setSearchError(result.message || 'Erro ao buscar.')
            }
        })
    }

    const handleSelectCustomer = (customer: CustomerSearchResult) => {
        setSelectedCustomer(customer)
        setCustomers([])
        setQuery(customer.full_name)
        setSearchError(null)

        startHistoryTransition(async () => {
            const res = await getLastSalesForCustomer(storeId, customer.id)
            if (res.success && res.data) setHistory(res.data)
        })
    }

    // Chamado quando o Modal cria um cliente novo com sucesso
    const handleQuickSuccess = (newCustomer: Customer) => {
        const simpleCustomer: CustomerSearchResult = {
            id: newCustomer.id,
            full_name: newCustomer.full_name,
            cpf: newCustomer.cpf,
            fone_movel: newCustomer.fone_movel,
            obs_debito: newCustomer.obs_debito,
            tem_pendencia: false // Novo cliente não deve nada
        }
        handleSelectCustomer(simpleCustomer)
    }

    const handleStartVenda = () => {
        if (!selectedCustomer) return
        if (!selectedEmployeeId) {
            alert("Selecione o vendedor para continuar.")
            return
        }

        startCreateTransition(async () => {
            const result = await createNewVenda(selectedCustomer.id, parseInt(selectedEmployeeId))
            if (result.success && result.data) {
                push(`/dashboard/loja/${storeId}/vendas/${result.data.id}/experimental`)
            } else {
                alert(result.message || 'Erro ao criar venda.')
            }
        })
    }

    return (
        <div className="relative flex flex-col h-[calc(100vh-64px)] bg-slate-950 overflow-hidden font-sans">

            {/* BACKGROUND PREMIUM (Controlado pelo preference) */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 z-0 bg-[url('/vendasos.jpg')] bg-cover bg-center opacity-40 blur-[2px]" />
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-slate-950/60 via-slate-950/80 to-slate-950" />
            </div>

            {/* Header Glassmorphic Superior */}
            <div className="relative z-30 bg-white/5 backdrop-blur-xl border-b border-white/10 px-6 py-3 flex items-center shrink-0 shadow-2xl h-14">
                <div className="flex items-center gap-3">
                    <Link
                        href={`/dashboard/loja/${storeId}/vendas`}
                        className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
                        title="Voltar para Vendas"
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Link>
                    <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-white/10 shadow-[0_0_15px_rgba(34,211,238,0.2)]">
                        <ShoppingCart className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-lg font-black text-white tracking-tight uppercase">Atendimento</h1>
                        <p className="text-[10px] text-cyan-400 font-black uppercase tracking-[0.2em] opacity-80">Recepção e Dossiê</p>
                    </div>
                </div>
                {/* Actions Header */}
                <div className="ml-auto flex items-center gap-4">
                    {/* Toggle de Fundo */}
                    <BackgroundToggle />
                </div>
            </div>

            {/* Toolbar de Busca Glassmorphic */}
            <div className="relative z-20 bg-slate-900/40 backdrop-blur-md px-6 py-4 flex flex-col sm:flex-row items-center gap-4 shrink-0 border-b border-white/5 shadow-lg">
                <div className="flex flex-col gap-1 flex-shrink-0 min-w-[140px]">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Paciente</span>
                    <h2 className="text-sm font-black text-white uppercase tracking-tight">Selecione o cliente</h2>
                </div>

                <div className="flex-1 w-full max-w-xl relative">
                    <div className="relative group">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={!!selectedCustomer}
                            className={`w-full h-12 rounded-2xl border border-white/10 pl-12 pr-12 shadow-inner focus:outline-none focus:ring-2 focus:ring-cyan-500/50 text-white font-bold transition-all ${selectedCustomer ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' : 'bg-black/40 hover:bg-black/60'}`}
                            placeholder={selectedCustomer ? '' : "Nome, CPF ou Telefone..."}
                        />
                        <Search className={`absolute left-4 top-3.5 h-5 w-5 transition-colors ${selectedCustomer ? 'text-cyan-400' : 'text-slate-500 group-focus-within:text-cyan-400'}`} />

                        {selectedCustomer && (
                            <button onClick={handleClear} className="absolute right-3 top-3 p-1.5 hover:bg-white/10 rounded-xl text-cyan-400 transition-colors">
                                <X className="h-4 w-4" />
                            </button>
                        )}

                        {isSearching && !selectedCustomer && (
                            <Loader2 className="absolute right-4 top-3.5 h-5 w-5 text-cyan-500 animate-spin" />
                        )}
                    </div>

                    {/* DROPDOWN DE RESULTADOS + BOTÃO NOVO CADASTRO */}
                    {!selectedCustomer && (query.length >= 2 || customers.length > 0) && (
                        <div className="absolute top-full left-0 w-full mt-3 bg-slate-900/90 backdrop-blur-2xl rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-300">
                            <div className="max-h-72 overflow-y-auto custom-scrollbar">
                                {customers.length > 0 ? (
                                    customers.map((cust) => (
                                        <button
                                            key={cust.id}
                                            onClick={() => handleSelectCustomer(cust)}
                                            className="w-full text-left px-5 py-4 hover:bg-cyan-500/10 border-b border-white/5 last:border-0 flex justify-between items-center group transition-all"
                                        >
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <p className="font-black text-white text-sm group-hover:text-cyan-400 transition-colors uppercase tracking-tight">{cust.full_name}</p>
                                                    {cust.tem_pendencia && <span className="text-[9px] bg-rose-500/20 text-rose-400 px-2 py-0.5 rounded-full font-black border border-rose-500/30 uppercase tracking-widest">Inadimplente</span>}
                                                </div>
                                                <p className="text-[10px] text-slate-400 font-bold mt-0.5">CPF: {cust.cpf || 'N/A'}</p>
                                            </div>
                                            <div className="p-2 bg-white/5 rounded-xl group-hover:bg-cyan-500 group-hover:text-white transition-all">
                                                <PlusCircle className="h-4 w-4" />
                                            </div>
                                        </button>
                                    ))
                                ) : !isSearching && query.length >= 2 && (
                                    <div className="px-5 py-6 text-center text-slate-500 italic text-sm">
                                        Nenhum cliente encontrado.
                                    </div>
                                )}

                                {/* OPÇÃO FIXA: CADASTRAR NOVO */}
                                <button
                                    onClick={() => setIsQuickModalOpen(true)}
                                    className="w-full text-left px-5 py-5 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 font-black flex items-center gap-3 border-t border-white/5 transition-all"
                                >
                                    <div className="p-2 bg-cyan-500 rounded-xl text-white shadow-[0_0_15px_rgba(6,182,212,0.4)]">
                                        <UserPlus className="h-5 w-5" />
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="uppercase text-xs tracking-widest">Novo Cadastro</span>
                                        <span className="text-[10px] opacity-70 font-medium tracking-normal text-white">Adicionar "{query}" ao sistema</span>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-4 ml-auto flex-shrink-0 w-full sm:w-auto">
                    <div className={`transition-all duration-500 flex-1 sm:flex-none ${selectedCustomer ? 'opacity-100 translate-x-0' : 'opacity-30 translate-x-4 pointer-events-none'}`}>
                        <div className="relative group">
                            <Briefcase className="absolute left-3.5 top-3 h-4 w-4 text-cyan-400 group-focus-within:text-white transition-colors" />
                            <select
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                className="w-full sm:w-48 h-10 pl-10 pr-4 rounded-xl border border-white/10 focus:ring-2 focus:ring-cyan-500/50 bg-black/40 text-white text-xs font-black uppercase tracking-widest cursor-pointer hover:bg-black/60 transition-all appearance-none"
                            >
                                <option value="" disabled className="bg-slate-900 border-none">Vendedor</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id} className="bg-slate-900 text-white">{emp.full_name}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-slate-500 pointer-events-none" />
                        </div>
                    </div>

                    <button
                        onClick={handleStartVenda}
                        disabled={!selectedCustomer || !selectedEmployeeId || isCreating}
                        className={`
                        flex items-center justify-center gap-3 px-8 py-3 rounded-2xl font-black text-xs shadow-2xl transition-all transform active:scale-95 flex-1 sm:flex-none uppercase tracking-widest border
                        ${(!selectedCustomer || !selectedEmployeeId)
                                ? 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed shadow-none grayscale'
                                : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white border-white/20 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)]'
                            }
                    `}
                    >
                        {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        INICIAR NOVA VENDA
                    </button>
                </div>
            </div>

            <div className="relative z-10 flex-1 overflow-y-auto p-6 lg:p-10 custom-scrollbar">
                {selectedCustomer ? (
                    <div className="max-w-6xl mx-auto space-y-8 animate-in slide-in-from-bottom-6 duration-700">

                        {/* ===== CABEÇALHO DO CLIENTE ===== */}
                        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-6 border-b border-white/10">
                            <div className="space-y-1">
                                <div className="flex items-center gap-3">
                                    <div className="p-3 bg-white/10 rounded-2xl border border-white/10">
                                        <UserCircle className="h-8 w-8 text-white" />
                                    </div>
                                    <div>
                                        <h2 className="text-4xl font-black text-white tracking-tighter leading-none">{selectedCustomer.full_name}</h2>
                                        <div className="flex items-center gap-2 mt-2">
                                            <span className="text-[10px] font-black text-cyan-400 uppercase tracking-[0.2em] opacity-80">Pasta do Paciente</span>
                                            <div className="h-1 w-1 rounded-full bg-white/20" />
                                            <span className="text-[10px] font-bold text-slate-400 opacity-60">CPF: {selectedCustomer.cpf || 'Não informado'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <button
                                    onClick={() => push(`/dashboard/loja/${storeId}/cliente/${selectedCustomer.id}/historico`)}
                                    className="p-2.5 bg-white/5 hover:bg-cyan-500/20 text-slate-400 hover:text-cyan-300 rounded-xl border border-white/5 hover:border-cyan-500/30 transition-all flex items-center gap-2 group"
                                    title="Ver Raio-X Completo"
                                >
                                    <History className="h-5 w-5 group-hover:scale-110 transition-transform" />
                                    <span className="text-xs font-bold uppercase tracking-widest hidden sm:inline">Raio-X</span>
                                </button>
                                {selectedCustomer.obs_debito && (
                                    <div className="bg-rose-500/20 text-rose-300 px-5 py-2.5 rounded-2xl text-xs font-black flex items-center gap-3 border border-rose-500/30 shadow-2xl backdrop-blur-sm animate-pulse">
                                        <AlertTriangle className="h-5 w-5 text-rose-500" />
                                        <div className="flex flex-col">
                                            <span className="uppercase text-[9px] tracking-widest opacity-70 font-black">Restrição Interna</span>
                                            <span className="text-white tracking-tight">{selectedCustomer.obs_debito}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ===== NOVO: ALERTA DE DÍVIDA (AQUI) ===== */}
                        {selectedCustomer.tem_pendencia && (
                            <div className="bg-gradient-to-r from-rose-600/40 to-rose-900/40 backdrop-blur-xl border border-rose-500/30 p-6 rounded-3xl shadow-2xl flex items-start gap-5 animate-in fade-in zoom-in-95 duration-500">
                                <div className="p-4 bg-rose-500 text-white rounded-2xl shadow-[0_0_20px_rgba(244,63,94,0.4)]">
                                    <Ban className="h-8 w-8" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black text-white leading-tight uppercase tracking-tight">Paciente com Pendências Financeiras</h3>
                                    <p className="text-rose-100/80 text-sm mt-2 font-medium leading-relaxed max-w-2xl">
                                        Existem parcelas vencidas no sistema para este CPF. É recomendável regularizar a situação ou consultar a gerência antes de processar novas vendas a prazo ou no carnê.
                                    </p>
                                </div>
                            </div>
                        )}
                        {/* ========================================= */}

                        {loadingHistory ? (
                            <div className="flex flex-col items-center justify-center h-64 space-y-4">
                                <div className="relative">
                                    <div className="h-16 w-16 rounded-full border-t-2 border-b-2 border-cyan-500 animate-spin" />
                                    <Loader2 className="absolute top-5 left-5 h-6 w-6 text-cyan-400" />
                                </div>
                                <div className="text-center">
                                    <p className="text-white font-black uppercase text-xs tracking-widest">Sincronizando Dossiê</p>
                                    <p className="text-slate-500 text-[10px] mt-1 font-bold uppercase tracking-tighter">Acessando registros históricos...</p>
                                </div>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="bg-white/5 backdrop-blur-sm rounded-3xl p-12 text-center border border-dashed border-white/10 shadow-inner group">
                                <div className="w-20 h-20 bg-white/5 rounded-3xl flex items-center justify-center mx-auto mb-6 text-cyan-400 border border-white/5 group-hover:scale-110 transition-transform duration-500 shadow-xl">
                                    <UserPlus className="h-10 w-10 opacity-40" />
                                </div>
                                <h3 className="text-2xl font-black text-white tracking-tight uppercase">Bem-vindo(a)!</h3>
                                <p className="text-slate-400 font-medium mt-2 max-w-sm mx-auto leading-relaxed">Não localizamos compras anteriores. Inicie o atendimento para gerar o primeiro registro histórico deste paciente.</p>
                            </div>
                        ) : (
                            <div className="space-y-5">
                                <div className="flex items-center gap-3 mb-6 px-1">
                                    <History className="h-4 w-4 text-cyan-400" />
                                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Histórico de Movimentações</h3>
                                    <div className="flex-1 h-[1px] bg-white/5 ml-2" />
                                </div>
                                {history.map((item) => (
                                    <HistoryCard key={item.venda_id} data={item} customerObs={selectedCustomer.obs_debito} />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                        <div className="relative mb-10 group">
                            <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-3xl group-hover:bg-cyan-500/30 transition-all duration-1000" />
                            <div className="relative w-32 h-32 bg-white/5 backdrop-blur-2xl rounded-[2.5rem] flex items-center justify-center border border-white/10 shadow-2xl group-hover:rotate-6 transition-all duration-700">
                                <Search className="h-14 w-14 text-cyan-400 group-hover:scale-110 transition-transform duration-500" />
                            </div>
                        </div>
                        <h2 className="text-4xl font-black text-white tracking-widest leading-none uppercase">Central de Atendimento</h2>
                        <p className="text-slate-400 mt-4 max-w-md font-medium text-lg leading-relaxed opacity-60">
                            Identifique o paciente para carregar o dossiê técnico e financeiro completo antes de iniciar uma nova jornada de venda.
                        </p>

                        <div className="mt-12 flex gap-8 items-center justify-center opacity-30 grayscale">
                            <div className="flex flex-col items-center gap-2">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10"><User className="h-6 w-6 text-white" /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Dados</span>
                            </div>
                            <div className="w-12 h-px bg-white/10" />
                            <div className="flex flex-col items-center gap-2">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10"><Eye className="h-6 w-6 text-white" /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Grau</span>
                            </div>
                            <div className="w-12 h-px bg-white/10" />
                            <div className="flex flex-col items-center gap-2">
                                <div className="p-3 rounded-2xl bg-white/5 border border-white/10"><Wallet className="h-6 w-6 text-white" /></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Finanças</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Cadastro Rápido Glassmorphic */}
            <QuickCustomerModal
                isOpen={isQuickModalOpen}
                onClose={() => setIsQuickModalOpen(false)}
                storeId={storeId}
                initialName={query}
                onSuccess={handleQuickSuccess}
            />

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
                    background: rgba(6, 182, 212, 0.3);
                }
                .no-scrollbar::-webkit-scrollbar {
                    display: none;
                }
                .no-scrollbar {
                    -ms-overflow-style: none;
                    scrollbar-width: none;
                }
            `}</style>
        </div>
    )
}
