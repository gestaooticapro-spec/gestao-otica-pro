// ARQUIVO: src/lib/actions/stock.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// 1. ATUALIZAÇÃO DO SCHEMA (CORRIGIDO)
const MovimentoSchema = z.object({
    store_id: z.coerce.number(),
    employee_id: z.coerce.number().optional().nullable(),
    product_id: z.coerce.number(),
    variant_id: z.coerce.number().optional().nullable(),
    tipo: z.enum(['Entrada', 'Saida', 'Perda', 'Ajuste', 'Devolucao', 'Brinde', 'Reserva']),
    quantidade: z.coerce.number().min(1, "A quantidade deve ser maior que zero."),
    motivo: z.string().min(3, "O motivo é obrigatório."),
    related_venda_id: z.coerce.number().optional().nullable(),
    related_os_id: z.coerce.number().optional().nullable(),
    sobra_detalhes: z.object({
        diametro: z.coerce.number(),
        olho: z.enum(['OD', 'OE', 'AMBOS']),
        esferico: z.coerce.number().optional().nullable(),
        cilindrico: z.coerce.number().optional().nullable(),
        adicao: z.coerce.number().optional().nullable(),
        eixo: z.coerce.number().optional().nullable()
    }).optional().nullable()
})

export type StockActionResult = {
    success: boolean
    message: string
}

type LensEye = 'OD' | 'OE' | 'AMBOS'

const normalizeLensEye = (value: string | null | undefined): LensEye | null => {
    if (value === 'OD' || value === 'OE' || value === 'AMBOS') return value
    return null
}

const normalizeAxisValue = (value: number | null | undefined): number | null => {
    if (value === null || value === undefined || Number.isNaN(value)) return null
    return value
}

