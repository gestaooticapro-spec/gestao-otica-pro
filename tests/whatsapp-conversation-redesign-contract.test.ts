import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WHATSAPP_REDESIGN_HUMAN_ACTIVE_MS,
  WhatsAppConversationMemorySchema,
  WhatsAppRedesignClassificationSchema,
  WhatsAppSystemDecisionDraftSchema,
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
  clearWhatsAppRedesignModeCache,
  inferShadowOutboundRole,
  resolveCachedWhatsAppRedesignMode,
  resolveWhatsAppRedesignMode,
  runFailOpenShadowCapture,
} from '../src/lib/whatsapp/redesign/shadow-ingestion'
import { applyStoreAvailabilityToDecision } from '../src/lib/whatsapp/redesign/store-availability-policy'
import {
  buildOfficialStoreLocationReply,
  buildWhatsAppShadowDecision,
  isExplicitOfficialPixRequest,
} from '../src/lib/whatsapp/redesign/system-decision'
import { processWhatsAppRedesignShadowTurns } from '../src/lib/whatsapp/redesign/shadow-processor'
import {
  applyConfirmedControlEvent,
  proposeWhatsAppConversationSummary,
  reconcileConfirmedHumanActivity,
  reconcileLegacyManualPause,
  replayWhatsAppConversationSummary,
} from '../src/lib/whatsapp/redesign/memory-consolidation'
import { WhatsAppRedesignConversationStore } from '../src/lib/whatsapp/redesign/store'
import {
  classifyWhatsAppShadowOutcome,
  compareWhatsAppShadowWithLegacy,
  extractWhatsAppLegacyCanonicalEvidence,
  extractWhatsAppShadowDecisionEvidence,
} from '../src/lib/whatsapp/redesign/shadow-comparison'

const BASE_TIME = '2026-09-18T12:00:00.000Z'

test('comparacao da etapa 3 extrai somente evidencias estruturadas', () => {
  const shadow = extractWhatsAppShadowDecisionEvidence({
    shadowProcessing: {
      classification: { intent: 'store_hours', mentionsAttachment: false },
      decision: { action: 'answer_store_hours', canonicalReply: 'conteudo privado' },
    },
  })
  const legacy = extractWhatsAppLegacyCanonicalEvidence({
    canonical: {
      intent: 'store_hours',
      action: 'auto_reply',
      outboundType: 'store_hours',
      canonicalReply: 'outro conteudo privado',
      facts: { storeName: 'privado' },
    },
  })

  assert.deepEqual(shadow, {
    action: 'answer_store_hours',
    intent: 'store_hours',
    mentionsAttachment: false,
  })
  assert.deepEqual(legacy, {
    canonicalAction: 'auto_reply',
    canonicalOutboundType: 'store_hours',
    canonicalIntent: 'store_hours',
  })
})

test('comparacao da etapa 3 distingue alinhamento, seguranca e divergencia', () => {
  const hoursShadow = {
    action: 'answer_store_hours' as const,
    intent: 'store_hours' as const,
    mentionsAttachment: false,
  }
  assert.equal(compareWhatsAppShadowWithLegacy(hoursShadow, {
    inboundStatus: 'processed', outboundStatus: 'sent', messageType: 'store_hours',
    canonicalAction: 'auto_reply', canonicalOutboundType: 'store_hours', canonicalIntent: 'store_hours',
  }).verdict, 'aligned')

  assert.equal(compareWhatsAppShadowWithLegacy({
    action: 'human_handoff', intent: 'attachment', mentionsAttachment: true,
  }, {
    inboundStatus: 'processed', outboundStatus: 'sent', messageType: 'human_handoff',
    canonicalAction: 'human_handoff', canonicalOutboundType: 'human_handoff', canonicalIntent: null,
  }).verdict, 'safety_aligned')

  assert.equal(compareWhatsAppShadowWithLegacy(hoursShadow, {
    inboundStatus: 'ignored', outboundStatus: null, messageType: null,
    canonicalAction: null, canonicalOutboundType: null, canonicalIntent: null,
  }).verdict, 'divergent')

  assert.equal(compareWhatsAppShadowWithLegacy(hoursShadow, {
    inboundStatus: 'received', outboundStatus: null, messageType: null,
    canonicalAction: null, canonicalOutboundType: null, canonicalIntent: null,
  }).verdict, 'inconclusive')
})

test('comparador reconhece resposta Pix oficial como saida automatica', () => {
  assert.equal(classifyWhatsAppShadowOutcome({
    action: 'answer_official_pix', intent: 'unknown', mentionsAttachment: false,
  }), 'other_reply')
})

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

