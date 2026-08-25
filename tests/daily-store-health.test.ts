import assert from 'node:assert/strict'
import test from 'node:test'
import { dailyHealthTestables, type DailyHealthAlert } from '../src/lib/daily-store-health'

const alert = (overrides: Partial<DailyHealthAlert> = {}): DailyHealthAlert => ({
  id: 'overdue-installments',
  area: 'financeiro',
  priority: 'atencao',
  title: 'Parcelas vencidas',
  detail: 'Permanecem em aberto.',
  impact: 200,
  confidence: 'alta',
  href: '',
  records: { type: 'parcela', ids: [1] },
  ...overrides,
})

test('does not mark an alert resolved when its data source is unavailable', () => {
  const previous = alert({ lifecycle: { state: 'novo', firstSeen: '2026-08-20', daysOpen: 3, previousImpact: null, impactChange: null, newRecords: 1, resolvedRecords: 0, show: true } })
  const result = dailyHealthTestables.compareAlerts([], [previous], '2026-08-22', '2026-08-23', new Set(['parcelas']))

  assert.equal(result.lifecycle.financeiro.resolvedCount, 0)
})

test('repeats a persistent alert when a scheduled milestone was crossed during a missed generation', () => {
  const previous = alert({ lifecycle: { state: 'persistente', firstSeen: '2026-08-17', daysOpen: 6, previousImpact: 200, impactChange: 0, newRecords: 0, resolvedRecords: 0, show: false } })
  const result = dailyHealthTestables.compareAlerts([alert()], [previous], '2026-08-22', '2026-08-24')

  assert.equal(result.alerts[0].lifecycle?.daysOpen, 8)
  assert.equal(result.alerts[0].lifecycle?.show, true)
})

test('shows a persistent-value alert when affected records changed', () => {
  const previous = alert({ lifecycle: { state: 'novo', firstSeen: '2026-08-22', daysOpen: 1, previousImpact: null, impactChange: null, newRecords: 1, resolvedRecords: 0, show: true } })
  const current = alert({ records: { type: 'parcela', ids: [2] } })
  const result = dailyHealthTestables.compareAlerts([current], [previous], '2026-08-22', '2026-08-23')

  assert.equal(result.alerts[0].lifecycle?.state, 'persistente')
  assert.equal(result.alerts[0].lifecycle?.newRecords, 1)
  assert.equal(result.alerts[0].lifecycle?.show, true)
})

test('keeps an unresolved local mounting alert visible on the following day', () => {
  const previous = alert({
    id: 'lens-mounting-overdue',
    area: 'operacao',
    priority: 'critico',
    detail: 'A lente ja chegou na loja, mas a montagem local ainda nao foi registrada.',
    lifecycle: { state: 'novo', firstSeen: '2026-08-22', daysOpen: 1, previousImpact: null, impactChange: null, newRecords: 1, resolvedRecords: 0, show: true },
  })
  const current = { ...previous, lifecycle: undefined }
  const result = dailyHealthTestables.compareAlerts([current], [previous], '2026-08-22', '2026-08-23')

  assert.equal(result.alerts[0].lifecycle?.show, true)
  assert.match(result.alerts[0].detail, /nao foi resolvido desde ontem/i)
})

test('starts the 24-hour clock when the lens arrives at the store', () => {
  const reportEnd = new Date('2026-08-24T23:59:59-03:00').getTime()
  const result = dailyHealthTestables.buildMountingAttention([
    { id: 1, dt_lente_chegou: '2026-08-23T20:00:00-03:00', dt_montado_em: null, armacao_com_cliente: false },
    { id: 2, dt_pedido_em: '2026-08-22T10:00:00-03:00', dt_lente_chegou: '2026-08-24T12:00:00-03:00', dt_montado_em: null, armacao_com_cliente: false },
    { id: 3, dt_lente_chegou: '2026-08-16T10:00:00-03:00', dt_montado_em: null, armacao_com_cliente: true },
    { id: 4, dt_lente_chegou: '2026-08-20T10:00:00-03:00', dt_montado_em: null, dt_montado_no_lab: '2026-08-20T12:00:00-03:00', armacao_com_cliente: false },
  ], reportEnd)

  assert.deepEqual(result.mountingOverdue.map((order: any) => order.id), [1])
  assert.deepEqual(result.mountingWaitingForFrame.map((order: any) => order.id), [3])
})

test('does not treat a contact-lens sale as an optical OS inconsistency', () => {
  const result = dailyHealthTestables.buildOrderIntegrityAttention([
    { id: 1, venda_id: 100, links: [] },
    { id: 2, venda_id: 200, links: [{ uso_na_os: 'lente_od' }], receita_longe_od_esferico: null },
  ], new Set([200]))

  assert.deepEqual(result.ordersWithoutLensLink.map((order: any) => order.id), [])
  assert.deepEqual(result.ordersWithoutPrescription.map((order: any) => order.id), [2])
})

test('rejects AI text that invents a number or unsupported explanation', () => {
  const evidence = ['3 OS sem data prometida.']

  assert.equal(dailyHealthTestables.isGroundedAiText('Existem 3 OS sem data prometida.', evidence), true)
  assert.equal(dailyHealthTestables.isGroundedAiText('Existem 9 OS sem data prometida.', evidence), false)
  assert.equal(dailyHealthTestables.isGroundedAiText('Existem 3 OS sem data prometida porque a equipe esqueceu.', evidence), false)
})

test('keeps a ready snapshot immutable', () => {
  assert.equal(dailyHealthTestables.isReadySnapshot({ status: 'ready' }), true)
  assert.equal(dailyHealthTestables.isReadySnapshot({ status: 'failed' }), false)
})

test('uses only the affected post-sales IDs as alert evidence', () => {
  const analysis = dailyHealthTestables.buildPostSaleAnalysis(
    [{ id: 1, service_order_id: 10, avaliacao_cliente: null }, { id: 2, service_order_id: 20, avaliacao_cliente: null }],
    [{ post_sales_id: 2, status: 'failed', channel_id: 1, remote_phone: '5511999999999', created_at: '2026-08-23T10:00:00Z' }],
    [{ post_sales_id: 1, resumo: 'atendimento humano solicitado' }],
    [{ id: 10, customers: { phone: '11999999999' } }, { id: 20, customers: { phone: '11888888888' } }],
    [],
  )

  assert.deepEqual(analysis.deliveryIssueIds, [1, 2])
  assert.deepEqual(analysis.humanReviewIds, [1])
  assert.deepEqual(analysis.satisfactionIds, [])
})

test('ignores accounts payable when there are no pending balances', () => {
  const analysis = dailyHealthTestables.buildAccountsPayableAnalysis([
    { id: 1, status: 'Pago', amount: 100, amount_paid: 100, due_date: '2026-08-20' },
    { id: 2, status: 'Cancelado', amount: 100, amount_paid: 0, due_date: '2026-08-20' },
  ], '2026-08-23')

  assert.equal(analysis, undefined)
})
