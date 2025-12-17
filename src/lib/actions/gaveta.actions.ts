'use server'

import { createClient } from '@/lib/supabase/server'

export async function getGavetaItems(storeId: number) {
  const supabase = createClient()

  try {
    const { data, error } = await supabase
      .from('service_orders')
      .select(`
        *,
        customers (
          id,
          full_name,
          fone_movel, 
          mobile_phone 
        ),
        vendas (
          id,
          valor_restante
        ),
        dependente:dependentes (
          id,
          nome_completo
        )
      `)
      .eq('store_id', storeId)
      .not('dt_montado_em', 'is', null) // Já está pronto
      .is('dt_entregue_em', null)       // Ainda não foi entregue
      .order('dt_montado_em', { ascending: true }) // Os mais antigos primeiro

    if (error) {
      console.error('Erro ao buscar gaveta:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}