export async function registrarMovimentacao(
    prevState: StockActionResult,
    formData: FormData
): Promise<StockActionResult> {
    const supabase = createClient()
    const accessToken = formData.get('access_token')?.toString() || null
    let { data: { user } } = await supabase.auth.getUser()
    if (!user && accessToken) {
        const supabaseAdmin = createAdminClient()
        const { data } = await supabaseAdmin.auth.getUser(accessToken)
        user = data.user
    }
    if (!user) return { success: false, message: 'Usuario nao autenticado.' }

    // Cast 'as any' para garantir acesso a props do perfil
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    // 2. CAPTURA DOS DADOS
    const rawData = {
        store_id: formData.get('store_id') || profile.store_id,
        employee_id: formData.get('employee_id'),
        product_id: formData.get('product_id'),
        variant_id: formData.get('variant_id'),
        tipo: formData.get('tipo'),
        quantidade: formData.get('quantidade'),
        motivo: formData.get('motivo'),
        // Captura novos campos
        related_venda_id: formData.get('related_venda_id'),
        related_os_id: formData.get('related_os_id'),
        sobra_detalhes: formData.get('sobra_detalhes') ? JSON.parse(formData.get('sobra_detalhes') as string) : null
    }

    const validated = MovimentoSchema.safeParse(rawData)

    if (!validated.success) {
        console.error("Erro Validação Zod:", validated.error.flatten().fieldErrors)
        return {
            success: false,
            message: 'Dados inválidos. Verifique o console ou contate suporte.'
        }
    }

    const {
        product_id, variant_id, tipo, quantidade, motivo, store_id,
        related_venda_id, related_os_id, sobra_detalhes
    } = validated.data

    // Resolve employee_id: usa o enviado pelo form ou busca o primeiro ativo da loja
    let resolvedEmployeeId = validated.data.employee_id
    if (!resolvedEmployeeId) {
        const supabaseTemp = createAdminClient()
        const { data: firstEmployee } = await (supabaseTemp.from('employees') as any)
            .select('id')
            .eq('store_id', store_id)
            .eq('is_active', true)
            .order('id', { ascending: true })
            .limit(1)
            .single()
        if (firstEmployee) {
            resolvedEmployeeId = firstEmployee.id
        } else {
            return { success: false, message: 'Nenhum funcionário ativo encontrado na loja.' }
        }
    }
    const employee_id = resolvedEmployeeId

    // 3. LÓGICA DE SINAL
    let multiplicador = 1
    if (['Saida', 'Perda', 'Brinde', 'Reserva'].includes(tipo)) {
        multiplicador = -1
    }

    const deltaEstoque = quantidade * multiplicador

    const supabaseAdmin = createAdminClient()

    try {
        // Busca Produto
        // Cast 'as any' para select em products
        const { data: produto } = await (supabaseAdmin
            .from('products') as any)
            .select('estoque_atual, preco_custo, detalhes')
            .eq('id', product_id)
            .single()

        if (!produto) return { success: false, message: 'Produto não encontrado.' }

        let estoqueAtual = produto.estoque_atual
        let variantData: any = null // Para guardar dados da variante (esférico/cilíndrico)
        let effectiveVariantId = variant_id || null

        // --- LÓGICA PRÉ-MOVIMENTAÇÃO: CRIAÇÃO DE VARIANTE DE SOBRA ---
        let novaSobraId: number | null = null
        let novaSobraEstoqueAtual = 0
        if (sobra_detalhes && sobra_detalhes.diametro) {
            // Se j? temos a variante original (ex: perdendo uma lente da grade), pegamos os graus de l?
            if (variant_id) {
                const { data: v } = await (supabaseAdmin.from('product_variants') as any).select('esferico, cilindrico, adicao').eq('id', variant_id).single()
                if (v) variantData = v
            }

            const sobraEsferico = variantData?.esferico ?? sobra_detalhes.esferico ?? 0
            const sobraCilindrico = variantData?.cilindrico ?? sobra_detalhes.cilindrico ?? 0
            const sobraAdicao = variantData?.adicao ?? sobra_detalhes.adicao ?? null
            const sobraEixo = normalizeAxisValue(sobra_detalhes.eixo)
            const sobraOlho = sobra_detalhes.olho

            let sobraExistenteQuery = (supabaseAdmin.from('product_variants') as any)
                .select('id, estoque_atual')
                .eq('product_id', product_id)
                .eq('store_id', store_id)
                .eq('tenant_id', profile.tenant_id)
                .eq('is_sobra', true)
                .eq('diametro', sobra_detalhes.diametro)
                .eq('olho', sobraOlho)
                .eq('esferico', sobraEsferico)
                .eq('cilindrico', sobraCilindrico)
                .order('id', { ascending: true })
                .limit(1)

            if (sobraAdicao === null) {
                sobraExistenteQuery = sobraExistenteQuery.is('adicao', null)
            } else {
                sobraExistenteQuery = sobraExistenteQuery.eq('adicao', sobraAdicao)
            }

            if (sobraEixo === null) {
                sobraExistenteQuery = sobraExistenteQuery.is('eixo', null)
            } else {
                sobraExistenteQuery = sobraExistenteQuery.eq('eixo', sobraEixo)
            }

            const { data: sobraExistente } = await sobraExistenteQuery.maybeSingle()

            if (sobraExistente) {
                novaSobraId = sobraExistente.id
                novaSobraEstoqueAtual = sobraExistente.estoque_atual || 0
                if (tipo === 'Entrada') {
                    effectiveVariantId = sobraExistente.id
                }
            } else {
                const insertPayload = {
                    product_id: product_id,
                    store_id: store_id,
                    tenant_id: profile.tenant_id,
                    nome_variante: `Sobra ${sobraOlho} Ø${sobra_detalhes.diametro}`,
                    esferico: sobraEsferico,
                    cilindrico: sobraCilindrico,
                    eixo: sobraEixo,
                    adicao: sobraAdicao,
                    is_sobra: true,
                    diametro: sobra_detalhes.diametro,
                    olho: sobraOlho,
                    estoque_atual: 0,
                }

                insertPayload.nome_variante = `Aproveitamento ${sobraOlho} Ø${sobra_detalhes.diametro}${sobraEixo !== null ? ` Eixo ${sobraEixo}` : ''}`

                const { data: novaSobra } = await (supabaseAdmin.from('product_variants') as any).insert(insertPayload).select().single()

                if (novaSobra) {
                    novaSobraId = novaSobra.id
                    novaSobraEstoqueAtual = novaSobra.estoque_atual || 0
                    if (tipo === 'Entrada') {
                        effectiveVariantId = novaSobra.id
                    }
                }
            }
        }

        // Atualiza Estoque (Utilizando effectiveVariantId)
        if (effectiveVariantId) {
            // Cast 'as any' para select em product_variants
            const { data: variant } = await (supabaseAdmin
                .from('product_variants') as any)
                .select('estoque_atual')
                .eq('id', effectiveVariantId)
                .single()

            if (variant) {
                estoqueAtual = variant.estoque_atual
            }

            // Cast 'as any' para update em product_variants
            await (supabaseAdmin.from('product_variants') as any)
                .update({ estoque_atual: estoqueAtual + deltaEstoque })
                .eq('id', effectiveVariantId)

            // Cast 'as any' para RPC (Sincroniza estoque total do produto)
            await (supabaseAdmin as any).rpc('increment_stock', {
                p_product_id: product_id,
                p_quantity: deltaEstoque,
                p_new_cost: null
            })
        } else {
            // Cast 'as any' para update em products (Produto sem variante)
            await (supabaseAdmin.from('products') as any)
                .update({ estoque_atual: estoqueAtual + deltaEstoque })
                .eq('id', product_id)
        }

        // 4. GRAVAÇÃO DA MOVIMENTAÇÃO PRINCIPAL
        const { error: insertError } = await (supabaseAdmin.from('stock_movements') as any).insert({
            tenant_id: profile.tenant_id,
            store_id: store_id,
            product_id: product_id,
            variant_id: effectiveVariantId,
            tipo: tipo,
            quantidade: quantidade,
            motivo: motivo,
            custo_unitario_momento: produto.preco_custo,
            registrado_por_id: user.id,
            employee_id: employee_id,
            related_venda_id: related_venda_id || null,
            related_os_id: related_os_id || null,
            created_at: new Date().toISOString()
        })

        if (insertError) throw insertError

        // --- LÓGICA PÓS-MOVIMENTAÇÃO: APENAS PARA RECUPERAÇÃO DE QUEBRA (PERDA) ---
        // Se foi uma PERDA (-1), precisamos de uma segunda movimentação de ENTRADA (+1) para a sobra
        if (tipo === 'Perda' && novaSobraId) {
            // Aumenta o estoque da sobra em 1 (já que a movimentação principal foi de Perda do original)
            await (supabaseAdmin.from('product_variants') as any)
                .update({ estoque_atual: novaSobraEstoqueAtual + 1 })
                .eq('id', novaSobraId)

            // Incrementa o produto global também para a recuperação
            await (supabaseAdmin as any).rpc('increment_stock', {
                p_product_id: product_id,
                p_quantity: 1,
                p_new_cost: null
            })

            // Registra o histórico da recuperação
            await (supabaseAdmin.from('stock_movements') as any).insert({
                tenant_id: profile.tenant_id,
                store_id: store_id,
                product_id: product_id,
                variant_id: novaSobraId,
                tipo: 'Entrada',
                quantidade: 1,
                motivo: `Lente de aproveitamento recuperada da quebra (Origem: Venda #${related_venda_id || 'N/A'})`,
                custo_unitario_momento: 0,
                registrado_por_id: user.id,
                employee_id: employee_id,
                related_venda_id: related_venda_id || null
            })
        }
        // -----------------------------------------------

        revalidatePath(`/dashboard/loja/${store_id}/estoque/movimentacoes`)
        revalidatePath(`/dashboard/loja/${store_id}/cadastros`)

        return { success: true, message: `Movimentação (${tipo}) registrada com sucesso!` }

    } catch (error: any) {
        console.error('Erro Movimentação:', error)
        return { success: false, message: error.message }
    }
}

