import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { DEFAULT_DAILY_HEALTH_SETTINGS, getDailyHealthSettings } from '@/lib/daily-store-health'

const settingsSchema = z.object({ storeId: z.number().int().positive(), overdueCriticalValue: z.number().min(0), minimumCostCoverage: z.number().min(0).max(1), labRequestHours: z.number().min(1).max(168) })

async function adminFor(storeId: number) {
  const auth = createClient()
  const { data: { user } } = await auth.auth.getUser()
  if (!user) return null
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null; tenant_id?: string | null } | null
  return profile?.role === 'admin' && (profile.store_id == null || Number(profile.store_id) === storeId) ? { user, profile } : null
}

export async function GET(request: Request) {
  const storeId = Number(new URL(request.url).searchParams.get('storeId'))
  if (!Number.isInteger(storeId) || !(await adminFor(storeId))) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  return NextResponse.json({ settings: await getDailyHealthSettings(storeId) })
}

export async function PUT(request: Request) {
  const body = settingsSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'Parametros invalidos.' }, { status: 400 })
  const context = await adminFor(body.data.storeId)
  if (!context?.profile.tenant_id) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 })
  const settings = { ...DEFAULT_DAILY_HEALTH_SETTINGS, overdueCriticalValue: body.data.overdueCriticalValue, minimumCostCoverage: body.data.minimumCostCoverage, labRequestHours: body.data.labRequestHours }
  const admin = createAdminClient()
  const { error } = await (admin.from('daily_store_health_settings') as any).upsert({ tenant_id: context.profile.tenant_id, store_id: body.data.storeId, settings, updated_at: new Date().toISOString(), updated_by_user_id: context.user.id }, { onConflict: 'store_id' })
  if (error) return NextResponse.json({ error: 'Nao foi possivel salvar parametros.' }, { status: 500 })
  return NextResponse.json({ settings })
}
