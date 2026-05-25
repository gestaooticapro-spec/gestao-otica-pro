export type AppMode = 'mvp' | 'full'

type StoreSettingsLike = {
  app_mode?: unknown
} | null | undefined

export function getStoreAppMode(settings: unknown): AppMode {
  if (!settings || typeof settings !== 'object') return 'full'

  const appMode = (settings as StoreSettingsLike)?.app_mode
  return appMode === 'mvp' || appMode === 'full' ? appMode : 'full'
}

export function isMvpRouteAllowed(pathname: string, storeId: number): boolean {
  const base = `/dashboard/loja/${storeId}`
  const allowedExact = new Set([
    base,
    `${base}/atendimento`,
    `${base}/pdv-express`,
    `${base}/clientes`,
    `${base}/entrega`,
    `${base}/cadastros`,
    `${base}/lentes/mapa-calor`,
    `${base}/financeiro/caixa`,
    `${base}/vendas`,
    `${base}/config`,
  ])

  if (allowedExact.has(pathname)) return true

  const allowedPrefixes = [
    `${base}/cliente/`,
    `${base}/vendas/`,
  ]

  return allowedPrefixes.some(prefix => pathname.startsWith(prefix))
}

export function isMvpMode(mode: AppMode): boolean {
  return mode === 'mvp'
}
