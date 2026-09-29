import assert from 'node:assert/strict'
import test from 'node:test'
import type { WhatsAppToolCall } from '../src/lib/whatsapp/tool-agent'
import { buildToolAgentReplyPrompt } from '../src/lib/whatsapp/ai'
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

test('revisao de duas OS nao exige copiar saudacao do status e preserva a validacao', async () => {
  let writes = 0
  let lookups = 0
  const result = await runStoreOneOrderStatusTurn({
    plan: { tool: 'lookup_open_orders', source: 'canonical_decision' },
    assistant: {
      messageText: 'Como está o óculos do Odair?',
      referencedPersonName: 'Odair', strictOrderFacts: true,
      conversationHistory: ['IA: Vou encaminhar sua pergunta sobre exame de vista.'],
    },
    executeLookup: async (call) => {
      lookups += 1
      return { tool: call.name, ok: true, data: { orders: [
        { orderNumber: '1043', patientName: null, status: 'lens_arrived_assembling', statusText: 'Oi, CLIENTE! A lente já chegou e seu óculos entrou na fila de montagem.' },
        { orderNumber: '1041', patientName: null, status: 'lens_in_production', statusText: 'Oi, CLIENTE! Seu pedido está em produção no laboratório no momento.' },
      ] } }
    },
    writeReply: async (input, results) => {
      writes += 1
      if (writes === 1) return fakeWriter('Você possui dois pedidos: o número 1043 do titular está na fila de montagem e o número 1041 do titular está em produção no laboratório.')()
      assert.equal(input.rejectedOrderReply?.reason, 'mixed_orders')
      assert.deepEqual(input.conversationHistory, [])
      const prompt = buildToolAgentReplyPrompt(input, results)
      assert.match(prompt, /sem copiar saudacoes/u)
      assert.match(prompt, /Nunca junte duas OS na mesma frase/u)
      assert.doesNotMatch(prompt, /usando os valores exatos/u)
      return fakeWriter('Não encontrei pedido do Odair vinculado a este WhatsApp. A OS 1043 do titular está na fila de montagem, com a lente já chegada. A OS 1041 do titular está em produção no laboratório.')()
    },
  })
  assert.equal(lookups, 1)
  assert.equal(writes, 2)
  assert.equal(result.disposition.kind, 'send')
})

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

test('nome mencionado na pergunta nao muda a consulta vinculada ao WhatsApp', async () => {
  const withName = { ...classification,
    entities: { ...classification.entities, customerName: 'Odair', patientName: 'Odair' } }
  const namedPlan = planStoreOneOrderLookup({ storeId: 1, enabled: true,
    classification: withName, decision, messageText: 'Como esta o oculos do Odair?',
    awaitingIdentifier: false })
  assert.equal(namedPlan?.tool, 'lookup_open_orders')
  const pendingNamePlan = planStoreOneOrderLookup({ storeId: 1, enabled: true,
    classification: withName, decision, messageText: 'Odair',
    awaitingIdentifier: true })
  assert.equal(pendingNamePlan?.tool, 'lookup_open_orders')
  assert.equal(pendingNamePlan?.source, 'canonical_decision')
  assert.ok(namedPlan)

  const ownOrder = order('1041', 'BIA', 'lens_in_production')
  const lookup = async (call: WhatsAppToolCall) => {
    assert.equal(call.name, 'lookup_open_orders')
    return { tool: call.name, ok: true, data: { orders: [ownOrder] } }
  }
  const correct = await runStoreOneOrderStatusTurn({ plan: namedPlan,
    assistant: { messageText: 'Como esta o oculos do Odair?' }, executeLookup: lookup,
    writeReply: fakeWriter('A OS 1041, de BIA, esta em producao no laboratorio.'),
  })
  assert.equal(correct.disposition.kind, 'send')
  const inventedPatient = await runStoreOneOrderStatusTurn({ plan: namedPlan,
    assistant: { messageText: 'Como esta o oculos do Odair?' }, executeLookup: lookup,
    writeReply: fakeWriter('A OS 1041, de Odair, esta em producao no laboratorio.'),
  })
  assert.equal(inventedPatient.disposition.kind, 'suppress')
})