// TIPOS PARA O FILTRO
export type StockFilters = {
    dataInicio?: string
    dataFim?: string
    tipo?: string
    busca?: string
    productId?: number
}

// ================================================================
// 2. ACTION: LISTAR VARIANTES DO PRODUTO (GRADE)
// ================================================================
export async function getProductVariants(productId: number) {
    const supabaseAdmin = createAdminClient()

    // Cast 'as any' para select em product_variants
    const { data: variants, error } = await (supabaseAdmin
        .from('product_variants') as any)
        .select('*')
        .eq('product_id', productId)
        .order('nome_variante', { ascending: true })

    if (error) {
        console.error('Erro ao buscar variantes:', error)
        return []
    }

    return variants
}

export async function getStockMovements(storeId: number, filters?: StockFilters) {
    const supabaseAdmin = createAdminClient()

    // Cast 'as any' para select em stock_movements
    let query = (supabaseAdmin
        .from('stock_movements') as any)
        .select(`
            id, created_at, tipo, quantidade, motivo, product_id, variant_id, related_venda_id, related_os_id,
            products ( nome, codigo_barras ),
            product_variants ( 
                nome_variante, esferico, cilindrico, eixo, 
                adicao, olho, diametro, is_sobra 
            ),
            employees ( full_name )
        `)
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
        .limit(100)

    if (filters?.dataInicio) {
        const inicioBrasil = `${filters.dataInicio}T00:00:00-03:00`
        query = query.gte('created_at', inicioBrasil)
    }

    if (filters?.dataFim) {
        const fimBrasil = `${filters.dataFim}T23:59:59-03:00`
        query = query.lte('created_at', fimBrasil)
    }

    if (filters?.tipo && filters.tipo !== 'Todos') {
        query = query.eq('tipo', filters.tipo)
    }

    if (filters?.busca) {
        query = query.ilike('motivo', `%${filters.busca}%`)
    }

    if (filters?.productId) {
        query = query.eq('product_id', filters.productId)
    }

    const { data, error } = await query

    if (error) {
        console.error("Erro ao buscar histórico:", error)
        return []
    }

    return data || []
}

