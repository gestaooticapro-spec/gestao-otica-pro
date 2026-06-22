// Caminho: src/lib/actions/postsales.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'
import {
  buildPostSaleFollowupSettings,
  DEFAULT_POST_SALE_FOLLOWUP_DAYS,
} from '@/lib/whatsapp/post-sale-followup'

// TIPO ATUALIZADO COM DADOS FINANCEIROS E LENTES
export type PostSaleQueueItem = {
  os_id: number
  venda_id: number
  dt_entregue: string
  dias_desde_entrega: number
  titular_nome: string
  titular_tel: string | null
  dependente_nome: string | null
  resumo_lente: string
  lente_od: string | null
  lente_oe: string | null
  post_sales_id: number | null
  status: string
  valor_final: number
  valor_restante: number
  status_venda: string
  tem_carne: boolean
}

export type Interaction = {
  id: number
  created_at: string
  tipo_contato: string
  resumo: string
  registrado_por_id: string | null
}

function canAccessStore(profile: any, storeId: number) {
  return profile?.role === 'admin' || Number(profile?.store_id) === storeId
}

// 1. BUSCAR FILA DE PÓS-VENDA
export async function getFilaPosVenda(storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !Number.isFinite(storeId)) return []

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id || !canAccessStore(profile, storeId)) return []
  if (!(await isStoreModuleEnabledForStore(storeId, 'postSales'))) return []

  const supabaseAdmin = createAdminClient()

  // Respeita o mesmo days_after_delivery configurado para a automação de
  // follow-up, para alinhar a fila manual com o disparo automatico. Fallback
  // para o default (7 dias) caso nao haja settings configuradas.
  const { data: storeRow } = await (supabaseAdmin.from('stores') as any)
    .select('settings')
    .eq('id', storeId)
    .eq('tenant_id', profile.tenant_id)
    .maybeSingle()
  const storeSettings: any = storeRow?.settings || {}
  const followupSettings = buildPostSaleFollowupSettings(
    storeSettings.whatsapp_automation?.post_sale_followup
  )
  const daysAfterDelivery = followupSettings.days_after_delivery || DEFAULT_POST_SALE_FOLLOWUP_DAYS

  const hoje = new Date()
  const dataCorte = new Date(hoje.setDate(hoje.getDate() - daysAfterDelivery)).toISOString()

  try {
    const { data: oss, error } = await (supabaseAdmin
      .from('service_orders') as any)
      .select(`
        id, 
        dt_entregue_em, 
        receita_longe_od_esferico, 
        receita_adicao,
        customers ( full_name, fone_movel ),
        dependente_id,
        dependentes ( full_name ),
        post_sales ( id, status ),
        vendas ( id, valor_final, valor_restante, status, financiamento_id )
      `)
      .eq('store_id', storeId)
      .eq('tenant_id', profile.tenant_id)
      .not('dt_entregue_em', 'is', null)
      .lte('dt_entregue_em', dataCorte)
      .order('dt_entregue_em', { ascending: true })

    if (error) {
      console.error("Erro Supabase:", error.message)
      return []
    }
    if (!oss) return []

    const fila: PostSaleQueueItem[] = (oss as any[])
      .filter((os: any) => {
        const ps = os.post_sales?.[0]
        const vendaStatus = os.vendas?.status
        if (vendaStatus === 'Devolvida' || vendaStatus === 'Cancelada') return false
        return ps?.status !== 'Concluido'
      })
      .map((os: any) => {
        const entregueEm = new Date(os.dt_entregue_em).getTime()
        const diffDias = Math.floor((Date.now() - entregueEm) / (1000 * 60 * 60 * 24))
        const ps = os.post_sales?.[0]
        const venda = os.vendas || {}

        return {
          os_id: os.id,
          venda_id: venda.id,
          dt_entregue: os.dt_entregue_em,
          dias_desde_entrega: diffDias,
          titular_nome: os.customers?.full_name || 'Cliente',
          titular_tel: os.customers?.fone_movel || null,
          dependente_nome: os.dependentes?.full_name || os.customers?.full_name || 'Mesmo',
          resumo_lente: os.receita_adicao ? 'Multifocal' : 'Visão Simples',
          lente_od: null, // Detalhes disponíveis no modal "Ver Detalhes"
          lente_oe: null, // Detalhes disponíveis no modal "Ver Detalhes"
          post_sales_id: ps?.id || null,
          status: ps?.status || 'Pendente',
          valor_final: venda.valor_final || 0,
          valor_restante: venda.valor_restante || 0,
          status_venda: venda.status || 'Desconhecido',
          tem_carne: !!venda.financiamento_id
        }
      })

    return fila
  } catch (e) {
    console.error("Erro crítico fila pos venda:", e)
    return []
  }
}

