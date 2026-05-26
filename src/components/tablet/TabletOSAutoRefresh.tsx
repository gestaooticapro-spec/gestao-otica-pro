'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function TabletOSAutoRefresh() {
  const router = useRouter()

  useEffect(() => {
    const refresh = () => router.refresh()
    const onVisibilityChange = () => {
      if (!document.hidden) refresh()
    }

    const timer = window.setInterval(refresh, 15000)
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [router])

  return null
}
