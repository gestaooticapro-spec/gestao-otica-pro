// Caminho: src/lib/actions/consultas.actions.ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type AlertaEntrega = {
    id: number
    created_at: string
    dt_prometido_para: string
    customer_name: string
    venda_id: number
}

export type AlertaLaboratorio = {
    id: number
    created_at: string
    tempo_decorrido_horas: number
    customer_name: string
    venda_id: number
}

// ATUALIZADO: Inclui a contagem de vendas
export type DashboardAlerts = {
    entregas: AlertaEntrega[]
    laboratorio: AlertaLaboratorio[]
    vendasEmAberto: number 
}

export async function getAlertasOperacionais(storeId: number): Promise<DashboardAlerts> {
    const supabaseAdmin = createAdminClient()
    const hoje = new Date()
    const amanha = new Date(hoje)
    amanha.setDate(hoje.getDate() + 1)
    const ontem = new Date(hoje.getTime() - (24 * 60 * 60 * 1000)).toISOString()

    try {
        // 1. Buscas Paralelas para otimizar tempo
        const [resEntrega, resLab, resVendas] = await Promise.all([
            // Entregas (Cast as any para evitar erro de relacionamento aninhado)
            (supabaseAdmin
                .from('service_orders') as any)
                .select('id, created_at, dt_prometido_para, venda_id, customers(full_name)')
                .eq('store_id', storeId)
                .is('dt_entregue_em', null)
                .lte('dt_prometido_para', amanha.toISOString())
                .order('dt_prometido_para', { ascending: true }),
            
            // Laboratório (Parado > 24h sem pedido)
            (supabaseAdmin
                .from('service_orders') as any)
                .select('id, created_at, venda_id, customers(full_name)')
                .eq('store_id', storeId)
                .is('dt_pedido_em', null)
                .lt('created_at', ontem)
                .order('created_at', { ascending: true }),

            // Contagem de Vendas em Aberto
            (supabaseAdmin
                .from('vendas') as any)
                .select('*', { count: 'exact', head: true }) // head: true traz só a contagem
                .eq('store_id', storeId)
                .eq('status', 'Em Aberto')
        ])

        // Processamento Entregas
        const entregas: AlertaEntrega[] = (resEntrega.data || []).map((item: any) => ({
            id: item.id,
            created_at: item.created_at,
            dt_prometido_para: item.dt_prometido_para,
            customer_name: item.customers?.full_name || 'Cliente Desconhecido',
            venda_id: item.venda_id
        }))

        // Processamento Laboratório
        const laboratorio: AlertaLaboratorio[] = (resLab.data || []).map((item: any) => {
            const criado = new Date(item.created_at).getTime()
            const horas = Math.floor((hoje.getTime() - criado) / (1000 * 60 * 60))
            return {
                id: item.id,
                created_at: item.created_at,
                tempo_decorrido_horas: horas,
                customer_name: item.customers?.full_name || 'Cliente Desconhecido',
                venda_id: item.venda_id
            }
        })

        return { 
            entregas, 
            laboratorio,
            vendasEmAberto: resVendas.count || 0 
        }

    } catch (error) {
        console.error("Erro ao buscar alertas:", error)
        return { entregas: [], laboratorio: [], vendasEmAberto: 0 }
    }
}

export type ResultadoBusca = {
    clientes: { id: number; nome: string; cpf: string | null; fone: string | null }[]
    vendas: { id: number; data: string; valor: number; status: string; cliente: string }[]
    os: { id: number; venda_id: number | null; protocolo: string | null; data: string; cliente: string; status: string }[]
    produtos: { id: number; tipo: string; nome: string; preco: number; estoque: number; codigo: string | null }[]
}

