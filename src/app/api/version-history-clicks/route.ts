import { NextResponse } from 'next/server'

import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const AUDIT_STORE_ID = 1

type AuthorizedUser = {
  id: string
  profile: { role?: string | null; store_id?: number | null }
}

async function getAuthorizedUser(): Promise<AuthorizedUser | null> {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const profile = await getProfileByAdmin(user.id) as { role?: string | null; store_id?: number | null } | null
  if (!profile) return null
  return { id: user.id, profile }
}

function canViewAudit(user: AuthorizedUser) {
  return user.profile.role === 'admin' || (user.profile.role === 'manager' && Number(user.profile.store_id) === AUDIT_STORE_ID)
}

export async function POST(request: Request) {
  const user = await getAuthorizedUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { version?: unknown; storeId?: unknown }
  const version = typeof body.version === 'string' ? body.version.trim() : ''
  const storeId = typeof body.storeId === 'number' ? body.storeId : Number.NaN
  if (!version || version.length > 32) return NextResponse.json({ error: 'Versão inválida' }, { status: 400 })
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return NextResponse.json({ error: 'Loja inválida' }, { status: 400 })
  if (user.profile.role !== 'admin' && Number(user.profile.store_id) !== storeId) {
    return NextResponse.json({ error: 'Acesso negado para esta loja' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const { error } = await (supabase.from('version_history_clicks') as any).insert({
    store_id: storeId,
    version,
    user_id: user.id,
  })
  if (error) {
    console.error('[version-history-clicks] insert failed', error)
    return NextResponse.json({ error: 'Não foi possível registrar o clique' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET(request: Request) {
  const user = await getAuthorizedUser()
  if (!user || !canViewAudit(user)) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  const offset = Math.max(0, Number.parseInt(searchParams.get('offset') ?? '0', 10) || 0)
  const limit = Math.min(50, Math.max(1, Number.parseInt(searchParams.get('limit') ?? '10', 10) || 10))

  const supabase = createAdminClient({ noStore: true })
  const { data, error, count } = await (supabase.from('version_history_clicks') as any)
    .select('store_id, version, clicked_at, stores(name)', { count: 'exact' })
    .order('clicked_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (error) {
    console.error('[version-history-clicks] query failed', error)
    return NextResponse.json({ error: 'Não foi possível consultar os cliques' }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{
    store_id: number
    version: string
    clicked_at: string
    stores: { name: string | null } | null
  }>

  return NextResponse.json({
    entries: rows.map((row) => ({
      clickedAt: row.clicked_at,
      version: row.version,
      store: row.stores?.name?.trim() || `Loja ${row.store_id}`,
    })),
    total: count ?? 0,
    hasMore: offset + rows.length < (count ?? 0),
  })
}
