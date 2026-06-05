// ARQUIVO: src/lib/actions/labels.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { isStoreModuleEnabledForStore } from '@/lib/store-modules.server'

export type LabelQueueItem = {
    id: number
    product_id: number
    variant_id: number | null
    quantity: number
    created_at: string
    product_name: string
    product_barcode: string | null
    variant_name: string | null
    product_price: number
    product_ref: string | null
}

export type LabelActionResult = {
    success: boolean
    message: string
}

export async function addToLabelQueue(
    storeId: number,
    productId: number,
    variantId: number | null,
    quantity: number = 1
): Promise<LabelActionResult> {
    if (!(await isStoreModuleEnabledForStore(storeId, 'labels'))) {
        return { success: false, message: 'Modulo de etiquetas desativado para esta loja.' }
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    const admin = createAdminClient()

    // Check if item already exists in queue
    let query = (admin.from('label_queue') as any)
        .select('id, quantity')
        .eq('store_id', storeId)
        .eq('tenant_id', profile.tenant_id)
        .eq('product_id', productId)

    if (variantId) {
        query = query.eq('variant_id', variantId)
    } else {
        query = query.is('variant_id', null)
    }

    const { data: existing } = await query.maybeSingle()

    if (existing) {
        // Update quantity
        await (admin.from('label_queue') as any)
            .update({ quantity: existing.quantity + quantity })
            .eq('id', existing.id)
    } else {
        // Insert new
        const { error } = await (admin.from('label_queue') as any).insert({
            tenant_id: profile.tenant_id,
            store_id: storeId,
            product_id: productId,
            variant_id: variantId || null,
            quantity
        })
        if (error) {
            console.error('Erro ao adicionar à fila:', error)
            return { success: false, message: error.message }
        }
    }

    revalidatePath(`/dashboard/loja/${storeId}/estoque/etiquetas`)
    return { success: true, message: `${quantity} etiqueta(s) adicionada(s) à fila.` }
}

export async function removeFromLabelQueue(itemId: number, storeId: number): Promise<LabelActionResult> {
    if (!(await isStoreModuleEnabledForStore(storeId, 'labels'))) {
        return { success: false, message: 'Modulo de etiquetas desativado para esta loja.' }
    }

    const admin = createAdminClient()

    const { error } = await (admin.from('label_queue') as any)
        .delete()
        .eq('id', itemId)

    if (error) return { success: false, message: error.message }

    revalidatePath(`/dashboard/loja/${storeId}/estoque/etiquetas`)
    return { success: true, message: 'Item removido da fila.' }
}

export async function updateLabelQuantity(
    itemId: number,
    quantity: number,
    storeId: number
): Promise<LabelActionResult> {
    if (!(await isStoreModuleEnabledForStore(storeId, 'labels'))) {
        return { success: false, message: 'Modulo de etiquetas desativado para esta loja.' }
    }

    if (quantity < 1) return removeFromLabelQueue(itemId, storeId)

    const admin = createAdminClient()

    const { error } = await (admin.from('label_queue') as any)
        .update({ quantity })
        .eq('id', itemId)

    if (error) return { success: false, message: error.message }

    revalidatePath(`/dashboard/loja/${storeId}/estoque/etiquetas`)
    return { success: true, message: 'Quantidade atualizada.' }
}

export async function getLabelQueue(storeId: number): Promise<LabelQueueItem[]> {
    if (!(await isStoreModuleEnabledForStore(storeId, 'labels'))) return []

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return []

    const admin = createAdminClient()

    const { data, error } = await (admin.from('label_queue') as any)
        .select(`
            id, product_id, variant_id, quantity, created_at,
            products ( nome, codigo_barras, preco_venda, referencia ),
            product_variants ( nome_variante )
        `)
        .eq('store_id', storeId)
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao buscar fila de etiquetas:', error)
        return []
    }

    return (data || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        variant_id: item.variant_id,
        quantity: item.quantity,
        created_at: item.created_at,
        product_name: item.products?.nome || 'Produto Removido',
        product_barcode: item.products?.codigo_barras || null,
        variant_name: item.product_variants?.nome_variante || null,
        product_price: item.products?.preco_venda || 0,
        product_ref: item.products?.referencia || null
    }))
}

export async function clearLabelQueue(storeId: number): Promise<LabelActionResult> {
    if (!(await isStoreModuleEnabledForStore(storeId, 'labels'))) {
        return { success: false, message: 'Modulo de etiquetas desativado para esta loja.' }
    }

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    const admin = createAdminClient()

    const { error } = await (admin.from('label_queue') as any)
        .delete()
        .eq('store_id', storeId)
        .eq('tenant_id', profile.tenant_id)

    if (error) return { success: false, message: error.message }

    revalidatePath(`/dashboard/loja/${storeId}/estoque/etiquetas`)
    return { success: true, message: 'Fila de etiquetas limpa.' }
}

// Suggest labels from recent stock entries
export async function suggestLabelsFromMovements(storeId: number): Promise<{
    product_id: number
    variant_id: number | null
    product_name: string
    product_barcode: string | null
    quantity: number
    movement_date: string
}[]> {
    if (!(await isStoreModuleEnabledForStore(storeId, 'labels'))) return []

    const admin = createAdminClient()

    // Get last 7 days of "Entrada" movements
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    const { data, error } = await (admin.from('stock_movements') as any)
        .select(`
            product_id, variant_id, quantidade, created_at,
            products ( nome, codigo_barras, tipo_produto )
        `)
        .eq('store_id', storeId)
        .eq('tipo', 'Entrada')
        .gte('created_at', sevenDaysAgo.toISOString())
        .order('created_at', { ascending: false })

    if (error || !data) return []

    // Filter out lenses - they don't need physical labels
    const filtered = (data as any[]).filter((mov: any) => mov.products?.tipo_produto !== 'Lente')

    // Group by product_id + variant_id
    const grouped = new Map<string, any>()

    for (const mov of filtered) {
        const key = `${mov.product_id}-${mov.variant_id || 'null'}`
        if (grouped.has(key)) {
            grouped.get(key).quantity += mov.quantidade
        } else {
            grouped.set(key, {
                product_id: mov.product_id,
                variant_id: mov.variant_id,
                product_name: mov.products?.nome || 'Produto Removido',
                product_barcode: mov.products?.codigo_barras || null,
                quantity: mov.quantidade,
                movement_date: mov.created_at
            })
        }
    }

    return Array.from(grouped.values())
}
