'use client';

import { useState, useEffect } from 'react';
import { Image as ImageIcon, Moon } from 'lucide-react';

type BgPreference = 'image' | 'dark';

// Custom Hook para gerenciar a preferência
export function useBackgroundPreference() {
    const [preference, setPreference] = useState<BgPreference>('image');
    const [isLoaded, setIsLoaded] = useState(false);

    useEffect(() => {
        // Carrega do localStorage ao montar
        const stored = localStorage.getItem('operator-bg-preference') as BgPreference;
        if (stored) setPreference(stored);
        setIsLoaded(true);

        // Listener para sincronizar abas/janelas
        const handleStorageChange = (e: StorageEvent) => {
            if (e.key === 'operator-bg-preference') {
                setPreference(e.newValue as BgPreference);
            }
        };

        // Listener para evento customizado (mesma janela)
        const handleCustomEvent = (e: CustomEvent) => {
            setPreference(e.detail);
        };

        window.addEventListener('storage', handleStorageChange);
        window.addEventListener('operator-bg-preference-change' as any, handleCustomEvent as any);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
            window.removeEventListener('operator-bg-preference-change' as any, handleCustomEvent as any);
        };
    }, []);

    const togglePreference = () => {
        const newPref = preference === 'image' ? 'dark' : 'image';
        setPreference(newPref);
        localStorage.setItem('operator-bg-preference', newPref);

        // Dispara evento para atualizar outros componentes na mesma tela
        const event = new CustomEvent('operator-bg-preference-change', { detail: newPref });
        window.dispatchEvent(event);
    };

    return { preference, togglePreference, isLoaded };
}

// Componente do Botão
export function BackgroundToggle({ className = '' }: { className?: string }) {
    const { preference, togglePreference, isLoaded } = useBackgroundPreference();

    if (!isLoaded) return null;

    return (
        <button
            onClick={togglePreference}
            title={preference === 'image' ? "Desativar imagem de fundo" : "Ativar imagem de fundo"}
            className={`p-2 rounded-full bg-black/20 hover:bg-black/40 text-white/50 hover:text-white border border-white/5 hover:border-white/20 transition-all backdrop-blur-sm z-50 ${className}`}
        >
            {preference === 'image' ? (
                <ImageIcon className="w-4 h-4" />
            ) : (
                <Moon className="w-4 h-4" />
            )}
        </button>
    );
}
