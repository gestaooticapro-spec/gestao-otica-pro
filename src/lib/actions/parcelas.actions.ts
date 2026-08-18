'use server'

import { createAdminClient, getProfileByAdmin } from '../supabase/admin'
import { createClient } from '../supabase/server'
import { isStoreModuleEnabledForStore } from '../store-modules.server'
import { verifyEmployeeAuthorization } from '../server/employee-authorization'
import { getReceiptReversalMetadata } from '../installment-reversal.server'
import { revalidatePath } from 'next/cache'
import { getInstallmentOutstanding } from '../installment-balance'

export type ParcelaFiltro = {
    status?: 'todas' | 'pendente' | 'pago' | 'atrasado';
    dataInicial?: string;
    dataFinal?: string;
    dataPagamentoInicial?: string;
    dataPagamentoFinal?: string;
    busca?: string; // Nome do cliente ou ID da venda
    ordenarPor?: 'cliente' | 'vencimento' | 'pagamento' | 'valor' | 'venda';
    direcao?: 'asc' | 'desc';
}

function filtrarDataPagamento(parcelas: any[], filtros: ParcelaFiltro) {
    return parcelas.filter((parcela) => {
        const dataPagamento = (parcela.data_pagamento_relatorio || parcela.data_pagamento)
            ? String(parcela.data_pagamento_relatorio || parcela.data_pagamento).split('T')[0]
            : ''
        if (filtros.dataPagamentoInicial && (!dataPagamento || dataPagamento < filtros.dataPagamentoInicial)) return false
        if (filtros.dataPagamentoFinal && (!dataPagamento || dataPagamento > filtros.dataPagamentoFinal)) return false
        return true
    })
}

function ordenarParcelas(parcelas: any[], filtros: ParcelaFiltro) {
    const campo = filtros.ordenarPor || 'vencimento'
    const direcao = filtros.direcao === 'desc' ? -1 : 1
    const texto = (valor: unknown) => String(valor || '').toLocaleLowerCase('pt-BR')
    const data = (valor: unknown) => String(valor || '').split('T')[0]

    return [...parcelas].sort((a, b) => {
        let comparacao = 0
        if (campo === 'cliente') comparacao = texto(a.customers?.full_name).localeCompare(texto(b.customers?.full_name), 'pt-BR')
        if (campo === 'vencimento') comparacao = data(a.data_vencimento).localeCompare(data(b.data_vencimento))
        if (campo === 'pagamento') comparacao = data(a.data_pagamento_relatorio || a.data_pagamento).localeCompare(data(b.data_pagamento_relatorio || b.data_pagamento))
        if (campo === 'valor') comparacao = Number(a.valor_parcela || 0) - Number(b.valor_parcela || 0)
        if (campo === 'venda') comparacao = Number(a.financiamento_loja?.venda_id || 0) - Number(b.financiamento_loja?.venda_id || 0)
        if (comparacao === 0) comparacao = Number(a.id || 0) - Number(b.id || 0)
        return comparacao * direcao
    })
}

