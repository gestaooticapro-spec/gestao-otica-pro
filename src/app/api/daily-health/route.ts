import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { hasDailyHealthManagerGrant } from '@/lib/daily-health-access'
import { generateDailyStoreHealthReport, generatePeriodicStoreHealthSnapshot, getLatestDailyStoreHealthReport } from '@/lib/daily-store-health'

const storeSchema = z.coerce.number().int().positive()
// Mantém os relatórios agendados pelo cron, mas bloqueia recalculos manuais temporariamente.
const MANUAL_DAILY_HEALTH_REFRESH_ENABLED = false

async function allowed(storeId: number) {
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return false
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null } | null
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) return false
  return await hasDailyHealthManagerGrant(storeId)
}

export async function GET(request: Request) {
  const storeId = storeSchema.safeParse(new URL(request.url).searchParams.get('storeId'))
  if (!storeId.success) return NextResponse.json({ error: 'storeId invalido' }, { status: 400 })
  if (!(await allowed(storeId.data))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })
  return NextResponse.json({ report: await getLatestDailyStoreHealthReport(storeId.data) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  if (!MANUAL_DAILY_HEALTH_REFRESH_ENABLED) {
    return NextResponse.json({ error: 'A atualização manual dos Pontos de Atenção está temporariamente desativada.' }, { status: 503 })
  }
  const body = z.object({ storeId: storeSchema, monthlyPreview: z.boolean().optional() }).safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'storeId invalido' }, { status: 400 })
  if (!(await allowed(body.data.storeId))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })
  try {
    const report = await generateDailyStoreHealthReport(body.data.storeId, undefined, { force: true })
    const monthlySnapshot = body.data.monthlyPreview
      ? await generatePeriodicStoreHealthSnapshot(body.data.storeId, 'monthly', report.reportDate, { allowOpenMonthly: true, persist: false })
      : null
    return NextResponse.json({ report, monthlySnapshot }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[Daily health] manual generation failed', error)
    return NextResponse.json({ error: 'Nao foi possivel atualizar o resumo.' }, { status: 500 })
  }
}