test('consolidacao proposta preserva historico de assuntos sem efetivar handoff em sombra', () => {
  const summary = defaultConversationSummary(BASE_TIME)
  const classification = {
    intent: 'store_location' as const,
    confidence: 0.98,
    topicRelation: 'change_topic' as const,
    requestsHuman: false,
    mentionsAttachment: false,
    entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
  }
  const afterHours = proposeWhatsAppConversationSummary({
    summary,
    classification: { ...classification, intent: 'store_hours' },
    turnMessages: [message(1)],
    at: BASE_TIME,
  })
  const afterLocation = proposeWhatsAppConversationSummary({
    summary: afterHours,
    classification,
    turnMessages: [message(2)],
    at: BASE_TIME,
  })
  const afterPhoto = proposeWhatsAppConversationSummary({
    summary: afterLocation,
    classification: { ...classification, intent: 'attachment', mentionsAttachment: true },
    turnMessages: [{ ...message(3), kind: 'image', text: 'Receberam esta foto?' }],
    at: BASE_TIME,
  })

  assert.equal(afterPhoto.activeTopic, 'attachment')
  assert.deepEqual(afterPhoto.secondaryTopics, ['store_location', 'store_hours'])
  assert.equal(afterPhoto.attachmentStatus, 'received')
  assert.equal(afterPhoto.humanControl, 'ai_active')
  assert.equal(afterPhoto.pendingAction, 'none')
})

test('assunto paralelo nao substitui o assunto ativo nem duplica o historico', () => {
  const summary = {
    ...defaultConversationSummary(BASE_TIME),
    activeTopic: 'order_status' as const,
    secondaryTopics: ['store_hours' as const],
  }
  const next = proposeWhatsAppConversationSummary({
    summary,
    classification: {
      intent: 'store_hours', confidence: 0.9, topicRelation: 'parallel_topic',
      requestsHuman: false, mentionsAttachment: false,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
    },
    turnMessages: [message(1)],
    at: BASE_TIME,
  })
  assert.equal(next.activeTopic, 'order_status')
  assert.deepEqual(next.secondaryTopics, ['store_hours'])
})

test('consolidacao proposta nao libera atendimento humano nem cria pendencia por simulacao', () => {
  const active = registerHumanActivity(defaultConversationSummary(BASE_TIME), BASE_TIME)
  const next = proposeWhatsAppConversationSummary({
    summary: active,
    classification: {
      intent: 'attachment', confidence: 0.95, topicRelation: 'change_topic',
      requestsHuman: true, mentionsAttachment: true,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
    },
    turnMessages: [{ ...message(1), kind: 'image' }],
    at: '2026-09-18T12:01:00.000Z',
  })
  assert.equal(next.humanControl, 'human_active')
  assert.equal(next.humanActiveUntil, active.humanActiveUntil)
  assert.equal(next.pendingAction, 'none')
  assert.equal(next.attachmentStatus, 'received')
})

test('somente atividade humana confirmada ativa e renova a pausa de duas horas', () => {
  const firstAt = '2026-09-18T12:00:00.000Z'
  const secondAt = '2026-09-18T13:00:00.000Z'
  const first = reconcileConfirmedHumanActivity({
    summary: defaultConversationSummary(BASE_TIME),
    humanMessageAt: firstAt,
    asOf: '2026-09-18T12:30:00.000Z',
  })
  assert.equal(first.humanControl, 'human_active')
  assert.equal(first.humanActiveUntil, '2026-09-18T14:00:00.000Z')

  const renewed = reconcileConfirmedHumanActivity({
    summary: first,
    humanMessageAt: secondAt,
    asOf: '2026-09-18T13:30:00.000Z',
  })
  assert.equal(renewed.humanActiveUntil, '2026-09-18T15:00:00.000Z')
  assert.equal(reconcileConfirmedHumanActivity({
    summary: renewed,
    humanMessageAt: secondAt,
    asOf: '2026-09-18T14:59:59.999Z',
  }).humanControl, 'human_active')
  const released = reconcileConfirmedHumanActivity({
    summary: renewed,
    humanMessageAt: secondAt,
    asOf: '2026-09-18T15:00:00.000Z',
  })
  assert.equal(released.humanControl, 'human_released')
  assert.equal(reconcileConfirmedHumanActivity({
    summary: released,
    humanMessageAt: secondAt,
    asOf: '2026-09-18T15:10:00.000Z',
  }).humanControl, 'human_released')
})

