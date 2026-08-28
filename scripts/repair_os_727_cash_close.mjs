import dotenv from 'dotenv'
import pg from 'pg'

dotenv.config({ path: '.env.local' })
const dbUrl = process.env.SUPABASE_DB_URL
if (!dbUrl) throw new Error('SUPABASE_DB_URL nao configurada')

const VENDA_ID = 13416
const STORE_ID = 1
const OS_ID = 727
const CUSTOMER_ID = 589
const EMPLOYEE_ID = 2
const TENANT_ID = '40b34e90-4c9d-4446-b775-770a3e77d6c0'
const CREATED_BY_USER_ID = 'd386b889-370a-41bc-bc6c-dc16bee4e129'
const PAYMENT_CREATED_AT = '2026-08-17T12:00:00.000Z'
const PAYMENT_DATE = '2026-08-17'
const CLOSE_AT = '2026-08-17T15:00:00.000Z'
const AMOUNT = 250

const client = new pg.Client({ connectionString: dbUrl })
await client.connect()

try {
  await client.query('BEGIN')

  const vendaRes = await client.query(`
    select id, store_id, tenant_id, customer_id, employee_id, status,
           valor_total, valor_final, valor_restante, financiamento_id,
           data_fechamento, is_historical_import
    from public.vendas
    where id = $1 and store_id = $2
    for update
  `, [VENDA_ID, STORE_ID])

  if (vendaRes.rowCount !== 1) throw new Error('Venda 13416 da loja 1 nao encontrada')
  const venda = vendaRes.rows[0]
  if (venda.status !== 'Em Aberto') throw new Error(`Status inesperado: ${venda.status}`)
  if (venda.is_historical_import === true) throw new Error('Venda historica nao pode ser fechada por este fluxo')
  if (Number(venda.customer_id) !== CUSTOMER_ID) throw new Error('Cliente da venda nao confere')
  if (Number(venda.employee_id) !== EMPLOYEE_ID) throw new Error('Vendedor da venda nao e o Ozias')
  if (Number(venda.valor_final) !== AMOUNT) throw new Error(`Valor final inesperado: ${venda.valor_final}`)
  if (Number(venda.valor_restante) !== AMOUNT) throw new Error(`Valor restante inesperado: ${venda.valor_restante}`)
  if (venda.financiamento_id != null) throw new Error('Venda possui carne; este fluxo e somente pagamento direto')
  if (venda.data_fechamento != null) throw new Error('Venda ja possui data de fechamento')
  if (venda.tenant_id !== TENANT_ID) throw new Error('Tenant da venda nao confere')

  const pagamentosRes = await client.query(`
    select id from public.pagamentos where venda_id = $1 for update
  `, [VENDA_ID])
  if (pagamentosRes.rowCount !== 0) throw new Error('Ja existem pagamentos nesta venda; nenhuma alteracao aplicada')

  const osRes = await client.query(`
    select id, venda_id, store_id from public.service_orders where id = $1 for update
  `, [OS_ID])
  if (osRes.rowCount !== 1) throw new Error('OS 727 nao encontrada')
  if (Number(osRes.rows[0].venda_id) !== VENDA_ID) throw new Error('OS 727 nao pertence a venda 13416')
  if (Number(osRes.rows[0].store_id) !== STORE_ID) throw new Error('OS 727 nao pertence a loja 1')

  const employeeRes = await client.query(`
    select id, full_name, comm_rate_guaranteed, comm_rate_store_credit, comm_rate_received
    from public.employees
    where id = $1 and store_id = $2
    for update
  `, [EMPLOYEE_ID, STORE_ID])
  if (employeeRes.rowCount !== 1) throw new Error('Funcionario Ozias nao encontrado')
  if (employeeRes.rows[0].full_name !== 'Ozias') throw new Error('Funcionario 2 nao e mais o Ozias')

  const paymentInsert = await client.query(`
    insert into public.pagamentos (
      tenant_id, store_id, venda_id, customer_id, employee_id,
      valor_pago, forma_pagamento, parcelas, data_pagamento, created_at,
      created_by_user_id, obs, parcela_id
    ) values (
      $1, $2, $3, $4, $5,
      $6, 'Dinheiro', 1, $7::date, $8::timestamptz,
      $9, '', null
    )
    returning id, valor_pago, forma_pagamento, data_pagamento, created_at, employee_id
  `, [
    TENANT_ID, STORE_ID, VENDA_ID, CUSTOMER_ID, EMPLOYEE_ID,
    AMOUNT, PAYMENT_DATE, PAYMENT_CREATED_AT, CREATED_BY_USER_ID,
  ])

  await client.query('select public.update_venda_financeiro($1::bigint)', [VENDA_ID])

  const afterFinance = await client.query(`
    select status, valor_final, valor_restante, financiamento_id
    from public.vendas
    where id = $1
  `, [VENDA_ID])
  const restante = Number(afterFinance.rows[0].valor_restante)
  if (afterFinance.rows[0].status !== 'Em Aberto') throw new Error('Status mudou antes do fechamento')
  if (afterFinance.rows[0].financiamento_id != null) throw new Error('Carne apareceu durante o pagamento')
  if (restante > 0.01) throw new Error(`Saldo nao zerou apos pagamento: ${restante}`)

  await client.query(`
    update public.vendas
    set status = 'Fechada',
        data_fechamento = $2::timestamptz
    where id = $1 and store_id = $3 and status = 'Em Aberto'
  `, [VENDA_ID, CLOSE_AT, STORE_ID])

  const closed = await client.query(`
    select status, valor_restante, data_fechamento
    from public.vendas
    where id = $1
  `, [VENDA_ID])
  if (closed.rows[0].status !== 'Fechada') throw new Error('Falha ao fechar a venda')
  if (Number(closed.rows[0].valor_restante) > 0.01) throw new Error('Venda fechada com saldo restante')

  const stockRes = await client.query(`
    select id, tipo, motivo, product_id, related_os_id
    from public.stock_movements
    where store_id = $1
      and related_os_id = $2
      and tipo in ('Reserva', 'Saida')
    for update
  `, [STORE_ID, OS_ID])

  const pendingReservations = stockRes.rows.filter((movement) => {
    const reason = String(movement.motivo || '').toLowerCase()
    return reason.startsWith('reserva automatica') || reason.startsWith('reserva manual')
  })

  for (const reservation of pendingReservations) {
    await client.query(`
      update public.stock_movements
      set tipo = 'Saida',
          motivo = $2
      where id = $1
    `, [
      reservation.id,
      `Venda #${VENDA_ID} Finalizada (Era Reserva) | ${reservation.motivo}`,
    ])
  }

  const existingSaleExit = await client.query(`
    select id
    from public.stock_movements
    where store_id = $1
      and product_id = 4510
      and tipo = 'Saida'
      and (
        related_venda_id = $2
        or motivo ilike $3
      )
    limit 1
  `, [STORE_ID, VENDA_ID, `Venda #${VENDA_ID}%`])
  if (existingSaleExit.rowCount === 0 && pendingReservations.length === 0) {
    throw new Error('Nem reserva nem saida de estoque encontrada para confirmar')
  }

  const employee = employeeRes.rows[0]
  const rateGuaranteed = Number(employee.comm_rate_guaranteed || 0)
  const rateCredit = Number(employee.comm_rate_store_credit || 0)
  if (rateGuaranteed !== 0 || rateCredit !== 0) {
    throw new Error('Taxas individuais do Ozias mudaram; comissao individual exigiria recálculo explicito')
  }

  const existingIndividual = await client.query(`
    select id from public.commissions
    where venda_id = $1 and type = 'individual' and status = 'Pendente'
  `, [VENDA_ID])
  if (existingIndividual.rowCount > 0) {
    throw new Error('Ja existe comissao individual pendente; nenhuma alteracao aplicada')
  }

  const rankingRes = await client.query(`
    select coalesce(sum(valor_final), 0) as total
    from public.vendas
    where customer_id = $1
      and status = 'Fechada'
      and coalesce(is_historical_import, false) = false
  `, [CUSTOMER_ID])
  const totalGasto = Number(rankingRes.rows[0].total || 0)
  let novoRanking = 'Bronze'
  if (totalGasto >= 5000) novoRanking = 'Diamante'
  else if (totalGasto >= 2500) novoRanking = 'Ouro'
  else if (totalGasto >= 1000) novoRanking = 'Prata'

  await client.query(`
    update public.customers
    set ranking = $2
    where id = $1
  `, [CUSTOMER_ID, novoRanking])

  await client.query('COMMIT')

  const verify = await client.query(`
    select
      v.id as venda_id,
      v.status,
      v.valor_final,
      v.valor_restante,
      v.data_fechamento,
      v.employee_id,
      p.id as pagamento_id,
      p.valor_pago,
      p.forma_pagamento,
      p.data_pagamento,
      p.created_at as pagamento_created_at,
      p.employee_id as pagamento_employee_id,
      p.receipt_printed_at,
      c.ranking,
      sm.id as stock_id,
      sm.tipo as stock_tipo,
      sm.motivo as stock_motivo
    from public.vendas v
    left join public.pagamentos p on p.venda_id = v.id
    left join public.customers c on c.id = v.customer_id
    left join public.stock_movements sm on sm.related_os_id = $2
    where v.id = $1
  `, [VENDA_ID, OS_ID])

  const commissions = await client.query(`
    select id, type, amount, status, employee_id, oftalmologista_id, commission_stage
    from public.commissions
    where venda_id = $1
  `, [VENDA_ID])

  console.log(JSON.stringify({
    ok: true,
    venda: {
      id: verify.rows[0].venda_id,
      status: verify.rows[0].status,
      valor_final: verify.rows[0].valor_final,
      valor_restante: verify.rows[0].valor_restante,
      data_fechamento: verify.rows[0].data_fechamento,
    },
    pagamento: paymentInsert.rows[0],
    ranking: verify.rows[0].ranking,
    stock: verify.rows.map((row) => ({
      id: row.stock_id,
      tipo: row.stock_tipo,
      motivo: row.stock_motivo,
    })),
    commissions_da_venda: commissions.rows,
    individual_commission: 'nao gerada: Ozias tem 0% garantida/risco; 1% received e comissao global do periodo',
  }, null, 2))
} catch (error) {
  await client.query('ROLLBACK')
  throw error
} finally {
  await client.end()
}
