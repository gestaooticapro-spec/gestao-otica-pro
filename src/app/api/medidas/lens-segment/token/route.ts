import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import {
  getLensSegmentInternalSecret,
  getLensSegmentServiceUrl,
  issueLensSegmentToken,
} from '@/lib/medidas/lens-segment-token'

export const runtime = 'nodejs'

const RequestSchema = z.object({
  storeId: z.number().int().positive(),
})

export async function POST(request: Request) {
  const secret = getLensSegmentInternalSecret()
  const segmentUrl = getLensSegmentServiceUrl()
  if (!secret || !segmentUrl) {
    return NextResponse.json({ error: 'Analise com IA indisponivel.' }, { status: 503 })
  }

  let parsed: z.infer<typeof RequestSchema>
  try {
    parsed = RequestSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Loja invalida.' }, { status: 400 })
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 })

  const profile = await getProfileByAdmin(user.id) as {
    role?: string | null
    store_id?: number | null
    tenant_id?: string | null
  } | null
  if (!profile || (!profile.tenant_id) || (profile.role !== 'admin' && Number(profile.store_id) !== parsed.storeId)) {
    return NextResponse.json({ error: 'Acesso negado para esta loja.' }, { status: 403 })
  }

  const admin: any = createAdminClient({ noStore: true })
  const { data: store, error } = await admin.from('stores').select('id, tenant_id').eq('id', parsed.storeId).maybeSingle()
  if (error || !store || store.tenant_id !== profile.tenant_id) {
    return NextResponse.json({ error: 'Acesso negado para esta loja.' }, { status: 403 })
  }

  const issued = issueLensSegmentToken(parsed.storeId, secret)
  return NextResponse.json({
    token: issued.token,
    expiresAt: issued.exp,
    segmentUrl: `${segmentUrl}/v1/segment`,
  })
}