test('liberacao explicita vence a mensagem humana anterior sem apagar o assunto', () => {
  const active = {
    ...registerHumanActivity(defaultConversationSummary(BASE_TIME), BASE_TIME),
    activeTopic: 'order_status' as const,
  }
  const released = applyConfirmedControlEvent({
    summary: active,
    event: { action: 'release', occurredAt: '2026-09-18T12:30:00.000Z', reason: null },
    asOf: '2026-09-18T12:31:00.000Z',
  })
  assert.equal(released.humanControl, 'human_released')
  assert.equal(released.humanActiveUntil, null)
  assert.equal(released.activeTopic, 'order_status')
  assert.equal(released.lastHumanActivityAt, BASE_TIME)
  assert.throws(() => applyConfirmedControlEvent({
    summary: active,
    event: { action: 'release', occurredAt: '2026-09-18T13:00:00.000Z', reason: null },
    asOf: '2026-09-18T12:31:00.000Z',
  }), /fora do contexto/)
})

test('nova resposta humana depois da liberacao inicia outra janela de duas horas', () => {
  const first = registerHumanActivity(defaultConversationSummary(BASE_TIME), BASE_TIME)
  const released = applyConfirmedControlEvent({
    summary: first,
    event: { action: 'release', occurredAt: '2026-09-18T12:30:00.000Z', reason: null },
    asOf: '2026-09-18T12:30:00.000Z',
  })
  const resumedByHuman = reconcileConfirmedHumanActivity({
    summary: released,
    humanMessageAt: '2026-09-18T12:31:00.000Z',
    asOf: '2026-09-18T12:31:00.000Z',
  })
  assert.equal(resumedByHuman.humanControl, 'human_active')
  assert.equal(resumedByHuman.humanActiveUntil, '2026-09-18T14:31:00.000Z')
  assert.equal(releaseExpiredHumanControl(resumedByHuman, '2026-09-18T14:31:00.000Z').humanControl, 'human_released')
})

test('handoff confirmado gera pendencia sem iniciar bloqueio humano', () => {
  const pending = applyConfirmedControlEvent({
    summary: defaultConversationSummary(BASE_TIME),
    event: { action: 'handoff_sent', occurredAt: BASE_TIME, reason: 'anexo' },
    asOf: BASE_TIME,
  })
  assert.equal(pending.humanControl, 'human_pending')
  assert.equal(pending.pendingAction, 'awaiting_human')
  assert.equal(pending.humanActiveUntil, null)
})

test('store finaliza turno processado por RPC e registra evento humano por RPC', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const fakeClient = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: defaultConversationSummary(BASE_TIME), error: null }
    },
  }
  const store = new WhatsAppRedesignConversationStore(fakeClient as any)
  await store.finishTurn({
    turnId: '00000000-0000-4000-8000-000000000101',
    status: 'processed',
    metadata: { shadowProcessing: { sendsMessage: false } },
  })
  await store.recordControlEvent({
    conversationId: 1,
    eventKey: 'outbound:1:assume',
    action: 'assume',
    occurredAt: BASE_TIME,
    actor: 'confirmed_outbound',
    messageId: '00000000-0000-4000-8000-000000000102',
  })
  assert.deepEqual(calls.map((call) => call.name), [
    'finish_whatsapp_redesign_shadow_turn',
    'record_whatsapp_conversation_control_event',
  ])
  assert.equal(calls[1].args.p_message_id, '00000000-0000-4000-8000-000000000102')
})

test('store recupera somente turnos shadow em processamento ha mais de dez minutos', async () => {
  const calls: Array<{ table: string; method: string; args: unknown[] }> = []
  const client = {
    from: (table: string) => {
      const result = table === 'whatsapp_conversation_memory'
        ? { data: [{ id: 42 }], error: null }
        : { data: [{ id: 'stale-turn' }, { id: 'another-stale-turn' }], error: null }
      const builder: any = {}
      for (const method of ['select', 'eq', 'in', 'lte']) {
        builder[method] = (...args: unknown[]) => {
          calls.push({ table, method, args })
          return builder
        }
      }
      builder.update = (...args: unknown[]) => {
        calls.push({ table, method: 'update', args })
        return builder
      }
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject)
      return builder
    },
  }
  const store = new WhatsAppRedesignConversationStore(client as any)
  const recovered = await store.recoverStaleProcessingTurns('2026-09-18T12:20:00.000Z', 1)

  assert.equal(recovered, 2)
  assert.ok(calls.some((call) => call.table === 'whatsapp_conversation_memory'
    && call.method === 'eq' && call.args[0] === 'mode' && call.args[1] === 'shadow'))
  assert.ok(calls.some((call) => call.table === 'whatsapp_conversation_turns'
    && call.method === 'update'
    && (call.args[0] as { status: string }).status === 'ready'))
  assert.ok(calls.some((call) => call.table === 'whatsapp_conversation_turns'
    && call.method === 'eq' && call.args[0] === 'status' && call.args[1] === 'processing'))
  assert.ok(calls.some((call) => call.table === 'whatsapp_conversation_turns'
    && call.method === 'lte' && call.args[0] === 'updated_at'
    && call.args[1] === '2026-09-18T12:10:00.000Z'))
})