async function adicionarTotaisPagamentos(supabaseAdmin: any, parcelas: any[]) {
    const ids = parcelas.map((parcela) => Number(parcela.id)).filter(Number.isFinite)
    if (ids.length === 0) return parcelas

    const { data: pagamentos } = await supabaseAdmin
        .from('pagamentos')
        .select('parcela_id, valor_pago, data_pagamento, receipt_operation_id')
        .in('parcela_id', ids)

    const porParcela = new Map<number, { total: number, ultimaData: string | null, pagamentos: any[] }>()
    for (const pagamento of pagamentos || []) {
        const parcelaId = Number(pagamento.parcela_id)
        const atual = porParcela.get(parcelaId) || { total: 0, ultimaData: null, pagamentos: [] }
        atual.total += Number(pagamento.valor_pago || 0)
        const dataPagamento = pagamento.data_pagamento ? String(pagamento.data_pagamento) : null
        if (dataPagamento && (!atual.ultimaData || dataPagamento > atual.ultimaData)) atual.ultimaData = dataPagamento
        atual.pagamentos.push(pagamento)
        porParcela.set(parcelaId, atual)
    }

    const financiamentoIds = Array.from(new Set(
        parcelas.map((parcela) => Number(parcela.financiamento_id)).filter(Number.isFinite)
    ))
    const reversalMetadata = await getReceiptReversalMetadata(supabaseAdmin, financiamentoIds)
    const { data: receiptOperations } = await (supabaseAdmin.from('installment_receipt_operations') as any)
        .select('id, origin_installment_id, received_amount, received_on, state, reversed_at, installments_before')
        .in('financiamento_id', financiamentoIds)
        .eq('state', 'completed')
        .is('reversed_at', null)
        .order('received_on', { ascending: true })
        .order('id', { ascending: true })
    const operationsByOrigin = new Map<number, any[]>()
    for (const operation of receiptOperations || []) {
        const originId = Number(operation.origin_installment_id)
        operationsByOrigin.set(originId, [...(operationsByOrigin.get(originId) || []), operation])
    }

    return parcelas.map((parcela) => {
        const resumo = porParcela.get(Number(parcela.id))
        const operations = operationsByOrigin.get(Number(parcela.id)) || []
        const firstOperation = operations[0]
        const firstSnapshot = Array.isArray(firstOperation?.installments_before)
            ? firstOperation.installments_before.find((item: any) => Number(item.id) === Number(parcela.id))
            : null
        const pagamentosAntes = firstOperation
            ? (resumo?.pagamentos || []).filter((pagamento) => String(pagamento.data_pagamento || '').slice(0, 10) < String(firstOperation.received_on)).reduce((total, pagamento) => total + Number(pagamento.valor_pago || 0), 0)
            : 0
        const valorAReceber = firstSnapshot
            ? getInstallmentOutstanding(firstSnapshot)
            : firstOperation
                ? Math.max(0, Number(parcela.valor_parcela || 0) + Number(parcela.valor_transferido_entrada || 0) - pagamentosAntes - Number(parcela.valor_transferido_saida || 0))
                : getInstallmentOutstanding({ ...parcela, valor_pago: resumo?.total ?? parcela.valor_pago })
        return {
            ...parcela,
            valor_pago_relatorio: resumo?.total || 0,
            data_pagamento_relatorio: resumo?.ultimaData || null,
            valor_a_receber_relatorio: valorAReceber,
            valor_recebido_relatorio: operations.length
                ? operations.reduce((total, operation) => total + Number(operation.received_amount || 0), 0)
                : null,
            reversible_receipt_operation: reversalMetadata.get(Number(parcela.id)) || null,
        }
    })
}

export type ReverseInstallmentReceiptInput = {
    operationId?: number
    legacyInstallmentId?: number
    storeId: number
    reason: string
    authorizationToken: string
}

