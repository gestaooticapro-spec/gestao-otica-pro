'use server'

import { revalidatePath } from 'next/cache'
import { cancelarComissao } from '@/lib/actions/commission.actions'
import { atualizarRankingCliente } from '@/lib/actions/vendas.actions'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { closeOpenServiceOrdersForVenda } from '@/lib/actions/service-order-cancellation.actions'

type DeclararAbandonoOptions = {
    devolveArmacao: boolean
    acaoLente: 'estoque' | 'perda' | 'nenhuma'
    motivo: string
}

type AdminProfile = {
    role: string | null
    store_id: number
    tenant_id: string | null
}

type VendaResumo = {
    id: number
    status: string
    customer_id: number | null
    financiamento_id: number | null
}

type ServiceOrderResumo = {
    id: number
}

type VendaItemResumo = {
    id: number
    product_id: number | null
    variant_id: number | null
    quantidade: number | null
    unidade: string | null
    item_tipo: string | null
    descricao: string | null
}

type ProductStockResumo = {
    estoque_atual: number
    preco_custo: number | null
}

type VariantStockResumo = {
    estoque_atual: number
}

type ReservationMovement = {
    id: number
    tenant_id: string | null
    store_id: number
    product_id: number | null
    variant_id: number | null
    quantidade: number
    custo_unitario_momento: number | null
    registrado_por_id: string | null
    employee_id: number | null
    related_os_id: number | null
}

type CustomerNotesResumo = {
    notes: string | null
    obs_debito: string | null
}

export type DeclararAbandonoResult = {
    success: boolean
    message: string
}

const ARMACAO_ITEM_TYPES = new Set(['Armacao', 'Solar'])
const LENS_ITEM_TYPES = new Set(['Lente', 'Lente de Contato'])
const asDbWrite = <T,>(value: T) => value as never

function getQuantidadeReal(item: VendaItemResumo) {
    const multiplicador = item.unidade === 'Par' ? 2 : 1
    return (item.quantidade || 1) * multiplicador
}

async function restoreItemToStock(params: {
    supabaseAdmin: ReturnType<typeof createAdminClient>
    tenantId: string | null
    storeId: number
    userId: string
    vendaId: number
    item: VendaItemResumo
    motivo: string
}) {
    const { supabaseAdmin, tenantId, storeId, userId, vendaId, item, motivo } = params

    if (!item.product_id) return

    const quantidade = getQuantidadeReal(item)
    const { data: productRaw, error: productError } = await supabaseAdmin
        .from('products')
        .select('estoque_atual, preco_custo')
        .eq('id', item.product_id)
        .single()

    if (productError || !productRaw) {
        throw new Error(`Nao foi possivel localizar o produto do item #${item.id} para devolver ao estoque.`)
    }

    const product = productRaw as unknown as ProductStockResumo
    const custoMomento = product.preco_custo || 0

    if (item.variant_id) {
        const { data: variantRaw, error: variantError } = await supabaseAdmin
            .from('product_variants')
            .select('estoque_atual')
            .eq('id', item.variant_id)
            .single()

        if (variantError || !variantRaw) {
            throw new Error(`Nao foi possivel localizar a variante do item #${item.id} para devolver ao estoque.`)
        }

        const variant = variantRaw as unknown as VariantStockResumo

        await supabaseAdmin
            .from('product_variants')
            .update(asDbWrite({ estoque_atual: variant.estoque_atual + quantidade }))
            .eq('id', item.variant_id)

        await supabaseAdmin.rpc('increment_stock', asDbWrite({
            p_product_id: item.product_id,
            p_quantity: quantidade,
            p_new_cost: null
        }))
    } else {
        await supabaseAdmin
            .from('products')
            .update(asDbWrite({ estoque_atual: product.estoque_atual + quantidade }))
            .eq('id', item.product_id)
    }

    await supabaseAdmin.from('stock_movements').insert(asDbWrite({
        tenant_id: tenantId,
        store_id: storeId,
        product_id: item.product_id,
        variant_id: item.variant_id,
        tipo: 'Devolucao',
        quantidade,
        motivo: `${motivo} - Venda #${vendaId}`,
        custo_unitario_momento: custoMomento,
        registrado_por_id: userId,
        related_venda_id: vendaId,
        created_at: new Date().toISOString()
    }))
}

