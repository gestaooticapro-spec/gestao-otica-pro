import { notFound, redirect } from 'next/navigation'
import MultifocalFocusDemo from '@/components/catalog/MultifocalFocusDemo'
import { createClient } from '@/lib/supabase/server'

export default async function TowerFocusDemoPage({
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

  return (
    <MultifocalFocusDemo
      storeId={storeId}
      clientMode={searchParams?.client === '1'}
      backHref={`/torre/${storeId}?menu=experiencias`}
      towerMode
    />
  )
}
