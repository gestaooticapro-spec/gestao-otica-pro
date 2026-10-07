import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildWhatsAppPostSaleActionReplyPrompt,
  buildWhatsAppRedesignReplyPrompt,
  buildWhatsAppHumanizationPrompt,
  buildToolAgentReplyPrompt,
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

test('redatores omitem o nome comercial nas respostas comuns sem perder identidade ou fatos oficiais', () => {
  const storeName = 'Otica Prisma Guaira'
  const prompts = [
    buildWhatsAppRedesignReplyPrompt({
      action: 'answer_official_pix', intent: 'installment_status', storeName,
      userMessages: [{ kind: 'text', text: 'Qual a chave Pix?' }],
      conversationHistory: ['assistente: Como posso ajudar aqui na Otica Prisma Guaira?'],
      facts: { officialPixKey: 'financeiro@example.com', officialPixHolder: storeName },
    }),
    buildToolAgentReplyPrompt({ messageText: 'Minha OS esta pronta?', storeName }, []),
    buildWhatsAppHumanizationPrompt({
      intent: 'order_status', action: 'human_handoff', storeName,
      canonicalReply: 'Sou a IAra, assistente virtual da otica. A equipe vai verificar sua OS.',
    }),
    buildWhatsAppPostSaleActionReplyPrompt({ action: 'confirm_rating', rating: 5, messageText: 'Nota 5', storeName }),
  ]
  for (const prompt of prompts) {
    assert.match(prompt, /Nao inclua o nome completo da otica/)
    assert.match(prompt, /mesmo que apareca em storeName, nos fatos ou no historico/)
    assert.match(prompt, /no idioma do cliente/)
    assert.match(prompt, /cliente perguntar explicitamente qual e a loja/)
    assert.match(prompt, /favorecido do Pix; preserve esse dado exatamente/)
    assert.match(prompt, /identificacao obrigatoria como IAra/)
    assert.ok(prompt.includes(storeName))
  }
  assert.ok(prompts[0].includes('financeiro@example.com'))
  assert.match(prompts[0], /inclua a chave Pix oficial exatamente como fornecida/)
  assert.match(prompts[2], /a equipe continuara a verificacao/)
  assert.match(prompts[3], /nota 5 foi registrada/)
})
