'use server'

import { createAdminClient } from '../supabase/admin'
import { isStoreModuleEnabledForStore } from '../store-modules.server'

export type ParcelaFiltro = {
    status?: 'todas' | 'pendente' | 'pago' | 'atrasado';
    dataInicial?: string;
    dataFinal?: string;
    busca?: string; // Nome do cliente ou ID da venda
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
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id ),
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

        let resultado = parcelas || []

        // Filtro de Status
        if (filtros.status && filtros.status !== 'todas') {
            // Comparar apenas a parte da data, sem timezones
            const hoje = new Date()
            const year = hoje.getFullYear()
            const month = String(hoje.getMonth() + 1).padStart(2, '0')
            const day = String(hoje.getDate()).padStart(2, '0')
            const hojeLocalStr = `${year}-${month}-${day}` // YYYY-MM-DD local

            resultado = resultado.filter((p: any) => {
                const isPago = p.status === 'pago' || p.data_pagamento !== null
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
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id ),
                customers (full_name, cpf)
            `)
            .in('financiamento_id', financiamentoIds)
            .order('data_vencimento', { ascending: true })
            .order('numero_parcela', { ascending: true })

        if (errorTodas) {
            console.error('Erro ao buscar todas as parcelas:', errorTodas)
            return { success: false, message: 'Erro ao buscar contexto completo das parcelas', data: [] }
        }

        let finalData = todasParcelas || []

        // Como expandimos o contexto, aplicamos o filtro de Status novamente
        // para não misturar pagas/pendentes se o usuário exigiu um status específico
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
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id ),
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
                status,
                data_pagamento,
                customer_id,
                financiamento_id,
                financiamento_loja ( venda_id ),
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
