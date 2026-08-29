import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { getDailyHealthManagerGrant } from '@/lib/daily-health-access'
import { customerDuplicateCandidates, productDuplicateCandidates, type DuplicateIssueType } from '@/lib/daily-health-data-quality'
import { buildMergeFieldComplements, buildMergeFieldConflicts, mergeDependenciesFor } from '@/lib/daily-health-merge-preview'

const kindSchema = z.enum(['duplicate-customers', 'duplicate-products', 'products-without-cost', 'stale-open-sales'])
const batchSize = 10

async function authorization(storeId: number) {
  const client = createClient()
  const { data: { user } } = await client.auth.getUser()
  if (!user) return null
  const profile = await getProfileByAdmin(user.id) as { role?: string; store_id?: number | null; tenant_id?: string } | null
  if (!profile?.tenant_id || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)) return null
  const grant = await getDailyHealthManagerGrant(storeId)
  if (!grant) return null
  return { userId: user.id, tenantId: profile.tenant_id, employeeId: grant.employeeId }
}

async function allRows(load: (from: number, to: number) => PromiseLike<any>) {
  const rows: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await load(from, from + 999)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < 1000) return rows
  }
}

function idsFromQuery(value: string | null) {
  return [...new Set(String(value || '').split(',').map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 500)
}

function first(value: any) {
  return Array.isArray(value) ? value[0] : value
}

async function duplicateQueue(admin: ReturnType<typeof createAdminClient>, storeId: number, issueType: DuplicateIssueType) {
  const isCustomer = issueType === 'duplicate_customer'
  const [records, reviews] = await Promise.all([
    isCustomer
      ? allRows((from, to) => (admin.from('customers') as any).select('id,full_name,cpf,fone_movel,phone,email,created_at').eq('store_id', storeId).range(from, to))
      : allRows((from, to) => (admin.from('products') as any).select('id,nome,marca,referencia,codigo_barras,tipo_produto,preco_custo,preco_venda,estoque_atual,created_at').eq('store_id', storeId).range(from, to)),
    allRows((from, to) => (admin.from('daily_health_data_quality_reviews') as any).select('fingerprint,decision,deferred_until').eq('store_id', storeId).eq('issue_type', issueType).range(from, to)),
  ])
  const candidates = isCustomer ? customerDuplicateCandidates(records) : productDuplicateCandidates(records)
  const today = new Date().toISOString().slice(0, 10)
  const hidden = new Set(reviews.filter((review) => review.decision === 'keep_separate' || (review.decision === 'defer' && String(review.deferred_until || '') >= today)).map((review) => String(review.fingerprint)))
  const pending = candidates.groups.filter((group) => !hidden.has(group.fingerprint))
  const selected = pending.slice(0, batchSize)
  const selectedIds = [...new Set(selected.flatMap((group) => group.ids))]
  const byId = new Map(records.map((record) => [Number(record.id), record]))
  const usage = new Map<number, { count: number; lastAt: string | null }>()
  if (selectedIds.length) {
    const rows = isCustomer
      ? await allRows((from, to) => (admin.from('vendas') as any).select('customer_id,data_fechamento,created_at').eq('store_id', storeId).in('customer_id', selectedIds).range(from, to))
      : await allRows((from, to) => (admin.from('venda_itens') as any).select('product_id,quantidade,vendas(data_fechamento,created_at)').eq('store_id', storeId).in('product_id', selectedIds).range(from, to))
    for (const row of rows) {
      const id = Number(isCustomer ? row.customer_id : row.product_id)
      const current = usage.get(id) || { count: 0, lastAt: null }
      const date = isCustomer ? row.data_fechamento || row.created_at : first(row.vendas)?.data_fechamento || first(row.vendas)?.created_at
      current.count += isCustomer ? 1 : Number(row.quantidade || 0)
      if (date && (!current.lastAt || String(date) > current.lastAt)) current.lastAt = String(date)
      usage.set(id, current)
    }
  }
  return {
    totalGroups: pending.length,
    totalRecords: new Set(pending.flatMap((group) => group.ids)).size,
    groups: selected.map((group) => ({
      ...group,
      records: group.ids.map((id) => ({ ...byId.get(id), usageCount: usage.get(id)?.count || 0, lastUsageAt: usage.get(id)?.lastAt || null })),
    })),
  }
}

async function mergePreview(admin: ReturnType<typeof createAdminClient>, storeId: number, issueType: DuplicateIssueType, fingerprint: string, targetId: number) {
  const isCustomer = issueType === 'duplicate_customer'
  const groupingRecords = isCustomer
    ? await allRows((from, to) => (admin.from('customers') as any).select('id,full_name,cpf,fone_movel,phone').eq('store_id', storeId).range(from, to))
    : await allRows((from, to) => (admin.from('products') as any).select('id,nome,marca,referencia').eq('store_id', storeId).range(from, to))
  const groups = isCustomer ? customerDuplicateCandidates(groupingRecords).groups : productDuplicateCandidates(groupingRecords).groups
  const group = groups.find((candidate) => candidate.fingerprint === fingerprint)
  if (!group || !group.ids.includes(targetId)) return null

  const table = isCustomer ? 'customers' : 'products'
  const { data: records, error: recordsError } = await (admin.from(table) as any).select('*').eq('store_id', storeId).in('id', group.ids)
  if (recordsError) throw recordsError
  const sourceIds = group.ids.filter((id) => id !== targetId)
  const dependencies = mergeDependenciesFor(issueType)
  const dependencySummary = await Promise.all(dependencies.map(async (dependency) => {
    const sourceQuery = (admin.from(dependency.table as any) as any).select('*', { count: 'exact', head: true }).in(dependency.column, sourceIds)
    const targetQuery = (admin.from(dependency.table as any) as any).select('*', { count: 'exact', head: true }).eq(dependency.column, targetId)
    const [sourceResult, targetResult] = await Promise.all([sourceQuery, targetQuery])
    if (sourceResult.error) throw sourceResult.error
    if (targetResult.error) throw targetResult.error
    return {
      table: dependency.table,
      column: dependency.column,
      label: dependency.label,
      sourceCount: Number(sourceResult.count || 0),
      targetCount: Number(targetResult.count || 0),
      collision: dependency.collision || null,
    }
  }))
  const fieldConflicts = buildMergeFieldConflicts(issueType, records || [])
  const fieldComplements = buildMergeFieldComplements(issueType, records || [], targetId)
  const blockers = fieldConflicts
    .filter((conflict) => conflict.severity === 'blocker')
    .map((conflict) => `${conflict.label} possui valores diferentes`)
  const wallet = dependencySummary.find((item) => item.collision === 'customer_wallet')
  if (wallet && wallet.sourceCount + wallet.targetCount > 1) blockers.push('Mais de uma carteira de crédito precisará ser consolidada')
  const stockPlan = issueType === 'duplicate_product'
    ? {
        targetStock: Number((records || []).find((record: any) => Number(record.id) === targetId)?.estoque_atual || 0),
        sourceStock: (records || []).filter((record: any) => Number(record.id) !== targetId).reduce((total: number, record: any) => total + Number(record.estoque_atual || 0), 0),
      }
    : null

  return {
    issueType,
    fingerprint,
    targetId,
    sourceIds,
    targetLabel: isCustomer
      ? (records || []).find((record: any) => Number(record.id) === targetId)?.full_name
      : (records || []).find((record: any) => Number(record.id) === targetId)?.nome,
    referencesToMove: dependencySummary.reduce((total, item) => total + item.sourceCount, 0),
    dependencies: dependencySummary.filter((item) => item.sourceCount > 0 || item.targetCount > 0),
    fieldConflicts,
    fieldComplements,
    blockers,
    stockPlan: stockPlan ? { ...stockPlan, resultingStock: stockPlan.targetStock + stockPlan.sourceStock } : null,
    executable: blockers.length === 0,
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const storeId = Number(url.searchParams.get('storeId'))
  const kind = kindSchema.safeParse(url.searchParams.get('kind'))
  if (!Number.isInteger(storeId) || storeId <= 0 || !kind.success) return NextResponse.json({ error: 'Parametros invalidos' }, { status: 400 })
  if (!(await authorization(storeId))) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })
  const admin = createAdminClient({ noStore: true })
  try {
    if (url.searchParams.get('history') === 'merges') {
      const issueType = kind.data === 'duplicate-customers' ? 'duplicate_customer' : kind.data === 'duplicate-products' ? 'duplicate_product' : null
      if (!issueType) return NextResponse.json({ error: 'Historico disponivel apenas para duplicidades.' }, { status: 400 })
      const [{ data: events, error: eventsError }, { data: reversals, error: reversalsError }] = await Promise.all([
        (admin.from('daily_health_data_quality_review_events') as any)
          .select('operation_key,target_record_id,record_ids,before_data,after_data,created_at')
          .eq('store_id', storeId).eq('issue_type', issueType)
          .in('action', ['merge_customer', 'merge_product'])
          .order('created_at', { ascending: false }).limit(10),
        (admin.from('daily_health_data_quality_review_events') as any)
          .select('reversal_of_operation_key')
          .eq('store_id', storeId).not('reversal_of_operation_key', 'is', null),
      ])
      if (eventsError) throw eventsError
      if (reversalsError) throw reversalsError
      const reversed = new Set((reversals || []).map((event: any) => String(event.reversal_of_operation_key)))
      const merges = (events || []).map((event: any) => {
        const records = Array.isArray(event.before_data?.records) ? event.before_data.records : []
        const target = records.find((record: any) => Number(record.id) === Number(event.target_record_id))
        return {
          operationKey: String(event.operation_key),
          targetId: Number(event.target_record_id),
          targetLabel: issueType === 'duplicate_customer' ? target?.full_name : target?.nome,
          removedIds: (Array.isArray(event.after_data?.removedIds) ? event.after_data.removedIds : event.record_ids || []).map(Number).filter((id: number) => id > 0 && id !== Number(event.target_record_id)),
          createdAt: event.created_at,
          reversed: reversed.has(String(event.operation_key)),
          recoverable: Boolean(event.after_data?.targetRecord),
        }
      })
      return NextResponse.json({ merges }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    if (url.searchParams.get('preview') === 'merge') {
      const issueType = kind.data === 'duplicate-customers' ? 'duplicate_customer' : kind.data === 'duplicate-products' ? 'duplicate_product' : null
      const fingerprint = String(url.searchParams.get('fingerprint') || '')
      const targetId = Number(url.searchParams.get('targetId'))
      if (!issueType || fingerprint.length < 5 || !Number.isInteger(targetId) || targetId <= 0) return NextResponse.json({ error: 'Parametros da previa invalidos' }, { status: 400 })
      const preview = await mergePreview(admin, storeId, issueType, fingerprint, targetId)
      if (!preview) return NextResponse.json({ error: 'Este grupo mudou e precisa ser carregado novamente.' }, { status: 409 })
      return NextResponse.json({ preview }, { headers: { 'Cache-Control': 'private, no-store' } })
    }
    if (kind.data === 'duplicate-customers') return NextResponse.json(await duplicateQueue(admin, storeId, 'duplicate_customer'), { headers: { 'Cache-Control': 'private, no-store' } })
    if (kind.data === 'duplicate-products') return NextResponse.json(await duplicateQueue(admin, storeId, 'duplicate_product'), { headers: { 'Cache-Control': 'private, no-store' } })

    const ids = idsFromQuery(url.searchParams.get('ids'))
    if (kind.data === 'products-without-cost') {
      if (!ids.length) return NextResponse.json({ cases: [], totalRecords: 0 })
      const { data, error } = await (admin.from('products') as any)
        .select('id,nome,marca,referencia,tipo_produto,preco_custo,preco_venda,estoque_atual')
        .eq('store_id', storeId)
        .in('id', ids)
      if (error) throw error
      const byId = new Map(((data || []) as any[]).filter((record) => Number(record.preco_custo || 0) <= 0).map((record) => [Number(record.id), record]))
      const pendingIds = ids.filter((id) => byId.has(id))
      return NextResponse.json({ totalRecords: pendingIds.length, cases: pendingIds.slice(0, batchSize).map((id) => byId.get(id)) }, { headers: { 'Cache-Control': 'private, no-store' } })
    }

    if (!ids.length) return NextResponse.json({ totalRecords: 0, cases: [] })
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data, error } = await (admin.from('vendas') as any)
      .select('id,created_at,valor_final,valor_total,customers(full_name),employees(full_name)')
      .eq('store_id', storeId)
      .eq('status', 'Em Aberto')
      .in('id', ids)
      .lt('created_at', cutoff)
      .order('created_at', { ascending: true })
      .limit(100)
    if (error) throw error
    const cases = ((data || []) as any[]).map((sale) => ({
      id: Number(sale.id),
      createdAt: sale.created_at,
      value: Number(sale.valor_final || sale.valor_total || 0),
      customerName: first(sale.customers)?.full_name || 'Cliente não identificado',
      employeeName: first(sale.employees)?.full_name || null,
    }))
    return NextResponse.json({ totalRecords: cases.length, cases }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('[Daily health] unable to load data quality cases', error)
    return NextResponse.json({ error: 'Não foi possível carregar os casos cadastrais.' }, { status: 500 })
  }
}

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review_duplicate'), storeId: z.number().int().positive(), issueType: z.enum(['duplicate_customer', 'duplicate_product']), fingerprint: z.string().min(5).max(1000), recordIds: z.array(z.number().int().positive()).min(2).max(100), decision: z.enum(['keep_separate', 'defer']) }),
  z.object({ action: z.literal('execute_merge'), storeId: z.number().int().positive(), issueType: z.enum(['duplicate_customer', 'duplicate_product']), fingerprint: z.string().min(5).max(1000), recordIds: z.array(z.number().int().positive()).min(2).max(100), targetId: z.number().int().positive(), operationKey: z.string().uuid() }),
  z.object({ action: z.literal('undo_merge'), storeId: z.number().int().positive(), mergeOperationKey: z.string().uuid(), undoOperationKey: z.string().uuid() }),
  z.object({ action: z.literal('update_product_cost'), storeId: z.number().int().positive(), productId: z.number().int().positive(), cost: z.number().positive().max(100000000) }),
])

