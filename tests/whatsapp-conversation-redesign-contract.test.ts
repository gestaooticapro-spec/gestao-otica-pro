import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS,
  WhatsAppConversationMemorySchema,
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionSchema,
  canActDuringHumanPending,
  defaultConversationSummary,
  registerHumanActivity,
  releaseExpiredHumanControl,
  resolveReplyAuthority,
  retainRecentConversationMessages,
  type WhatsAppConversationMessage,
} from '../src/lib/whatsapp/redesign/contracts'
import {
  WhatsAppStoredMessageInputSchema,
  buildConversationMemory,
  buildTurnDraft,
} from '../src/lib/whatsapp/redesign/persistence'
import {
  extractShadowInboundMessages,
  buildShadowInboundTurn,
  inferShadowOutboundRole,
  resolveWhatsAppRedesignMode,
  runFailOpenShadowCapture,
} from '../src/lib/whatsapp/redesign/shadow-ingestion'

const BASE_TIME = '2026-09-18T12:00:00.000Z'

function message(index: number, role: WhatsAppConversationMessage['role'] = 'customer'): WhatsAppConversationMessage {
  return {
    id: `message-${index}`,
    providerMessageId: `provider-${index}`,
    role,
    kind: 'text',
    text: `Mensagem ${index}`,
    occurredAt: new Date(Date.parse(BASE_TIME) + index * 1000).toISOString(),
  }
}

test('preserva somente as 10 mensagens literais mais recentes em ordem cronologica', () => {
  const result = retainRecentConversationMessages([
    ...Array.from({ length: 12 }, (_, index) => message(index)),
    message(11),
  ])

  assert.equal(result.length, 10)
  assert.equal(result[0].id, 'message-2')
  assert.equal(result[9].id, 'message-11')
})

test('a memoria exige resumo estruturado e limita a janela literal', () => {
  const summary = defaultConversationSummary(BASE_TIME)
  assert.doesNotThrow(() => WhatsAppConversationMemorySchema.parse({
    summary,
    messages: Array.from({ length: 10 }, (_, index) => message(index)),
  }))

  assert.throws(() => WhatsAppConversationMemorySchema.parse({
    summary,
    messages: Array.from({ length: 11 }, (_, index) => message(index)),
  }))
})

test('atividade humana bloqueia a IA por exatamente duas horas', () => {
  const active = registerHumanActivity(defaultConversationSummary(BASE_TIME), BASE_TIME)
  assert.equal(active.humanControl, 'human_active')
  assert.equal(
    Date.parse(active.humanActiveUntil || '') - Date.parse(BASE_TIME),
    WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS
  )

  assert.equal(
    resolveReplyAuthority(active, '2026-09-18T13:59:59.999Z').authority,
    'human_blocked'
  )
  assert.equal(
    resolveReplyAuthority(active, '2026-09-18T14:00:00.000Z').authority,
    'ai_allowed'
  )
})

test('expiracao libera a IA sem apagar assunto, pendencia ou atividade humana', () => {
  const summary = registerHumanActivity({
    ...defaultConversationSummary(BASE_TIME),
    activeTopic: 'complaint_or_adaptation',
    pendingAction: 'awaiting_human',
    subject: 'Problema relatado nos oculos do filho',
  }, BASE_TIME)

  const released = releaseExpiredHumanControl(summary, '2026-09-18T14:00:01.000Z')
  assert.equal(released.humanControl, 'human_released')
  assert.equal(released.phase, 'resumed')
  assert.equal(released.activeTopic, 'complaint_or_adaptation')
  assert.equal(released.pendingAction, 'awaiting_human')
  assert.equal(released.subject, 'Problema relatado nos oculos do filho')
  assert.equal(released.lastHumanActivityAt, BASE_TIME)
})

test('force_human continua bloqueando mesmo depois da expiracao temporal', () => {
  const summary = registerHumanActivity({
    ...defaultConversationSummary(BASE_TIME),
    customerControlMode: 'force_human',
  }, BASE_TIME)

  const result = resolveReplyAuthority(summary, '2026-09-19T12:00:00.000Z')
  assert.equal(result.authority, 'human_blocked')
  assert.equal(result.summary.humanControl, 'human_active')
})