test('numero da OS e CPF continuam sendo identificadores; nome sozinho nao e', () => {
  assert.equal(plan('E a OS 1043, especificamente?')?.tool, 'lookup_open_orders_by_identifier')
  assert.equal(plan('1043', true)?.tool, 'lookup_open_orders_by_identifier')
  assert.equal(plan('CPF 582.120.431-34')?.tool, 'lookup_open_orders_by_identifier')
  assert.equal(plan('Como esta o oculos do Odair?')?.tool, 'lookup_open_orders')
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

test('resposta sem numero da OS e refeita com os mesmos fatos antes do envio', async () => {
  const lookupPlan = plan('Qual e o status do meu oculos?')
  assert.ok(lookupPlan)
  let lookups = 0
  let writes = 0
  const result = await runStoreOneOrderStatusTurn({
    plan: lookupPlan,
    assistant: { messageText: 'Qual e o status do meu oculos?' },
    executeLookup: async (call) => {
      lookups += 1
      return { tool: call.name, ok: true,
        data: { orders: [{ orderNumber: '1041', patientName: null,
          status: 'lens_in_production', statusText: 'Em producao no laboratorio' }] } }
    },
    writeReply: async (input, _toolResults, options) => {
      writes += 1
      if (writes === 1) {
        assert.equal(input.rejectedOrderReply, undefined)
        return fakeWriter('Seu pedido esta em producao no laboratorio.')()
      }
      assert.equal(input.rejectedOrderReply?.reason, 'missing_order')
      assert.equal(options?.model, 'gpt-4.1-mini')
      return fakeWriter('A OS 1041, do titular, esta em producao no laboratorio.')()
    },
  })
  assert.equal(lookups, 1)
  assert.equal(writes, 2)
  assert.deepEqual(result.agent.aiResultTasks, ['tool_agent_reply', 'tool_agent_reply'])
  assert.equal(result.disposition.kind === 'send' && result.disposition.action, 'auto_reply')
})

test('pedido do titular pelo telefone aceita seu pedido, mas busca por identificador exige titular explicito', async () => {
  const fact = { orderNumber: '1041', patientName: null,
    status: 'lens_in_production', statusText: 'Em producao no laboratorio' }
  const reply = 'Seu pedido numero 1041 esta em producao no laboratorio.'
  const phonePlan = plan('Qual e o status do meu oculos?')
  const identifierPlan = plan('OS 1041')
  assert.ok(phonePlan)
  assert.ok(identifierPlan)
  const phone = await runStoreOneOrderStatusTurn({ plan: phonePlan,
    assistant: { messageText: 'Qual e o status do meu oculos?' },
    executeLookup: async (call) => ({ tool: call.name, ok: true, data: { orders: [fact] } }),
    writeReply: fakeWriter(reply),
  })
  assert.equal(phone.disposition.kind, 'send')
  const identifier = await runStoreOneOrderStatusTurn({ plan: identifierPlan,
    assistant: { messageText: 'OS 1041' },
    executeLookup: async (call) => ({ tool: call.name, ok: true, data: { orders: [fact] } }),
    writeReply: fakeWriter(reply),
  })
  assert.equal(identifier.disposition.kind, 'suppress')
})

test('negação de pronto em frase sem OS não bloqueia a OS numerada da frase seguinte', async () => {
  const phonePlan = plan('meu oculos ta pronto?')
  const identifierPlan = plan('OS 1043')
  assert.ok(phonePlan)
  assert.ok(identifierPlan)
  const reply = 'Seu oculos ainda nao esta pronto. O pedido com numero 1043 esta na fila de montagem, pois a lente ja chegou.'
  const fact = { orderNumber: '1043', patientName: null,
    status: 'lens_arrived_assembling', statusText: 'A lente chegou e esta na fila de montagem' }
  const phone = await runStoreOneOrderStatusTurn({ plan: phonePlan,
    assistant: { messageText: 'meu oculos ta pronto?' },
    executeLookup: async (call) => ({ tool: call.name, ok: true, data: { orders: [fact] } }),
    writeReply: fakeWriter(reply),
  })
  assert.equal(phone.disposition.kind, 'send')
  const identifier = await runStoreOneOrderStatusTurn({ plan: identifierPlan,
    assistant: { messageText: 'OS 1043' },
    executeLookup: async (call) => ({ tool: call.name, ok: true, data: { orders: [fact] } }),
    writeReply: fakeWriter(reply),
  })
  assert.equal(identifier.disposition.kind, 'suppress')
})

test('revisao ainda incompleta continua bloqueada', async () => {
  const lookupPlan = plan('Qual e o status do meu oculos?')
  assert.ok(lookupPlan)
  let writes = 0
  const result = await runStoreOneOrderStatusTurn({
    plan: lookupPlan,
    assistant: { messageText: 'Qual e o status do meu oculos?' },
    executeLookup: async (call) => ({ tool: call.name, ok: true,
      data: { orders: [{ orderNumber: '1041', patientName: null,
        status: 'lens_in_production', statusText: 'Em producao no laboratorio' }] } }),
    writeReply: async () => {
      writes += 1
      return fakeWriter('Seu pedido esta em producao no laboratorio.')()
    },
  })
  assert.equal(writes, 2)
  assert.equal(result.disposition.kind, 'suppress')
  assert.equal(result.disposition.kind === 'suppress' && result.disposition.reason, 'missing_order')
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
