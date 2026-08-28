import { redirect } from 'next/navigation'
import PixMaquininhaAccessGate from '@/components/pix/PixMaquininhaAccessGate'
import PixMaquininhaClient from '@/components/pix/PixMaquininhaClient'
import { hasPixMachineGrant } from '@/lib/pix/pix-maquininha-access'
import { isSicrediPilotStoreCnpj } from '@/lib/pix/sicredi-availability'
import { createAdminClient } from '@/lib/supabase/admin'
import type { StoreSettings } from '@/lib/store-modules'

export default async function TabletPixMaquininhaPage({
  params,
}: {
  params: Promise<{ storeId: string }>
}) {
  const { storeId: rawStoreId } = await params
  const storeId = Number(rawStoreId)

  if (!Number.isSafeInteger(storeId) || storeId <= 0) redirect('/login')

  const admin: any = createAdminClient()
  const { data: store } = await admin
    .from('stores')
    .select('id, name, cnpj, settings')
    .eq('id', storeId)
    .maybeSingle()

  if (!store) redirect(`/tablet/${storeId}`)

  const settings = (store.settings || {}) as StoreSettings
  if (!isSicrediPilotStoreCnpj(store.cnpj) || settings.pix_provider !== 'sicredi') {
    redirect(`/tablet/${storeId}`)
  }

  if (!(await hasPixMachineGrant(storeId))) {
    return <PixMaquininhaAccessGate storeId={storeId} storeName={store.name || 'Loja'} />
  }

  return <PixMaquininhaClient storeId={storeId} storeName={store.name || 'Loja'} />
}
