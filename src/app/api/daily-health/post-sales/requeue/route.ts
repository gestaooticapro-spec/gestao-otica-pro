import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getProfileByAdmin } from '@/lib/supabase/admin'
import { hasDailyHealthManagerGrant } from '@/lib/daily-health-access'
import { generateDailyStoreHealthReport } from '@/lib/daily-store-health'
import { requeuePostSalesForDailyHealth } from '@/lib/whatsapp/post-sale-followups'

const inputSchema = z.object({ storeId: z.coerce.number().int().positive() })

async function allowed(storeId: number) {
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return false
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null } | null
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) return false
  return await hasDailyHealthManagerGrant(storeId)
}

export async function POST(request: Request) {
  const body = inputSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: 'storeId invalido' }, { status: 400 })
  if (!(await allowed(body.data.storeId))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })

  try {
    const result = await requeuePostSalesForDailyHealth(body.data.storeId)
    await generateDailyStoreHealthReport(body.data.storeId, undefined, { force: true })
    return NextResponse.json({ result }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[Daily health] failed to requeue post-sales', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Não foi possível recolocar os pós-vendas na fila.' }, { status: 500 })
  }
}
