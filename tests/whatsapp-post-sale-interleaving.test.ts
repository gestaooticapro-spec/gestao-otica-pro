import assert from 'node:assert/strict'
import test from 'node:test'
import {
  canClassifyPostSaleMessage,
  canBypassPostSaleBusinessHoursForTest,
  canReuseStoreOnePostSaleTestFollowup,
  decidePostSaleDeadlineOutcome,
  decidePostSaleTurnDisposition,
  currentPostSaleDeliveryAge,
  uniqueOpenConfirmedFollowup,
  resolvePostSaleContextualSignal,
  extractPostSaleRatingForStage,
  getPostSaleForcedToolCall,
  isStoreOnePostSaleTestProtocol,
  shouldUseStoreOnePilotDuringPostSale,
  transitionPostSaleContextAfterTurn,
  validatePostSaleActionReply,
  type PostSaleContext,
} from '../src/lib/whatsapp/post-sale-followup'
import { WhatsAppPostSaleRatingResolutionSchema } from '../src/lib/whatsapp/ai'
import { resolveStoreOnePilotReplyText, type PilotSafeReply } from '../src/lib/whatsapp/redesign/safe-replies-pilot'

const MIN_CONFIDENCE = 0.72

test('retoma saudacao sem registrar adaptacao e continua a avaliacao positiva seguinte', () => {
  const context: PostSaleContext = { postSalesId: 34, serviceOrderId: 56, stage: 'awaiting_feedback' }
  const input = { context, messageText: 'Esta bom, so quero apertar a armacao', hasAttachment: false, confidence: 0.95, minimumConfidence: MIN_CONFIDENCE,
    explicitHumanRequest: false, explicitOrderRequest: false }
  assert.equal(resolvePostSaleContextualSignal({ ...input, signal: 'greeting' }), 'greeting')
  assert.equal(getPostSaleForcedToolCall({ context, disposition: 'handle_post_sale', intent: 'unknown', explicitRating: null }), null)
  assert.deepEqual(transitionPostSaleContextAfterTurn(context, 'preserve'), context)
  assert.deepEqual(getPostSaleForcedToolCall({ context, disposition: 'handle_post_sale', intent: 'post_sale_positive', explicitRating: null }), { name: 'request_post_sale_rating' })
  assert.equal(resolvePostSaleContextualSignal({ ...input, signal: 'frame_adjustment' }), 'frame_adjustment')
  for (const override of [{ explicitHumanRequest: true }, { explicitOrderRequest: true }, { confidence: 0.2 },
    { context: { ...context, stage: 'handoff' as const } }, { context: { ...context, stage: 'completed' as const } }]) {
    assert.equal(resolvePostSaleContextualSignal({ ...input, signal: 'frame_adjustment', ...override }), null)
  }
})

test('retomada exige um unico acompanhamento confirmado sem misturar novas OSs ou grupos', () => {
  const oldGroup = { service_order_id: 866, covered_service_order_ids: [866, 865] }
  const newGroup = { service_order_id: 1079, covered_service_order_ids: [1079] }
  assert.equal(uniqueOpenConfirmedFollowup([oldGroup], [865, 866, 1079]), oldGroup)
  assert.equal(uniqueOpenConfirmedFollowup([oldGroup, newGroup], [865, 866, 1079]), null)
  assert.equal(uniqueOpenConfirmedFollowup([], [865]), null)
  assert.equal(uniqueOpenConfirmedFollowup([oldGroup], [1079]), null)
})

test('tempo de retirada e recalculado no envio e contatos fora da janela nao sao recuperados', () => {
  assert.equal(currentPostSaleDeliveryAge('2026-09-15T15:16:00Z', new Date('2026-10-06T17:51:56Z')), 21)
  assert.equal(currentPostSaleDeliveryAge('2026-09-15T15:16:00Z', new Date('2026-09-22T15:16:00Z')), 7)
  assert.equal(currentPostSaleDeliveryAge('2026-09-15T15:16:00Z', new Date('2026-10-20T15:16:00Z')), null)
  assert.equal(currentPostSaleDeliveryAge('invalid', new Date()), null)
})

