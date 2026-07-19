import { notFound, redirect } from 'next/navigation'
import TowerWelcomeMock from '@/components/tower/TowerWelcomeMock'
import { authorizeTowerStoreAccess } from '@/lib/server/tower-device-web-session'
import { readTowerRemoteConfig } from '@/lib/server/tower-remote-config'
import { DEFAULT_TOWER_REMOTE_CONFIG } from '@/lib/tower/remote-config'

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

  const access = await authorizeTowerStoreAccess(storeId)
  if (!access.ok) return redirect('/login')
  const remoteConfig = await readTowerRemoteConfig(storeId)

  const opensInformationMenu = searchParams?.menu === 'informacoes'

  return (
    <TowerWelcomeMock
      key={`${searchParams?.menu ?? 'inicio'}-${opensInformationMenu ? 'informacoes' : 'experiencias'}`}
      storeId={storeId}
      remoteConfig={remoteConfig ?? DEFAULT_TOWER_REMOTE_CONFIG}
      remoteConfigUnavailable={!remoteConfig}
      initialExperienceMenu={searchParams?.menu === 'experiencias' || opensInformationMenu}
      initialInformationMenu={opensInformationMenu}
    />
  )
}
