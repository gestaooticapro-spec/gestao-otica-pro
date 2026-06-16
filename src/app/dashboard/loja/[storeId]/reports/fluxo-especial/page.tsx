'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Calendar, Loader2, TrendingUp } from 'lucide-react';
import { getDailyFlowReport, DailyFlowRow } from '@/lib/actions/reports.actions';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { useStoreModules } from '@/lib/contexts/StoreModulesContext';

export default function FluxoEspecialPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = Number(params.storeId);
    const { preference } = useBackgroundPreference();
    const modules = useStoreModules();

    const [month, setMonth] = useState<string>((new Date().getMonth() + 1).toString().padStart(2, '0'));
    const [year, setYear] = useState<string>(new Date().getFullYear().toString());
    const [data, setData] = useState<DailyFlowRow[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!storeId) return;

        const fetchData = async () => {
            setLoading(true);
            try {
                const result = await getDailyFlowReport(storeId, month, year);
                setData(result);
            } catch (error) {
                console.error('Erro ao buscar relatório:', error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [storeId, month, year]);

    const reportMode = data[0]?.reportMode || (modules.installments ? 'installments' : 'cash');

    const totalEntradas = data.length > 0 ? data[data.length - 1].entradasAcumuladas || 0 : 0;
    const totalVendaGarantida = data.reduce((acc, row) => acc + (row.vendaGarantida || 0), 0);
    const totalVendaParcelada = data.reduce((acc, row) => acc + (row.vendaParcelada || 0), 0);
    const totalVendaAcumulada = data.length > 0 ? data[data.length - 1].vendaAcumulada || 0 : 0;

    const totalValorInicialGaveta = data.reduce((acc, row) => acc + (row.valorInicialGaveta || 0), 0);
    const totalValorFinalGaveta = data.reduce((acc, row) => acc + (row.valorFinalGaveta || 0), 0);
    const totalDinheiro = data.reduce((acc, row) => acc + (row.totalDinheiro || 0), 0);
    const totalMaquina = data.reduce((acc, row) => acc + (row.totalMaquina || 0), 0);
    const totalDiario = data.reduce((acc, row) => acc + (row.totalDiario || 0), 0);
    const totalDiarioAcumulado = data.length > 0 ? data[data.length - 1].diarioAcumulado || 0 : 0;

    return (
        <div className="min-h-full relative flex flex-col p-6 lg:p-10 z-0">
            <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/70 backdrop-blur-xl" />
            </div>

            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            <div className="mb-8 max-w-[1400px] mx-auto w-full animate-in slide-in-from-top-5 duration-700">
                <button
                    onClick={() => router.push(`/dashboard/loja/${storeId}/reports`)}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-6 text-sm font-bold uppercase tracking-wider group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    Voltar para Relatórios
                </button>

                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-500/20 rounded-xl ring-1 ring-emerald-500/30 backdrop-blur-md">
                            <TrendingUp className="w-8 h-8 text-emerald-400" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Fluxo Especial de Caixa</h1>
                            <p className="text-slate-400 text-sm font-medium mt-1">
                                {reportMode === 'installments'
                                    ? 'Comparativo de entradas vs vendas garantidas e parceladas'
                                    : 'Leitura diária no estilo do caixa para lojas sem módulo de parcelamento'}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 bg-black/30 p-2 rounded-2xl border border-white/10 backdrop-blur-sm">
                        <div className="flex items-center gap-2 px-3 text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span className="text-xs font-bold uppercase tracking-wider">Período:</span>
                        </div>
                        <select
                            value={month}
                            onChange={(e) => setMonth(e.target.value)}
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 shadow-inner outline-none"
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
                            className="bg-black/50 border border-white/10 text-white text-sm rounded-lg focus:ring-emerald-500 focus:border-emerald-500 p-2 shadow-inner outline-none"
                        >
                            <option value="2024">2024</option>
                            <option value="2025">2025</option>
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="max-w-[1400px] mx-auto w-full flex-1 flex flex-col min-h-0 bg-black/40 backdrop-blur-xl rounded-3xl border border-white/10 shadow-2xl overflow-hidden animate-in fade-in duration-700">
                <div className="overflow-x-auto flex-1 custom-scrollbar">
                    <table className="w-full text-left border-collapse min-w-[1000px]">
                        <thead>
                            <tr className="bg-white/5 border-b border-white/10 text-xs font-bold uppercase tracking-widest text-slate-400">
                                <th className="p-4 pl-6 border-r border-white/5 sticky left-0 bg-slate-900/90 backdrop-blur-md z-20">Dia</th>
                                {reportMode === 'installments' ? (
                                    <>
                                        <th className="p-4 border-r border-white/5 text-emerald-400 bg-emerald-950/30">1. Entradas (Recibos)</th>
                                        <th className="p-4 border-r border-white/5 text-emerald-300 bg-emerald-950/30">2. Acumulado Entradas</th>
                                        <th className="p-4 border-r border-white/5 text-blue-400 bg-blue-950/30">3. Venda Garantida</th>
                                        <th className="p-4 border-r border-white/5 text-orange-400 bg-orange-950/30">4. Venda Parcelada (Loja)</th>
                                        <th className="p-4 border-r border-white/5 text-purple-400 bg-purple-950/30">5. Total Venda do Dia (3+4)</th>
                                        <th className="p-4 pr-6 text-purple-300 bg-purple-950/30">6. Acumulado Vendas</th>
                                    </>
                                ) : (
                                    <>
                                        <th className="p-4 border-r border-white/5 text-emerald-400 bg-emerald-950/30">1. Valor Inicial Gaveta</th>
                                        <th className="p-4 border-r border-white/5 text-emerald-300 bg-emerald-950/30">2. Valor Final Gaveta</th>
                                        <th className="p-4 border-r border-white/5 text-blue-400 bg-blue-950/30">3. Total Dinheiro</th>
                                        <th className="p-4 border-r border-white/5 text-cyan-400 bg-cyan-950/30">4. Total Máquina</th>
                                        <th className="p-4 border-r border-white/5 text-purple-400 bg-purple-950/30">5. Total Diário</th>
                                        <th className="p-4 pr-6 text-purple-300 bg-purple-950/30">6. Diário Acumulado</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-slate-400">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-4" />
                                        Carregando relatório...
                                    </td>
                                </tr>
                            ) : data.length === 0 ? (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-slate-400">
                                        Nenhum dado encontrado para o período selecionado.
                                    </td>
                                </tr>
                            ) : (
                                data.map((row, i) => (
                                    <tr key={i} className="border-b border-white/5 hover:bg-white/5 transition-colors group">
                                        <td className="p-3 pl-6 border-r border-white/5 sticky left-0 bg-slate-900/80 group-hover:bg-slate-800/90 backdrop-blur-md z-10 transition-colors">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold">{row.diaMes}</span>
                                                <span className="text-[10px] text-slate-500 uppercase tracking-widest">{row.diaSemana}</span>
                                            </div>
                                        </td>

                                        {reportMode === 'installments' ? (
                                            <>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm text-emerald-100 bg-emerald-950/10">
                                                    {formatCurrency(row.entradasTotais || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm font-bold text-emerald-300 bg-emerald-950/10">
                                                    {formatCurrency(row.entradasAcumuladas || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm text-blue-200 bg-blue-950/10">
                                                    {formatCurrency(row.vendaGarantida || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm text-orange-200 bg-orange-950/10">
                                                    {formatCurrency(row.vendaParcelada || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm font-bold text-purple-200 bg-purple-950/10">
                                                    {formatCurrency(row.vendaTotal || 0)}
                                                </td>
                                                <td className="p-3 pr-6 font-mono text-sm font-black text-purple-300 bg-purple-950/10">
                                                    {formatCurrency(row.vendaAcumulada || 0)}
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm text-emerald-100 bg-emerald-950/10">
                                                    {formatCurrency(row.valorInicialGaveta || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm font-bold text-emerald-300 bg-emerald-950/10">
                                                    {formatCurrency(row.valorFinalGaveta || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm text-blue-200 bg-blue-950/10">
                                                    {formatCurrency(row.totalDinheiro || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm text-cyan-200 bg-cyan-950/10">
                                                    {formatCurrency(row.totalMaquina || 0)}
                                                </td>
                                                <td className="p-3 border-r border-white/5 font-mono text-sm font-bold text-purple-200 bg-purple-950/10">
                                                    {formatCurrency(row.totalDiario || 0)}
                                                </td>
                                                <td className="p-3 pr-6 font-mono text-sm font-black text-purple-300 bg-purple-950/10">
                                                    {formatCurrency(row.diarioAcumulado || 0)}
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))
                            )}
                        </tbody>

                        {!loading && data.length > 0 && (
                            <tfoot className="sticky bottom-0 bg-slate-900 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] z-20">
                                <tr className="border-t-2 border-white/20">
                                    <td className="p-4 pl-6 border-r border-white/10 font-black text-white text-right uppercase tracking-widest text-sm">
                                        TOTAL DO MÊS
                                    </td>
                                    {reportMode === 'installments' ? (
                                        <>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-emerald-400">
                                                {formatCurrency(totalEntradas)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-emerald-400 text-opacity-50">
                                                -
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-blue-400">
                                                {formatCurrency(totalVendaGarantida)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-orange-400">
                                                {formatCurrency(totalVendaParcelada)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-purple-400">
                                                {formatCurrency(totalVendaGarantida + totalVendaParcelada)}
                                            </td>
                                            <td className="p-4 font-mono font-black text-purple-400 text-opacity-50">
                                                {formatCurrency(totalVendaAcumulada)}
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-emerald-400">
                                                {formatCurrency(totalValorInicialGaveta)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-emerald-300">
                                                {formatCurrency(totalValorFinalGaveta)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-blue-400">
                                                {formatCurrency(totalDinheiro)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-cyan-400">
                                                {formatCurrency(totalMaquina)}
                                            </td>
                                            <td className="p-4 border-r border-white/10 font-mono font-black text-purple-400">
                                                {formatCurrency(totalDiario)}
                                            </td>
                                            <td className="p-4 font-mono font-black text-purple-300">
                                                {formatCurrency(totalDiarioAcumulado)}
                                            </td>
                                        </>
                                    )}
                                </tr>
                            </tfoot>
                        )}
                    </table>
                </div>
            </div>
        </div>
    );
}
