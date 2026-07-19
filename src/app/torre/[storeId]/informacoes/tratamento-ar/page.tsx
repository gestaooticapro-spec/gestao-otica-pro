import { notFound, redirect } from 'next/navigation'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'
import ArTreatmentDemo from '@/components/tower/ArTreatmentDemo'

export default async function TowerArTreatmentPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ client?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const access = await authorizeTowerStoreAccess(storeId)
  if (!access.ok) return redirect('/login')

  return <ArTreatmentDemo storeId={storeId} clientMode={searchParams?.client === '1'} />
}
