import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import PixMaquininhaClient from '@/components/pix/PixMaquininhaClient'
import PixMaquininhaAccessGate from '@/components/pix/PixMaquininhaAccessGate'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'
import { hasPixMachineGrant } from '@/lib/pix/pix-maquininha-access'
import type { StoreSettings } from '@/lib/store-modules'

export default async function PixMaquininhaPage({ params }: { params: Promise<{ storeId: string }> }) {
  const { storeId: rawStoreId } = await params
  const storeId = Number(rawStoreId)
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const profile = user ? await getProfileByAdmin(user.id) as any : null
  const admin: any = createAdminClient()
  const { data: store } = await admin.from('stores').select('id, name, tenant_id, cnpj, settings').eq('id', storeId).maybeSingle()
  if (!store) redirect(`/tablet/${storeId}`)
  const settings = (store.settings || {}) as StoreSettings
  if (!isSicrediPilotStoreCnpj(store.cnpj) || settings.pix_provider !== 'sicredi') redirect(`/tablet/${storeId}`)
  const hasDashboardAccess = Boolean(user && profile?.tenant_id && store.tenant_id === profile.tenant_id && (profile.role === 'admin' || profile.store_id === storeId))
  if (!hasDashboardAccess && !(await hasPixMachineGrant(storeId))) return <PixMaquininhaAccessGate storeId={storeId} storeName={store.name || 'Loja'} />
  return <PixMaquininhaClient storeId={storeId} storeName={store.name || 'Loja'} />
}
