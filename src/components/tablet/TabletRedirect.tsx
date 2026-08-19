'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Detecta tablet por toque + largura de tela.
 * Se o usuario tiver forcado modo desktop na sessao atual, nao redireciona.
 */
export function TabletRedirect({ storeId }: { storeId: number }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    // O menu operacional do tablet usa a própria rota do dashboard com um
    // estado explícito na query. Não redirecionar esses estados de volta ao
    // menu inicial do tablet.
    const menu = searchParams.get('menu')
    if (menu === 'operacao' || menu === 'atendimento' || menu === 'loja-vazia') return

    // Permite navegar para rotas liberadas do dashboard sem loop de redirecionamento.
    const allowedTabletDashboardRoutePrefixes = [
      `/dashboard/loja/${storeId}/tabela-precos`,
      `/dashboard/loja/${storeId}/lentes/mapa-calor`,
      `/dashboard/loja/${storeId}/lentes/visualizar`,
      `/dashboard/loja/${storeId}/lentes/campo-focal`,
      `/dashboard/loja/${storeId}/visagismo`,
    ]
    if (allowedTabletDashboardRoutePrefixes.some((routePrefix) => pathname.startsWith(routePrefix))) {
      return
    }

    // Limpa configuracao antiga persistente para evitar ficar preso no desktop.
    localStorage.removeItem('forceDesktop')

    // Usuario optou por manter modo desktop apenas nesta sessao.
    if (sessionStorage.getItem('forceDesktop') === '1') return

    const hasTouch = navigator.maxTouchPoints > 1
    const isNarrow = window.screen.width <= 1366

    if (hasTouch && isNarrow) {
      router.replace(`/tablet/${storeId}`)
    }
  }, [storeId, router, pathname, searchParams])

  return null
}
