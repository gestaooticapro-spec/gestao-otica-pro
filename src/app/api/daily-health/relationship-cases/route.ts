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

function first(value: any) {
  return Array.isArray(value) ? value[0] : value
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = Number(url.searchParams.get('storeId'))
  const ids = selectedIds(url.searchParams.get('ids'))
  const alertId = String(url.searchParams.get('alertId') || '')
  if (!Number.isInteger(storeId) || storeId <= 0 || !ids.length) return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
  if (!(await allowed(storeId))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })

  const admin = createAdminClient({ noStore: true })
  const [{ data: postSales, error: postSalesError }, { data: interactions, error: interactionsError }, { data: followups, error: followupsError }] = await Promise.all([
    (admin.from('post_sales') as any)
      .select('id,status,service_order_id,avaliacao_cliente,created_at,updated_at,service_orders!inner(id,customers(full_name,fone_movel,phone),dependente:dependentes(full_name))')
      .eq('store_id', storeId)
      .in('id', ids),
    (admin.from('post_sales_interactions') as any)
      .select('post_sales_id,tipo_contato,resumo,created_at')
      .eq('store_id', storeId)
      .in('post_sales_id', ids)
      .order('created_at', { ascending: false }),
    (admin.from('whatsapp_post_sale_followups') as any)
      .select('post_sales_id,status,sent_at,created_at')
      .eq('store_id', storeId)
      .in('post_sales_id', ids)
      .order('created_at', { ascending: false }),
  ])
  if (postSalesError || interactionsError || followupsError) {
    console.error('[Daily health] unable to load relationship cases', { postSalesError, interactionsError, followupsError })
    return NextResponse.json({ error: 'Não foi possível carregar os casos.' }, { status: 500 })
  }

  const latestInteraction = new Map<number, any>()
  for (const interaction of (interactions || []) as any[]) if (!latestInteraction.has(Number(interaction.post_sales_id))) latestInteraction.set(Number(interaction.post_sales_id), interaction)
  const latestFollowup = new Map<number, any>()
  for (const followup of (followups || []) as any[]) if (!latestFollowup.has(Number(followup.post_sales_id))) latestFollowup.set(Number(followup.post_sales_id), followup)
  const byId = new Map<number, any>(((postSales || []) as any[]).map((item) => [Number(item.id), item]))
  const cases = ids.flatMap((id) => {
    const item = byId.get(id)
    if (!item) return []
    const order = first(item.service_orders)
    const customer = first(order?.customers)
    const dependent = first(order?.dependente)
    const interaction = latestInteraction.get(id)
    const followup = latestFollowup.get(id)
    const phone = String(customer?.fone_movel || customer?.phone || '').replace(/\D/g, '')
    const reason = alertId === 'post-sales-human-review'
      ? 'Resposta aguardando revisão humana'
      : alertId === 'post-sales-delivery'
        ? !phone ? 'Sem telefone válido' : !followup ? 'Sem tentativa de contato registrada' : followup.status === 'failed' ? 'Falha no envio da mensagem' : 'Contato ainda não confirmado'
        : Number(item.avaliacao_cliente) > 0 && Number(item.avaliacao_cliente) <= 2 ? `Nota ${item.avaliacao_cliente} registrada` : 'Relato de insatisfação ou adaptação'
    return [{
      id: Number(item.id),
      serviceOrderId: Number(item.service_order_id),
      customerName: customer?.full_name || 'Cliente não identificado',
      patientName: dependent?.full_name || customer?.full_name || 'Paciente não identificado',
      reason,
      summary: interaction?.resumo || null,
      interactionAt: interaction?.created_at || null,
      updatedAt: item.updated_at || item.created_at || null,
    }]
  })

  return NextResponse.json({ cases }, { headers: { 'Cache-Control': 'private, no-store' } })
}
