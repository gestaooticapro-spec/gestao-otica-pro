// ARQUIVO: src/lib/actions/lab.actions.ts
'use server'

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"

export type LabOSResult = {
    id: number
    venda_id: number | null // <--- IMPORTANTE: Esse campo garante o redirecionamento
    created_at: string
    customer_name: string
    dependente_name?: string | null
    status: string
    // Campos de Rastreio
    dt_pedido_em: string | null
    dt_lente_chegou: string | null
    dt_montado_em: string | null
    dt_entregue_em: string | null
    lab_nome: string | null
    lab_pedido_por_id: number | null
}

export type EmployeeSimple = {
    id: number
    name: string
}

// 0. BUSCAR FUNCIONÁRIOS
export async function getEmployees(storeId: number): Promise<EmployeeSimple[]> {
    const supabase = createAdminClient()
    const { data } = await supabase
        .from('employees')
        .select('id, full_name')
        .eq('store_id', storeId)
        .eq('is_active', true)
        .order('full_name') as any
    
    return data?.map((e: any) => ({
        id: e.id,
        name: e.full_name
    })) || []
}

// 1. BUSCAR OS PARA RASTREIO
export async function searchOSForLab(storeId: number, query: string): Promise<LabOSResult[]> {
    const supabase = createAdminClient()
    const cleanQuery = query.trim()
    
    let results: any[] = []

    // ESTRATÉGIA A: BUSCA EXATA PELO ID DA OS
    if (!isNaN(Number(cleanQuery))) {
        const { data: byId } = await supabase
            .from('service_orders')
            .select(`
                id, venda_id, created_at, 
                dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
                customers ( full_name ),
                dependentes ( full_name ),
                vendas ( status )
            `)
            .eq('store_id', storeId)
            .eq('id', cleanQuery) as any
        
        if (byId) results = [...results, ...byId]
    }

    // ESTRATÉGIA B: BUSCA POR NOME DO CLIENTE
    const { data: byCustomer } = await supabase
        .from('service_orders')
        .select(`
            id, venda_id, created_at,
            dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
            customers!inner ( full_name ),
            dependentes ( full_name ),
            vendas ( status )
        `)
        .eq('store_id', storeId)
        .ilike('customers.full_name', `%${cleanQuery}%`)
        .order('created_at', { ascending: false })
        .limit(5) as any

    if (byCustomer) results = [...results, ...byCustomer]

    // ESTRATÉGIA C: BUSCA POR NOME DO DEPENDENTE
    try {
        const { data: byDependente } = await supabase
            .from('service_orders')
            .select(`
                id, venda_id, created_at,
                dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
                customers ( full_name ),
                dependentes!inner ( full_name ),
                vendas ( status )
            `)
            .eq('store_id', storeId)
            .ilike('dependentes.full_name', `%${cleanQuery}%`)
            .order('created_at', { ascending: false })
            .limit(5) as any

        if (byDependente) results = [...results, ...byDependente]
    } catch (error) {
        console.log("Erro busca dependente:", error)
    }

    // REMOVER DUPLICATAS
    const uniqueMap = new Map()
    results.forEach(item => uniqueMap.set(item.id, item))
    const uniqueResults = Array.from(uniqueMap.values())

    return uniqueResults.map((os: any) => ({
        id: os.id,
        venda_id: os.venda_id, // <--- O SEGREDO ESTÁ AQUI
        created_at: os.created_at,
        customer_name: os.customers?.full_name || 'Consumidor',
        dependente_name: os.dependentes?.full_name || null,
        status: os.vendas?.status || 'Indefinido',
        dt_pedido_em: os.dt_pedido_em,
        dt_lente_chegou: os.dt_lente_chegou,
        dt_montado_em: os.dt_montado_em,
        dt_entregue_em: os.dt_entregue_em,
        lab_nome: os.lab_nome,
        lab_pedido_por_id: os.lab_pedido_por_id
    }))
}

// 2. SALVAR ATUALIZAÇÃO DO LABORATÓRIO
export async function updateLabTracking(osId: number, storeId: number, formData: FormData) {
    const supabase = createAdminClient()
    
    const updates = {
        dt_pedido_em: formData.get('dt_pedido_em')?.toString() || null,
        lab_nome: formData.get('lab_nome')?.toString() || null,
        dt_lente_chegou: formData.get('dt_lente_chegou')?.toString() || null,
        dt_montado_em: formData.get('dt_montado_em')?.toString() || null,
        dt_entregue_em: formData.get('dt_entregue_em')?.toString() || null,
        lab_pedido_por_id: formData.get('lab_pedido_por_id') ? Number(formData.get('lab_pedido_por_id')) : null
    }

    const { error } = await (supabase.from('service_orders') as any)
        .update(updates)
        .eq('id', osId)
        .eq('store_id', storeId)

    if (error) {
        console.error("Erro update lab:", error)
        return { success: false, message: 'Erro ao salvar rastreio.' }
    }

    revalidatePath(`/dashboard/loja/${storeId}`)
    return { success: true }
}