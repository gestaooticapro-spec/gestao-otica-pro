'use client'

import { useBackgroundPreference } from '@/components/ui/BackgroundToggle'

export function HistoryBackgroundLayer() {
    const { preference } = useBackgroundPreference()
    return (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
            <img src="/dashboard.jpg" alt="" className="absolute inset-0 w-full h-full object-cover opacity-30 fixed" />
            <div className="absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950" />
        </div>
    )
}
