// Caminho: src/app/dashboard/loja/[storeId]/vendas/page.tsx
import { getSalesList } from '@/lib/actions/vendas.actions'
import VendasListInterface from '@/components/vendas/VendasListInterface'

export const dynamic = 'force-dynamic'

export default async function VendasListPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams: Promise<{ mode?: string, inicio?: string, fim?: string, search?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId)

  // Recupera filtros da URL
  const mode = (searchParams.mode as 'pendencias' | 'historico') || 'pendencias'
  const startDate = searchParams.inicio
  const endDate = searchParams.fim
  const search = searchParams.search

  // Busca dados filtrados
  const { data: vendas, success } = await getSalesList(storeId, { mode, startDate, endDate, search })

  return (
    <VendasListInterface
      vendas={success ? (vendas as any[]) : []}
      storeId={storeId}
      mode={mode}
      startDate={startDate}
      endDate={endDate}
    />
  )
}