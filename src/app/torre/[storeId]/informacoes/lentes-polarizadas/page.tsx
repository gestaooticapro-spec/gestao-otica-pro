import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PolarizedLensDemo from '@/components/tower/PolarizedLensDemo'

export default async function TowerPolarizedLensPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ client?: string }>
  }
) {
  const searchParams = await props.searchParams;
  const params = await props.params;
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  return <PolarizedLensDemo storeId={storeId} clientMode={searchParams?.client === '1'} />
}