export async function reverseInstallmentReceipt(input: ReverseInstallmentReceiptInput) {
    const operationId = Number(input.operationId)
    const legacyInstallmentId = Number(input.legacyInstallmentId)
    const storeId = Number(input.storeId)
    const reason = String(input.reason || '').trim()
    const hasTrackedOperation = Number.isSafeInteger(operationId) && operationId > 0
    const hasLegacyInstallment = Number.isSafeInteger(legacyInstallmentId) && legacyInstallmentId > 0

    if (hasTrackedOperation === hasLegacyInstallment || !Number.isSafeInteger(storeId) || storeId <= 0) {
        return { success: false, message: 'Dados da reversao invalidos.' }
    }
    if (reason.length < 5) {
        return { success: false, message: 'Informe um motivo com pelo menos 5 caracteres.' }
    }

    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return { success: false, message: 'Usuario nao autenticado.' }

    const profile = await getProfileByAdmin(user.id) as any
    if (!profile?.tenant_id) return { success: false, message: 'Perfil sem empresa vinculada.' }
    if (profile.role !== 'admin' && Number(profile.store_id) !== storeId) {
        return { success: false, message: 'Usuario sem acesso a esta loja.' }
    }

    const authorizationContext = hasTrackedOperation ? String(operationId) : `legacy:${legacyInstallmentId}`
    const authorization = verifyEmployeeAuthorization(input.authorizationToken, {
        userId: user.id,
        tenantId: profile.tenant_id,
        storeId,
        purpose: 'installment_receipt_reversal',
        context: authorizationContext,
    })
    if (!authorization) {
        return { success: false, message: 'Autorizacao expirada ou invalida. Informe novamente o PIN do gerente.' }
    }

    const supabaseAdmin = createAdminClient()
    if (hasLegacyInstallment) {
        const { data: installment, error: installmentError } = await (supabaseAdmin
            .from('financiamento_parcelas') as any)
            .select('id, store_id, financiamento_loja ( venda_id )')
            .eq('id', legacyInstallmentId)
            .eq('store_id', storeId)
            .maybeSingle()

        if (installmentError || !installment) return { success: false, message: 'Parcela legada nao encontrada nesta loja.' }

        const { error } = await (supabaseAdmin as any).rpc('reverse_legacy_exact_installment_receipt', {
            p_installment_id: legacyInstallmentId,
            p_authorizing_employee_id: authorization.employeeId,
            p_user_id: user.id,
            p_reason: reason,
        })
        if (error) return { success: false, message: error.message || 'A parcela nao atende mais aos criterios de reversao.' }

        const vendaId = Number(installment.financiamento_loja?.venda_id)
        if (Number.isFinite(vendaId)) {
            revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
            revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}/experimental`)
        }
        revalidatePath(`/dashboard/loja/${storeId}/financeiro/parcelas`)
        revalidatePath(`/dashboard/loja/${storeId}/reports/parcelamento`)
        revalidatePath(`/dashboard/loja/${storeId}`)

        return { success: true, message: 'Quitacao legada revertida com sucesso.' }
    }

    const { data: operation, error: operationError } = await (supabaseAdmin
        .from('installment_receipt_operations') as any)
        .select('id, tenant_id, store_id, venda_id, state, reversed_at')
        .eq('id', operationId)
        .eq('store_id', storeId)
        .eq('tenant_id', profile.tenant_id)
        .maybeSingle()

    if (operationError || !operation) return { success: false, message: 'Recebimento nao encontrado nesta loja.' }
    if (operation.state !== 'completed' || operation.reversed_at) {
        return { success: false, message: 'Este recebimento nao esta mais disponivel para reversao.' }
    }

    const { error } = await (supabaseAdmin as any).rpc('reverse_installment_receipt_operation', {
        p_operation_id: operationId,
        p_authorizing_employee_id: authorization.employeeId,
        p_user_id: user.id,
        p_reason: reason,
    })

    if (error) return { success: false, message: error.message || 'Nao foi possivel reverter o recebimento.' }

    revalidatePath(`/dashboard/loja/${storeId}/vendas/${operation.venda_id}`)
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${operation.venda_id}/experimental`)
    revalidatePath(`/dashboard/loja/${storeId}/financeiro/parcelas`)
    revalidatePath(`/dashboard/loja/${storeId}/reports/parcelamento`)
    revalidatePath(`/dashboard/loja/${storeId}`)

    return { success: true, message: 'Quitacao revertida com sucesso.' }
}

export type ContratoQuitadoFiltro = {
    dataInicial?: string
    dataFinal?: string
}

export type ContratoQuitado = {
    financiamento_id: number
    venda_id: number | null
    customer_id: number
    cliente_nome: string
    quantidade_parcelas: number
    valor_total: number
    data_quitacao: string
}

