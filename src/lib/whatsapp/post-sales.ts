/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'

type EnsurePostSaleTrackingInput = {
  tenantId: string
  storeId: number
  serviceOrderId: number
  interactionSummary: string
  interactionType?: string
  /**
   * Quando true, NAO insere a interacao de acompanhamento. O caller e responsavel
   * por registra-la no momento adequado (ex.: apos o envio efetivo da mensagem).
   * Util para nao registrar "disparo" antes da confirmacao do envio.
   */
  skipInteraction?: boolean
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
    .eq('store_id', input.storeId)
    .eq('tenant_id', input.tenantId)
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
      .eq('store_id', input.storeId)
      .eq('tenant_id', input.tenantId)

    if (updateError) throw updateError
  }

  if (input.skipInteraction) {
    return { postSalesId }
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

  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error('Avaliacao de pos-venda deve estar entre 1 e 5.')
  }

  const { data: target, error: targetError } = await (supabase.from('post_sales') as any)
    .select('id')
    .eq('id', input.postSalesId)
    .eq('store_id', input.storeId)
    .eq('tenant_id', input.tenantId)
    .maybeSingle()
  if (targetError) throw targetError
  if (!target?.id) throw new Error('Pos-venda nao encontrado para esta loja.')

  const { error: updateError } = await (supabase.from('post_sales') as any)
    .update({
      status: 'Concluido',
      avaliacao_cliente: input.rating,
      observacoes_finais: input.finalObservation || 'Concluido automaticamente via WhatsApp.',
      updated_at: nowIso,
    })
    .eq('id', input.postSalesId)
    .eq('store_id', input.storeId)
    .eq('tenant_id', input.tenantId)

  if (updateError) throw updateError

  const summaries = [
    'Cliente respondeu positivamente ao acompanhamento automatico.',
    `Cliente atribuiu nota ${input.rating} no acompanhamento automatico.`,
  ]
  const { data: existingInteractions, error: existingInteractionsError } = await (supabase.from('post_sales_interactions') as any)
    .select('resumo')
    .eq('post_sales_id', input.postSalesId)
    .in('resumo', summaries)
  if (existingInteractionsError) throw existingInteractionsError

  const existingSummaries = new Set((existingInteractions ?? []).map((interaction: any) => interaction.resumo))
  const missingInteractions = summaries
    .filter((summary) => !existingSummaries.has(summary))
    .map((summary) => ({
      tenant_id: input.tenantId,
      store_id: input.storeId,
      post_sales_id: input.postSalesId,
      registrado_por_id: null,
      tipo_contato: 'WhatsApp Automático',
      resumo: summary,
    }))

  if (missingInteractions.length > 0) {
    const { error: interactionError } = await (supabase.from('post_sales_interactions') as any)
      .insert(missingInteractions)
    if (interactionError) throw interactionError
  }
}
