import dotenv from 'dotenv'
import { createClient } from '@supabase/supabase-js'

dotenv.config({ path: '.env.local', quiet: true })

const storeId = Number(process.argv[2] || '1')
const name = process.argv[3] || ''
const mismatchOnly = process.argv.includes('--mismatch')
const markSaleId = Number(process.argv.find((arg) => arg.startsWith('--mark='))?.slice(7) || '')
if (!name && !mismatchOnly && !markSaleId) {
  console.error('Uso: node scripts/inspect-store-sale-nfce.mjs <storeId> <nome>')
  process.exit(1)
}

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Supabase nao configurado.')
  process.exit(1)
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })

if (markSaleId) {
  const { data: invoice, error: invoiceError } = await supabase
    .from('fiscal_invoices')
    .select('id, status, environment, tipo_documento, numero, serie')
    .eq('store_id', storeId)
    .eq('work_order_id', markSaleId)
    .eq('tipo_documento', 'NFCe')
    .eq('environment', 'production')
    .eq('status', 'authorized')
    .maybeSingle()
  if (invoiceError) {
    console.error(invoiceError.message)
    process.exit(1)
  }
  if (!invoice) {
    console.error('NFC-e de producao autorizada nao encontrada para a venda.')
    process.exit(1)
  }
  const { data, error } = await supabase
    .from('vendas')
    .update({ nf_emitida: true })
    .eq('id', markSaleId)
    .eq('store_id', storeId)
    .select('id, store_id, nf_emitida, status')
    .single()
  if (error) {
    console.error(error.message)
    process.exit(1)
  }
  console.log(JSON.stringify({ invoice, venda: data }, null, 2))
  process.exit(0)
}

if (mismatchOnly) {
  const { data: flagged, error: flaggedError } = await supabase
    .from('vendas')
    .select('id, nf_emitida, status, created_at')
    .eq('store_id', storeId)
    .eq('nf_emitida', true)
    .order('id', { ascending: false })
    .limit(1000)
  if (flaggedError) {
    console.error(flaggedError.message)
    process.exit(1)
  }
  const flaggedIds = (flagged || []).map((venda) => venda.id)
  const { data: flaggedInvoices, error: flaggedInvoiceError } = flaggedIds.length
    ? await supabase
      .from('fiscal_invoices')
      .select('work_order_id, status, environment, tipo_documento')
      .eq('store_id', storeId)
      .eq('tipo_documento', 'NFCe')
      .eq('environment', 'production')
      .in('work_order_id', flaggedIds)
    : { data: [], error: null }
  if (flaggedInvoiceError) {
    console.error(flaggedInvoiceError.message)
    process.exit(1)
  }
  const authorized = new Set((flaggedInvoices || [])
    .filter((invoice) => invoice.status === 'authorized')
    .map((invoice) => invoice.work_order_id))
  const flaggedWithoutInvoice = (flagged || []).filter((venda) => !authorized.has(venda.id)).map((venda) => venda.id)

  const { data: authorizedInvoices, error: authorizedError } = await supabase
    .from('fiscal_invoices')
    .select('id, work_order_id, numero, serie, status, created_at')
    .eq('store_id', storeId)
    .eq('tipo_documento', 'NFCe')
    .eq('environment', 'production')
    .eq('status', 'authorized')
    .not('work_order_id', 'is', null)
    .order('id', { ascending: false })
    .limit(1000)
  if (authorizedError) {
    console.error(authorizedError.message)
    process.exit(1)
  }
  const saleIds = [...new Set((authorizedInvoices || []).map((invoice) => invoice.work_order_id))]
  const { data: linkedSales, error: linkedError } = saleIds.length
    ? await supabase.from('vendas').select('id, nf_emitida').eq('store_id', storeId).in('id', saleIds)
    : { data: [], error: null }
  if (linkedError) {
    console.error(linkedError.message)
    process.exit(1)
  }
  const flagBySale = new Map((linkedSales || []).map((venda) => [venda.id, venda.nf_emitida]))
  const authorizedWithoutFlag = (authorizedInvoices || [])
    .filter((invoice) => flagBySale.get(invoice.work_order_id) !== true)
    .map((invoice) => ({
      venda_id: invoice.work_order_id,
      invoice_id: invoice.id,
      numero: invoice.numero,
      serie: invoice.serie,
      nf_emitida: flagBySale.has(invoice.work_order_id) ? flagBySale.get(invoice.work_order_id) : null,
      created_at: invoice.created_at,
    }))
  console.log(JSON.stringify({
    flagged_sales: flaggedIds.length,
    flagged_without_authorized_nfce: flaggedWithoutInvoice,
    authorized_nfce: (authorizedInvoices || []).length,
    authorized_without_flag: authorizedWithoutFlag,
  }, null, 2))
  process.exit(0)
}

const { data: customers, error: customerError } = await supabase
  .from('customers')
  .select('id, full_name, store_id')
  .eq('store_id', storeId)
  .ilike('full_name', `%${name}%`)
  .limit(10)

if (customerError) {
  console.error(customerError.message)
  process.exit(1)
}

console.log(JSON.stringify({ customers: customers || [] }, null, 2))
const ids = (customers || []).map((customer) => customer.id)
if (!ids.length) process.exit(0)

const { data: vendas, error: vendasError } = await supabase
  .from('vendas')
  .select('id, customer_id, status, created_at, data_fechamento, valor_final, nf_emitida')
  .eq('store_id', storeId)
  .in('customer_id', ids)
  .order('created_at', { ascending: false })
  .limit(5)

if (vendasError) {
  console.error(vendasError.message)
  process.exit(1)
}

console.log(JSON.stringify({ vendas: vendas || [] }, null, 2))
const vendaIds = (vendas || []).map((venda) => venda.id)
if (!vendaIds.length) process.exit(0)

const { data: invoices, error: invoiceError } = await supabase
  .from('fiscal_invoices')
  .select('id, work_order_id, tipo_documento, status, environment, numero, serie, data_emissao, created_at, direction')
  .eq('store_id', storeId)
  .in('work_order_id', vendaIds)
  .order('created_at', { ascending: false })

if (invoiceError) {
  console.error(invoiceError.message)
  process.exit(1)
}

console.log(JSON.stringify({ invoices: invoices || [] }, null, 2))
