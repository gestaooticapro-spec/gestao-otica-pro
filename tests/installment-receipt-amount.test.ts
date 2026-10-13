import assert from 'node:assert/strict'
import test from 'node:test'
import { installmentReceiptAmount } from '../src/lib/installment-receipt-amount'

test('the WhatsApp receipt uses the whole amount received, including later installments of the same payment', () => {
  const amount = installmentReceiptAmount({
    installmentPayments: [{ valor_pago: 70 }],
    operationPayments: [{ valor_pago: 70 }, { valor_pago: 65 }, { valor_pago: 65 }],
    installmentFallbackAmount: 70,
  })
  assert.equal(amount, 200)
})

test('a payment that stays on one installment keeps that received amount', () => {
  const amount = installmentReceiptAmount({
    installmentPayments: [{ valor_pago: 200 }],
    operationPayments: [{ valor_pago: 200 }],
    installmentFallbackAmount: 250,
  })
  assert.equal(amount, 200)
})

test('a receipt without an operation still uses the payments recorded on the installment', () => {
  const amount = installmentReceiptAmount({
    installmentPayments: [{ valor_pago: 40 }, { valor_pago: 60 }],
    operationPayments: null,
    installmentFallbackAmount: 0,
  })
  assert.equal(amount, 100)
})
