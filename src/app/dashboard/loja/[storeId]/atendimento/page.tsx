// ============================
// 📄 ARQUIVO: src/app/dashboard/loja/[storeId]/atendimento/page.tsx
// ============================

'use client'

import { useState, useTransition, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
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
    ShoppingCart, UserPlus, Ban
} from 'lucide-react'
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all hover:shadow-md w-full">
            <div onClick={() => setIsOpen(!isOpen)} className="p-4 cursor-pointer flex justify-between items-center bg-gray-50 hover:bg-gray-100 transition-colors">
                <div className="flex items-center gap-4 flex-1">
                    <div className={`p-3 rounded-full flex-shrink-0 ${isAtrasado ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                        {isAtrasado ? <AlertTriangle className="h-6 w-6" /> : <History className="h-6 w-6" />}
                    </div>
                    <div>
                        <div className="flex items-baseline gap-2">
                            <p className="text-base text-gray-600">Venda #{data.venda_id}</p>
                            <span className="text-sm font-black text-gray-800">{new Date(data.data).toLocaleDateString('pt-BR')}</span>
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-600">Para:</span>
                            <strong className="text-base text-blue-800">{data.paciente_nome}</strong>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right hidden sm:block">
                        <p className="text-lg font-black text-gray-900">{formatMoney(data.valor_total)}</p>
                        <div className="flex flex-col items-end">
                            <span className="text-[11px] font-bold text-gray-700 uppercase tracking-wide">{data.financeiro.forma_pagamento_resumo || 'Em Aberto'}</span>
                            {data.financeiro.tem_carne && (
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded mt-0.5 ${isQuitado ? 'text-green-600 bg-green-50' : isAtrasado ? 'text-red-600 bg-red-50' : 'text-amber-600 bg-amber-50'}`}>
                                    {data.financeiro.status_geral}
                                </span>
                            )}
                        </div>
                    </div>
                    {isOpen ? <ChevronUp className="h-6 w-6 text-gray-400" /> : <ChevronDown className="h-6 w-6 text-gray-400" />}
                </div>
            </div>
            {isOpen && (
                <div className="p-5 border-t border-gray-100 animate-in slide-in-from-top-2 bg-white">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                        <div className="lg:col-span-7 space-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Produtos Adquiridos</p>
                                <div className="bg-gray-50 rounded-lg border border-gray-200 overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100 text-gray-500 font-bold text-[10px] uppercase">
                                            <tr>
                                                <th className="px-3 py-2">Descrição</th>
                                                <th className="px-3 py-2 text-center">Qtd.</th>
                                                <th className="px-3 py-2 text-right">Vl. Unit.</th>
                                                <th className="px-3 py-2 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {data.itens.map((item, idx) => (
                                                <tr key={idx}>
                                                    <td className="px-3 py-2 font-medium text-gray-700">{item.descricao}</td>
                                                    <td className="px-3 py-2 text-center text-gray-500">{item.quantidade}</td>
                                                    <td className="px-3 py-2 text-right text-gray-500">{formatMoney(item.valor_unitario)}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-blue-600">{formatMoney(item.valor_total)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            {data.financeiro.tem_carne && data.financeiro.parcelas_detalhes.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-wider">Parcelamento (Carnê)</p>
                                    <div className="flex gap-2 overflow-x-auto pb-2">
                                        {data.financeiro.parcelas_detalhes.map((p) => (
                                            <div key={p.numero} className={`flex-shrink-0 p-2 rounded border min-w-[100px] text-center ${p.status === 'Pago' ? 'bg-green-50 border-green-200' : new Date(p.vencimento) < new Date() ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase">{p.numero}ª Parc</p>
                                                <p className="font-bold text-sm text-gray-800">{formatMoney(p.valor)}</p>
                                                <p className={`text-[10px] ${p.status === 'Pago' ? 'text-green-600 font-bold' : 'text-gray-400'}`}>
                                                    {new Date(p.vencimento).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                        <div className="lg:col-span-5 space-y-4">
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 h-full">
                                <p className="text-[10px] font-bold text-blue-400 uppercase mb-3 flex items-center gap-1 tracking-wider"><Eye className="h-3 w-3" /> DADOS DA RECEITA USADA</p>
                                {data.tecnico ? (
                                    <div className="space-y-4">
                                        <div className="flex justify-between text-sm items-baseline border-b border-blue-100 pb-2">
                                            <span className="text-gray-500">Médico:</span>
                                            <span className="font-bold text-blue-900 text-right">{data.tecnico.medico}</span>
                                        </div>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <div className="text-[9px] font-bold text-blue-300 uppercase">Olho</div>
                                            <div className="text-[9px] font-bold text-blue-300 uppercase">Esf / Cil</div>
                                            <div className="text-[9px] font-bold text-blue-300 uppercase">Adição</div>
                                            <div className="font-black text-blue-600 text-sm">OD</div>
                                            <div className="bg-white rounded py-1 px-2 text-sm font-mono shadow-sm text-gray-700">{data.tecnico.longe_od}</div>
                                            <div className="bg-white rounded py-1 px-2 text-sm font-mono shadow-sm text-gray-700 row-span-2 flex items-center justify-center font-bold">{data.tecnico.adicao}</div>
                                            <div className="font-black text-blue-600 text-sm">OE</div>
                                            <div className="bg-white rounded py-1 px-2 text-sm font-mono shadow-sm text-gray-700">{data.tecnico.longe_oe}</div>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center justify-center h-32 text-blue-300"><Eye className="h-8 w-8 opacity-50 mb-2" /><p className="text-xs italic">Venda sem grau (Solar/Balcão)</p></div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ATUALIZAÇÃO 2: Exibindo a observação do cadastro na parte inferior do card */}
                    {customerObs && (
                        <div className="mt-6 pt-4 border-t border-gray-100">
                            <p className="text-[10px] font-bold text-red-600 uppercase mb-2 flex items-center gap-1 tracking-wider">
                                <AlertTriangle className="h-3 w-3" /> Observações do Cadastro
                            </p>
                            <div className="bg-red-50 text-red-900 text-xs p-3 rounded-lg border border-red-100 font-medium">
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
    const router = useRouter()
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
        // TRAVA DE SEGURANÇA OPCIONAL (Descomente se quiser IMPEDIR a venda)
        // if (selectedCustomer.tem_pendencia) {
        //    if(!confirm("Este cliente tem dívidas atrasadas. Deseja prosseguir mesmo assim?")) return;
        // }

        startCreateTransition(async () => {
            const result = await createNewVenda(selectedCustomer.id, parseInt(selectedEmployeeId))
            if (result.success && result.data) {
                router.push(`/dashboard/loja/${storeId}/vendas/${result.data.id}/experimental`)
            } else {
                alert(result.message || 'Erro ao criar venda.')
            }
        })
    }

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-100 overflow-hidden">

            <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center shrink-0 shadow-sm z-30 h-10">
                <ShoppingCart className="h-4 w-4 text-gray-700 mr-2" />
                <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">Atendimento</span>
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-3 flex items-center gap-4 shrink-0 shadow-lg z-20">
                <h1 className="text-base font-bold text-white whitespace-nowrap flex-shrink-0">
                    Selecione o cliente
                </h1>

                <div className="flex-1 max-w-lg relative">
                    <div className="relative">
                        <input
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            disabled={!!selectedCustomer}
                            className={`w-full h-10 rounded-xl border-0 pl-10 pr-10 shadow-md focus:ring-2 focus:ring-blue-300 text-gray-800 font-bold ${selectedCustomer ? 'bg-blue-50 text-blue-900' : 'bg-white'}`}
                            placeholder={selectedCustomer ? '' : "Busque por nome ou CPF..."}
                        />
                        <Search className={`absolute left-3 top-2.5 h-5 w-5 ${selectedCustomer ? 'text-blue-600' : 'text-gray-400'}`} />

                        {selectedCustomer && (
                            <button onClick={handleClear} className="absolute right-2 top-2 p-1 hover:bg-blue-200 rounded-full text-blue-500">
                                <X className="h-4 w-4" />
                            </button>
                        )}

                        {isSearching && !selectedCustomer && (
                            <Loader2 className="absolute right-3 top-2.5 h-5 w-5 text-blue-500 animate-spin" />
                        )}
                    </div>

                    {/* DROPDOWN DE RESULTADOS + BOTÃO NOVO CADASTRO */}
                    {!selectedCustomer && (query.length >= 2 || customers.length > 0) && (
                        <div className="absolute top-full left-0 w-full mt-2 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
                            <div className="max-h-60 overflow-y-auto">
                                {customers.map((cust) => (
                                    <button
                                        key={cust.id}
                                        onClick={() => handleSelectCustomer(cust)}
                                        className="w-full text-left px-4 py-3 hover:bg-blue-50 border-b border-gray-50 last:border-0 flex justify-between items-center group transition-colors"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-bold text-gray-800 text-sm group-hover:text-blue-700">{cust.full_name}</p>
                                                {/* Ícone pequeno na lista de busca também */}
                                                {cust.tem_pendencia && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-bold">DEVEDOR</span>}
                                            </div>
                                            <p className="text-xs text-gray-500">CPF: {cust.cpf || 'N/A'}</p>
                                        </div>
                                        <PlusCircle className="h-5 w-5 text-gray-300 group-hover:text-blue-500" />
                                    </button>
                                ))}

                                {/* OPÇÃO FIXA: CADASTRAR NOVO */}
                                <button
                                    onClick={() => setIsQuickModalOpen(true)}
                                    className="w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold flex items-center gap-2 border-t border-blue-100"
                                >
                                    <UserPlus className="h-5 w-5" />
                                    <span>+ Cadastrar Novo: "{query}"</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-3 ml-auto flex-shrink-0">
                    <div className={`transition-opacity duration-300 ${selectedCustomer ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                        <div className="relative">
                            <Briefcase className="absolute left-3 top-2.5 h-5 w-5 text-white/70" />
                            <select
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                                className="w-40 h-10 pl-10 rounded-lg border-0 focus:ring-white focus:border-white/50 bg-white/20 text-white font-medium cursor-pointer placeholder-white/70"
                            >
                                <option value="" disabled className="text-gray-700">Vendedor</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id} className="text-gray-800">{emp.full_name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <button
                        onClick={handleStartVenda}
                        disabled={!selectedCustomer || !selectedEmployeeId || isCreating}
                        className={`
                        flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all transform active:scale-95 whitespace-nowrap
                        ${(!selectedCustomer || !selectedEmployeeId)
                                ? 'bg-white/10 text-white/50 cursor-not-allowed shadow-none'
                                : 'bg-green-500 hover:bg-green-400 text-white border border-green-400'
                            }
                    `}
                    >
                        {isCreating ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
                        INICIAR NOVA VENDA
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
                {selectedCustomer ? (
                    <div className="max-w-5xl mx-auto space-y-6 animate-in slide-in-from-bottom-4 duration-500">

                        {/* ===== CABEÇALHO DO CLIENTE ===== */}
                        <div className="flex justify-between items-end border-b border-gray-300 pb-2">
                            <div>
                                <h2 className="text-3xl font-black text-gray-800">{selectedCustomer.full_name}</h2>
                                <p className="text-gray-500 text-sm">Histórico Recente</p>
                            </div>
                            {selectedCustomer.obs_debito && (
                                <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1 border border-red-200">
                                    <AlertTriangle className="h-3 w-3" />
                                    {selectedCustomer.obs_debito}
                                </span>
                            )}
                        </div>

                        {/* ===== NOVO: ALERTA DE DÍVIDA (AQUI) ===== */}
                        {selectedCustomer.tem_pendencia && (
                            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg shadow-sm flex items-start gap-3 animate-pulse">
                                <div className="p-2 bg-red-100 rounded-full text-red-600">
                                    <Ban className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-red-700">Atenção: Cliente Inadimplente</h3>
                                    <p className="text-sm text-red-600 mt-1">
                                        Este cliente possui parcelas vencidas no sistema. Verifique a situação financeira antes de prosseguir com uma nova venda a prazo.
                                    </p>
                                </div>
                            </div>
                        )}
                        {/* ========================================= */}

                        {loadingHistory ? (
                            <div className="flex flex-col items-center justify-center h-40 space-y-2 text-gray-400">
                                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                                <p className="text-sm">Buscando histórico completo...</p>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="bg-white rounded-2xl p-8 text-center border border-dashed border-gray-300 shadow-sm">
                                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-400">
                                    <PlusCircle className="h-8 w-8" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-700">Primeira Compra?</h3>
                                <p className="text-gray-500 text-sm mt-1">Não encontramos vendas anteriores para este cliente.</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Últimas Vendas</h3>
                                {history.map((item) => (
                                    <HistoryCard key={item.venda_id} data={item} customerObs={selectedCustomer.obs_debito} />
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center opacity-50">
                        <div className="w-24 h-24 bg-gray-200 rounded-full flex items-center justify-center mb-6">
                            <Search className="h-10 w-10 text-gray-400" />
                        </div>
                        <h2 className="text-2xl font-bold text-gray-600">Inicie um Atendimento</h2>
                        <p className="text-gray-500 mt-2 max-w-sm">
                            Busque o cliente acima para carregar o dossiê financeiro e técnico antes de abrir a venda.
                        </p>
                    </div>
                )}
            </div>

            {/* Modal de Cadastro Rápido */}
            <QuickCustomerModal
                isOpen={isQuickModalOpen}
                onClose={() => setIsQuickModalOpen(false)}
                storeId={storeId}
                initialName={query}
                onSuccess={handleQuickSuccess}
            />
        </div>
    )
}