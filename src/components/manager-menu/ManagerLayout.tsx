'use client';

import { useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
    ArrowLeft,
    ArrowRight,
    Briefcase,
    Building2,
    CalendarRange,
    FileText,
    LogOut,
    Percent,
    Settings,
    BarChart3
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';
import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle';
import { OperatorLayout } from '@/components/operator-menu';

type ManualManagerState = 'home' | 'gerencia' | 'operator';
type ManagerState = ManualManagerState | 'page';

interface ManagerLayoutProps {
    children: React.ReactNode;
    storeId: number;
    storeName: string;
    logoUrl: string | null;
}

const GERENCIA_LINKS = [
    {
        id: 'contas',
        title: 'Contas a Pagar',
        subtitle: 'Financeiro',
        icon: CalendarRange,
        route: (storeId: number) => `/dashboard/loja/${storeId}/financeiro/contas`,
        tone: 'from-emerald-600/15 via-emerald-900/25 to-slate-900/60 hover:border-emerald-400/30',
        colSpan: false
    },
    {
        id: 'comissoes',
        title: 'Comissões',
        subtitle: 'Equipe',
        icon: Percent,
        route: (storeId: number) => `/dashboard/loja/${storeId}/financeiro/comissoes`,
        tone: 'from-blue-600/15 via-blue-900/25 to-slate-900/60 hover:border-blue-400/30',
        colSpan: false
    },
    {
        id: 'fiscal',
        title: 'Fiscal (NFC-e)',
        subtitle: 'Documentos',
        icon: FileText,
        route: (storeId: number) => `/dashboard/loja/${storeId}/fiscal`,
        tone: 'from-rose-600/15 via-rose-900/25 to-slate-900/60 hover:border-rose-400/30',
        colSpan: false
    },
    {
        id: 'config',
        title: 'Configuração',
        subtitle: 'Loja',
        icon: Settings,
        route: (storeId: number) => `/dashboard/loja/${storeId}/config`,
        tone: 'from-fuchsia-600/15 via-fuchsia-900/25 to-slate-900/60 hover:border-fuchsia-400/30',
        colSpan: false
    },
    {
        id: 'relatorios',
        title: 'Central de Relatórios',
        subtitle: 'Indicadores',
        icon: BarChart3,
        route: (storeId: number) => `/dashboard/loja/${storeId}/reports`,
        tone: 'from-amber-600/15 via-amber-900/25 to-slate-900/60 hover:border-amber-400/30',
        colSpan: true
    }
] as const;

export default function ManagerLayout({ children, storeId, storeName, logoUrl }: ManagerLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();
    const { preference } = useBackgroundPreference();

    const [manualState, setManualState] = useState<ManualManagerState>('home');

    const storeHomePath = `/dashboard/loja/${storeId}`;
    const currentState: ManagerState = pathname !== storeHomePath && manualState !== 'operator' ? 'page' : manualState;

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Erro ao sair');
            return;
        }
        window.location.href = '/login';
    };

    if (currentState === 'operator') {
        return (
            <OperatorLayout
                storeId={storeId}
                storeName={storeName}
                logoUrl={logoUrl}
                onBackToHub={() => setManualState('home')}
                hubLabel="Voltar ao Hub"
            >
                {children}
            </OperatorLayout>
        );
    }

    if (currentState === 'page') {
        return (
            <div className="min-h-screen bg-slate-950">
                <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between shadow-xl shadow-black/20">
                    <button
                        onClick={() => {
                            setManualState('home');
                            router.push(`/dashboard/loja/${storeId}`);
                        }}
                        className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Hub Gerencial
                    </button>
                    <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{storeName}</span>
                    <button
                        onClick={handleLogout}
                        className="text-slate-500 hover:text-red-400 transition-colors text-sm font-medium"
                    >
                        Sair
                    </button>
                </div>

                <main className="overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
                    {children}
                </main>
            </div>
        );
    }

    return (
        <div className="min-h-screen relative flex flex-col items-center justify-center p-6 overflow-hidden bg-slate-950 font-sans transition-colors duration-500">
            <div className="absolute top-6 right-6 z-50">
                <BackgroundToggle />
            </div>

            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/tela1.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/45 backdrop-blur-md" />
            </div>

            <div className="relative z-10 w-full max-w-6xl flex flex-col items-center">
                <div className="text-center mb-10 animate-in slide-in-from-top-5 duration-700">
                    <h1 className="text-4xl md:text-5xl font-black tracking-tight text-white drop-shadow-lg mb-2">{storeName}</h1>
                    <p className="text-slate-300 text-sm font-medium uppercase tracking-[0.2em] bg-white/5 px-4 py-1 rounded-full border border-white/10">
                        Hub Gerencial
                    </p>
                </div>

                {manualState === 'home' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
                        <button
                            onClick={() => setManualState('operator')}
                            className="group relative h-72 rounded-[2rem] overflow-hidden border border-white/10 bg-black/25 backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-blue-500/20"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 via-blue-900/30 to-slate-900/60" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="absolute inset-0 p-8 flex flex-col items-start justify-end text-left z-10">
                                <div className="mb-auto mt-3 p-5 rounded-2xl bg-blue-500/20 ring-1 ring-blue-400/30">
                                    <Building2 className="w-10 h-10 text-blue-200" strokeWidth={1.7} />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2">Operação da Loja</h2>
                                <p className="text-blue-200/75 text-xs font-semibold uppercase tracking-[0.2em] mb-5">Fluxo de atendimento e loja vazia</p>
                                <div className="flex items-center gap-2 text-blue-200/90 text-sm font-bold uppercase tracking-wider">
                                    Abrir
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                </div>
                            </div>
                        </button>

                        <button
                            onClick={() => setManualState('gerencia')}
                            className="group relative h-72 rounded-[2rem] overflow-hidden border border-white/10 bg-black/25 backdrop-blur-md transition-all duration-300 hover:scale-[1.01] hover:shadow-2xl hover:shadow-emerald-500/20"
                        >
                            <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 via-emerald-900/30 to-slate-900/60" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                            <div className="absolute inset-0 p-8 flex flex-col items-start justify-end text-left z-10">
                                <div className="mb-auto mt-3 p-5 rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/30">
                                    <Briefcase className="w-10 h-10 text-emerald-200" strokeWidth={1.7} />
                                </div>
                                <h2 className="text-3xl font-black text-white mb-2">Opções de Gerência</h2>
                                <p className="text-emerald-200/75 text-xs font-semibold uppercase tracking-[0.2em] mb-5">Financeiro, relatórios e configurações</p>
                                <div className="flex items-center gap-2 text-emerald-200/90 text-sm font-bold uppercase tracking-wider">
                                    Abrir
                                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
                                </div>
                            </div>
                        </button>
                    </div>
                )}

                {manualState === 'gerencia' && (
                    <div className="w-full max-w-5xl bg-black/30 border border-white/10 rounded-3xl backdrop-blur-md p-6 md:p-8 animate-in fade-in duration-300">
                        <div className="flex items-center justify-between mb-6">
                            <h2 className="text-white text-2xl font-black tracking-tight">Gerência</h2>
                            <button
                                onClick={() => setManualState('home')}
                                className="px-3 py-2 rounded-xl border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 transition-colors text-sm font-semibold"
                            >
                                Voltar
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {GERENCIA_LINKS.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.id}
                                        onClick={() => router.push(item.route(storeId))}
                                        className={`group text-left rounded-2xl px-5 py-5 border border-white/10 bg-gradient-to-br ${item.tone} transition-all duration-300 hover:-translate-y-0.5 ${item.colSpan ? 'md:col-span-2' : ''}`}
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/10">
                                                <Icon className="w-5 h-5 text-slate-200" />
                                            </div>
                                            <div>
                                                <p className="text-white font-bold text-lg leading-tight">{item.title}</p>
                                                <p className="text-slate-400 text-[11px] uppercase tracking-[0.16em]">{item.subtitle}</p>
                                            </div>
                                        </div>
                                        <span className="inline-flex items-center gap-2 text-xs uppercase font-bold tracking-[0.16em] text-slate-300 group-hover:text-white transition-colors">
                                            Acessar
                                            <ArrowRight className="w-3.5 h-3.5" />
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            <button
                onClick={handleLogout}
                className="fixed bottom-6 right-6 md:bottom-10 md:right-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-200 transition-all duration-300 border border-white/5 hover:border-red-500/30 backdrop-blur-sm z-30 group"
            >
                <LogOut className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span className="text-xs font-bold uppercase tracking-wider">Sair</span>
            </button>

            {manualState === 'gerencia' && (
                <button
                    onClick={() => setManualState('home')}
                    className="fixed bottom-6 left-6 md:bottom-10 md:left-10 flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-blue-500/20 text-slate-400 hover:text-blue-200 transition-all duration-300 border border-white/5 hover:border-blue-500/30 backdrop-blur-sm z-30 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-xs font-bold uppercase tracking-wider">Voltar</span>
                </button>
            )}
        </div>
    );
}
