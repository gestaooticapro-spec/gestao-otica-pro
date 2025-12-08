// ARQUIVO: src/lib/actions/stock.actions.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// 1. ATUALIZAÇÃO DO SCHEMA (CORRIGIDO)
const MovimentoSchema = z.object({
  store_id: z.coerce.number(),
  // CORREÇÃO: Removido o objeto { required_error: ... } que causava o erro
  employee_id: z.coerce.number(), 
  product_id: z.coerce.number(),
  variant_id: z.coerce.number().optional().nullable(),
  tipo: z.enum(['Entrada', 'Saida', 'Perda', 'Ajuste', 'Devolucao', 'Brinde']),
  quantidade: z.coerce.number().min(1, "A quantidade deve ser maior que zero."),
  motivo: z.string().min(3, "O motivo é obrigatório."),
  // --- NOVOS CAMPOS PARA FLUXO 2 (PERDA/SOBRA) ---
  related_venda_id: z.coerce.number().optional().nullable(),
  sobra_detalhes: z.object({
      diametro: z.coerce.number(),
      olho: z.string()
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
    product_id, variant_id, tipo, quantidade, motivo, store_id, employee_id,
    related_venda_id, sobra_detalhes 
  } = validated.data

  // 3. LÓGICA DE SINAL
  let multiplicador = 1
  if (['Saida', 'Perda', 'Brinde'].includes(tipo)) {
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
    
    // Atualiza Estoque
    if (variant_id) {
        // Cast 'as any' para select em product_variants
        const { data: variant } = await (supabaseAdmin
            .from('product_variants') as any)
            .select('estoque_atual')
            .eq('id', variant_id)
            .single()
        
        if (variant) estoqueAtual = variant.estoque_atual

        // Cast 'as any' para update em product_variants
        await (supabaseAdmin.from('product_variants') as any)
            .update({ estoque_atual: estoqueAtual + deltaEstoque })
            .eq('id', variant_id)
        
        // Cast 'as any' para RPC
        await (supabaseAdmin as any).rpc('increment_stock', { 
            p_product_id: product_id, 
            p_quantity: deltaEstoque,
            p_new_cost: null 
        })
    } else {
         // Cast 'as any' para update em products
         await (supabaseAdmin.from('products') as any)
            .update({ estoque_atual: estoqueAtual + deltaEstoque })
            .eq('id', product_id)
    }

    // 4. GRAVAÇÃO DA MOVIMENTAÇÃO PRINCIPAL
    // Cast 'as any' para insert em stock_movements
    const { error: insertError } = await (supabaseAdmin.from('stock_movements') as any).insert({
        tenant_id: profile.tenant_id,
        store_id: store_id,
        product_id: product_id,
        variant_id: variant_id || null,
        tipo: tipo,
        quantidade: quantidade,
        motivo: motivo,
        custo_unitario_momento: produto.preco_custo,
        
        registrado_por_id: user.id,   // Usuário do Sistema
        employee_id: employee_id,     // Quem autorizou (PIN)
        related_venda_id: related_venda_id || null,
        
        created_at: new Date().toISOString()
    })

    if (insertError) throw insertError

    // --- LÓGICA NOVA: SE FOR PERDA E GEROU SOBRA ---
    if (tipo === 'Perda' && sobra_detalhes && sobra_detalhes.diametro) {
        // A. Cria a Variante de Sobra (Custo Zero)
        // Cast 'as any' para insert em product_variants com campos novos
        const { data: novaSobra } = await (supabaseAdmin.from('product_variants') as any).insert({
            product_id: product_id,
            store_id: store_id,
            tenant_id: profile.tenant_id,
            nome_variante: `Sobra ${sobra_detalhes.olho} Ø${sobra_detalhes.diametro} (Recup. Quebra)`,
            
            esferico: null, 
            cilindrico: null,
            
            is_sobra: true,
            diametro: sobra_detalhes.diametro,
            olho: sobra_detalhes.olho,
            estoque_atual: 1, 
        }).select().single()

        if (novaSobra) {
            // B. Registra a Entrada da Sobra no Histórico
            // Cast 'as any' para insert em stock_movements
            await (supabaseAdmin.from('stock_movements') as any).insert({
                tenant_id: profile.tenant_id,
                store_id: store_id,
                product_id: product_id,
                variant_id: novaSobra.id,
                tipo: 'Entrada',
                quantidade: 1,
                motivo: `Sobra gerada da quebra/perda (Origem: Venda #${related_venda_id || 'N/A'})`,
                custo_unitario_momento: 0, 
                registrado_por_id: user.id,
                employee_id: employee_id,
                related_venda_id: related_venda_id || null
            })
        }
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