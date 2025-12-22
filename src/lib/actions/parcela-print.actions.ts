'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export async function getDadosReciboParcela(parcelaId: number) {
  // Usamos AdminClient para garantir acesso aos dados (Bypass RLS)
  const supabase = createAdminClient()

  console.log(`[PRINT_DEBUG] 1. Iniciando busca ADMIN para parcela ID: ${parcelaId}`)

  try {
    // ------------------------------------------------------------------
    // PASSO 1: Busca a Parcela
    // ------------------------------------------------------------------
    const { data: parcelaRaw, error: erroParcela } = await supabase
      .from('financiamento_parcelas')
      .select('*')
      .eq('id', parcelaId)
      .single()

    if (erroParcela || !parcelaRaw) {
      throw new Error('Parcela não encontrada ou inacessível.')
    }

    // CORREÇÃO DE TIPAGEM: Forçamos 'any' para o TS não bloquear o acesso às propriedades
    const parcela = parcelaRaw as any

    // ------------------------------------------------------------------
    // PASSO 2: Busca o Financiamento (Pai)
    // ------------------------------------------------------------------
    let vendaId = 0
    let finalCustomerId = parcela.customer_id 

    if (parcela.financiamento_id) {
      const { data: financRaw, error: erroFinanc } = await supabase
        .from('financiamento_loja')
        .select('venda_id, customer_id')
        .eq('id', parcela.financiamento_id)
        .single()

      if (financRaw) {
        // CORREÇÃO DE TIPAGEM
        const financ = financRaw as any
        
        vendaId = financ.venda_id
        
        // Se o financiamento tem customer_id (e sabemos que tem), priorizamos ele
        if (financ.customer_id) {
           finalCustomerId = financ.customer_id
        }
        console.log(`[PRINT_DEBUG] 2. Financiamento OK. Venda: ${vendaId} | ClienteID: ${finalCustomerId}`)
      }
    }

    // ------------------------------------------------------------------
    // PASSO 3: Busca o Nome do Cliente (Agora com permissão total e ID garantido)
    // ------------------------------------------------------------------
    let nomeCliente = 'Cliente não identificado'

    if (finalCustomerId) {
      const { data: clienteRaw } = await supabase
        .from('customers')
        .select('full_name')
        .eq('id', finalCustomerId)
        .single()
      
      if (clienteRaw) {
        // CORREÇÃO DE TIPAGEM
        const cliente = clienteRaw as any
        
        nomeCliente = cliente.full_name
        console.log(`[PRINT_DEBUG] 3. Cliente encontrado: ${nomeCliente}`)
      } else {
        console.warn(`[PRINT_DEBUG] Cliente ID ${finalCustomerId} não encontrado mesmo como Admin.`)
      }
    }

    // ------------------------------------------------------------------
    // RETORNO
    // ------------------------------------------------------------------
    return {
      success: true,
      data: {
        num_parcela: parcela.numero_parcela,
        valor: parcela.valor_parcela,
        vencimento: parcela.data_vencimento,
        // Fallback seguro se data_pagamento for null
        pagamento: parcela.data_pagamento || new Date().toISOString(),
        is_reimpressao: false, 
        nome_cliente: nomeCliente,
        venda_id: vendaId
      }
    }

  } catch (error: any) {
    console.error('[PRINT_DEBUG] ERRO FATAL:', error)
    return { success: false, error: error.message }
  }
}