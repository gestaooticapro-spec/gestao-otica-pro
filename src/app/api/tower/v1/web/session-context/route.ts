import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { authenticateTowerDeviceWebSessionToken } from '@/lib/server/tower-device-web-session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const QuerySchema = z.object({
  storeId: z.coerce.number().int().positive(),
  sessionId: z.string().uuid(),
})

function bearerToken(request: NextRequest) {
  const authorization = request.headers.get('authorization') ?? ''
  return authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
}

export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: 'Sessao da Torre invalida.' }, { status: 400 })
  }

  const token = bearerToken(request)
  if (!token) {
    return NextResponse.json({ success: false, message: 'Torre nao autenticada.' }, { status: 401 })
  }

  const auth = await authenticateTowerDeviceWebSessionToken(token, parsed.data.storeId)
  if (!auth.ok) return NextResponse.json({ success: false, message: auth.message }, { status: 401 })

  const admin = createAdminClient()
  const sessions = admin.from('tower_sessions') as any
  const { data: session, error } = await sessions
    .select('*')
    .eq('id', parsed.data.sessionId)
    .eq('store_id', parsed.data.storeId)
    .maybeSingle()

  if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 })
  if (!session) return NextResponse.json({ success: false, message: 'Sessao nao encontrada.' }, { status: 404 })

  let customer: { id: number; full_name: string; fone_movel: string | null } | null = null
  if (session.customer_id) {
    const customers = admin.from('customers') as any
    const { data } = await customers
      .select('id, full_name, fone_movel')
      .eq('id', session.customer_id)
      .eq('store_id', parsed.data.storeId)
      .maybeSingle()
    customer = data ?? null
  }

  let evaluation: { id: number; recommended_items: unknown[] | null } | null = null
  if (session.optical_evaluation_id) {
    const evaluations = admin.from('optical_evaluations') as any
    const { data } = await evaluations
      .select('id, recommended_items')
      .eq('id', session.optical_evaluation_id)
      .eq('store_id', parsed.data.storeId)
      .eq('tenant_id', auth.tenantId)
      .maybeSingle()
    evaluation = data ?? null
  }

  return NextResponse.json({
    success: true,
    message: 'Contexto da sessao carregado.',
    data: { session, customer, evaluation },
  })
}
