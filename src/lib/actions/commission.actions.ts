// Caminho: src/lib/actions/commission.actions.ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type CommissionGenerationMode = 'closed_only' | 'open_or_closed'
type CommissionStage = 'provisional' | 'final'
type ExistingGlobalCommission = {
    id: number
    amount: number | null
    status: string
}

const STORE_UTC_OFFSET = '-03:00'

function getStoreDayRangeFromKey(dateKey: string) {
    return {
        startIso: new Date(`${dateKey}T00:00:00${STORE_UTC_OFFSET}`).toISOString(),
        endIso: new Date(`${dateKey}T23:59:59.999${STORE_UTC_OFFSET}`).toISOString()
    }
}

async function getCommissionGenerationMode(storeId: number): Promise<CommissionGenerationMode> {
    const supabase = createAdminClient()

    const { data } = await (supabase.from('stores') as any)
        .select('settings')
        .eq('id', storeId)
        .maybeSingle()

    const settings = (data?.settings || {}) as { commission_generation_mode?: unknown }
    return settings.commission_generation_mode === 'open_or_closed' ? 'open_or_closed' : 'closed_only'
}

// ================================================================
// CÁLCULO AUTOMÁTICO DE COMISSÃO (COMPLETO)
// ================================================================
// Tipos de comissão configuráveis por funcionário:
//   comm_rate_guaranteed    → % sobre pagamentos garantidos (Dinheiro, Pix, Cartão, Débito)
//   comm_rate_store_credit  → % sobre pagamentos de risco (Carnê, Crédito Loja)
//   comm_rate_store_total   → % sobre o VALOR TOTAL da venda (independente da forma de pagamento)
//   comm_rate_received      → % sobre os valores efetivamente RECEBIDOS (total dos pagamentos)
//   comm_rate_profit        → % sobre o LUCRO BRUTO da venda (valor_final - custo dos produtos)
// ================================================================

