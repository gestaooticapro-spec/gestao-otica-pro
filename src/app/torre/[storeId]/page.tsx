import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TowerWelcomeMock from '@/components/tower/TowerWelcomeMock'

export default async function TowerPage({
  params,
  searchParams,
}: {
  params: { storeId: string }
  searchParams?: { menu?: string }
}) {
  const storeId = parseInt(params.storeId, 10)
  if (Number.isNaN(storeId)) return notFound()

  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return redirect('/login')

  return <TowerWelcomeMock storeId={storeId} initialExperienceMenu={searchParams?.menu === 'experiencias'} />
}
