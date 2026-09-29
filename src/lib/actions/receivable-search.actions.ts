'use server'

import { createAdminClient, getProfileByAdmin } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { getInstallmentOutstanding } from '@/lib/installment-balance'

const CUSTOMER_PAGE_SIZE = 30
const INSTALLMENT_PAGE_SIZE = 500
const CLOSED_STATUSES = '("Pago","Quitado","Cancelado","Cancelada","pago","quitado","cancelado","cancelada")'

export type ReceivableSearchCursor = { name: string; id: number }

type ReceivableCustomerGroup = {
  cliente: any
  parcelas: any[]
}

type StoreAccessProfile = { role: string; store_id: number | null; tenant_id: string | null }

async function requireStoreAccess(storeId: number) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Usuario nao autenticado.')

  const profile = await getProfileByAdmin(user.id) as StoreAccessProfile | null
  const admin = createAdminClient({ noStore: true })
  const { data: store, error } = await (admin.from('stores') as any)
    .select('id, tenant_id')
    .eq('id', storeId)
    .maybeSingle()

  if (
    !profile?.tenant_id
    || error
    || !store
    || store.tenant_id !== profile.tenant_id
    || (profile.role !== 'admin' && Number(profile.store_id) !== storeId)
  ) {
    throw new Error('Acesso negado para esta loja.')
  }

  return admin
}

async function loadCustomerGroups(supabaseAdmin: ReturnType<typeof createAdminClient>, storeId: number, customerIds: number[]): Promise<ReceivableCustomerGroup[]> {
  if (customerIds.length === 0) return []

  const parcelasBrutas: any[] = []

  // A consulta e paginada para transporte, mas sempre carrega todas as parcelas
  // antes de calcular o total e verificar a existencia da proxima parcela.
  for (let from = 0; ; from += INSTALLMENT_PAGE_SIZE) {
    const { data, error } = await (supabaseAdmin.from('financiamento_parcelas') as any)
      .select(`
        id, numero_parcela, valor_parcela, valor_pago,
        valor_transferido_entrada, valor_transferido_saida, valor_renegociado_saida,
        data_vencimento, financiamento_id, customer_id, status,
        financiamento_loja (
          venda_id,
          vendas!financiamento_loja_venda_id_fkey (
            created_at, status,
            service_orders (dependente_id, dependentes (full_name))
          )
        ),
        customers!inner(id, full_name, cpf, cnpj, person_type)
      `)
      .eq('store_id', storeId)
      .eq('customers.store_id', storeId)
      .in('customer_id', customerIds)
      .gt('valor_parcela', 0.01)
      .not('status', 'in', CLOSED_STATUSES)
      .order('id', { ascending: true })
      .range(from, from + INSTALLMENT_PAGE_SIZE - 1)

    if (error) {
      console.error('[Recebimento] Erro ao carregar parcelas:', error)
      throw new Error('Nao foi possivel carregar as parcelas dos clientes.')
    }

    parcelasBrutas.push(...(data || []))
    if (!data || data.length < INSTALLMENT_PAGE_SIZE) break
  }

  const parcelas = parcelasBrutas.filter((parcela: any) =>
    !['pago', 'quitado', 'cancelado', 'cancelada'].includes(String(parcela.status || '').trim().toLowerCase())
    && String(parcela.financiamento_loja?.vendas?.status || '').trim().toLowerCase() !== 'cancelada'
  )
  const agrupado = new Map<number, ReceivableCustomerGroup>()
  const lastPendingInstallment = new Map<number, number>()

  for (const candidate of parcelas) {
    if (String(candidate.status || '').trim().toLowerCase() !== 'pendente') continue
    if (getInstallmentOutstanding(candidate) <= 0.01) continue
    const financingId = Number(candidate.financiamento_id)
    lastPendingInstallment.set(
      financingId,
      Math.max(lastPendingInstallment.get(financingId) ?? -Infinity, Number(candidate.numero_parcela))
    )
  }

  for (const parcela of parcelas) {
    const cliId = Number(parcela.customer_id)
    if (!agrupado.has(cliId)) {
      agrupado.set(cliId, { cliente: parcela.customers, parcelas: [] })
    }

    const venda = parcela.financiamento_loja?.vendas
    const nomeDependente = venda?.service_orders?.[0]?.dependentes?.full_name
    const nomeTitular = parcela.customers?.full_name
    const beneficiario = nomeDependente && nomeDependente !== nomeTitular ? nomeDependente : null

    agrupado.get(cliId)!.parcelas.push({
      id: parcela.id,
      numero_parcela: parcela.numero_parcela,
      valor_parcela: parcela.valor_parcela,
      valor_pago: parcela.valor_pago,
      valor_transferido_entrada: parcela.valor_transferido_entrada,
      valor_transferido_saida: parcela.valor_transferido_saida,
      valor_renegociado_saida: parcela.valor_renegociado_saida,
      has_next_installment: (lastPendingInstallment.get(Number(parcela.financiamento_id)) ?? -Infinity) > Number(parcela.numero_parcela),
      data_vencimento: parcela.data_vencimento,
      financiamento_id: parcela.financiamento_id,
      venda_id: parcela.financiamento_loja?.venda_id,
      data_venda: venda?.created_at,
      beneficiario,
    })
  }

  return customerIds
    .map((customerId) => agrupado.get(customerId))
    .filter((group): group is ReceivableCustomerGroup => Boolean(group))
}

export async function searchPendenciasCliente(
  storeId: number,
  termo: string,
  cursor: ReceivableSearchCursor | null = null
): Promise<{ results: ReceivableCustomerGroup[]; nextCursor: ReceivableSearchCursor | null }> {
  const cleanTerm = termo.trim()
  if (!Number.isSafeInteger(storeId) || storeId <= 0 || cleanTerm.length < 3) {
    return { results: [], nextCursor: null }
  }

  if (cursor && (!Number.isSafeInteger(cursor.id) || cursor.id <= 0 || !cursor.name)) {
    throw new Error('Paginacao de clientes invalida.')
  }

  const admin = await requireStoreAccess(storeId)
  const { data, error } = await (admin as any).rpc('search_receivable_customer_ids', {
    p_store_id: storeId,
    p_term: cleanTerm,
    p_after_name: cursor?.name ?? null,
    p_after_id: cursor?.id ?? null,
    p_limit: CUSTOMER_PAGE_SIZE + 1,
  })

  if (error) {
    console.error('[Recebimento] Erro ao buscar clientes:', error)
    throw new Error('Nao foi possivel buscar clientes para recebimento.')
  }

  const rows = (data || []) as Array<{ customer_id: number; sort_name: string }>
  const pageRows = rows.slice(0, CUSTOMER_PAGE_SIZE)
  const results = await loadCustomerGroups(admin, storeId, pageRows.map((row) => Number(row.customer_id)))
  const last = pageRows.at(-1)

  return {
    results,
    nextCursor: rows.length > CUSTOMER_PAGE_SIZE && last
      ? { name: last.sort_name, id: Number(last.customer_id) }
      : null,
  }
}

export async function getPendenciasClienteById(storeId: number, customerId: number): Promise<ReceivableCustomerGroup | null> {
  if (!Number.isSafeInteger(storeId) || storeId <= 0 || !Number.isSafeInteger(customerId) || customerId <= 0) {
    return null
  }

  const admin = await requireStoreAccess(storeId)
  const groups = await loadCustomerGroups(admin, storeId, [customerId])
  return groups[0] || null
}
