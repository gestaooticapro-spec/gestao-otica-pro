import assert from 'node:assert/strict'
import test from 'node:test'

import { getBillingBannerPresentation, getBillingNoticePeriod } from '../src/lib/billing/billing-status-ui'
import type { BillingStoreStatus } from '../src/lib/billing/integracao-asaas'

const now = new Date(2026, 7, 3, 12, 0, 0)

type StatusOverrides = Partial<Omit<BillingStoreStatus, 'store'>> & {
  store?: Partial<NonNullable<BillingStoreStatus['store']>>
}

function status(overrides: StatusOverrides = {}): BillingStoreStatus {
  const base: BillingStoreStatus = {
    status: 'ativo' as const,
    blockAfter: null,
    daysUntilDue: null,
    paymentDueSoon: true,
    shouldShowBillingReminder: true,
    shouldBlockNewOperations: false,
    blockScope: 'none' as const,
    store: { store_id: '1', store_name: 'Loja teste', monthly_amount: 150, paid_until: '2026-08-03', payment_qr_code: 'qr', payment_copy_paste: 'pix' },
  }

  return { ...base, ...overrides, store: { ...base.store!, ...overrides.store } as NonNullable<BillingStoreStatus['store']> }
}

test('mostra vencimento hoje como mensalidade em dia', () => {
  const result = getBillingBannerPresentation(status(), now)
  assert.equal(result.title, 'Mensalidade em dia')
  assert.match(result.message, /vence hoje/)
  assert.equal(result.canPay, true)
})

test('permite pagamento antecipado para vencimento amanha', () => {
  const result = getBillingBannerPresentation(status({ store: { monthly_amount: 150, paid_until: '2026-08-04', payment_qr_code: 'qr' } }), now)
  assert.match(result.message, /pagamento antecipado/)
  assert.equal(result.canPay, true)
})

test('informa pendencia vencida e a proximidade do bloqueio', () => {
  const result = getBillingBannerPresentation(status({ status: 'pendente', blockAfter: '2026-08-05', store: { monthly_amount: 150, paid_until: '2026-08-01' } }), now)
  assert.equal(result.title, 'Mensalidade pendente')
  assert.match(result.message, /bloqueado em 2 dias/)
})

test('informa pendencia sem data de pagamento', () => {
  const result = getBillingBannerPresentation(status({ status: 'pendente', store: { monthly_amount: 150, paid_until: null } }), now)
  assert.match(result.message, /mensalidade pendente/)
})

test('na data final de tolerancia o aviso nao pode ser dispensado', () => {
  const result = getBillingBannerPresentation(status({ status: 'pendente', blockAfter: '2026-08-03' }), now)
  assert.equal(result.isFinalGraceDay, true)
  assert.match(result.message, /último dia de tolerância/)
})

test('informa o bloqueio de novas vendas', () => {
  const result = getBillingBannerPresentation(status({ status: 'bloqueado', shouldBlockNewOperations: true }), now)
  assert.equal(result.isBlocked, true)
  assert.equal(result.title, 'Mensalidade em atraso')
})

test('vip nao exibe atalho de pagamento', () => {
  const result = getBillingBannerPresentation(status({ status: 'vip', paymentDueSoon: false }), now)
  assert.equal(result.canPay, false)
  assert.equal(result.showBanner, false)
})

test('nao exibe pagamento fora de um estado de cobranca', () => {
  const result = getBillingBannerPresentation(status({ paymentDueSoon: false, store: { monthly_amount: 150, paid_until: '2026-08-20', payment_qr_code: 'qr' } }), now)
  assert.equal(result.canPay, false)
})

test('dispensa antes do vencimento dura D-2 e D-1, mas vence no dia do pagamento', () => {
  const billingStatus = status({ store: { paid_until: '2026-08-05' } })
  const dMinus2 = getBillingNoticePeriod(billingStatus, new Date(2026, 7, 3, 12))
  const dMinus1 = getBillingNoticePeriod(billingStatus, new Date(2026, 7, 4, 12))
  const dueDate = getBillingNoticePeriod(billingStatus, new Date(2026, 7, 5, 12))

  assert.equal(dMinus2, dMinus1)
  assert.notEqual(dMinus1, dueDate)
})
