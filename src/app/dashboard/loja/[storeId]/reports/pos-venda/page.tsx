'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, PhoneCall, Calendar, MessageCircle, Star, CheckCircle, Clock } from 'lucide-react';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getPosVendaMetrics } from '@/lib/actions/reports.actions';
import {
    BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
    PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts';

const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'];
const RATING_COLORS = ['#10b981', '#34d399', '#fbbf24', '#f87171', '#ef4444']; // 5 to 1 star colors

export default function PosVendaReportPage() {
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
                const data = await getPosVendaMetrics(storeId, month, year);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas de pós-venda:", error);
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
                <div className="absolute inset-0 bg-[url('/pos.jpeg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" />
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
                        <div className="p-3 bg-pink-500/20 rounded-xl ring-1 ring-pink-500/30 backdrop-blur-md">
                            <PhoneCall className="w-8 h-8 text-pink-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Análise de Pós-Venda</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">Estatísticas de contatos realizados e avaliação de satisfação</p>
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-pink-500 focus:border-pink-500 p-2 shadow-inner outline-none"
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-pink-500 focus:border-pink-500 p-2 shadow-inner outline-none"
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
                    <Loader2 className="w-10 h-10 animate-spin text-pink-500 mb-4" />
                    <p className="text-slate-400 font-medium">Analisando interações com clientes...</p>
                </div>
            ) : metrics ? (
                <div className="max-w-7xl mx-auto w-full space-y-6 animate-in fade-in duration-700 pb-10">

                    {/* KPI Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">

                        {/* Total Pós-Vendas */}
                        <div className="bg-black/40 border border-indigo-500/20 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-indigo-500/20 rounded-lg"><MessageCircle className="w-5 h-5 text-indigo-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Total Lançado</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <p className="text-4xl font-black text-white">{metrics.totalPosVendas}</p>
                                <p className="text-indigo-400/80 text-sm mt-1 font-medium">pós-vendas no período</p>
                            </div>
                        </div>

                        {/* Concluídos */}
                        <div className="bg-black/40 border border-emerald-500/20 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-emerald-500/20 rounded-lg"><CheckCircle className="w-5 h-5 text-emerald-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Concluídos</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <div className="flex items-end gap-3">
                                    <p className="text-4xl font-black text-emerald-400">{metrics.concluidos}</p>
                                    <span className="text-emerald-400/60 font-bold mb-1 text-sm bg-emerald-500/10 px-2 py-0.5 rounded-md">{metrics.taxaConclusao}% concluído</span>
                                </div>
                                <p className="text-emerald-300/80 text-sm mt-1 font-medium">acompanhamentos finalizados</p>
                            </div>
                        </div>

                        {/* Em Acompanhamento */}
                        <div className="bg-black/40 border border-amber-500/20 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full relative overflow-hidden group">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 blur-3xl -translate-y-1/2 translate-x-1/2 rounded-full" />
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-amber-500/20 rounded-lg"><Clock className="w-5 h-5 text-amber-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Em Andamento</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <p className="text-4xl font-black text-amber-400">{metrics.emAcompanhamento}</p>
                                <p className="text-amber-300/80 text-sm mt-1 font-medium">pendentes de conclusão</p>
                            </div>
                        </div>

                        {/* Nota Média */}
                        <div className="bg-gradient-to-br from-pink-900/30 to-black/40 border border-pink-500/30 rounded-3xl p-6 backdrop-blur-md flex flex-col h-full shadow-[0_0_30px_rgba(236,72,153,0.05)] relative overflow-hidden">
                            <div className="flex items-center gap-3 mb-4 relative z-10">
                                <div className="p-2 bg-pink-500/20 rounded-lg"><Star className="w-5 h-5 text-pink-400 fill-pink-400" /></div>
                                <h3 className="text-slate-300 font-bold uppercase tracking-widest text-xs">Satisfação Média</h3>
                            </div>
                            <div className="mt-auto relative z-10">
                                <div className="flex items-baseline gap-2">
                                    <p className="text-4xl font-black text-pink-300">{metrics.notaMedia}</p>
                                    <span className="text-slate-500 font-bold">/ 5.0</span>
                                </div>
                                <p className="text-slate-400 text-sm mt-1 leading-relaxed">Avaliação média dos clientes</p>
                            </div>
                        </div>

                    </div>

                    {/* Gráficos e Detalhes */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                        {/* Detalhamento de Avaliação */}
                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md flex flex-col col-span-1 lg:col-span-2">
                            <div className="flex items-center gap-2 mb-6">
                                <Star className="w-5 h-5 text-slate-400" />
                                <h3 className="text-slate-300 font-bold text-sm uppercase tracking-widest">Distribuição de Avaliações</h3>
                            </div>

                            {metrics.concluidos === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 min-h-[250px]">
                                    <Star className="w-8 h-8 opacity-20 mb-2" />
                                    <p className="text-sm">Nenhuma avaliação concluída no período.</p>
                                </div>
                            ) : (
                                <div className="h-[250px] w-full mt-4">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={metrics.avaliacoesDistribuidas}
                                            layout="vertical"
                                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                                        >
                                            <XAxis type="number" hide />
                                            <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} width={80} />
                                            <RechartsTooltip
                                                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                                contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                                itemStyle={{ color: '#fff' }}
                                                formatter={(value: any) => [`${value} avaliações`, 'Quantidade']}
                                            />
                                            <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={24}>
                                                {metrics.avaliacoesDistribuidas.map((entry: any, index: number) => (
                                                    <Cell key={`cell-${index}`} fill={RATING_COLORS[index]} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                        {/* Interações por Tipo */}
                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md flex flex-col">
                            <div className="flex items-center gap-2 mb-2">
                                <PhoneCall className="w-5 h-5 text-slate-400" />
                                <h3 className="text-slate-300 font-bold text-sm uppercase tracking-widest">Canais de Contato</h3>
                            </div>

                            {metrics.interactionsByType.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 min-h-[250px]">
                                    <p className="text-sm">Nenhum contato registrado.</p>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={metrics.interactionsByType}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {metrics.interactionsByType.map((entry: any, index: number) => (
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
                                        {metrics.interactionsByType.map((entry: any, index: number) => (
                                            <div key={index} className="flex items-center gap-2 text-xs">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                                <span className="text-slate-300 truncate">{entry.name} <span className="text-slate-500 font-bold">({entry.value})</span></span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Timeline de Contatos */}
                        <div className="bg-black/40 border border-white/10 rounded-3xl p-6 backdrop-blur-md flex flex-col col-span-1 lg:col-span-3">
                            <div className="flex items-center gap-2 mb-6">
                                <Calendar className="w-5 h-5 text-slate-400" />
                                <h3 className="text-slate-300 font-bold text-sm uppercase tracking-widest">Evolução de Contatos Diários</h3>
                            </div>

                            {metrics.timelineData.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center text-slate-500 py-10">
                                    <p className="text-sm">Sem histórico no período.</p>
                                </div>
                            ) : (
                                <div className="h-[250px] w-full">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={metrics.timelineData} margin={{ top: 5, right: 20, left: -20, bottom: 0 }}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                            <XAxis dataKey="date" stroke="rgba(255,255,255,0.2)" tick={{ fill: '#94a3b8', fontSize: 12 }} dy={10} />
                                            <YAxis stroke="rgba(255,255,255,0.2)" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                                            <RechartsTooltip
                                                contentStyle={{ backgroundColor: 'rgba(15,23,42,0.9)', borderColor: 'rgba(255,255,255,0.1)', borderRadius: '12px', color: '#fff' }}
                                                itemStyle={{ color: '#6366f1', fontWeight: 'bold' }}
                                            />
                                            <Line type="monotone" dataKey="contatos" name="Contatos Feitos" stroke="#6366f1" strokeWidth={3} dot={{ r: 4, fill: '#6366f1', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            )}
                        </div>

                    </div>
                </div>
            ) : null}
        </div>
    );
}
