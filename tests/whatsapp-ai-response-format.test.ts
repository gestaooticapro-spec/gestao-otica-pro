import assert from 'node:assert/strict'
import test from 'node:test'
import { openAiTextFormatForTask } from '../src/lib/whatsapp/ai'

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