async function anexarStatusPix(supabaseAdmin: any, storeId: number, parcelas: any[]) {
    const installmentIds = Array.from(new Set(
        parcelas.map((parcela) => Number(parcela.id)).filter((id) => Number.isSafeInteger(id) && id > 0)
    ))
    if (installmentIds.length === 0) return parcelas

    try {
        const { data: charges, error } = await (supabaseAdmin.from('pix_installment_charges') as any)
            .select('id, installment_id, status, settlement_status, settled_at, created_at')
            .eq('store_id', storeId)
            .in('installment_id', installmentIds)
            .order('created_at', { ascending: false })

        if (error) {
            console.warn('[Parcelas] Nao foi possivel consultar status Pix:', error.message)
            return parcelas
        }

        const latestByInstallment = new Map<number, any>()
        for (const charge of charges || []) {
            const installmentId = Number(charge.installment_id)
            if (!latestByInstallment.has(installmentId)) latestByInstallment.set(installmentId, charge)
        }

        return parcelas.map((parcela) => ({
            ...parcela,
            pix_charge: latestByInstallment.get(Number(parcela.id)) || null,
        }))
    } catch (error) {
        console.warn('[Parcelas] Status Pix indisponivel:', error)
        return parcelas
    }
}

export async function getContratosQuitados(storeId: number, filtros: ContratoQuitadoFiltro = {}) {
    const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')
    if (!enabled) return { success: false, message: 'Módulo de parcelamento desativado', data: [] as ContratoQuitado[] }

    try {
        const supabaseAdmin = createAdminClient()
        const { data, error } = await (supabaseAdmin.from('financiamento_parcelas') as any)
            .select(`
                financiamento_id,
                numero_parcela,
                status,
                data_pagamento,
                customer_id,
                customers ( full_name ),
                financiamento_loja ( id, venda_id, customer_id, valor_total_financiado, quantidade_parcelas )
            `)
            .eq('store_id', storeId)

        if (error) {
            console.error('Erro getContratosQuitados:', error)
            return { success: false, message: 'Erro ao buscar contratos quitados', data: [] as ContratoQuitado[] }
        }

        const grupos = new Map<number, any[]>()
        for (const parcela of data || []) {
            if (!parcela.financiamento_id) continue
            const grupo = grupos.get(parcela.financiamento_id) || []
            grupo.push(parcela)
            grupos.set(parcela.financiamento_id, grupo)
        }

        const resultado: ContratoQuitado[] = []
        for (const [financiamentoId, parcelas] of grupos) {
            const pagas = parcelas.filter((p) => p.status?.toLowerCase() === 'pago' || p.data_pagamento)
            if (pagas.length !== parcelas.length || pagas.length === 0) continue

            const dataQuitacao = pagas
                .map((p) => p.data_pagamento)
                .filter(Boolean)
                .sort()
                .at(-1)
            if (!dataQuitacao) continue

            const dataDia = dataQuitacao.split('T')[0]
            if (filtros.dataInicial && dataDia < filtros.dataInicial) continue
            if (filtros.dataFinal && dataDia > filtros.dataFinal) continue

            const financiamento = parcelas[0].financiamento_loja
            const cliente = parcelas[0].customers
            resultado.push({
                financiamento_id: financiamentoId,
                venda_id: financiamento?.venda_id ?? null,
                customer_id: parcelas[0].customer_id,
                cliente_nome: cliente?.full_name || 'Cliente desconhecido',
                quantidade_parcelas: financiamento?.quantidade_parcelas ?? parcelas.length,
                valor_total: Number(financiamento?.valor_total_financiado ?? pagas.reduce((sum, p) => sum + Number(p.valor_parcela || 0), 0)),
                data_quitacao: dataQuitacao,
            })
        }

        resultado.sort((a, b) => b.data_quitacao.localeCompare(a.data_quitacao))
        return { success: true, data: resultado }
    } catch (error) {
        console.error('getContratosQuitados exception:', error)
        return { success: false, message: 'Erro interno ao buscar contratos quitados', data: [] as ContratoQuitado[] }
    }
}

