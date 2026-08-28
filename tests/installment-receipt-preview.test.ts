import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDefaultPartialReceiptStrategy,
  getInstallmentReceiptPreview,
} from '../src/lib/installment-balance'

test('classifica recebimento parcial descontando juros do principal', () => {
  const preview = getInstallmentReceiptPreview({
    outstanding: 100,
    receivedAmount: 70,
    interestAmount: 10,
  })

  assert.equal(preview.principalAmount, 60)
  assert.equal(preview.difference, 40)
  assert.equal(preview.isPartial, true)
  assert.equal(preview.isOverpayment, false)
})

test('classifica amortizacao extra para as proximas parcelas', () => {
  const preview = getInstallmentReceiptPreview({
    outstanding: 100,
    receivedAmount: 130,
  })

  assert.equal(preview.principalAmount, 130)
  assert.equal(preview.difference, -30)
  assert.equal(preview.isPartial, false)
  assert.equal(preview.isOverpayment, true)
})

test('sugere a mesma estrategia parcial usada na baixa manual', () => {
  assert.equal(getDefaultPartialReceiptStrategy(true), 'somar_proxima')
  assert.equal(getDefaultPartialReceiptStrategy(false), 'baixa_parcial')
})
