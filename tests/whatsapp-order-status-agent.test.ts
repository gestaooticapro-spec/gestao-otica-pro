import assert from 'node:assert/strict'
import test from 'node:test'
import { buildToolAgentReplyPrompt, buildWhatsAppHumanizationPrompt } from '../src/lib/whatsapp/ai'
import {
  canUseIdentifierLookupAgentReply,
  prepareOpenOrdersForAgent,
  resolveToolAgentReplySemantics,
  validateOrderAgentReply,
} from '../src/lib/whatsapp/order-status-agent'

const order = (orderNumber: string) => ({
  orderNumber,
  patientName: `Dependente ${orderNumber}`,
  status: 'lens_in_production',
  statusText: `OS ${orderNumber} em producao no laboratorio.`,
})

test('prepara uma ou duas OS com numero, dependente e situacao para a IA redigir', () => {
  const result = prepareOpenOrdersForAgent([order('1005'), order('1006')])

  assert.equal(result.multipleOpenOrders, true)
  assert.equal(result.tooManyOpenOrders, false)
  assert.deepEqual(result.orders.map((item) => item.orderNumber), ['1005', '1006'])
  assert.deepEqual(result.orders.map((item) => item.patientName), ['Dependente 1005', 'Dependente 1006'])
  assert.ok(result.orders.every((item) => item.statusText.includes('producao')))
})

test('acima de duas OS nao fornece uma selecao parcial e sinaliza pedir identificador', () => {
  const result = prepareOpenOrdersForAgent([order('1005'), order('1006'), order('1007')])

  assert.equal(result.multipleOpenOrders, true)
  assert.equal(result.tooManyOpenOrders, true)
  assert.deepEqual(result.orders, [])
})

test('prompt de resposta entrega a decisao e os fatos das duas OS para a IA', () => {
  const prepared = prepareOpenOrdersForAgent([order('1005'), order('1006')])
  const prompt = buildToolAgentReplyPrompt({
    messageText: 'Qual o status dos meus pedidos?',
    storeName: 'Ótica de teste',
  }, [{
    tool: 'lookup_open_orders',
    ok: true,
    data: { customerName: 'Cliente de teste', ...prepared },
  }])

  assert.match(prompt, /mencione cada numero de OS/u)
  assert.match(prompt, /Nao omita nenhuma das OS/u)
  assert.match(prompt, /1005/u)
  assert.match(prompt, /1006/u)
  assert.match(prompt, /Dependente 1005/u)
  assert.match(prompt, /Dependente 1006/u)
  assert.match(prompt, /OS 1005 em producao no laboratorio\./u)
  assert.match(prompt, /OS 1006 em producao no laboratorio\./u)
  assert.match(prompt, /apresente-se como IAra/u)
  assert.match(prompt, /nao peca novamente o mesmo identificador/u)
  assert.match(prompt, /uma frase separada para cada pedido/u)
})

test('prompt orienta a desambiguar nome citado e listar as OS realmente vinculadas ao WhatsApp', () => {
  const facts = [
    { orderNumber: '1043', patientName: null, status: 'lens_arrived_assembling', statusText: 'Está na fila de montagem, com a lente já chegada.' },
    { orderNumber: '1041', patientName: null, status: 'lens_in_production', statusText: 'Está em produção no laboratório.' },
  ]
  const prompt = buildToolAgentReplyPrompt({
    messageText: 'Como está o óculos do Odair?',
    referencedPersonName: 'Odair',
  }, [{
    tool: 'lookup_open_orders',
    ok: true,
    data: { customerName: 'Jaime Rodrigues Junior', ...prepareOpenOrdersForAgent(facts) },
  }])

  assert.match(prompt, /referencedPersonName/u)
  assert.match(prompt, /Odair/u)
  assert.match(prompt, /nao encontrou pedido desse nome vinculado a este WhatsApp/u)
  assert.match(prompt, /informe os pedidos que o resultado da consulta vinculada ao telefone encontrou/u)
  assert.deepEqual(validateOrderAgentReply(
    'Não encontrei OS de Odair vinculada a este WhatsApp. No cadastro vinculado a este número, a OS 1043 do titular está na fila de montagem, com a lente já chegada. A OS 1041 do titular está em produção no laboratório.',
    facts,
    { allowPossessiveOwnerReference: true }
  ), { valid: true })
})

test('prompt instrui a IA a pedir identificador quando ha mais de duas OS', () => {
  const prepared = prepareOpenOrdersForAgent([order('1005'), order('1006'), order('1007')])
  const prompt = buildToolAgentReplyPrompt({
    messageText: 'Qual o status dos meus pedidos?',
  }, [{ tool: 'lookup_open_orders', ok: true, data: prepared }])

  assert.match(prompt, /Com tooManyOpenOrders=true, nao liste nem escolha pedidos/u)
  assert.match(prompt, /"tooManyOpenOrders":true/u)
  assert.doesNotMatch(prompt, /1005/u)
  assert.doesNotMatch(prompt, /1006/u)
  assert.doesNotMatch(prompt, /1007/u)
})

