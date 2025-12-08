// Caminho: src/lib/actions/collection.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// --- Tipos ---
export type DevedorResumo = {
  customer_id: number
  full_name: string
  fone_movel: string | null
  is_spc: boolean
  total_atrasado: number
  dias_atraso: number
  quantidade_parcelas_atrasadas: number
  vendas_afetadas: number[]
}

export type CobrancaHistoricoItem = Database['public']['Tables']['cobranca_historico']['Row']

// --- 1. BUSCAR LISTA DE INADIMPLENTES ---
export async function getInadimplentes(storeId: number, filtro: 'todos' | 'sem_spc' = 'todos') {
  const supabaseAdmin = createAdminClient()
  const hoje = new Date().toISOString().split('T')[0]

  try {
    // CORREÇÃO: Cast "as any" para evitar erro de tipagem nos joins complexos ou campos novos
    let query = (supabaseAdmin
      .from('financiamento_parcelas') as any)
      .select(`
        id,
        valor_parcela,
        data_vencimento,
        customer_id,
        status,
        financiamento_loja ( venda_id ), 
        customers!inner ( id, full_name, fone_movel, is_spc )
      `)
      .eq('store_id', storeId)
      .eq('status', 'Pendente')
      .lt('data_vencimento', hoje)
      .order('data_vencimento', { ascending: true })

    if (filtro === 'sem_spc') {
      // is_spc foi adicionado manualmente, o TS pode não reconhecer sem o cast anterior
      query = query.is('customers.is_spc', false)
    }

    const { data, error } = await query

    if (error) throw error
    if (!data) return []

    const mapaClientes = new Map<number, DevedorResumo>()

    data.forEach((parcela: any) => {
        const cust = parcela.customers
        if (!cust) return;

        // O ID da venda vem do objeto aninhado
        const vendaId = parcela.financiamento_loja?.venda_id;

        const vencimento = new Date(parcela.data_vencimento)
        const hojeDate = new Date()
      
        const diffTime = Math.abs(hojeDate.getTime() - vencimento.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

        if (!mapaClientes.has(cust.id)) {
            mapaClientes.set(cust.id, {
                customer_id: cust.id,
                full_name: cust.full_name,
                fone_movel: cust.fone_movel,
                is_spc: cust.is_spc ?? false,
                total_atrasado: 0,
                dias_atraso: 0,
                quantidade_parcelas_atrasadas: 0,
                vendas_afetadas: []
            })
        }

        const current = mapaClientes.get(cust.id)!
        current.total_atrasado += parcela.valor_parcela
        current.quantidade_parcelas_atrasadas += 1
        
        if (diffDays > current.dias_atraso) current.dias_atraso = diffDays
        
        if (vendaId && !current.vendas_afetadas.includes(vendaId)) {
            current.vendas_afetadas.push(vendaId)
        }
    })

    return Array.from(mapaClientes.values()).sort((a, b) => b.dias_atraso - a.dias_atraso)

  } catch (error: any) {
    console.error('Erro ao buscar inadimplentes:', error)
    return []
  }
}

// --- 2. REGISTRAR CONTATO (HISTÓRICO) ---
const CobrancaSchema = z.object({
    customer_id: z.coerce.number(),
    store_id: z.coerce.number(),
    venda_id: z.coerce.number().optional().nullable(),
    tipo_contato: z.string().min(1),
    resumo: z.string().min(3),
    proxima_acao: z.string().optional().nullable()
})

export async function registrarCobranca(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Usuário não logado' }

    type SimpleProfile = {
      store_id: number
      tenant_id: string | null
    }

    const profile = (await getProfileByAdmin(user.id)) as SimpleProfile | null

    if (!profile) {
      return { success: false, message: 'Perfil não encontrado' }
    }

    const validated = CobrancaSchema.safeParse({
        customer_id: formData.get('customer_id'),
        store_id: profile.store_id,
        venda_id: formData.get('venda_id'),
        tipo_contato: formData.get('tipo_contato'),
        resumo: formData.get('resumo'),
        proxima_acao: formData.get('proxima_acao') || null
    })

    if (!validated.success) return { success: false, message: 'Dados inválidos' }

    const supabaseAdmin = createAdminClient()
    
    try {
        // CORREÇÃO: Cast as any para permitir insert em cobranca_historico sem validação estrita
        await (supabaseAdmin.from('cobranca_historico') as any).insert({
            tenant_id: profile.tenant_id,
            store_id: profile.store_id,
            registrado_por_id: user.id,
            customer_id: validated.data.customer_id,
            venda_id: validated.data.venda_id,
            tipo_contato: validated.data.tipo_contato,
            resumo_conversa: validated.data.resumo,
            proxima_acao: validated.data.proxima_acao
        })

        revalidatePath(`/dashboard/loja/${profile.store_id}/cobranca`)
        return { success: true, message: 'Contato registrado!' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// --- 3. TOGGLE SPC ---
export async function toggleSpcStatus(customerId: number, currentStatus: boolean, storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        // CORREÇÃO: Cast as any pois is_spc foi adicionado via SQL manual
        await (supabaseAdmin.from('customers') as any)
            .update({ is_spc: !currentStatus })
            .eq('id', customerId)
        
        revalidatePath(`/dashboard/loja/${storeId}/cobranca`)
        return { success: true, message: `Cliente ${!currentStatus ? 'adicionado ao' : 'removido do'} SPC.` }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// --- 4. BUSCAR HISTÓRICO ---
export async function getHistoricoCobranca(customerId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        // CORREÇÃO: Cast as any para tabela de cobrança
        const { data } = await (supabaseAdmin.from('cobranca_historico') as any)
            .select('*')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })
        
        return data || []
    } catch (e) {
        return []
    }
}

// --- 5. BUSCAR DETALHES COMPLETOS ---
export async function getDetalhesDivida(customerId: number, storeId: number) {
    const supabaseAdmin = createAdminClient()
    
    try {
        // CORREÇÃO: Cast as any para permitir os joins complexos que podem não estar nos tipos locais
        const { data: financiamentos, error } = await (supabaseAdmin.from('financiamento_loja') as any)
            .select(`
                id,
                created_at,
                valor_total:valor_total_financiado,
                quantidade_parcelas,
                venda_id,
                vendas!financiamento_loja_venda_id_fkey (
                    id,
                    created_at,
                    valor_final,
                    venda_itens ( descricao, quantidade, valor_total_item )
                ),
                financiamento_parcelas (
                    id,
                    numero_parcela,
                    data_vencimento,
                    valor_parcela,
                    status,
                    data_pagamento
                )
            `)
            .eq('customer_id', customerId)
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })

        if (error) throw error

        return financiamentos || []
    } catch (e) {
        console.error("Erro ao buscar detalhes:", e)
        return []
    }
}