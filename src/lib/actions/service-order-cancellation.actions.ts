'use server'

import { createAdminClient } from '@/lib/supabase/admin'

type CloseOpenServiceOrdersParams = {
  vendaId: number
  storeId: number
  reason: string
  kind: 'cancelamento' | 'abandono'
  userId?: string | null
}

export async function closeOpenServiceOrdersForVenda({
  vendaId,
  storeId,
  reason,
  kind,
  userId = null,
}: CloseOpenServiceOrdersParams) {
  const supabaseAdmin = createAdminClient()
  const now = new Date().toISOString()
  const normalizedReason = reason.trim() || `Venda #${vendaId} encerrada por ${kind}.`
  const { data: orders, error: selectError } = await (supabaseAdmin.from('service_orders') as any)
    .select('id, obs_os')
    .eq('venda_id', vendaId)
    .eq('store_id', storeId)
    .is('dt_entregue_em', null)

  if (selectError) throw selectError

  const note = `[FLUXO DE LABORATÓRIO ENCERRADO - ${kind.toUpperCase()} - ${new Date().toLocaleDateString('pt-BR')}]: ${normalizedReason}`
  for (const order of orders || []) {
    const { error } = await (supabaseAdmin.from('service_orders') as any)
      .update({
        obs_os: order.obs_os ? `${order.obs_os}\n${note}` : note,
        lab_encerrada_em: now,
        lab_encerrada_tipo: kind,
        lab_encerrada_motivo: normalizedReason,
        lab_encerrada_por_id: userId,
      })
      .eq('id', order.id)
      .eq('store_id', storeId)
    if (error) throw error
  }

  return { count: (orders || []).length }
}
