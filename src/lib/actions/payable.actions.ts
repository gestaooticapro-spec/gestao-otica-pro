// Caminho: src/lib/actions/payable.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { Database } from '@/lib/database.types'

type Bill = Database['public']['Tables']['accounts_payable']['Row']

// ==============================================================================
// 1. LISTAR CONTAS (FILTRO POR MÊS)
// ==============================================================================
export async function getBills(storeId: number, dateStr?: string) {
    const supabaseAdmin = createAdminClient()
    
    // Define o intervalo do mês (Ex: 2024-11)
    const baseDate = dateStr ? new Date(dateStr) : new Date()
    const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1).toISOString()
    const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0).toISOString()

    try {
        // CORREÇÃO: Cast 'as any' para select com relacionamento
        const { data, error } = await (supabaseAdmin
            .from('accounts_payable') as any)
            .select(`
                *,
                suppliers ( nome_fantasia )
            `)
            .eq('store_id', storeId)
            .gte('due_date', firstDay)
            .lte('due_date', lastDay)
            .order('due_date', { ascending: true })

        if (error) throw error
        return { success: true, data: data || [] }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 2. SALVAR CONTA (CRIAR / EDITAR)
// ==============================================================================
const BillSchema = z.object({
    id: z.coerce.number().optional(),
    store_id: z.coerce.number(),
    description: z.string().min(3, "Descrição obrigatória"),
    amount: z.coerce.number().min(0.01, "Valor inválido"),
    due_date: z.string().min(10, "Data inválida"),
    category: z.string().optional(),
    supplier_id: z.coerce.number().optional().nullable()
})

export async function saveBill(prevState: any, formData: FormData) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Login necessário.' }
    
    // CORREÇÃO: Cast 'as any' no profile
    const profile = await getProfileByAdmin(user.id) as any
    
    if (!profile) return { success: false, message: 'Perfil inválido.' }

    const rawData = {
        id: formData.get('id'),
        store_id: profile.store_id,
        description: formData.get('description'),
        amount: formData.get('amount'),
        due_date: formData.get('due_date'),
        category: formData.get('category'),
        supplier_id: formData.get('supplier_id')
    }

    const val = BillSchema.safeParse(rawData)
    if (!val.success) return { success: false, message: 'Dados inválidos.' }

    const { id, ...billData } = val.data

    try {
        // Cast as any no tenant_id para garantir
        const payload = {
            ...billData,
            tenant_id: profile.tenant_id,
            created_by_user_id: user.id
        }

        if (id) {
            // CORREÇÃO: Cast 'as any' no update
            await (supabaseAdmin.from('accounts_payable') as any).update(payload).eq('id', id)
        } else {
            // CORREÇÃO: Cast 'as any' no insert
            await (supabaseAdmin.from('accounts_payable') as any).insert(payload)
        }

        revalidatePath(`/dashboard/loja/${profile.store_id}/financeiro/contas`)
        return { success: true, message: 'Conta salva com sucesso!' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 3. PAGAR CONTA (BAIXA + INTEGRAÇÃO COM CAIXA)
// ==============================================================================
const PayBillSchema = z.object({
    bill_id: z.coerce.number(),
    store_id: z.coerce.number(),
    amount_paid: z.coerce.number(),
    payment_date: z.string(),
    source: z.enum(['Caixa', 'Banco']) 
})

export async function payBill(prevState: any, formData: FormData) {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    // CORREÇÃO: Cast 'as any' no profile
    const profile = await getProfileByAdmin(user!.id) as any

    const input = {
        bill_id: formData.get('bill_id'),
        store_id: profile?.store_id,
        amount_paid: formData.get('amount_paid'),
        payment_date: formData.get('payment_date'),
        source: formData.get('source')
    }

    const val = PayBillSchema.safeParse(input)
    if (!val.success) return { success: false, message: 'Dados de pagamento inválidos.' }

    const { bill_id, store_id, amount_paid, payment_date, source } = val.data

    try {
        // A. Se a fonte for CAIXA, precisamos criar uma SANGRIA automática
        if (source === 'Caixa') {
            // 1. Busca o caixa aberto HOJE
            const hoje = new Date()
            const dataInicioHoje = new Date(hoje.setHours(0,0,0,0)).toISOString()

            // CORREÇÃO: Cast 'as any' no select do caixa
            const { data: caixaAberto } = await (supabaseAdmin
                .from('caixa_diario') as any)
                .select('id')
                .eq('store_id', store_id)
                .eq('status', 'Aberto')
                .gte('created_at', dataInicioHoje)
                .maybeSingle()

            if (!caixaAberto) {
                return { success: false, message: 'Erro: Não há caixa aberto para realizar pagamento em dinheiro.' }
            }

            // 2. Busca descrição da conta
            // CORREÇÃO: Cast 'as any' no select da conta
            const { data: conta } = await (supabaseAdmin.from('accounts_payable') as any)
                .select('description')
                .eq('id', bill_id)
                .single()

            // 3. Insere a Saída no Caixa
            // CORREÇÃO: Cast 'as any' no insert da movimentação
            await (supabaseAdmin.from('caixa_movimentacoes') as any).insert({
                tenant_id: profile?.tenant_id,
                store_id: store_id,
                caixa_id: caixaAberto.id,
                usuario_id: user?.id,
                tipo: 'Saida',
                valor: amount_paid,
                descricao: `Pagto Conta: ${conta?.description || 'Despesa'}`,
                categoria: 'Despesa Operacional',
                forma_pagamento: 'Dinheiro'
            })
        }

        // B. Atualiza o Status da Conta para PAGO
        // CORREÇÃO: Cast 'as any' no update da conta
        await (supabaseAdmin.from('accounts_payable') as any).update({
            status: 'Pago',
            amount_paid: amount_paid,
            payment_date: payment_date,
            updated_at: new Date().toISOString()
        }).eq('id', bill_id)

        revalidatePath(`/dashboard/loja/${store_id}/financeiro/contas`)
        
        if (source === 'Caixa') {
            revalidatePath(`/dashboard/loja/${store_id}/financeiro/caixa`)
        }

        return { success: true, message: 'Pagamento registrado com sucesso!' }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 4. EXCLUIR CONTA
// ==============================================================================
export async function deleteBill(billId: number, storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        // CORREÇÃO: Cast 'as any' no delete
        await (supabaseAdmin.from('accounts_payable') as any).delete().eq('id', billId)
        revalidatePath(`/dashboard/loja/${storeId}/financeiro/contas`)
        return { success: true, message: 'Conta removida.' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}