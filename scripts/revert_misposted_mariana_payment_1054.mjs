import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local' })
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
await client.connect()

try {
  await client.query('BEGIN')

  const payment = await client.query(`
    select id, venda_id, customer_id, parcela_id, valor_pago, data_pagamento
    from public.pagamentos
    where id = 1054 and store_id = 1
    for update
  `)
  if (payment.rowCount !== 1) throw new Error('Pagamento 1054 nao encontrado')
  const p = payment.rows[0]
  if (
    Number(p.venda_id) !== 344 ||
    Number(p.customer_id) !== 8032 ||
    Number(p.parcela_id) !== 2737 ||
    Number(p.valor_pago) !== 172 ||
    new Date(p.data_pagamento).toISOString().slice(0, 10) !== '2026-08-07'
  ) throw new Error('Pagamento 1054 nao confere; nenhuma alteracao aplicada')

  const parcela = await client.query(`
    select id, financiamento_id, customer_id, numero_parcela, valor_parcela, valor_pago, status
    from public.financiamento_parcelas
    where id = 2737 and store_id = 1
    for update
  `)
  if (parcela.rowCount !== 1) throw new Error('Parcela 2737 nao encontrada')
  const q = parcela.rows[0]
  if (Number(q.financiamento_id) !== 1128 || Number(q.customer_id) !== 8032 || Number(q.numero_parcela) !== 4) {
    throw new Error('Parcela 2737 nao confere; nenhuma alteracao aplicada')
  }

  await client.query('delete from public.accounts_receivable where origin_payment_id = 1054')
  await client.query('delete from public.pagamentos where id = 1054 and store_id = 1')
  await client.query(`
    update public.financiamento_parcelas
    set status = 'Pendente', valor_pago = 0, data_pagamento = null
    where id = 2737 and store_id = 1
  `)

  await client.query('COMMIT')
  console.log('OK: pagamento 1054 estornado e parcela 4 reaberta.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
