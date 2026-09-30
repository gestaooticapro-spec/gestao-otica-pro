import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canBypassPostSaleBusinessHoursForTest,
  decidePostSaleTurnDisposition,
  extractPostSaleRatingForStage,
  getPostSaleForcedToolCall,
  isStoreOnePostSaleTestProtocol,
  shouldUseStoreOnePilotDuringPostSale,
  transitionPostSaleContextAfterTurn,
  validatePostSaleActionReply,
  type PostSaleContext,
} from '../src/lib/whatsapp/post-sale-followup'

const MIN_CONFIDENCE = 0.72

test('gatilho manual aceita somente o protocolo ficticio autorizado da Loja 1', () => {
  assert.equal(isStoreOnePostSaleTestProtocol('1043'), true)
  assert.equal(isStoreOnePostSaleTestProtocol('OS 1043'), true)
  assert.equal(isStoreOnePostSaleTestProtocol('1044'), false)
  assert.equal(isStoreOnePostSaleTestProtocol(''), false)
})

test('bypass de expediente exige a OS de teste, Loja 1 e o ID exato da fila', () => {
  const base = {
    followupId: 7,
    targetFollowupId: 7,
    storeId: 1,
    manualTestMarker: 'store_1_protocol_1043',
  }
  assert.equal(canBypassPostSaleBusinessHoursForTest(base), true)
  assert.equal(canBypassPostSaleBusinessHoursForTest({ ...base, targetFollowupId: 8 }), false)
  assert.equal(canBypassPostSaleBusinessHoursForTest({ ...base, storeId: 2 }), false)
  assert.equal(canBypassPostSaleBusinessHoursForTest({ ...base, manualTestMarker: null }), false)
})

function classify(intent: string, automationCandidate = true, confidence = 0.95) {
  return decidePostSaleTurnDisposition({
    classificationSucceeded: true,
    confidence,
    automationCandidate,
    intent,
    minimumConfidence: MIN_CONFIDENCE,
  })
}

test('mantem o pos-venda pendente ao intercalar OS e retirada antes da nota', () => {
  let context: PostSaleContext = {
    postSalesId: 34,
    serviceOrderId: 56,
    stage: 'awaiting_feedback',
  }

  assert.equal(classify('order_status'), 'route_other_topic')
  context = transitionPostSaleContextAfterTurn(context, 'preserve')!
  assert.equal(context.stage, 'awaiting_feedback')

  assert.equal(classify('post_sale_positive'), 'handle_post_sale')
  assert.deepEqual(getPostSaleForcedToolCall({
    context,
    disposition: 'handle_post_sale',
    intent: 'post_sale_positive',
    explicitRating: null,
  }), { name: 'request_post_sale_rating' })
  context = transitionPostSaleContextAfterTurn(context, 'rating_requested')!
  assert.equal(context.stage, 'awaiting_rating')

  assert.equal(classify('pickup_or_scheduling'), 'route_other_topic')
  assert.equal(extractPostSaleRatingForStage('Vou aí buscar.', context.stage), null)
  context = transitionPostSaleContextAfterTurn(context, 'preserve')!
  assert.equal(context.stage, 'awaiting_rating')

  assert.equal(extractPostSaleRatingForStage('Obrigado. Nota 5.', context.stage), 5)
  assert.deepEqual(getPostSaleForcedToolCall({
    context,
    disposition: 'handle_post_sale',
    intent: null,
    explicitRating: 5,
  }), { name: 'record_post_sale_rating', rating: 5 })
  context = transitionPostSaleContextAfterTurn(context, 'rating_recorded')!
  assert.equal(context.stage, 'completed')
  assert.equal(extractPostSaleRatingForStage('Nota 4', context.stage), null)
})

test('piloto da Loja 1 deixa o pos-venda tratar adaptacao e nota apos uma consulta de OS', () => {
  let context: PostSaleContext = { postSalesId: 34, stage: 'awaiting_feedback' }
  const route = (intent: string | null, overrides: Partial<Parameters<typeof shouldUseStoreOnePilotDuringPostSale>[0]> = {}) =>
    shouldUseStoreOnePilotDuringPostSale({
      context,
      explicitRating: null,
      explicitOrderRequest: false,
      classificationSucceeded: true,
      intent,
      confidence: 0.95,
      minimumConfidence: 0.78,
      ...overrides,
    })

  assert.equal(route('order_status'), true)
  assert.equal(route('order_status', { confidence: 0.4 }), false)
  assert.equal(route(null, { classificationSucceeded: false }), false)
  assert.equal(route('post_sale_positive'), false)
  assert.equal(route('complaint_or_adaptation'), false)
  assert.equal(route('post_sale_positive', { explicitOrderRequest: true }), true)
  assert.equal(route('order_status', { explicitRating: 5 }), false)

  context = transitionPostSaleContextAfterTurn(context, 'rating_requested')!
  assert.equal(context.stage, 'awaiting_rating')
  assert.equal(route('pickup_or_scheduling'), false)
  assert.equal(route(null, { explicitRating: 5, classificationSucceeded: false }), false)
  context = transitionPostSaleContextAfterTurn(context, 'rating_recorded')!
  assert.equal(route('order_status'), true)
  assert.equal(route('order_status', { context: null }), true)
})

test('mensagem incerta suprime resposta sem converter o acompanhamento em handoff', () => {
  assert.equal(classify('unknown', false), 'suppress_preserving_context')
  assert.equal(classify('store_hours', true, 0.4), 'suppress_preserving_context')
  assert.equal(decidePostSaleTurnDisposition({
    classificationSucceeded: false,
    confidence: 0,
    automationCandidate: false,
    intent: null,
    minimumConfidence: MIN_CONFIDENCE,
  }), 'suppress_preserving_context')
})

test('aceita redacoes naturais que cumprem a acao e rejeita resposta generica ou nota errada', () => {
  assert.deepEqual(validatePostSaleActionReply({
    action: 'request_rating', text: 'Fico feliz que esteja se adaptando bem! Que nota de 1 a 5 daria ao atendimento?',
  }), { valid: true })
  assert.deepEqual(validatePostSaleActionReply({
    action: 'confirm_rating', rating: 5, text: 'Obrigado pelo retorno! Sua nota 5 foi registrada.',
  }), { valid: true })
  assert.deepEqual(validatePostSaleActionReply({
    action: 'request_rating', text: 'Oi! Posso te ajudar com isso?',
  }), { valid: false, reason: 'rating_question_missing' })
  assert.deepEqual(validatePostSaleActionReply({
    action: 'confirm_rating', rating: 5, text: 'Obrigado! A nota 4 foi registrada.',
  }), { valid: false, reason: 'rating_confirmation_missing' })
  assert.deepEqual(validatePostSaleActionReply({
    action: 'confirm_rating', rating: 5, text: 'Obrigado pela nota 5. Vou registrar seu retorno.',
  }), { valid: false, reason: 'rating_confirmation_missing' })
  assert.deepEqual(validatePostSaleActionReply({
    action: 'request_rating', text: 'Que bom! A OS 1041 está pronta. Pode dar uma nota de 1 a 5?',
  }), { valid: false, reason: 'unrelated_customer_facts' })
})
