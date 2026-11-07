import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const reasonSchema = z.enum(['falecimento', 'mudou_longe', 'outro'])
const mutationSchema = z.object({
  storeId: z.number().int().positive().safe(),
  customerId: z.number().int().positive().safe(),
  reason: reasonSchema.optional(),
  note: z.string().trim().max(500).optional().default(''),
}).strict()

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function authorizeStore(storeId: number) {
  const auth = createClient()
  const { data: { user }, error } = await auth.auth.getUser()
  if (error || !user) return { response: json({ error: 'Sua sessão terminou. Entre novamente no sistema.' }, 401) }

  const profile = await getProfileByAdmin(user.id) as { role?: string | null; store_id?: number | null; tenant_id?: string | null } | null
  if (!profile || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) {
    return { response: json({ error: 'Acesso negado para esta loja.' }, 403) }
  }

  const admin = createAdminClient()
  const { data: store, error: storeError } = await (admin.from('stores') as any)
    .select('id, tenant_id')
    .eq('id', storeId)
    .maybeSingle()
  if (storeError) return { response: json({ error: 'Não foi possível verificar a loja.' }, 503) }
  if (!store) return { response: json({ error: 'Loja não encontrada.' }, 404) }

  return { user, profile, store, admin }
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams
  const storeId = Number(params.get('storeId'))
  if (!Number.isSafeInteger(storeId) || storeId <= 0) return json({ error: 'Loja inválida.' }, 400)

  const auth = await authorizeStore(storeId)
  if ('response' in auth) return auth.response

  const from = params.get('from') || null
  const to = params.get('to') || null
  const validDate = (value: string | null) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
  if (!validDate(from) || !validDate(to) || (from && to && from > to)) return json({ error: 'Faixa de datas inválida.' }, 400)

  const phoneFilter = params.get('phone') || 'all'
  const spcFilter = params.get('spc') || 'all'
  if (!['all', 'has', 'missing'].includes(phoneFilter) || !['all', 'yes', 'no'].includes(spcFilter)) {
    return json({ error: 'Um dos filtros é inválido.' }, 400)
  }
  const page = Math.max(1, Number(params.get('page') || 1))
  if (!Number.isSafeInteger(page)) return json({ error: 'Página inválida.' }, 400)
  const showExcluded = params.get('showExcluded') === 'true'
  const search = (params.get('search') || '').trim().slice(0, 120)
  const sort = params.get('sort') || 'last_purchase_asc'
  const allowedSorts = ['name_asc', 'name_desc', 'last_purchase_asc', 'last_purchase_desc', 'city_asc', 'city_desc', 'total_spent_desc']
  if (!allowedSorts.includes(sort)) return json({ error: 'A classificação é inválida.' }, 400)

  const { data, error } = await (auth.admin as any).rpc('search_inactive_customers', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
    p_phone_filter: phoneFilter,
    p_spc_filter: spcFilter,
    p_search: search,
    p_show_excluded: showExcluded,
    p_page_size: 50,
    p_page_offset: (page - 1) * 50,
    p_sort: sort,
  })
  if (error) {
    console.error('Erro ao buscar clientes inativos:', error.message)
    return json({ error: 'Não foi possível carregar a lista de clientes.' }, 503)
  }

  const items = data || []
  return json({ items, total: Number(items[0]?.total_count || 0), page, pageSize: 50 })
}

async function mutateExclusion(request: Request, restore: boolean) {
  const origin = request.headers.get('origin')
  if (origin && origin !== new URL(request.url).origin) return json({ error: 'Origem não permitida.' }, 403)

  let body: unknown
  try { body = await request.json() } catch { return json({ error: 'Não foi possível ler a solicitação.' }, 400) }
  const parsed = mutationSchema.safeParse(body)
  if (!parsed.success || (!restore && !parsed.data.reason)) return json({ error: 'Confira os dados da solicitação.' }, 400)

  const { storeId, customerId, reason, note } = parsed.data
  const auth = await authorizeStore(storeId)
  if ('response' in auth) return auth.response

  const { data: customer, error: customerError } = await (auth.admin.from('customers') as any)
    .select('id')
    .eq('store_id', storeId)
    .eq('id', customerId)
    .maybeSingle()
  if (customerError) return json({ error: 'Não foi possível verificar o cliente.' }, 503)
  if (!customer) return json({ error: 'Cliente não encontrado nesta loja.' }, 404)

  if (restore) {
    const { error } = await (auth.admin as any).from('customer_inactive_exclusions')
      .delete()
      .eq('store_id', storeId)
      .eq('customer_id', customerId)
    if (error) return json({ error: 'Não foi possível restaurar o cliente na lista.' }, 503)
    return json({ success: true })
  }

  const { error } = await (auth.admin as any).from('customer_inactive_exclusions').upsert({
    tenant_id: auth.store.tenant_id,
    store_id: storeId,
    customer_id: customerId,
    reason,
    note: note || null,
    excluded_by: auth.user.id,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'store_id,customer_id' })
  if (error) return json({ error: 'Não foi possível tirar o cliente da lista.' }, 503)
  return json({ success: true })
}

export async function POST(request: Request) {
  return mutateExclusion(request, false)
}

export async function DELETE(request: Request) {
  return mutateExclusion(request, true)
}