test('mensagem humana posterior ao turno nao contamina contexto anterior', () => {
  assert.throws(() => reconcileConfirmedHumanActivity({
    summary: defaultConversationSummary(BASE_TIME),
    humanMessageAt: '2026-09-18T13:00:00.000Z',
    asOf: BASE_TIME,
  }), /atividade humana invalida/)
})

test('pausa legada manual anterior a sombra e reconciliada sem aceitar handoff automatico', () => {
  const base = defaultConversationSummary(BASE_TIME)
  const manualState = {
    state: 'human_pause', reason: 'store_initiated',
    updatedAt: '2026-09-18T12:00:00.000Z',
    expiresAt: '2026-09-19T00:00:00.000Z',
  }
  const active = reconcileLegacyManualPause({
    summary: base, legacyState: manualState,
    asOf: '2026-09-18T12:30:00.000Z',
  })
  assert.equal(active.humanControl, 'human_active')
  assert.equal(active.humanActiveUntil, '2026-09-18T14:00:00.000Z')

  const previouslyReleased = reconcileConfirmedHumanActivity({
    summary: base,
    humanMessageAt: '2026-09-17T10:00:00.000Z',
    asOf: '2026-09-18T12:30:00.000Z',
  })
  assert.equal(reconcileLegacyManualPause({
    summary: previouslyReleased, legacyState: manualState,
    asOf: '2026-09-18T12:30:00.000Z',
  }).humanControl, 'human_active')

  const automatic = reconcileLegacyManualPause({
    summary: base,
    legacyState: { ...manualState, reason: 'audio_received_silent_handoff' },
    asOf: '2026-09-18T12:30:00.000Z',
  })
  assert.equal(automatic.humanControl, 'ai_active')
  assert.equal(reconcileLegacyManualPause({
    summary: base, legacyState: manualState,
    asOf: '2026-09-18T11:59:59.999Z',
  }).humanControl, 'ai_active')
  assert.equal(reconcileLegacyManualPause({
    summary: base, legacyState: manualState,
    asOf: '2026-09-19T00:00:00.000Z',
  }).humanControl, 'ai_active')
})

test('replay ordenado corrige chegada fora de ordem sem apagar controle humano', () => {
  const human = registerHumanActivity(defaultConversationSummary('2026-09-18T13:00:00.000Z'), '2026-09-18T13:00:00.000Z')
  const classification = (intent: 'store_hours' | 'store_location' | 'attachment') => ({
    intent, confidence: 0.99, topicRelation: 'change_topic' as const,
    requestsHuman: false, mentionsAttachment: intent === 'attachment',
    entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
  })
  const turns = [
    { id: 'hours', openedAt: '2026-09-18T12:00:00.000Z', closesAt: '2026-09-18T12:00:20.000Z', classification: classification('store_hours'), turnMessages: [message(1)] },
    { id: 'address', openedAt: '2026-09-18T12:02:00.000Z', closesAt: '2026-09-18T12:02:20.000Z', classification: classification('store_location'), turnMessages: [message(2)] },
    { id: 'photo', openedAt: '2026-09-18T12:04:00.000Z', closesAt: '2026-09-18T12:04:20.000Z', classification: classification('attachment'), turnMessages: [{ ...message(3), kind: 'image' as const }] },
  ]
  const result = replayWhatsAppConversationSummary({ summary: human, processedTurns: [turns[2], turns[0], turns[1]] })
  assert.equal(result.activeTopic, 'attachment')
  assert.deepEqual(result.secondaryTopics, ['store_location', 'store_hours'])
  assert.equal(result.attachmentStatus, 'received')
  assert.equal(result.humanControl, 'human_active')
  assert.equal(result.humanActiveUntil, human.humanActiveUntil)
  assert.equal(result.updatedAt, human.updatedAt)
  assert.deepEqual(result, replayWhatsAppConversationSummary({ summary: result, processedTurns: turns }))
  assert.throws(() => replayWhatsAppConversationSummary({ summary: human, processedTurns: [turns[0], turns[0]] }), /Turno repetido/)
})

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
    humanHandoffTiming: null,
    humanization,
  }))

  assert.doesNotThrow(() => WhatsAppSystemDecisionSchema.parse({
    action: 'no_reply',
    canonicalReply: null,
    facts: {},
    humanHandoffTiming: null,
    humanization,
  }))

  assert.throws(() => WhatsAppSystemDecisionSchema.parse({
    action: 'human_handoff',
    canonicalReply: null,
    facts: {},
    humanHandoffTiming: null,
    humanization,
  }))
})