// ================================================================
// EXCLUIR MOVIMENTAÇÃO
// ================================================================
export async function excluirMovimentacao(
    movementId: number,
    storeId: number
): Promise<StockActionResult> {
    const supabaseAdmin = createAdminClient()

    const { data: mov, error: fetchErr } = await (supabaseAdmin
        .from('stock_movements') as any)
        .select('*')
        .eq('id', movementId)
        .eq('store_id', storeId)
        .single()

    if (fetchErr || !mov) {
        return { success: false, message: 'Movimentação não encontrada.' }
    }

    const negativeTypes = ['Saida', 'Perda', 'Brinde', 'Reserva']
    const multiplicador = negativeTypes.includes(mov.tipo) ? -1 : 1
    const deltaOriginal = mov.quantidade * multiplicador
    const reverseDelta = -deltaOriginal

    if (mov.variant_id) {
        const { data: variant } = await (supabaseAdmin
            .from('product_variants') as any)
            .select('estoque_atual')
            .eq('id', mov.variant_id)
            .single()

        if (variant) {
            await (supabaseAdmin.from('product_variants') as any)
                .update({ estoque_atual: variant.estoque_atual + reverseDelta })
                .eq('id', mov.variant_id)
        }

        await (supabaseAdmin as any).rpc('increment_stock', {
            p_product_id: mov.product_id,
            p_quantity: reverseDelta,
            p_new_cost: null
        })
    } else {
        const { data: produto } = await (supabaseAdmin
            .from('products') as any)
            .select('estoque_atual')
            .eq('id', mov.product_id)
            .single()

        if (produto) {
            await (supabaseAdmin.from('products') as any)
                .update({ estoque_atual: produto.estoque_atual + reverseDelta })
                .eq('id', mov.product_id)
        }
    }

    const { error: deleteErr } = await (supabaseAdmin
        .from('stock_movements') as any)
        .delete()
        .eq('id', movementId)

    if (deleteErr) {
        return { success: false, message: 'Erro ao excluir: ' + deleteErr.message }
    }

    revalidatePath(`/dashboard/loja/${storeId}/estoque/movimentacoes`)
    revalidatePath(`/dashboard/loja/${storeId}/cadastros`)

    return { success: true, message: 'Movimentação excluída com sucesso.' }
}

// ================================================================
// EDITAR MOVIMENTAÇÃO
// ================================================================
export async function editarMovimentacao(
    movementId: number,
    storeId: number,
    novaQuantidade: number,
    novoTipo: string,
    novoMotivo: string
): Promise<StockActionResult> {
    const supabaseAdmin = createAdminClient()

    const { data: mov, error: fetchErr } = await (supabaseAdmin
        .from('stock_movements') as any)
        .select('*')
        .eq('id', movementId)
        .eq('store_id', storeId)
        .single()

    if (fetchErr || !mov) {
        return { success: false, message: 'Movimentação não encontrada.' }
    }

    const negativeTypes = ['Saida', 'Perda', 'Brinde', 'Reserva']
    const oldMult = negativeTypes.includes(mov.tipo) ? -1 : 1
    const newMult = negativeTypes.includes(novoTipo) ? -1 : 1

    const oldDelta = mov.quantidade * oldMult
    const newDelta = novaQuantidade * newMult
    const correction = newDelta - oldDelta

    if (correction !== 0) {
        if (mov.variant_id) {
            const { data: variant } = await (supabaseAdmin
                .from('product_variants') as any)
                .select('estoque_atual')
                .eq('id', mov.variant_id)
                .single()

            if (variant) {
                await (supabaseAdmin.from('product_variants') as any)
                    .update({ estoque_atual: variant.estoque_atual + correction })
                    .eq('id', mov.variant_id)
            }

            await (supabaseAdmin as any).rpc('increment_stock', {
                p_product_id: mov.product_id,
                p_quantity: correction,
                p_new_cost: null
            })
        } else {
            const { data: produto } = await (supabaseAdmin
                .from('products') as any)
                .select('estoque_atual')
                .eq('id', mov.product_id)
                .single()

            if (produto) {
                await (supabaseAdmin.from('products') as any)
                    .update({ estoque_atual: produto.estoque_atual + correction })
                    .eq('id', mov.product_id)
            }
        }
    }

    const { error: updateErr } = await (supabaseAdmin
        .from('stock_movements') as any)
        .update({
            quantidade: novaQuantidade,
            tipo: novoTipo,
            motivo: novoMotivo
        })
        .eq('id', movementId)

    if (updateErr) {
        return { success: false, message: 'Erro ao editar: ' + updateErr.message }
    }

    revalidatePath(`/dashboard/loja/${storeId}/estoque/movimentacoes`)
    revalidatePath(`/dashboard/loja/${storeId}/cadastros`)

    return { success: true, message: 'Movimentação atualizada com sucesso.' }
}

// ================================================================
// 3. ACTION: BUSCAR SOBRAS COMPATÍVEIS
// ================================================================
export type LeftoverMatch = {
    id: number
    nome_variante: string
    diametro: number
    olho: string
    estoque: number
}