export async function calcularERegistrarComissao(vendaId: number) {
    const supabase = createAdminClient()

    try {
        const { data: venda, error } = await (supabase
            .from('vendas') as any)
            .select(`
                *,
                venda_itens ( valor_total_item, quantidade, product_id, produtos:products(preco_custo) ),
                pagamentos ( valor_pago, forma_pagamento ),
                employees ( 
                    id, 
                    comm_rate_guaranteed, 
                    comm_rate_store_credit,
                    comm_rate_store_total,
                    comm_rate_received,
                    comm_rate_profit 
                )
            `)
            .eq('id', vendaId)
            .single()

        if (error || !venda || !venda.employee_id || !venda.employees) {
            return
        }

        // Só gera comissão para vendas efetivamente fechadas
        const commissionMode = await getCommissionGenerationMode(venda.store_id)
        const isOpenCommissionAllowed = commissionMode === 'open_or_closed'
        const isCommissionableStatus = venda.status === 'Fechada' || (isOpenCommissionAllowed && venda.status === 'Em Aberto')

        if (!isCommissionableStatus) {
            await cancelarComissao(vendaId)
            return
        }

        const emp = venda.employees as any
        const valorVenda = venda.valor_final || 0
        const commissionStage: CommissionStage = venda.status === 'Fechada' ? 'final' : 'provisional'

        // Extrai todas as taxas
        const rateGuaranteed = emp.comm_rate_guaranteed || 0
        const rateCredit = emp.comm_rate_store_credit || 0
        const rateStoreTotal = emp.comm_rate_store_total || 0
        const rateReceived = emp.comm_rate_received || 0
        const rateProfit = emp.comm_rate_profit || 0

        // Se todas as INDIVIDUAIS forem zero, não há o que calcular
        if (rateGuaranteed === 0 && rateCredit === 0) {
            await (supabase.from('commissions') as any)
                .delete()
                .eq('venda_id', vendaId)
                .eq('type', 'individual')
                .eq('status', 'Pendente')
            return
        }

        let comissaoTotal = 0

        // -------------------------------------------------------
        // A. VENDAS PRÓPRIAS - GARANTIDA + RISCO
        // -------------------------------------------------------
        // Garantida = Dinheiro, Pix, Cartão, Débito (formas de baixo risco)
        // Risco = Carnê, Crédito Loja (o vendedor recebe mesmo se o cliente não pagar)
        const totalPagoGarantido = venda.pagamentos?.reduce((acc: number, pg: any) => {
            const forma = (pg.forma_pagamento || '').toLowerCase()
            if (forma.includes('pix') || forma.includes('dinheiro') || forma.includes('cart') || forma.includes('débito') || forma.includes('debito')) {
                return acc + (pg.valor_pago || 0)
            }
            return acc
        }, 0) || 0

        const totalRisco = Math.max(0, valorVenda - totalPagoGarantido)

        if (totalPagoGarantido > 0 && rateGuaranteed > 0) {
            comissaoTotal += totalPagoGarantido * (rateGuaranteed / 100)
        }

        if (totalRisco > 0 && rateCredit > 0) {
            comissaoTotal += totalRisco * (rateCredit / 100)
        }

        // As taxas globais (rateStoreTotal, rateReceived, rateProfit) foram movidas 
        // para calcularComissoesGlobais (por período).

        // -------------------------------------------------------
        // GRAVAÇÃO
        // -------------------------------------------------------
        const { data: paidCommission } = await (supabase.from('commissions') as any)
            .select('id')
            .eq('venda_id', vendaId)
            .eq('type', 'individual')
            .eq('status', 'Pago')
            .limit(1)

        if (paidCommission && paidCommission.length > 0) {
            if (commissionStage === 'final') {
                await (supabase.from('commissions') as any)
                    .update({
                        commission_stage: 'final',
                        updated_at: new Date().toISOString()
                    })
                    .eq('venda_id', vendaId)
                    .eq('type', 'individual')
                    .eq('status', 'Pago')
            }
            return
        }

        if (comissaoTotal <= 0) {
            await (supabase.from('commissions') as any).delete()
                .eq('venda_id', vendaId)
                .eq('type', 'individual')
                .eq('status', 'Pendente')
            return
        }

        if (comissaoTotal > 0) {
            // Remove comissão individual anterior (caso de reprocessamento)
            await (supabase.from('commissions') as any).delete()
                .eq('venda_id', vendaId)
                .eq('type', 'individual') // Garante que só deleta as individuais
                .eq('status', 'Pendente')

            // Usa a data original da venda como referência temporal da comissão individual.
            const dataComissao = commissionStage === 'provisional'
                ? (venda.created_at || new Date().toISOString())
                : (venda.created_at || venda.data_fechamento || new Date().toISOString())

            await (supabase.from('commissions') as any).insert({
                tenant_id: venda.tenant_id,
                store_id: venda.store_id,
                employee_id: venda.employee_id,
                venda_id: vendaId,
                type: 'individual',
                amount: parseFloat(comissaoTotal.toFixed(2)),
                commission_stage: commissionStage,
                status: 'Pendente',
                created_at: dataComissao
            })
        }

    } catch (e: any) {
        console.error("Erro silencioso ao calcular comissão:", e)
    }
}

export async function cancelarComissao(vendaId: number) {
    const supabase = createAdminClient()
    try {
        await (supabase
            .from('commissions') as any)
            .update({ status: 'Cancelado', reversal_reason: 'Venda Cancelada' })
            .eq('venda_id', vendaId)
            .neq('status', 'Pago')
    } catch (e) {
        console.error("Erro silencioso ao cancelar comissão:", e)
    }
}

// ================================================================
// RELATÓRIOS E PAGAMENTO
// ================================================================

export type ResumoComissao = {
    employee_id: number
    employee_name: string
    total_vendas: number
    comissao_pendente: number
    comissao_paga: number
    detalhes: any[]
}

type GlobalOriginBaseItem = {
    venda_id: number | null
    venda_label: string
    data_venda: string | null
    valor_venda: number
    valor_recebido: number
    valor_lucro: number
    os_labels: string[]
    protocolo_labels: string[]
}

function formatDateOnly(date: Date) {
    return date.toISOString().split('T')[0]
}

