import assert from 'node:assert/strict'
import test from 'node:test'
import { buildAutomatedConversationState, hasNewerConversationState, recordAutomatedOutboundConversationContext } from '../src/lib/whatsapp/automated-conversation-context'
import { shouldAcknowledgeLatestPaymentReminder } from '../src/lib/whatsapp/customer-status'
import { phonesMatch } from '../src/lib/whatsapp/phone'
import { shouldReleaseHumanPauseForAutomatedOutbound } from '../src/lib/whatsapp/redesign/shadow-ingestion'
import { WhatsAppRedesignConversationStore } from '../src/lib/whatsapp/redesign/store'

const sentAtIso = '2026-10-01T14:22:29.000Z'

test('o lembrete substitui a pausa nas variantes do telefone e preserva o pós-venda', () => {
  const phoneWithoutNinthDigit = '551199999999'
  const phoneWithNinthDigit = '5511999999999'
  assert.equal(phonesMatch(phoneWithoutNinthDigit, phoneWithNinthDigit), true)

  const state = buildAutomatedConversationState({
    rows: [
      {
        id: 1, remote_phone: phoneWithoutNinthDigit, state: 'human_pause',
        expires_at: '2026-10-01T16:05:49.000Z', updated_at: '2026-10-01T14:05:49.000Z',
        metadata: {
          reason: 'store_initiated', humanActivityAt: '2026-10-01T14:05:48.000Z',
          handoffResolvedByOperator: true,
          postSaleContext: { postSalesId: 37, stage: 'awaiting_rating' },
        },
      },
      {
        id: 2, remote_phone: phoneWithNinthDigit, state: 'ai_session',
        handoff_pending: true,
        expires_at: '2026-10-03T14:00:00.000Z', updated_at: '2026-10-01T14:00:00.000Z',
        metadata: {
          aiSessionMessages: [{ role: 'customer', text: 'Estou me adaptando bem', at: '2026-10-01T14:00:00.000Z' }],
        },
      },
    ],
    sentAtIso,
    retentionMs: 48 * 60 * 60 * 1000,
    messageText: 'Sua parcela vence em breve.',
    metadata: {
      reason: 'installment_due_reminder_sent',
      paymentReminderContext: { reminderId: 4334, customerId: 20, outboundMessageId: 17651 },
    },
  })

  const metadata = state.metadata as Record<string, unknown>
  assert.equal(state.state, 'ai_session')
  assert.equal(state.handoff_pending, true)
  assert.equal(state.expires_at, '2026-10-03T14:22:29.000Z')
  assert.deepEqual(metadata.postSaleContext, { postSalesId: 37, stage: 'awaiting_rating' })
  assert.deepEqual(metadata.paymentReminderContext, { reminderId: 4334, customerId: 20, outboundMessageId: 17651 })
  assert.equal(metadata.humanActivityAt, undefined)
  assert.equal(metadata.handoffResolvedByOperator, undefined)
  assert.deepEqual((metadata.aiSessionMessages as Array<{ text: string }>).map((message) => message.text), [
    'Estou me adaptando bem', 'Sua parcela vence em breve.',
  ])
})

test('um pós-venda posterior mantém o contexto da cobrança com prazo próprio', () => {
  const state = buildAutomatedConversationState({
    rows: [{
      id: 3, remote_phone: '5511999999999', state: 'ai_session',
      expires_at: '2026-10-03T14:22:29.000Z', updated_at: sentAtIso,
      metadata: {
        paymentReminderContext: { reminderId: 4334, expiresAt: '2026-10-03T14:22:29.000Z' },
      },
    }],
    sentAtIso: '2026-10-01T15:00:00.000Z',
    retentionMs: 7 * 24 * 60 * 60 * 1000,
    messageText: 'Como está sua adaptação?',
    metadata: { postSaleContext: { postSalesId: 38, stage: 'awaiting_feedback' } },
  })
  const metadata = state.metadata as Record<string, unknown>
  assert.equal(state.expires_at, '2026-10-08T15:00:00.000Z')
  assert.deepEqual(metadata.paymentReminderContext, {
    reminderId: 4334, expiresAt: '2026-10-03T14:22:29.000Z',
  })
  assert.deepEqual(metadata.postSaleContext, { postSalesId: 38, stage: 'awaiting_feedback' })
})

test('uma mensagem humana mais recente não é substituída pelo registro atrasado do disparo', () => {
  assert.equal(hasNewerConversationState([{
    id: 4, remote_phone: '5511999999999', state: 'human_pause',
    expires_at: '2026-10-01T17:00:00.000Z', updated_at: '2026-10-01T14:23:00.000Z',
    metadata: { reason: 'store_initiated' },
  }], sentAtIso), true)
})

