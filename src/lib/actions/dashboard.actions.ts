// Caminho: src/lib/actions/dashboard.actions.ts
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
    const inicioDia = new Date(now.setHours(0,0,0,0)).toISOString()
    const fimDia = new Date(now.setHours(23,59,59,999)).toISOString()
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    return { inicioDia, fimDia, inicioMes }
}

// 1. KPI DO GERENTE (Loja Específica)
export async function getManagerKPIs(storeId: number): Promise<StoreKPIs> {
    const supabase = createAdminClient()
    const { inicioDia, fimDia, inicioMes } = getDates()

    console.log('[KPI] Calculando KPIs para loja', storeId)

    // A. Vendas do Dia
    // CORREÇÃO: Cast as any na tabela vendas
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
    // CORREÇÃO: Cast as any na tabela vendas
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
    // CORREÇÃO: Cast as any na tabela products
    const { count: estoqueCritico } = await (supabase
        .from('products') as any)
        .select('*', { count: 'exact', head: true })
        .eq('store_id', storeId)
        .eq('gerencia_estoque', true)
        .lt('estoque_atual', 5)

    // D. Aniversariantes
    const aniversariantes = await getAniversariantes(storeId)
    console.log('[KPI] Aniversariantes retornados para loja', storeId, ':', aniversariantes.length)

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

    // CORREÇÃO: Cast as any na tabela stores
    const { data: lojas } = await (supabase.from('stores') as any).select('id, name')
    if (!lojas) return { totalRedeDia: 0, totalRedeMes: 0, lojas: [] }

    let totalRedeDia = 0
    let totalRedeMes = 0
    const performanceLojas: NetworkKPIs['lojas'] = []

    for (const loja of lojas) {
        // Como 'lojas' veio de um any, garantimos que loja.id existe
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