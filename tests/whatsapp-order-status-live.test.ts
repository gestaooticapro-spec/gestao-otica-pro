import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionSchema,
} from '../src/lib/whatsapp/redesign/contracts'
import {
  planStoreOneOrderLookup,
  runStoreOneOrderStatusTurn,
} from '../src/lib/whatsapp/redesign/order-status-live'

const classification = WhatsAppRedesignClassificationSchema.parse({
  intent: 'order_status', confidence: 0.98, topicRelation: 'continue_topic',
  requestsHuman: false, mentionsAttachment: false,
  entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
})
const decision = WhatsAppSystemDecisionSchema.parse({
  action: 'lookup_order_status', fallbackReply: 'Consultar a OS antes de responder.', facts: { decisionReason: 'order_status_requires_authorized_lookup' },
  humanHandoffTiming: null,
  humanization: { mustNotAddFacts: true, mustKeepShort: true, mustIdentifyIara: false,
    mustMentionHumanHandoff: false, forbiddenClaims: [] },
})

function plan(messageText: string, awaitingIdentifier = false) {
  return planStoreOneOrderLookup({ storeId: 1, enabled: true, classification,
    decision, messageText, awaitingIdentifier })
}

const order = (number: string, patient: string, status: string) => ({
  orderNumber: number, patientName: patient, status,
  statusText: status === 'ready_for_pickup' ? 'Pronto para retirada'
    : 'Em producao no laboratorio',
})

function fakeWriter(reply: string) {
  return async () => ({
    success: true as const, provider: 'openai' as const, model: 'test', keyIndex: 0,
    data: { reply_text: reply }, attempts: 1, rawText: reply, latencyMs: 1, promptText: '',
  })
}

test('Loja 1: pergunta, identificador e consulta usam uma busca por turno e nenhuma segunda IA planejadora', async () => {
  const firstPlan = plan('Qual e o status do meu oculos?')
  assert.equal(firstPlan?.tool, 'lookup_open_orders')
  assert.ok(firstPlan)
  let firstQueries = 0
  const first = await runStoreOneOrderStatusTurn({
    plan: firstPlan, assistant: { messageText: 'Qual e o status do meu oculos?' },
    executeLookup: async (call) => {
      firstQueries += 1
      return { tool: call.name, ok: false, data: { code: 'customer_not_found' } }
    },
    writeReply: fakeWriter('Pode me informar o numero do pedido ou o CPF do titular?'),
  })
  assert.equal(firstQueries, 1)
  assert.deepEqual(first.agent.aiResultTasks, ['tool_agent_reply'])
  assert.equal(first.disposition.kind, 'send')
  assert.equal(first.disposition.kind === 'send' && first.disposition.state, 'waiting_identifier')

  const secondPlan = plan('OS 1017', first.disposition.kind === 'send'
    && first.disposition.state === 'waiting_identifier')
  assert.equal(secondPlan?.tool, 'lookup_open_orders_by_identifier')
  assert.ok(secondPlan)
  let secondQueries = 0
  const second = await runStoreOneOrderStatusTurn({
    plan: secondPlan,
    assistant: { messageText: 'OS 1017', conversationHistory: ['IA: Pode me informar o numero do pedido?'] },
    executeLookup: async (call) => {
      secondQueries += 1
      return { tool: call.name, ok: true, data: { orders: [order('1017', 'LIANE', 'lens_in_production')] } }
    },
    writeReply: fakeWriter('A OS 1017, de LIANE, esta em producao no laboratorio.'),
  })
  assert.equal(secondQueries, 1)
  assert.deepEqual(second.agent.aiResultTasks, ['tool_agent_reply'])
  assert.equal(second.disposition.kind, 'send')
  assert.equal(second.disposition.kind === 'send' && second.disposition.action, 'auto_reply')
})

test('duas OS exigem numero, dependente e status de cada uma; status trocado e bloqueado', async () => {
  const lookupPlan = plan('Meus oculos estao prontos?')
  assert.ok(lookupPlan)
  const orders = [order('1005', 'ANA', 'ready_for_pickup'), order('1006', 'BIA', 'lens_in_production')]
  const executeLookup = async () => ({ tool: 'lookup_open_orders' as const, ok: true, data: { orders } })
  const good = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Meus oculos estao prontos?' }, executeLookup,
    writeReply: fakeWriter('A OS 1005, de ANA, esta pronta para retirada. A OS 1006, de BIA, esta em producao no laboratorio.'),
  })
  assert.equal(good.disposition.kind, 'send')
  assert.equal(good.disposition.kind === 'send' && good.disposition.orderCount, 2)
  const bad = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Meus oculos estao prontos?' }, executeLookup,
    writeReply: fakeWriter('A OS 1005, de ANA, esta em producao no laboratorio. A OS 1006, de BIA, esta pronta para retirada.'),
  })
  assert.equal(bad.disposition.kind, 'suppress')
})

test('OS inexistente aceita apenas encaminhamento sem status inventado nem repeticao do identificador', async () => {
  const lookupPlan = plan('Consegue verificar a OS 9999999999?')
  assert.equal(lookupPlan?.tool, 'lookup_open_orders_by_identifier')
  assert.ok(lookupPlan)
  const executeLookup = async () => ({ tool: 'lookup_open_orders_by_identifier' as const,
    ok: false, data: { code: 'order_not_found_for_identifier' } })
  const good = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Consegue verificar a OS 9999999999?' }, executeLookup,
    writeReply: fakeWriter('Sou a IAra. Nao localizei essa OS. Nossa equipe continuara a verificacao.'),
  })
  assert.equal(good.disposition.kind === 'send' && good.disposition.state, 'awaiting_human')
  const bad = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Consegue verificar a OS 9999999999?' }, executeLookup,
    writeReply: fakeWriter('Sua OS esta pronta para retirada.'),
  })
  assert.equal(bad.disposition.kind, 'suppress')
})

