'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import OperatorMenuHome from './OperatorMenuHome';
import OperatorMenuAtendimento from './OperatorMenuAtendimento';
import OperatorMenuLojaVazia from './OperatorMenuLojaVazia';

type MenuState = 'home' | 'atendimento' | 'loja-vazia' | 'page';

interface OperatorLayoutProps {
    children: React.ReactNode;
    storeId: number;
    storeName: string;
    logoUrl: string | null;
}

export default function OperatorLayout({
    children,
    storeId,
    storeName,
    logoUrl
}: OperatorLayoutProps) {
    const router = useRouter();
    const pathname = usePathname();
    const supabase = createClient();

    // Determina o estado do menu baseado na rota atual
    const [currentMenu, setCurrentMenu] = useState<MenuState>('home');

    // Detecta se estamos em uma página específica (não é a home da loja)
    useEffect(() => {
        const storeHomePath = `/dashboard/loja/${storeId}`;

        // Se não estiver exatamente na home da loja, mostra o children
        if (pathname !== storeHomePath) {
            setCurrentMenu('page');
        } else {
            // Volta para home se estiver na rota raiz da loja
            setCurrentMenu('home');
        }
    }, [pathname, storeId]);

    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        if (error) {
            alert('Erro ao sair');
            return;
        }
        router.push('/login');
    };

    const handleNavigate = (menu: 'atendimento' | 'loja-vazia') => {
        setCurrentMenu(menu);
    };

    const handleBack = () => {
        setCurrentMenu('home');
    };

    const handleRouteNavigate = (route: string) => {
        router.push(route);
    };

    // Renderiza o menu apropriado ou a página
    if (currentMenu === 'home') {
        return (
            <OperatorMenuHome
                storeId={storeId}
                storeName={storeName}
                logoUrl={logoUrl}
                onNavigate={handleNavigate}
                onLogout={handleLogout}
            />
        );
    }

    if (currentMenu === 'atendimento') {
        return (
            <OperatorMenuAtendimento
                storeId={storeId}
                onBack={handleBack}
                onNavigate={handleRouteNavigate}
            />
        );
    }

    if (currentMenu === 'loja-vazia') {
        return (
            <OperatorMenuLojaVazia
                storeId={storeId}
                onBack={handleBack}
                onNavigate={handleRouteNavigate}
            />
        );
    }

    // Quando está em uma página específica, mostra o children com um botão de voltar
    return (
        <div className="min-h-screen bg-gray-100">
            {/* Barra superior simplificada */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between shadow-sm">
                <button
                    onClick={() => router.push(`/dashboard/loja/${storeId}`)}
                    className="flex items-center gap-2 text-slate-600 hover:text-slate-900 transition-colors text-sm font-medium"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    Menu Principal
                </button>
                <span className="text-slate-400 text-xs font-medium uppercase tracking-wider">
                    {storeName}
                </span>
                <button
                    onClick={handleLogout}
                    className="text-slate-400 hover:text-red-500 transition-colors text-sm"
                >
                    Sair
                </button>
            </div>

            {/* Conteúdo da página */}
            <main className="overflow-y-auto" style={{ height: 'calc(100vh - 57px)' }}>
                {children}
            </main>
        </div>
    );
}
