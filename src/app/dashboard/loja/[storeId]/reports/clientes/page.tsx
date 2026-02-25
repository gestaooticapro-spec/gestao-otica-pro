'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Users, Crown, UserMinus, Phone, ShieldAlert } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getClientesMetrics } from '@/lib/actions/reports.actions';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function ClientesReportPage() {
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
                const data = await getClientesMetrics(storeId);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas de clientes:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId]);

    const formatPhone = (phone: string | null) => {
        if (!phone) return '';
        const cl = phone.replace(/\D/g, '');
        if (cl.length === 11) {
            return `(${cl.substring(0, 2)}) ${cl.substring(2, 7)}-${cl.substring(7, 11)}`;
        }
        if (cl.length === 10) {
            return `(${cl.substring(0, 2)}) ${cl.substring(2, 6)}-${cl.substring(6, 10)}`;
        }
        return phone;
    };

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
                    <div className="p-3 bg-amber-500/20 rounded-xl ring-1 ring-amber-500/30 backdrop-blur-md">
                        <Users className="w-8 h-8 text-amber-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Clientes e Engajamento</h1>
                        <p className="text-slate-400 text-sm font-medium mt-1">Ranking VIP, clientes ausentes (churn) e contatos de pós-venda</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 animate-spin text-amber-500 mb-4" />
                        <p className="text-slate-400 font-medium">Analisando base de clientes...</p>
                    </div>
                ) : metrics ? (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in duration-700">

                        {/* Clientes VIP */}
                        <div className="bg-black/40 border border-amber-500/10 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-[600px] shadow-[0_0_30px_rgba(245,158,11,0.05)]">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-500/20 rounded-lg"><Crown className="w-5 h-5 text-amber-400" /></div>
                                    <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm">Ranking VIP (12 Meses)</h3>
                                </div>
                                <span className="text-xs text-slate-500">Mairoes Compradores</span>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                {metrics.rankingVip.map((cliente: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-white/5 to-transparent hover:from-white/10 transition-colors border border-white/5 relative overflow-hidden">
                                        {i < 3 && (
                                            <div className="absolute top-0 right-0 w-16 h-16 bg-amber-500/10 blur-xl rounded-full" />
                                        )}
                                        <div className="flex items-center gap-4 relative z-10">
                                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black text-sm
                                                ${i === 0 ? 'bg-amber-400 text-amber-950 shadow-[0_0_15px_rgba(251,191,36,0.5)]' :
                                                    i === 1 ? 'bg-slate-300 text-slate-900 shadow-[0_0_15px_rgba(203,213,225,0.4)]' :
                                                        i === 2 ? 'bg-orange-400 text-orange-950 shadow-[0_0_15px_rgba(251,146,60,0.4)]' :
                                                            'bg-white/5 text-slate-400 border border-white/10'}`}>
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className="text-white font-bold text-lg">{cliente.nome}</p>
                                                <p className="text-sm text-slate-400 flex items-center gap-1">
                                                    <Phone className="w-3 h-3" /> {formatPhone(cliente.telefone) || 'Sem telefone'}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="text-right relative z-10">
                                            <p className="text-amber-400 font-black text-xl">{formatCurrency(cliente.totalGasto)}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Risco de Churn */}
                        <div className="bg-black/40 border border-indigo-500/10 rounded-3xl p-6 lg:p-8 backdrop-blur-md flex flex-col h-[600px]">
                            <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-500/20 rounded-lg"><UserMinus className="w-5 h-5 text-indigo-400" /></div>
                                    <h3 className="text-slate-200 font-bold uppercase tracking-widest text-sm">Alerta de Sumiço (+1 Ano)</h3>
                                </div>
                                <div className="flex items-center gap-1 text-xs text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-md">
                                    <ShieldAlert className="w-3 h-3" />
                                    Boas Oportunidades
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                {metrics.clientesInativos.length > 0 ? metrics.clientesInativos.map((cliente: any, i: number) => (
                                    <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors border border-white/5 gap-4">
                                        <div className="flex-1">
                                            <p className="text-white font-bold">{cliente.nome}</p>
                                            <p className="text-sm text-slate-400 flex items-center gap-1 mt-1">
                                                <Phone className="w-3 h-3" /> {formatPhone(cliente.telefone) || 'S/N'}
                                            </p>
                                        </div>
                                        <div className="sm:text-right flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 border-white/5 pt-3 sm:pt-0">
                                            <p className="text-indigo-400 font-medium text-sm bg-indigo-500/10 px-3 py-1 rounded-full">
                                                {formatDistanceToNow(new Date(cliente.ultimaVenda), { locale: ptBR, addSuffix: true })}
                                            </p>
                                            <p className="text-xs text-slate-500 mt-1 sm:mt-2">
                                                Já gastou: <span className="text-slate-300 font-bold">{formatCurrency(cliente.totalGasto)}</span>
                                            </p>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="flex flex-col items-center justify-center p-10 text-slate-500 h-full">
                                        <UserMinus className="w-12 h-12 mb-4 opacity-50 text-indigo-400" />
                                        <p>Todos os clientes compraram recentemente!</p>
                                    </div>
                                )}
                            </div>
                        </div>

                    </div>
                ) : null}
            </div>
        </div>
    );
}