export async function findCompatibleLeftover(
    storeId: number,
    esferico: string,
    cilindrico: string,
    diametroMinimo?: number
): Promise<LeftoverMatch[]> {
    const supabase = createAdminClient()

    const esf = parseFloat(esferico.replace(',', '.'))
    const cil = parseFloat(cilindrico.replace(',', '.'))

    if (isNaN(esf) || isNaN(cil)) return []

    // Cast 'as any' para select em product_variants com campos novos (is_sobra, diametro, etc)
    let query = (supabase
        .from('product_variants') as any)
        .select('id, nome_variante, diametro, olho, estoque_atual')
        .eq('store_id', storeId)
        .eq('is_sobra', true)
        .gt('estoque_atual', 0)
        .eq('esferico', esf)
        .eq('cilindrico', cil)

    if (diametroMinimo && diametroMinimo > 0) {
        query = query.gte('diametro', diametroMinimo)
    }

    const { data, error } = await query

    if (error) {
        console.error('Erro ao buscar sobras:', error)
        return []
    }

    return data.map((item: any) => ({
        id: item.id,
        nome_variante: item.nome_variante,
        diametro: item.diametro,
        olho: item.olho,
        estoque: item.estoque_atual
    }))
}

// ================================================================
// 4. ACTION: CHECK LENS STOCK (SMART CHECK)
// ================================================================
export type LensStockMatch = {
    product_id: number
    variant_id: number
    product_name: string
    variant_name: string
    esferico: number
    cilindrico: number
    eixo?: number | null
    adicao?: number | null
    olho?: LensEye | null
    estoque: number
    is_sobra: boolean
    preco_venda: number
    match_type: 'gold' | 'silver' | 'bronze'
    same_product: boolean
    target_product_has_grid: boolean
}

export type LensStockSearchResult = {
    exact: LensStockMatch[]
    similar: LensStockMatch[]
    autoReserveCandidate: LensStockMatch | null
    targetProductHasGrid: boolean
}

export type LensReservationSlot = 'OD' | 'OE'

const buildReservationSlotTag = (slot: LensReservationSlot) => `[OS_SLOT:${slot}]`

const hasReservationSlotTag = (reason: string | null | undefined, slot: LensReservationSlot) => {
    if (!reason) return false
    return reason.includes(buildReservationSlotTag(slot))
}

const buildReservationReason = (
    slot: LensReservationSlot,
    source: 'automatic' | 'manual'
) => {
    const prefix = source === 'automatic'
        ? 'Reserva automatica de lente exata'
        : 'Reserva manual de lente sugerida'

    return `${prefix} ${buildReservationSlotTag(slot)}`
}

async function restoreReservationMovement(
    supabaseAdmin: ReturnType<typeof createAdminClient>,
    reservation: any,
    reason: string
) {
    if (!reservation?.id) return

    if (reservation.variant_id) {
        const { data: variant } = await (supabaseAdmin.from('product_variants') as any)
            .select('estoque_atual')
            .eq('id', reservation.variant_id)
            .single()

        if (!variant) throw new Error('Variante da reserva nao encontrada para estorno.')

        await (supabaseAdmin.from('product_variants') as any)
            .update({ estoque_atual: (variant.estoque_atual || 0) + reservation.quantidade })
            .eq('id', reservation.variant_id)

        await (supabaseAdmin as any).rpc('increment_stock', {
            p_product_id: reservation.product_id,
            p_quantity: reservation.quantidade,
            p_new_cost: null
        })
    } else {
        const { data: product } = await (supabaseAdmin.from('products') as any)
            .select('estoque_atual')
            .eq('id', reservation.product_id)
            .single()

        if (!product) throw new Error('Produto da reserva nao encontrado para estorno.')

        await (supabaseAdmin.from('products') as any)
            .update({ estoque_atual: (product.estoque_atual || 0) + reservation.quantidade })
            .eq('id', reservation.product_id)
    }

    await (supabaseAdmin.from('stock_movements') as any).insert({
        tenant_id: reservation.tenant_id,
        store_id: reservation.store_id,
        product_id: reservation.product_id,
        variant_id: reservation.variant_id,
        tipo: 'Entrada',
        quantidade: reservation.quantidade,
        motivo: reason,
        custo_unitario_momento: reservation.custo_unitario_momento,
        registrado_por_id: reservation.registrado_por_id,
        employee_id: reservation.employee_id,
        related_os_id: reservation.related_os_id,
        related_venda_id: reservation.related_venda_id,
        created_at: new Date().toISOString()
    })

    await (supabaseAdmin.from('stock_movements') as any)
        .update({ tipo: 'Devolucao' })
        .eq('id', reservation.id)
}

export async function hasLensReservationForOsSlot(
    osId: number,
    slot: LensReservationSlot
): Promise<boolean> {
    const supabaseAdmin = createAdminClient()
    const { data } = await (supabaseAdmin.from('stock_movements') as any)
        .select('id, motivo, tipo')
        .eq('related_os_id', osId)
        .in('tipo', ['Reserva', 'Saida'])

    return (data || []).some((movement: any) => hasReservationSlotTag(movement.motivo, slot))
}

export async function getLensReservationForOsSlot(
    osId: number,
    slot: LensReservationSlot
): Promise<any | null> {
    const supabaseAdmin = createAdminClient()
    const { data } = await (supabaseAdmin.from('stock_movements') as any)
        .select('*')
        .eq('related_os_id', osId)
        .in('tipo', ['Reserva', 'Saida'])

    return (data || []).find((movement: any) => hasReservationSlotTag(movement.motivo, slot)) || null
}