export async function saveInteraction(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Login necessário' }

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id) return { success: false, message: 'Perfil erro' }

  const storeId = parseInt(formData.get('store_id') as string)
  if (!Number.isFinite(storeId) || !canAccessStore(profile, storeId)) {
    return { success: false, message: 'Loja invalida para esta sessao.' }
  }
  if (!(await isStoreModuleEnabledForStore(storeId, 'postSales'))) {
    return { success: false, message: 'Modulo de pos-venda desativado para esta loja.' }
  }

  const osId = parseInt(formData.get('os_id') as string)
  const tipo = String(formData.get('tipo') || '').trim()
  const resumo = String(formData.get('resumo') || '').trim()
  if (!Number.isFinite(osId) || !tipo || !resumo) {
    return { success: false, message: 'Informe a OS, o tipo de contato e o resumo.' }
  }

  let postSalesId = formData.get('post_sales_id') && formData.get('post_sales_id') !== 'null'
    ? parseInt(formData.get('post_sales_id') as string)
    : null

  const supabaseAdmin = createAdminClient()

  try {
    const { data: serviceOrder, error: serviceOrderError } = await (supabaseAdmin.from('service_orders') as any)
      .select('id, store_id, tenant_id')
      .eq('id', osId)
      .maybeSingle()
    if (serviceOrderError) throw serviceOrderError
    if (
      !serviceOrder
      || serviceOrder.store_id !== storeId
      || serviceOrder.tenant_id !== profile.tenant_id
    ) {
      return { success: false, message: 'OS nao encontrada para esta loja.' }
    }

    if (postSalesId) {
      const { data: existingPostSale, error: existingPostSaleError } = await (supabaseAdmin.from('post_sales') as any)
        .select('id, service_order_id, store_id, tenant_id')
        .eq('id', postSalesId)
        .maybeSingle()
      if (existingPostSaleError) throw existingPostSaleError
      if (
        !existingPostSale
        || existingPostSale.service_order_id !== osId
        || existingPostSale.store_id !== storeId
        || existingPostSale.tenant_id !== profile.tenant_id
      ) {
        return { success: false, message: 'Pos-venda nao encontrado para esta OS.' }
      }
    }

    if (!postSalesId) {
      const { data: existingByOrder, error: existingByOrderError } = await (supabaseAdmin.from('post_sales') as any)
        .select('id')
        .eq('service_order_id', osId)
        .eq('store_id', storeId)
        .eq('tenant_id', profile.tenant_id)
        .limit(1)
        .maybeSingle()
      if (existingByOrderError) throw existingByOrderError
      postSalesId = existingByOrder?.id ?? null
    }

    if (!postSalesId) {
      const { data: novoPai, error } = await (supabaseAdmin
        .from('post_sales') as any)
        .insert({
          tenant_id: profile.tenant_id,
          store_id: storeId,
          service_order_id: osId,
          status: 'Em Acompanhamento'
        })
        .select('id')
        .single()
      if (error) throw error
      if (!novoPai) throw new Error("Erro ao iniciar")
      postSalesId = novoPai.id
    } else {
      const { error: updateError } = await (supabaseAdmin.from('post_sales') as any)
        .update({ status: 'Em Acompanhamento', updated_at: new Date().toISOString() })
        .eq('id', postSalesId)
        .eq('store_id', storeId)
        .eq('tenant_id', profile.tenant_id)
      if (updateError) throw updateError
    }

    const { error: interactionError } = await (supabaseAdmin.from('post_sales_interactions') as any).insert({
      tenant_id: profile.tenant_id,
      store_id: storeId,
      post_sales_id: postSalesId,
      registrado_por_id: user.id,
      tipo_contato: tipo,
      resumo: resumo
    })
    if (interactionError) throw interactionError

    revalidatePath(`/dashboard/loja/${storeId}/pos-venda`)
    return { success: true, message: 'Interação registrada.', post_sales_id: postSalesId }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function concludePostSale(formData: FormData) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Login necessário' }

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id) {
    return { success: false, message: 'Perfil inválido.' }
  }

  const supabaseAdmin = createAdminClient()
  const psId = parseInt(formData.get('post_sales_id') as string)
  const storeId = parseInt(formData.get('store_id') as string)
  const rating = parseInt(formData.get('nota') as string)

  // storeId do form deve bater com o da sessão (anti-troca de loja).
  if (!Number.isFinite(psId) || !Number.isFinite(storeId) || !canAccessStore(profile, storeId)) {
    return { success: false, message: 'Loja inválida para esta sessão.' }
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, message: 'Avaliacao deve ser uma nota de 1 a 5.' }
  }
  if (!(await isStoreModuleEnabledForStore(storeId, 'postSales'))) {
    return { success: false, message: 'Modulo de pos-venda desativado para esta loja.' }
  }

  try {
    // Validar posse: o post_sales pertence à mesma loja/tenant do usuário.
    const { data: target, error: targetError } = await (supabaseAdmin.from('post_sales') as any)
      .select('store_id, tenant_id')
      .eq('id', psId)
      .maybeSingle()
    if (targetError) throw targetError
    if (!target || target.store_id !== storeId || target.tenant_id !== profile.tenant_id) {
      return { success: false, message: 'Pós-venda não encontrado para esta loja.' }
    }

    const { error: updateError } = await (supabaseAdmin.from('post_sales') as any).update({
      status: 'Concluido',
      avaliacao_cliente: rating,
      observacoes_finais: formData.get('obs') as string,
      updated_at: new Date().toISOString()
    })
      .eq('id', psId)
      .eq('store_id', storeId)
      .eq('tenant_id', profile.tenant_id)
    if (updateError) throw updateError

    revalidatePath(`/dashboard/loja/${storeId}/pos-venda`)
    return { success: true, message: 'Concluído!' }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function getInteractions(postSalesId: number | null) {
  if (!postSalesId) return []
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id) return []

  const supabaseAdmin = createAdminClient()

  const { data: postSale, error: postSaleError } = await (supabaseAdmin.from('post_sales') as any)
    .select('store_id, tenant_id')
    .eq('id', postSalesId)
    .maybeSingle()
  if (postSaleError) return []

  if (
    !postSale?.store_id
    || !canAccessStore(profile, postSale.store_id)
    || postSale.tenant_id !== profile.tenant_id
    || !(await isStoreModuleEnabledForStore(postSale.store_id, 'postSales'))
  ) return []

  const { data, error: interactionsError } = await (supabaseAdmin.from('post_sales_interactions') as any)
    .select('*')
    .eq('post_sales_id', postSalesId)
    .order('created_at', { ascending: false })
  if (interactionsError) return []

  return data as Interaction[]
}

