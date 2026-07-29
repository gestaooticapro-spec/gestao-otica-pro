import { createAsyncClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'

type ClosingProfile = {
  role: string | null
  store_id: number | null
  tenant_id: string | null
}

export async function canManageAccountantClosing(storeId: number) {
  const supabase = await createAsyncClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false

  const profile = await getProfileByAdmin(user.id) as ClosingProfile | null
  if (!profile?.tenant_id || !['admin', 'manager'].includes(profile.role || '')) return false
  if (profile.role !== 'admin' && profile.store_id !== storeId) return false

  const admin = createAdminClient() as any
  const { data: store, error } = await admin
    .from('stores')
    .select('tenant_id')
    .eq('id', storeId)
    .maybeSingle()
  if (error || !store) return false

  return store.tenant_id === profile.tenant_id
}
