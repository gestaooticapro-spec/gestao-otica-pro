import assert from 'node:assert/strict'
import test from 'node:test'
import { openAiTextFormatForTask, WhatsAppIntentClassificationSchema } from '../src/lib/whatsapp/ai'

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
