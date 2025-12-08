// Caminho: src/lib/actions/commission.actions.ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// --- CÁLCULO AUTOMÁTICO ---
export async function calcularERegistrarComissao(vendaId: number) {
    const supabase = createAdminClient()

    try {
        // CORREÇÃO: Cast as any para acessar colunas de comissão que podem não estar nos tipos
        const { data: venda, error } = await (supabase
            .from('vendas') as any)
            .select(`
                *,
                venda_itens ( valor_total_item, product_id, produtos:products(preco_custo) ),
                pagamentos ( valor_pago, forma_pagamento ),
                employees ( 
                    id, 
                    comm_rate_guaranteed, 
                    comm_rate_store_credit, 
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

        const rateGuaranteed = emp.comm_rate_guaranteed || 0
        const rateCredit = emp.comm_rate_store_credit || 0
        const rateProfit = emp.comm_rate_profit || 0

        if (rateGuaranteed === 0 && rateCredit === 0 && rateProfit === 0) {
            return 
        }

        let comissaoTotal = 0

        // A. POR PAGAMENTO
        const totalPagoGarantido = venda.pagamentos?.reduce((acc: number, pg: any) => {
            const forma = (pg.forma_pagamento || '').toLowerCase()
            if (forma.includes('pix') || forma.includes('dinheiro') || forma.includes('cart') || forma.includes('débito')) {
                return acc + (pg.valor_pago || 0)
            }
            return acc
        }, 0) || 0

        const totalRisco = valorVenda - totalPagoGarantido

        if (totalPagoGarantido > 0 && rateGuaranteed > 0) {
            comissaoTotal += totalPagoGarantido * (rateGuaranteed / 100)
        }

        if (totalRisco > 0 && rateCredit > 0) {
            comissaoTotal += totalRisco * (rateCredit / 100)
        }

        // B. SOBRE LUCRO
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

        // GRAVAÇÃO
        if (comissaoTotal > 0) {
            // CORREÇÃO: Cast as any para insert/delete em commissions
            await (supabase.from('commissions') as any).delete().eq('venda_id', vendaId)

            await (supabase.from('commissions') as any).insert({
                tenant_id: venda.tenant_id,
                store_id: venda.store_id,
                employee_id: venda.employee_id,
                venda_id: vendaId,
                amount: parseFloat(comissaoTotal.toFixed(2)),
                status: 'Pendente', 
                created_at: new Date().toISOString()
            })
        }

    } catch (e: any) {
        console.error("Erro silencioso ao calcular comissão:", e)
    }
}

export async function cancelarComissao(vendaId: number) {
    const supabase = createAdminClient()
    try {
        // CORREÇÃO: Cast as any para update em commissions
        await (supabase
            .from('commissions') as any)
            .update({ status: 'Cancelado', reversal_reason: 'Venda Cancelada' })
            .eq('venda_id', vendaId)
    } catch (e) {
        console.error("Erro silencioso ao cancelar comissão:", e)
    }
}

// --- NOVO: RELATÓRIOS E PAGAMENTO ---

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
    
    // Ajusta o fim para cobrir o dia todo
    const dataFim = new Date(fim)
    dataFim.setHours(23, 59, 59, 999)

    try {
        // CORREÇÃO: Cast as any para select com joins e filtros
        const { data: comissoes, error } = await (supabase
            .from('commissions') as any)
            .select(`
                id, amount, status, created_at, venda_id,
                employees ( id, full_name ),
                vendas ( valor_final, created_at )
            `)
            .eq('store_id', storeId)
            .neq('status', 'Cancelado') // Ignora canceladas
            .gte('created_at', inicio)
            .lte('created_at', dataFim.toISOString())
            .order('created_at', { ascending: false })

        if (error) throw error
        
        // Agrupamento manual (Supabase não tem Group By fácil no client)
        const mapa = new Map<number, ResumoComissao>()

        comissoes?.forEach((c: any) => {
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
            
            // Só soma no total de vendas se for um registro único de venda (para não duplicar se tiver ajustes futuros)
            // Aqui simplificamos: assumimos que 1 comissão = 1 venda
            resumo.total_vendas += (c.vendas?.valor_final || 0)

            resumo.detalhes.push({
                id: c.id,
                data: c.created_at,
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
        // 1. Atualiza status
        // CORREÇÃO: Cast as any para update em lote
        const { error } = await (supabase
            .from('commissions') as any)
            .update({ 
                status: 'Pago', 
                updated_at: new Date().toISOString() 
            })
            .in('id', idsComissoes)
            .eq('status', 'Pendente') // Segurança: só paga o que está pendente

        if (error) throw error

        revalidatePath(`/dashboard/loja/${storeId}/financeiro/comissoes`)
        return { success: true, message: 'Pagamento registrado com sucesso!' }

    } catch (e: any) {
        return { success: false, message: e.message }
    }
}