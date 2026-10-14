import assert from 'node:assert/strict'
import test from 'node:test'
import { buildCarneReceiptSummary } from '../src/lib/carne-receipt-summary'

test('the installment receipt summary uses the contract, the money received, and the outstanding balance', () => {
  const summary = buildCarneReceiptSummary({
    contractAmount: 730,
    installments: [
      { valor_parcela: 146, valor_pago: 146, status: 'Pago' },
      { valor_parcela: 146, valor_pago: 146, status: 'Pago' },
      { valor_parcela: 146, valor_pago: 0, status: 'Pendente' },
      { valor_parcela: 146, valor_pago: 0, status: 'Pendente' },
      { valor_parcela: 146, valor_pago: 0, status: 'Pendente' },
    ],
  })
  assert.deepEqual(summary, { contractAmount: 730, paidAmount: 292, remainingAmount: 438 })
})

test('money transferred between installments is not counted again as paid', () => {
  const summary = buildCarneReceiptSummary({
    contractAmount: 240,
    installments: [
      { valor_parcela: 120, valor_pago: 100, valor_transferido_saida: 20, status: 'Pago' },
      { valor_parcela: 120, valor_pago: 0, valor_transferido_entrada: 20, status: 'Pendente' },
    ],
  })
  assert.deepEqual(summary, { contractAmount: 240, paidAmount: 100, remainingAmount: 140 })
})