test('falha de consulta nao aciona redator nem devolve resposta ou pausa', async () => {
  const lookupPlan = plan('OS 1017')
  assert.ok(lookupPlan)
  let writerCalls = 0
  const outcome = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'OS 1017' },
    executeLookup: async () => { throw new Error('consulta indisponivel') },
    writeReply: async () => { writerCalls += 1; return fakeWriter('Status inventado')() },
  })
  assert.equal(writerCalls, 0)
  assert.equal(outcome.disposition.kind, 'suppress')
  assert.deepEqual(outcome.agent.aiResultTasks, [])
})

test('mais de duas OS pedem apenas o numero; falha do redator nao envia contingencia', async () => {
  const lookupPlan = plan('Qual o status dos meus oculos?')
  assert.ok(lookupPlan)
  const executeLookup = async () => ({ tool: 'lookup_open_orders' as const, ok: true,
    data: { orders: [], tooManyOpenOrders: true } })
  const good = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Qual o status dos meus oculos?' }, executeLookup,
    writeReply: fakeWriter('Pode me informar o numero da OS que deseja consultar?'),
  })
  assert.equal(good.disposition.kind === 'send' && good.disposition.action, 'request_identifier')
  const bad = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Qual o status dos meus oculos?' }, executeLookup,
    writeReply: fakeWriter('A OS 1005 esta pronta para retirada.'),
  })
  assert.equal(bad.disposition.kind, 'suppress')
  const failedWriter = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'Qual o status dos meus oculos?' }, executeLookup,
    writeReply: async () => ({ success: false as const, error: 'modelo indisponivel', attempts: 1,
      providerErrors: ['modelo indisponivel'], latencyMs: 1, promptText: '' }),
  })
  assert.equal(failedWriter.disposition.kind, 'suppress')
})

test('piloto isolado da Loja 1 e bloqueio humano nao sao superados por OS explicita', () => {
  assert.equal(planStoreOneOrderLookup({ storeId: 2, enabled: true, classification,
    decision, messageText: 'OS 1017', awaitingIdentifier: true }), null)
  assert.equal(planStoreOneOrderLookup({ storeId: 1, enabled: true, classification,
    decision: { ...decision, action: 'no_reply', facts: { decisionReason: 'human_control_blocks_ai' } },
    messageText: 'OS 1017', awaitingIdentifier: true }), null)
  assert.equal(planStoreOneOrderLookup({ storeId: 1, enabled: true,
    classification: { ...classification, requestsHuman: true }, decision,
    messageText: 'OS 1017', awaitingIdentifier: false }), null)
})

test('CPF informado junto da pergunta de status escolhe a consulta pelo identificador atual', () => {
  const withCpf = { ...classification,
    entities: { ...classification.entities, cpf: '582.120.431-34' } }
  assert.equal(planStoreOneOrderLookup({ storeId: 1, enabled: true, classification: withCpf,
    decision, messageText: 'Pode consultar o status do pedido pelo CPF 582.120.431-34?',
    awaitingIdentifier: false })?.tool, 'lookup_open_orders_by_identifier')
  assert.equal(planStoreOneOrderLookup({ storeId: 1, enabled: true, classification,
    decision, messageText: 'Pode consultar o status do pedido pelo CPF 582.120.431-34?',
    awaitingIdentifier: false })?.tool, 'lookup_open_orders_by_identifier')
  assert.equal(planStoreOneOrderLookup({ storeId: 1, enabled: true, classification: withCpf,
    decision, messageText: 'Qual e o status do meu oculos?',
    awaitingIdentifier: false })?.tool, 'lookup_open_orders')
})

test('consulta por CPF aceita duas OS distintas e exige os fatos completos das duas', async () => {
  const lookupPlan = planStoreOneOrderLookup({ storeId: 1, enabled: true,
    classification: { ...classification, entities: { ...classification.entities, cpf: '582.120.431-34' } },
    decision, messageText: 'CPF 582.120.431-34', awaitingIdentifier: true })
  assert.equal(lookupPlan?.tool, 'lookup_open_orders_by_identifier')
  assert.ok(lookupPlan)
  const executeLookup = async () => ({ tool: 'lookup_open_orders_by_identifier' as const, ok: true,
    data: { orders: [order('1005', 'ANA', 'ready_for_pickup'),
      order('1006', 'BIA', 'lens_in_production')] } })
  const good = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'CPF 582.120.431-34' }, executeLookup,
    writeReply: fakeWriter('A OS 1005, de ANA, esta pronta para retirada. A OS 1006, de BIA, esta em producao no laboratorio.'),
  })
  assert.equal(good.disposition.kind === 'send' && good.disposition.orderCount, 2)
  const incomplete = await runStoreOneOrderStatusTurn({ plan: lookupPlan,
    assistant: { messageText: 'CPF 582.120.431-34' }, executeLookup,
    writeReply: fakeWriter('A OS 1005, de ANA, esta pronta para retirada.'),
  })
  assert.equal(incomplete.disposition.kind, 'suppress')
})
