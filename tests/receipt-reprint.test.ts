import assert from 'node:assert/strict'
import test from 'node:test'
import { shouldStampGroupedReceipt } from '../src/lib/receipt-reprint'

test('a grouped receipt of new sale payments stays unstamped', () => {
  assert.equal(shouldStampGroupedReceipt([
    { parcela_id: null, receipt_printed_at: null },
    { parcela_id: null, receipt_printed_at: null },
  ]), false)
})

test('an installment payment stamps the whole sheet, even beside a new sale payment', () => {
  assert.equal(shouldStampGroupedReceipt([
    { parcela_id: null, receipt_printed_at: null },
    { parcela_id: 10, receipt_printed_at: null },
  ]), true)
})

test('a sale payment that was already printed stamps the whole sheet', () => {
  assert.equal(shouldStampGroupedReceipt([
    { parcela_id: null, receipt_printed_at: null },
    { parcela_id: null, receipt_printed_at: '2026-10-14T13:16:00Z' },
  ]), true)
})