async function restoreReservationToStock(params: {
    supabaseAdmin: ReturnType<typeof createAdminClient>
    userId: string
    vendaId: number
    reservation: ReservationMovement
}) {
    const { supabaseAdmin, userId, vendaId, reservation } = params

    await supabaseAdmin.from('stock_movements').insert(asDbWrite({
        tenant_id: reservation.tenant_id,
        store_id: reservation.store_id,
        product_id: reservation.product_id,
        variant_id: reservation.variant_id,
        tipo: 'Entrada',
        quantidade: reservation.quantidade,
        motivo: `[PEDIDO ABANDONADO] Estorno de reserva de lente - Venda #${vendaId}`,
        custo_unitario_momento: reservation.custo_unitario_momento,
        registrado_por_id: userId,
        employee_id: reservation.employee_id,
        related_os_id: reservation.related_os_id,
        related_venda_id: vendaId,
        created_at: new Date().toISOString()
    }))

    if (reservation.variant_id && reservation.product_id) {
        const { data: variantRaw, error: variantError } = await supabaseAdmin
            .from('product_variants')
            .select('estoque_atual')
            .eq('id', reservation.variant_id)
            .single()

        if (variantError || !variantRaw) {
            throw new Error(`Nao foi possivel devolver a reserva de lente da variante #${reservation.variant_id}.`)
        }

        const variant = variantRaw as unknown as VariantStockResumo

        await supabaseAdmin
            .from('product_variants')
            .update(asDbWrite({ estoque_atual: variant.estoque_atual + reservation.quantidade }))
            .eq('id', reservation.variant_id)

        await supabaseAdmin.rpc('increment_stock', asDbWrite({
            p_product_id: reservation.product_id,
            p_quantity: reservation.quantidade,
            p_new_cost: null
        }))
    } else if (reservation.product_id) {
        const { data: productRaw, error: productError } = await supabaseAdmin
            .from('products')
            .select('estoque_atual')
            .eq('id', reservation.product_id)
            .single()

        if (productError || !productRaw) {
            throw new Error(`Nao foi possivel devolver a reserva do produto #${reservation.product_id}.`)
        }

        const product = productRaw as unknown as Pick<ProductStockResumo, 'estoque_atual'>

        await supabaseAdmin
            .from('products')
            .update(asDbWrite({ estoque_atual: product.estoque_atual + reservation.quantidade }))
            .eq('id', reservation.product_id)
    }

    await supabaseAdmin
        .from('stock_movements')
        .update(asDbWrite({
            tipo: 'Devolucao',
            motivo: `[PEDIDO ABANDONADO] Reserva revertida ao estoque - Venda #${vendaId}`,
            related_venda_id: vendaId,
            registrado_por_id: userId
        }))
        .eq('id', reservation.id)
}

async function convertReservationToLoss(params: {
    supabaseAdmin: ReturnType<typeof createAdminClient>
    userId: string
    vendaId: number
    reservation: ReservationMovement
    motivoCliente: string
}) {
    const { supabaseAdmin, userId, vendaId, reservation, motivoCliente } = params

    await supabaseAdmin
        .from('stock_movements')
        .update(asDbWrite({
            tipo: 'Perda',
            motivo: `[PEDIDO ABANDONADO] Lente reservada convertida em perda - Venda #${vendaId}: ${motivoCliente}`,
            related_venda_id: vendaId,
            registrado_por_id: userId
        }))
        .eq('id', reservation.id)
}