export async function getParcelasFiltradas(storeId: number, filtros: ParcelaFiltro) {
    const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')
    if (!enabled) {
        return { success: false, message: 'Módulo de parcelamento desativado', data: [] }
    }

    try {
        const supabaseAdmin = createAdminClient()
        let query = (supabaseAdmin
            .from('financiamento_parcelas') as any)
            .select(`
                id,
                numero_parcela,
                data_vencimento,
                valor_parcela,
                valor_pago,
                valor_transferido_entrada,
                valor_transferido_saida,
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id, vendas!financiamento_loja_venda_id_fkey ( is_historical_import, status ) ),
                customers (full_name, cpf)
            `)
            .eq('store_id', storeId)
            .order('data_vencimento', { ascending: true })
            .order('numero_parcela', { ascending: true })

        // Filtro de Datas no Banco
        if (filtros.dataInicial) {
            query = query.gte('data_vencimento', filtros.dataInicial)
        }
        if (filtros.dataFinal) {
            query = query.lte('data_vencimento', filtros.dataFinal)
        }

        const { data: parcelas, error } = await query

        if (error) {
            console.error('Erro getParcelasFiltradas:', error)
            return { success: false, message: 'Erro ao buscar parcelas', data: [] }
        }

        const parcelasDeVendasAtivas = (parcelas || []).filter((parcela: any) =>
            String(parcela.financiamento_loja?.vendas?.status || '').toLowerCase() !== 'cancelada'
        )
        let resultado = await adicionarTotaisPagamentos(supabaseAdmin, parcelasDeVendasAtivas as any[])
        resultado = await anexarStatusPix(supabaseAdmin, storeId, resultado)

        // Filtro de Status
        if (filtros.status && filtros.status !== 'todas') {
            // Comparar apenas a parte da data, sem timezones
            const hoje = new Date()
            const year = hoje.getFullYear()
            const month = String(hoje.getMonth() + 1).padStart(2, '0')
            const day = String(hoje.getDate()).padStart(2, '0')
            const hojeLocalStr = `${year}-${month}-${day}` // YYYY-MM-DD local

            resultado = resultado.filter((p: any) => {
                const isPago = p.status === 'pago' || Boolean(p.data_pagamento_relatorio || p.data_pagamento)
                // Assumindo data_vencimento vem como YYYY-MM-DD...
                let vencimentoStr = ''
                if (p.data_vencimento) {
                    vencimentoStr = p.data_vencimento.split('T')[0]
                }
                
                if (filtros.status === 'pago') return isPago
                if (filtros.status === 'pendente') return !isPago && vencimentoStr >= hojeLocalStr
                if (filtros.status === 'atrasado') return !isPago && vencimentoStr < hojeLocalStr
                return true
            })
        }

        resultado = filtrarDataPagamento(resultado, filtros)

        // Filtro de Busca (Cliente ou ID da Venda)
        if (filtros.busca) {
            const termoBusca = filtros.busca.toLowerCase().trim()
            resultado = resultado.filter((p: any) => {
                const isIdMatch = p.financiamento_loja?.venda_id?.toString() === termoBusca
                const isNameMatch = p.customers?.full_name?.toLowerCase().includes(termoBusca)
                return isIdMatch || isNameMatch
            })
        }

        // ---------------------------------------------------------
        // Fase 2: Buscar TODAS as parcelas das vendas encontradas
        // APENAS se houver uma busca por nome/venda (Filtro por Contexto)
        // Se for apenas filtro de data/status, mostrar EXATAMENTE o que caiu no filtro.
        // ---------------------------------------------------------
        if (resultado.length === 0) {
            return { success: true, data: [] }
        }

        if (!filtros.busca || filtros.busca.trim() === '') {
            // Não há busca de texto, apenas retornar os resultados exatos do filtro de Data/Status
            return { success: true, data: ordenarParcelas(resultado, filtros) }
        }

        const financiamentoIds = Array.from(new Set(resultado.map((p: any) => p.financiamento_id).filter(Boolean)))

        if (financiamentoIds.length === 0) {
            return { success: true, data: [] }
        }

        const { data: todasParcelas, error: errorTodas } = await supabaseAdmin
            .from('financiamento_parcelas')
            .select(`
                id,
                numero_parcela,
                data_vencimento,
                valor_parcela,
                valor_pago,
                valor_transferido_entrada,
                valor_transferido_saida,
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id, vendas!financiamento_loja_venda_id_fkey ( is_historical_import, status ) ),
                customers (full_name, cpf)
            `)
            .in('financiamento_id', financiamentoIds)
            .order('data_vencimento', { ascending: true })
            .order('numero_parcela', { ascending: true })

        if (errorTodas) {
            console.error('Erro ao buscar todas as parcelas:', errorTodas)
            return { success: false, message: 'Erro ao buscar contexto completo das parcelas', data: [] }
        }

        const todasParcelasAtivas = (todasParcelas || []).filter((parcela: any) =>
            String(parcela.financiamento_loja?.vendas?.status || '').toLowerCase() !== 'cancelada'
        )
        let finalData: any[] = await adicionarTotaisPagamentos(supabaseAdmin, todasParcelasAtivas as any[])
        finalData = await anexarStatusPix(supabaseAdmin, storeId, finalData)

        // Como expandimos o contexto, aplicamos o filtro de Status novamente
        // para não misturar pagas/pendentes se o usuário exigiu um status específico
        if (filtros.status && filtros.status !== 'todas') {
            const hoje = new Date()
            const year = hoje.getFullYear()
            const month = String(hoje.getMonth() + 1).padStart(2, '0')
            const day = String(hoje.getDate()).padStart(2, '0')
            const hojeLocalStr = `${year}-${month}-${day}`

            finalData = finalData.filter((p: any) => {
                const isPago = p.status === 'pago' || Boolean(p.data_pagamento_relatorio || p.data_pagamento)
                let vencimentoStr = ''
                if (p.data_vencimento) {
                    vencimentoStr = p.data_vencimento.split('T')[0]
                }
                
                if (filtros.status === 'pago') return isPago
                if (filtros.status === 'pendente') return !isPago && vencimentoStr >= hojeLocalStr
                if (filtros.status === 'atrasado') return !isPago && vencimentoStr < hojeLocalStr
                return true
            })
        }

        finalData = filtrarDataPagamento(finalData, filtros)

        return { success: true, data: ordenarParcelas(finalData, filtros) }


    } catch (err) {
        console.error('getParcelasFiltradas exception:', err)
        return { success: false, message: 'Erro interno', data: [] }
    }
}

