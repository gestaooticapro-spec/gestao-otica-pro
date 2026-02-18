'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

export function BackButton() {
    const router = useRouter()

    return (
        <button
            onClick={() => router.back()}
            className="p-2 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors border border-white/5"
        >
            <ArrowLeft className="w-5 h-5" />
        </button>
    )
}
