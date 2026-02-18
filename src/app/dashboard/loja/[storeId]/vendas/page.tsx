// Caminho: src/app/dashboard/loja/[storeId]/vendas/page.tsx
import { getSalesList } from '@/lib/actions/vendas.actions'
import VendasListInterface from '@/components/vendas/VendasListInterface'

export const dynamic = 'force-dynamic'

export default async function VendasListPage({
  params,
  searchParams
}: {
  params: { storeId: string }
  searchParams: { mode?: string, inicio?: string, fim?: string, search?: string }
}) {
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