export async function realizarBuscaUniversal(termo: string, storeId: number): Promise<ResultadoBusca> {
    const supabaseAdmin = createAdminClient()
    const cleanTerm = termo.trim()
    
    const resultados: ResultadoBusca = { clientes: [], vendas: [], os: [], produtos: [] }
    
    if (!cleanTerm) return resultados

    try {
        const isNumeric = /^\d+$/.test(cleanTerm)
        
        // --- PASSO ZERO: DETECTA DEPENDENTES ---
        let dependenteIds: number[] = []
        let responsavelIds: number[] = []
        let mapaDependenteNome = new Map<number, string>()

        if (!isNumeric) {
            // CORREÇÃO: Cast as any
            const { data: deps } = await (supabaseAdmin.from('dependentes') as any)
                .select('id, customer_id, full_name')
                .eq('store_id', storeId)
                .ilike('full_name', `%${cleanTerm}%`)
                .limit(5)
            
            if (deps && deps.length > 0) {
                deps.forEach((d: any) => {
                    dependenteIds.push(d.id)
                    responsavelIds.push(d.customer_id)
                    mapaDependenteNome.set(d.customer_id, d.full_name)
                })
            }
        }

        // --- 1. BUSCAR CLIENTES ---
        const promisesClientes = []
        
        // CORREÇÃO: Cast as any na query base de clientes
        let queryA = (supabaseAdmin
            .from('customers') as any)
            .select('id, full_name, cpf, fone_movel')
            .eq('store_id', storeId)
            .limit(5)

        if (isNumeric) {
            queryA = queryA.or(`cpf.ilike.%${cleanTerm}%,fone_movel.ilike.%${cleanTerm}%`)
        } else {
            queryA = queryA.ilike('full_name', `%${cleanTerm}%`)
        }
        promisesClientes.push(queryA)

        if (responsavelIds.length > 0) {
            promisesClientes.push(
                (supabaseAdmin.from('customers') as any)
                    .select('id, full_name, cpf, fone_movel')
                    .in('id', responsavelIds)
            )
        }

        const resultadosClientes = await Promise.all(promisesClientes as any)
        const todosClientes = resultadosClientes.flatMap((r: any) => r.data || [])
        
        const mapClientesUnicos = new Map()
        todosClientes.forEach((c: any) => {
            if (!mapClientesUnicos.has(c.id)) {
                const nomeDependente = mapaDependenteNome.get(c.id)
                const extraInfo = nomeDependente ? `(Resp. por ${nomeDependente})` : undefined
                mapClientesUnicos.set(c.id, { 
                    id: c.id, 
                    nome: c.full_name + (extraInfo ? ` ${extraInfo}` : ''), 
                    cpf: c.cpf, 
                    fone: c.fone_movel 
                })
            }
        })
        resultados.clientes = Array.from(mapClientesUnicos.values())

        // --- 2. BUSCAR VENDAS ---
        const promisesVendas = []
        
        // CORREÇÃO: Cast as any na query de vendas
        let queryVendasA = (supabaseAdmin
            .from('vendas') as any)
            .select('id, created_at, valor_final, status, customers!inner(full_name)')
            .eq('store_id', storeId)
            .limit(5)
            .order('created_at', { ascending: false })

        if (isNumeric) {
            queryVendasA = queryVendasA.eq('id', cleanTerm)
        } else {
            queryVendasA = queryVendasA.ilike('customers.full_name', `%${cleanTerm}%`)
        }
        promisesVendas.push(queryVendasA)

        if (responsavelIds.length > 0) {
            promisesVendas.push(
                (supabaseAdmin.from('vendas') as any)
                    .select('id, created_at, valor_final, status, customers(full_name)')
                    .eq('store_id', storeId)
                    .in('customer_id', responsavelIds)
                    .limit(5)
                    .order('created_at', { ascending: false })
            )
        }

        const resultadosVendas = await Promise.all(promisesVendas as any)
        const todasVendas = resultadosVendas.flatMap((r: any) => r.data || [])
        const mapVendasUnicas = new Map()
        todasVendas.forEach((v: any) => {
            if (!mapVendasUnicas.has(v.id)) {
                mapVendasUnicas.set(v.id, { 
                    id: v.id, 
                    data: v.created_at, 
                    valor: v.valor_final, 
                    status: v.status, 
                    cliente: v.customers?.full_name || 'N/A' 
                })
            }
        })
        resultados.vendas = Array.from(mapVendasUnicas.values())

        // --- 3. BUSCAR OS ---
        const promisesOS = []
        if (isNumeric) {
            promisesOS.push(
                (supabaseAdmin.from('service_orders') as any)
                    .select('id, created_at, protocolo_fisico, venda_id, customers(full_name)')
                    .eq('store_id', storeId)
                    .or(`id.eq.${cleanTerm},protocolo_fisico.eq.${cleanTerm}`)
                    .limit(5)
            )
        } else {
            promisesOS.push(
                (supabaseAdmin.from('service_orders') as any)
                    .select('id, created_at, protocolo_fisico, venda_id, customers(full_name)')
                    .eq('store_id', storeId)
                    .ilike('protocolo_fisico', `%${cleanTerm}%`)
                    .limit(5)
            )
            promisesOS.push(
                (supabaseAdmin.from('service_orders') as any)
                    .select('id, created_at, protocolo_fisico, venda_id, customers!inner(full_name)')
                    .eq('store_id', storeId)
                    .ilike('customers.full_name', `%${cleanTerm}%`)
                    .limit(5)
            )
            if (dependenteIds.length > 0) {
                promisesOS.push(
                    (supabaseAdmin.from('service_orders') as any)
                        .select('id, created_at, protocolo_fisico, venda_id, customers(full_name)')
                        .eq('store_id', storeId)
                        .in('dependente_id', dependenteIds)
                        .limit(5)
                )
            }
        }

        const resultadosOS = await Promise.all(promisesOS as any)
        const todasOS = resultadosOS.flatMap((r: any) => r.data || [])
        const mapOSUnicas = new Map()
        todasOS.forEach((o: any) => {
            if (!mapOSUnicas.has(o.id)) {
                mapOSUnicas.set(o.id, { 
                    id: o.id, 
                    venda_id: o.venda_id, 
                    protocolo: o.protocolo_fisico, 
                    data: o.created_at, 
                    cliente: o.customers?.full_name || 'N/A', 
                    status: 'Aberta' 
                })
            }
        })
        resultados.os = Array
            .from(mapOSUnicas.values())
            .sort((a: any, b: any) => new Date(b.data).getTime() - new Date(a.data).getTime())
            .slice(0, 5)

        // --- 4. BUSCAR PRODUTOS ---
        // CORREÇÃO: Cast as any na query de produtos
        let queryProd = (supabaseAdmin
            .from('products') as any)
            .select('id, nome, preco_venda, estoque_atual, codigo_barras, tipo_produto')
            .eq('store_id', storeId)
            .limit(10)

        if (isNumeric) {
            queryProd = queryProd.or(`codigo_barras.eq.${cleanTerm},referencia.eq.${cleanTerm}`)
        } else {
            queryProd = queryProd.ilike('nome', `%${cleanTerm}%`)
        }

        const { data: produtosEncontrados } = await queryProd

        if (produtosEncontrados) {
            resultados.produtos = (produtosEncontrados as any[]).map((p: any) => ({
                id: p.id,
                tipo: p.tipo_produto === 'Armacao' ? 'Armação' : 
                      p.tipo_produto === 'Lente' ? 'Lente' : 
                      p.tipo_produto === 'Tratamento' ? 'Tratamento' : 'Geral',
                nome: p.nome,
                preco: p.preco_venda,
                estoque: p.estoque_atual,
                codigo: p.codigo_barras
            }))
        }

        return resultados

    } catch (error) {
        console.error("Erro na busca universal:", error)
        return resultados
    }
}

export type Aniversariante = {
    id: number
    nome: string
    fone: string | null
    dia: string
}

export async function getAniversariantes(storeId: number): Promise<Aniversariante[]> {
    const supabase = createAdminClient()
    
    const hoje = new Date()
    const targetMonth = hoje.getMonth() + 1
    const targetDay = hoje.getDate()

    try {
        // CORREÇÃO: Cast as any para evitar erro caso birth_date seja considerado opcional/null
        const { data, error } = await (supabase
            .from('customers') as any)
            .select('id, full_name, fone_movel, birth_date')
            .eq('store_id', storeId)
            .not('birth_date', 'is', null)
            .limit(5000)

        if (error || !data) return []

        const aniversariantesHoje = data.filter((c: any) => {
            if (!c.birth_date) return false
            const [ano, mes, dia] = c.birth_date.split('-').map(Number)
            return mes === targetMonth && dia === targetDay
        })

        const diaStr = String(targetDay).padStart(2, '0')
        const mesStr = String(targetMonth).padStart(2, '0')

        return aniversariantesHoje.map((c: any) => ({
            id: c.id,
            nome: c.full_name,
            fone: c.fone_movel,
            dia: `${diaStr}/${mesStr}`
        }))

    } catch {
        return []
    }
}