function isCurrentMonthlyPeriod(inicio: string, fim: string) {
    const now = new Date()
    const currentStart = formatDateOnly(new Date(now.getFullYear(), now.getMonth(), 1))
    const currentEnd = formatDateOnly(new Date(now.getFullYear(), now.getMonth() + 1, 0))

    return inicio === currentStart && fim === currentEnd
}

// ================================================================
// COMISSÕES GLOBAIS (DA LOJA INTEIRA POR PERÍODO)
// ================================================================
export async function calcularComissoesGlobais(storeId: number, inicio: string, fim: string) {
    const supabase = createAdminClient()
    const { startIso: dataInicio } = getStoreDayRangeFromKey(inicio)
    const { endIso: dataFim } = getStoreDayRangeFromKey(fim)
    const periodRef = `${inicio}_${fim}`

    try {
        // 1. Busca funcionários da loja com pelo menos uma taxa global > 0
        const { data: employees } = await (supabase.from('employees') as any)
            .select('*')
            .eq('store_id', storeId)
            .eq('is_active', true)
        
        if (!employees) return

        const globalEmployees = employees.filter((e: any) => 
            (e.comm_rate_store_total || 0) > 0 || 
            (e.comm_rate_received || 0) > 0 || 
            (e.comm_rate_profit || 0) > 0
        )

        if (globalEmployees.length === 0) return

        // 2. Busca totais da loja no período
        const commissionMode = await getCommissionGenerationMode(storeId)
        let vendasQuery = (supabase.from('vendas') as any)
            .select(`
                id, valor_final, created_at, data_fechamento, status,
                venda_itens ( quantidade, product_id, produtos:products(preco_custo) )
            `)
            .eq('store_id', storeId)

        if (commissionMode === 'open_or_closed') {
            // Mantem a venda no mes de criacao durante todo o ciclo. Assim uma
            // venda aberta em um mes e fechada no seguinte nao entra duas vezes.
            vendasQuery = vendasQuery
                .in('status', ['Em Aberto', 'Fechada'])
                .gte('created_at', dataInicio)
                .lte('created_at', dataFim)
        } else {
            vendasQuery = vendasQuery
                .eq('status', 'Fechada')
                .gte('data_fechamento', dataInicio)
                .lte('data_fechamento', dataFim)
        }

        const { data: vendas, error: vendasError } = await vendasQuery
        if (vendasError) throw vendasError

        const { data: pagamentos } = await (supabase.from('pagamentos') as any)
            .select('valor_pago, created_at')
            .eq('store_id', storeId)
            .gte('created_at', dataInicio)
            .lte('created_at', dataFim)

        const totalVendido = (vendas || []).reduce((acc: number, v: any) => acc + (v.valor_final || 0), 0)
        const totalRecebido = (pagamentos || []).reduce((acc: number, p: any) => acc + (p.valor_pago || 0), 0)
        
        let totalCusto = 0
        ;(vendas || []).forEach((v: any) => {
            (v.venda_itens || []).forEach((item: any) => {
                const custoUnit = item.produtos?.preco_custo || 0
                totalCusto += custoUnit * (item.quantidade || 1)
            })
        })
        const totalLucro = Math.max(0, totalVendido - totalCusto)

        // 3. Preserva parcelas pagas e mantem apenas o saldo atual como pendente.
        for (const emp of globalEmployees) {
            const { data: existingCommissions, error: existingError } = await (supabase.from('commissions') as any)
                .select('id, amount, status')
                .eq('store_id', storeId)
                .eq('employee_id', emp.id)
                .eq('type', 'global_store')
                .eq('period_ref', periodRef)
            
            if (existingError) throw existingError

            const currentCommissions = (existingCommissions || []) as ExistingGlobalCommission[]
            const cTotal = totalVendido * ((emp.comm_rate_store_total || 0) / 100)
            const cRec = totalRecebido * ((emp.comm_rate_received || 0) / 100)
            const cProf = totalLucro * ((emp.comm_rate_profit || 0) / 100)

            const totalGlobal = cTotal + cRec + cProf
            const totalPago = currentCommissions
                .filter(commission => commission.status === 'Pago')
                .reduce((acc, commission) => acc + Number(commission.amount || 0), 0)
            const saldoPendente = parseFloat(Math.max(0, totalGlobal - totalPago).toFixed(2))
            const existingPending = currentCommissions
                .find(commission => commission.status === 'Pendente')

            if (saldoPendente <= 0) {
                if (existingPending) {
                    const { error: deleteError } = await (supabase.from('commissions') as any)
                        .delete()
                        .eq('id', existingPending.id)

                    if (deleteError) throw deleteError
                }
                continue
            }

            if (existingPending) {
                const { error: updateError } = await (supabase.from('commissions') as any).update({
                    tenant_id: emp.tenant_id,
                    store_id: storeId,
                    employee_id: emp.id,
                    venda_id: null,
                    type: 'global_store',
                    period_ref: periodRef,
                    commission_stage: 'final',
                    amount: saldoPendente,
                    status: 'Pendente',
                    created_at: dataFim // Força pra data final, assim entra no filtro da tela sem problemas
                })
                    .eq('id', existingPending.id)

                if (updateError) throw updateError
            } else {
                const { error: insertError } = await (supabase.from('commissions') as any).insert({
                    tenant_id: emp.tenant_id,
                    store_id: storeId,
                    employee_id: emp.id,
                    venda_id: null,
                    type: 'global_store',
                    period_ref: periodRef,
                    commission_stage: 'final',
                    amount: saldoPendente,
                    status: 'Pendente',
                    created_at: dataFim
                })

                if (insertError) throw insertError
            }
        }
    } catch (e) {
        console.error("Erro ao recalcular comissoes globais:", e)
    }
}

