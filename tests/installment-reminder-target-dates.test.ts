import assert from 'node:assert/strict'
import test from 'node:test'
import { getInstallmentReminderTargetDates } from '../src/lib/whatsapp/installment-reminders'

test('installment reminder targets configured days and one day before due', () => {
  assert.deepEqual(
    getInstallmentReminderTargetDates('2026-10-01', 2),
    ['2026-10-03', '2026-10-02']
  )
})

test('installment reminder target dates are unique when configured for one day', () => {
  assert.deepEqual(
    getInstallmentReminderTargetDates('2026-10-01', 1),
    ['2026-10-02']
  )
})

test('invalid or non-positive configured offsets do not create targets', () => {
  assert.deepEqual(getInstallmentReminderTargetDates('2026-10-01', 0), ['2026-10-02'])
  assert.deepEqual(getInstallmentReminderTargetDates('2026-10-01', Number.NaN), ['2026-10-02'])
})
