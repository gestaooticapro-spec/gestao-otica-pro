import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TowerMeasurementLab from '@/components/medidas/TowerMeasurementLab'

export default async function StoreTowerMeasurementPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { client?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  return <TowerMeasurementLab storeId={storeId} clientMode={searchParams?.client === '1'} />
}