test('fora do expediente nao bloqueia respostas que nao dependem de funcionario', () => {
  const decision = WhatsAppSystemDecisionSchema.parse({
    action: 'answer_store_location',
    canonicalReply: 'Estamos na Rua Principal, 100.',
    facts: { address: 'Rua Principal, 100' },
    humanHandoffTiming: null,
    humanization: {
      mustNotAddFacts: true,
      mustKeepShort: true,
      mustIdentifyIara: false,
      mustMentionHumanHandoff: false,
      forbiddenClaims: [],
    },
  })

  const result = applyStoreAvailabilityToDecision(decision, {
    is_open_now: false,
    is_exceptional_closure: false,
    today_schedule: '08:00 as 18:00',
    next_open_schedule: 'Amanhã às 08:00',
    full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
  })

  assert.deepEqual(result, decision)
})

test('handoff fora do expediente informa quando a equipe continuara o atendimento', () => {
  const decision = WhatsAppSystemDecisionDraftSchema.parse({
    action: 'human_handoff',
    canonicalReply: 'Sou a IAra, uma assistente virtual. Vou encaminhar sua pergunta sobre a peca para um atendente.',
    facts: { handoffReason: 'product_availability' },
    humanHandoffTiming: null,
    humanization: {
      mustNotAddFacts: true,
      mustKeepShort: true,
      mustIdentifyIara: true,
      mustMentionHumanHandoff: true,
      forbiddenClaims: [],
    },
  })

  const result = applyStoreAvailabilityToDecision(decision, {
    is_open_now: false,
    is_exceptional_closure: false,
    today_schedule: 'Fechado',
    next_open_schedule: 'Amanhã às 08:00',
    full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
  })

  assert.equal(result.humanHandoffTiming?.mode, 'when_store_opens')
  assert.equal(result.humanHandoffTiming?.nextOpenSchedule, 'Amanhã às 08:00')
  assert.equal(result.facts.isStoreOpenNow, false)
  assert.match(result.canonicalReply || '', /quando ela abrir, amanhã às 08:00/i)
})

test('handoff fechado nunca inventa horario quando a agenda nao calcula a proxima abertura', () => {
  const decision = WhatsAppSystemDecisionDraftSchema.parse({
    action: 'human_handoff',
    canonicalReply: 'Sou a IAra, uma assistente virtual. Vou encaminhar este caso para um atendente.',
    facts: { handoffReason: 'unknown' },
    humanHandoffTiming: null,
    humanization: {
      mustNotAddFacts: true,
      mustKeepShort: true,
      mustIdentifyIara: true,
      mustMentionHumanHandoff: true,
      forbiddenClaims: [],
    },
  })

  assert.throws(() => applyStoreAvailabilityToDecision(decision, {
    is_open_now: false,
    is_exceptional_closure: true,
    exceptional_closure_reason: 'Fechamento excepcional',
    today_schedule: 'Fechado excepcionalmente',
    next_open_schedule: '',
    full_weekly_schedule: '',
  }), /proximo horario de abertura nao foi calculado/i)
})

test('handoff durante o expediente continua imediato', () => {
  const decision = WhatsAppSystemDecisionDraftSchema.parse({
    action: 'repeat_handoff',
    canonicalReply: 'Sou a IAra, uma assistente virtual. Vou chamar novamente um atendente para continuar esse assunto.',
    facts: { handoffReason: 'conversation_continuation' },
    humanHandoffTiming: null,
    humanization: {
      mustNotAddFacts: true,
      mustKeepShort: true,
      mustIdentifyIara: true,
      mustMentionHumanHandoff: true,
      forbiddenClaims: [],
    },
  })

  const result = applyStoreAvailabilityToDecision(decision, {
    is_open_now: true,
    is_exceptional_closure: false,
    today_schedule: '08:00 as 18:00',
    next_open_schedule: '',
    full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
  })

  assert.equal(result.canonicalReply, decision.canonicalReply)
  assert.equal(result.humanHandoffTiming?.mode, 'during_open_hours')
  assert.equal(result.facts.isStoreOpenNow, true)
})