export async function getCustomerParcelasFiltradas(storeId: number, customerId: number, filtros: ParcelaFiltro) {
    const enabled = await isStoreModuleEnabledForStore(storeId, 'installments')
    if (!enabled) {
        return { success: false, message: 'Módulo de parcelamento desativado', data: [] }
    }

    try {
        const supabaseAdmin = createAdminClient()
        let query = (supabaseAdmin
            .from('financiamento_parcelas') as any)
            .select(`
                id,
                numero_parcela,
                data_vencimento,
                valor_parcela,
                valor_pago,
                valor_transferido_entrada,
                valor_transferido_saida,
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id, vendas!financiamento_loja_venda_id_fkey ( is_historical_import ) ),
                customers (full_name, cpf)
            `)
            .eq('store_id', storeId)
            .eq('customer_id', customerId)
            .order('data_vencimento', { ascending: true })
            .order('numero_parcela', { ascending: true })

        // Filtro de Datas no Banco
        if (filtros.dataInicial) {
            query = query.gte('data_vencimento', filtros.dataInicial)
        }
        if (filtros.dataFinal) {
            query = query.lte('data_vencimento', filtros.dataFinal)
        }

        const { data: parcelas, error } = await query

        if (error) {
            console.error('Erro getCustomerParcelasFiltradas:', error)
            return { success: false, message: 'Erro ao buscar parcelas do cliente', data: [] }
        }

        let resultado = parcelas || []

        // Filtro de Status
        if (filtros.status && filtros.status !== 'todas') {
            const hoje = new Date()
            const year = hoje.getFullYear()
            const month = String(hoje.getMonth() + 1).padStart(2, '0')
            const day = String(hoje.getDate()).padStart(2, '0')
            const hojeLocalStr = `${year}-${month}-${day}` // YYYY-MM-DD local

            resultado = resultado.filter((p: any) => {
                const isPago = p.status === 'pago' || p.data_pagamento !== null
                let vencimentoStr = ''
                if (p.data_vencimento) {
                    vencimentoStr = p.data_vencimento.split('T')[0]
                }
                
                if (filtros.status === 'pago') return isPago
                if (filtros.status === 'pendente') return !isPago && vencimentoStr >= hojeLocalStr
                if (filtros.status === 'atrasado') return !isPago && vencimentoStr < hojeLocalStr
                return true
            })
        }

        // Filtro de Busca (Venda ID)
        if (filtros.busca) {
            const termoBusca = filtros.busca.toLowerCase().trim()
            resultado = resultado.filter((p: any) => {
                const isIdMatch = p.financiamento_loja?.venda_id?.toString() === termoBusca
                const isNameMatch = p.customers?.full_name?.toLowerCase().includes(termoBusca)
                return isIdMatch || isNameMatch
            })
        }

        if (resultado.length === 0) {
            return { success: true, data: [] }
        }

        if (!filtros.busca || filtros.busca.trim() === '') {
            return { success: true, data: resultado }
        }

        const financiamentoIds = Array.from(new Set(resultado.map((p: any) => p.financiamento_id).filter(Boolean)))

        if (financiamentoIds.length === 0) {
            return { success: true, data: [] }
        }

        const { data: todasParcelas, error: errorTodas } = await supabaseAdmin
            .from('financiamento_parcelas')
            .select(`
                id,
                numero_parcela,
                data_vencimento,
                valor_parcela,
                valor_pago,
                valor_transferido_entrada,
                valor_transferido_saida,
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id, vendas!financiamento_loja_venda_id_fkey ( is_historical_import ) ),
                customers (full_name, cpf)
            `)
            .in('financiamento_id', financiamentoIds)
            .order('data_vencimento', { ascending: true })
            .order('numero_parcela', { ascending: true })

        if (errorTodas) {
            console.error('Erro ao buscar todas as parcelas do cliente:', errorTodas)
            return { success: false, message: 'Erro ao buscar contexto completo das parcelas', data: [] }
        }

        let finalData = todasParcelas || []

        if (filtros.status && filtros.status !== 'todas') {
            const hoje = new Date()
            const year = hoje.getFullYear()
            const month = String(hoje.getMonth() + 1).padStart(2, '0')
            const day = String(hoje.getDate()).padStart(2, '0')
            const hojeLocalStr = `${year}-${month}-${day}`

            finalData = finalData.filter((p: any) => {
                const isPago = p.status === 'pago' || p.data_pagamento !== null
                let vencimentoStr = ''
                if (p.data_vencimento) {
                    vencimentoStr = p.data_vencimento.split('T')[0]
                }
                
                if (filtros.status === 'pago') return isPago
                if (filtros.status === 'pendente') return !isPago && vencimentoStr >= hojeLocalStr
                if (filtros.status === 'atrasado') return !isPago && vencimentoStr < hojeLocalStr
                return true
            })
        }

        return { success: true, data: finalData }
    } catch (err) {
        console.error('getCustomerParcelasFiltradas exception:', err)
        return { success: false, message: 'Erro interno', data: [] }
    }
}
