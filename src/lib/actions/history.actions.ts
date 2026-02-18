'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export interface CustomerXRayData {
    customer: {
        id: number
        nome: string
        telefone: string | null
        desde: string
        nivel: 'Bronze' | 'Prata' | 'Ouro' | 'Diamante'
    }
    stats: {
        totalGasto: number
        ticketMedio: number
        totalCompras: number
        diasDesdeUltimaCompra: number
        frequenciaMediaDias: number
    }
    habits: {
        compraMaisPara: 'Si mesmo' | 'Dependentes' | 'Equilibrado'
        topProdutos: { nome: string, qtd: number }[]
    }
    sales: {
        id: number
        data: string
        valorTotal: number
        status: string
        vendedor?: string
        observacoes?: string
        itens: {
            produto: string
            valor: number
            qtd: number
            paraQuem: string
        }[]
        pagamentos: {
            metodo: string
            valor: number
            parcelas: string
            data: string
        }[]
        os: {
            id: number
            codigo: string
            data_entrega?: string
            situacao: string
            medico?: string
            olho_direito?: any
            olho_esquerdo?: any
        }[]
    }[]
}

export async function getCustomerXRay(customerId: number, storeId: number): Promise<{ success: boolean, data?: CustomerXRayData, error?: string }> {
    const supabase = createAdminClient()

    try {

        // 1. Fetch Customer Basic Info
        const { data: customerData, error: customerError } = await supabase
            .from('customers')
            .select('id, full_name, fone_movel, created_at')
            .eq('id', customerId)
            .single()

        const customer = customerData as any

        if (customerError || !customer) throw new Error('Cliente não encontrado')

        // 2. Fetch All Sales with Items and Dependents
        console.log('[X-Ray] Fetching sales for customer:', customerId, 'store:', storeId)

        // Try with explicit FK hint first
        let vendas: any[] = []

        const { data: vendasData, error: vendasError } = await supabase
            .from('vendas')
            .select(`
                id, created_at, valor_total, status,
                vendedor:employees!employee_id(full_name),
                itens:venda_itens(
                    id, valor_unitario, quantidade, product_id
                ),
                pagamentos:pagamentos(
                    forma_pagamento, valor_pago, parcelas, created_at
                ),
                os:service_orders(
                    *
                )
            `)
            .eq('store_id', storeId)
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })

        if (vendasError) {
            console.error('[X-Ray] Vendas query error:', vendasError.message, vendasError.details, vendasError.hint)
            throw new Error('Erro ao buscar vendas: ' + vendasError.message)
        }

        vendas = vendasData as any[]
        console.log('[X-Ray] Found', vendas.length, 'sales')

        // 2b. Fetch product names separately (avoids FK dependency)
        const allProductIds = new Set<number>()
        vendas.forEach((v: any) => {
            (v.itens || []).forEach((item: any) => {
                if (item.product_id) allProductIds.add(item.product_id)
            })
        })

        const productMap: Record<number, string> = {}
        if (allProductIds.size > 0) {
            const { data: productsData } = await supabase
                .from('products')
                .select('id, nome')
                .in('id', Array.from(allProductIds))

            if (productsData) {
                (productsData as any[]).forEach((p: any) => { productMap[p.id] = p.nome })
            }
            console.log('[X-Ray] Loaded', Object.keys(productMap).length, 'product names')
        }

        // --- PROCESSING DATA ---

        const totalCompras = vendas.length
        let totalGasto = 0
        const itemCounts: Record<string, number> = {}
        let paraSi = 0
        let paraDependentes = 0


        // Process Sales
        const formattedSales = vendas.map((venda: any) => {
            totalGasto += venda.valor_total || 0

            // Process Items
            const itens = (venda.itens || []).map((item: any) => {
                const prodName = (item.product_id && productMap[item.product_id]) || 'Produto Avulso'
                itemCounts[prodName] = (itemCounts[prodName] || 0) + (item.quantidade || 1)
                paraSi++

                return {
                    produto: prodName,
                    valor: item.valor_unitario,
                    qtd: item.quantidade,
                    paraQuem: 'Próprio'
                }
            })

            // Process Payments
            const pagamentos = (venda.pagamentos || []).map((pg: any) => ({
                metodo: pg.forma_pagamento,
                valor: pg.valor_pago,
                parcelas: pg.parcelas > 1 ? `${pg.parcelas}x` : 'À vista',
                data: pg.created_at
            }))

            // Process OS
            const os = (venda.os || []).map((osItem: any) => ({
                id: osItem.id,
                codigo: osItem.protocolo_fisico || `OS-${osItem.id}`,
                data_entrega: osItem.data_entrega_prevista || osItem.prazo_entrega || osItem.data_entrega || null,
                situacao: osItem.situacao || 'Pendente',
                medico: osItem.medico_nome || osItem.medico || null,
                olho_direito: osItem,
                olho_esquerdo: osItem
            }))

            return {
                id: venda.id,
                data: venda.created_at,
                valorTotal: venda.valor_total,
                status: venda.status,
                vendedor: venda.vendedor?.full_name?.split(' ')[0] || 'Loja',
                itens,
                pagamentos,
                os
            }
        })

        // Stats Calculations
        const ticketMedio = totalCompras > 0 ? totalGasto / totalCompras : 0

        const lastSaleDate = vendas.length > 0 ? new Date(vendas[0].created_at) : new Date()
        const diasDesdeUltimaCompra = Math.floor((new Date().getTime() - lastSaleDate.getTime()) / (1000 * 3600 * 24))

        // Average Frequency
        let frequenciaMediaDias = 0
        if (vendas.length > 1) {
            const firstSaleDate = new Date(vendas[vendas.length - 1].created_at)
            const daysDiff = (lastSaleDate.getTime() - firstSaleDate.getTime()) / (1000 * 3600 * 24)
            frequenciaMediaDias = Math.floor(daysDiff / (vendas.length - 1))
        }

        // Top Products
        const topProdutos = Object.entries(itemCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([nome, qtd]) => ({ nome, qtd }))

        // Habits
        let compraMaisPara: 'Si mesmo' | 'Dependentes' | 'Equilibrado' = 'Si mesmo'
        if (paraDependentes > paraSi * 1.5) compraMaisPara = 'Dependentes'
        else if (paraDependentes > 0 && paraSi > 0) compraMaisPara = 'Equilibrado'

        // Level Calculation
        let nivel: 'Bronze' | 'Prata' | 'Ouro' | 'Diamante' = 'Bronze'
        if (totalGasto > 5000) nivel = 'Diamante'
        else if (totalGasto > 2500) nivel = 'Ouro'
        else if (totalGasto > 1000) nivel = 'Prata'

        return {
            success: true,
            data: {
                customer: {
                    id: customer.id,
                    nome: customer.full_name,
                    telefone: customer.fone_movel,
                    desde: customer.created_at,
                    nivel
                },
                stats: {
                    totalGasto,
                    ticketMedio,
                    totalCompras,
                    diasDesdeUltimaCompra,
                    frequenciaMediaDias
                },
                habits: {
                    compraMaisPara,
                    topProdutos
                },
                sales: formattedSales
            }
        }

    } catch (error: any) {
        console.error('Error in getCustomerXRay:', error)
        return { success: false, error: error.message }
    }
}
