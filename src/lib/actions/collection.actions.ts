// Caminho: src/lib/actions/collection.actions.ts
'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { Database } from '@/lib/database.types'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

// --- Tipos ---
export type DevedorResumo = {
    customer_id: number
    full_name: string
    fone_movel: string | null
    is_spc: boolean
    total_atrasado: number
    dias_atraso: number
    quantidade_parcelas_atrasadas: number
    vendas_afetadas: number[]
}

export type CobrancaHistoricoItem = Database['public']['Tables']['cobranca_historico']['Row'] & {
    profiles?: { full_name: string } | null
}

export type RetornoCobranca = {
    id: number
    customer_id: number
    customer_name: string
    fone_movel: string | null
    tipo_contato: string
    resumo_conversa: string
    proxima_acao: string
    profiles?: { full_name: string } | null
}

// --- 1. BUSCAR LISTA DE INADIMPLENTES ---
export async function getInadimplentes(storeId: number, filtro: 'cobrar' | 'ja_cobrados' = 'cobrar') {
    const supabaseAdmin = createAdminClient()
    const hoje = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

    try {
        let query = (supabaseAdmin
            .from('financiamento_parcelas') as any)
            .select(`
                id,
                valor_parcela,
                data_vencimento,
                customer_id,
                status,
                financiamento_loja ( venda_id ), 
                customers!inner ( id, full_name, fone_movel, is_spc, cobranca_status )
            `)
            .eq('store_id', storeId)
            .eq('status', 'Pendente')
            .lt('data_vencimento', hoje)
            .order('data_vencimento', { ascending: true })

        const { data, error } = await query

        console.log("DEBUG: getInadimplentes storeId:", storeId, "filtro:", filtro)
        if (error) {
            console.error("DEBUG: Error fetching data:", error)
            throw error
        }
        console.log("DEBUG: Raw data count:", data?.length)
        if (data && data.length > 0) {
            console.log("DEBUG: Sample customer:", data[0].customers)
        }

        if (!data) return []

        // PÓS-PROCESSAMENTO PARA FILTROS (Proxima Ação e Status)

        // 1. Busca todos historicos recentes desses clientes para saber a próxima ação
        const clienteIds = Array.from(new Set(data.map((p: any) => p.customer_id))) as number[]

        if (clienteIds.length === 0) return []

        const { data: ultimasAcoes } = await (supabaseAdmin.from('cobranca_historico') as any)
            .select('customer_id, proxima_acao')
            .in('customer_id', clienteIds)
            // Ordenar por updated_at ou created_at desc para pegar o último agendamento
            .order('created_at', { ascending: false })

        // Mapa: CustomerID -> Data Proxima Acao (string YYYY-MM-DD ou null)
        const mapaProximaAcao = new Map<number, string | null>()

        if (ultimasAcoes) {
            ultimasAcoes.forEach((acao: any) => {
                // Só pegar o primeiro (mais recente) de cada cliente
                if (!mapaProximaAcao.has(acao.customer_id)) {
                    mapaProximaAcao.set(acao.customer_id, acao.proxima_acao)
                }
            })
        }

        const mapaClientes = new Map<number, DevedorResumo>()

        data.forEach((parcela: any) => {
            const cust = parcela.customers
            if (!cust) return;

            // STATUS: Excluir 'Perdido' e 'Externa'
            // Assumindo que null/undefined seja 'Normal'
            const statusCobranca = cust.cobranca_status || 'Normal'
            if (statusCobranca === 'Perdido' || statusCobranca === 'Externa') return;

            // FILTRO DE ABAS
            const proximaData = mapaProximaAcao.get(cust.id)

            // "Já Cobrados" = Tem data agendada FUTURA (> hoje)
            // OBS: Se a data for hoje ou passada, volta para "Cobrar"
            const isFuturo = proximaData && proximaData > hoje

            if (filtro === 'cobrar') {
                // Mostrar apenas quem NÃO tem agendamento futuro
                if (isFuturo) return
            } else {
                // 'ja_cobrados': Mostrar apenas quem TEM agendamento futuro
                if (!isFuturo) return
            }

            // --- Montagem do Objeto de Resumo ---
            const vendaId = parcela.financiamento_loja?.venda_id;
            const vencimento = new Date(parcela.data_vencimento)
            const hojeDate = new Date()
            const diffTime = Math.abs(hojeDate.getTime() - vencimento.getTime())
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

            if (!mapaClientes.has(cust.id)) {
                mapaClientes.set(cust.id, {
                    customer_id: cust.id,
                    full_name: cust.full_name,
                    fone_movel: cust.fone_movel,
                    is_spc: cust.is_spc ?? false,
                    total_atrasado: 0,
                    dias_atraso: 0,
                    quantidade_parcelas_atrasadas: 0,
                    vendas_afetadas: []
                })
            }

            const current = mapaClientes.get(cust.id)!
            current.total_atrasado += parcela.valor_parcela
            current.quantidade_parcelas_atrasadas += 1

            if (diffDays > current.dias_atraso) current.dias_atraso = diffDays

            if (vendaId && !current.vendas_afetadas.includes(vendaId)) {
                current.vendas_afetadas.push(vendaId)
            }
        })

        return Array.from(mapaClientes.values()).sort((a, b) => b.dias_atraso - a.dias_atraso)

    } catch (error: any) {
        console.error('Erro ao buscar inadimplentes:', error)
        return []
    }
}

