// Caminho: src/lib/actions/commission.actions.ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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

        const emp = venda.employees as any
        const valorVenda = venda.valor_final

        // Extrai todas as taxas
        const rateGuaranteed = emp.comm_rate_guaranteed || 0
        const rateCredit = emp.comm_rate_store_credit || 0
        const rateStoreTotal = emp.comm_rate_store_total || 0
        const rateReceived = emp.comm_rate_received || 0
        const rateProfit = emp.comm_rate_profit || 0

        // Se todas forem zero, não há comissão a calcular
        if (rateGuaranteed === 0 && rateCredit === 0 && rateStoreTotal === 0 && rateReceived === 0 && rateProfit === 0) {
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

        // -------------------------------------------------------
        // B. VENDAS SOBRE A LOJA (% sobre o total da venda)
        // -------------------------------------------------------
        if (rateStoreTotal > 0 && valorVenda > 0) {
            comissaoTotal += valorVenda * (rateStoreTotal / 100)
        }

        // -------------------------------------------------------
        // C. RECEBIMENTO (% sobre valores efetivamente recebidos)
        // -------------------------------------------------------
        if (rateReceived > 0) {
            const totalRecebido = venda.pagamentos?.reduce((acc: number, pg: any) => {
                return acc + (pg.valor_pago || 0)
            }, 0) || 0

            if (totalRecebido > 0) {
                comissaoTotal += totalRecebido * (rateReceived / 100)
            }
        }

        // -------------------------------------------------------
        // D. SOBRE LUCRO (% sobre lucro bruto)
        // -------------------------------------------------------
        if (rateProfit > 0) {
            const custoTotal = venda.venda_itens?.reduce((acc: number, item: any) => {
                const custoUnit = item.produtos?.preco_custo || 0
                return acc + (custoUnit * (item.quantidade || 1))
            }, 0) || 0

            const lucroBruto = valorVenda - custoTotal

            if (lucroBruto > 0) {
                comissaoTotal += lucroBruto * (rateProfit / 100)
            }
        }

        // -------------------------------------------------------
        // GRAVAÇÃO
        // -------------------------------------------------------
        if (comissaoTotal > 0) {
            // Remove comissão anterior (caso de reprocessamento)
            await (supabase.from('commissions') as any).delete().eq('venda_id', vendaId)

            // CORREÇÃO: Usa data_fechamento da venda como referência temporal da comissão
            const dataComissao = venda.data_fechamento || new Date().toISOString()

            await (supabase.from('commissions') as any).insert({
                tenant_id: venda.tenant_id,
                store_id: venda.store_id,
                employee_id: venda.employee_id,
                venda_id: vendaId,
                amount: parseFloat(comissaoTotal.toFixed(2)),
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

export async function getRelatorioComissoes(storeId: number, inicio: string, fim: string) {
    const supabase = createAdminClient()

    // Ajusta datas para cobrir o período completo
    const dataInicio = `${inicio}T00:00:00`
    const dataFim = `${fim}T23:59:59`

    try {
        // CORREÇÃO: Busca comissões e filtra pela data_fechamento da VENDA,
        // não pelo created_at da comissão. Assim o relatório reflete o mês 
        // correto de fechamento.
        const { data: comissoes, error } = await (supabase
            .from('commissions') as any)
            .select(`
                id, amount, status, created_at, venda_id,
                employees ( id, full_name ),
                vendas ( valor_final, created_at, data_fechamento )
            `)
            .eq('store_id', storeId)
            .neq('status', 'Cancelado')
            .order('created_at', { ascending: false })

        if (error) throw error

        // Filtra no lado do client pela data_fechamento da venda
        // (Supabase não suporta filtros em colunas de tabelas relacionadas via .gte/.lte)
        const comissoesFiltradas = (comissoes || []).filter((c: any) => {
            // Usa data_fechamento da venda como referência.
            // Se não existir (vendas antigas), faz fallback para created_at da comissão.
            const dataRef = c.vendas?.data_fechamento || c.created_at
            return dataRef >= dataInicio && dataRef <= dataFim
        })

        // Agrupamento manual por funcionário
        const mapa = new Map<number, ResumoComissao>()

        comissoesFiltradas.forEach((c: any) => {
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

            if (isPago) resumo.comissao_paga += valor
            else resumo.comissao_pendente += valor

            resumo.total_vendas += (c.vendas?.valor_final || 0)

            resumo.detalhes.push({
                id: c.id,
                // Mostra a data de fechamento da venda (não a data da comissão)
                data: c.vendas?.data_fechamento || c.created_at,
                venda_id: c.venda_id,
                valor_venda: c.vendas?.valor_final,
                valor_comissao: valor,
                status: c.status
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
                id, valor_final, store_id, tenant_id, data_fechamento,
                service_orders ( oftalmologista_id ),
                customers ( full_name )
            `)
            .eq('id', vendaId)
            .single()

        if (error || !venda) return

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
            .neq('status', 'Cancelado')
            .order('created_at', { ascending: false })

        if (error) throw error

        // Filtra pelo período usando data_fechamento da venda
        const filtradas = (comissoes || []).filter((c: any) => {
            const dataRef = c.vendas?.data_fechamento || c.created_at
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