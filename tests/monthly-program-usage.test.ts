import assert from 'node:assert/strict'
import test from 'node:test'
import { classifyProgramUsage } from '../src/lib/monthly-program-usage'
import { periodicPeriodForReportDate } from '../src/lib/daily-store-health'

test('classifica função desabilitada sem depender de histórico de uso', () => {
  const result = classifyProgramUsage({
    enabled: false,
    allTime: null,
    period: null,
    previousThreeMonths: null,
    eligibleAllTime: false,
    eligibleInPeriod: false,
  })

  assert.equal(result?.status, 'disabled')
})

test('classifica como nunca usada somente quando existe contexto elegível', () => {
  const usedNowhere = classifyProgramUsage({
    enabled: true,
    allTime: 0,
    period: 0,
    previousThreeMonths: 0,
    eligibleAllTime: true,
    eligibleInPeriod: true,
  })
  const noEligibleContext = classifyProgramUsage({
    enabled: true,
    allTime: 0,
    period: 0,
    previousThreeMonths: 0,
    eligibleAllTime: false,
    eligibleInPeriod: false,
  })

  assert.equal(usedNowhere?.status, 'never_used')
  assert.equal(noEligibleContext, null)
})

test('classifica queda forte como pouco usada', () => {
  const result = classifyProgramUsage({
    enabled: true,
    allTime: 40,
    period: 1,
    previousThreeMonths: 30,
    eligibleAllTime: true,
    eligibleInPeriod: true,
  })

  assert.equal(result?.status, 'underused')
  assert.equal(result?.previousMonthlyAverage, 10)
})

test('mantém silêncio quando o uso continua dentro do padrão', () => {
  const result = classifyProgramUsage({
    enabled: true,
    allTime: 40,
    period: 4,
    previousThreeMonths: 30,
    eligibleAllTime: true,
    eligibleInPeriod: true,
  })

  assert.equal(result, null)
})

test('abre o mes corrente somente em uma previa mensal explicita', () => {
  assert.equal(periodicPeriodForReportDate('2026-08-25', 'monthly'), null)
  assert.deepEqual(periodicPeriodForReportDate('2026-08-25', 'monthly', true), { start: '2026-08-01', end: '2026-08-25' })
  assert.equal(periodicPeriodForReportDate('2026-08-25', 'weekly', true), null)
})