test('human_pending permite somente a whitelist contextual e segura', () => {
  assert.equal(canActDuringHumanPending('acknowledge_attachment'), true)
  assert.equal(canActDuringHumanPending('recognize_continuation'), true)
  assert.equal(canActDuringHumanPending('answer_store_hours'), true)
  assert.equal(canActDuringHumanPending('answer_store_location'), true)
  assert.equal(canActDuringHumanPending('repeat_handoff'), true)
  assert.equal(canActDuringHumanPending('human_handoff'), false)
  assert.equal(canActDuringHumanPending('conservative_fallback'), false)
})

test('classificacao da IA e estrita e nao aceita texto de resposta', () => {
  const classification = {
    intent: 'store_hours',
    confidence: 0.96,
    topicRelation: 'change_topic',
    requestsHuman: false,
    mentionsAttachment: false,
    entities: {
      customerName: null,
      patientName: null,
      cpf: null,
      orderNumber: null,
    },
  }

  assert.doesNotThrow(() => WhatsAppRedesignClassificationSchema.parse(classification))
  assert.throws(() => WhatsAppRedesignClassificationSchema.parse({
    ...classification,
    reply_text: 'Estamos abertos.',
  }))
})

test('decisao do sistema exige resposta canonica exceto em no_reply', () => {
  const humanization = {
    mustNotAddFacts: true as const,
    mustKeepShort: true,
    mustIdentifyIara: false,
    mustMentionHumanHandoff: false,
    forbiddenClaims: [],
  }

  assert.doesNotThrow(() => WhatsAppSystemDecisionSchema.parse({
    action: 'answer_store_hours',
    canonicalReply: 'A loja esta aberta agora.',
    facts: { isOpenNow: true },
    humanization,
  }))

  assert.doesNotThrow(() => WhatsAppSystemDecisionSchema.parse({
    action: 'no_reply',
    canonicalReply: null,
    facts: {},
    humanization,
  }))

  assert.throws(() => WhatsAppSystemDecisionSchema.parse({
    action: 'human_handoff',
    canonicalReply: null,
    facts: {},
    humanization,
  }))
})

test('persistencia exige uma chave de origem idempotente para cada mensagem', () => {
  assert.doesNotThrow(() => WhatsAppStoredMessageInputSchema.parse({
    sourceKey: 'inbound:123',
    providerMessageId: 'provider-123',
    role: 'customer',
    kind: 'image',
    text: 'Voces tem essa peca?',
    occurredAt: BASE_TIME,
    metadata: { hasAttachment: true },
  }))

  assert.throws(() => WhatsAppStoredMessageInputSchema.parse({
    sourceKey: '',
    providerMessageId: 'provider-123',
    role: 'customer',
    kind: 'image',
    text: null,
    occurredAt: BASE_TIME,
  }))
})

test('memoria persistida usa resumo valido e somente as 10 mensagens mais recentes', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    provider_message_id: `provider-${index}`,
    role: index === 7 ? 'human' : 'customer',
    message_kind: 'text',
    message_text: `Mensagem ${index}`,
    occurred_at: new Date(Date.parse(BASE_TIME) + index * 1000).toISOString(),
  }))

  const memory = buildConversationMemory({
    summary: defaultConversationSummary(BASE_TIME),
    created_at: BASE_TIME,
  }, rows.reverse())

  assert.equal(memory.messages.length, 10)
  assert.equal(memory.messages[0].text, 'Mensagem 2')
  assert.equal(memory.messages[5].role, 'human')
  assert.equal(memory.messages[9].text, 'Mensagem 11')
})

test('turno referencia mensagens individuais sem concatena-las', () => {
  const messages = [message(1), message(2), message(3)].map((item, index) => ({
    ...item,
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }))
  const draft = buildTurnDraft(messages, '2026-09-18T12:00:10.000Z')

  assert.equal(draft.messageIds.length, 3)
  assert.deepEqual(draft.messageIds, messages.map((item) => item.id))
  assert.equal('messageText' in draft, false)
})