test('decisao sombra usa somente horario oficial para responder sobre expediente', () => {
  const memory = {
    summary: defaultConversationSummary(BASE_TIME),
    messages: [message(1)],
  }
  const result = buildWhatsAppShadowDecision({
    classification: {
      intent: 'store_hours',
      confidence: 0.98,
      topicRelation: 'change_topic',
      requestsHuman: false,
      mentionsAttachment: false,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
    },
    memory,
    now: BASE_TIME,
    hoursFacts: {
      is_open_now: true,
      is_exceptional_closure: false,
      today_schedule: '08:00 às 18:00',
      next_open_schedule: '',
      full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
    },
    storeLocationReply: null,
    hasCurrentTurnAttachment: false,
  })

  assert.equal(result.draft.action, 'answer_store_hours')
  assert.match(result.draft.canonicalReply || '', /abertos agora/i)
  assert.equal(result.draft.facts.isStoreOpenNow, true)
})

test('pedido literal da chave Pix vira acao registrada sem gravar o valor da chave no turno', () => {
  assert.equal(isExplicitOfficialPixRequest('Qual é a chave Pix da loja?'), true)
  assert.equal(isExplicitOfficialPixRequest('Me passa a chave Pix da ótica, por favor'), true)

  const result = buildWhatsAppShadowDecision({
    classification: {
      intent: 'unknown', confidence: 0.98, topicRelation: 'continue_topic',
      requestsHuman: false, mentionsAttachment: false,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
    },
    memory: { summary: defaultConversationSummary(BASE_TIME), messages: [message(1)] },
    now: BASE_TIME,
    hoursFacts: null,
    storeLocationReply: null,
    hasCurrentTurnAttachment: false,
    explicitOfficialPixRequest: true,
    hasOfficialPixKey: true,
  })

  assert.equal(result.draft.action, 'answer_official_pix')
  assert.equal(result.reason, 'official_pix_key_requested')
  assert.doesNotMatch(result.draft.canonicalReply || '', /chave-teste/)
})

test('decisao sombra nao propoe resposta enquanto o humano confirmado esta ativo', () => {
  const summary = reconcileConfirmedHumanActivity({
    summary: defaultConversationSummary(BASE_TIME),
    humanMessageAt: BASE_TIME,
    asOf: '2026-09-18T12:30:00.000Z',
  })
  const result = buildWhatsAppShadowDecision({
    classification: {
      intent: 'store_hours', confidence: 0.99, topicRelation: 'change_topic',
      requestsHuman: false, mentionsAttachment: false,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
    },
    memory: { summary, messages: [message(1)] },
    now: '2026-09-18T12:30:00.000Z',
    hoursFacts: {
      is_open_now: true, is_exceptional_closure: false,
      today_schedule: '08:00 às 18:00', next_open_schedule: '',
      full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
    },
    storeLocationReply: null,
    hasCurrentTurnAttachment: false,
  })
  assert.equal(result.draft.action, 'no_reply')
  assert.equal(result.reason, 'human_control_blocks_ai')
})

test('anexo, pedido de atendente e baixa confianca prevalecem sobre resposta de horario', () => {
  const classification = {
    intent: 'store_hours' as const,
    confidence: 0.98,
    topicRelation: 'change_topic' as const,
    requestsHuman: false,
    mentionsAttachment: false,
    entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
  }
  const input = {
    classification,
    memory: { summary: defaultConversationSummary(BASE_TIME), messages: [message(1)] },
    now: BASE_TIME,
    hoursFacts: {
      is_open_now: true,
      is_exceptional_closure: false,
      today_schedule: '08:00 as 18:00',
      next_open_schedule: '',
      full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
    },
    storeLocationReply: null,
    hasCurrentTurnAttachment: false,
  }

  const withAttachment = buildWhatsAppShadowDecision({ ...input, hasCurrentTurnAttachment: true })
  assert.equal(withAttachment.draft.action, 'human_handoff')
  assert.equal(withAttachment.reason, 'attachment_requires_human_review')

  const withHumanRequest = buildWhatsAppShadowDecision({
    ...input,
    classification: { ...classification, requestsHuman: true },
  })
  assert.equal(withHumanRequest.draft.action, 'human_handoff')
  assert.equal(withHumanRequest.reason, 'customer_requests_human')

  const withLowConfidence = buildWhatsAppShadowDecision({
    ...input,
    classification: { ...classification, confidence: 0.2 },
  })
  assert.equal(withLowConfidence.draft.action, 'human_handoff')
  assert.equal(withLowConfidence.reason, 'classification_below_safe_confidence')
})

