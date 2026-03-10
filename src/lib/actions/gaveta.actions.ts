'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { unstable_noStore as noStore } from 'next/cache'

export async function getGavetaItems(storeId: number) {
  noStore()
  const supabase = createAdminClient()

  try {
    const { data, error } = await supabase
      .from('service_orders')
      .select(`
        *,
        customers (
          id,
          full_name,
          fone_movel, 
          phone 
        ),
        vendas (
          id,
          valor_restante
        ),
        dependente:dependentes (
          id,
          full_name
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