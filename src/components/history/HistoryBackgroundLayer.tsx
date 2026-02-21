'use client'

import { useEffect, useState } from 'react'
import { useBackgroundPreference } from '@/components/ui/BackgroundToggle'

// Quick rollback: set to false to restore image-only background.
const ENABLE_DOSSIE_VIDEO_TEST = true

export function HistoryBackgroundLayer() {
    const { preference } = useBackgroundPreference()
    const [isVideoEligible, setIsVideoEligible] = useState(false)
    const [videoEnded, setVideoEnded] = useState(false)

    useEffect(() => {
        if (!ENABLE_DOSSIE_VIDEO_TEST) {
            setIsVideoEligible(false)
            return
        }

        // Slightly relaxed threshold for testing on lower desktop resolutions.
        const isDesktop = window.matchMedia('(min-width: 768px)').matches
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const saveData = (navigator as any)?.connection?.saveData === true

        setIsVideoEligible(isDesktop && !prefersReducedMotion && !saveData)
    }, [])

    const canUseVideo = preference === 'image' && isVideoEligible
    const showVideo = canUseVideo && !videoEnded

    return (
        <div className={`absolute inset-0 transition-opacity duration-1000 ${preference === 'image' ? 'opacity-100' : 'opacity-0'}`}>
            <img
                src="/dossie.jpg"
                alt=""
                className={`absolute inset-0 w-full h-full object-cover fixed transition-opacity duration-700 ${showVideo ? 'opacity-0' : 'opacity-30'}`}
            />
            {canUseVideo && (
                <video
                    autoPlay
                    muted
                    playsInline
                    preload="auto"
                    onEnded={() => setVideoEnded(true)}
                    onError={() => setVideoEnded(true)}
                    className={`absolute inset-0 w-full h-full object-cover fixed transition-opacity duration-700 ${
                        showVideo ? 'opacity-55' : 'opacity-0'
                    }`}
                    aria-hidden="true"
                >
                    <source src="/dossie-reverse.mp4" type="video/mp4" />
                </video>
            )}
            <div className={`absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/75 to-slate-950/90 transition-opacity duration-700 ${showVideo ? 'opacity-100' : 'opacity-0'}`} />
            <div className={`absolute inset-0 bg-gradient-to-b from-slate-950/80 via-slate-950/90 to-slate-950 transition-opacity duration-700 ${showVideo ? 'opacity-0' : 'opacity-100'}`} />
        </div>
    )
}