// --- 2. REGISTRAR CONTATO (HISTÓRICO) ---
const CobrancaSchema = z.object({
    customer_id: z.coerce.number(),
    store_id: z.coerce.number(),
    venda_id: z.coerce.number().optional().nullable(),
    tipo_contato: z.string().min(1),
    resumo: z.string().min(3),
    proxima_acao: z.string().optional().nullable()
})

export async function registrarCobranca(prevState: any, formData: FormData) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, message: 'Usuário não logado' }

    type SimpleProfile = {
        store_id: number
        tenant_id: string | null
    }

    const profile = (await getProfileByAdmin(user.id)) as SimpleProfile | null

    if (!profile) {
        return { success: false, message: 'Perfil não encontrado' }
    }

    const validated = CobrancaSchema.safeParse({
        customer_id: formData.get('customer_id'),
        store_id: profile.store_id,
        venda_id: formData.get('venda_id'),
        tipo_contato: formData.get('tipo_contato'),
        resumo: formData.get('resumo'),
        proxima_acao: formData.get('proxima_acao') || null
    })

    if (!validated.success) return { success: false, message: 'Dados inválidos' }

    const supabaseAdmin = createAdminClient()

    try {
        // Se houver operador selecionado no dropdown, usa esse ID; caso contrário, usa o UUID do usuário logado
        const employeeId = formData.get('registrado_por_id') as string | null

        await (supabaseAdmin.from('cobranca_historico') as any).insert({
            tenant_id: profile.tenant_id,
            store_id: profile.store_id,
            registrado_por_id: employeeId || user.id,
            customer_id: validated.data.customer_id,
            venda_id: validated.data.venda_id,
            tipo_contato: validated.data.tipo_contato,
            resumo_conversa: validated.data.resumo,
            proxima_acao: validated.data.proxima_acao
        })

        revalidatePath(`/dashboard/loja/${profile.store_id}/cobranca`)
        return { success: true, message: 'Contato registrado!' }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// --- 3. TOGGLE SPC ---
export async function toggleSpcStatus(customerId: number, currentStatus: boolean, storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        // CORREÇÃO: Cast as any pois is_spc foi adicionado via SQL manual
        await (supabaseAdmin.from('customers') as any)
            .update({ is_spc: !currentStatus })
            .eq('id', customerId)

        revalidatePath(`/dashboard/loja/${storeId}/cobranca`)
        return { success: true, message: `Cliente ${!currentStatus ? 'adicionado ao' : 'removido do'} SPC.` }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// --- 4. BUSCAR HISTÓRICO ---
export async function getHistoricoCobranca(customerId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        // Busca o histórico básico
        const { data, error } = await (supabaseAdmin.from('cobranca_historico') as any)
            .select('*')
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })

        if (error || !data) return []

        // Busca os IDs de quem registrou (pode ser employee ID numérico ou UUID do auth)
        const idsOperadores = Array.from(new Set(data.filter((d: any) => d.registrado_por_id).map((d: any) => String(d.registrado_por_id)))) as string[]

        if (idsOperadores.length === 0) return data

        // Separa IDs numéricos (employees) de UUIDs (profiles/auth)
        const idsNumericos = idsOperadores.filter(id => /^\d+$/.test(id)).map(Number)
        const idsUUID = idsOperadores.filter(id => !/^\d+$/.test(id))

        const mapaNomes = new Map<string, string>()

        // Busca funcionários pelo ID numérico (dropdown de operador)
        if (idsNumericos.length > 0) {
            const { data: empData } = await (supabaseAdmin.from('employees') as any)
                .select('id, full_name')
                .in('id', idsNumericos)
            if (empData) {
                empData.forEach((e: any) => mapaNomes.set(String(e.id), e.full_name))
            }
        }

        // Busca perfis pelo UUID (registros antigos que usavam user.id)
        if (idsUUID.length > 0) {
            const { data: perfis } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', idsUUID)
            if (perfis) {
                perfis.forEach((p: any) => mapaNomes.set(p.id, p.full_name))
            }
        }

        // Junta os nomes no histórico
        return data.map((item: any) => ({
            ...item,
            profiles: item.registrado_por_id && mapaNomes.has(String(item.registrado_por_id))
                ? { full_name: mapaNomes.get(String(item.registrado_por_id)) }
                : null
        }))
    } catch (e) {
        return []
    }
}