test('resposta redigida pela IA de consulta por telefone sincroniza a memoria como status', () => {
  assert.deepEqual(resolveToolAgentReplySemantics({
    handedOff: false,
    orderStatusAction: 'auto_reply',
    ratingRecorded: false,
    ratingRequested: false,
  }), {
    state: 'ai_session',
    reason: 'order_status_auto_reply',
    intent: 'order_status',
    action: 'auto_reply',
    outboundType: 'os_status',
  })
})

test('pedido de identificador gerado pela IA aguarda o proximo dado e atualiza a memoria', () => {
  assert.deepEqual(resolveToolAgentReplySemantics({
    handedOff: false,
    orderStatusAction: 'request_identifier',
    ratingRecorded: false,
    ratingRequested: false,
  }), {
    state: 'waiting_identifier',
    reason: 'order_identifier_requested',
    intent: 'order_status',
    action: 'request_identifier',
    outboundType: 'identifier_prompt',
  })
})

test('handoff humano tem prioridade sobre a semantica de resposta de status', () => {
  assert.equal(resolveToolAgentReplySemantics({
    handedOff: true,
    orderStatusAction: 'auto_reply',
    ratingRecorded: false,
    ratingRequested: false,
  }).action, 'human_handoff')
})

test('nao usa resposta de consulta por telefone quando o cliente informou uma OS', () => {
  assert.equal(canUseIdentifierLookupAgentReply({
    expectedLookupExecuted: false,
    lookupSucceeded: false,
    handoffRequested: false,
  }), false)
})

test('consulta por identificador bem-sucedida permite redacao baseada nos fatos encontrados', () => {
  assert.equal(canUseIdentifierLookupAgentReply({
    expectedLookupExecuted: true,
    lookupSucceeded: true,
    handoffRequested: false,
  }), true)
})

test('consulta por identificador sem resultado so permite resposta da IA se ela encaminhar a equipe', () => {
  assert.equal(canUseIdentifierLookupAgentReply({
    expectedLookupExecuted: true,
    lookupSucceeded: false,
    handoffRequested: true,
  }), true)
  assert.equal(canUseIdentifierLookupAgentReply({
    expectedLookupExecuted: true,
    lookupSucceeded: false,
    handoffRequested: false,
  }), false)
})

test('nao aceita resposta de handoff se a ferramenta de identificador nao chegou a executar', () => {
  assert.equal(canUseIdentifierLookupAgentReply({
    expectedLookupExecuted: false,
    lookupSucceeded: false,
    handoffRequested: true,
  }), false)
})

test('humanizacao de handoff por OS exige identificacao da IAra e impede status inventado', () => {
  const prompt = buildWhatsAppHumanizationPrompt({
    intent: 'order_status',
    action: 'human_handoff',
    outboundType: 'human_handoff',
    canonicalReply: 'A busca nao localizou a OS. A equipe continuara a verificacao.',
    userMessageText: 'Pode consultar a OS 999999?',
    conversationHistory: [],
    storeName: 'Ótica de teste',
    facts: {},
    tone: 'friendly',
    policy: { mustKeepShort: true, mustNotAddInformation: true },
  })

  assert.match(prompt, /Apresente-se como IAra/u)
  assert.match(prompt, /nao invente status/u)
  assert.match(prompt, /Nao solicite novamente o mesmo identificador/u)
})

test('valida que duas OS, dependentes e etapas oficiais fiquem associados em frases separadas', () => {
  const facts = [
    { orderNumber: '1005', patientName: 'Zeroir', status: 'lens_in_production', statusText: 'Em produção no laboratório.' },
    { orderNumber: '1006', patientName: 'Aline', status: 'ready_for_pickup', statusText: 'Pronto para retirada.' },
  ]

  assert.deepEqual(validateOrderAgentReply(
    'A OS 1005 de Zeroir está em produção no laboratório. A OS 1006 de Aline está pronta para retirada.',
    facts
  ), { valid: true })
})

test('rejeita resposta de OS que omite ou associa incorretamente nome e situacao', () => {
  const facts = [
    { orderNumber: '1005', patientName: 'Zeroir', status: 'lens_in_production', statusText: 'Em produção no laboratório.' },
    { orderNumber: '1006', patientName: 'Aline', status: 'ready_for_pickup', statusText: 'Pronto para retirada.' },
  ]

  assert.deepEqual(validateOrderAgentReply(
    'A OS 1005 de Zeroir está pronta para retirada. A OS 1006 de Aline está pronta para retirada.',
    facts
  ), { valid: false, reason: 'missing_status' })
  assert.deepEqual(validateOrderAgentReply(
    'As OS 1005 e 1006 de Zeroir e Aline estão em produção no laboratório e prontas para retirada.',
    facts
  ), { valid: false, reason: 'mixed_orders' })
})

test('exige identificar a titular quando a OS nao tem dependente associado', () => {
  const facts = [{
    orderNumber: '1008',
    patientName: null,
    status: 'lens_arrived_assembling',
    statusText: 'O óculos entrou na fila de montagem.',
  }]

  assert.deepEqual(validateOrderAgentReply('A OS 1008 do titular entrou na fila de montagem.', facts), { valid: true })
  assert.deepEqual(validateOrderAgentReply('A OS 1008 entrou na fila de montagem.', facts), {
    valid: false,
    reason: 'missing_patient',
  })
})
