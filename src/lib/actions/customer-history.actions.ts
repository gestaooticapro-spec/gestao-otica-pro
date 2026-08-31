// Caminho: src/lib/actions/customer-history.actions.ts
'use server'

/* eslint-disable @typescript-eslint/no-explicit-any */

import { createAdminClient } from '@/lib/supabase/admin'
import { getInstallmentOutstanding } from '@/lib/installment-balance'

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
        dependenteNames: string[]
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
    origem?: 'os' | 'legado'
    descricaoServico?: string | null
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

export interface PrescriptionSummaryGroup {
    id: string
    label: string
    dependenteId: number | null
    receitas: PrescriptionSummary[]
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
    const documentoLimpo = termo.replace(/\D/g, '')

    // Busca por nome, CPF ou telefone
    const { data, error } = await (supabaseAdmin
        .from('customers') as any)
        .select('id, full_name, razao_social, nome_fantasia, person_type, cpf, cnpj, fone_movel')
        .eq('store_id', storeId)
        .or(`full_name.ilike.%${termoLimpo}%,razao_social.ilike.%${termoLimpo}%,nome_fantasia.ilike.%${termoLimpo}%,cpf.ilike.%${documentoLimpo || termoLimpo}%,cnpj.ilike.%${documentoLimpo || termoLimpo}%,fone_movel.ilike.%${documentoLimpo || termoLimpo}%`)
        .order('full_name')
        .limit(10)

    if (error) {
        console.error('Erro ao buscar clientes:', error)
        return []
    }

    return (data || []).map((c: any) => ({
        id: c.id,
        nome: c.razao_social || c.full_name,
        cpf: c.person_type === 'PJ' ? c.cnpj : c.cpf,
        fone: c.fone_movel
    }))
}

