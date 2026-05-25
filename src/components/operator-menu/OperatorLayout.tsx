'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OperatorMenuHome from './OperatorMenuHome';
import OperatorMenuAtendimento from './OperatorMenuAtendimento';
import OperatorMenuLojaVazia from './OperatorMenuLojaVazia';
import { getStoreProfile } from '@/lib/actions/store.actions';
import { getStoreAppMode, type AppMode } from '@/lib/app-mode';

type MenuState = 'home' | 'atendimento' | 'loja-vazia' | 'page';
type HomeSelection = 'atendimento' | 'loja-vazia' | null;

interface OperatorLayoutProps {
    children: React.ReactNode;
    storeId: number;
    storeName: string;
    logoUrl: string | null;
    preSaleAnalysisEnabled?: boolean;
    appMode?: AppMode;
    onBackToHub?: () => void;
    hubLabel?: string;
}

export default function OperatorLayout({
    children,
    storeId,
    storeName,
    logoUrl,
    preSaleAnalysisEnabled = false,
    appMode = 'full',
    onBackToHub,
    hubLabel = 'Voltar'
}: OperatorLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const supabase = createClient();

    const [homeSelection, setHomeSelection] = useState<HomeSelection>(null);
    const [livePreSaleAnalysisEnabled, setLivePreSaleAnalysisEnabled] = useState(preSaleAnalysisEnabled);
    const [liveAppMode, setLiveAppMode] = useState<AppMode>(appMode);

    const storeHomePath = `/dashboard/loja/${storeId}`;
    const menuParam = searchParams.get('menu');

    useEffect(() => {
        setLivePreSaleAnalysisEnabled(preSaleAnalysisEnabled);
        setLiveAppMode(appMode);
    }, [preSaleAnalysisEnabled, appMode]);

    useEffect(() => {
        if (pathname !== storeHomePath) return;

        let isMounted = true;

        getStoreProfile(storeId).then((store) => {
            if (!isMounted) return;

            const settings = store?.settings;
            const enabled = Boolean(
                settings &&
                typeof settings === 'object' &&
                'pre_sale_analysis_enabled' in settings &&
                (settings as { pre_sale_analysis_enabled?: unknown }).pre_sale_analysis_enabled === true
            );

            setLivePreSaleAnalysisEnabled(enabled);
            setLiveAppMode(getStoreAppMode(settings));
        });

        return () => {
            isMounted = false;
        };
    }, [pathname, storeHomePath, storeId]);

    const currentMenu: MenuState = (() => {
        if (pathname !== storeHomePath) return 'page';
        if (menuParam === 'atendimento' || menuParam === 'loja-vazia') return menuParam;
        if (homeSelection) return homeSelection;
        return 'home';
    })();

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Erro ao sair');
            return;
        }
        window.location.href = '/login';
    };

    const handleNavigate = (menu: 'atendimento' | 'loja-vazia') => {
        setHomeSelection(menu);
    };

    const handleBack = () => {
        setHomeSelection(null);
        router.push(storeHomePath);
    };

    const handleRouteNavigate = (route: string) => {
        router.push(route);
    };

    if (currentMenu === 'home') {
        return (
            <OperatorMenuHome
                storeId={storeId}
                storeName={storeName}
                logoUrl={logoUrl}
                onNavigate={handleNavigate}
                onLogout={handleLogout}
                onBackToHub={onBackToHub}
                backLabel={hubLabel}
            />
        );
    }

    if (currentMenu === 'atendimento') {
        return <OperatorMenuAtendimento storeId={storeId} onBack={handleBack} onNavigate={handleRouteNavigate} preSaleAnalysisEnabled={livePreSaleAnalysisEnabled} appMode={liveAppMode} />;
    }

    if (currentMenu === 'loja-vazia') {
        return <OperatorMenuLojaVazia storeId={storeId} onBack={handleBack} onNavigate={handleRouteNavigate} appMode={liveAppMode} />;
    }

    return (
        <div className="min-h-screen bg-slate-950">
            <div className="bg-slate-900/80 backdrop-blur-xl border-b border-white/10 px-4 py-3 flex items-center justify-between shadow-xl shadow-black/20">
                <button
                    onClick={handleBack}
                    className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-sm font-medium"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Menu Principal
                </button>
                <span className="text-slate-500 text-xs font-bold uppercase tracking-widest">{storeName}</span>
                <div className="flex items-center gap-4">
                    {onBackToHub && (
                        <button
                            onClick={onBackToHub}
                            className="text-slate-500 hover:text-blue-300 transition-colors text-sm font-medium"
                        >
                            {hubLabel}
                        </button>
                    )}
                    <button
                        onClick={handleLogout}
                        className="text-slate-500 hover:text-red-400 transition-colors text-sm font-medium"
                    >
                        Sair
                    </button>
                </div>
            </div>

            <main className="overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
                {children}
            </main>
        </div>
    );
}
