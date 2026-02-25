'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Activity, Calendar, ArrowUpRight, ArrowDownRight, Glasses, EyeOff } from 'lucide-react';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getMovimentoMetrics } from '@/lib/actions/reports.actions';

export default function MovimentoReportPage() {
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
                const data = await getMovimentoMetrics(storeId, month, year);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas de movimento:", error);
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
                        <div className="p-3 bg-indigo-500/20 rounded-xl ring-1 ring-indigo-500/30 backdrop-blur-md">
                            <Activity className="w-8 h-8 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Movimento Operacional</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Estatísticas de entradas, saídas e sobras de produtos</p>
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2 shadow-inner outline-none"
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-indigo-500 focus:border-indigo-500 p-2 shadow-inner outline-none"
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
                    <Loader2 className="w-10 h-10 animate-spin text-indigo-500 mb-4" />
                    <p className="text-slate-400 font-medium">Buscando histórico de movimentação...</p>
                </div>
            ) : metrics ? (
                <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-700">

                    {/* Entradas */}
                    <div className="bg-black/40 border border-emerald-500/20 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="p-2 bg-emerald-500/20 rounded-lg group-hover:scale-110 transition-transform"><ArrowUpRight className="w-5 h-5 text-emerald-400" /></div>
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-sm">Entradas Totais</h3>
                        </div>
                        <div className="mt-auto relative z-10">
                            <p className="text-5xl font-black text-white">{metrics.entradasGerais}</p>
                            <p className="text-emerald-400/80 text-sm mt-2 font-medium">unidades recebidas no estoque</p>
                        </div>
                    </div>

                    {/* Saídas */}
                    <div className="bg-black/40 border border-rose-500/20 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                        <div className="flex items-center gap-3 mb-6 relative z-10">
                            <div className="p-2 bg-rose-500/20 rounded-lg group-hover:scale-110 transition-transform"><ArrowDownRight className="w-5 h-5 text-rose-400" /></div>
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-sm">Saídas Totais</h3>
                        </div>
                        <div className="mt-auto relative z-10">
                            <p className="text-5xl font-black text-rose-400">{metrics.saidasGerais}</p>
                            <p className="text-rose-300/80 text-sm mt-2 font-medium">unidades que saíram (venda, perda, envio)</p>
                        </div>
                    </div>

                    {/* Sobras que entraram */}
                    <div className="bg-gradient-to-br from-indigo-900/30 to-black/40 border border-indigo-500/30 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full shadow-[0_0_30px_rgba(99,102,241,0.05)]">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-500/20 rounded-lg"><EyeOff className="w-5 h-5 text-indigo-400" /></div>
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-sm">Sobras Retornadas</h3>
                        </div>
                        <div className="mt-auto">
                            <p className="text-4xl font-black text-indigo-300">{metrics.sobrasEntraram}</p>
                            <p className="text-slate-400 text-sm mt-2 leading-relaxed">
                                Lentes marcadas como "Sobra" que entraram no estoque durante o período.
                            </p>
                        </div>
                    </div>

                    {/* Sobras Vendidas */}
                    <div className="bg-gradient-to-br from-purple-900/40 to-black/40 border border-purple-500/40 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full shadow-[0_0_30px_rgba(168,85,247,0.1)]">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-purple-500/20 rounded-lg"><Glasses className="w-5 h-5 text-purple-400" /></div>
                            <h3 className="text-slate-300 font-bold uppercase tracking-widest text-sm">Lucro Direto (Sobras)</h3>
                        </div>
                        <div className="mt-auto">
                            <p className="text-4xl font-black text-purple-300">{metrics.sobrasVendidas}</p>
                            <p className="text-purple-300/80 text-sm mt-2 leading-relaxed">
                                Lentes de sobra que foram <strong>reaproveitadas e vendidas</strong> gerando lucro total.
                            </p>
                        </div>
                    </div>

                </div>
            ) : null}
        </div>
    );
}
