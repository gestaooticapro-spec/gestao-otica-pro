'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    Loader2,
    Banknote,
    AlertTriangle,
    ShieldX,
    TrendingDown,
    Clock,
    X,
    ExternalLink
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getParcelamentoMetrics, getParcelasAtrasadas, type ParcelaAtrasadaItem } from '@/lib/actions/reports.actions';

export default function ParcelamentoReportPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();

    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const [isAtrasadasOpen, setIsAtrasadasOpen] = useState(false);
    const [atrasadasLoading, setAtrasadasLoading] = useState(false);
    const [atrasadasError, setAtrasadasError] = useState<string | null>(null);
    const [atrasadasList, setAtrasadasList] = useState<ParcelaAtrasadaItem[]>([]);

    useEffect(() => {
        if (!storeId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const data = await getParcelamentoMetrics(storeId);
                setMetrics(data);
            } catch (error) {
                console.error('Erro ao buscar metricas de parcelamento:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId]);

    const handleOpenAtrasadas = async () => {
        setIsAtrasadasOpen(true);
        setAtrasadasLoading(true);
        setAtrasadasError(null);

        try {
            const data = await getParcelasAtrasadas(storeId);
            setAtrasadasList(data);
        } catch (error) {
            console.error('Erro ao buscar parcelas atrasadas:', error);
            setAtrasadasError('Nao foi possivel carregar a lista de parcelas vencidas.');
        } finally {
            setAtrasadasLoading(false);
        }
    };

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

                <div className="flex items-center gap-4 mb-8">
                    <div className="p-3 bg-rose-500/20 rounded-xl ring-1 ring-rose-500/30 backdrop-blur-md">
                        <Banknote className="w-8 h-8 text-rose-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Analise de Parcelamento</h1>
                        <p className="text-slate-400 text-sm font-medium mt-1">Visao geral do crediario proprio, inadimplencia e recuperacoes</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 animate-spin text-rose-500 mb-4" />
                        <p className="text-slate-400 font-medium">Analisando carteira de credito...</p>
                    </div>
                ) : metrics ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-700">
                        <div className="bg-gradient-to-br from-blue-600/10 to-slate-900/40 border border-blue-500/20 rounded-3xl p-6 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Total a Receber (Vincendas)</h3>
                                <div className="p-2 bg-blue-500/10 rounded-lg"><Clock className="w-5 h-5 text-blue-400" /></div>
                            </div>
                            <p className="text-4xl font-black text-white">{formatCurrency(metrics.vincendasValor)}</p>
                            <p className="text-blue-400/80 text-sm mt-2 font-medium">{metrics.vincendasQtd} parcelas no futuro</p>
                        </div>

                        <button
                            type="button"
                            onClick={handleOpenAtrasadas}
                            className="text-left bg-gradient-to-br from-rose-600/20 to-slate-900/40 border border-rose-500/30 rounded-3xl p-6 backdrop-blur-md shadow-[0_0_30px_rgba(225,29,72,0.1)] hover:border-rose-400/60 hover:shadow-[0_0_36px_rgba(225,29,72,0.2)] transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Inadimplencia (Atrasadas)</h3>
                                <div className="p-2 bg-rose-500/20 rounded-lg"><AlertTriangle className="w-5 h-5 text-rose-400" /></div>
                            </div>
                            <p className="text-4xl font-black text-rose-400">{formatCurrency(metrics.atrasadasValor)}</p>
                            <p className="text-rose-300/80 text-sm mt-2 font-medium">{metrics.atrasadasQtd} parcelas vencidas</p>
                            <p className="text-rose-200/70 text-[11px] mt-2 uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity">
                                Clique para listar
                            </p>
                        </button>

                        <div className="bg-gradient-to-br from-amber-600/10 to-slate-900/40 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-md">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">+90 Dias (Risco Critico)</h3>
                                <div className="p-2 bg-amber-500/10 rounded-lg"><TrendingDown className="w-5 h-5 text-amber-400" /></div>
                            </div>
                            <p className="text-4xl font-black text-amber-400">{formatCurrency(metrics.perdidasValor)}</p>
                            <p className="text-amber-400/80 text-sm mt-2 font-medium">{metrics.perdidasQtd} parcelas muito antigas</p>
                        </div>

                        <div className="lg:col-span-3 bg-black/40 border border-white/10 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col md:flex-row gap-8 items-center justify-between">
                            <div className="flex-1 flex flex-col gap-2">
                                <div className="flex items-center gap-3">
                                    <ShieldX className="w-6 h-6 text-slate-400" />
                                    <h3 className="text-xl font-bold text-white tracking-tight">Clientes Restritos (SCPC)</h3>
                                </div>
                                <p className="text-slate-400 text-sm">
                                    Esta e a quantidade de clientes marcados no sistema com restricao ativa (SCPC).
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

            {isAtrasadasOpen && (
                <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="w-full max-w-5xl bg-slate-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 bg-white/5">
                            <div>
                                <h2 className="text-lg font-black text-white">Parcelas Vencidas</h2>
                                <p className="text-xs text-slate-400 mt-1">Mesmo criterio do card de inadimplencia (ate 90 dias).</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsAtrasadasOpen(false)}
                                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                                aria-label="Fechar"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
                            {atrasadasLoading ? (
                                <div className="p-10 flex items-center justify-center gap-3 text-slate-400">
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                    Carregando parcelas...
                                </div>
                            ) : atrasadasError ? (
                                <div className="p-8 text-center text-rose-300">{atrasadasError}</div>
                            ) : atrasadasList.length === 0 ? (
                                <div className="p-8 text-center text-slate-400">Nenhuma parcela vencida nesse criterio.</div>
                            ) : (
                                <table className="w-full text-sm">
                                    <thead className="bg-white/5 text-slate-400 uppercase text-[11px] tracking-wider sticky top-0">
                                        <tr>
                                            <th className="text-left px-4 py-3">Cliente</th>
                                            <th className="text-left px-4 py-3">Parcela</th>
                                            <th className="text-left px-4 py-3">Vencimento</th>
                                            <th className="text-left px-4 py-3">Dias atraso</th>
                                            <th className="text-right px-4 py-3">Valor</th>
                                            <th className="text-right px-4 py-3">Venda</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {atrasadasList.map((item) => (
                                            <tr key={item.id} className="border-t border-white/5 hover:bg-white/[0.03]">
                                                <td className="px-4 py-3 text-slate-200 font-semibold">{item.customer_name}</td>
                                                <td className="px-4 py-3 text-slate-300">{item.numero_parcela}a</td>
                                                <td className="px-4 py-3 text-slate-300">
                                                    {new Date(item.data_vencimento).toLocaleDateString('pt-BR', { timeZone: 'UTC' })}
                                                </td>
                                                <td className="px-4 py-3 text-rose-300 font-bold">{item.dias_atraso}</td>
                                                <td className="px-4 py-3 text-right text-rose-300 font-bold">{formatCurrency(item.valor_parcela)}</td>
                                                <td className="px-4 py-3 text-right">
                                                    {item.venda_id ? (
                                                        <button
                                                            type="button"
                                                            onClick={() => router.push(`/dashboard/loja/${storeId}/vendas/${item.venda_id}/experimental`)}
                                                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-blue-500/30 text-blue-300 hover:bg-blue-500/10 transition-colors"
                                                        >
                                                            #{item.venda_id}
                                                            <ExternalLink className="w-3.5 h-3.5" />
                                                        </button>
                                                    ) : (
                                                        <span className="text-xs text-slate-500">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
