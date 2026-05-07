'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Detecta tablet por toque + largura de tela.
 * Se o usuário tiver forçado modo desktop (via localStorage), não redireciona.
 */
export function TabletRedirect({ storeId }: { storeId: number }) {
  const router = useRouter()

  useEffect(() => {
    // Usuário optou por manter modo desktop neste dispositivo
    if (localStorage.getItem('forceDesktop') === '1') return

    const hasTouch = navigator.maxTouchPoints > 1
    const isNarrow = window.screen.width <= 1366

    if (hasTouch && isNarrow) {
      router.replace(`/tablet/${storeId}`)
    }
  }, [storeId, router])

  return null
}
