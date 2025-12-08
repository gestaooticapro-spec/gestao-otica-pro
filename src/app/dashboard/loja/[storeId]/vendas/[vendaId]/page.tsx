// ARQUIVO: src/app/dashboard/loja/[storeId]/vendas/[vendaId]/page.tsx

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getVendaPageData, type VendaPageData } from '@/lib/actions/vendas.actions'
import VendaInterface from '@/components/vendas/VendaInterface'

type Props = {
  params: { storeId: string; vendaId: string }
  searchParams: { employee_id?: string; employee_name?: string; open_payment?: string }
}

export default async function VendaPage({ params, searchParams }: Props) {
  const storeId = parseInt(params.storeId)
  const vendaId = parseInt(params.vendaId)
  
  if (isNaN(storeId) || isNaN(vendaId)) return notFound()

  // CORREÇÃO: Usamos 'success' e 'message' em vez de 'error' [cite: 1483]
  const { success, data, message } = await getVendaPageData(vendaId, storeId)
  
  // Verifica se a busca falhou ou se os dados essenciais não vieram
  if (!success || !data || !data.venda) {
    console.error('Erro venda:', message)
    return notFound()
  }

  // Agora 'data' é seguro. Desestruturamos as propriedades necessárias.
  const {
    venda, 
    customer, 
    employee, 
    vendaItens, 
    pagamentos, 
    serviceOrders, 
    financiamento,
    lentes,
    armacoes,
    tratamentos
  } = data

  const handleDataReload = async () => {
    'use server'
    revalidatePath(`/dashboard/loja/${storeId}/vendas/${vendaId}`)
  }

  const isVendaFechadaOuCancelada = ['Fechada', 'Cancelada'].includes(venda.status)
  const isQuitado = (venda.valor_restante ?? 0) <= 0.01;

  return (
    <VendaInterface 
      venda={venda}
      customer={customer}
      employee={employee}
      vendaItens={vendaItens}
      serviceOrders={serviceOrders}
      pagamentos={pagamentos}
      financiamento={financiamento}
      lentes={lentes || []}
      armacoes={armacoes || []}
      tratamentos={tratamentos || []}
      isQuitado={isQuitado}
      isVendaFechadaOuCancelada={isVendaFechadaOuCancelada}
      onDataReload={handleDataReload}
    />
  )
}