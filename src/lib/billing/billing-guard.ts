import 'server-only'

import { getStoreBillingStatus } from '@/lib/billing/integracao-asaas'

export type NewSaleBillingGuard = { blocked: boolean; message?: string }

export async function getNewSaleBillingGuard(storeId: number): Promise<NewSaleBillingGuard> {
  try {
    const status = await getStoreBillingStatus(storeId)
    const blocked = status.status === 'bloqueado' || (status.shouldBlockNewOperations && status.blockScope === 'new_operations_only')
    return blocked
      ? { blocked: true, message: 'Novas vendas estão bloqueadas por atraso na mensalidade. Consulte o aviso de cobrança para regularizar o acesso.' }
      : { blocked: false }
  } catch (error) {
    console.error('[Cobrança] Não foi possível validar o status da loja:', error)
    return { blocked: false }
  }
}
