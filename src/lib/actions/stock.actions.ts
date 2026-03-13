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
        olho: z.string(),
        esferico: z.coerce.number().optional().nullable(),
        cilindrico: z.coerce.number().optional().nullable(),
        adicao: z.coerce.number().optional().nullable()
    }).optional().nullable()
})

export type StockActionResult = {
    success: boolean
    message: string
}

export async function registrarMovimentacao(
    prevState: StockActionResult,
    formData: FormData
): Promise<StockActionResult> {
    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    // Cast 'as any' para garantir acesso a props do perfil
    const profile = await getProfileByAdmin(user.id) as any
    if (!profile) return { success: false, message: 'Perfil não encontrado.' }

    // 2. CAPTURA DOS DADOS
    const rawData = {
        store_id: profile.store_id,
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
        if (sobra_detalhes && sobra_detalhes.diametro) {
            // Se já temos a variante original (ex: perdendo uma lente da grade), pegamos os graus de lá
            if (variant_id) {
                const { data: v } = await (supabaseAdmin.from('product_variants') as any).select('esferico, cilindrico, adicao').eq('id', variant_id).single()
                if (v) variantData = v
            }

            const insertPayload = {
                product_id: product_id,
                store_id: store_id,
                tenant_id: profile.tenant_id,
                nome_variante: `Sobra ${sobra_detalhes.olho} Ø${sobra_detalhes.diametro}`,
                esferico: variantData?.esferico ?? sobra_detalhes.esferico ?? 0,
                cilindrico: variantData?.cilindrico ?? sobra_detalhes.cilindrico ?? 0,
                adicao: variantData?.adicao ?? sobra_detalhes.adicao ?? null,
                is_sobra: true,
                diametro: sobra_detalhes.diametro,
                olho: sobra_detalhes.olho,
                estoque_atual: 0, // Começamos com zero para a movimentação posterior alimentar
            }

            const { data: novaSobra } = await (supabaseAdmin.from('product_variants') as any).insert(insertPayload).select().single()

            if (novaSobra) {
                novaSobraId = novaSobra.id
                // Se for ENTRADA, a própria movimentação principal já deve ser para esta nova variante
                if (tipo === 'Entrada') {
                    effectiveVariantId = novaSobra.id
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
                .update({ estoque_atual: 1 })
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
                motivo: `Sobra recuperada da quebra (Origem: Venda #${related_venda_id || 'N/A'})`,
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
            id, created_at, tipo, quantidade, motivo,
            products ( nome, codigo_barras ),
            product_variants ( nome_variante ),
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
    adicao?: number | null
    estoque: number
    is_sobra: boolean
    preco_venda: number
    match_type: 'gold' | 'silver' | 'bronze'
}

export async function checkLensStock(
    storeId: number,
    esferico: number,
    cilindrico: number,
    targetProductId: number | null,
    adicao: number | null
): Promise<{ exact: LensStockMatch[], similar: LensStockMatch[] }> {
    const supabase = createAdminClient()

    // Busca variantes com grau exato ou próximo (+/- 0.25)
    const range = 0.25

    let query = (supabase.from('product_variants') as any)
        .select(`
            id, product_id, nome_variante, esferico, cilindrico, adicao, estoque_atual, is_sobra,
            products ( nome, preco_venda )
        `)
        .eq('store_id', storeId)
        .gt('estoque_atual', 0)
        // Range Esférico
        .gte('esferico', esferico - range)
        .lte('esferico', esferico + range)

    // Range Cilíndrico: precisa incluir null (sobras podem ter cilindrico null)
    if (cilindrico === 0) {
        // Se buscando cilíndrico 0, aceita null OU range de -0.25 a 0.25
        query = query.or(`cilindrico.is.null,and(cilindrico.gte.${cilindrico - range},cilindrico.lte.${cilindrico + range})`)
    } else {
        query = query
            .gte('cilindrico', cilindrico - range)
            .lte('cilindrico', cilindrico + range)
    }

    // Filtro por Adição (se fornecida)
    if (adicao !== null && adicao !== undefined) {
        query = query.eq('adicao', adicao)
    }

    const { data, error } = await query

    if (error) {
        console.error('Erro ao buscar lentes:', error)
        return { exact: [], similar: [] }
    }

    const exact: LensStockMatch[] = []
    const similar: LensStockMatch[] = []

    data.forEach((item: any) => {
        let type: 'gold' | 'silver' | 'bronze' = 'bronze'
        const isDegreeExact = item.esferico === esferico && item.cilindrico === cilindrico
        const isProductExact = targetProductId ? item.product_id === targetProductId : false

        if (isDegreeExact) {
            if (isProductExact) {
                type = 'gold'
            } else {
                type = 'silver'
            }
        } else {
            type = 'bronze'
        }

        const match: LensStockMatch = {
            product_id: item.product_id,
            variant_id: item.id,
            product_name: item.products?.nome || 'Produto Desconhecido',
            variant_name: item.nome_variante,
            esferico: item.esferico,
            cilindrico: item.cilindrico,
            adicao: item.adicao,
            estoque: item.estoque_atual,
            is_sobra: !!item.is_sobra,
            preco_venda: item.products?.preco_venda || 0,
            match_type: type
        }

        if (type === 'gold' || type === 'silver') {
            exact.push(match)
        } else {
            similar.push(match)
        }
    })

    // Ordenar exatos: Gold primeiro
    exact.sort((a, b) => (a.match_type === 'gold' ? -1 : 1))

    return { exact, similar }
}

// ================================================================
// 5. ACTION: RESERVE LENS
// ================================================================
export async function reserveLens(
    storeId: number,
    variantId: number,
    productId: number,
    osId: number,
    employeeId: number
): Promise<{ success: boolean, message: string }> {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) return { success: false, message: 'Usuário não autenticado.' }

    const formData = new FormData()
    formData.append('store_id', storeId.toString())
    formData.append('employee_id', employeeId.toString())
    formData.append('product_id', productId.toString())
    formData.append('variant_id', variantId.toString())
    formData.append('related_os_id', osId.toString())

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
                .eq('id', res.product_id)
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