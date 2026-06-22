import assert from 'node:assert/strict'
import {
  buildPostSaleFollowupMessage,
  buildPostSaleFollowupSettings,
  extractPostSaleRating,
  readPostSaleContext,
} from '@/lib/whatsapp/post-sale-followup'

const defaults = buildPostSaleFollowupSettings(undefined)
assert.equal(defaults.enabled, false)
assert.equal(defaults.days_after_delivery, 7)
assert.equal(defaults.business_hours_only, true)
assert.match(defaults.template, /adaptacao/i)

const message = buildPostSaleFollowupMessage({
  template: 'Ola {nome}! Como esta a adaptacao com {paciente} depois de {dias} dias?',
  customerName: 'Maria Silva',
  dependentName: 'Joao Silva',
  daysSinceDelivery: 8,
})
assert.equal(message, 'Ola Maria! Como esta a adaptacao com os oculos de Joao Silva depois de 8 dias?')

assert.equal(extractPostSaleRating('5'), 5)
assert.equal(extractPostSaleRating('nota 4'), 4)
assert.equal(extractPostSaleRating('dou nota 2 pra adaptacao'), 2)
assert.equal(extractPostSaleRating('zero'), null)

const context = readPostSaleContext({
  postSaleContext: {
    followupId: 12,
    postSalesId: 34,
    serviceOrderId: 56,
    customerId: 78,
    deliveryDate: '2026-06-15',
    stage: 'awaiting_rating',
    ratingPromptCount: 1,
  },
} as never)

assert.deepEqual(context, {
  followupId: 12,
  postSalesId: 34,
  serviceOrderId: 56,
  customerId: 78,
  deliveryDate: '2026-06-15',
  stage: 'awaiting_rating',
  ratingPromptCount: 1,
})

console.log('WhatsApp post-sale follow-up helper checks passed.')
