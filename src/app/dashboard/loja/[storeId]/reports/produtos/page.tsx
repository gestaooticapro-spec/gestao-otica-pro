'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Loader2, Box, TrendingUp, AlertCircle, ShoppingBag, PackageSearch } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { getProdutosMetrics } from '@/lib/actions/reports.actions';
import ExpandableReportCard from './_components/ExpandableReportCard';
import LensAuditCard from './_components/LensAuditCard';

export default function ProdutosReportPage() {
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
                const data = await getProdutosMetrics(storeId);
                setMetrics(data);
            } catch (error) {
                console.error("Erro ao buscar métricas de produtos:", error);
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
                    <div className="p-3 bg-fuchsia-500/20 rounded-xl ring-1 ring-fuchsia-500/30 backdrop-blur-md">
                        <Box className="w-8 h-8 text-fuchsia-400" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black text-white tracking-tight drop-shadow-md">Estoque e Produtos</h1>
                        <p className="text-slate-400 text-sm font-medium mt-1">Ranking de vendas, lucros e proteção de inventário</p>
                    </div>
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center p-20 bg-black/20 rounded-3xl border border-white/5 backdrop-blur-sm">
                        <Loader2 className="w-10 h-10 animate-spin text-fuchsia-500 mb-4" />
                        <p className="text-slate-400 font-medium">Extraindo dados do catálogo...</p>
                    </div>
                ) : metrics ? (
                    <div className="flex flex-col gap-4 animate-in fade-in duration-700 w-full">

                        {/* 1. Mais Vendidos */}
                        <ExpandableReportCard 
                            title="Mais Vendidos (Top 10)" 
                            icon={<ShoppingBag className="w-5 h-5" />} 
                            colorClass="bg-emerald-500"
                            defaultExpanded
                        >
                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                {metrics.maisVendidos.length > 0 ? metrics.maisVendidos.map((prod: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                                        <div className="flex items-center gap-4">
                                            <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-400">
                                                {i + 1}
                                            </div>
                                            <div>
                                                <p className="text-white font-medium line-clamp-1">{prod.nome}</p>
                                                <p className="text-xs text-slate-400">{prod.categoria}</p>
                                            </div>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="text-emerald-400 font-bold text-lg">{prod.qtd} un</p>
                                            <p className="text-xs text-emerald-400/60">{formatCurrency(prod.valor)}</p>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-slate-500 text-center py-10">Dados insuficientes de vendas.</p>
                                )}
                            </div>
                        </ExpandableReportCard>

                        {/* 2. Maior Margem */}
                        <ExpandableReportCard 
                            title="Top Margem de Lucro" 
                            icon={<TrendingUp className="w-5 h-5" />} 
                            colorClass="bg-blue-500"
                        >
                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                {metrics.maiorMargem.length > 0 ? metrics.maiorMargem.map((prod: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors">
                                        <div>
                                            <p className="text-white font-medium line-clamp-1">{prod.nome}</p>
                                            <p className="text-xs text-blue-400 mt-1">
                                                Custo: {formatCurrency(prod.preco_custo || 0)} | Venda: {formatCurrency(prod.preco_venda || 0)}
                                            </p>
                                        </div>
                                        <div className="text-right flex-shrink-0 ml-4">
                                            <p className="text-xl font-black text-blue-400">{prod.margem_lucro || 0}%</p>
                                        </div>
                                    </div>
                                )) : (
                                    <p className="text-slate-500 text-center py-10">Nenhum produto com margem cadastrada.</p>
                                )}
                            </div>
                        </ExpandableReportCard>

                        {/* 3. Estoque Baixo */}
                        <ExpandableReportCard 
                            title="Atenção: Estoque Baixo" 
                            icon={<AlertCircle className="w-5 h-5" />} 
                            colorClass="bg-rose-500"
                        >
                            <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-4">
                                {metrics.estoqueBaixo.length > 0 ? metrics.estoqueBaixo.map((prod: any, i: number) => {
                                    const isZerado = prod.estoque_atual <= 0;
                                    return (
                                        <div key={i} className={`flex items-center justify-between p-3 rounded-2xl transition-colors ${isZerado ? 'bg-rose-500/10 border border-rose-500/30' : 'bg-white/5'}`}>
                                            <div>
                                                <p className="text-white font-medium line-clamp-1">{prod.nome}</p>
                                                <p className="text-xs text-slate-400">{prod.categoria}</p>
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-4">
                                                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${isZerado ? 'bg-rose-500 text-white shadow-lg' : 'bg-amber-500/20 text-amber-400'}`}>
                                                    {prod.estoque_atual} un
                                                </span>
                                            </div>
                                        </div>
                                    )
                                }) : (
                                    <div className="flex flex-col items-center justify-center p-10 text-slate-500 text-center">
                                        <Box className="w-12 h-12 mb-4 text-emerald-500/50" />
                                        <p>Estoque abastecido!</p>
                                        <p className="text-sm mt-1">Nenhum alerta crítico.</p>
                                    </div>
                                )}
                            </div>
                        </ExpandableReportCard>

                        {/* 4. Auditoria de Lentes (Matriz) */}
                        <ExpandableReportCard 
                            title="Auditoria: Matriz de Lentes (Perdas e Sobras)" 
                            icon={<PackageSearch className="w-5 h-5" />} 
                            colorClass="bg-fuchsia-500"
                        >
                            <LensAuditCard storeId={storeId} />
                        </ExpandableReportCard>

                    </div>
                ) : null}
            </div>
        </div>
    );
}
