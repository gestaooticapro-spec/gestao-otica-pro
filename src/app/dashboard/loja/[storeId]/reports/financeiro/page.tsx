'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, CreditCard, Banknote, Calendar, Receipt, TrendingUp, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getFinanceiroMetrics } from '@/lib/actions/reports.actions';

export default function FinanceiroReportPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();

    const [month, setMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [year, setYear] = useState<string>(new Date().getFullYear().toString());
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!storeId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await getFinanceiroMetrics(storeId, month, year);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas financeiras:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId, month, year]);

    return (
        <div className="min-h-full relative flex flex-col p-6 lg:p-10 z-0">
            {/* Background */}
            <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
            </div>

            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Cabeçalho */}
            <div className="mb-8 max-w-7xl mx-auto w-full animate-in slide-in-from-top-5 duration-700">
                <button
                    onClick={() => router.push(`/dashboard/loja/${storeId}/reports`)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm font-bold uppercase tracking-wider group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Voltar para Relatórios
                </button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-blue-500/20 rounded-xl ring-1 ring-blue-500/30 backdrop-blur-md">
                            <CreditCard className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Caixa & Banco</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Visão de recebimentos, pagamentos e valores a receber no cartão</p>
                        </div>
                    </div>

                    {/* Filtros */}
                    <div className="flex items-center gap-3 bg-black/30 p-2 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <div className="flex items-center gap-2 px-3 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Período:</span>
                        </div>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2 shadow-inner outline-none"
                        >
                            <option value="01">Janeiro</option>
                            <option value="02">Fevereiro</option>
                            <option value="03">Março</option>
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
                    <p className="text-slate-400 font-medium">Buscando transações do período...</p>
                </div>
            ) : metrics ? (
                <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-700">

                    {/* Linha 1: Recebimentos Totais */}
                    <div className="lg:col-span-4 bg-gradient-to-r from-emerald-900/40 via-blue-900/20 to-slate-900/40 border border-emerald-500/20 rounded-3xl p-8 backdrop-blur-md shadow-[0_0_30px_rgba(16,185,129,0.1)] flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-3 mb-2">
                                <div className="p-2 bg-emerald-500/20 rounded-lg"><TrendingUp className="w-5 h-5 text-emerald-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-sm">Recebimentos Totais do Período</h3>
                            </div>
                            <p className="text-5xl font-black text-white">{formatCurrency(metrics.recebidoTotal)}</p>
                        </div>
                    </div>

                    {/* Linha 2: Quebra de Recebimentos */}
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
                            <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs">Passado no Cartão</h3>
                        </div>
                        <p className="text-3xl font-black text-blue-400">{formatCurrency(metrics.recebidoCartao)}</p>
                    </div>

                    <div className="bg-gradient-to-br from-indigo-900/30 to-slate-900/40 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-md">
                        <div className="flex items-center gap-3 mb-4">
                            <Receipt className="w-5 h-5 text-indigo-400" />
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Cartão: A Receber da Adquirente</h3>
                        </div>
                        <p className="text-3xl font-black text-white">{formatCurrency(metrics.cartaoAReceber)}</p>
                    </div>

                    {/* Despesas */}
                    <div className="lg:col-span-4 grid grid-cols-1 lg:grid-cols-3 gap-6 mt-2">
                        <div className="lg:col-span-1 bg-rose-950/20 border border-rose-500/20 rounded-3xl p-6 backdrop-blur-md">
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs mb-4">Pagamentos Efetuados (Despesas)</h3>
                            <p className="text-4xl font-black text-rose-400">{formatCurrency(metrics.despesasTotal)}</p>
                        </div>

                        <div className="lg:col-span-2 bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md">
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs mb-4">Despesas por Categoria</h3>

                            {metrics.categoriasOrdenadas && metrics.categoriasOrdenadas.length > 0 ? (
                                <div className="space-y-3">
                                    {metrics.categoriasOrdenadas.map((cat: any, i: number) => {
                                        const percentage = metrics.despesasTotal > 0 ? (cat.value / metrics.despesasTotal) * 100 : 0;
                                        return (
                                            <div key={i} className="flex items-center justify-between">
                                                <div className="flex-1">
                                                    <div className="flex justify-between text-sm mb-1">
                                                        <span className="text-slate-300">{cat.name}</span>
                                                        <span className="font-mono text-slate-400">{formatCurrency(cat.value)}</span>
                                                    </div>
                                                    <div className="w-full bg-slate-800 rounded-full h-1.5">
                                                        <div className="bg-rose-500 h-1.5 rounded-full" style={{ width: `${percentage}%` }}></div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-slate-500 text-sm">Nenhuma despesa paga no período selecionado.</p>
                            )}
                        </div>
                    </div>

                </div>
            ) : null}
        </div>
    );
}
