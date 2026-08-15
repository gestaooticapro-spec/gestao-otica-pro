import 'server-only'

export type ReceiptReversalMetadata = {
  kind: 'tracked' | 'legacy_exact'
  id?: number
  legacy_installment_id?: number
  received_amount: number
  interest_amount?: number | null
  payment_method: string
  received_on: string
  affected_installment_count: number
}

const sameMoney = (left: unknown, right: unknown) => Math.abs(Number(left || 0) - Number(right || 0)) <= 0.01
const datePart = (value: unknown) => String(value || '').split('T')[0]
const nullableKey = (value: unknown) => value == null ? '<null>' : String(value)

function receiptSignature(payment: any) {
  return [
    Number(payment.venda_id || 0),
    datePart(payment.data_pagamento || payment.created_at),
    nullableKey(payment.employee_id),
    nullableKey(payment.created_by_user_id),
    String(payment.forma_pagamento || '').trim().toLocaleLowerCase('pt-BR'),
  ].join('|')
}

export async function getReceiptReversalMetadata(
  supabaseAdmin: any,
  financingIdsInput: unknown[],
): Promise<Map<number, ReceiptReversalMetadata>> {
  const financingIds = Array.from(new Set(
    financingIdsInput.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
  ))
  const result = new Map<number, ReceiptReversalMetadata>()
  if (financingIds.length === 0) return result

  const [{ data: installments }, { data: operations }, { data: renegotiations }] = await Promise.all([
    (supabaseAdmin.from('financiamento_parcelas') as any)
      .select(`
        id,
        financiamento_id,
        valor_parcela,
        valor_pago,
        status,
        data_pagamento,
        financiamento_loja (
          venda_id,
          vendas!financiamento_loja_venda_id_fkey ( is_historical_import )
        )
      `)
      .in('financiamento_id', financingIds),
    (supabaseAdmin.from('installment_receipt_operations') as any)
      .select('id, financiamento_id, origin_installment_id, received_amount, interest_amount, payment_method, received_on, created_at, affected_installment_count, strategy')
      .in('financiamento_id', financingIds)
      .eq('state', 'completed')
      .is('reversed_at', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false }),
    (supabaseAdmin.from('installment_renegotiations') as any)
      .select('financiamento_id, created_at')
      .in('financiamento_id', financingIds),
  ])

  const latestRenegotiationByFinancing = new Map<number, string>()
  for (const renegotiation of renegotiations || []) {
    const financingId = Number(renegotiation.financiamento_id)
    const createdAt = String(renegotiation.created_at || '')
    if (!latestRenegotiationByFinancing.has(financingId) || createdAt > String(latestRenegotiationByFinancing.get(financingId))) {
      latestRenegotiationByFinancing.set(financingId, createdAt)
    }
  }

  const latestTrackedByFinancing = new Map<number, any>()
  const financingWithLatestOperation = new Set<number>()
  for (const operation of operations || []) {
    const financingId = Number(operation.financiamento_id)
    if (financingWithLatestOperation.has(financingId)) continue
    financingWithLatestOperation.add(financingId)
    const renegotiatedAfterOperation = String(latestRenegotiationByFinancing.get(financingId) || '') > String(operation.created_at || '')
    if (operation.strategy !== 'legacy_reconciliation' && !renegotiatedAfterOperation) {
      latestTrackedByFinancing.set(financingId, operation)
    }
  }

  for (const operation of latestTrackedByFinancing.values()) {
    result.set(Number(operation.origin_installment_id), {
      kind: 'tracked',
      id: Number(operation.id),
      received_amount: Number(operation.received_amount || 0),
      interest_amount: Number(operation.interest_amount || 0),
      payment_method: String(operation.payment_method || ''),
      received_on: String(operation.received_on || ''),
      affected_installment_count: Number(operation.affected_installment_count || 1),
    })
  }

  // O estorno de pagamentos legados nao esta habilitado: estes recebimentos
  // nao possuem snapshot atomico e alguns bancos nem contem a RPC historica.
  // Mantemos a rotina de leitura abaixo apenas como referencia para uma futura
  // reativacao segura, sem expor o botao ao operador.
  const financingWithoutTrackedOperation: number[] = [] // financingIds.filter((id) => !financingWithLatestOperation.has(id))
  if (financingWithoutTrackedOperation.length === 0) return result

  const allInstallments = (installments || []) as any[]
  const legacyFinancingInstallments = allInstallments.filter((installment) => (
    financingWithoutTrackedOperation.includes(Number(installment.financiamento_id))
  ))
  const installmentIds = legacyFinancingInstallments.map((installment) => Number(installment.id))
  if (installmentIds.length === 0) return result

  const { data: payments } = await (supabaseAdmin.from('pagamentos') as any)
    .select('id, parcela_id, venda_id, valor_pago, data_pagamento, employee_id, created_by_user_id, forma_pagamento, created_at, receipt_operation_id')
    .in('parcela_id', installmentIds)
    .is('receipt_operation_id', null)
    .order('data_pagamento', { ascending: false })
    .order('id', { ascending: false })

  const installmentsById = new Map(legacyFinancingInstallments.map((installment) => [Number(installment.id), installment]))
  const paymentsByInstallment = new Map<number, any[]>()
  const paymentsByFinancing = new Map<number, any[]>()

  for (const payment of payments || []) {
    const installmentId = Number(payment.parcela_id)
    const installment = installmentsById.get(installmentId)
    if (!installment) continue
    const financingId = Number(installment.financiamento_id)
    paymentsByInstallment.set(installmentId, [...(paymentsByInstallment.get(installmentId) || []), payment])
    paymentsByFinancing.set(financingId, [...(paymentsByFinancing.get(financingId) || []), payment])
  }

  for (const financingId of financingWithoutTrackedOperation) {
    const latestRenegotiation = String(latestRenegotiationByFinancing.get(financingId) || '')
    const financingPayments = (paymentsByFinancing.get(financingId) || []).filter((payment) => (
      !latestRenegotiation || datePart(payment.data_pagamento || payment.created_at) > datePart(latestRenegotiation)
    ))
    if (financingPayments.length === 0) continue

    const latestPayment = [...financingPayments].sort((left, right) => {
      const dateOrder = datePart(right.data_pagamento || right.created_at).localeCompare(datePart(left.data_pagamento || left.created_at))
      return dateOrder || Number(right.id) - Number(left.id)
    })[0]
    const installmentId = Number(latestPayment.parcela_id)
    const installment = installmentsById.get(installmentId)
    const installmentPayments = paymentsByInstallment.get(installmentId) || []
    if (!installment || installmentPayments.length !== 1) continue

    const isPaid = String(installment.status || '').toLocaleLowerCase('pt-BR') === 'pago'
      && Boolean(installment.data_pagamento)
    const exactAmount = Number(latestPayment.valor_pago || 0) > 0
      && sameMoney(latestPayment.valor_pago, installment.valor_parcela)
      && sameMoney(latestPayment.valor_pago, installment.valor_pago)
    const signature = receiptSignature(latestPayment)
    const hasSiblingWithSameSignature = financingPayments.some((payment) => (
      Number(payment.parcela_id) !== installmentId && receiptSignature(payment) === signature
    ))

    if (!isPaid || !exactAmount || hasSiblingWithSameSignature) continue

    result.set(installmentId, {
      kind: 'legacy_exact',
      legacy_installment_id: installmentId,
      received_amount: Number(latestPayment.valor_pago),
      interest_amount: 0,
      payment_method: String(latestPayment.forma_pagamento || ''),
      received_on: datePart(latestPayment.data_pagamento || latestPayment.created_at),
      affected_installment_count: 1,
    })
  }

  return result
}
