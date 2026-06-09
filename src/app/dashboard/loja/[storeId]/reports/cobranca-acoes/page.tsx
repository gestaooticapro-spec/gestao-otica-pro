'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Loader2, Megaphone, Calendar, PhoneCall, CheckCircle, TrendingUp, Users } from 'lucide-react';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getCobrancaMetrics } from '@/lib/actions/reports.actions';
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';
import ModuleDisabledState from '@/components/modules/ModuleDisabledState';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend
} from 'recharts';

const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#06b6d4', '#8b5cf6'];

export default function CobrancaReportPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();
    const modules = useStoreModules();

    const [month, setMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [year, setYear] = useState<string>(new Date().getFullYear().toString());
    const [metrics, setMetrics] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!storeId || !modules.installments) return;

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
    }, [storeId, month, year, modules.installments]);

    if (!modules.installments) {
        return <ModuleDisabledState storeId={storeId} moduleLabel="Parcelamento" backHref={`/dashboard/loja/${storeId}/reports`} />;
    }

    return (
        <div className="min-h-full relative flex flex-col p-6 lg:p-10 z-0">
            {/* Background */}
            <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/cob.jpeg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
            </div>

            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Cabeçalho */}
            <div className="mb-8 max-w-7xl mx-auto w-full animate-in slide-in-from-top-5 duration-700">
                <Link
                    href={`/dashboard/loja/${storeId}?menu=gerencia`}
                    className="p-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95 w-fit"
                    title="Voltar para o Painel"
                >
                    <ArrowLeft className="h-5 w-5" />
                </Link>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-red-500/20 rounded-xl ring-1 ring-red-500/30 backdrop-blur-md shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                            <Megaphone className="w-8 h-8 text-red-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Ações de Cobrança</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Estatísticas de contatos e taxa de conversão em pagamentos</p>
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
                    <p className="text-slate-400 font-medium">Analisando histórico de cobranças e pagamentos...</p>
                </div>
            ) : metrics ? (
                <div className="max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-700 pb-10">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                        {/* Total de Contatos */}
                        <div className="bg-black/40 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-indigo-500/20 rounded-lg"><PhoneCall className="w-5 h-5 text-indigo-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Total de Ações</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <p className="text-5xl font-black text-white">{metrics.totalAcionamentos}</p>
                                <p className="text-indigo-400/80 text-sm mt-1 font-medium">contatos registrados no período</p>
                            </div>
                        </div>

                        {/* Cobranças Bem Sucedidas */}
                        <div className="bg-black/40 border border-emerald-500/20 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-emerald-500/20 rounded-lg"><CheckCircle className="w-5 h-5 text-emerald-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Ações Bem-Sucedidas</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <p className="text-5xl font-black text-emerald-400">{metrics.cobrancasComSucesso}</p>
                                <p className="text-emerald-300/80 text-sm mt-1 font-medium">contatos que resultaram em pagamento</p>
                            </div>
                        </div>

                        {/* Taxa de Conversão */}
                        <div className="bg-gradient-to-br from-orange-900/30 to-black/40 border border-orange-500/30 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full shadow-[0_0_30px_rgba(249,115,22,0.05)] relative overflow-hidden">
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-orange-500/20 rounded-lg"><TrendingUp className="w-5 h-5 text-orange-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Eficácia (Conversão)</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <div className="flex items-baseline gap-1">
                                    <p className="text-5xl font-black text-orange-400">{metrics.sucessoRate}</p>
                                    <span className="text-2xl font-bold text-orange-400/70">%</span>
                                </div>
                                <p className="text-slate-400 text-sm mt-1 leading-relaxed">Taxa de sucesso das ações de cobrança</p>
                            </div>
                        </div>

                    </div>

                    {/* Gráficos e Detalhes */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Evolução de Contatos Diários */}
                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md flex flex-col col-span-1 lg:col-span-2">
                            <div className="flex items-center gap-2 mb-6">
                                <Calendar className="w-5 h-5 text-slate-400" />
                                <h3 className="text-slate-300 font-bold text-sm uppercase tracking-widest">Evolução do Esforço e Sucesso</h3>
                            </div>

                            {metrics.timelineData.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-10">
                                    <p className="text-sm">Sem histórico no período.</p>
                                </div>
                            ) : (
                                <div className="h-[280px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={metrics.timelineData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                                            <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                            />
                                            <Legend verticalAlign="top" height={36} iconType="circle" />
                                            <Line type="monotone" dataKey="contatos" name="Contatos Feitos" stroke="#ef4444" strokeWidth={3} dot={{ r: 4, fill: '#ef4444', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                            <Line type="monotone" dataKey="sucessos" name="Resultaram Pagos" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {/* Interações por Tipo */}
                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                                <PhoneCall className="w-5 h-5 text-slate-400" />
                                <h3 className="text-slate-300 font-bold text-sm uppercase tracking-widest">Canais Utilizados</h3>
                            </div>

                            {metrics.interacoesByType.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 min-h-[250px]">
                                    <p className="text-sm">Nenhum canal registrado.</p>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col h-[280px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={metrics.interacoesByType}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {metrics.interacoesByType.map((entry: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                                itemStyle={{ color: '#fff' }}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>

                                    <div className="grid grid-cols-2 gap-2 mt-4">
                                        {metrics.interacoesByType.map((entry: any, index: number) => (
                                            <div key={index} className="flex items-center gap-2 text-xs">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                                <span className="text-slate-300 truncate">{entry.name} <span className="text-slate-500 font-bold">({entry.value})</span></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
