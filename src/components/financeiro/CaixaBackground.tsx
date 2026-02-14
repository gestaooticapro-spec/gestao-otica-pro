'use client'

import { useBackgroundPreference, BackgroundToggle } from '@/components/ui/BackgroundToggle'

export default function CaixaBackground({ children }: { children: React.ReactNode }) {
    const { preference } = useBackgroundPreference()

    return (
        <div className="relative h-[calc(100vh-64px)] overflow-hidden">
            {/* Background Image */}
            <div className={`absolute inset-0 z-0 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
                <div className="absolute inset-0 bg-[url('/lvrocaixa.jpg')] bg-cover bg-center" />
                <div className="absolute inset-0 bg-black/95 backdrop-blur-sm" />
            </div>

            {/* Dark fallback */}
            <div className={`absolute inset-0 z-0 bg-slate-950 transition-opacity duration-1000 pointer-events-none ${preference === 'image' ? 'opacity-0' : 'opacity-100'}`} />

            {/* Toggle */}
            <div className="absolute top-4 right-6 z-50">
                <BackgroundToggle />
            </div>

            {/* Content */}
            <div className="relative z-10 h-full overflow-y-auto">
                {children}
            </div>
        </div>
    )
}