export async function declararVendaAbandonada(
    vendaId: number,
    options: DeclararAbandonoOptions
): Promise<DeclararAbandonoResult> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return { success: false, message: 'Usuario nao autenticado.' }
    }

    const profile = await getProfileByAdmin(user.id) as AdminProfile | null
    if (!profile?.store_id) {
        return { success: false, message: 'Perfil nao encontrado.' }
    }

    const adminProfile = profile as AdminProfile
    const supabaseAdmin = createAdminClient()
    const tenantId = adminProfile.tenant_id
    const storeId = adminProfile.store_id
    const motivo = options.motivo.trim()

    if (!motivo) {
        return { success: false, message: 'Informe um motivo para registrar o abandono.' }
    }

    try {
        const { data: vendaRaw, error: vendaError } = await supabaseAdmin
            .from('vendas')
            .select('id, status, customer_id, financiamento_id, is_historical_import')
            .eq('id', vendaId)
            .eq('store_id', storeId)
            .single()

        if (vendaError || !vendaRaw) {
            throw new Error('Venda nao encontrada ou sem permissao para esta loja.')
        }

        const venda = vendaRaw as unknown as VendaResumo

        if ((venda as any).is_historical_import === true) {
            throw new Error('Venda histórica importada não pode ser cancelada como abandono.')
        }

        if (venda.status === 'Cancelada') {
            throw new Error('Esta venda ja esta cancelada.')
        }

        if (!venda.customer_id) {
            throw new Error('A venda nao possui cliente vinculado para registrar o historico.')
        }

        const { data: osRaw, error: osError } = await supabaseAdmin
            .from('service_orders')
            .select('id')
            .eq('venda_id', vendaId)

        if (osError) {
            throw new Error('Nao foi possivel localizar as OS desta venda.')
        }

        const osList = (osRaw ?? []) as unknown as ServiceOrderResumo[]
        const osIds = osList.map((os) => os.id)

        const { data: itensRaw, error: itensError } = await supabaseAdmin
            .from('venda_itens')
            .select('id, product_id, variant_id, quantidade, unidade, item_tipo, descricao')
            .eq('venda_id', vendaId)

        if (itensError) {
            throw new Error('Nao foi possivel localizar os itens da venda.')
        }

        const itens = (itensRaw ?? []) as unknown as VendaItemResumo[]
        const reservasAtivas = osIds.length === 0
            ? []
            : (((await supabaseAdmin
                .from('stock_movements')
                .select('id, tenant_id, store_id, product_id, variant_id, quantidade, custo_unitario_momento, registrado_por_id, employee_id, related_os_id')
                .in('related_os_id', osIds)
                .eq('tipo', 'Reserva')).data ?? []) as unknown as ReservationMovement[])

        if (options.acaoLente === 'nenhuma' && reservasAtivas.length > 0) {
            throw new Error('Ha lentes reservadas nesta venda. Escolha devolver ao estoque ou lancar como perda para nao deixar estoque preso.')
        }

        if (options.acaoLente === 'perda') {
            const hasLensItems = itens.some((item) => LENS_ITEM_TYPES.has(item.item_tipo || ''))
            if (hasLensItems && reservasAtivas.length === 0) {
                throw new Error('Nao encontrei reserva ativa de lente para lancar como perda. Verifique se a lente foi realmente reservada no estoque.')
            }
        }

        const carimbo = new Date()

        await closeOpenServiceOrdersForVenda({
            vendaId,
            storeId,
            kind: 'abandono',
            reason: motivo,
            userId: user.id,
        })

        for (const item of itens) {
            if (!item.product_id) continue

            if (ARMACAO_ITEM_TYPES.has(item.item_tipo || '') && options.devolveArmacao) {
                await restoreItemToStock({
                    supabaseAdmin,
                    tenantId,
                    storeId,
                    userId: user.id,
                    vendaId,
                    item,
                    motivo: '[PEDIDO ABANDONADO] Devolucao de armacao'
                })
            }
        }

        if (options.acaoLente === 'estoque') {
            for (const reservation of reservasAtivas) {
                await restoreReservationToStock({
                    supabaseAdmin,
                    userId: user.id,
                    vendaId,
                    reservation
                })
            }
        }

        if (options.acaoLente === 'perda') {
            for (const reservation of reservasAtivas) {
                await convertReservationToLoss({
                    supabaseAdmin,
                    userId: user.id,
                    vendaId,
                    reservation,
                    motivoCliente: motivo
                })
            }
        }

        const { error: vendaCancelError } = await supabaseAdmin
            .from('vendas')
            .update(asDbWrite({ status: 'Cancelada' }))
            .eq('id', vendaId)
            .eq('store_id', storeId)

        if (vendaCancelError) {
            throw new Error('Nao foi possivel cancelar a venda.')
        }

        if (venda.financiamento_id) {
            await supabaseAdmin
                .from('financiamento_parcelas')
                .update(asDbWrite({ status: 'Cancelada' }))
                .eq('financiamento_id', venda.financiamento_id)
                .eq('status', 'Pendente')
        }

        await cancelarComissao(vendaId)
        await atualizarRankingCliente(String(venda.customer_id))

        const { data: customerRaw, error: customerError } = await supabaseAdmin
            .from('customers')
            .select('notes, obs_debito')
            .eq('id', venda.customer_id)
            .eq('store_id', storeId)
            .single()

        if (customerError) {
            throw new Error('Nao foi possivel atualizar o historico do cliente.')
        }

        const customer = customerRaw as unknown as CustomerNotesResumo
        const notaCliente = `[${carimbo.toLocaleString('pt-BR')}] PEDIDO ABANDONADO (#${vendaId}): ${motivo}`
        const baseNotes = customer.notes ?? customer.obs_debito ?? ''
        const updatedNotes = baseNotes ? `${baseNotes}\n\n${notaCliente}` : notaCliente

        await supabaseAdmin
            .from('customers')
            .update(asDbWrite({ notes: updatedNotes }))
            .eq('id', venda.customer_id)
            .eq('store_id', storeId)

        revalidatePath(`/dashboard/loja/${storeId}/vendas`)
        revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
        revalidatePath(`/dashboard/loja/${storeId}/estoque/movimentacoes`)
        revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)
        revalidatePath(`/dashboard/loja/${storeId}/clientes`)
        revalidatePath(`/dashboard/loja/${storeId}/clientes/${venda.customer_id}`)

        return {
            success: true,
            message: 'Protocolo de abandono concluido. Venda cancelada e historico atualizado.'
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro inesperado ao registrar abandono.'
        console.error('Erro no protocolo de abandono:', error)
        return { success: false, message }
    }
}
