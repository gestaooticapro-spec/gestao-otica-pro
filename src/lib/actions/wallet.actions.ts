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
    store_id: z.coerce.number(),
    customer_id: z.coerce.number(),
    amount: z.coerce.number().positive("O valor do crédito deve ser positivo."),
    description: z.string().min(3),
    employee_id: z.coerce.number(), // Quem autorizou (PIN)
    related_venda_id: z.coerce.number().optional().nullable()
})

export async function addCredit(formData: FormData): Promise<WalletActionResult> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }
    
    // CORREÇÃO: Cast 'as any' para garantir acesso ao tenant_id e store_id
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil inválido.' }

    const inputData = {
        store_id: formData.get('store_id'),
        customer_id: formData.get('customer_id'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        employee_id: formData.get('employee_id'),
        related_venda_id: formData.get('related_venda_id')
    }

    const validated = AddCreditSchema.safeParse(inputData)
    if (!validated.success) return { success: false, message: 'Dados inválidos.' }

    const { store_id, customer_id, amount, description, employee_id, related_venda_id } = validated.data

    try {
        // 1. Busca ou Cria a Carteira (Upsert)
        // Primeiro tentamos buscar para pegar o ID
        // CORREÇÃO: Cast 'as any'
        let { data: wallet } = await (supabaseAdmin
            .from('customer_wallets') as any)
            .select('id, balance')
            .eq('store_id', store_id)
            .eq('customer_id', customer_id)
            .maybeSingle()

        if (!wallet) {
            // Cria nova carteira zerada
            // CORREÇÃO: Cast 'as any'
            const { data: newWallet, error: createError } = await (supabaseAdmin
                .from('customer_wallets') as any)
                .insert({
                    tenant_id: profile.tenant_id,
                    store_id,
                    customer_id,
                    balance: 0
                })
                .select()
                .single()
            
            if (createError) throw new Error("Erro ao criar carteira: " + createError.message)
            wallet = newWallet
        }

        // 2. Atualiza o Saldo (Adiciona o valor)
        const novoSaldo = Number(wallet.balance) + amount
        
        // CORREÇÃO: Cast 'as any'
        await (supabaseAdmin
            .from('customer_wallets') as any)
            .update({ balance: novoSaldo, updated_at: new Date().toISOString() })
            .eq('id', wallet.id)

        // 3. Registra o Extrato (Transaction)
        // CORREÇÃO: Cast 'as any'
        await (supabaseAdmin.from('wallet_transactions') as any).insert({
            tenant_id: profile.tenant_id,
            store_id,
            wallet_id: wallet.id,
            amount: amount, // Positivo
            operation_type: 'Credito_Devolucao',
            description,
            related_venda_id: related_venda_id || null,
            employee_id, // Quem autorizou
            created_by_user_id: user.id // Quem estava logado
        })

        revalidatePath(`/dashboard/loja/${store_id}/clientes`)
        return { success: true, message: `Crédito de R$ ${amount.toFixed(2)} adicionado!` }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ==============================================================================
// 3. USAR CRÉDITO (PAGAMENTO)
// ==============================================================================
const UseCreditSchema = z.object({
    store_id: z.coerce.number(),
    customer_id: z.coerce.number(),
    amount: z.coerce.number().positive("O valor deve ser positivo."),
    description: z.string().min(3),
    employee_id: z.coerce.number(), // Vendedor que está usando
    related_venda_id: z.coerce.number() // Obrigatório vincular a uma venda nova
})

export async function useCredit(formData: FormData): Promise<WalletActionResult> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não autenticado.' }
    
    // CORREÇÃO: Cast 'as any'
    const profile = await getProfileByAdmin(user.id) as any

    const inputData = {
        store_id: formData.get('store_id'),
        customer_id: formData.get('customer_id'),
        amount: formData.get('amount'),
        description: formData.get('description'),
        employee_id: formData.get('employee_id'),
        related_venda_id: formData.get('related_venda_id')
    }

    const validated = UseCreditSchema.safeParse(inputData)
    if (!validated.success) return { success: false, message: 'Dados inválidos.' }

    const { store_id, customer_id, amount, description, employee_id, related_venda_id } = validated.data

    try {
        // 1. Busca Carteira e Verifica Saldo
        // CORREÇÃO: Cast 'as any'
        const { data: wallet } = await (supabaseAdmin
            .from('customer_wallets') as any)
            .select('id, balance')
            .eq('store_id', store_id)
            .eq('customer_id', customer_id)
            .single()

        if (!wallet) return { success: false, message: "Cliente não possui carteira digital." }
        
        if (wallet.balance < amount) {
            return { success: false, message: `Saldo insuficiente. Disponível: R$ ${wallet.balance}` }
        }

        // 2. Debita o Saldo
        const novoSaldo = Number(wallet.balance) - amount

        // CORREÇÃO: Cast 'as any'
        await (supabaseAdmin
            .from('customer_wallets') as any)
            .update({ balance: novoSaldo, updated_at: new Date().toISOString() })
            .eq('id', wallet.id)

        // 3. Registra Extrato (Negativo)
        // CORREÇÃO: Cast 'as any'
        await (supabaseAdmin.from('wallet_transactions') as any).insert({
            tenant_id: profile?.tenant_id,
            store_id,
            wallet_id: wallet.id,
            amount: -amount, // Negativo para indicar saída
            operation_type: 'Uso_Venda',
            description,
            related_venda_id: related_venda_id,
            employee_id,
            created_by_user_id: user.id
        })

        revalidatePath(`/dashboard/loja/${store_id}/clientes`)
        return { success: true, message: `Crédito utilizado com sucesso!` }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}