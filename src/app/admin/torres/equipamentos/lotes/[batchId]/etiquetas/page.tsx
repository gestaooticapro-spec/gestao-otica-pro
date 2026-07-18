import { notFound } from 'next/navigation'
import TowerAssetLabelsPrint from '@/components/admin/TowerAssetLabelsPrint'
import { getTowerAssetBatchLabels } from '@/lib/actions/tower-assets.actions'

export default async function TowerAssetLabelsPage(props: { params: Promise<{ batchId: string }> }) {
  const params = await props.params;
  const data = await getTowerAssetBatchLabels(params.batchId)
  if (!data) notFound()
  return <TowerAssetLabelsPrint batch={data.batch} assets={data.assets} />
}
