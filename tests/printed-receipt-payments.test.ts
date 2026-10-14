import assert from 'node:assert/strict'
import test from 'node:test'
import { printedReceiptPaymentIds } from '../src/lib/printed-receipt-payments'

test('a reprinted installment receipt includes every payment of the same receipt', () => {
  const ids = printedReceiptPaymentIds({
    installmentPayments: [{ id: 2225 }],
    operationPayments: [{ id: 2225 }, { id: 2226 }],
  })
  assert.deepEqual(ids, [2225, 2226])
})

test('a receipt that stayed on one installment keeps that payment', () => {
  const ids = printedReceiptPaymentIds({
    installmentPayments: [{ id: 2217 }],
    operationPayments: [{ id: 2217 }],
  })
  assert.deepEqual(ids, [2217])
})

test('a payment without a receipt operation uses the payments of the installment', () => {
  const ids = printedReceiptPaymentIds({
    installmentPayments: [{ id: 10 }, { id: 11 }],
    operationPayments: null,
  })
  assert.deepEqual(ids, [10, 11])
})