export async function getRelatorioComissoes(storeId: number, inicio: string, fim: string) {
    const supabase = createAdminClient()

    // Ajusta datas para cobrir o período completo
    const { startIso: dataInicio } = getStoreDayRangeFromKey(inicio)
    const { endIso: dataFim } = getStoreDayRangeFromKey(fim)
    const dataInicioTime = new Date(dataInicio).getTime()
    const dataFimTime = new Date(dataFim).getTime()

    // Só autogera o mês corrente; períodos históricos ficam somente leitura
    // para não recalcular com as taxas atuais ao abrir um relatório antigo.
    if (isCurrentMonthlyPeriod(inicio, fim)) {
        await calcularComissoesGlobais(storeId, inicio, fim)
    }

    const commissionMode = await getCommissionGenerationMode(storeId)

    try {
        let globalVendasQuery = (supabase.from('vendas') as any)
            .select(`
                id, valor_final, created_at, data_fechamento, status,
                venda_itens ( quantidade, product_id, produtos:products(preco_custo) ),
                service_orders ( id, protocolo_fisico )
            `)
            .eq('store_id', storeId)

        if (commissionMode === 'open_or_closed') {
            globalVendasQuery = globalVendasQuery
                .in('status', ['Em Aberto', 'Fechada'])
                .gte('created_at', dataInicio)
                .lte('created_at', dataFim)
        } else {
            globalVendasQuery = globalVendasQuery
                .eq('status', 'Fechada')
                .gte('data_fechamento', dataInicio)
                .lte('data_fechamento', dataFim)
        }

        const { data: globalVendas, error: globalVendasError } = await globalVendasQuery
        if (globalVendasError) throw globalVendasError

        const { data: pagamentosDoPeriodo, error: pagamentosPeriodoError } = await (supabase.from('pagamentos') as any)
            .select('venda_id, valor_pago')
            .eq('store_id', storeId)
            .gte('created_at', dataInicio)
            .lte('created_at', dataFim)

        if (pagamentosPeriodoError) throw pagamentosPeriodoError

        const totalRecebidoPorVenda = new Map<number, number>()
        ;(pagamentosDoPeriodo || []).forEach((pagamento: any) => {
            if (typeof pagamento?.venda_id !== 'number') return
            const atual = totalRecebidoPorVenda.get(pagamento.venda_id) || 0
            totalRecebidoPorVenda.set(pagamento.venda_id, atual + Number(pagamento.valor_pago || 0))
        })

        const globalOriginBaseItems: GlobalOriginBaseItem[] = (globalVendas || []).map((v: any) => {
            const serviceOrders = Array.isArray(v?.service_orders) ? v.service_orders : []
            const osLabels = Array.from(
                new Set(
                    serviceOrders
                        .map((os: any) => (typeof os?.id === 'number' ? `#${os.id}` : null))
                        .filter(Boolean)
                )
            ) as string[]
            const protocolLabels = Array.from(
                new Set(
                    serviceOrders
                        .map((os: any) => ((os?.protocolo_fisico || '').trim() || null))
                        .filter(Boolean)
                )
            ) as string[]
            let custoVenda = 0
            ;(Array.isArray(v?.venda_itens) ? v.venda_itens : []).forEach((item: any) => {
                const custoUnit = Number(item?.produtos?.preco_custo || 0)
                const quantidade = Number(item?.quantidade || 1)
                custoVenda += custoUnit * quantidade
            })
            const valorVenda = Number(v?.valor_final || 0)
            const lucroVenda = Math.max(0, valorVenda - custoVenda)
            const valorRecebido = totalRecebidoPorVenda.get(Number(v?.id || 0)) || 0

            return {
                venda_id: typeof v?.id === 'number' ? v.id : null,
                venda_label: typeof v?.id === 'number' ? `#${v.id}` : '-',
                data_venda: commissionMode === 'open_or_closed'
                    ? (v?.created_at || null)
                    : (v?.data_fechamento || v?.created_at || null),
                valor_venda: valorVenda,
                valor_recebido: valorRecebido,
                valor_lucro: lucroVenda,
                os_labels: osLabels,
                protocolo_labels: protocolLabels,
            }
        })

        // Busca comissões e filtra pela data operacional da venda nos itens individuais.
        // Globais continuam usando a referência consolidada do período.
        const { data: comissoes, error } = await (supabase
            .from('commissions') as any)
            .select(`
                id, amount, status, created_at, venda_id, type, period_ref, commission_stage,
                employees (
                    id,
                    full_name,
                    comm_rate_store_total,
                    comm_rate_received,
                    comm_rate_profit
                ),
                vendas (
                    valor_final,
                    created_at,
                    data_fechamento,
                    service_orders ( id, protocolo_fisico )
                )
            `)
            .eq('store_id', storeId)
            .not('employee_id', 'is', null)
            .not('status', 'in', '("Cancelado","Estornado")')
            .order('created_at', { ascending: false })

        if (error) throw error

        // Filtra no lado do client pela data original da venda
        // (Supabase não suporta filtros em colunas de tabelas relacionadas via .gte/.lte)
        const comissoesFiltradas = (comissoes || []).filter((c: any) => {
            // Usa created_at da venda como referência.
            // Se não existir (vendas antigas/globais), faz fallback para created_at da comissão.
            // Compara por timestamp para respeitar o intervalo local da loja.
            const isGlobalStore = (c.type || 'individual') === 'global_store'
            const dataRef = (
                isGlobalStore
                    ? c.created_at
                    : (c.vendas?.created_at || c.created_at)
            ) || ''
            const dataRefTime = new Date(dataRef).getTime()
            return Number.isFinite(dataRefTime) && dataRefTime >= dataInicioTime && dataRefTime <= dataFimTime
        })

        // Agrupamento manual por funcionário
        const mapa = new Map<number, ResumoComissao>()

        comissoesFiltradas.forEach((c: any) => {
            if (!c.employees?.id) return

            const empId = c.employees.id
            const empName = c.employees.full_name
            const valor = c.amount
            const isPago = c.status === 'Pago'

            if (!mapa.has(empId)) {
                mapa.set(empId, {
                    employee_id: empId,
                    employee_name: empName,
                    total_vendas: 0,
                    comissao_pendente: 0,
                    comissao_paga: 0,
                    detalhes: []
                })
            }

            const resumo = mapa.get(empId)!
            const isGlobalStore = (c.type || 'individual') === 'global_store'
            const serviceOrders = Array.isArray(c.vendas?.service_orders) ? c.vendas.service_orders : []
            const osIds = serviceOrders
                .map((os: any) => os?.id)
                .filter((value: unknown): value is number => typeof value === 'number')
            const protocolos = serviceOrders
                .map((os: any) => (os?.protocolo_fisico || '').trim())
                .filter((value: string) => value.length > 0)
            const osLabel = osIds.length > 0
                ? Array.from(new Set<number>(osIds)).map((id) => `#${id}`).join(', ')
                : null
            const protocoloLabel = protocolos.length > 0
                ? Array.from(new Set(protocolos)).join(', ')
                : null
            const globalOriginItems = isGlobalStore
                ? globalOriginBaseItems.map((item: GlobalOriginBaseItem) => {
                    const rateStoreTotal = Number(c.employees?.comm_rate_store_total || 0)
                    const rateReceived = Number(c.employees?.comm_rate_received || 0)
                    const rateProfit = Number(c.employees?.comm_rate_profit || 0)
                    const valorComissao =
                        (item.valor_venda * (rateStoreTotal / 100)) +
                        (item.valor_recebido * (rateReceived / 100)) +
                        (item.valor_lucro * (rateProfit / 100))

                    return {
                        ...item,
                        valor_comissao: Number(valorComissao.toFixed(2)),
                    }
                }).filter((item: GlobalOriginBaseItem & { valor_comissao: number }) => item.valor_comissao > 0)
                : []

            if (isPago) resumo.comissao_paga += valor
            else resumo.comissao_pendente += valor

            resumo.total_vendas += (c.vendas?.valor_final || 0)

            resumo.detalhes.push({
                id: c.id,
                // Mostra a data original da venda ou do período (para global)
                data: isGlobalStore ? c.created_at : (c.vendas?.created_at || c.created_at),
                venda_id: c.venda_id,
                valor_venda: c.vendas?.valor_final || 0,
                valor_comissao: valor,
                status: c.status,
                type: c.type || 'individual',
                commission_stage: c.commission_stage || 'final',
                os_id_label: isGlobalStore ? null : osLabel,
                protocolo_fisico: isGlobalStore ? null : protocoloLabel,
                global_origin_items: globalOriginItems
            })
        })

        return { success: true, data: Array.from(mapa.values()) }

    } catch (e: any) {
        console.error("Erro ao buscar relatório:", e)
        return { success: false, message: e.message }
    }
}

