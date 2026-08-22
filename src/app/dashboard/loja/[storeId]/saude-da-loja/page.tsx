import { notFound, redirect } from 'next/navigation'
import DailyHealthClient from '@/components/daily-health/DailyHealthClient'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { hasDailyHealthManagerGrant } from '@/lib/daily-health-access'
import { getLatestDailyStoreHealthReport } from '@/lib/daily-store-health'

export default async function StoreHealthPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId: rawStoreId } = await params
  const storeId = Number(rawStoreId)
  if (!Number.isInteger(storeId)) return notFound()
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) redirect('/login')
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null } | null
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) redirect('/dashboard')
  const needsPin = profile.role !== 'admin' && !(await hasDailyHealthManagerGrant(storeId))
  const report = needsPin ? null : await getLatestDailyStoreHealthReport(storeId)
  return <DailyHealthClient storeId={storeId} report={report} needsPin={needsPin} canConfigure={profile.role === 'admin'} />
}
