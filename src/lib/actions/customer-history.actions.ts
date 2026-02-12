// Caminho: src/lib/actions/customer-history.actions.ts
'use server'

import { createAdminClient } from '@/lib/supabase/admin'

// =============================================
// TIPOS
// =============================================

export interface CustomerSearchResult {
    id: number
    nome: string
    cpf: string | null
    fone: string | null
}

export interface ParcelaDetail {
    numeroParcela: number
    dataVencimento: string
    valor: number
    dataPagamento: string | null
    valorPago: number
    status: string
}

export interface FinancialSummary {
    totais: {
        parcelasPagas: number
        parcelasPendentes: number
        totalParcelas: number
        valorPago: number
        valorRestante: number
        valorTotalFinanciado: number
    }
    proximoVencimento: {
        data: string | null
        valor: number
        numeroParcela: number
    } | null
    financiamentos: {
        id: number
        vendaId: number
        dataVenda: string
        entrada: number
        valorFinanciado: number
        totalParcelas: number
        parcelasPagas: number
        parcelasPendentes: number
        valorParcela: number
        parcelas: ParcelaDetail[]
    }[]
}

export interface PrescriptionSummary {
    id: number
    dataCompra: string
    // Longe
    longeOdEsf: string | null
    longeOdCil: string | null
    longeOdEixo: string | null
    longeOeEsf: string | null
    longeOeCil: string | null
    longeOeEixo: string | null
    // Perto
    pertoOdEsf: string | null
    pertoOdCil: string | null
    pertoOdEixo: string | null
    pertoOeEsf: string | null
    pertoOeCil: string | null
    pertoOeEixo: string | null
    // Adição
    adicao: string | null
    // Médico
    medico: string | null
}

// =============================================
// 1. BUSCA RÁPIDA DE CLIENTES
// =============================================
export async function searchCustomersQuick(
    termo: string,
    storeId: number
): Promise<CustomerSearchResult[]> {
    const supabaseAdmin = createAdminClient()

    if (!termo || termo.length < 2) return []

    // Limpa o termo para busca
    const termoLimpo = termo.trim().toLowerCase()

    // Busca por nome, CPF ou telefone
    const { data, error } = await (supabaseAdmin
        .from('customers') as any)
        .select('id, full_name, cpf, fone_movel')
        .eq('store_id', storeId)
        .or(`full_name.ilike.%${termoLimpo}%,cpf.ilike.%${termoLimpo}%,fone_movel.ilike.%${termoLimpo}%`)
        .order('full_name')
        .limit(10)

    if (error) {
        console.error('Erro ao buscar clientes:', error)
        return []
    }

    return (data || []).map((c: any) => ({
        id: c.id,
        nome: c.full_name,
        cpf: c.cpf,
        fone: c.fone_movel
    }))
}

