import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWhatsAppPostSaleActionReplyPrompt,
  openAiTextFormatForTask,
  WhatsAppIntentClassificationSchema,
} from '../src/lib/whatsapp/ai'

test('redator de respostas exige reply_text por JSON Schema estrito na API OpenAI', () => {
  assert.deepEqual(openAiTextFormatForTask('tool_agent_reply'), {
    type: 'json_schema',
    name: 'whatsapp_tool_agent_reply',
    strict: true,
    schema: {
      type: 'object',
      properties: { reply_text: { type: 'string' } },
      required: ['reply_text'],
      additionalProperties: false,
    },
  })
})

test('formato estrito fica restrito à tarefa que redige resposta ao cliente', () => {
  assert.equal(openAiTextFormatForTask('tool_agent_plan'), null)
  assert.equal(openAiTextFormatForTask('redesign_classification'), null)
})

test('classificacao aceita entidades opcionais omitidas e aplica valores neutros', () => {
  const parsed = WhatsAppIntentClassificationSchema.parse({
    intent: 'post_sale_positive',
    confidence: 0.94,
    automation_candidate: true,
    entities: { patient_name: null },
  })

  assert.deepEqual(parsed.entities, {
    order_number: null,
    cpf: null,
    customer_name: null,
    patient_name: null,
    wants_pix: false,
    mentions_attachment: false,
    complaint_type: null,
  })
  assert.deepEqual(parsed.reasoning_tags, [])
})

test('redacao de pos-venda recebe acao e fatos confirmados sem exemplo generico', () => {
  const question = buildWhatsAppPostSaleActionReplyPrompt({
    action: 'request_rating', messageText: 'Estou me adaptando bem', storeName: 'Otica',
  })
  assert.match(question, /nota de 1 a 5/)
  assert.match(question, /Estou me adaptando bem/)
  assert.doesNotMatch(question, /Oi! Posso te ajudar com isso/)

  const confirmation = buildWhatsAppPostSaleActionReplyPrompt({
    action: 'confirm_rating', rating: 5, messageText: 'Nota 5', storeName: 'Otica',
  })
  assert.match(confirmation, /nota 5 foi registrada/)
})
