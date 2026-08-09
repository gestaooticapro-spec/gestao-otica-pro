import { notFound } from 'next/navigation'
import { unstable_noStore as noStore } from 'next/cache'
import { getVendaPageData } from '@/lib/actions/vendas.actions'
import HistoricalImportedSalePage from '@/components/history/HistoricalImportedSalePage'

type Props = { params: Promise<{ storeId: string; vendaId: string }> }

export default async function HistoricalImportedSaleRoute({ params }: Props) {
  noStore()
  const { storeId: storeIdRaw, vendaId: vendaIdRaw } = await params
  const storeId = Number(storeIdRaw)
  const vendaId = Number(vendaIdRaw)
  if (!Number.isInteger(storeId) || !Number.isInteger(vendaId)) notFound()

  const result = await getVendaPageData(vendaId, storeId)
  if (!result.success || !result.data || result.data.venda.is_historical_import !== true) notFound()

  return <HistoricalImportedSalePage data={result.data} storeId={storeId} />
}