export async function pagarComissoesEmLote(
    storeId: number,
    employeeId: number,
    idsComissoes: number[]
) {
    const supabase = createAdminClient()

    try {
        const { error } = await (supabase
            .from('commissions') as any)
            .update({
                status: 'Pago',
                updated_at: new Date().toISOString()
            })
            .in('id', idsComissoes)
            .eq('status', 'Pendente')

        if (error) throw error

        revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)
        return { success: true, message: 'Pagamento registrado com sucesso!' }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}

// ================================================================
// COMISSÃO DE MÉDICOS PARCEIROS
// ================================================================

export async function calcularComissaoMedico(vendaId: number) {
    const supabase = createAdminClient()

    try {
        // Busca a venda com suas OS vinculadas
        const { data: venda, error } = await (supabase
            .from('vendas') as any)
            .select(`
                id, valor_final, store_id, tenant_id, data_fechamento, status,
                service_orders ( oftalmologista_id ),
                customers ( full_name )
            `)
            .eq('id', vendaId)
            .single()

        if (error || !venda) return

        if (venda.status !== 'Fechada') return

        // Pega o primeiro oftalmologista_id das OS da venda
        const oss = venda.service_orders || []
        const oftalmoId = oss.find((os: any) => os.oftalmologista_id)?.oftalmologista_id
        if (!oftalmoId) return

        // Busca a taxa de comissão do médico
        const { data: medico } = await (supabase
            .from('oftalmologistas') as any)
            .select('id, comissao')
            .eq('id', oftalmoId)
            .single()

        if (!medico || !medico.comissao || medico.comissao <= 0) return

        const valorComissao = parseFloat((venda.valor_final * (medico.comissao / 100)).toFixed(2))
        if (valorComissao <= 0) return

        // Remove comissão anterior do médico para esta venda (reprocessamento)
        await (supabase.from('commissions') as any)
            .delete()
            .eq('venda_id', vendaId)
            .eq('oftalmologista_id', oftalmoId)

        const dataComissao = venda.data_fechamento || new Date().toISOString()

        await (supabase.from('commissions') as any).insert({
            tenant_id: venda.tenant_id,
            store_id: venda.store_id,
            oftalmologista_id: oftalmoId,
            venda_id: vendaId,
            amount: valorComissao,
            status: 'Pendente',
            created_at: dataComissao
        })

    } catch (e: any) {
        console.error("[calcularComissaoMedico] Erro silencioso:", e)
    }
}