test('a gravação do disparo atualiza ambas as variantes do estado em vez de criar outra linha', async () => {
  const rows = [
    { id: 1, remote_phone: '551199999999', state: 'human_pause',
      updated_at: '2026-10-01T14:05:49.000Z', expires_at: '2026-10-01T16:05:49.000Z',
      metadata: { reason: 'store_initiated', humanActivityAt: '2026-10-01T14:05:49.000Z' } },
    { id: 2, remote_phone: '5511999999999', state: 'ai_session',
      updated_at: '2026-10-01T14:00:00.000Z', expires_at: '2026-10-03T14:00:00.000Z',
      metadata: { postSaleContext: { postSalesId: 37, stage: 'awaiting_rating' } } },
  ]
  let updatedIds: number[] = []
  let updatedState = ''
  let inserted = false
  let writing = false
  const client = {
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: (column: string, values: number[]) => {
          if (column === 'id') updatedIds = values
          return builder
        },
        lte: () => builder,
        update: (values: { state: string }) => {
          writing = true
          updatedState = values.state
          return builder
        },
        insert: () => {
          inserted = true
          return builder
        },
        then: (resolve: (result: unknown) => unknown, reject: (reason: unknown) => unknown) =>
          Promise.resolve(writing
            ? { data: [{ id: 1 }, { id: 2 }], error: null }
            : { data: rows, error: null }).then(resolve, reject),
      }
      return builder
    },
  }
  const recorded = await recordAutomatedOutboundConversationContext({
    tenantId: '00000000-0000-4000-8000-000000000001',
    storeId: 1, channelId: 1, remotePhone: '5511999999999', sentAtIso,
    retentionMs: 48 * 60 * 60 * 1000,
    messageText: 'Sua parcela vence em breve.',
    metadata: { reason: 'installment_due_reminder_sent', paymentReminderContext: { reminderId: 4334 } },
  }, client as any)
  assert.equal(recorded, true)
  assert.deepEqual(updatedIds, [1, 2])
  assert.equal(updatedState, 'ai_session')
  assert.equal(inserted, false)
})

test('agradecimento só se liga ao lembrete quando ele é a última interação relevante', () => {
  const direct = {
    message: 'obrigado', reminderOutboundId: 17651, latestOutboundId: 17651,
    latestOutboundType: 'installment_due_reminder', hasInterveningInbound: false,
  }
  assert.equal(shouldAcknowledgeLatestPaymentReminder(direct), true)
  assert.equal(shouldAcknowledgeLatestPaymentReminder({ ...direct, hasInterveningInbound: true }), false)
  assert.equal(shouldAcknowledgeLatestPaymentReminder({ ...direct, latestOutboundId: 17652 }), false)
  assert.equal(shouldAcknowledgeLatestPaymentReminder({ ...direct, message: 'E a OS 1041?' }), false)
})

test('o envio proativo confirmado libera o controle humano, mas a escolha Humano sempre prevalece', () => {
  const reminder = {
    role: 'assistant' as const,
    messageType: 'installment_due_reminder',
    humanControl: 'human_active',
    customerControlMode: 'auto',
  }
  assert.equal(shouldReleaseHumanPauseForAutomatedOutbound(reminder), true)
  assert.equal(shouldReleaseHumanPauseForAutomatedOutbound({ ...reminder, messageType: 'post_sale_followup' }), true)
  assert.equal(shouldReleaseHumanPauseForAutomatedOutbound({ ...reminder, role: 'human' }), false)
  assert.equal(shouldReleaseHumanPauseForAutomatedOutbound({ ...reminder, humanControl: 'human_pending' }), false)
  assert.equal(shouldReleaseHumanPauseForAutomatedOutbound({ ...reminder, customerControlMode: 'force_human' }), false)
})

test('a memória do redesign escolhe a conversa mais recente entre telefones equivalentes', async () => {
  const queries: Array<{ column: string; values: string[] }> = []
  const rows = [
    { id: 1, remote_phone: '551199999999', mode: 'shadow', updated_at: '2026-10-01T14:05:49.000Z' },
    { id: 2, remote_phone: '5511999999999', mode: 'shadow', updated_at: '2026-10-01T14:22:29.000Z' },
  ]
  const client = {
    from: () => {
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        in: (column: string, values: string[]) => {
          queries.push({ column, values })
          return Promise.resolve({ data: rows, error: null })
        },
      }
      return builder
    },
  }
  const store = new WhatsAppRedesignConversationStore(client as any)
  const conversation = await store.getOrCreateConversation({
    tenantId: '00000000-0000-4000-8000-000000000001',
    storeId: 1,
    channelId: 1,
    remotePhone: '551199999999',
    mode: 'shadow',
  })
  assert.equal(conversation.id, 2)
  assert.ok(queries[0].values.includes('5511999999999'))
})