export async function POST(request: Request) {
  const parsed = actionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: 'Dados invalidos' }, { status: 400 })
  const auth = await authorization(parsed.data.storeId)
  if (!auth) return NextResponse.json({ error: 'PIN de gerente necessario' }, { status: 403 })
  const admin = createAdminClient({ noStore: true })
  const action = parsed.data
  const { storeId } = action
  try {
    if (action.action === 'undo_merge') {
      const { data: result, error: undoError } = await (admin.rpc as any)('undo_daily_health_record_merge', {
        p_tenant_id: auth.tenantId,
        p_store_id: storeId,
        p_merge_operation_key: action.mergeOperationKey,
        p_undo_operation_key: action.undoOperationKey,
        p_actor_user_id: auth.userId,
        p_actor_employee_id: auth.employeeId,
      })
      if (undoError) {
        const message = String(undoError.message || '')
        const expectedConflict = ['foi alterado depois', 'ja foi desfeita', 'nao permite recuperacao', 'ja foi recriado', 'nao existe mais']
          .some((fragment) => message.includes(fragment))
        if (expectedConflict) return NextResponse.json({ error: message }, { status: 409 })
        throw undoError
      }
      return NextResponse.json({ success: true, result })
    }

    if (action.action === 'execute_merge') {
      const preview = await mergePreview(admin, storeId, action.issueType, action.fingerprint, action.targetId)
      const requestedIds = [...new Set(action.recordIds)].sort((a, b) => a - b)
      const currentIds = preview ? [preview.targetId, ...preview.sourceIds].sort((a, b) => a - b) : []
      if (!preview || requestedIds.join(',') !== currentIds.join(',')) {
        return NextResponse.json({ error: 'Este grupo mudou e precisa ser carregado novamente.' }, { status: 409 })
      }
      if (!preview.executable || preview.blockers.length) {
        return NextResponse.json({ error: `A mesclagem foi bloqueada: ${preview.blockers.join('; ')}` }, { status: 409 })
      }

      const { data: result, error: mergeError } = await (admin.rpc as any)('merge_daily_health_duplicate_records', {
        p_tenant_id: auth.tenantId,
        p_store_id: storeId,
        p_issue_type: action.issueType,
        p_fingerprint: action.fingerprint,
        p_target_id: action.targetId,
        p_source_ids: preview.sourceIds,
        p_operation_key: action.operationKey,
        p_actor_user_id: auth.userId,
        p_actor_employee_id: auth.employeeId,
      })
      if (mergeError) throw mergeError
      return NextResponse.json({ success: true, result })
    }

    if (action.action === 'review_duplicate') {
      const records = action.issueType === 'duplicate_customer'
        ? await allRows((from, to) => (admin.from('customers') as any).select('id,full_name,cpf,fone_movel,phone').eq('store_id', storeId).range(from, to))
        : await allRows((from, to) => (admin.from('products') as any).select('id,nome,marca,referencia').eq('store_id', storeId).range(from, to))
      const groups = action.issueType === 'duplicate_customer' ? customerDuplicateCandidates(records).groups : productDuplicateCandidates(records).groups
      const current = groups.find((group) => group.fingerprint === action.fingerprint)
      const requestedIds = [...action.recordIds].sort((a, b) => a - b)
      if (!current || current.ids.join(',') !== requestedIds.join(',')) return NextResponse.json({ error: 'Este grupo mudou e precisa ser carregado novamente.' }, { status: 409 })
      const deferredUntil = action.decision === 'defer' ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) : null
      const review = {
        tenant_id: auth.tenantId, store_id: storeId, issue_type: action.issueType, fingerprint: current.fingerprint,
        record_ids: current.ids, decision: action.decision, preferred_record_id: null, deferred_until: deferredUntil,
        decided_by_user_id: auth.userId, decided_by_employee_id: auth.employeeId, updated_at: new Date().toISOString(),
      }
      const { error: reviewError } = await (admin.from('daily_health_data_quality_reviews') as any).upsert(review, { onConflict: 'store_id,issue_type,fingerprint' })
      if (reviewError) throw reviewError
      const { error: eventError } = await (admin.from('daily_health_data_quality_review_events') as any).insert({
        tenant_id: auth.tenantId, store_id: storeId, issue_type: action.issueType, fingerprint: current.fingerprint,
        record_ids: current.ids, action: action.decision, after_data: review,
        actor_user_id: auth.userId, actor_employee_id: auth.employeeId,
      })
      if (eventError) throw eventError
      return NextResponse.json({ success: true })
    }

    const { data: product, error: productError } = await (admin.from('products') as any)
      .select('id,nome,preco_custo').eq('store_id', storeId).eq('id', action.productId).maybeSingle()
    if (productError) throw productError
    if (!product) return NextResponse.json({ error: 'Produto não encontrado.' }, { status: 404 })
    const roundedCost = Math.round(action.cost * 100) / 100
    const { error: updateError } = await (admin.from('products') as any).update({ preco_custo: roundedCost }).eq('store_id', storeId).eq('id', action.productId)
    if (updateError) throw updateError
    const { error: eventError } = await (admin.from('daily_health_data_quality_review_events') as any).insert({
      tenant_id: auth.tenantId, store_id: storeId, issue_type: 'product_without_cost', record_ids: [action.productId], action: 'update_cost',
      before_data: { preco_custo: product.preco_custo }, after_data: { preco_custo: roundedCost }, actor_user_id: auth.userId, actor_employee_id: auth.employeeId,
    })
    if (eventError) throw eventError
    return NextResponse.json({ success: true, cost: roundedCost })
  } catch (error) {
    console.error('[Daily health] unable to apply data quality action', error)
    const errorMessage = action.action === 'execute_merge'
      ? 'Não foi possível concluir a mesclagem. Nenhum cadastro foi alterado parcialmente.'
      : action.action === 'undo_merge'
        ? 'Não foi possível desfazer a mesclagem. Nenhum cadastro foi restaurado parcialmente.'
        : 'Não foi possível salvar a decisão.'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
