import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WhatsAppToolAgentPlanSchema,
  WhatsAppToolAgentReplySchema,
} from '../src/lib/whatsapp/ai'

test('aceita apenas ferramentas internas previstas no agente de WhatsApp', () => {
  const result = WhatsAppToolAgentPlanSchema.parse({
    tool_calls: [
      { name: 'lookup_open_orders' },
      { name: 'request_post_sale_rating' },
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

test('a resposta final do agente exige texto e nunca aceita acao adicional', () => {
  assert.equal(
    WhatsAppToolAgentReplySchema.parse({ reply_text: 'Seu oculos ja esta pronto para retirada.' }).reply_text,
    'Seu oculos ja esta pronto para retirada.'
  )
  assert.throws(() => WhatsAppToolAgentReplySchema.parse({ reply_text: '' }))
})
