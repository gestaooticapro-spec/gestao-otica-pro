'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getAniversariantes } from '@/lib/actions/consultas.actions'

export type StoreKPIs = {
    faturamentoDia: number
    faturamentoMes: number
    ticketMedio: number
    qtdVendasDia: number
    aniversariantes: { id: number; nome: string; fone: string | null; dia: string }[]
    estoqueCritico: number
}

export type NetworkKPIs = {
    totalRedeDia: number
    totalRedeMes: number
    lojas: {
        id: number
        nome: string
        vendasDia: number
    }[]
}

const getDates = () => {
    const now = new Date()
    const inicioDia = new Date(now.setHours(0, 0, 0, 0)).toISOString()
    const fimDia = new Date(now.setHours(23, 59, 59, 999)).toISOString()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    return { inicioDia, fimDia, inicioMes }
}

// 1. KPI DO GERENTE (Loja Específica)
export async function getManagerKPIs(storeId: number): Promise<StoreKPIs> {
    const supabase = createAdminClient()
    const { inicioDia, fimDia, inicioMes } = getDates()

    console.log('[KPI] Calculando KPIs para loja', storeId)

    // A. Vendas do Dia
    const { data: vendasDia } = await (supabase
        .from('vendas') as any)
        .select('valor_final')
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .gte('created_at', inicioDia)
        .lte('created_at', fimDia)

    const faturamentoDia = vendasDia?.reduce((acc: number, v: any) => acc + v.valor_final, 0) || 0
    const qtdVendasDia = vendasDia?.length || 0

    // B. Vendas do Mês
    const { data: vendasMes } = await (supabase
        .from('vendas') as any)
        .select('valor_final')
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .gte('created_at', inicioMes)

    const faturamentoMes = vendasMes?.reduce((acc: number, v: any) => acc + v.valor_final, 0) || 0
    const qtdVendasMes = vendasMes?.length || 0
    const ticketMedio = qtdVendasMes > 0 ? faturamentoMes / qtdVendasMes : 0

    // C. Estoque Crítico
    const { count: estoqueCritico } = await (supabase
        .from('products') as any)
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('gerencia_estoque', true)
        .lt('estoque_atual', 5)

    // D. Aniversariantes
    const aniversariantes = await getAniversariantes(storeId)

    return {
        faturamentoDia,
        faturamentoMes,
        ticketMedio,
        qtdVendasDia,
        aniversariantes,
        estoqueCritico: estoqueCritico || 0,
    }
}

export async function getAdminKPIs(): Promise<NetworkKPIs> {
    const supabase = createAdminClient()
    const { inicioDia, inicioMes } = getDates()

    const { data: lojas } = await (supabase.from('stores') as any).select('id, name')
    if (!lojas) return { totalRedeDia: 0, totalRedeMes: 0, lojas: [] }

    let totalRedeDia = 0
    let totalRedeMes = 0
    const performanceLojas: NetworkKPIs['lojas'] = []

    for (const loja of lojas) {
        const kpis = await getManagerKPIs(loja.id)
        totalRedeDia += kpis.faturamentoDia
        totalRedeMes += kpis.faturamentoMes
        performanceLojas.push({
            id: loja.id,
            nome: loja.name,
            vendasDia: kpis.faturamentoDia
        })
    }

    return {
        totalRedeDia,
        totalRedeMes,
        lojas: performanceLojas.sort((a, b) => b.vendasDia - a.vendasDia)
    }
}

// ============================================================================
// NOVO: DETALHAMENTO PARA IA (Fase 3)
// ============================================================================
export async function getSalesDetails(storeId: number, period: 'hoje' | 'mes' = 'mes') {
    const supabase = createAdminClient()
    const now = new Date()
    let inicio = ''
    let fim = new Date(now.setHours(23, 59, 59, 999)).toISOString()

    if (period === 'hoje') {
        inicio = new Date(now.setHours(0, 0, 0, 0)).toISOString()
    } else {
        // Mês atual
        inicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    }

    // 1. Buscar Pagamentos no período
    const { data: pagamentos } = await (supabase.from('pagamentos') as any)
        .select('valor_pago, forma_pagamento')
        .eq('store_id', storeId)
        .gte('created_at', inicio)
        .lte('created_at', fim)

    // 2. Agrupar por Tipo
    const porTipo: Record<string, number> = {}
    let total = 0

    pagamentos?.forEach((p: any) => {
        const tipo = p.forma_pagamento || 'Outros'
        const valor = Number(p.valor_pago)
        porTipo[tipo] = (porTipo[tipo] || 0) + valor
        total += valor
    })

    return {
        periodo: period,
        total_vendas: total,
        detalhamento: porTipo
    }
}

