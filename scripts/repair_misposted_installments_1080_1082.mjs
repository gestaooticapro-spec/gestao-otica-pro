import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local' })
const { Client } = pg
const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) throw new Error('SUPABASE_DB_URL nao configurada')

const client = new Client({ connectionString: dbUrl })
await client.connect()

try {
  await client.query('BEGIN')

  const payments = await client.query(`
    select id, venda_id, customer_id, parcela_id, valor_pago
    from public.pagamentos
    where store_id = 1 and id = any($1::bigint[])
    order by id
    for update
  `, [[1080, 1081, 1082]])

  if (payments.rowCount !== 3) throw new Error(`Esperados 3 pagamentos, encontrados ${payments.rowCount}`)
  if (payments.rows.some((p) => Number(p.venda_id) !== 593 || Number(p.customer_id) !== 5636)) {
    throw new Error('Os pagamentos nao estao mais no estado esperado; nenhuma alteracao aplicada')
  }
  const total = payments.rows.reduce((sum, p) => sum + Number(p.valor_pago), 0)
  if (total !== 500) throw new Error(`Total inesperado: ${total}`)

  const target = await client.query(`
    select id, financiamento_id, customer_id, numero_parcela, valor_parcela, status
    from public.financiamento_parcelas
    where id = 2894 and store_id = 1
    for update
  `)
  if (target.rowCount !== 1 || Number(target.rows[0].financiamento_id) !== 1167 || Number(target.rows[0].customer_id) !== 528 || Number(target.rows[0].numero_parcela) !== 2 || Number(target.rows[0].valor_parcela) !== 500) {
    throw new Error('Parcela alvo do Anselmo nao confere; nenhuma alteracao aplicada')
  }
  if (target.rows[0].status === 'Pago') throw new Error('Parcela alvo ja esta paga; nenhuma alteracao aplicada')

  const source = await client.query(`
    select id, financiamento_id, customer_id, numero_parcela, valor_parcela, status, valor_pago, data_pagamento
    from public.financiamento_parcelas
    where id = any($1::bigint[]) and store_id = 1
    order by id
    for update
  `, [[2958, 2959, 2960]])
  if (source.rowCount !== 3 || source.rows.some((p) => Number(p.financiamento_id) !== 1183 || Number(p.customer_id) !== 5636)) {
    throw new Error('Parcelas de origem nao conferem; nenhuma alteracao aplicada')
  }

  await client.query(`
    update public.financiamento_parcelas
    set status = 'Pendente', valor_pago = 0, data_pagamento = null
    where id = any($1::bigint[])
  `, [[2958, 2959, 2960]])

  await client.query(`
    update public.financiamento_parcelas
    set status = 'Pago', valor_pago = 500, data_pagamento = '2026-08-10'
    where id = 2894
  `)

  await client.query(`
    update public.pagamentos
    set venda_id = 517,
        customer_id = 528,
        parcela_id = 2894,
        obs = 'Ref. Venda #517 - Parc. 2 - Cliente: ANSELMO DE PAULA'
    where store_id = 1 and id = any($1::bigint[])
  `, [[1080, 1081, 1082]])

  await client.query('COMMIT')
  console.log('OK: recibos 1080, 1081 e 1082 transferidos para Anselmo, venda 517, parcela 2894.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
