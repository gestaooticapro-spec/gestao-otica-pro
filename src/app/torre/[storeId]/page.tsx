import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import TowerWelcomeMock from '@/components/tower/TowerWelcomeMock'

export default async function TowerPage(
  props: {
    params: Promise<{ storeId: string }>
    searchParams?: Promise<{ menu?: string; session?: string }>
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

  const opensInformationMenu = searchParams?.menu === 'informacoes'

  return (
    <TowerWelcomeMock
      key={`${searchParams?.menu ?? 'inicio'}-${opensInformationMenu ? 'informacoes' : 'experiencias'}`}
      storeId={storeId}
      initialExperienceMenu={searchParams?.menu === 'experiencias' || opensInformationMenu}
      initialInformationMenu={opensInformationMenu}
    />
  )
}
