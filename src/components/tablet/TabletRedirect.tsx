'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

/**
 * Detecta tablet por toque + largura de tela.
 * Se o usuario tiver forcado modo desktop na sessao atual, nao redireciona.
 */
export function TabletRedirect({ storeId }: { storeId: number }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Permite navegar para a tabela de preços a partir do menu tablet sem loop de redirecionamento.
    if (pathname === `/dashboard/loja/${storeId}/tabela-precos`) return

    // Limpa configuracao antiga persistente para evitar ficar preso no desktop.
    localStorage.removeItem('forceDesktop')

    // Usuario optou por manter modo desktop apenas nesta sessao.
    if (sessionStorage.getItem('forceDesktop') === '1') return

    const hasTouch = navigator.maxTouchPoints > 1
    const isNarrow = window.screen.width <= 1366

    if (hasTouch && isNarrow) {
      router.replace(`/tablet/${storeId}`)
    }
  }, [storeId, router, pathname])

  return null
}
