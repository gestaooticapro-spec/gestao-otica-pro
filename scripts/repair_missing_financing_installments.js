import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const envPath = '.env.local'
if (fs.existsSync(envPath)) {
  const envConfig = fs.readFileSync(envPath, 'utf8')
  for (const line of envConfig.split(/\r?\n/)) {
    const index = line.indexOf('=')
    if (index > 0) {
      process.env[line.slice(0, index).trim()] = line.slice(index + 1).trim()
    }
  }
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY
const shouldApply = process.argv.includes('--apply')

if (!supabaseUrl || !serviceRole) {
  throw new Error('Supabase URL ou service role nao configurados.')
}

const supabase = createClient(supabaseUrl, serviceRole)

function addMonths(dateString, months) {
  const date = new Date(`${dateString}T12:00:00Z`)
  date.setUTCMonth(date.getUTCMonth() + months)
  return date.toISOString().split('T')[0]
}

function buildInstallments(financing, paymentsBySale) {
  const total = Number(financing.valor_total_financiado || 0)
  const quantity = Number(financing.quantidade_parcelas || 0)
  const baseValue = Number((total / quantity).toFixed(2))
  const difference = Number((total - baseValue * quantity).toFixed(2))
  const relatedPayments = paymentsBySale.get(financing.venda_id) || []

  return Array.from({ length: quantity }, (_, index) => {
    const installmentNumber = index + 1
    const value = Number((baseValue + (index === 0 ? difference : 0)).toFixed(2))
    const payment = relatedPayments.find((p) => {
      const obs = String(p.obs || '')
      return obs.includes(`Ref. Venda #${financing.venda_id}`) && obs.includes(`Parc. ${installmentNumber}`)
    })

    return {
      tenant_id: financing.tenant_id,
      store_id: financing.store_id,
      financiamento_id: financing.id,
      customer_id: financing.customer_id,
      numero_parcela: installmentNumber,
      data_vencimento: addMonths(financing.data_inicio, index),
      valor_parcela: value,
      valor_pago: payment ? value : 0,
      data_pagamento: payment?.data_pagamento || null,
      status: payment ? 'Pago' : 'Pendente',
      obs: payment ? 'Recriada a partir de pagamento ja registrado.' : null
    }
  })
}

async function main() {
  const { data: financings, error: financingError } = await supabase
    .from('financiamento_loja')
    .select('id, tenant_id, store_id, venda_id, customer_id, valor_total_financiado, quantidade_parcelas, data_inicio, customers(full_name)')
    .order('id', { ascending: true })

  if (financingError) throw financingError

  const financingIds = (financings || []).map((f) => f.id)
  const { data: existingInstallments, error: installmentsError } = await supabase
    .from('financiamento_parcelas')
    .select('id, financiamento_id')
    .in('financiamento_id', financingIds)

  if (installmentsError) throw installmentsError

  const counts = new Map()
  for (const installment of existingInstallments || []) {
    counts.set(installment.financiamento_id, (counts.get(installment.financiamento_id) || 0) + 1)
  }

  const missing = (financings || []).filter((f) => (counts.get(f.id) || 0) === 0)
  const saleIds = missing.map((f) => f.venda_id)

  const { data: payments, error: paymentsError } = await supabase
    .from('pagamentos')
    .select('id, venda_id, valor_pago, data_pagamento, obs')
    .in('venda_id', saleIds)

  if (paymentsError) throw paymentsError

  const paymentsBySale = new Map()
  for (const payment of payments || []) {
    const list = paymentsBySale.get(payment.venda_id) || []
    list.push(payment)
    paymentsBySale.set(payment.venda_id, list)
  }

  const rows = missing.flatMap((financing) => buildInstallments(financing, paymentsBySale))

  console.log(`Financiamentos sem parcelas: ${missing.length}`)
  for (const financing of missing) {
    const preview = buildInstallments(financing, paymentsBySale)
    const paid = preview.filter((p) => p.status === 'Pago').length
    console.log(
      `#${financing.id} venda ${financing.venda_id} ${financing.customers?.full_name || ''}: ` +
      `${preview.length} parcelas, ${paid} pagas, total ${financing.valor_total_financiado}`
    )
  }

  if (!shouldApply) {
    console.log('Previa concluida. Rode com --apply para inserir as parcelas faltantes.')
    return
  }

  if (rows.length === 0) {
    console.log('Nada para inserir.')
    return
  }

  const { error: insertError } = await supabase
    .from('financiamento_parcelas')
    .insert(rows)

  if (insertError) throw insertError

  console.log(`Inseridas ${rows.length} parcelas faltantes.`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