export async function checkLensStock(
    storeId: number,
    esferico: number,
    cilindrico: number,
    targetProductId: number | null,
    adicao: number | null,
    targetEye: 'OD' | 'OE',
    targetAxis: number | null
): Promise<LensStockSearchResult> {
    const supabase = createAdminClient()
    const { data: targetProduct } = targetProductId
        ? await (supabase.from('products') as any)
            .select('id, tem_grade')
            .eq('id', targetProductId)
            .eq('store_id', storeId)
            .maybeSingle()
        : { data: null }
    const targetProductHasGrid = !!targetProduct?.tem_grade

    // Busca variantes com grau exato ou próximo (+/- 0.25)
    const range = 0.25
    const adicaoRange = 0.01
    const normalizedCilindrico = cilindrico === 0 ? 0 : cilindrico
    const normalizedAdicao =
        adicao === null || adicao === undefined || Math.abs(adicao) < adicaoRange
            ? null
            : adicao

    let query = (supabase.from('product_variants') as any)
        .select(`
            id, product_id, nome_variante, esferico, cilindrico, eixo, adicao, olho, estoque_atual, is_sobra,
            products ( nome, preco_venda, tem_grade )
        `)
        .eq('store_id', storeId)
        .gt('estoque_atual', 0)
        // Range Esférico
        .gte('esferico', esferico - range)
        .lte('esferico', esferico + range)

    // Range Cilíndrico: precisa incluir null (sobras podem ter cilindrico null)
    if (normalizedCilindrico === 0) {
        // Se buscando cilíndrico 0, aceita null OU range de -0.25 a 0.25
        query = query.or(`cilindrico.is.null,and(cilindrico.gte.${normalizedCilindrico - range},cilindrico.lte.${normalizedCilindrico + range})`)
    } else {
        query = query
            .gte('cilindrico', normalizedCilindrico - range)
            .lte('cilindrico', normalizedCilindrico + range)
    }

    // Filtro por Adição (se fornecida)
    if (normalizedAdicao !== null) {
        query = query
            .gte('adicao', normalizedAdicao - adicaoRange)
            .lte('adicao', normalizedAdicao + adicaoRange)
    }

    const { data, error } = await query

    if (error) {
        console.error('Erro ao buscar lentes:', error)
        return {
            exact: [],
            similar: [],
            autoReserveCandidate: null,
            targetProductHasGrid
        }
    }

    const exact: LensStockMatch[] = []
    const similar: LensStockMatch[] = []
    let autoReserveCandidate: LensStockMatch | null = null

    data.forEach((item: any) => {
        let type: 'gold' | 'silver' | 'bronze' = 'bronze'
        const itemCilindrico = item.cilindrico ?? 0
        const itemAdicao =
            item.adicao === null || item.adicao === undefined || Math.abs(item.adicao) < adicaoRange
                ? null
                : item.adicao
        const itemAxis = normalizeAxisValue(item.eixo)
        const itemEye = normalizeLensEye(item.olho)
        const sameProduct = !!targetProductId && item.product_id === targetProductId
        const isEyeCompatible =
            itemEye === null ||
            itemEye === 'AMBOS' ||
            itemEye === targetEye

        if (!isEyeCompatible) return

        const isAxisCompatible =
            !!item.is_sobra
                ? itemAxis === null || (targetAxis !== null && itemAxis === targetAxis)
                : true

        if (!isAxisCompatible) return

        const isDegreeExact = item.esferico === esferico && itemCilindrico === normalizedCilindrico
        const isAdicaoExact =
            normalizedAdicao === null
                ? true
                : itemAdicao !== null && Math.abs(itemAdicao - normalizedAdicao) <= adicaoRange
        const isProductExact = sameProduct
        const isGridExactMatch =
            targetProductHasGrid &&
            isProductExact &&
            !item.is_sobra &&
            isDegreeExact &&
            isAdicaoExact

        if (targetProductHasGrid) {
            if (isGridExactMatch) {
                type = 'gold'
            } else if (sameProduct || item.is_sobra || (isDegreeExact && isAdicaoExact)) {
                type = 'silver'
            } else {
                type = 'bronze'
            }
        } else if (isDegreeExact && isAdicaoExact) {
            type = isProductExact ? 'gold' : 'silver'
        } else {
            type = 'bronze'
        }

        const match: LensStockMatch = {
            product_id: item.product_id,
            variant_id: item.id,
            product_name: item.products?.nome || 'Produto Desconhecido',
            variant_name: item.nome_variante,
            esferico: item.esferico,
            cilindrico: itemCilindrico,
            eixo: itemAxis,
            adicao: itemAdicao,
            olho: itemEye,
            estoque: item.estoque_atual,
            is_sobra: !!item.is_sobra,
            preco_venda: item.products?.preco_venda || 0,
            match_type: type,
            same_product: sameProduct,
            target_product_has_grid: targetProductHasGrid
        }

        if (targetProductHasGrid) {
            if (isGridExactMatch) {
                exact.push(match)
                if (!autoReserveCandidate) autoReserveCandidate = match
            } else {
                similar.push(match)
            }
        } else if (type === 'gold' || type === 'silver') {
            exact.push(match)
        } else {
            similar.push(match)
        }
    })

    // Ordenar exatos: Gold primeiro
    const rankMatch = (item: LensStockMatch) => {
        const typeScore = item.match_type === 'gold' ? 2 : item.match_type === 'silver' ? 1 : 0
        const sameProductScore = item.same_product ? 3 : 0
        const exactDegreeScore = (item.esferico === esferico ? 1 : 0) + (item.cilindrico === normalizedCilindrico ? 1 : 0)
        const axisScore = item.is_sobra && targetAxis !== null && item.eixo === targetAxis ? 1 : 0
        const sobraScore = item.is_sobra ? 1 : 0
        return (sameProductScore * 100) + (typeScore * 10) + (exactDegreeScore * 2) + axisScore + sobraScore
    }

    exact.sort((a, b) => rankMatch(b) - rankMatch(a))
    similar.sort((a, b) => rankMatch(b) - rankMatch(a))

    return {
        exact,
        similar,
        autoReserveCandidate: autoReserveCandidate || exact[0] || null,
        targetProductHasGrid
    }
}

