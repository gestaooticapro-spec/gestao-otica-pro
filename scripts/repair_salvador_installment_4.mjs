import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local' })
const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
await client.connect()

try {
  await client.query('BEGIN')
  const { rows, rowCount } = await client.query(`
    select id, financiamento_id, customer_id, numero_parcela,
           valor_parcela, valor_pago, status, data_pagamento
    from public.financiamento_parcelas
    where id = 2960 and store_id = 1
    for update
  `)
  if (rowCount !== 1) throw new Error('Parcela 2960 nao encontrada')
  const parcela = rows[0]
  if (
    Number(parcela.financiamento_id) !== 1183 ||
    Number(parcela.customer_id) !== 5636 ||
    Number(parcela.numero_parcela) !== 4 ||
    parcela.status !== 'Pendente' ||
    Number(parcela.valor_pago) !== 0
  ) throw new Error('Estado inesperado; nenhuma alteracao aplicada')

  await client.query(`
    update public.financiamento_parcelas
    set valor_parcela = 200
    where id = 2960 and store_id = 1
  `)
  await client.query('COMMIT')
  console.log('OK: parcela 4 do Salvador corrigida para R$ 200,00.')
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
