import 'server-only'

export type BillingStoreStatus = {
  store?: {
    store_id: string
    store_name: string
    monthly_amount: number
    paid_until: string | null
    payment_qr_code?: string | null
    payment_copy_paste?: string | null
  }
  status: 'ativo' | 'pendente' | 'bloqueado' | 'liberado' | 'vip'
  reason?: string
  effectiveAccessUntil?: string | null
  overdueSince?: string | null
  blockAfter?: string | null
  daysPastDue?: number
  daysUntilDue?: number | null
  paymentDueSoon?: boolean
  shouldShowBillingReminder: boolean
  shouldBlockNewOperations: boolean
  blockScope: 'none' | 'new_operations_only'
}

type BillingGatewayStoreInput = { id: number; name: string; cnpj?: string | null }
const SYNC_CACHE_TTL_MS = 5 * 60_000
const syncCache = new Map<string, number>()

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ausente: ${name}`)
  return value
}

function getGatewayConfig() {
  return {
    baseUrl: getRequiredEnv('NUVEM_LOCAL_COBRANCA_API_URL').replace(/\/$/, ''),
    clientKey: getRequiredEnv('NUVEM_LOCAL_COBRANCA_CLIENT_KEY'),
    clientSecret: getRequiredEnv('NUVEM_LOCAL_COBRANCA_CLIENT_SECRET'),
  }
}

function unregisteredStoreStatus(storeId: number): BillingStoreStatus {
  return {
    store: { store_id: String(storeId), store_name: '', monthly_amount: 0, paid_until: null, payment_qr_code: null, payment_copy_paste: null },
    status: 'ativo', reason: 'store_not_registered', effectiveAccessUntil: null, overdueSince: null, blockAfter: null,
    daysPastDue: 0, daysUntilDue: null, paymentDueSoon: false, shouldShowBillingReminder: false,
    shouldBlockNewOperations: false, blockScope: 'none',
  }
}

function normalizeStatus(storeId: number, payload: unknown): BillingStoreStatus {
  const data = payload as Partial<BillingStoreStatus>
  if (data.reason === 'store_not_registered') return unregisteredStoreStatus(storeId)

  const statuses = new Set<BillingStoreStatus['status']>(['ativo', 'pendente', 'bloqueado', 'liberado', 'vip'])
  const scopes = new Set<BillingStoreStatus['blockScope']>(['none', 'new_operations_only'])
  if (!statuses.has(data.status as BillingStoreStatus['status'])) throw new Error('Gateway retornou status de cobrança inválido.')
  if (typeof data.shouldShowBillingReminder !== 'boolean' || typeof data.shouldBlockNewOperations !== 'boolean') throw new Error('Gateway retornou regras de cobrança inválidas.')
  if (!scopes.has(data.blockScope as BillingStoreStatus['blockScope'])) throw new Error('Gateway retornou escopo de bloqueio inválido.')
  return data as BillingStoreStatus
}

export async function getStoreBillingStatus(storeId: number): Promise<BillingStoreStatus> {
  const { baseUrl, clientKey, clientSecret } = getGatewayConfig()
  const response = await fetch(`${baseUrl}/api/stores/${encodeURIComponent(String(storeId))}/status`, {
    headers: { 'x-client-key': clientKey, 'x-client-secret': clientSecret }, cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok && (data as { reason?: string }).reason !== 'store_not_registered') {
    throw new Error((data as { error?: string }).error || `Gateway respondeu com status ${response.status}`)
  }
  return normalizeStatus(storeId, data)
}

async function isStoreRegisteredInGateway(storeId: number, config: ReturnType<typeof getGatewayConfig>) {
  const response = await fetch(`${config.baseUrl}/api/stores/${encodeURIComponent(String(storeId))}/status`, {
    headers: { 'x-client-key': config.clientKey, 'x-client-secret': config.clientSecret },
    cache: 'no-store',
  })

  if (response.ok) return true

  const data = await response.json().catch(() => ({}))
  if (response.status === 404 && (data as { reason?: string }).reason === 'store_not_registered') return false

  throw new Error((data as { error?: string }).error || `Gateway respondeu com status ${response.status}`)
}

export async function syncStoreWithBillingGateway(store: BillingGatewayStoreInput) {
  const syncKey = `${store.id}:${store.name}:${store.cnpj || ''}`
  const lastSyncAt = syncCache.get(syncKey)
  if (lastSyncAt && lastSyncAt + SYNC_CACHE_TTL_MS > Date.now()) return

  const config = getGatewayConfig()
  const isNewStore = !(await isStoreRegisteredInGateway(store.id, config))
  const response = await fetch(`${config.baseUrl}/api/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-key': config.clientKey, 'x-client-secret': config.clientSecret },
    body: JSON.stringify({
      storeId: String(store.id),
      storeName: store.name,
      storeDocument: store.cnpj || null,
      active: true,
      ...(isNewStore ? { isVip: true } : {}),
    }),
    cache: 'no-store',
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error || `Gateway respondeu com status ${response.status}`)
  }

  syncCache.set(syncKey, Date.now())
}
