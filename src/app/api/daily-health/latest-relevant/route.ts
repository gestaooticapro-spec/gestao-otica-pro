import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { hasDailyHealthManagerGrant } from '@/lib/daily-health-access'

const areas = new Set(['financeiro', 'operacao', 'relacionamento', 'cadastros'])

async function allowed(storeId: number) {
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return false
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null } | null
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) return false
  return hasDailyHealthManagerGrant(storeId)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = Number(url.searchParams.get('storeId'))
  const area = String(url.searchParams.get('area') || '')
  if (!Number.isInteger(storeId) || storeId <= 0 || !areas.has(area)) return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
  if (!(await allowed(storeId))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })

  const admin = createAdminClient({ noStore: true })
  const { data, error } = await (admin.from('daily_store_health_reports') as any)
    .select('report_date,metrics,alerts')
    .eq('store_id', storeId)
    .eq('cadence', 'daily')
    .eq('status', 'ready')
    .order('report_date', { ascending: false })
    .limit(365)
  if (error) {
    console.error('[Daily health] unable to load latest relevant message', error)
    return NextResponse.json({ error: 'Nao foi possivel carregar a ultima atualizacao relevante.' }, { status: 500 })
  }

  for (const row of (data || []) as any[]) {
    const alerts = (Array.isArray(row.alerts) ? row.alerts : []).filter((alert: any) => alert?.area === area && (alert.lifecycle?.show ?? true))
    if (!alerts.length) continue
    return NextResponse.json({
      reportDate: row.report_date,
      narrative: row.metrics?.areaNarratives?.[area] || null,
      alerts: alerts.map((alert: any) => ({
        id: alert.id,
        priority: alert.priority,
        title: alert.presentation?.title || alert.title,
        detail: alert.presentation?.detail || alert.detail,
      })),
    }, { headers: { 'Cache-Control': 'private, no-store' } })
  }

  return NextResponse.json({ reportDate: null, narrative: null, alerts: [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