// =============================================
// 2. RESUMO FINANCEIRO DO CLIENTE
// =============================================
export async function getCustomerFinancialSummary(
    customerId: number,
    storeId: number
): Promise<FinancialSummary> {
    const supabaseAdmin = createAdminClient()

    const { data: financiamentos, error } = await (supabaseAdmin
        .from('financiamento_loja') as any)
        .select(`*, financiamento_parcelas (*)`)
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Erro ao buscar financiamentos:', error)
        return {
            totais: {
                parcelasPagas: 0,
                parcelasPendentes: 0,
                totalParcelas: 0,
                valorPago: 0,
                valorRestante: 0,
                valorTotalFinanciado: 0
            },
            proximoVencimento: null,
            financiamentos: []
        }
    }

    let parcelasPagas = 0
    let parcelasPendentes = 0
    let valorPago = 0
    let valorRestante = 0
    let valorTotalFinanciado = 0
    let proximoVencimento: FinancialSummary['proximoVencimento'] = null

    const financiamentosFormatados = (financiamentos || []).map((f: any) => {
        const parcelas = (f.financiamento_parcelas || [])
            .sort((a: any, b: any) => a.numero_parcela - b.numero_parcela)
        const pagas = parcelas.filter((p: any) => p.status === 'Pago')
        const pendentes = parcelas.filter((p: any) => p.status !== 'Pago')

        parcelasPagas += pagas.length
        parcelasPendentes += pendentes.length
        valorPago += pagas.reduce((sum: number, p: any) => sum + (p.valor_parcela || 0), 0)
        valorRestante += pendentes.reduce((sum: number, p: any) => sum + (p.valor_parcela || 0), 0)
        valorTotalFinanciado += f.valor_total_financiado || 0

        const proximaPendente = pendentes
            .filter((p: any) => p.data_vencimento)
            .sort((a: any, b: any) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime())[0]

        if (proximaPendente && proximaPendente.data_vencimento && (!proximoVencimento || new Date(proximaPendente.data_vencimento) < new Date(proximoVencimento.data!))) {
            proximoVencimento = {
                data: proximaPendente.data_vencimento,
                valor: proximaPendente.valor_parcela,
                numeroParcela: proximaPendente.numero_parcela
            }
        }

        const valorParcelaMedia = parcelas.length > 0
            ? parcelas[0].valor_parcela
            : (f.valor_total_financiado / (f.quantidade_parcelas || 1))

        // Mapeia parcelas individuais para exibição
        const parcelasDetail: ParcelaDetail[] = parcelas.map((p: any) => ({
            numeroParcela: p.numero_parcela,
            dataVencimento: p.data_vencimento,
            valor: p.valor_parcela || 0,
            dataPagamento: p.data_pagamento || null,
            valorPago: p.valor_pago || 0,
            status: p.status || 'Pendente'
        }))

        return {
            id: f.id,
            vendaId: f.venda_id,
            dataVenda: f.created_at,
            entrada: 0,
            valorFinanciado: f.valor_total_financiado || 0,
            totalParcelas: f.quantidade_parcelas || 0,
            parcelasPagas: pagas.length,
            parcelasPendentes: pendentes.length,
            valorParcela: valorParcelaMedia,
            parcelas: parcelasDetail
        }
    })

    return {
        totais: {
            parcelasPagas,
            parcelasPendentes,
            totalParcelas: parcelasPagas + parcelasPendentes,
            valorPago,
            valorRestante,
            valorTotalFinanciado
        },
        proximoVencimento,
        financiamentos: financiamentosFormatados
    }
}

// =============================================
// 3. HISTÓRICO DE RECEITAS (GRAUS)
// =============================================
export async function getCustomerPrescriptionSummary(
    customerId: number,
    storeId: number
): Promise<PrescriptionSummary[]> {
    const supabaseAdmin = createAdminClient()

    const { data, error } = await (supabaseAdmin
        .from('service_orders') as any)
        .select(`
            id,
            created_at,
            receita_longe_od_esferico,
            receita_longe_od_cilindrico,
            receita_longe_od_eixo,
            receita_longe_oe_esferico,
            receita_longe_oe_cilindrico,
            receita_longe_oe_eixo,
            receita_perto_od_esferico,
            receita_perto_od_cilindrico,
            receita_perto_od_eixo,
            receita_perto_oe_esferico,
            receita_perto_oe_cilindrico,
            receita_perto_oe_eixo,
            receita_adicao,
            oftalmologistas (nome_completo)
        `)
        .eq('store_id', storeId)
        .eq('customer_id', customerId)
        // Apenas OSs que tenham algum dado de receita preenchido
        .not('receita_longe_od_esferico', 'is', null)
        .order('created_at', { ascending: false })
        .limit(20)

    if (error) {
        console.error('Erro ao buscar receitas:', error)
        return []
    }

    return (data || []).map((os: any) => ({
        id: os.id,
        dataCompra: os.created_at,
        longeOdEsf: os.receita_longe_od_esferico,
        longeOdCil: os.receita_longe_od_cilindrico,
        longeOdEixo: os.receita_longe_od_eixo,
        longeOeEsf: os.receita_longe_oe_esferico,
        longeOeCil: os.receita_longe_oe_cilindrico,
        longeOeEixo: os.receita_longe_oe_eixo,
        pertoOdEsf: os.receita_perto_od_esferico,
        pertoOdCil: os.receita_perto_od_cilindrico,
        pertoOdEixo: os.receita_perto_od_eixo,
        pertoOeEsf: os.receita_perto_oe_esferico,
        pertoOeCil: os.receita_perto_oe_cilindrico,
        pertoOeEixo: os.receita_perto_oe_eixo,
        adicao: os.receita_adicao,
        medico: os.oftalmologistas?.nome_completo || null
    }))
}
