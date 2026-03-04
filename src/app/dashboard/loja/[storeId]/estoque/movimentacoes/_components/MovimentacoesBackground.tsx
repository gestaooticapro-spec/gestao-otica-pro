'use client'

import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'

export default function MovimentacoesBackground({ children }: { children: React.ReactNode }) {
    const { preference } = useBackgroundPreference()

    return (
        <div className="h-[calc(100vh-64px)] overflow-hidden relative bg-slate-950 transition-colors duration-500">
            {/* Toggle de Fundo */}
            <div className="absolute top-4 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Background Image */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/movimentoestoque.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/65 backdrop-blur-md" />
            </div>

            {/* Conteúdo */}
            <div className="relative z-10 h-full">
                {children}
            </div>
        </div>
    )
}
