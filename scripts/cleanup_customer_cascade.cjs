const { createClient } = require('@supabase/supabase-js')
const dotenv = require('dotenv')

dotenv.config({ path: '.env.local' })
if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  dotenv.config({ path: '.env' })
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Faltam NEXT_PUBLIC_SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const args = process.argv.slice(2)
const opts = {
  storeId: 1,
  cpf: '58212043134',
  fullName: 'Jaime Rodrigues Junior',
  apply: false,
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--apply') opts.apply = true
  else if (arg === '--store' && args[i + 1]) opts.storeId = Number(args[++i])
  else if (arg === '--cpf' && args[i + 1]) opts.cpf = args[++i]
  else if (arg === '--name' && args[i + 1]) opts.fullName = args[++i]
}

function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function maskCpf(cpf) {
  const digits = digitsOnly(cpf)
  if (digits.length !== 11) return cpf
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`
}

function uniqueById(rows) {
  const map = new Map()
  for (const row of rows || []) {
    if (row && row.id != null) map.set(String(row.id), row)
  }
  return [...map.values()]
}

async function runQuery(label, queryPromise) {
  const { data, error } = await queryPromise
  if (error) {
    throw new Error(`${label}: ${error.message}`)
  }
  return data || []
}

async function byIn(table, column, ids, select = 'id') {
  if (!ids.length) return []
  return runQuery(
    `${table}.${column}`,
    supabase.from(table).select(select).in(column, ids)
  )
}

async function byEq(table, column, value, select = 'id') {
  return runQuery(
    `${table}.${column}`,
    supabase.from(table).select(select).eq(column, value)
  )
}

async function findCustomers() {
  const cpfDigits = digitsOnly(opts.cpf)
  const cpfMasked = maskCpf(cpfDigits)
  let customers = await runQuery(
    'customers by cpf',
    supabase
      .from('customers')
      .select('id, store_id, full_name, cpf, created_at')
      .eq('store_id', opts.storeId)
      .or(`cpf.eq.${cpfDigits},cpf.eq.${cpfMasked}`)
  )

  customers = customers.filter((c) => digitsOnly(c.cpf) === cpfDigits)

  if (!customers.length) {
    const byName = await runQuery(
      'customers by name fallback',
      supabase
        .from('customers')
        .select('id, store_id, full_name, cpf, created_at')
        .eq('store_id', opts.storeId)
        .ilike('full_name', `%${opts.fullName}%`)
    )
    const wantedName = normalizeName(opts.fullName)
    customers = byName.filter((c) => {
      const sameCpf = digitsOnly(c.cpf) === cpfDigits
      const sameName = normalizeName(c.full_name).includes(wantedName)
      return sameCpf || sameName
    })
  }

  return uniqueById(customers)
}

async function collectTargets(customerIds) {
  const vendas = await byIn('vendas', 'customer_id', customerIds, 'id, customer_id, created_at, status, valor_final')
  const vendaIds = vendas.map((row) => row.id)

  const serviceOrders = uniqueById([
    ...await byIn('service_orders', 'customer_id', customerIds, 'id, customer_id, venda_id, dependente_id, source_optical_evaluation_id, created_at'),
    ...await byIn('service_orders', 'venda_id', vendaIds, 'id, customer_id, venda_id, dependente_id, source_optical_evaluation_id, created_at'),
  ])
  const serviceOrderIds = serviceOrders.map((row) => row.id)

  const vendaItens = await byIn('venda_itens', 'venda_id', vendaIds, 'id, venda_id, descricao')
  const vendaItemIds = vendaItens.map((row) => row.id)

  const pagamentos = await byIn('pagamentos', 'venda_id', vendaIds, 'id, venda_id, valor_pago, forma_pagamento, obs')
  const pagamentoIds = pagamentos.map((row) => row.id)

  const accountsReceivable = await byIn('accounts_receivable', 'origin_payment_id', pagamentoIds, 'id, origin_payment_id, description, amount, status')

  const financiamentos = uniqueById([
    ...await byIn('financiamento_loja', 'customer_id', customerIds, 'id, venda_id, customer_id, quantidade_parcelas, valor_total_financiado'),
    ...await byIn('financiamento_loja', 'venda_id', vendaIds, 'id, venda_id, customer_id, quantidade_parcelas, valor_total_financiado'),
  ])
  const financiamentoIds = financiamentos.map((row) => row.id)

  const financiamentoParcelas = uniqueById([
    ...await byIn('financiamento_parcelas', 'financiamento_id', financiamentoIds, 'id, financiamento_id, customer_id, numero_parcela, status, valor_parcela'),
    ...await byIn('financiamento_parcelas', 'customer_id', customerIds, 'id, financiamento_id, customer_id, numero_parcela, status, valor_parcela'),
  ])

  const links = uniqueById([
    ...await byIn('venda_itens_os_links', 'service_order_id', serviceOrderIds, 'id, service_order_id, venda_item_id'),
    ...await byIn('venda_itens_os_links', 'venda_item_id', vendaItemIds, 'id, service_order_id, venda_item_id'),
  ])

  const postSales = await byIn('post_sales', 'service_order_id', serviceOrderIds, 'id, service_order_id, status')
  const postSaleIds = postSales.map((row) => row.id)
  const postSaleInteractions = await byIn('post_sales_interactions', 'post_sales_id', postSaleIds, 'id, post_sales_id, tipo_contato')

  const fiscalInvoices = await byIn('fiscal_invoices', 'work_order_id', serviceOrderIds, 'id, work_order_id, status, tipo_documento, numero')

  const stockMovements = uniqueById([
    ...await byIn('stock_movements', 'related_venda_id', vendaIds, 'id, related_venda_id, related_os_id, tipo, motivo'),
    ...await byIn('stock_movements', 'related_os_id', serviceOrderIds, 'id, related_venda_id, related_os_id, tipo, motivo'),
  ])

  const commissions = await byIn('commissions', 'venda_id', vendaIds, 'id, venda_id, amount, commission_stage, status')

  const cobrancas = uniqueById([
    ...await byIn('cobranca_historico', 'customer_id', customerIds, 'id, customer_id, venda_id, tipo_contato, created_at'),
    ...await byIn('cobranca_historico', 'venda_id', vendaIds, 'id, customer_id, venda_id, tipo_contato, created_at'),
  ])

  const wallets = await byIn('customer_wallets', 'customer_id', customerIds, 'id, customer_id, balance')
  const walletIds = wallets.map((row) => row.id)
  const walletTransactions = uniqueById([
    ...await byIn('wallet_transactions', 'wallet_id', walletIds, 'id, wallet_id, related_venda_id, amount, operation_type'),
    ...await byIn('wallet_transactions', 'related_venda_id', vendaIds, 'id, wallet_id, related_venda_id, amount, operation_type'),
  ])

  const assistanceTickets = uniqueById([
    ...await byIn('assistance_tickets', 'customer_id', customerIds, 'id, customer_id, venda_original_id, status, modalidade'),
    ...await byIn('assistance_tickets', 'venda_original_id', vendaIds, 'id, customer_id, venda_original_id, status, modalidade'),
  ])
  const ticketIds = assistanceTickets.map((row) => row.id)
  const assistanceTimeline = await byIn('assistance_timeline', 'ticket_id', ticketIds, 'id, ticket_id, tipo')

  const dependentes = await byIn('dependentes', 'customer_id', customerIds, 'id, customer_id, full_name')

  const opticalEvaluations = uniqueById([
    ...await byIn('optical_evaluations', 'evaluated_customer_id', customerIds, 'id, evaluated_customer_id, responsible_customer_id, exported_venda_id, exported_service_order_id'),
    ...await byIn('optical_evaluations', 'responsible_customer_id', customerIds, 'id, evaluated_customer_id, responsible_customer_id, exported_venda_id, exported_service_order_id'),
    ...await byIn('optical_evaluations', 'exported_venda_id', vendaIds, 'id, evaluated_customer_id, responsible_customer_id, exported_venda_id, exported_service_order_id'),
    ...await byIn('optical_evaluations', 'exported_service_order_id', serviceOrderIds, 'id, evaluated_customer_id, responsible_customer_id, exported_venda_id, exported_service_order_id'),
  ])

  const nfcTrays = await byIn('nfc_trays', 'current_service_order_id', serviceOrderIds, 'id, current_service_order_id, status')
  const nfcTrayEvents = await byIn('nfc_tray_events', 'service_order_id', serviceOrderIds, 'id, tray_id, service_order_id, action')

  return {
    vendas,
    vendaItens,
    pagamentos,
    accountsReceivable,
    financiamentos,
    financiamentoParcelas,
    serviceOrders,
    vendaItensOsLinks: links,
    postSales,
    postSaleInteractions,
    fiscalInvoices,
    stockMovements,
    commissions,
    cobrancas,
    wallets,
    walletTransactions,
    assistanceTickets,
    assistanceTimeline,
    dependentes,
    opticalEvaluations,
    nfcTrays,
    nfcTrayEvents,
  }
}

function printPreview(customers, targets) {
  const vendaIds = targets.vendas.map((row) => row.id)
  const osIds = targets.serviceOrders.map((row) => row.id)
  const parcelaIds = targets.financiamentoParcelas.map((row) => row.id)

  console.log('--- PREVIA DA LIMPEZA ---')
  console.log(`Loja: ${opts.storeId}`)
  console.log(`CPF alvo: ${maskCpf(opts.cpf)}`)
  console.log(`Modo: ${opts.apply ? 'APLICAR' : 'DRY-RUN'}`)
  console.log('')
  console.log('Clientes preservados:')
  for (const customer of customers) {
    console.log(`- ID ${customer.id}: ${customer.full_name} | CPF ${customer.cpf || 'sem CPF'} | criado em ${customer.created_at}`)
  }
  console.log('')
  console.log(`Vendas: ${targets.vendas.length}${vendaIds.length ? ` | IDs: ${vendaIds.join(', ')}` : ''}`)
  console.log(`OS: ${targets.serviceOrders.length}${osIds.length ? ` | IDs: ${osIds.join(', ')}` : ''}`)
  console.log(`Parcelas: ${targets.financiamentoParcelas.length}${parcelaIds.length ? ` | IDs: ${parcelaIds.join(', ')}` : ''}`)
  console.log(`Itens de venda: ${targets.vendaItens.length}`)
  console.log(`Pagamentos: ${targets.pagamentos.length}`)
  console.log(`Contas a receber: ${targets.accountsReceivable.length}`)
  console.log(`Financiamentos: ${targets.financiamentos.length}`)
  console.log(`Links item/OS: ${targets.vendaItensOsLinks.length}`)
  console.log(`Pos-vendas: ${targets.postSales.length}`)
  console.log(`Interacoes de pos-venda: ${targets.postSaleInteractions.length}`)
  console.log(`Documentos fiscais: ${targets.fiscalInvoices.length}`)
  console.log(`Movimentos de estoque: ${targets.stockMovements.length}`)
  console.log(`Comissoes: ${targets.commissions.length}`)
  console.log(`Historico de cobranca: ${targets.cobrancas.length}`)
  console.log(`Carteiras: ${targets.wallets.length}`)
  console.log(`Transacoes de carteira: ${targets.walletTransactions.length}`)
  console.log(`Assistencias: ${targets.assistanceTickets.length}`)
  console.log(`Timeline de assistencia: ${targets.assistanceTimeline.length}`)
  console.log(`Dependentes: ${targets.dependentes.length}`)
  console.log(`Avaliacoes opticas: ${targets.opticalEvaluations.length}`)
  console.log(`Bandejas NFC: ${targets.nfcTrays.length}`)
  console.log(`Eventos NFC: ${targets.nfcTrayEvents.length}`)
}

async function deleteRows(table, ids, idColumn = 'id') {
  if (!ids.length) {
    return 0
  }
  const { data, error } = await supabase.from(table).delete().in(idColumn, ids).select(idColumn)
  if (error) throw new Error(`${table}: ${error.message}`)
  return (data || []).length
}

async function applyCleanup(targets) {
  const summary = []
  const idsOf = (rows) => rows.map((row) => row.id)

  if (targets.nfcTrays.length) {
    const { data, error } = await supabase
      .from('nfc_trays')
      .update({ current_service_order_id: null })
      .in('id', idsOf(targets.nfcTrays))
      .select('id')
    if (error) throw new Error(`nfc_trays update: ${error.message}`)
    summary.push(['nfc_trays desvinculadas', (data || []).length])
  }

  if (targets.serviceOrders.length) {
    const { data, error } = await supabase
      .from('service_orders')
      .update({ source_optical_evaluation_id: null })
      .in('id', idsOf(targets.serviceOrders))
      .select('id')
    if (error) throw new Error(`service_orders unlink evaluations: ${error.message}`)
    summary.push(['service_orders deslinkadas de avaliacoes', (data || []).length])
  }

  summary.push(['post_sales_interactions', await deleteRows('post_sales_interactions', idsOf(targets.postSaleInteractions))])
  summary.push(['post_sales', await deleteRows('post_sales', idsOf(targets.postSales))])
  summary.push(['assistance_timeline', await deleteRows('assistance_timeline', idsOf(targets.assistanceTimeline))])
  summary.push(['assistance_tickets', await deleteRows('assistance_tickets', idsOf(targets.assistanceTickets))])
  summary.push(['nfc_tray_events', await deleteRows('nfc_tray_events', idsOf(targets.nfcTrayEvents))])
  summary.push(['fiscal_invoices', await deleteRows('fiscal_invoices', idsOf(targets.fiscalInvoices))])
  summary.push(['venda_itens_os_links', await deleteRows('venda_itens_os_links', idsOf(targets.vendaItensOsLinks))])
  summary.push(['accounts_receivable', await deleteRows('accounts_receivable', idsOf(targets.accountsReceivable))])
  summary.push(['wallet_transactions', await deleteRows('wallet_transactions', idsOf(targets.walletTransactions))])
  summary.push(['stock_movements', await deleteRows('stock_movements', idsOf(targets.stockMovements))])
  summary.push(['commissions', await deleteRows('commissions', idsOf(targets.commissions))])
  summary.push(['cobranca_historico', await deleteRows('cobranca_historico', idsOf(targets.cobrancas))])
  summary.push(['financiamento_parcelas', await deleteRows('financiamento_parcelas', idsOf(targets.financiamentoParcelas))])

  if (targets.vendas.length) {
    const { data, error } = await supabase
      .from('vendas')
      .update({ financiamento_id: null })
      .in('id', idsOf(targets.vendas))
      .select('id')
    if (error) throw new Error(`vendas unlink financiamento_id: ${error.message}`)
    summary.push(['vendas deslinkadas de financiamento', (data || []).length])
  }

  summary.push(['financiamento_loja', await deleteRows('financiamento_loja', idsOf(targets.financiamentos))])
  summary.push(['pagamentos', await deleteRows('pagamentos', idsOf(targets.pagamentos))])
  summary.push(['venda_itens', await deleteRows('venda_itens', idsOf(targets.vendaItens))])
  summary.push(['optical_evaluations', await deleteRows('optical_evaluations', idsOf(targets.opticalEvaluations))])
  summary.push(['service_orders', await deleteRows('service_orders', idsOf(targets.serviceOrders))])
  summary.push(['vendas', await deleteRows('vendas', idsOf(targets.vendas))])
  summary.push(['customer_wallets', await deleteRows('customer_wallets', idsOf(targets.wallets))])
  summary.push(['dependentes', await deleteRows('dependentes', idsOf(targets.dependentes))])

  console.log('')
  console.log('--- LIMPEZA EXECUTADA ---')
  for (const [label, count] of summary) {
    console.log(`${label}: ${count}`)
  }
}

async function verifyResiduals(customerIds) {
  const remainingSales = await byIn('vendas', 'customer_id', customerIds, 'id')
  const remainingOs = await byIn('service_orders', 'customer_id', customerIds, 'id')
  const remainingFin = await byIn('financiamento_loja', 'customer_id', customerIds, 'id')
  const remainingParcelas = await byIn('financiamento_parcelas', 'customer_id', customerIds, 'id')
  const remainingEvals = uniqueById([
    ...await byIn('optical_evaluations', 'evaluated_customer_id', customerIds, 'id'),
    ...await byIn('optical_evaluations', 'responsible_customer_id', customerIds, 'id'),
  ])
  const remainingWallets = await byIn('customer_wallets', 'customer_id', customerIds, 'id')
  const remainingAssist = await byIn('assistance_tickets', 'customer_id', customerIds, 'id')
  const remainingDependentes = await byIn('dependentes', 'customer_id', customerIds, 'id')

  console.log('')
  console.log('--- RESIDUOS APOS LIMPEZA ---')
  console.log(`vendas: ${remainingSales.length}`)
  console.log(`service_orders: ${remainingOs.length}`)
  console.log(`financiamento_loja: ${remainingFin.length}`)
  console.log(`financiamento_parcelas: ${remainingParcelas.length}`)
  console.log(`optical_evaluations: ${remainingEvals.length}`)
  console.log(`customer_wallets: ${remainingWallets.length}`)
  console.log(`assistance_tickets: ${remainingAssist.length}`)
  console.log(`dependentes: ${remainingDependentes.length}`)
}

async function main() {
  const customers = await findCustomers()
  if (!customers.length) {
    throw new Error(`Nenhum cliente encontrado na store ${opts.storeId} para CPF ${opts.cpf}.`)
  }

  const customerIds = customers.map((row) => row.id)
  const targets = await collectTargets(customerIds)
  printPreview(customers, targets)

  if (!opts.apply) {
    console.log('')
    console.log('Dry-run concluido. Rode com --apply para executar a exclusao.')
    return
  }

  await applyCleanup(targets)
  await verifyResiduals(customerIds)
}

main().catch((error) => {
  console.error('')
  console.error('FALHA NA LIMPEZA:')
  console.error(error.message || error)
  process.exit(1)
})
