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
        topMedico: string | null
    }
    sales: {
        id: number
        data: string
        valorTotal: number
        valorRestante: number
        status: string
        isHistoricalImport: boolean
        historicalEntryAmount: number
        sourceSystem?: string | null
        sourceRecordKey?: string | null
        vendedor?: string
        observacoes?: string | null
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
            isParcela: boolean
        }[]
        parcelasPendentes: {
            id: number
            numero_parcela: number
            data_vencimento: string
            valor_parcela: number
            status: string
            isAtrasada: boolean
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
    postSales: {
        mediaAvaliacao: number | null
        totalRegistros: number
        totalConcluidosComNota: number
        registros: {
            id: number
            createdAt: string
            status: string
            avaliacaoCliente: number | null
            observacoesFinais: string | null
            serviceOrderId: number | null
        }[]
    }
    cobranca: {
        totalRegistros: number
        vendasComCobranca: number
        metricaPrincipal: 'vendas' | 'contatos'
        valorMetrica: number
        jaFoiCobrado: boolean
        ultimoContatoEm: string | null
    }
    devedor: {
        isDevedor: boolean
        saldoPendente: number
        vendasComSaldo: number
    }
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

        // Try without explicit FK hint to avoid stack overflow bug in Supabase
        let vendas: any[] = []

        const { data: vendasData, error: vendasError } = await supabase
            .from('vendas')
            .select(`
                id, created_at, valor_total, valor_restante, status, obs_geral,
                is_historical_import, historical_entry_amount, import_source_system, import_source_record_key,
                vendedor:employees!employee_id(full_name),
                itens:venda_itens(
                    id, descricao, item_tipo, valor_unitario, quantidade, product_id
                ),
                pagamentos:pagamentos(
                    forma_pagamento, valor_pago, parcelas, created_at, obs
                ),
                os:service_orders(
                    *,
                    dependente:dependentes(full_name),
                    medico:oftalmologistas(nome_completo)
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

        if (vendas.length > 0) {
            // Fetch financiamento_loja separately to avoid postgrest embedding bugs
            const vendasIds = vendas.map(v => v.id)
            const { data: finDataResult, error: finError } = await supabase
                .from('financiamento_loja')
                .select(`
                    id, venda_id,
                    financiamento_parcelas (
                        id, numero_parcela, data_vencimento, valor_parcela, status, data_pagamento
                    )
                `)
                .in('venda_id', vendasIds)

            const finData = finDataResult as any[]

            if (!finError && finData) {
                // Attach them back
                for (const venda of vendas) {
                    venda.financiamento_loja = finData.filter(f => f.venda_id === venda.id)
                }
            }
        }


        // 2c. Fetch service orders for customer (for robust post-sales lookup)
        let serviceOrders: any[] = []
        const { data: serviceOrdersData, error: serviceOrdersError } = await (supabase
            .from('service_orders') as any)
            .select('id')
            .eq('store_id', storeId)
            .eq('customer_id', customerId)

        if (serviceOrdersError) {
            console.error('[X-Ray] Service orders query error:', serviceOrdersError.message)
        } else {
            serviceOrders = serviceOrdersData || []
        }

        // O dossiê também recebe as OS embutidas na venda. Em dados legados,
        // a consulta direta por customer_id pode não retornar uma OS que ainda
        // possui um pós-venda válido; nesse caso a nota ficava invisível.
        const serviceOrderIds = [
            ...serviceOrders.map((os: any) => Number(os.id)),
            ...vendas.flatMap((venda: any) => (venda.os || []).map((os: any) => Number(os.id))),
        ]
            .filter((id: number) => Number.isFinite(id))
        const uniqueServiceOrderIds = [...new Set(serviceOrderIds)]

        // 2d. Fetch post-sales by service_order_id
        let postSalesRows: any[] = []
        if (uniqueServiceOrderIds.length > 0) {
            const { data: postSalesData, error: postSalesError } = await (supabase
                .from('post_sales') as any)
                .select('id, created_at, status, avaliacao_cliente, observacoes_finais, service_order_id')
                .eq('store_id', storeId)
                .in('service_order_id', uniqueServiceOrderIds)
                .order('created_at', { ascending: false })

            if (postSalesError) {
                console.error('[X-Ray] Post-sales query error:', postSalesError.message)
            } else {
                postSalesRows = postSalesData || []
            }
        }

        const postSalesConcluidosComNota = postSalesRows.filter((row: any) =>
            row.status === 'Concluido' &&
            row.avaliacao_cliente !== null &&
            row.avaliacao_cliente !== undefined
        )

        const totalConcluidosComNota = postSalesConcluidosComNota.length
        const mediaAvaliacao = totalConcluidosComNota > 0
            ? Number((
                postSalesConcluidosComNota.reduce((acc: number, row: any) => acc + Number(row.avaliacao_cliente || 0), 0) /
                totalConcluidosComNota
            ).toFixed(1))
            : null

        const postSalesRegistros = postSalesRows.map((row: any) => ({
            id: row.id,
            createdAt: row.created_at,
            status: row.status || 'Pendente',
            avaliacaoCliente: row.avaliacao_cliente === null || row.avaliacao_cliente === undefined
                ? null
                : Number(row.avaliacao_cliente),
            observacoesFinais: row.observacoes_finais || null,
            serviceOrderId: row.service_order_id || null
        }))

        // 2e. Fetch cobranças for customer
        let cobrancaRows: any[] = []
        const { data: cobrancaData, error: cobrancaError } = await (supabase
            .from('cobranca_historico') as any)
            .select('id, venda_id, created_at')
            .eq('store_id', storeId)
            .eq('customer_id', customerId)
            .order('created_at', { ascending: false })

        if (cobrancaError) {
            console.error('[X-Ray] Cobranca query error:', cobrancaError.message)
        } else {
            cobrancaRows = cobrancaData || []
        }

        const vendasComCobrancaSet = new Set<number>()
        cobrancaRows.forEach((row: any) => {
            const vendaId = Number(row.venda_id)
            if (Number.isFinite(vendaId) && vendaId > 0) {
                vendasComCobrancaSet.add(vendaId)
            }
        })

        const totalCobrancas = cobrancaRows.length
        const vendasComCobranca = vendasComCobrancaSet.size
        const metricaPrincipal: 'vendas' | 'contatos' = vendasComCobranca > 0 ? 'vendas' : 'contatos'
        const valorMetrica = vendasComCobranca > 0 ? vendasComCobranca : totalCobrancas
        const jaFoiCobrado = totalCobrancas > 0
        const ultimoContatoEm = cobrancaRows[0]?.created_at || null

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
                .select('id, nome, marca')
                .in('id', Array.from(allProductIds))

            if (productsData) {
                (productsData as any[]).forEach((p: any) => { 
                    const nomeStr = String(p.nome || '').trim()
                    const marcaStr = String(p.marca || '').trim()
                    
                    if (marcaStr && !nomeStr.toLowerCase().startsWith(marcaStr.toLowerCase()) && !nomeStr.toLowerCase().includes(marcaStr.toLowerCase())) {
                        productMap[p.id] = `${marcaStr} ${nomeStr}`
                    } else {
                        productMap[p.id] = nomeStr
                    }
                })
            }
            console.log('[X-Ray] Loaded', Object.keys(productMap).length, 'product names')
        }

        // --- PROCESSING DATA ---

        const totalCompras = vendas.length
        let totalGasto = 0
        const itemCounts: Record<string, number> = {}
        const medicoCounts: Record<string, number> = {}
        let paraSi = 0
        let paraDependentes = 0

        const hoje = new Date().toISOString().split('T')[0];
        const { data: pendingParcelas, error: pendingError } = await (supabase
            .from('financiamento_parcelas') as any)
            .select('valor_parcela, data_vencimento, venda_id')
            .eq('store_id', storeId)
            .eq('customer_id', customerId)
            .eq('status', 'Pendente')
            .gt('valor_parcela', 0.01);

        let isDevedor = false;
        let saldoPendente = 0;
        const vendasComSaldoSet = new Set<number>();

        if (pendingParcelas && !pendingError) {
            pendingParcelas.forEach((p: any) => {
                saldoPendente += Number(p.valor_parcela || 0);
                if (p.venda_id) {
                    vendasComSaldoSet.add(p.venda_id);
                }
                const vencStr = p.data_vencimento ? p.data_vencimento.split('T')[0] : '';
                if (vencStr < hoje) {
                    isDevedor = true;
                }
            });
        }
        const totalVendasComSaldo = vendasComSaldoSet.size;


        // Process Sales
        const formattedSales = vendas.map((venda: any) => {
            totalGasto += venda.valor_total || 0

            // Process OS
            const os = (venda.os || []).map((osItem: any) => {
                const medicoNome = osItem.medico?.nome_completo || null;
                if (medicoNome) {
                    medicoCounts[medicoNome] = (medicoCounts[medicoNome] || 0) + 1;
                }

                return {
                    id: osItem.id,
                    codigo: osItem.protocolo_fisico || `OS-${osItem.id}`,
                    data_entrega: osItem.data_entrega_prevista || osItem.prazo_entrega || osItem.data_entrega || null,
                    situacao: osItem.situacao || 'Pendente',
                    medico: medicoNome,
                    olho_direito: osItem,
                    olho_esquerdo: osItem,
                    dependentName: osItem.dependente?.full_name || null
                };
            })

            const dependentesNaVenda = os.map((o: any) => o.dependentName).filter(Boolean);
            const pacienteNome = dependentesNaVenda.length > 0 ? dependentesNaVenda[0] : null;

            // Process Items
            const itens = (venda.itens || []).map((item: any) => {
                const prodName = (item.product_id && productMap[item.product_id]) || item.descricao || 'Produto Avulso'
                itemCounts[prodName] = (itemCounts[prodName] || 0) + (item.quantidade || 1)

                if (pacienteNome) {
                    paraDependentes++
                } else {
                    paraSi++
                }

                return {
                    produto: prodName,
                    valor: item.valor_unitario,
                    qtd: item.quantidade,
                    paraQuem: pacienteNome || 'Próprio'
                }
            })

            // Process Payments
            const pagamentos = (venda.pagamentos || []).map((pg: any) => {
                const isParcela = pg.obs ? (pg.obs.includes('Parc.') || pg.obs.toLowerCase().includes('parcela')) : false
                return {
                    metodo: pg.forma_pagamento,
                    valor: pg.valor_pago,
                    parcelas: pg.parcelas > 1 ? `${pg.parcelas}x` : 'À vista',
                    data: pg.created_at,
                    isParcela
                }
            })

            // Process Pending Installments
            const financiamentoLoja = venda.financiamento_loja?.[0]
            const parcelasFiltradas = (financiamentoLoja?.financiamento_parcelas || []).filter((p: any) => p.status === 'Pendente')
            const hojeStr = new Date().toISOString().split('T')[0]
            const parcelasPendentes = parcelasFiltradas.map((p: any) => {
                const vencStr = p.data_vencimento ? p.data_vencimento.split('T')[0] : ''
                return {
                    id: p.id,
                    numero_parcela: p.numero_parcela,
                    data_vencimento: p.data_vencimento,
                    valor_parcela: p.valor_parcela,
                    status: p.status,
                    isAtrasada: vencStr < hojeStr
                }
            }).sort((a: any, b: any) => new Date(a.data_vencimento).getTime() - new Date(b.data_vencimento).getTime())

            return {
                id: venda.id,
                data: venda.created_at,
                valorTotal: venda.valor_total,
                valorRestante: venda.is_historical_import === true ? 0 : (venda.valor_restante || 0),
                status: venda.status,
                isHistoricalImport: venda.is_historical_import === true,
                historicalEntryAmount: venda.historical_entry_amount || 0,
                sourceSystem: venda.import_source_system || null,
                sourceRecordKey: venda.import_source_record_key || null,
                vendedor: venda.vendedor?.full_name?.split(' ')[0] || 'Loja',
                observacoes: venda.obs_geral || null,
                itens,
                pagamentos,
                parcelasPendentes,
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

        // Top Medico
        let topMedico: string | null = null
        let maxMedicoCount = 0
        for (const [medico, count] of Object.entries(medicoCounts)) {
            if (count > maxMedicoCount) {
                maxMedicoCount = count
                topMedico = medico
            }
        }

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
                    topProdutos,
                    topMedico
                },
                sales: formattedSales,
                postSales: {
                    mediaAvaliacao,
                    totalRegistros: postSalesRows.length,
                    totalConcluidosComNota,
                    registros: postSalesRegistros
                },
                cobranca: {
                    totalRegistros: totalCobrancas,
                    vendasComCobranca,
                    metricaPrincipal,
                    valorMetrica,
                    jaFoiCobrado,
                    ultimoContatoEm
                },
                devedor: {
                    isDevedor,
                    saldoPendente,
                    vendasComSaldo: totalVendasComSaldo
                }
            }
        }

    } catch (error: any) {
        console.error('Error in getCustomerXRay:', error)
        return { success: false, error: error.message }
    }
}
