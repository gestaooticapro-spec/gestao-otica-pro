// Caminho: src/lib/actions/postsales.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

// TIPO ATUALIZADO COM DADOS FINANCEIROS
export type PostSaleQueueItem = {
  os_id: number
  venda_id: number // Novo
  dt_entregue: string
  dias_desde_entrega: number
  titular_nome: string
  titular_tel: string | null
  dependente_nome: string | null
  resumo_lente: string
  post_sales_id: number | null
  status: string
  // Dados Financeiros
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
  registrado_por_id: string
}

// 1. BUSCAR FILA DE PÓS-VENDA (ATUALIZADA)
export async function getFilaPosVenda(storeId: number) {
  const supabaseAdmin = createAdminClient()
  
  const hoje = new Date()
  // Regra: Entregue há pelo menos 7 dias
  const dataCorte = new Date(hoje.setDate(hoje.getDate() - 7)).toISOString()

  try {
    // CORREÇÃO: Cast 'as any' para permitir joins complexos (vendas, post_sales)
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
        return ps?.status !== 'Concluido'
      })
      .map((os: any) => {
        const entregueEm = new Date(os.dt_entregue_em).getTime()
        const diffDias = Math.floor((Date.now() - entregueEm) / (1000 * 60 * 60 * 24))
        const ps = os.post_sales?.[0]
        
        // Extração Segura da Venda
        const venda = os.vendas || {}

        return {
          os_id: os.id,
          venda_id: venda.id, // Novo
          dt_entregue: os.dt_entregue_em,
          dias_desde_entrega: diffDias,
          titular_nome: os.customers?.full_name || 'Cliente',
          titular_tel: os.customers?.fone_movel || null,
          dependente_nome: os.dependentes?.full_name || os.customers?.full_name || 'Mesmo',
          resumo_lente: os.receita_adicao ? 'Multifocal' : 'Visão Simples',
          post_sales_id: ps?.id || null,
          status: ps?.status || 'Pendente',
          // Mapping Financeiro
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

  // CORREÇÃO: Cast 'as any' no profile para acessar tenant_id
  const profile = await getProfileByAdmin(user.id) as any
  if (!profile?.tenant_id) return { success: false, message: 'Perfil erro' }

  const osId = parseInt(formData.get('os_id') as string)
  const tipo = formData.get('tipo') as string
  const resumo = formData.get('resumo') as string
  
  let postSalesId = formData.get('post_sales_id') && formData.get('post_sales_id') !== 'null' 
    ? parseInt(formData.get('post_sales_id') as string) 
    : null

  const supabaseAdmin = createAdminClient()

  try {
    if (!postSalesId) {
      // CORREÇÃO: Cast 'as any' no insert em post_sales
      const { data: novoPai, error } = await (supabaseAdmin
        .from('post_sales') as any)
        .insert({
          tenant_id: profile.tenant_id,
          store_id: profile.store_id!,
          service_order_id: osId,
          status: 'Em Acompanhamento'
        })
        .select('id')
        .single()
      if (error || !novoPai) throw new Error("Erro ao iniciar")
      postSalesId = novoPai.id
    } else {
      // CORREÇÃO: Cast 'as any' no update
      await (supabaseAdmin.from('post_sales') as any)
        .update({ status: 'Em Acompanhamento', updated_at: new Date().toISOString() })
        .eq('id', postSalesId)
    }

    // CORREÇÃO: Cast 'as any' no insert da interação
    await (supabaseAdmin.from('post_sales_interactions') as any).insert({
      tenant_id: profile.tenant_id,
      store_id: profile.store_id!,
      post_sales_id: postSalesId,
      registrado_por_id: user.id,
      tipo_contato: tipo,
      resumo: resumo
    })

    revalidatePath(`/dashboard/loja/${profile.store_id}/pos-venda`)
    return { success: true, message: 'Interação registrada.' }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function concludePostSale(formData: FormData) {
  const supabaseAdmin = createAdminClient()
  const psId = parseInt(formData.get('post_sales_id') as string)
  const storeId = parseInt(formData.get('store_id') as string)

  try {
    // CORREÇÃO: Cast 'as any' no update
    await (supabaseAdmin.from('post_sales') as any).update({
        status: 'Concluido',
        avaliacao_cliente: parseInt(formData.get('nota') as string),
        observacoes_finais: formData.get('obs') as string,
        updated_at: new Date().toISOString()
      }).eq('id', psId)

    revalidatePath(`/dashboard/loja/${storeId}/pos-venda`)
    return { success: true, message: 'Concluído!' }
  } catch (e: any) { return { success: false, message: e.message } }
}

export async function getInteractions(postSalesId: number | null) {
    if (!postSalesId) return []
    const supabaseAdmin = createAdminClient()
    
    // CORREÇÃO: Cast 'as any' no select
    const { data } = await (supabaseAdmin.from('post_sales_interactions') as any)
        .select('*')
        .eq('post_sales_id', postSalesId)
        .order('created_at', { ascending: false })
    
    return data as Interaction[]
}

// ==============================================================================
// NOVA ACTION: BUSCAR DETALHES COMPLETOS (RAIO-X) PARA O MODAL
// ==============================================================================
export async function getPostSaleDetails(osId: number) {
  const supabaseAdmin = createAdminClient()
  try {
    // CORREÇÃO: Cast 'as any' para permitir joins aninhados
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
      .single()

    if (error) throw error
  
    return { success: true, data }
  } catch (e: any) {
    console.error("Erro detalhes pos-venda:", e)
    return { success: false, message: e.message }
  }
}