'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    CreditCard,
    Banknote,
    Calendar,
    Receipt,
    TrendingUp,
    DollarSign,
    ListFilter,
    Tags,
    ScrollText,
    Search
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getFinanceiroMetrics, type FinanceiroExpenseItem, type FinanceiroMetrics } from '@/lib/actions/reports.actions';

const ALL_FILTER = '__all__';

function normalizeText(value: string) {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .trim();
}

function formatDate(value: string | null) {
    if (!value) return '-';
    return new Intl.DateTimeFormat('pt-BR').format(new Date(value));
}

function getUniqueValues(items: FinanceiroExpenseItem[], key: 'category' | 'paymentMethod' | 'sourceLabel') {
    return Array.from(new Set(items.map((item) => item[key]).filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export default function FinanceiroReportPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();

    const [month, setMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [year, setYear] = useState<string>(new Date().getFullYear().toString());
    const [metrics, setMetrics] = useState<FinanceiroMetrics | null>(null);
    const [loading, setLoading] = useState(true);

    const [searchText, setSearchText] = useState('');
    const [selectedCategory, setSelectedCategory] = useState(ALL_FILTER);
    const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(ALL_FILTER);
    const [selectedSource, setSelectedSource] = useState(ALL_FILTER);

    useEffect(() => {
        if (!storeId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await getFinanceiroMetrics(storeId, month, year);
                setMetrics(data);
            } catch (error) {
                console.error('Erro ao buscar metricas financeiras:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId, month, year]);

    const monthlyExpenses = metrics?.despesasDetalhadas || [];
    const categoryOptions = getUniqueValues(monthlyExpenses, 'category');
    const paymentMethodOptions = getUniqueValues(monthlyExpenses, 'paymentMethod');
    const sourceOptions = getUniqueValues(monthlyExpenses, 'sourceLabel');

    const normalizedSearch = normalizeText(searchText);
    const filteredExpenses = monthlyExpenses.filter((expense) => {
        const matchesCategory = selectedCategory === ALL_FILTER || !categoryOptions.includes(selectedCategory) || expense.category === selectedCategory;
        const matchesPaymentMethod = selectedPaymentMethod === ALL_FILTER || !paymentMethodOptions.includes(selectedPaymentMethod) || expense.paymentMethod === selectedPaymentMethod;
        const matchesSource = selectedSource === ALL_FILTER || !sourceOptions.includes(selectedSource) || expense.sourceLabel === selectedSource;

        if (!matchesCategory || !matchesPaymentMethod || !matchesSource) return false;
        if (!normalizedSearch) return true;

        const searchableText = normalizeText([
            expense.description,
            expense.category,
            expense.paymentMethod,
            expense.sourceLabel,
        ].join(' '));

        return searchableText.includes(normalizedSearch);
    });

    const filteredExpensesTotal = filteredExpenses.reduce((acc, expense) => acc + expense.amountPaid, 0);
    const averageExpense = filteredExpenses.length > 0 ? filteredExpensesTotal / filteredExpenses.length : 0;

    const groupedCategoriesMap = new Map<string, { name: string; total: number; count: number }>();
    filteredExpenses.forEach((expense) => {
        const current = groupedCategoriesMap.get(expense.category);

        if (current) {
            current.total += expense.amountPaid;
            current.count += 1;
            return;
        }

        groupedCategoriesMap.set(expense.category, {
            name: expense.category,
            total: expense.amountPaid,
            count: 1,
        });
    });

    const groupedCategories = Array.from(groupedCategoriesMap.values())
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

    const hasActiveFilters = Boolean(
        normalizedSearch ||
        selectedCategory !== ALL_FILTER ||
        selectedPaymentMethod !== ALL_FILTER ||
        selectedSource !== ALL_FILTER
    );

    return (
        <div className="min-h-full relative flex flex-col p-6 lg:p-10 z-0">
            <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
            </div>

            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            <div className="mb-8 max-w-7xl mx-auto w-full animate-in slide-in-from-top-5 duration-700">
                <button
                    onClick={() => router.push(`/dashboard/loja/${storeId}/reports`)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm font-bold uppercase tracking-wider group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Voltar para Relatorios
                </button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/20 rounded-xl ring-1 ring-blue-500/30 backdrop-blur-md">
                            <CreditCard className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Caixa & Banco</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Lista mensal das saidas lancadas no fluxo de caixa com filtros visiveis</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-black/30 p-2 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <div className="flex items-center gap-2 px-3 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Periodo:</span>
                        </div>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 shadow-inner outline-none"
                        >
                            <option value="01">Janeiro</option>
                            <option value="02">Fevereiro</option>
                            <option value="03">Marco</option>
                            <option value="04">Abril</option>
                            <option value="05">Maio</option>
                            <option value="06">Junho</option>
                            <option value="07">Julho</option>
                            <option value="08">Agosto</option>
                            <option value="09">Setembro</option>
                            <option value="10">Outubro</option>
                            <option value="11">Novembro</option>
                            <option value="12">Dezembro</option>
                        </select>
                        <select
                            value={year}
                            onChange={(e) => setYear(e.target.value)}
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 shadow-inner outline-none"
                        >
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>
                    </div>
                </div>
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm max-w-7xl mx-auto w-full">
                    <Loader2 className="w-10 h-10 animate-spin text-blue-500 mb-4" />
                    <p className="text-slate-400 font-medium">Buscando lancamentos do periodo...</p>
                </div>
            ) : metrics ? (
                <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-700">
                    <div className="lg:col-span-4 bg-gradient-to-r from-emerald-900/40 via-blue-900/20 to-slate-900/40 border border-emerald-500/20 rounded-3xl p-8 backdrop-blur-md shadow-[0_0_30px_rgba(16,185,129,0.1)] flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-500/20 rounded-lg">
                                    <TrendingUp className="w-5 h-5 text-emerald-400" />
                                </div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-sm">Recebimentos Totais do Periodo</h3>
                            </div>
                            <p className="text-5xl font-black text-white">{formatCurrency(metrics.recebidoTotal)}</p>
                        </div>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4">
                            <Banknote className="w-5 h-5 text-emerald-400" />
                            <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs">Dinheiro Fisico</h3>
                        </div>
                        <p className="text-3xl font-black text-emerald-400">{formatCurrency(metrics.recebidoDinheiro)}</p>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4">
                            <DollarSign className="w-5 h-5 text-teal-400" />
                            <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs">PIX Direto</h3>
                        </div>
                        <p className="text-3xl font-black text-teal-400">{formatCurrency(metrics.recebidoPix)}</p>
                    </div>

                    <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4">
                            <CreditCard className="w-5 h-5 text-blue-400" />
                            <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs">Passado no Cartao</h3>
                        </div>
                        <p className="text-3xl font-black text-blue-400">{formatCurrency(metrics.recebidoCartao)}</p>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-900/30 to-slate-900/40 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4">
                            <Receipt className="w-5 h-5 text-indigo-400" />
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Cartao a Receber</h3>
                        </div>
                        <p className="text-3xl font-black text-white">{formatCurrency(metrics.cartaoAReceber)}</p>
                    </div>

                    <div className="lg:col-span-4 bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-5">
                            <div className="p-2 bg-rose-500/15 rounded-xl ring-1 ring-rose-400/20">
                                <ListFilter className="w-5 h-5 text-rose-300" />
                            </div>
                            <div>
                                <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm">Saidas do Fluxo no Mes</h3>
                                <p className="text-slate-400 text-sm mt-1">A tela abre com todos os lancamentos do mes. Depois voce refina com os filtros abaixo.</p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <label className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Buscar</span>
                                <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 shadow-inner">
                                    <Search className="w-4 h-4 text-slate-500" />
                                    <input
                                        value={searchText}
                                        onChange={(e) => setSearchText(e.target.value)}
                                        placeholder="Descricao do lancamento"
                                        className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 outline-none"
                                    />
                                </div>
                            </label>

                            <label className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Categoria</span>
                                <select
                                    value={selectedCategory}
                                    onChange={(e) => setSelectedCategory(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner outline-none"
                                >
                                    <option value={ALL_FILTER}>Todas as categorias</option>
                                    {categoryOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Forma</span>
                                <select
                                    value={selectedPaymentMethod}
                                    onChange={(e) => setSelectedPaymentMethod(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner outline-none"
                                >
                                    <option value={ALL_FILTER}>Todas as formas</option>
                                    {paymentMethodOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </label>

                            <label className="space-y-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Origem</span>
                                <select
                                    value={selectedSource}
                                    onChange={(e) => setSelectedSource(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-white shadow-inner outline-none"
                                >
                                    <option value={ALL_FILTER}>Todas as origens</option>
                                    {sourceOptions.map((option) => (
                                        <option key={option} value={option}>{option}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {hasActiveFilters && (
                            <div className="flex flex-wrap gap-2 mt-4">
                                {selectedCategory !== ALL_FILTER && (
                                    <button onClick={() => setSelectedCategory(ALL_FILTER)} className="px-3 py-1.5 rounded-full border border-rose-500/20 bg-rose-500/10 text-rose-200 text-xs font-semibold">
                                        Categoria: {selectedCategory} x
                                    </button>
                                )}
                                {selectedPaymentMethod !== ALL_FILTER && (
                                    <button onClick={() => setSelectedPaymentMethod(ALL_FILTER)} className="px-3 py-1.5 rounded-full border border-sky-500/20 bg-sky-500/10 text-sky-200 text-xs font-semibold">
                                        Forma: {selectedPaymentMethod} x
                                    </button>
                                )}
                                {selectedSource !== ALL_FILTER && (
                                    <button onClick={() => setSelectedSource(ALL_FILTER)} className="px-3 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-200 text-xs font-semibold">
                                        Origem: {selectedSource} x
                                    </button>
                                )}
                                {normalizedSearch && (
                                    <button onClick={() => setSearchText('')} className="px-3 py-1.5 rounded-full border border-amber-500/20 bg-amber-500/10 text-amber-200 text-xs font-semibold">
                                        Busca: {searchText} x
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="lg:col-span-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)] gap-6">
                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Total listado</p>
                                    <p className="mt-2 text-2xl font-black text-rose-300">{formatCurrency(filteredExpensesTotal)}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Lancamentos</p>
                                    <p className="mt-2 text-2xl font-black text-white">{filteredExpenses.length}</p>
                                </div>
                                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Ticket medio</p>
                                    <p className="mt-2 text-2xl font-black text-amber-300">{formatCurrency(averageExpense)}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between gap-4 mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-white/5 rounded-xl border border-white/10">
                                        <ScrollText className="w-5 h-5 text-slate-300" />
                                    </div>
                                    <div>
                                        <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm">Lista completa do periodo</h3>
                                        <p className="text-slate-500 text-xs mt-1">Ordenada do lancamento mais recente para o mais antigo.</p>
                                    </div>
                                </div>
                                <p className="text-sm text-slate-400">{filteredExpenses.length} item(ns)</p>
                            </div>

                            <div className="max-h-[34rem] overflow-y-auto space-y-3 pr-1">
                                {filteredExpenses.length > 0 ? (
                                    filteredExpenses.map((expense) => (
                                        <div key={expense.id} className="rounded-2xl border border-white/10 bg-gradient-to-r from-white/5 to-transparent p-4">
                                            <div className="grid grid-cols-1 lg:grid-cols-[120px_minmax(0,1fr)_150px] gap-4 items-start">
                                                <div>
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Data</p>
                                                    <p className="mt-1 text-sm font-semibold text-slate-200">{formatDate(expense.paymentDate)}</p>
                                                </div>

                                                <div className="min-w-0">
                                                    <p className="text-white font-bold text-base break-words">{expense.description}</p>
                                                    <div className="flex flex-wrap items-center gap-2 mt-2">
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-semibold text-slate-300">
                                                            <Tags className="w-3 h-3" />
                                                            {expense.category}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-[11px] font-semibold text-sky-200">
                                                            {expense.paymentMethod}
                                                        </span>
                                                        <span className="inline-flex items-center gap-1 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-2.5 py-1 text-[11px] font-semibold text-indigo-200">
                                                            {expense.sourceLabel}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="text-left lg:text-right">
                                                    <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Valor</p>
                                                    <p className="mt-1 text-2xl font-black text-rose-300">{formatCurrency(expense.amountPaid)}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-8 text-center">
                                        <p className="text-slate-300 font-semibold">Nenhum lancamento encontrado com os filtros atuais.</p>
                                        <p className="text-slate-500 text-sm mt-2">Limpe um ou mais filtros para voltar a ver a lista completa do mes.</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                            <div className="flex items-center gap-3 mb-5">
                                <div className="p-2 bg-indigo-500/15 rounded-xl ring-1 ring-indigo-400/20">
                                    <ScrollText className="w-5 h-5 text-indigo-300" />
                                </div>
                                <div>
                                    <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm">Resumo do Filtro</h3>
                                    <p className="text-slate-500 text-xs mt-1">As categorias abaixo seguem exatamente o que esta aparecendo na lista.</p>
                                </div>
                            </div>

                            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-indigo-900/30 to-slate-900/30 p-4 mb-5">
                                <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Visao rapida</p>
                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">Saidas do mes</span>
                                        <span className="font-black text-white">{formatCurrency(metrics.despesasTotal)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">Total listado</span>
                                        <span className="font-black text-rose-300">{formatCurrency(filteredExpensesTotal)}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-3">
                                        <span className="text-slate-400">Participacao</span>
                                        <span className="font-black text-indigo-200">
                                            {metrics.despesasTotal > 0 ? `${((filteredExpensesTotal / metrics.despesasTotal) * 100).toFixed(1)}%` : '0.0%'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                {groupedCategories.length > 0 ? (
                                    groupedCategories.map((group) => {
                                        const percentage = filteredExpensesTotal > 0 ? (group.total / filteredExpensesTotal) * 100 : 0;

                                        return (
                                            <div key={group.name} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                                                <div className="flex items-start justify-between gap-3 mb-2">
                                                    <div>
                                                        <p className="text-sm font-bold text-white leading-snug">{group.name}</p>
                                                        <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500 mt-1">{group.count} lancamento(s)</p>
                                                    </div>
                                                    <p className="text-sm font-mono text-slate-300">{formatCurrency(group.total)}</p>
                                                </div>
                                                <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                                    <div className="h-full rounded-full bg-indigo-400" style={{ width: `${percentage}%` }} />
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-6 text-center">
                                        <p className="text-slate-400 text-sm">Sem categorias para mostrar no filtro atual.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
