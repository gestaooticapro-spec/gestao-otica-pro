// ARQUIVO: src/lib/actions/wallet.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

type Wallet = Database['public']['Tables']['customer_wallets']['Row']
type WalletTransaction = Database['public']['Tables']['wallet_transactions']['Row']

// --- TIPOS DE RETORNO ---
export type GetWalletResult = {
    success: boolean
    data?: {
        balance: number
        transactions: WalletTransaction[]
    }
    message?: string
}

export type WalletActionResult = {
    success: boolean
    message: string
}

// ==============================================================================
// 1. BUSCAR CARTEIRA (SALDO + EXTRATO)
// ==============================================================================
export async function getWallet(storeId: number, customerId: number): Promise<GetWalletResult> {
    const supabaseAdmin = createAdminClient()

    try {
        // 1. Busca Saldo Atual
        // CORREÇÃO: Cast 'as any' para select em customer_wallets
        const { data: wallet } = await (supabaseAdmin
            .from('customer_wallets') as any)
            .select('id, balance')
            .eq('store_id', storeId)
            .eq('customer_id', customerId)
            .maybeSingle()

        // Se não tem carteira, saldo é 0
        const currentBalance = wallet?.balance || 0
        const walletId = wallet?.id

        let transactions: WalletTransaction[] = []

        // 2. Busca Extrato (apenas se existir carteira)
        if (walletId) {
            // CORREÇÃO: Cast 'as any' para select em wallet_transactions
            const { data: trans } = await (supabaseAdmin
                .from('wallet_transactions') as any)
                .select('*')
                .eq('wallet_id', walletId)
                .order('created_at', { ascending: false }) // Mais recente primeiro
            
            if (trans) transactions = trans
        }

        return {
            success: true,
            data: {
                balance: currentBalance,
                transactions
            }
        }

    } catch (error: any) {
        console.error("Erro ao buscar carteira:", error)
        return { success: false, message: "Erro interno ao carregar carteira." }
    }
}

// ==============================================================================
// 2. ADICIONAR CRÉDITO (DEVOLUÇÃO)
// ==============================================================================
const AddCreditSchema = z.object({
    store_id: z.coerce.number().int().positive(),
    customer_id: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive(),
    description: z.string().trim().min(3),
    employee_id: z.coerce.number().int().positive(),
    related_venda_id: z.coerce.number().int().positive().nullable(),
    idempotency_key: z.string().uuid(),
})

export async function addCredit(formData: FormData): Promise<WalletActionResult> {
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Usuário não autenticado.' }
    const profile = await getProfileByAdmin(user.id) as { tenant_id: string | null } | null
    if (!profile?.tenant_id) return { success: false, message: 'Perfil inválido.' }
    const validated = AddCreditSchema.safeParse({
        store_id: formData.get('store_id'),
        customer_id: formData.get('customer_id'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        employee_id: formData.get('employee_id'),
        related_venda_id: formData.get('related_venda_id') || null,
        idempotency_key: formData.get('idempotency_key'),
    })
    if (!validated.success) return { success: false, message: 'Dados do crédito inválidos. Reabra a operação.' }
    const data = validated.data
    try {
        const { error } = await (createAdminClient() as any).rpc('add_store_credit_atomic', {
            p_store_id: data.store_id,
            p_customer_id: data.customer_id,
            p_amount: data.amount,
            p_description: data.description,
            p_employee_id: data.employee_id,
            p_sale_id: data.related_venda_id,
            p_tenant_id: profile.tenant_id,
            p_user_id: user.id,
            p_key: data.idempotency_key,
        })
        if (error) return { success: false, message: error.message }
        revalidatePath(`/dashboard/loja/${data.store_id}/clientes`)
        return { success: true, message: `Crédito de R$ ${data.amount.toFixed(2)} adicionado!` }
    } catch (error: any) {
        return { success: false, message: error.message }
    }
}
