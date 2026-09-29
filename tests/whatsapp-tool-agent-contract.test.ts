import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WhatsAppToolAgentPlanSchema,
  WhatsAppToolAgentReplySchema,
} from '../src/lib/whatsapp/ai'
import { runWhatsAppToolAgent } from '../src/lib/whatsapp/tool-agent'

test('consulta forçada executa a ferramenta determinística sem deixar o planejador trocar o assunto', async () => {
  const executed: string[] = []
  const outcome = await runWhatsAppToolAgent({
    assistant: { messageText: 'Qual é o status do meu óculos?' },
    forcedToolCalls: [{ name: 'lookup_open_orders' }],
    executeTool: async (call) => {
      executed.push(call.name)
      return { tool: call.name, ok: true, data: { orders: [{ orderNumber: 'OS teste' }] } }
    },
    deferReplyWhen: (_calls, results) => {
      const result = results.find((item) => item.tool === 'lookup_open_orders')
      return Array.isArray(result?.data.orders) && result.data.orders.length === 1
    },
  })

  assert.deepEqual(executed, ['lookup_open_orders'])
  assert.deepEqual(outcome.toolCalls.map((call) => call.name), ['lookup_open_orders'])
  assert.equal(outcome.success, true)
  assert.equal(outcome.replyText, null)
  assert.deepEqual(outcome.aiResultTasks, [])
})

test('aceita apenas ferramentas internas previstas no agente de WhatsApp', () => {
  const result = WhatsAppToolAgentPlanSchema.parse({
    tool_calls: [
      { name: 'lookup_open_orders' },
      { name: 'lookup_open_orders_by_identifier' },
      { name: 'record_post_sale_rating', rating: 5 },
    ],
    reply_text: null,
  })

  assert.equal(result.tool_calls[2].rating, 5)
  assert.throws(() => WhatsAppToolAgentPlanSchema.parse({
    tool_calls: [{ name: 'run_sql' }],
    reply_text: null,
  }))
})

test('normaliza sinonimos seguros de ferramentas sem aceitar acoes livres', () => {
  const result = WhatsAppToolAgentPlanSchema.parse({
    tool_calls: [
      { name: 'lookup_order_status' },
      { name: 'consultar_parcelas_por_identificador' },
      { name: 'get_order_details_by_cpf' },
    ],
    reply_text: null,
  })

  assert.deepEqual(result.tool_calls.map((call) => call.name), [
    'lookup_open_orders',
    'lookup_open_installments_by_identifier',
    'lookup_open_orders_by_identifier',
  ])
})

test('a resposta final do agente exige texto e nunca aceita acao adicional', () => {
  assert.equal(
    WhatsAppToolAgentReplySchema.parse({ reply_text: 'Seu oculos ja esta pronto para retirada.' }).reply_text,
    'Seu oculos ja esta pronto para retirada.'
  )
  assert.throws(() => WhatsAppToolAgentReplySchema.parse({ reply_text: '' }))
})
