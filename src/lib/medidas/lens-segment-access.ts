import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getLensSegmentInternalSecret, getLensSegmentServiceUrl } from '@/lib/medidas/lens-segment-token'

export function getLensSegmentForwardOrigin() {
  const value = process.env.LENS_SEGMENT_FORWARD_ORIGIN?.trim()
  if (!value) return 'https://gestao-otica-pro.vercel.app'
  return value.replace(/\/+$/, '')
}

export async function authorizeLensSegmentStore(storeId: number) {
  const secret = getLensSegmentInternalSecret()
  const segmentUrl = getLensSegmentServiceUrl()
  if (!secret || !segmentUrl) {
    return { ok: false as const, status: 503, error: 'Analise com IA indisponivel.' }
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, status: 401, error: 'Nao autenticado.' }

  const profile = await getProfileByAdmin(user.id) as {
    role?: string | null
    store_id?: number | null
    tenant_id?: string | null
  } | null
  if (!profile?.tenant_id || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) {
    return { ok: false as const, status: 403, error: 'Acesso negado para esta loja.' }
  }

  const admin: any = createAdminClient({ noStore: true })
  const { data: store, error } = await admin.from('stores').select('id, tenant_id').eq('id', storeId).maybeSingle()
  if (error || !store || store.tenant_id !== profile.tenant_id) {
    return { ok: false as const, status: 403, error: 'Acesso negado para esta loja.' }
  }

  return { ok: true as const, secret, segmentUrl }
}