// =============================================
// 2. RESUMO FINANCEIRO DO CLIENTE
// =============================================
export async function getCustomerFinancialSummary(
    customerId: number,
    storeId: number,
    financingIds?: number[]
): Promise<FinancialSummary> {
    const supabaseAdmin = createAdminClient()

    let financingQuery = (supabaseAdmin
        .from('financiamento_loja') as any)
        .select(`
            *,
            vendas!financiamento_loja_venda_id_fkey ( status ),
            financiamento_parcelas (*)
        `)
        .eq('customer_id', customerId)
        .eq('store_id', storeId)
    const normalizedFinancingIds = (financingIds || [])
        .map(Number)
        .filter((id) => Number.isSafeInteger(id) && id > 0)
    if (normalizedFinancingIds.length > 0) {
        financingQuery = financingQuery.in('id', normalizedFinancingIds)
    }
    const { data: financiamentos, error } = await financingQuery
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

    const financiamentosAtivos = (financiamentos || []).filter((financiamento: any) =>
        String(financiamento.vendas?.status || '').toLowerCase() !== 'cancelada'
    )

    const vendaIds = financiamentosAtivos
        .map((f: any) => Number(f.venda_id))
        .filter((id: number) => Number.isFinite(id) && id > 0)

    const dependentNamesByVenda = new Map<number, string[]>()
    if (vendaIds.length > 0) {
        const { data: serviceOrders } = await (supabaseAdmin
            .from('service_orders') as any)
            .select('venda_id, dependente_id, dependentes(full_name)')
            .eq('store_id', storeId)
            .in('venda_id', vendaIds)

        for (const row of serviceOrders || []) {
            const vendaId = Number(row.venda_id)
            if (!Number.isFinite(vendaId) || vendaId <= 0) continue
            const dependenteName = String(row.dependentes?.full_name || '').trim()
            if (!dependenteName) continue

            const current = dependentNamesByVenda.get(vendaId) || []
            if (!current.includes(dependenteName)) {
                current.push(dependenteName)
                dependentNamesByVenda.set(vendaId, current)
            }
        }
    }

    let parcelasPagas = 0
    let parcelasPendentes = 0
    let valorPago = 0
    let valorRestante = 0
    let valorTotalFinanciado = 0
    let proximoVencimento: FinancialSummary['proximoVencimento'] = null

    const financiamentosFormatados = financiamentosAtivos.map((f: any) => {
        const parcelas = (f.financiamento_parcelas || [])
            .sort((a: any, b: any) => a.numero_parcela - b.numero_parcela)
        const pagas = parcelas.filter((p: any) => String(p.status || '').toLowerCase() === 'pago')
        const pendentes = parcelas.filter((p: any) => String(p.status || '').toLowerCase() !== 'pago')

        parcelasPagas += pagas.length
        parcelasPendentes += pendentes.length
        valorPago += parcelas.reduce((sum: number, p: any) => sum + Number(p.valor_pago || 0), 0)
        valorRestante += pendentes.reduce((sum: number, p: any) => sum + getInstallmentOutstanding(p), 0)
        valorTotalFinanciado += f.valor_total_financiado || 0

        const proximaPendente = pendentes
            .filter((p: any) => p.data_vencimento)
            .sort((a: any, b: any) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime())[0]

        if (proximaPendente && proximaPendente.data_vencimento && (!proximoVencimento || new Date(proximaPendente.data_vencimento) < new Date(proximoVencimento.data!))) {
            proximoVencimento = {
                data: proximaPendente.data_vencimento,
                valor: getInstallmentOutstanding(proximaPendente),
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
            dependenteNames: dependentNamesByVenda.get(Number(f.venda_id)) || [],
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
): Promise<PrescriptionSummaryGroup[]> {
    const supabaseAdmin = createAdminClient()
    const prescriptionPresenceFilter = [
        'receita_longe_od_esferico.not.is.null',
        'receita_longe_od_cilindrico.not.is.null',
        'receita_longe_od_eixo.not.is.null',
        'receita_longe_oe_esferico.not.is.null',
        'receita_longe_oe_cilindrico.not.is.null',
        'receita_longe_oe_eixo.not.is.null',
        'receita_perto_od_esferico.not.is.null',
        'receita_perto_od_cilindrico.not.is.null',
        'receita_perto_od_eixo.not.is.null',
        'receita_perto_oe_esferico.not.is.null',
        'receita_perto_oe_cilindrico.not.is.null',
        'receita_perto_oe_eixo.not.is.null',
        'receita_adicao.not.is.null'
    ].join(',')

    const { data, error } = await (supabaseAdmin
        .from('service_orders') as any)
        .select(`
            id,
            created_at,
            venda_id,
            obs_os,
            dependente_id,
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
            oftalmologistas (nome_completo),
            dependentes (full_name)
        `)
        .eq('store_id', storeId)
        .eq('customer_id', customerId)
        // Considera qualquer campo de receita preenchido, nao apenas o OD esferico.
        .or(prescriptionPresenceFilter)
        .order('created_at', { ascending: false })
        .limit(20)

    if (error) {
        console.error('Erro ao buscar receitas:', error)
        return []
    }

    const vendaIds = Array.from(new Set(
        (data || [])
            .map((os: any) => Number(os.venda_id))
            .filter((id: number) => Number.isFinite(id) && id > 0)
    ))
    const observacaoVendaById = new Map<number, string>()

    if (vendaIds.length > 0) {
        const { data: vendasData, error: vendasError } = await (supabaseAdmin
            .from('vendas') as any)
            .select('id, obs_geral')
            .eq('store_id', storeId)
            .in('id', vendaIds)

        if (vendasError) {
            console.error('Erro ao buscar observacoes das vendas:', vendasError)
        } else {
            for (const venda of vendasData || []) {
                const observacao = String(venda.obs_geral || '').trim()
                if (observacao) observacaoVendaById.set(Number(venda.id), observacao)
            }
        }
    }

    const groupedMap = new Map<string, PrescriptionSummaryGroup>()

    for (const os of data || []) {
        const dependenteId = os.dependente_id ?? null
        const groupId = dependenteId ? `dependente-${dependenteId}` : 'titular'
        const groupLabel = dependenteId ? os.dependentes?.full_name || 'Dependente' : 'Titular'

        if (!groupedMap.has(groupId)) {
            groupedMap.set(groupId, {
                id: groupId,
                label: groupLabel,
                dependenteId,
                receitas: []
            })
        }

        const observacoes = [
            observacaoVendaById.get(Number(os.venda_id)) || '',
            String(os.obs_os || '').trim()
        ].filter(Boolean)

        groupedMap.get(groupId)?.receitas.push({
            id: os.id,
            dataCompra: os.created_at,
            descricaoServico: observacoes.length > 0 ? observacoes.join(' | ') : null,
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
        })
    }

    const titular: PrescriptionSummaryGroup = groupedMap.get('titular') || {
        id: 'titular',
        label: 'Titular',
        dependenteId: null,
        receitas: []
    }

    const dependentes = Array.from(groupedMap.values())
        .filter((group) => group.id !== 'titular')
        .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'))

    const { data: legacyData, error: legacyError } = await (supabaseAdmin
        .from('customer_prescription_history') as any)
        .select(`
            id, created_at, prescription_date, service_description,
            receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo,
            receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo,
            receita_perto_od_esferico, receita_perto_od_cilindrico, receita_perto_od_eixo,
            receita_perto_oe_esferico, receita_perto_oe_cilindrico, receita_perto_oe_eixo,
            receita_adicao_od, receita_adicao_oe
        `)
        .eq('store_id', storeId)
        .eq('customer_id', customerId)
        .order('prescription_date', { ascending: false })
        .limit(20)

    if (!legacyError) {
        for (const item of legacyData || []) {
            titular.receitas.push({
                id: item.id,
                dataCompra: item.prescription_date || item.created_at,
                origem: 'legado',
                descricaoServico: item.service_description || null,
                longeOdEsf: item.receita_longe_od_esferico,
                longeOdCil: item.receita_longe_od_cilindrico,
                longeOdEixo: item.receita_longe_od_eixo,
                longeOeEsf: item.receita_longe_oe_esferico,
                longeOeCil: item.receita_longe_oe_cilindrico,
                longeOeEixo: item.receita_longe_oe_eixo,
                pertoOdEsf: item.receita_perto_od_esferico,
                pertoOdCil: item.receita_perto_od_cilindrico,
                pertoOdEixo: item.receita_perto_od_eixo,
                pertoOeEsf: item.receita_perto_oe_esferico,
                pertoOeCil: item.receita_perto_oe_cilindrico,
                pertoOeEixo: item.receita_perto_oe_eixo,
                adicao: item.receita_adicao_od || item.receita_adicao_oe || null,
                medico: null,
            })
        }
        titular.receitas.sort((a, b) => new Date(b.dataCompra).getTime() - new Date(a.dataCompra).getTime())
    }

    return [titular, ...dependentes]
}
