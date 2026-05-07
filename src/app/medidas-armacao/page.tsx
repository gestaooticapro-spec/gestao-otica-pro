import FrameMeasurementTool from '@/components/medidas/FrameMeasurementTool'

export const metadata = { title: 'Medidor de Armação' }

export default function MedidasArmacaoPage({
  searchParams,
}: {
  searchParams: { osId?: string; storeId?: string }
}) {
  const osId    = searchParams.osId    ? parseInt(searchParams.osId,    10) : undefined
  const storeId = searchParams.storeId ? parseInt(searchParams.storeId, 10) : undefined

  return (
    <div className="min-h-screen bg-slate-950">
      <FrameMeasurementTool osId={osId} storeId={storeId} />
    </div>
  )
}
