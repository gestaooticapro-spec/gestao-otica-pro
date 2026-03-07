'use client';

import { useRouter, useParams } from 'next/navigation';
import {
    BarChart3,
    Banknote,
    CreditCard,
    Users,
    Box,
    Activity,
    PhoneCall,
    Megaphone,
    ArrowRight,
    ArrowLeft,
    LineChart,
    Stethoscope,
    PackageSearch
} from 'lucide-react';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';

export default function ReportsHubPage() {
    const router = useRouter();
    const params = useParams();
    const storeId = params.storeId as string;
    const { preference } = useBackgroundPreference();

    const reportCategories = [
        {
            title: 'Fluxo Especial (Caixa Diário)',
            description: 'Visão consolidada de entradas, venda garantida vs parcelada e acumulados.',
            icon: LineChart,
            route: `/dashboard/loja/${storeId}/reports/fluxo-especial`,
            tone: 'from-emerald-600/20 via-emerald-900/30 to-slate-900/80 hover:border-emerald-500/50 hover:shadow-emerald-500/20',
            iconTone: 'text-emerald-400 bg-emerald-500/20 ring-emerald-400/30'
        },
        {
            title: 'Parcelamento & Cobrança',
            description: 'Valores parcelados, atrasos, SCPC e análise de crédito perdido.',
            icon: Banknote,
            route: `/dashboard/loja/${storeId}/reports/parcelamento`,
            tone: 'from-rose-600/20 via-rose-900/30 to-slate-900/80 hover:border-rose-500/50 hover:shadow-rose-500/20',
            iconTone: 'text-rose-400 bg-rose-500/20 ring-rose-400/30'
        },
        {
            title: 'Caixa & Banco',
            description: 'Entradas totais, PIX, Cartão (recebidos e a receber) e pagamentos.',
            icon: CreditCard,
            route: `/dashboard/loja/${storeId}/reports/financeiro`,
            tone: 'from-blue-600/20 via-blue-900/30 to-slate-900/80 hover:border-blue-500/50 hover:shadow-blue-500/20',
            iconTone: 'text-blue-400 bg-blue-500/20 ring-blue-400/30'
        },
        {
            title: 'Clientes VIP & Engajamento',
            description: 'Ranking de compras e análise de clientes inativos (Churn).',
            icon: Users,
            route: `/dashboard/loja/${storeId}/reports/clientes`,
            tone: 'from-amber-600/20 via-amber-900/30 to-slate-900/80 hover:border-amber-500/50 hover:shadow-amber-500/20',
            iconTone: 'text-amber-400 bg-amber-500/20 ring-amber-400/30'
        },
        {
            title: 'Estoque & Produtos',
            description: 'Top vendas, alertas de estoque baixo e produtos lucrativos.',
            icon: Box,
            route: `/dashboard/loja/${storeId}/reports/produtos`,
            tone: 'from-fuchsia-600/20 via-fuchsia-900/30 to-slate-900/80 hover:border-fuchsia-500/50 hover:shadow-fuchsia-500/20',
            iconTone: 'text-fuchsia-400 bg-fuchsia-500/20 ring-fuchsia-400/30'
        },
        {
            title: 'Movimento Operacional',
            description: 'Entradas/Saídas de mercadoria e reaproveitamento de lentes.',
            icon: Activity,
            route: `/dashboard/loja/${storeId}/reports/movimento`,
            tone: 'from-indigo-600/20 via-indigo-900/30 to-slate-900/80 hover:border-indigo-500/50 hover:shadow-indigo-500/20',
            iconTone: 'text-indigo-400 bg-indigo-500/20 ring-indigo-400/30'
        },
        {
            title: 'Análise de Pós-Venda',
            description: 'Estatísticas de contatos realizados e avaliação de satisfação.',
            icon: PhoneCall,
            route: `/dashboard/loja/${storeId}/reports/pos-venda`,
            tone: 'from-cyan-600/20 via-cyan-900/30 to-slate-900/80 hover:border-cyan-500/50 hover:shadow-cyan-500/20',
            iconTone: 'text-cyan-400 bg-cyan-500/20 ring-cyan-400/30'
        },
        {
            title: 'Ações de Cobrança',
            description: 'Histórico de contatos para cobrança e conversão de resultados.',
            icon: Megaphone,
            route: `/dashboard/loja/${storeId}/reports/cobranca-acoes`,
            tone: 'from-orange-600/20 via-orange-900/30 to-slate-900/80 hover:border-orange-500/50 hover:shadow-orange-500/20',
            iconTone: 'text-orange-400 bg-orange-500/20 ring-orange-400/30'
        },
        {
            title: 'Relatório Histórico de Vendas',
            description: 'Visão em lista padronizada de todas as vendas e recibos do período.',
            icon: BarChart3,
            route: `/dashboard/loja/${storeId}/reports/vendas`,
            tone: 'from-slate-600/20 via-slate-800/30 to-slate-900/80 hover:border-slate-500/50 hover:shadow-slate-500/20',
            iconTone: 'text-slate-300 bg-slate-500/20 ring-slate-400/30'
        },
        {
            title: 'Ranking de Médicos',
            description: 'Ranking por receitas, faturamento e ticket médio dos oftalmologistas parceiros.',
            icon: Stethoscope,
            route: `/dashboard/loja/${storeId}/reports/medicos`,
            tone: 'from-teal-600/20 via-teal-900/30 to-slate-900/80 hover:border-teal-500/50 hover:shadow-teal-500/20',
            iconTone: 'text-teal-400 bg-teal-500/20 ring-teal-400/30'
        },
        {
            title: 'Estoque Físico Detalhado',
            description: 'Visão detalhada e filtrável de armações e solares em estoque com somatório de valores.',
            icon: PackageSearch,
            route: `/dashboard/loja/${storeId}/reports/estoque-marcas`,
            tone: 'from-pink-600/20 via-pink-900/30 to-slate-900/80 hover:border-pink-500/50 hover:shadow-pink-500/20',
            iconTone: 'text-pink-400 bg-pink-500/20 ring-pink-400/30'
        }
    ];

    return (
        <div className="min-h-full relative flex flex-col p-6 lg:p-10 z-0">
            {/* Background Manager Layout Style */}
            <div className={`fixed inset-0 z-[-1] transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />
            </div>

            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Cabeçalho */}
            <div className="mb-10 max-w-7xl mx-auto w-full animate-in slide-in-from-top-5 duration-700">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-500/20 rounded-xl ring-1 ring-blue-500/30 backdrop-blur-md">
                            <BarChart3 className="w-8 h-8 text-blue-400" />
                        </div>
                        <div>
                            <h1 className="text-4xl font-black text-white tracking-tight drop-shadow-md">Central de Relatórios</h1>
                            <p className="text-slate-400 text-sm font-medium uppercase tracking-widest mt-1">Inteligência e Análise de Dados</p>
                        </div>
                    </div>
                    <button
                        onClick={() => router.push(`/dashboard/loja/${storeId}`)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition-all duration-200 text-sm font-semibold backdrop-blur-md group"
                    >
                        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
                        Voltar
                    </button>
                </div>
            </div>

            {/* Grid de Relatórios */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto w-full">
                {reportCategories.map((category, index) => {
                    const Icon = category.icon;
                    return (
                        <button
                            key={index}
                            onClick={() => router.push(category.route)}
                            className={`group relative text-left rounded-3xl p-5 border border-white/10 bg-gradient-to-br ${category.tone} backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl overflow-hidden animate-in fade-in slide-in-from-bottom-5`}
                            style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
                        >
                            {/* Efeito de brilho de fundo no hover */}
                            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                            <div className="relative z-10 flex flex-col h-full">
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`p-3 rounded-2xl ring-1 ${category.iconTone} shadow-lg`}>
                                        <Icon className="w-6 h-6" strokeWidth={1.5} />
                                    </div>
                                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-white/10 transition-colors">
                                        <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-white transition-colors group-hover:translate-x-0.5" />
                                    </div>
                                </div>
                                <h3 className="text-lg font-bold text-white mb-2 leading-tight">{category.title}</h3>
                                <p className="text-slate-400 text-xs mt-auto max-w-[95%] leading-relaxed">
                                    {category.description}
                                </p>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}