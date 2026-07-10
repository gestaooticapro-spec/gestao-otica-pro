'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

type BackButtonProps = {
  title?: string
  fallbackHref?: string
}

export default function BackButton({ title = 'Voltar', fallbackHref }: BackButtonProps) {
  const router = useRouter()
  const handleBack = () => {
    if (typeof window !== 'undefined') {
      const hasHistory = window.history.length > 1
      const hasSameOriginReferrer = (() => {
        if (!document.referrer) return false
        try {
          return new URL(document.referrer).origin === window.location.origin
        } catch {
          return false
        }
      })()

      if (hasHistory && hasSameOriginReferrer) {
        router.back()
        return
      }
    }

    if (fallbackHref) {
      router.push(fallbackHref)
      return
    }

    router.back()
  }

  return (
    <button
      onClick={handleBack}
      className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-slate-400 hover:text-white transition-all active:scale-95"
      title={title}
    >
      <ArrowLeft className="h-4 w-4" />
    </button>
  )
}
