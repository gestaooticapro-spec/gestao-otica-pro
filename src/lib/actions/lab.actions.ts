// ARQUIVO: src/lib/actions/lab.actions.ts
'use server'

import { createAdminClient } from "@/lib/supabase/admin"
import { revalidatePath } from "next/cache"
import { clearNfcTrayLinkForDeliveredOrder } from "@/lib/nfc-tray-cleanup"

export type LabOSResult = {
    id: number
    venda_id: number | null
    customer_id?: number | null
    created_at: string
    customer_name: string
    customer_phone?: string | null
    dependente_name?: string | null
    protocolo_fisico?: string | null
    status: string
    // Campos de Rastreio
    dt_pedido_em: string | null
    dt_lente_chegou: string | null
    dt_montado_em: string | null
    dt_entregue_em: string | null
    lab_nome: string | null
    lab_pedido_por_id: number | null
    // Flags booleanas
    armacao_com_cliente: boolean
    os_enviada_ao_lab: boolean
}

export type EmployeeSimple = {
    id: number
    name: string
}

export type NfcTagResult = {
    id: string
    current_service_order_id: number | null
    status: 'active' | 'inactive' | 'lost'
}

export async function getNfcTagsForLab(storeId: number): Promise<NfcTagResult[]> {
    const supabase = createAdminClient()
    const { data, error } = await (supabase.from('nfc_trays') as any)
        .select('id, current_service_order_id, status')
        .eq('store_id', storeId)
        .order('id', { ascending: true })

    if (error) {
        console.error('Erro ao buscar tags NFC do laboratÃ³rio:', error)
        return []
    }

    return (data || []) as NfcTagResult[]
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

    // ESTRATÉGIA A: BUSCA EXATA PELO ID DA OS OU PROTOCOLO (NUMÉRICO)
    if (!isNaN(Number(cleanQuery))) {
        const { data: byId } = await supabase
            .from('service_orders')
            .select(`
                id, venda_id, customer_id, created_at, protocolo_fisico,
                dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
                armacao_com_cliente, os_enviada_ao_lab,
                customers ( full_name, fone_movel, phone ),
                dependentes ( full_name ),
                vendas ( status )
            `)
            .eq('store_id', storeId)
            .or(`id.eq.${cleanQuery},protocolo_fisico.eq.${cleanQuery}`) as any

        if (byId) results = [...results, ...byId]
    }

    // ESTRATÉGIA A2: BUSCA POR PROTOCOLO (TEXTO - ilike)
    {
        const { data: byProtocolo } = await supabase
            .from('service_orders')
            .select(`
                id, venda_id, customer_id, created_at, protocolo_fisico,
                dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
                armacao_com_cliente, os_enviada_ao_lab,
                customers ( full_name, fone_movel, phone ),
                dependentes ( full_name ),
                vendas ( status )
            `)
            .eq('store_id', storeId)
            .ilike('protocolo_fisico', `%${cleanQuery}%`)
            .order('created_at', { ascending: false })
            .limit(5) as any

        if (byProtocolo) results = [...results, ...byProtocolo]
    }

    // ESTRATÉGIA B: BUSCA POR NOME DO CLIENTE
    const { data: byCustomer } = await supabase
        .from('service_orders')
        .select(`
            id, venda_id, customer_id, created_at,
            dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
            armacao_com_cliente, os_enviada_ao_lab,
            customers!inner ( full_name, fone_movel, phone ),
            dependentes ( full_name ),
            vendas!inner ( status )
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
                id, venda_id, customer_id, created_at,
                dt_pedido_em, dt_lente_chegou, dt_montado_em, dt_entregue_em, lab_nome, lab_pedido_por_id,
                armacao_com_cliente, os_enviada_ao_lab,
                customers ( full_name, fone_movel, phone ),
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
        venda_id: os.venda_id,
        customer_id: os.customer_id,
        created_at: os.created_at,
        customer_name: os.customers?.full_name || 'Consumidor',
        customer_phone: os.customers?.fone_movel || os.customers?.phone || null,
        dependente_name: os.dependentes?.full_name || null,
        protocolo_fisico: os.protocolo_fisico || null,
        status: os.vendas?.status || 'Indefinido',
        dt_pedido_em: os.dt_pedido_em,
        dt_lente_chegou: os.dt_lente_chegou,
        dt_montado_em: os.dt_montado_em,
        dt_entregue_em: os.dt_entregue_em,
        lab_nome: os.lab_nome,
        lab_pedido_por_id: os.lab_pedido_por_id,
        armacao_com_cliente: os.armacao_com_cliente ?? false,
        os_enviada_ao_lab: os.os_enviada_ao_lab ?? false
    }))
}

// 2. LISTAR OS PRONTAS PARA ENTREGA
export async function getReadyOSForDelivery(storeId: number): Promise<LabOSResult[]> {
    const supabase = createAdminClient()

    const { data, error } = await (supabase.from('service_orders') as any)
        .select(`
            id,
            venda_id,
            customer_id,
            created_at,
            protocolo_fisico,
            dt_pedido_em,
            dt_lente_chegou,
            dt_montado_em,
            dt_entregue_em,
            lab_nome,
            lab_pedido_por_id,
            customers ( full_name, fone_movel, phone ),
            dependentes ( full_name ),
            vendas!inner ( status )
        `)
        .eq('store_id', storeId)
        .not('dt_montado_em', 'is', null)
        .is('dt_entregue_em', null)
        .is('lab_encerrada_em', null)
        .not('vendas.status', 'in', '("Cancelada","Devolvida")')
        .order('dt_montado_em', { ascending: true })

    if (error) {
        console.error("Erro ao buscar OS prontas para entrega:", error)
        return []
    }

    return (data || []).map((os: any) => ({
        id: os.id,
        venda_id: os.venda_id,
        customer_id: os.customer_id,
        created_at: os.created_at,
        customer_name: os.customers?.full_name || 'Consumidor',
        customer_phone: os.customers?.fone_movel || os.customers?.phone || null,
        dependente_name: os.dependentes?.full_name || null,
        protocolo_fisico: os.protocolo_fisico || null,
        status: os.vendas?.status || 'Indefinido',
        dt_pedido_em: os.dt_pedido_em,
        dt_lente_chegou: os.dt_lente_chegou,
        dt_montado_em: os.dt_montado_em,
        dt_entregue_em: os.dt_entregue_em,
        lab_nome: os.lab_nome,
        lab_pedido_por_id: os.lab_pedido_por_id
    }))
}

// 3. LISTAR TODAS AS OS ABERTAS DO LABORATORIO
export async function getOpenLabOS(storeId: number): Promise<LabOSResult[]> {
    const supabase = createAdminClient()

    const { data, error } = await (supabase.from('service_orders') as any)
        .select(`
            id,
            venda_id,
            customer_id,
            created_at,
            protocolo_fisico,
            dt_pedido_em,
            dt_lente_chegou,
            dt_montado_em,
            dt_entregue_em,
            lab_nome,
            lab_pedido_por_id,
            armacao_com_cliente,
            os_enviada_ao_lab,
            customers ( full_name, fone_movel, phone ),
            dependentes ( full_name ),
            vendas!inner ( status )
        `)
        .eq('store_id', storeId)
        .is('dt_entregue_em', null)
        .is('lab_encerrada_em', null)
        .not('vendas.status', 'in', '("Cancelada","Devolvida")')
        .order('created_at', { ascending: true })

    if (error) {
        console.error("Erro ao buscar OS abertas do laboratório:", error)
        return []
    }

    return (data || []).map((os: any) => ({
        id: os.id,
        venda_id: os.venda_id,
        customer_id: os.customer_id,
        created_at: os.created_at,
        customer_name: os.customers?.full_name || 'Consumidor',
        customer_phone: os.customers?.fone_movel || os.customers?.phone || null,
        dependente_name: os.dependentes?.full_name || null,
        protocolo_fisico: os.protocolo_fisico || null,
        status: os.vendas?.status || 'Indefinido',
        dt_pedido_em: os.dt_pedido_em,
        dt_lente_chegou: os.dt_lente_chegou,
        dt_montado_em: os.dt_montado_em,
        dt_entregue_em: os.dt_entregue_em,
        lab_nome: os.lab_nome,
        lab_pedido_por_id: os.lab_pedido_por_id,
        armacao_com_cliente: os.armacao_com_cliente ?? false,
        os_enviada_ao_lab: os.os_enviada_ao_lab ?? false,
    }))
}

// 3b. TOGGLE DE FLAG BOOLEANA DO LABORATÓRIO
export async function toggleLabBoolean(
    osId: number,
    field: 'armacao_com_cliente' | 'os_enviada_ao_lab',
    value: boolean
): Promise<{ ok: boolean }> {
    const supabase = createAdminClient()
    const { error } = await (supabase.from('service_orders') as any)
        .update({ [field]: value })
        .eq('id', osId)
    return { ok: !error }
}

// 4. AVANÇAR ETAPA DO LABORATÓRIO
export async function advanceLabStage(
    osId: number,
    storeId: number,
    stage: 'dt_pedido_em' | 'dt_lente_chegou' | 'dt_montado_em'
) {
    const supabase = createAdminClient()
    const now = new Date().toISOString()

    const { error } = await (supabase.from('service_orders') as any)
        .update({ [stage]: now })
        .eq('id', osId)
        .eq('store_id', storeId)

    if (error) {
        console.error("Erro ao avançar etapa do laboratório:", error)
        return { success: false, message: 'Erro ao mover etapa do laboratório.' }
    }

    revalidatePath(`/dashboard/loja/${storeId}`)
    revalidatePath(`/dashboard/loja/${storeId}/laboratorio`)
    revalidatePath(`/dashboard/loja/${storeId}/entrega`)
    return { success: true, message: 'Etapa atualizada.' }
}

// 4B. REGREDIR ETAPA DO LABORATÓRIO (desfazer lançamento errado)
export async function regressLabStage(
    osId: number,
    storeId: number,
    field: 'dt_pedido_em' | 'dt_lente_chegou' | 'dt_montado_em'
) {
    const supabase = createAdminClient()

    const { error } = await (supabase.from('service_orders') as any)
        .update({ [field]: null })
        .eq('id', osId)
        .eq('store_id', storeId)

    if (error) {
        console.error("Erro ao regredir etapa do laboratório:", error)
        return { success: false, message: 'Erro ao voltar etapa do laboratório.' }
    }

    revalidatePath(`/dashboard/loja/${storeId}`)
    revalidatePath(`/dashboard/loja/${storeId}/laboratorio`)
    revalidatePath(`/dashboard/loja/${storeId}/entrega`)
    return { success: true, message: 'Etapa revertida.' }
}

// 7. BUSCAR PRODUTOS COM GRADE CADASTRADA
export type LensProductSimple = {
    id: number
    nome: string
}

export async function getLensProductsWithGrade(storeId: number): Promise<LensProductSimple[]> {
    const supabase = createAdminClient()

    // Passo 1: buscar product_ids distintos que têm grade cadastrada
    const { data: variantRows } = await (supabase.from('product_variants') as any)
        .select('product_id')
        .eq('store_id', storeId)
        .not('esferico', 'is', null)
        .not('cilindrico', 'is', null)

    if (!variantRows?.length) return []

    const productIds = [...new Set<number>(variantRows.map((r: any) => r.product_id))]

    // Passo 2: buscar os nomes dos produtos
    const { data: productRows } = await (supabase.from('products') as any)
        .select('id, nome')
        .in('id', productIds)
        .eq('store_id', storeId)
        .order('nome', { ascending: true })

    if (!productRows) return []

    return productRows.map((p: any) => ({ id: p.id, nome: p.nome }))
}

// 8. BUSCAR VARIANTES DA GRADE DE UMA LENTE
export type LensVariantGrade = {
    id: number
    esferico: number
    cilindrico: number
    estoque_atual: number
}

export async function getLensGradeVariants(productId: number, storeId: number): Promise<LensVariantGrade[]> {
    const supabase = createAdminClient()

    const { data } = await (supabase.from('product_variants') as any)
        .select('id, esferico, cilindrico, estoque_atual')
        .eq('product_id', productId)
        .eq('store_id', storeId)
        .not('esferico', 'is', null)
        .not('cilindrico', 'is', null)
        .order('esferico', { ascending: true })
        .order('cilindrico', { ascending: true })

    return data || []
}

// 5. SALVAR ATUALIZAÇÃO DO LABORATÓRIO
export async function updateLabTracking(osId: number, storeId: number, formData: FormData) {
    const supabase = createAdminClient()
    const toIsoOrNull = (fieldName: string) => {
        const rawValue = formData.get(fieldName)?.toString()
        if (!rawValue) return null

        const parsedDate = new Date(rawValue)
        if (Number.isNaN(parsedDate.getTime())) return null

        return parsedDate.toISOString()
    }

    const updates = {
        dt_pedido_em: toIsoOrNull('dt_pedido_em'),
        lab_nome: formData.get('lab_nome')?.toString() || null,
        dt_lente_chegou: toIsoOrNull('dt_lente_chegou'),
        dt_montado_em: toIsoOrNull('dt_montado_em'),
        dt_entregue_em: toIsoOrNull('dt_entregue_em'),
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

    if (updates.dt_entregue_em) {
        try {
            await clearNfcTrayLinkForDeliveredOrder(osId, updates.dt_entregue_em)
        } catch (cleanupError) {
            console.error("Erro ao limpar vínculo NFC na entrega:", cleanupError)
            return { success: false, message: 'Entrega salva, mas falhou ao liberar o envelope.' }
        }
    }

    revalidatePath(`/dashboard/loja/${storeId}`)
    revalidatePath(`/nfc/${storeId}`)
    return { success: true }
}

// 6. ATUALIZAR TELEFONE DO CLIENTE
export async function updateCustomerPhone(customerId: number, storeId: number, phone: string) {
    const supabase = createAdminClient()

    const { error } = await (supabase.from('customers') as any)
        .update({ fone_movel: phone })
        .eq('id', customerId)
        .eq('store_id', storeId)

    if (error) {
        console.error("Erro update phone:", error)
        return { success: false, message: 'Erro ao atualizar telefone.' }
    }

    // Revalidação para garantir dados novos na busca subsequente
    revalidatePath(`/dashboard/loja/${storeId}`)
    return { success: true }
}