test('assunto que exige funcionario gera handoff transparente da IAra', () => {
  const result = buildWhatsAppShadowDecision({
    classification: {
      intent: 'vision_exam',
      confidence: 0.97,
      topicRelation: 'change_topic',
      requestsHuman: false,
      mentionsAttachment: false,
      entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
    },
    memory: {
      summary: defaultConversationSummary(BASE_TIME),
      messages: [message(1)],
    },
    now: BASE_TIME,
    hoursFacts: {
      is_open_now: true,
      is_exceptional_closure: false,
      today_schedule: '08:00 às 18:00',
      next_open_schedule: '',
      full_weekly_schedule: 'Segunda-feira: 08:00 - 18:00',
    },
    storeLocationReply: null,
    hasCurrentTurnAttachment: false,
  })

  assert.equal(result.draft.action, 'human_handoff')
  assert.match(result.draft.canonicalReply || '', /Sou a IAra/i)
  assert.equal(result.draft.humanization.mustMentionHumanHandoff, true)
})

test('endereco oficial produz link de mapa sem depender da IA', () => {
  const reply = buildOfficialStoreLocationReply({
    street: 'Rua Principal',
    number: '100',
    neighborhood: 'Centro',
    city: 'Marília',
    state: 'SP',
  })

  assert.match(reply || '', /Rua Principal, 100/)
  assert.match(reply || '', /google\.com\/maps\/search/)
  assert.match(reply || '', /query=Rua\+Principal/)
})

test('processador atende turno capturado imediatamente e registra decisao sem enviar mensagem', async () => {
  const turnId = '00000000-0000-4000-8000-000000000101'
  const customerMessage = {
    ...message(1),
    id: '00000000-0000-4000-8000-000000000102',
    text: 'Vocês fazem exame de vista?',
  }
  const finished: Array<{ status: string; metadata: Record<string, unknown> }> = []
  const fakeStore = {
    recoverStaleProcessingTurns: async () => 1,
    listReadyTurnIds: async () => [turnId],
    claimReadyTurn: async () => true,
    loadTurnContext: async () => ({
      turn: {
        id: turnId,
        conversation_id: 1,
        turn_key: 'inbound:test',
        status: 'processing',
        opened_at: BASE_TIME,
        closes_at: BASE_TIME,
        processed_at: null,
        metadata: { source: 'test' },
        created_at: BASE_TIME,
        updated_at: BASE_TIME,
      },
      conversation: {
        id: 1,
        tenant_id: '00000000-0000-4000-8000-000000000001',
        store_id: 1,
        channel_id: 1,
        remote_phone: '5511999999999',
        mode: 'shadow',
        summary: defaultConversationSummary(BASE_TIME),
        last_message_at: BASE_TIME,
        created_at: BASE_TIME,
        updated_at: BASE_TIME,
      },
      memory: { summary: defaultConversationSummary(BASE_TIME), messages: [customerMessage] },
      turnMessages: [customerMessage],
    }),
    loadStore: async () => ({
      id: 1,
      name: 'Loja 1',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      settings: {
        whatsapp_automation: {
          ai_redesign: { mode: 'shadow' },
        },
        store_hours: {
          timezone: 'America/Sao_Paulo',
          weekly_schedule: Array.from({ length: 7 }, (_, day) => ({
            day,
            is_open: true,
            open_time: '00:00',
            close_time: '23:59',
          })),
          break_windows: [],
          special_closures: [],
          special_openings: [],
        },
      },
      street: 'Rua Principal',
      number: '100',
      neighborhood: 'Centro',
      city: 'Marília',
      state: 'SP',
    }),
    finishTurn: async (input: { status: string; metadata: Record<string, unknown> }) => {
      finished.push(input)
    },
  } as unknown as WhatsAppRedesignConversationStore

  const result = await processWhatsAppRedesignShadowTurns({
    store: fakeStore,
    storeId: 1,
    turnId,
    now: new Date(BASE_TIME),
    classifier: async () => ({
      success: true,
      provider: 'openai',
      model: 'test-model',
      keyIndex: 0,
      data: {
        intent: 'vision_exam',
        confidence: 0.99,
        topicRelation: 'change_topic',
        requestsHuman: false,
        mentionsAttachment: false,
        entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
      },
      attempts: 1,
      rawText: '{}',
      latencyMs: 5,
      promptText: 'test',
    }),
  })

  assert.deepEqual(result, { discovered: 1, recovered: 0, processed: 1, failed: 0, skipped: 0, sendsMessage: false })
  assert.equal(finished[0].status, 'processed')
  const processing = finished[0].metadata.shadowProcessing as Record<string, unknown>
  assert.equal(processing.sendsMessage, false)
  assert.equal((processing.decision as { action: string }).action, 'human_handoff')
  assert.equal((processing.summaryProposal as { activeTopic: string }).activeTopic, 'vision_exam')
  assert.equal((processing.summaryProposal as { humanControl: string }).humanControl, 'ai_active')
})