// ============================================================================
// NOVO: RANKING DE CLIENTES (Fase 3)
// ============================================================================
export async function getTopCustomers(storeId: number) {
    const supabase = createAdminClient()
    const now = new Date()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

    // 1. Buscar todas as vendas do mês
    const { data: vendas } = await (supabase.from('vendas') as any)
        .select('valor_final, customer_id, customers(full_name)')
        .eq('store_id', storeId)
        .eq('status', 'Fechada')
        .gte('created_at', inicioMes)

    if (!vendas) return []

    // 2. Agrupar por Cliente
    const ranking: Record<number, { nome: string, total: number, qtd: number }> = {}

    vendas.forEach((v: any) => {
        const cid = v.customer_id
        if (!cid) return

        if (!ranking[cid]) {
            ranking[cid] = {
                nome: v.customers?.full_name || 'Cliente Desconhecido',
                total: 0,
                qtd: 0
            }
        }
        ranking[cid].total += v.valor_final
        ranking[cid].qtd += 1
    })

    // 3. Ordenar e Pegar Top 5
    const top5 = Object.values(ranking)
        .sort((a, b) => b.total - a.total)
        .slice(0, 5)

    return top5
}

// ============================================================================
// NOVO: VENDAS RECENTES (Fase 3 - AI Tool)
// ============================================================================
export async function getRecentSales(storeId: number, limit: number = 5) {
    const supabase = createAdminClient()
    const now = new Date()
    const inicioDia = new Date(now.setHours(0, 0, 0, 0)).toISOString()

    // 1. Busca vendas de hoje
    const { data: vendas } = await (supabase.from('vendas') as any)
        .select(`
            id, valor_final, created_at, status,
            customers ( full_name ),
            employees ( full_name )
        `)
        .eq('store_id', storeId)
        .gte('created_at', inicioDia)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (!vendas) return []

    // 2. Formata para a IA
    return vendas.map((v: any) => ({
        id: v.id,
        hora: new Date(v.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        cliente: v.customers?.full_name || 'Consumidor Final',
        vendedor: v.employees?.full_name || 'N/A',
        valor: v.valor_final,
        status: v.status
    }))
}

// ============================================================================
// NOVO: PRODUTOS MAIS VENDIDOS (Fase 3 - AI Tool)
// ============================================================================
export async function getTopProducts(storeId: number, period: 'mes' | 'ano' | 'hoje' = 'mes') {
    const supabase = createAdminClient()
    const now = new Date()
    let inicio = ''

    if (period === 'hoje') {
        inicio = new Date(now.setHours(0, 0, 0, 0)).toISOString()
    } else if (period === 'ano') {
        inicio = new Date(now.getFullYear(), 0, 1).toISOString()
    } else {
        // Mês atual (padrão)
        inicio = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    }

    // 1. Busca itens vendidos no período (apenas de vendas fechadas)
    const { data: itens } = await (supabase.from('venda_itens') as any)
        .select(`
            quantidade, valor_total_item, descricao,
            vendas!inner ( status, created_at )
        `)
        .eq('store_id', storeId)
        .eq('vendas.status', 'Fechada')
        .gte('vendas.created_at', inicio)

    if (!itens) return []

    // 2. Agrupa por Descrição do Produto
    const ranking: Record<string, { qtd: number, total: number }> = {}

    itens.forEach((item: any) => {
        const nome = item.descricao || 'Produto Sem Nome'
        if (!ranking[nome]) {
            ranking[nome] = { qtd: 0, total: 0 }
        }
        ranking[nome].qtd += item.quantidade
        ranking[nome].total += item.valor_total_item
    })

    // 3. Ordena por Quantidade e pega Top 5
    const top5 = Object.entries(ranking)
        .map(([nome, dados]) => ({ nome, ...dados }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 5)

    return top5
}