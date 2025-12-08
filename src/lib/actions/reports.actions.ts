'use server'

import { createAdminClient } from '@/lib/supabase/admin'

export type VendaRelatorioItem = {
  id: number
  data: string
  cliente: string
  vendedor: string
  itens_resumo: string
  qtd_itens: number
  status: string
  valor_total: number
  valor_desconto: number
  valor_final: number
  valor_pago: number
  saldo_devedor: number
  tem_carne: boolean
}

export async function getRelatorioVendas(storeId: number, dataInicio: string, dataFim: string) {
  const supabase = createAdminClient()

  // Ajusta o fim do dia para a data final
  const fimDoDia = new Date(dataFim)
  fimDoDia.setHours(23, 59, 59, 999)

  try {
    const { data: vendas, error } = await supabase
      .from('vendas')
      .select(`
        id, created_at, status, valor_total, valor_desconto, valor_final, valor_restante, financiamento_id,
        customers ( full_name ),
        employees ( full_name ),
        venda_itens ( descricao )
      `)
      .eq('store_id', storeId)
      .gte('created_at', dataInicio)
      .lte('created_at', fimDoDia.toISOString())
      .order('created_at', { ascending: false })

    if (error) throw error
    if (!vendas) return []

    // Achata os dados para a tabela
    const relatorio: VendaRelatorioItem[] = vendas.map((v: any) => {
      const pago = (v.valor_final || 0) - (v.valor_restante || 0)
      const itensDesc = v.venda_itens?.map((i: any) => i.descricao).join(', ') || ''
      
      return {
        id: v.id,
        data: v.created_at,
        cliente: v.customers?.full_name || 'Consumidor Final',
        vendedor: v.employees?.full_name || '-',
        itens_resumo: itensDesc.length > 50 ? itensDesc.substring(0, 50) + '...' : itensDesc,
        qtd_itens: v.venda_itens?.length || 0,
        status: v.status,
        valor_total: v.valor_total || 0,
        valor_desconto: v.valor_desconto || 0,
        valor_final: v.valor_final || 0,
        valor_pago: pago,
        saldo_devedor: v.valor_restante || 0,
        tem_carne: !!v.financiamento_id
      }
    })

    return relatorio
  } catch (error) {
    console.error("Erro relatório:", error)
    return []
  }
}