export async function getPostSaleDetails(osId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Login necessário' }

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id) {
    return { success: false, message: 'Perfil inválido.' }
  }

  const supabaseAdmin = createAdminClient()
  try {
    const { data: osStore } = await (supabaseAdmin.from('service_orders') as any)
      .select('store_id, tenant_id')
      .eq('id', osId)
      .maybeSingle()

    if (
      !osStore?.store_id
      || !canAccessStore(profile, osStore.store_id)
      || osStore.tenant_id !== profile.tenant_id
      || !(await isStoreModuleEnabledForStore(osStore.store_id, 'postSales'))
    ) {
      return { success: false, message: 'Modulo de pos-venda desativado para esta loja.' }
    }

    const { data, error } = await (supabaseAdmin
      .from('service_orders') as any)
      .select(`
        *,
        customers ( full_name ),
        dependentes ( full_name ),
        vendas (
          id, valor_total, valor_final, valor_restante, status, created_at,
          venda_itens ( item_tipo, descricao, valor_unitario )
        )
      `)
      .eq('id', osId)
      .eq('store_id', osStore.store_id)
      .eq('tenant_id', profile.tenant_id)
      .single()

    if (error) throw error

    return { success: true, data }
  } catch (e: any) {
    console.error("Erro detalhes pos-venda:", e)
    return { success: false, message: e.message }
  }
}

// ==============================================================================
// ATUALIZAR TELEFONE DO CLIENTE (via OS ID)
// ==============================================================================
export async function updateCustomerPhoneByOs(osId: number, newPhone: string, storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { success: false, message: 'Login necessário' }

  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id) {
    return { success: false, message: 'Perfil inválido.' }
  }

  // storeId do caller deve bater com o da sessão.
  if (!Number.isFinite(osId) || !canAccessStore(profile, storeId)) {
    return { success: false, message: 'Loja inválida para esta sessão.' }
  }
  if (!(await isStoreModuleEnabledForStore(storeId, 'postSales'))) {
    return { success: false, message: 'Modulo de pos-venda desativado para esta loja.' }
  }

  const supabaseAdmin = createAdminClient()

  try {
    const { data: os, error: osError } = await (supabaseAdmin
      .from('service_orders') as any)
      .select('customer_id, store_id, tenant_id')
      .eq('id', osId)
      .maybeSingle()

    if (osError || !os?.customer_id) {
      throw new Error('OS não encontrada')
    }
    // Validar posse da OS.
    if (os.store_id !== storeId || os.tenant_id !== profile.tenant_id) {
      return { success: false, message: 'OS não pertence a esta loja.' }
    }

    const { error: updateError } = await (supabaseAdmin
      .from('customers') as any)
      .update({ fone_movel: newPhone })
      .eq('id', os.customer_id)
      .eq('tenant_id', profile.tenant_id)

    if (updateError) throw updateError

    revalidatePath(`/dashboard/loja/${storeId}/pos-venda`)
    return { success: true, message: 'Telefone atualizado!' }
  } catch (e: any) {
    console.error("Erro ao atualizar telefone:", e)
    return { success: false, message: e.message }
  }
}
