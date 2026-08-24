import { NextResponse } from 'next/server'

import { getProfileByAdmin, createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

const TARGET_STORE_ID = 1

async function getAuthorizedUser() {
  const authClient = createClient()
  const { data: { user } } = await authClient.auth.getUser()
  if (!user) return null

  const profile = await getProfileByAdmin(user.id) as { role?: string | null; store_id?: number | null } | null
  if (!profile || (profile.role !== 'admin' && (profile.role !== 'manager' || profile.store_id !== TARGET_STORE_ID))) return null
  return user
}

export async function POST(request: Request) {
  const user = await getAuthorizedUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const body = await request.json().catch(() => ({})) as { version?: unknown }
  const version = typeof body.version === 'string' ? body.version.trim() : ''
  if (!version || version.length > 32) return NextResponse.json({ error: 'Versão inválida' }, { status: 400 })

  const supabase = createAdminClient()
  const { error } = await (supabase.from('version_history_clicks') as any).insert({
    store_id: TARGET_STORE_ID,
    version,
    user_id: user.id,
  })
  if (error) {
    console.error('[version-history-clicks] insert failed', error)
    return NextResponse.json({ error: 'Não foi possível registrar o clique' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function GET() {
  const user = await getAuthorizedUser()
  if (!user) return NextResponse.json({ error: 'Não autorizado' }, { status: 403 })

  const supabase = createAdminClient({ noStore: true })
  const { data, error } = await (supabase.from('version_history_clicks') as any)
    .select('version, clicked_at')
    .eq('store_id', TARGET_STORE_ID)
    .order('clicked_at', { ascending: false })
    .limit(500)
  if (error) {
    console.error('[version-history-clicks] query failed', error)
    return NextResponse.json({ error: 'Não foi possível consultar os cliques' }, { status: 500 })
  }

  const rows = (data ?? []) as Array<{ version: string; clicked_at: string }>
  const byVersion = rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.version] = (acc[row.version] ?? 0) + 1
    return acc
  }, {})

  return NextResponse.json({
    total: rows.length,
    byVersion,
    lastClickedAt: rows[0]?.clicked_at ?? null,
  })
}
