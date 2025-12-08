// ARQUIVO: src/lib/actions/return.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { addCredit } from './wallet.actions' // Reutilizamos a action da carteira

// Schema para validar os itens selecionados
const ReturnItemSchema = z.object({
    venda_item_id: z.coerce.number(),
    product_id: z.coerce.number(),
    quantidade: z.coerce.number().min(1),
    valor_unitario: z.coerce.number(),
    condicao: z.enum(['Intacto', 'Defeito', 'Sobra']),
    // Dados específicos para Sobra de Lente
    detalhes_sobra: z.object({
        diametro: z.coerce.number().optional(),
        olho: z.string().optional() // 'OD' ou 'OE'
    }).optional()
})

const ProcessReturnSchema = z.object({
    store_id: z.coerce.number(),
    venda_id: z.coerce.number(),
    customer_id: z.coerce.number(),
    employee_id: z.coerce.number(), // Quem autorizou (PIN)
    tipo_reembolso: z.enum(['Carteira', 'Estorno']),
    itens: z.array(ReturnItemSchema)
})

export type ReturnActionResult = {
    success: boolean
    message: string
}

export async function processarDevolucao(prevState: any, formData: FormData): Promise<ReturnActionResult> {
    const supabaseAdmin = createAdminClient()
    const { data: { user } } = await createClient().auth.getUser()
    
    if (!user) return { success: false, message: 'Usuário não logado.' }
    
    // CORREÇÃO: Cast 'as any' para garantir acesso ao tenant_id
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil inválido.' }

    // Parse do JSON enviado pelo form
    const rawItens = JSON.parse(formData.get('itens_json') as string)
    
    const inputData = {
        store_id: formData.get('store_id'),
        venda_id: formData.get('venda_id'),
        customer_id: formData.get('customer_id'),
        employee_id: formData.get('employee_id'),
        tipo_reembolso: formData.get('tipo_reembolso'),
        itens: rawItens
    }

    const validated = ProcessReturnSchema.safeParse(inputData)
    
    if (!validated.success) {
        console.error(validated.error)
        return { success: false, message: 'Dados inválidos.' }
    }

    const { store_id, venda_id, customer_id, employee_id, tipo_reembolso, itens } = validated.data
    const totalReembolso = itens.reduce((acc, item) => acc + (item.valor_unitario * item.quantidade), 0)

    try {
        // 1. PROCESSAR ITENS (ESTOQUE)
        for (const item of itens) {
            
            // A: Devolução Intacta (Volta pro estoque normal)
            if (item.condicao === 'Intacto') {
                // CORREÇÃO: Cast 'as any' para RPC
                await (supabaseAdmin as any).rpc('increment_stock', { 
                    p_product_id: item.product_id, 
                    p_quantity: item.quantidade,
                    p_new_cost: null 
                })
                
                // Log Movimentação
                // CORREÇÃO: Cast 'as any' para insert em stock_movements
                await (supabaseAdmin.from('stock_movements') as any).insert({
                    tenant_id: profile.tenant_id,
                    store_id,
                    product_id: item.product_id,
                    tipo: 'Devolucao',
                    quantidade: item.quantidade,
                    motivo: `Devolução Venda #${venda_id}`,
                    related_venda_id: venda_id,
                    employee_id,
                    registrado_por_id: user.id
                })
            }
            // B: Sobra de Lente (Cria variante nova)
            else if (item.condicao === 'Sobra' && item.detalhes_sobra?.diametro) {
                // Busca dados originais do produto para copiar (grau, etc)
                // CORREÇÃO: Cast 'as any' para select em products
                const { data: prodOriginal } = await (supabaseAdmin.from('products') as any).select('*').eq('id', item.product_id).single()
                
                if (prodOriginal) {
                    // Cria Variante de Sobra
                    // CORREÇÃO: Cast 'as any' para insert em product_variants
                    const { data: novaSobra } = await (supabaseAdmin.from('product_variants') as any).insert({
                        product_id: item.product_id,
                        store_id,
                        tenant_id: profile.tenant_id,
                        nome_variante: `Sobra ${item.detalhes_sobra.olho} Ø${item.detalhes_sobra.diametro}`,
                        esferico: null, 
                        is_sobra: true,
                        diametro: item.detalhes_sobra.diametro,
                        olho: item.detalhes_sobra.olho,
                        estoque_atual: item.quantidade
                    }).select().single()

                    if (novaSobra) {
                         // Log Entrada de Sobra
                        await (supabaseAdmin.from('stock_movements') as any).insert({
                            tenant_id: profile.tenant_id,
                            store_id,
                            product_id: item.product_id,
                            variant_id: novaSobra.id,
                            tipo: 'Entrada', // Entra como sobra
                            quantidade: item.quantidade,
                            motivo: `Sobra de Devolução Venda #${venda_id}`,
                            related_venda_id: venda_id,
                            employee_id,
                            registrado_por_id: user.id
                        })
                    }
                }
            }
            // C: Defeito (Perda direta)
            else if (item.condicao === 'Defeito') {
                await (supabaseAdmin.from('stock_movements') as any).insert({
                    tenant_id: profile.tenant_id,
                    store_id,
                    product_id: item.product_id,
                    tipo: 'Perda',
                    quantidade: item.quantidade,
                    motivo: `Defeito na Devolução Venda #${venda_id}`,
                    related_venda_id: venda_id,
                    employee_id,
                    registrado_por_id: user.id
                })
            }
        }

        // 2. FINANCEIRO
        if (tipo_reembolso === 'Carteira') {
            const fdWallet = new FormData()
            fdWallet.append('store_id', store_id.toString())
            fdWallet.append('customer_id', customer_id.toString())
            fdWallet.append('amount', totalReembolso.toString())
            fdWallet.append('description', `Crédito por devolução Venda #${venda_id}`)
            fdWallet.append('employee_id', employee_id.toString())
            fdWallet.append('related_venda_id', venda_id.toString())
            
            await addCredit(fdWallet)
        } 
        else if (tipo_reembolso === 'Estorno') {
            // Se for estorno, registramos uma saída no caixa (sangria técnica) ou apenas log
        }

        // 3. ATUALIZAR STATUS DA VENDA
        // CORREÇÃO: Cast 'as any' para update em vendas
        await (supabaseAdmin.from('vendas') as any)
            .update({ status: 'Devolvida' }) 
            .eq('id', venda_id)

        // 4. ESTORNO DE COMISSÃO
        // Busca comissão original
        // CORREÇÃO: Cast 'as any' para select e update em commissions
        const { data: comissao } = await (supabaseAdmin
            .from('commissions') as any)
            .select('id')
            .eq('venda_id', venda_id)
            .eq('status', 'Pendente') 
            .maybeSingle()
        
        if (comissao) {
            await (supabaseAdmin
                .from('commissions') as any)
                .update({ status: 'Estornado', reversal_reason: 'Devolução de Venda' })
                .eq('id', comissao.id)
        }

        revalidatePath(`/dashboard/loja/${store_id}/vendas/${venda_id}`)
        return { success: true, message: 'Devolução processada com sucesso.' }

    } catch (e: any) {
        console.error("Erro devolucao:", e)
        return { success: false, message: e.message }
    }
}