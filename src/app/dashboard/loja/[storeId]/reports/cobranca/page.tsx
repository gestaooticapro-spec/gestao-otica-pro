'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Calendar, PhoneCall, CheckCircle2, XCircle, Award } from 'lucide-react';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getCobrancaMetrics } from '@/lib/actions/reports.actions';

export default function CobrancaReportPage() {
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
                const data = await getCobrancaMetrics(storeId, month, year);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas de cobrança:", error);
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
                        <div className="p-3 bg-red-500/20 rounded-xl ring-1 ring-red-500/30 backdrop-blur-md">
                            <PhoneCall className="w-8 h-8 text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Cobrança e Inadimplência</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Produtividade de acionamentos e acordos gerados</p>
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 p-2 shadow-inner outline-none"
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-red-500 focus:border-red-500 p-2 shadow-inner outline-none"
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
                    <Loader2 className="w-10 h-10 animate-spin text-red-500 mb-4" />
                    <p className="text-slate-400 font-medium">Buscando histórico de acionamentos...</p>
                </div>
            ) : metrics ? (
                <div className="max-w-7xl mx-auto w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-700">

                    {/* Acionamentos */}
                    <div className="bg-black/40 border border-red-500/20 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full relative overflow-hidden group shadow-[0_0_30px_rgba(239,68,68,0.05)] text-center">
                        <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-4">Total de Acionamentos</h3>
                        <p className="text-6xl font-black text-white">{metrics.totalAcionamentos}</p>
                        <p className="text-sm text-slate-500 mt-2">Contatos realizados via sistema</p>
                    </div>

                    {/* Promessas */}
                    <div className="bg-black/40 border border-emerald-500/20 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full relative text-center">
                        <div className="absolute top-4 right-4">
                            <CheckCircle2 className="w-6 h-6 text-emerald-500/50" />
                        </div>
                        <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-4">Promessas de Pagamento</h3>
                        <p className="text-6xl font-black text-emerald-400">{metrics.promessasPagamento}</p>
                        <p className="text-sm text-emerald-400/80 mt-2">Acordos bem-sucedidos</p>
                    </div>

                    {/* Sem Acordo */}
                    <div className="bg-black/40 border border-rose-500/20 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-full relative text-center">
                        <div className="absolute top-4 right-4">
                            <XCircle className="w-6 h-6 text-rose-500/50" />
                        </div>
                        <h3 className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-4">Sem Acordo</h3>
                        <p className="text-6xl font-black text-rose-400">{metrics.semAcordo}</p>
                        <p className="text-sm text-rose-400/80 mt-2">Recusas ou sem retorno</p>
                    </div>

                    {/* Ranking Operadores */}
                    <div className="lg:col-span-4 bg-black/40 border border-white/10 rounded-3xl p-6 lg:p-8 backdrop-blur-md mt-4">
                        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-white/5">
                            <div className="p-2 bg-blue-500/20 rounded-lg"><Award className="w-5 h-5 text-blue-400" /></div>
                            <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm">Produtividade por Operador</h3>
                        </div>

                        {metrics.rankingOperadores && metrics.rankingOperadores.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {metrics.rankingOperadores.map((op: any, i: number) => (
                                    <div key={i} className="flex items-center gap-4 bg-white/5 p-4 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center font-bold text-slate-300">
                                            {i + 1}º
                                        </div>
                                        <div>
                                            <p className="text-white font-medium">{op.nome}</p>
                                            <p className="text-sm text-slate-400">{op.quantidade} acionamentos</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-slate-500 py-10">Nenhum acionamento registrado pela equipe neste período.</p>
                        )}
                    </div>

                </div>
            ) : null}
        </div>
    );
}