// --- 5. BUSCAR DETALHES COMPLETOS ---
export async function getDetalhesDivida(customerId: number, storeId: number) {
    const supabaseAdmin = createAdminClient()

    try {
        // CORREÇÃO: Cast as any para permitir os joins complexos que podem não estar nos tipos locais
        const { data: financiamentos, error } = await (supabaseAdmin.from('financiamento_loja') as any)
            .select(`
                id,
                created_at,
                valor_total:valor_total_financiado,
                quantidade_parcelas,
                venda_id,
                vendas!financiamento_loja_venda_id_fkey (
                    id,
                    created_at,
                    valor_final,
                    venda_itens ( descricao, quantidade, valor_total_item )
                ),
                financiamento_parcelas (
                    id,
                    numero_parcela,
                    data_vencimento,
                    valor_parcela,
                    status,
                    data_pagamento
                )
            `)
            .eq('customer_id', customerId)
            .eq('store_id', storeId)
            .order('created_at', { ascending: false })

        if (error) throw error

        return financiamentos || []
    } catch (e) {
        console.error("Erro ao buscar detalhes:", e)
        return []
    }
}

// --- 6. BUSCAR RETORNOS AGENDADOS (PARA O RADAR) ---
export async function getRetornosDeHoje(storeId: number): Promise<RetornoCobranca[]> {
    const supabaseAdmin = createAdminClient()
    const hoje = new Date().toISOString().split('T')[0]

    try {
        const { data, error } = await (supabaseAdmin.from('cobranca_historico') as any)
            .select(`
                id,
                customer_id,
                tipo_contato,
                resumo_conversa,
                proxima_acao,
                customers ( full_name, fone_movel )
            `)
            .eq('store_id', storeId)
            .lte('proxima_acao', hoje) // Pega hoje ou atrasados
            .order('proxima_acao', { ascending: true })

        if (error) throw error

        return (data || []).map((item: any) => ({
            id: item.id,
            customer_id: item.customer_id,
            customer_name: item.customers?.full_name || 'Desconhecido',
            fone_movel: item.customers?.fone_movel,
            tipo_contato: item.tipo_contato,
            resumo_conversa: item.resumo_conversa,
            proxima_acao: item.proxima_acao
        }))
    } catch (e) {
        console.error("Erro ao buscar retornos:", e)
        return []
    }
}
// --- 7. ATUALIZAR STATUS DA COBRANÇA ---
export async function updateCobrancaStatus(customerId: number, status: 'Normal' | 'Perdido' | 'Externa', storeId: number) {
    const supabaseAdmin = createAdminClient()
    try {
        await (supabaseAdmin.from('customers') as any)
            .update({ cobranca_status: status })
            .eq('id', customerId)

        revalidatePath(`/dashboard/loja/${storeId}/cobranca`)
        return { success: true, message: `Status atualizado para ${status}.` }
    } catch (e: any) {
        return { success: false, message: e.message }
    }
}