// ================================================================
// 5. ACTION: RESERVE LENS
// ================================================================
export async function reserveLens(
    storeId: number,
    variantId: number,
    productId: number,
    osId: number,
    employeeId: number,
    options?: {
        slot?: LensReservationSlot
        source?: 'automatic' | 'manual'
    }
): Promise<{ success: boolean, message: string }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    const supabaseAdmin = createAdminClient()
    const slot = options?.slot

    if (slot) {
        const { data: committedMovements } = await (supabaseAdmin.from('stock_movements') as any)
            .select('id, motivo, tipo')
            .eq('related_os_id', osId)
            .eq('tipo', 'Saida')

        const hasCommittedForSlot = (committedMovements || []).some((movement: any) =>
            hasReservationSlotTag(movement.motivo, slot)
        )

        if (hasCommittedForSlot) {
            return { success: false, message: `A lente do olho ${slot} ja foi baixada na venda e nao pode ser trocada por aqui.` }
        }

        const { data: activeReservations } = await (supabaseAdmin.from('stock_movements') as any)
            .select('*')
            .eq('related_os_id', osId)
            .eq('tipo', 'Reserva')

        const slotReservations = (activeReservations || []).filter((movement: any) =>
            hasReservationSlotTag(movement.motivo, slot)
        )

        const alreadyReserved = slotReservations.find((movement: any) =>
            movement.variant_id === variantId && movement.product_id === productId
        )

        if (alreadyReserved) {
            return {
                success: true,
                message: options?.source === 'automatic'
                    ? `A lente exata do olho ${slot} ja estava reservada.`
                    : `Esta lente ja estava reservada para o olho ${slot}.`
            }
        }

        for (const reservation of slotReservations) {
            await restoreReservationMovement(
                supabaseAdmin,
                reservation,
                `Troca de lente reservada ${buildReservationSlotTag(slot)}`
            )
        }
    }

    const formData = new FormData()
    formData.append('store_id', storeId.toString())
    formData.append('employee_id', employeeId.toString())
    formData.append('product_id', productId.toString())
    formData.append('variant_id', variantId.toString())
    formData.append('related_os_id', osId.toString())
    formData.append('tipo', 'Reserva')
    formData.append('quantidade', '1')
    formData.append(
        'motivo',
        slot
            ? buildReservationReason(slot, options?.source || 'manual')
            : 'Reserva manual de lente'
    )

    // Reutilizamos a função principal que já trata estoque e log
    return await registrarMovimentacao({ success: false, message: '' }, formData)
}

// ================================================================
// 6. ACTION: GERENCIAR RESERVAS (FINALIZAR/CANCELAR)
// ================================================================

export async function confirmReservations(vendaId: number) {
    const supabase = createAdminClient()

    // 1. Busca OSs da venda
    const { data: osList } = await (supabase.from('service_orders') as any)
        .select('id')
        .eq('venda_id', vendaId)

    if (!osList || osList.length === 0) return

    const osIds = osList.map((o: any) => o.id)

    // 2. Atualiza Reservas para Saída (Confirmação)
    // Isso mantém o estoque baixado, mas muda o status para oficializar a saída
    await (supabase.from('stock_movements') as any)
        .update({ tipo: 'Saida', motivo: `Venda #${vendaId} Finalizada (Era Reserva)` })
        .in('related_os_id', osIds)
        .eq('tipo', 'Reserva')
}

