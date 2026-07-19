import { notFound } from 'next/navigation'
import TowerRemoteConfigWorkspace from '@/components/tower/TowerRemoteConfigWorkspace'
import TowerRemotePinGate from '@/components/tower/TowerRemotePinGate'
import { authorizeTowerRemoteConfigSession } from '@/lib/server/tower-remote-config-session'
import { readTowerRemoteConfig } from '@/lib/server/tower-remote-config'

export const dynamic = 'force-dynamic'

export default async function TowerRemoteConfigPage({ params }: { params: Promise<{ publicCode: string }> }) {
  const { publicCode } = await params
  if (!/^[A-Za-z0-9_-]{32}$/.test(publicCode)) notFound()
  const session = await authorizeTowerRemoteConfigSession(publicCode)
  if (!session) return <TowerRemotePinGate publicCode={publicCode} />
  const config = await readTowerRemoteConfig(session.storeId)
  if (!config) notFound()
  return <TowerRemoteConfigWorkspace publicCode={publicCode} storeId={session.storeId} initialConfig={config} />
}