export type ResumoComissaoMedico = {
    oftalmologista_id: number
    nome_medico: string
    total_vendas: number
    comissao_pendente: number
    comissao_paga: number
    detalhes: {
        id: number
        data: string
        venda_id: number
        cliente_nome: string
        valor_venda: number
        valor_comissao: number
        status: string
    }[]
}

export async function getRelatorioComissoesMedicos(storeId: number, inicio: string, fim: string) {
    const supabase = createAdminClient()

    const dataInicio = `${inicio}T00:00:00`
    const dataFim = `${fim}T23:59:59`

    try {
        const { data: comissoes, error } = await (supabase
            .from('commissions') as any)
            .select(`
                id, amount, status, created_at, venda_id, oftalmologista_id,
                oftalmologistas ( id, nome_completo ),
                vendas ( valor_final, data_fechamento, customer_id, customers ( full_name ) )
            `)
            .eq('store_id', storeId)
            .not('oftalmologista_id', 'is', null)
            .not('status', 'in', '("Cancelado","Estornado")')
            .order('created_at', { ascending: false })

        if (error) throw error

        // Filtra pelo período usando data_fechamento da venda
        const filtradas = (comissoes || []).filter((c: any) => {
            const dataRef = (c.vendas?.data_fechamento || c.created_at || '').substring(0, 19)
            return dataRef >= dataInicio && dataRef <= dataFim
        })

        const mapa = new Map<number, ResumoComissaoMedico>()

        filtradas.forEach((c: any) => {
            const medId = c.oftalmologista_id
            const medNome = c.oftalmologistas?.nome_completo || 'Médico Desconhecido'
            const valor = c.amount
            const isPago = c.status === 'Pago'
            const clienteNome = c.vendas?.customers?.full_name || 'Cliente N/A'

            if (!mapa.has(medId)) {
                mapa.set(medId, {
                    oftalmologista_id: medId,
                    nome_medico: medNome,
                    total_vendas: 0,
                    comissao_pendente: 0,
                    comissao_paga: 0,
                    detalhes: []
                })
            }

            const resumo = mapa.get(medId)!
            if (isPago) resumo.comissao_paga += valor
            else resumo.comissao_pendente += valor

            resumo.total_vendas += (c.vendas?.valor_final || 0)

            resumo.detalhes.push({
                id: c.id,
                data: c.vendas?.data_fechamento || c.created_at,
                venda_id: c.venda_id,
                cliente_nome: clienteNome,
                valor_venda: c.vendas?.valor_final || 0,
                valor_comissao: valor,
                status: c.status
            })
        })

        return { success: true, data: Array.from(mapa.values()) }

    } catch (e: any) {
        console.error("[getRelatorioComissoesMedicos] Erro:", e)
        return { success: false, message: e.message }
    }
}

export async function pagarComissoesMedicoEmLote(
    storeId: number,
    oftalmoId: number,
    idsComissoes: number[]
) {
    const supabase = createAdminClient()

    try {
        const { error } = await (supabase
            .from('commissions') as any)
            .update({
                status: 'Pago',
                updated_at: new Date().toISOString()
            })
            .in('id', idsComissoes)
            .eq('status', 'Pendente')

        if (error) throw error

        revalidatePath(`/dashboard/loja/${storeId}/cadastros`)
        return { success: true, message: 'Pagamento registrado com sucesso!' }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}