export async function cancelReservations(vendaId: number) {
    const supabase = createAdminClient()

    // 1. Busca OSs da venda
    const { data: osList } = await (supabase.from('service_orders') as any)
        .select('id')
        .eq('venda_id', vendaId)

    if (!osList || osList.length === 0) return

    const osIds = osList.map((o: any) => o.id)

    // 2. Busca Reservas ativas
    const { data: reservas } = await (supabase.from('stock_movements') as any)
        .select('*')
        .in('related_os_id', osIds)
        .eq('tipo', 'Reserva')

    if (!reservas || reservas.length === 0) return

    for (const res of reservas) {
        await restoreReservationMovement(
            supabase,
            res,
            `Estorno de Reserva (Venda #${vendaId} Cancelada/Aberta)`
        )
    }
    return

    // 3. Para cada reserva, cria uma entrada de estorno
    for (const res of reservas) {
        await (supabase.from('stock_movements') as any).insert({
            tenant_id: res.tenant_id,
            store_id: res.store_id,
            product_id: res.product_id,
            variant_id: res.variant_id,
            tipo: 'Entrada', // Devolve ao estoque
            quantidade: res.quantidade,
            motivo: `Estorno de Reserva (Venda #${vendaId} Cancelada/Aberta)`,
            custo_unitario_momento: res.custo_unitario_momento,
            registrado_por_id: res.registrado_por_id,
            employee_id: res.employee_id,
            related_os_id: res.related_os_id,
            related_venda_id: vendaId,
            created_at: new Date().toISOString()
        })

        // Atualiza estoque físico
        if (res.variant_id) {
            await (supabase as any).rpc('increment_stock', {
                p_product_id: res.product_id,
                p_quantity: res.quantidade,
                p_new_cost: null
            })
            // Atualiza variant localmente também se precisar, mas o RPC deve bastar ou update direto
            await (supabase.from('product_variants') as any)
                .update({ estoque_atual: res.quantidade })
        } else {
            await (supabase.from('products') as any)
                .update({ estoque_atual: res.quantidade })
        }

        // CORREÇÃO: Vamos fazer o update correto de estoque
        if (res.variant_id) {
            const { data: v } = await (supabase.from('product_variants') as any).select('estoque_atual').eq('id', res.variant_id).single()
            if (v) {
                await (supabase.from('product_variants') as any)
                    .update({ estoque_atual: v.estoque_atual + res.quantidade })
                    .eq('id', res.variant_id)
            }
        }
        // Atualiza produto pai
        const { data: p } = await (supabase.from('products') as any).select('estoque_atual').eq('id', res.product_id).single()
        if (p) {
            await (supabase.from('products') as any)
                .update({ estoque_atual: p.estoque_atual + res.quantidade })
                .eq('id', p.id)
        }

        // 4. Marca a reserva original como 'Cancelada'
        await (supabase.from('stock_movements') as any)
            .update({ tipo: 'Devolucao' })
            .eq('id', res.id)
    }
}

// ================================================================
// 7. ACTION: GET LOW STOCK PRODUCTS (AI TOOL)
// ================================================================
export async function getLowStockProducts(storeId: number, limit: number = 10) {
    const supabaseAdmin = createAdminClient()

    // Busca produtos com estoque baixo (menor que 5, por exemplo)
    // Cast 'as any' para select
    const { data: products } = await (supabaseAdmin
        .from('products') as any)
        .select('nome, estoque_atual, estoque_minimo, codigo_barras')
        .eq('store_id', storeId)
        .lt('estoque_atual', 5) // Hardcoded threshold for now, or use estoque_minimo if reliable
        .order('estoque_atual', { ascending: true })
        .limit(limit)

    if (!products) return []

    return products.map((p: any) => ({
        produto: p.nome,
        estoque: p.estoque_atual,
        minimo: p.estoque_minimo || 5, // Default visual
        codigo: p.codigo_barras
    }))
}

// ================================================================
// 8. ACTION: LISTAR DIVERGÊNCIAS DA GAVETA (PERDAS + SOBRAS)
// ================================================================
export async function getDivergenciasGaveta(storeId: number) {
    const supabaseAdmin = createAdminClient()

    const { data: perdas } = await (supabaseAdmin
        .from('stock_movements') as any)
        .select(`
            id, created_at, quantidade, motivo, product_id, variant_id, related_venda_id,
            products(nome, marca),
            product_variants(nome_variante, esferico, cilindrico, eixo, adicao, olho, diametro, is_sobra)
        `)
        .eq('store_id', storeId)
        .eq('tipo', 'Perda')
        .order('created_at', { ascending: false })
        .limit(200)

    const { data: sobras } = await (supabaseAdmin
        .from('product_variants') as any)
        .select(`
            id, nome_variante, esferico, cilindrico, eixo, adicao, olho, diametro, estoque_atual, product_id,
            products(nome, marca)
        `)
        .eq('store_id', storeId)
        .eq('is_sobra', true)
        .gt('estoque_atual', 0)
        .order('esferico', { ascending: true })

    return {
        perdas: perdas || [],
        sobras: sobras || []
    }
}