test('saudacao contextual nao exige equipe e ajuste simples preserva encaminhamento sem reclamacao', () => {
  const greeting: PilotSafeReply = {
    action: 'conservative_fallback', messageType: 'ai_greeting',
    replyInput: { action: 'conservative_fallback', intent: 'complaint_or_adaptation',
      userMessages: [{ kind: 'text', text: 'Ola, tudo bom? Tudo bom gracas a Deus' }],
      facts: { postSaleGreeting: true, postSaleStage: 'awaiting_feedback' } },
  }
  const text = 'Olá! Tudo bem por aqui. Como está a adaptação aos seus óculos?'
  assert.equal(resolveStoreOnePilotReplyText(greeting, { success: true, data: { reply_text: text } }).shouldSend, true)
  assert.equal(resolveStoreOnePilotReplyText(greeting, { success: true, data: { reply_text: 'Olá! Como posso ajudar?' } }).shouldSend, false)
  const adjustment: PilotSafeReply = { ...greeting, action: 'human_handoff', messageType: 'human_handoff',
    replyInput: { ...greeting.replyInput, action: 'human_handoff',
      userMessages: [{ kind: 'text', text: 'Esta bom, so vou levar pra apertar mais um pouco' }],
      facts: { frameAdjustment: true, mustIdentifyIara: true, mustMentionHumanHandoff: true } } }
  assert.equal(resolveStoreOnePilotReplyText(adjustment, { success: true, data: { reply_text:
    'Sou a IAra, assistente virtual da ótica. Que bom que está se adaptando bem! Vou chamar a equipe para ajudar com o ajuste da armação.' } }).shouldSend, true)
  assert.equal(resolveStoreOnePilotReplyText(adjustment, { success: true, data: { reply_text: 'Que bom que está tudo bem!' } }).shouldSend, false)
  assert.equal(resolveStoreOnePilotReplyText(adjustment, { success: true, data: { reply_text:
    'Sou a IAra. Sinto muito pela adaptação ruim. Vou chamar a equipe com prioridade para ajustar a armação.' } }).shouldSend, false)
})

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

test('somente um follow-up marcado como teste da OS 1043 pode ser reutilizado para novo teste', () => {
  const base = {
    protocol: '1043',
    storeId: 1,
    status: 'sent',
    serviceOrderId: 1043,
    expectedServiceOrderId: 1043,
    coveredServiceOrderIds: [1043],
    remotePhoneMatches: true,
  }
  assert.equal(canReuseStoreOnePostSaleTestFollowup(base), true)
  assert.equal(canReuseStoreOnePostSaleTestFollowup({ ...base, status: 'sending' }), false)
  assert.equal(canReuseStoreOnePostSaleTestFollowup({ ...base, status: 'sent', storeId: 2 }), false)
  assert.equal(canReuseStoreOnePostSaleTestFollowup({ ...base, protocol: '1044' }), false)
  assert.equal(canReuseStoreOnePostSaleTestFollowup({ ...base, serviceOrderId: 999 }), false)
  assert.equal(canReuseStoreOnePostSaleTestFollowup({ ...base, coveredServiceOrderIds: [1043, 1044] }), false)
  assert.equal(canReuseStoreOnePostSaleTestFollowup({ ...base, remotePhoneMatches: false }), false)
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

test('agradecimento entre assuntos pode preservar a nota pendente sem responder de novo', () => {
  assert.deepEqual(WhatsAppPostSaleRatingResolutionSchema.parse({
    action: 'defer', rating: null, reply_text: null,
  }), { action: 'defer', rating: null, reply_text: null })
  assert.equal(extractPostSaleRatingForStage('Certo, obrigado!', 'awaiting_rating'), null)
  assert.equal(extractPostSaleRatingForStage('Voltando a adaptacao, minha nota e 5', 'awaiting_rating'), 5)
})

test('audio sem transcricao nao recebe interpretacao de pos-venda mesmo com confianca alta', () => {
  const base = { context: { postSalesId: 575, serviceOrderId: 1030, stage: 'awaiting_feedback' as const },
    confidence: 0.95, minimumConfidence: MIN_CONFIDENCE, explicitHumanRequest: false, explicitOrderRequest: false }
  // Reproduces inbound 12369: audio, null text and invented frame_adjustment.
  for (const input of [
    { messageText: null, hasAttachment: true },
    { messageText: '', hasAttachment: true },
    { messageText: '   ', hasAttachment: false },
    { messageText: null, hasAttachment: false },
    { messageText: 'Esta bom, quero ajustar a armacao', hasAttachment: true },
  ]) {
    assert.equal(canClassifyPostSaleMessage(input), false)
    for (const signal of ['frame_adjustment', 'greeting'] as const) {
      assert.equal(resolvePostSaleContextualSignal({ ...base, ...input, signal }), null)
    }
  }
  assert.equal(canClassifyPostSaleMessage({ messageText: 'Bom dia', hasAttachment: false }), true)
  assert.equal(resolvePostSaleContextualSignal({ ...base, hasAttachment: false,
    messageText: 'Esta bom, so quero apertar a armacao', signal: 'frame_adjustment' }), 'frame_adjustment')
})

test('encaminhamento neutro de audio preserva vinculo e impede nota automatica por prazo', () => {
  const context: PostSaleContext = { postSalesId: 575, serviceOrderId: 1030, stage: 'awaiting_feedback' }
  assert.deepEqual(transitionPostSaleContextAfterTurn(context, 'post_sale_handoff'), {
    ...context, stage: 'handoff',
  })
  assert.equal(decidePostSaleDeadlineOutcome([
    'Audio recebido sem transcricao no acompanhamento; handoff para a equipe ouvir, sem avaliacao automatica do conteudo.',
  ]), 'keep_human')
})