test('processador libera turno sem classificar quando a loja voltou para legacy', async () => {
  const turnId = '00000000-0000-4000-8000-000000000201'
  const customerMessage = {
    ...message(1),
    id: '00000000-0000-4000-8000-000000000202',
    text: 'Vocês fazem exame de vista?',
  }
  let releaseCount = 0
  let classifierCalled = false
  const fakeStore = {
    listReadyTurnIds: async () => [turnId],
    claimReadyTurn: async () => true,
    releaseClaimedTurn: async () => {
      releaseCount += 1
      return true
    },
    loadTurnContext: async () => ({
      turn: {
        id: turnId,
        conversation_id: 1,
        turn_key: 'inbound:legacy-store',
        status: 'processing',
        opened_at: BASE_TIME,
        closes_at: BASE_TIME,
        processed_at: null,
        metadata: {},
        created_at: BASE_TIME,
        updated_at: BASE_TIME,
      },
      conversation: {
        id: 1,
        tenant_id: '00000000-0000-4000-8000-000000000001',
        store_id: 1,
        channel_id: 1,
        remote_phone: '5511999999999',
        mode: 'shadow',
        summary: defaultConversationSummary(BASE_TIME),
        last_message_at: BASE_TIME,
        created_at: BASE_TIME,
        updated_at: BASE_TIME,
      },
      memory: { summary: defaultConversationSummary(BASE_TIME), messages: [customerMessage] },
      turnMessages: [customerMessage],
    }),
    loadStore: async () => ({
      id: 1,
      name: 'Loja 1',
      tenant_id: '00000000-0000-4000-8000-000000000001',
      settings: { whatsapp_automation: { ai_redesign: { mode: 'legacy' } } },
      street: null,
      number: null,
      neighborhood: null,
      city: null,
      state: null,
    }),
    finishTurn: async () => {
      throw new Error('turno legacy nao deve ser finalizado')
    },
  } as unknown as WhatsAppRedesignConversationStore

  const result = await processWhatsAppRedesignShadowTurns({
    store: fakeStore,
    now: new Date(BASE_TIME),
    classifier: async () => {
      classifierCalled = true
      throw new Error('classificador nao deve ser chamado')
    },
  })

  assert.deepEqual(result, { discovered: 1, recovered: 0, processed: 0, failed: 0, skipped: 1, sendsMessage: false })
  assert.equal(releaseCount, 1)
  assert.equal(classifierCalled, false)
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

test('modo do redesign usa cache curto por loja e evita leituras repetidas', async () => {
  clearWhatsAppRedesignModeCache()
  let loads = 0
  const loader = async () => {
    loads += 1
    return 'shadow' as const
  }

  assert.equal(await resolveCachedWhatsAppRedesignMode(1, loader, 1_000), 'shadow')
  assert.equal(await resolveCachedWhatsAppRedesignMode(1, loader, 1_001), 'shadow')
  assert.equal(loads, 1)

  assert.equal(await resolveCachedWhatsAppRedesignMode(1, loader, 61_001), 'shadow')
  assert.equal(loads, 2)
  clearWhatsAppRedesignModeCache()
})

test('leituras simultaneas do modo compartilham a mesma consulta', async () => {
  clearWhatsAppRedesignModeCache()
  let loads = 0
  let releaseLoader = () => {}
  const gate = new Promise<void>((resolve) => { releaseLoader = resolve })
  const loader = async () => {
    loads += 1
    await gate
    return 'legacy' as const
  }

  const first = resolveCachedWhatsAppRedesignMode(2, loader, 1_000)
  const second = resolveCachedWhatsAppRedesignMode(2, loader, 1_000)
  releaseLoader()

  assert.deepEqual(await Promise.all([first, second]), ['legacy', 'legacy'])
  assert.equal(loads, 1)
  clearWhatsAppRedesignModeCache()
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
    occurred_at: new Date(Date.parse(BASE_TIME) + index * 1000).toISOString().replace('Z', '+00:00'),
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