test('turno preserva todas as mensagens mesmo quando a memoria literal mostra somente 10', () => {
  const messages = Array.from({ length: 12 }, (_, index) => ({
    ...message(index),
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  }))
  const draft = buildTurnDraft(messages, '2026-09-18T12:01:00.000Z')
  assert.equal(draft.messageIds.length, 12)
})

test('modo sombra exige ativacao explicita por loja', () => {
  assert.equal(resolveWhatsAppRedesignMode(undefined), 'legacy')
  assert.equal(resolveWhatsAppRedesignMode({ ai_redesign: { mode: 'shadow' } }), 'shadow')
  assert.equal(resolveWhatsAppRedesignMode({ ai_redesign: { mode: 'redesign' } }), 'redesign')
})

test('ingestao sombra separa mensagens agregadas sem guardar o texto concatenado', () => {
  const messages = extractShadowInboundMessages({
    providerMessageId: 'provider-3',
    messageText: 'Ola\nTudo bem?\nFazem exame?',
    providerCreatedAt: '2026-09-18T12:00:03.000Z',
    payload: {
      aggregated: true,
      messages: [
        { providerMessageId: 'provider-1', messageText: 'Ola', attachmentKind: null, receivedAt: '2026-09-18T12:00:01.000Z' },
        { providerMessageId: 'provider-2', messageText: 'Tudo bem?', attachmentKind: null, receivedAt: '2026-09-18T12:00:02.000Z' },
        { providerMessageId: 'provider-3', messageText: 'Fazem exame?', attachmentKind: null, receivedAt: '2026-09-18T12:00:03.000Z' },
      ],
    },
  })

  assert.equal(messages.length, 3)
  assert.deepEqual(messages.map((item) => item.text), ['Ola', 'Tudo bem?', 'Fazem exame?'])
  assert.equal(messages.some((item) => item.text?.includes('\n')), false)
})

test('janela agregada vira um turno pronto com chave idempotente', () => {
  const storedMessages = [0, 1, 2].map((index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
    provider_message_id: `provider-${index + 1}`,
    role: 'customer',
    message_kind: 'text',
    message_text: `Mensagem ${index + 1}`,
    occurred_at: new Date(Date.parse(BASE_TIME) + index * 1000).toISOString(),
  }))
  const turn = buildShadowInboundTurn('provider-3', storedMessages, {
    aggregated: true,
    aggregationWindowMs: 20_000,
  })

  assert.equal(turn.turnKey, 'inbound:provider-3')
  assert.equal(turn.draft.messageIds.length, 3)
  assert.equal(turn.draft.closesAt, '2026-09-18T12:00:22.000Z')
  assert.equal(turn.metadata.messageCount, 3)
})

test('ingestao sombra preserva o tipo do anexo sem persistir base64', () => {
  const messages = extractShadowInboundMessages({
    providerMessageId: 'provider-image',
    messageText: 'Tem uma parecida?',
    providerCreatedAt: BASE_TIME,
    payload: {
      data: {
        message: {
          imageMessage: {
            caption: 'Tem uma parecida?',
            mimetype: 'image/jpeg',
            base64: 'ZmFrZQ==',
          },
        },
      },
    },
  })

  assert.equal(messages[0].kind, 'image')
  assert.equal(messages[0].text, 'Tem uma parecida?')
  assert.equal(JSON.stringify(messages[0].metadata).includes('ZmFrZQ'), false)
})

test('saida confirmada distingue funcionario de assistente', () => {
  assert.equal(inferShadowOutboundRole('operator_manual', { sentBy: 'operator' }), 'human')
  assert.equal(inferShadowOutboundRole('manual_campaign', { manual: true }), 'human')
  assert.equal(inferShadowOutboundRole('os_status', { source: 'automation' }), 'assistant')
})

test('falha do modo sombra nunca interrompe o fluxo legado', async () => {
  const errors: unknown[] = []
  const result = await runFailOpenShadowCapture(
    async () => { throw new Error('banco do redesign indisponivel') },
    (error) => errors.push(error)
  )

  assert.deepEqual(result, { success: false })
  assert.equal(errors.length, 1)
})
