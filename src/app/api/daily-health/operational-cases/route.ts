import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { hasDailyHealthManagerGrant } from '@/lib/daily-health-access'

async function allowed(storeId: number) {
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return false
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null } | null
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) return false
  return hasDailyHealthManagerGrant(storeId)
}

function selectedIds(value: string | null) {
  return [...new Set(String(value || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 100)
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = Number(url.searchParams.get('storeId'))
  const ids = selectedIds(url.searchParams.get('ids'))
  if (!Number.isInteger(storeId) || storeId <= 0 || !ids.length) return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
  if (!(await allowed(storeId))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })

  const admin = createAdminClient({ noStore: true })
  const { data, error } = await (admin.from('service_orders') as any)
    .select('id,venda_id,dt_prometido_para,dt_lente_chegou,dt_montado_em,customers(full_name),dependente:dependentes(full_name)')
    .eq('store_id', storeId)
    .in('id', ids)

  if (error) {
    console.error('[Daily health] unable to load operational cases', error)
    return NextResponse.json({ error: 'Não foi possível carregar os casos.' }, { status: 500 })
  }

  const rows = (data || []) as any[]
  const byId = new Map<number, any>(rows.map((item) => [Number(item.id), item]))
  const cases = ids.flatMap((id) => {
    const item = byId.get(id)
    if (!item) return []
    const customer = Array.isArray(item.customers) ? item.customers[0] : item.customers
    const dependent = Array.isArray(item.dependente) ? item.dependente[0] : item.dependente
    return [{
      id: Number(item.id),
      saleId: Number(item.venda_id),
      customerName: customer?.full_name || 'Cliente não identificado',
      patientName: dependent?.full_name || customer?.full_name || 'Paciente não identificado',
      promisedAt: item.dt_prometido_para || null,
      lensArrivedAt: item.dt_lente_chegou || null,
      mountedAt: item.dt_montado_em || null,
    }]
  })

  return NextResponse.json({ cases }, { headers: { 'Cache-Control': 'private, no-store' } })
}
