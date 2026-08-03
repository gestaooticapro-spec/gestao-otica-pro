import { NextResponse } from 'next/server'
import { getStoreBillingStatus } from '@/lib/billing/integracao-asaas'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const storeId = Number(new URL(request.url).searchParams.get('storeId'))
  if (!Number.isInteger(storeId) || storeId <= 0) return NextResponse.json({ error: 'Loja invalida.' }, { status: 400 })

  try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Nao autenticado.' }, { status: 401 })

    const profile = await getProfileByAdmin(user.id) as { role?: string | null; store_id?: number | null } | null
    if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) {
      return NextResponse.json({ error: 'Acesso negado para esta loja.' }, { status: 403 })
    }

    return NextResponse.json(await getStoreBillingStatus(storeId))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao consultar cobranca.'
    return NextResponse.json({ error: message }, { status: 503 })
  }
}
