/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'

type EnsurePostSaleTrackingInput = {
  tenantId: string
  storeId: number
  serviceOrderId: number
  interactionSummary: string
  interactionType?: string
}

type ConcludePostSaleFromWhatsAppInput = {
  tenantId: string
  storeId: number
  postSalesId: number
  rating: number
  finalObservation?: string | null
}

export async function ensurePostSaleTracking(input: EnsurePostSaleTrackingInput) {
  const supabase = createAdminClient()
  const interactionType = input.interactionType || 'WhatsApp Automático'
  const nowIso = new Date().toISOString()

  const { data: existing, error: existingError } = await (supabase.from('post_sales') as any)
    .select('id, status')
    .eq('service_order_id', input.serviceOrderId)
    .maybeSingle()

  if (existingError) throw existingError

  let postSalesId = Number(existing?.id || 0)
  if (!postSalesId) {
    const { data: inserted, error: insertError } = await (supabase.from('post_sales') as any)
      .insert({
        tenant_id: input.tenantId,
        store_id: input.storeId,
        service_order_id: input.serviceOrderId,
        status: 'Em Acompanhamento',
        updated_at: nowIso,
      })
      .select('id')
      .single()

    if (insertError) throw insertError
    postSalesId = inserted.id
  } else if (existing?.status !== 'Concluido') {
    const { error: updateError } = await (supabase.from('post_sales') as any)
      .update({
        status: 'Em Acompanhamento',
        updated_at: nowIso,
      })
      .eq('id', postSalesId)

    if (updateError) throw updateError
  }

  const { error: interactionError } = await (supabase.from('post_sales_interactions') as any)
    .insert({
      tenant_id: input.tenantId,
      store_id: input.storeId,
      post_sales_id: postSalesId,
      registrado_por_id: null,
      tipo_contato: interactionType,
      resumo: input.interactionSummary,
    })

  if (interactionError) throw interactionError

  return { postSalesId }
}

export async function concludePostSaleFromWhatsApp(input: ConcludePostSaleFromWhatsAppInput) {
  const supabase = createAdminClient()
  const nowIso = new Date().toISOString()

  const { error: updateError } = await (supabase.from('post_sales') as any)
    .update({
      status: 'Concluido',
      avaliacao_cliente: input.rating,
      observacoes_finais: input.finalObservation || 'Concluido automaticamente via WhatsApp.',
      updated_at: nowIso,
    })
    .eq('id', input.postSalesId)

  if (updateError) throw updateError

  const { error: interactionError } = await (supabase.from('post_sales_interactions') as any)
    .insert([
      {
        tenant_id: input.tenantId,
        store_id: input.storeId,
        post_sales_id: input.postSalesId,
        registrado_por_id: null,
        tipo_contato: 'WhatsApp Automático',
        resumo: 'Cliente respondeu positivamente ao acompanhamento automatico.',
      },
      {
        tenant_id: input.tenantId,
        store_id: input.storeId,
        post_sales_id: input.postSalesId,
        registrado_por_id: null,
        tipo_contato: 'WhatsApp Automático',
        resumo: `Cliente atribuiu nota ${input.rating} no acompanhamento automatico.`,
      },
    ])

  if (interactionError) throw interactionError
}
