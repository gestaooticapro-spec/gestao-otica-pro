'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Banknote, AlertTriangle, ShieldX, TrendingDown, Clock } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getParcelamentoMetrics } from '@/lib/actions/reports.actions';

export default function ParcelamentoReportPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();

    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!storeId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await getParcelamentoMetrics(storeId);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas de parcelamento:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId]);

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

                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-rose-500/20 rounded-xl ring-1 ring-rose-500/30 backdrop-blur-md">
                        <Banknote className="w-8 h-8 text-rose-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Análise de Parcelamento</h1>
                        <p className="text-slate-400 text-sm font-medium mt-1">Visão geral do crediário próprio, inadimplência e recuperações</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 animate-spin text-rose-500 mb-4" />
                        <p className="text-slate-400 font-medium">Analisando carteira de crédito...</p>
                    </div>
                ) : metrics ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-700">
                        {/* Indicador 1: Total A Receber */}
                        <div className="bg-gradient-to-br from-blue-600/10 to-slate-900/40 border border-blue-500/20 rounded-3xl p-6 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Total a Receber (Vincendas)</h3>
                                <div className="p-2 bg-blue-500/10 rounded-lg"><Clock className="w-5 h-5 text-blue-400" /></div>
                            </div>
                            <p className="text-4xl font-black text-white">{formatCurrency(metrics.vincendasValor)}</p>
                            <p className="text-blue-400/80 text-sm mt-2 font-medium">{metrics.vincendasQtd} parcelas no futuro</p>
                        </div>

                        {/* Indicador 2: Atrasadas */}
                        <div className="bg-gradient-to-br from-rose-600/20 to-slate-900/40 border border-rose-500/30 rounded-3xl p-6 backdrop-blur-md shadow-[0_0_30px_rgba(225,29,72,0.1)]">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Inadimplência (Atrasadas)</h3>
                                <div className="p-2 bg-rose-500/20 rounded-lg"><AlertTriangle className="w-5 h-5 text-rose-400" /></div>
                            </div>
                            <p className="text-4xl font-black text-rose-400">{formatCurrency(metrics.atrasadasValor)}</p>
                            <p className="text-rose-300/80 text-sm mt-2 font-medium">{metrics.atrasadasQtd} parcelas vencidas</p>
                        </div>

                        {/* Indicador 3: Perdidas / Renegociar */}
                        <div className="bg-gradient-to-br from-amber-600/10 to-slate-900/40 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">+90 Dias (Risco Crítico)</h3>
                                <div className="p-2 bg-amber-500/10 rounded-lg"><TrendingDown className="w-5 h-5 text-amber-400" /></div>
                            </div>
                            <p className="text-4xl font-black text-amber-400">{formatCurrency(metrics.perdidasValor)}</p>
                            <p className="text-amber-400/80 text-sm mt-2 font-medium">{metrics.perdidasQtd} parcelas muito antigas</p>
                        </div>

                        {/* Painel Inferior Largo */}
                        <div className="lg:col-span-3 bg-black/40 border border-white/10 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col md:flex-row gap-8 items-center justify-between">
                            <div className="flex-1 flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <ShieldX className="w-6 h-6 text-slate-400" />
                                    <h3 className="text-xl font-bold text-white tracking-tight">Clientes Restritos (SCPC)</h3>
                                </div>
                                <p className="text-slate-400 text-sm">
                                    Esta é a quantidade de clientes que estão marcados no sistema com restrição ativa (SCPC).
                                    Você pode gerenciar essas marcações direto pelo cadastro de clientes.
                                </p>
                            </div>

                            <div className="flex-shrink-0 flex items-center justify-center w-32 h-32 rounded-full border-4 border-slate-700 bg-slate-800/50 shadow-inner">
                                <div className="text-center">
                                    <span className="block text-3xl font-black text-white">{metrics.clientesSpc}</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Registros</span>
                                </div>
                            </div>
                        </div>

                    </div>
                ) : null}
            </div>
        </div>
    );
}
