import assert from 'node:assert/strict'
import test from 'node:test'
import { spawnSync } from 'node:child_process'
import type { WhatsAppAutomationSettings } from '../src/lib/store-modules'
import { defaultConversationSummary, WhatsAppRedesignClassificationSchema } from '../src/lib/whatsapp/redesign/contracts'
import { isWhatsAppFullRedesignEnabled, usesWhatsAppRedesignPolicies, canUseWhatsAppAiAttendance } from '../src/lib/whatsapp/redesign/rollout-policy'
import { isStoreOneSafeRepliesPilotEnabled, selectStoreOnePilotSafeReply } from '../src/lib/whatsapp/redesign/safe-replies-pilot'
import { planStoreOneOrderLookup } from '../src/lib/whatsapp/redesign/order-status-live'
import { clearWhatsAppRedesignModeCache, resolveCachedWhatsAppRedesignMode } from '../src/lib/whatsapp/redesign/shadow-ingestion'
import { processWhatsAppRedesignShadowTurns } from '../src/lib/whatsapp/redesign/shadow-processor'
import { resumeDeferredWhatsAppRedesignReplies } from '../src/lib/whatsapp/redesign/deferred-replies'
import { WhatsAppRedesignConversationStore } from '../src/lib/whatsapp/redesign/store'
import { shouldPersistCustomerLink } from '../src/lib/whatsapp/customer-link-policy'

const now = '2026-10-30T23:00:00.000Z'
const full: WhatsAppAutomationSettings = {
  enabled: true, ai_responder: { enabled: true, tools_enabled: false },
  ai_redesign: { mode: 'redesign', safe_replies_enabled: true },
}
const classification = (intent: string) => WhatsAppRedesignClassificationSchema.parse({
  intent, confidence: 0.99, topicRelation: 'change_topic', requestsHuman: false,
  mentionsAttachment: false, entities: { customerName: null, patientName: null, cpf: null, orderNumber: null },
})

test('redesign e padrao mesmo sem flags ou com flags antigas de legado, sombra e respostas desativadas', async () => {
  clearWhatsAppRedesignModeCache()
  const modes = new Map<number, 'legacy' | 'shadow' | 'redesign'>([[1, 'redesign'], [2, 'legacy'], [3, 'redesign'], [4, 'shadow']])
  const loaded: number[] = []
  const loader = async (id: number) => { loaded.push(id); return modes.get(id)! }
  for (const [id, mode] of modes) {
    assert.equal(await resolveCachedWhatsAppRedesignMode(id, loader, 1000), 'redesign')
    assert.equal(await resolveCachedWhatsAppRedesignMode(id, loader, 1001), 'redesign')
    const settings = { ai_redesign: { mode, safe_replies_enabled: true } }
    assert.equal(isWhatsAppFullRedesignEnabled(id, settings), true)
    assert.equal(isStoreOneSafeRepliesPilotEnabled(id, settings), true)
  }
  assert.deepEqual(loaded, [1, 2, 3, 4])
  for (const id of [1, 2, 3, 7]) {
    assert.equal(isWhatsAppFullRedesignEnabled(id, undefined), true)
    assert.equal(isWhatsAppFullRedesignEnabled(id, { ai_redesign: { mode: 'redesign', safe_replies_enabled: false } }), true)
    assert.equal(usesWhatsAppRedesignPolicies(id, undefined), true)
  }
  assert.equal(canUseWhatsAppAiAttendance(full), true)
  assert.equal(canUseWhatsAppAiAttendance({ ...full, enabled: false }), false)
  assert.equal(canUseWhatsAppAiAttendance({ ...full, ai_responder: { enabled: false } }), false)
  assert.equal(canUseWhatsAppAiAttendance(undefined), false)
  assert.equal(await resolveCachedWhatsAppRedesignMode(7), 'redesign')
  clearWhatsAppRedesignModeCache()
})

async function processForStore(storeId: number, intent: string, options: {
  human?: boolean; pix?: string | null; mode?: 'redesign' | 'shadow'; safe?: boolean; at?: string;
  savedMode?: 'legacy' | 'shadow' | 'redesign' | null;
} = {}) {
  const decisionAt = options.at ?? now
  const summary = { ...defaultConversationSummary(decisionAt), ...(options.human ? {
    humanControl: 'human_active' as const, humanActiveUntil: '2026-10-31T01:00:00.000Z',
    lastHumanActivityAt: now,
  } : {}) }
  const text = intent === 'payment_info' ? 'Qual a chave Pix da loja?' : intent === 'store_hours'
    ? 'Qual o horario de funcionamento?' : intent === 'order_status' ? 'Meu oculos ficou pronto?'
      : intent === 'store_location' ? 'Qual o endereco da loja?' : 'Quero um atendente'
  const message = { id: '00000000-0000-4000-8000-000000000101', providerMessageId: 'same-provider-id',
    role: 'customer', kind: 'text', text, occurredAt: decisionAt }
  let processing: any
  const mode = options.mode ?? 'redesign'
  const profile = { id: storeId, name: `Loja ${storeId}`, pix_key: options.pix ?? null,
    street: `Rua da loja ${storeId}`, number: String(storeId), city: 'Cidade', state: 'SP',
    settings: { whatsapp_automation: { ...full, ai_redesign: options.savedMode === null ? undefined
      : { mode: options.savedMode ?? mode, safe_replies_enabled: options.safe ?? true } },
      store_hours: { timezone: 'America/Sao_Paulo',
        weekly_schedule: Object.fromEntries(Array.from({ length: 7 }, (_, day) => [day, {
          is_open: true, open_time: storeId === 1 ? '08:00' : '10:00', close_time: storeId === 1 ? '17:00' : '19:00',
        }])), break_windows: [], special_closures: [], special_openings: [] } } }
  const store = {
    claimReadyTurn: async () => true,
    loadTurnContext: async () => ({
      conversation: { store_id: storeId, channel_id: storeId, mode },
      turn: { id: 'turn', closes_at: decisionAt, metadata: {} },
      memory: { summary, messages: [message] }, turnMessages: [message],
    }),
    loadStore: async (id: number) => { assert.equal(id, storeId); return profile },
    finishTurn: async (input: any) => { processing = input.metadata.shadowProcessing },
  } as unknown as WhatsAppRedesignConversationStore
  const result = await processWhatsAppRedesignShadowTurns({
    store, storeId, turnId: 'turn', now: new Date(decisionAt),
    classifier: async (input) => {
      assert.equal(input.storeId, storeId)
      return { success: true, data: classification(intent === 'payment_info' ? 'unknown' : intent), provider: 'openai', model: 'test', keyIndex: 0,
        attempts: 1, rawText: '{}', latencyMs: 0, promptText: '' }
    },
  })
  assert.equal(result.failed, 0, processing?.error)
  assert.equal(result.processed, 1)
  assert.equal(result.sendsMessage, false)
  assert.equal(processing.sendsMessage, false)
  return { processing, profile }
}

test('decisoes usam endereco, agenda e Pix oficiais da propria loja; ausencia de Pix nao herda outra chave', async () => {
  for (const id of [1, 3]) {
    const location = await processForStore(id, 'store_location')
    assert.match(location.processing.decision.fallbackReply, new RegExp(`Rua da loja ${id}`))
    assert.doesNotMatch(location.processing.decision.fallbackReply, new RegExp(`Rua da loja ${id === 1 ? 3 : 1}`))
    const hours = await processForStore(id, 'store_hours')
    assert.match(hours.processing.decision.facts.fullWeeklySchedule, id === 1 ? /08:00.*17:00/ : /10:00.*19:00/)
    const { processing, profile } = await processForStore(id, 'payment_info', { pix: id === 1 ? 'pix-loja-1' : null })
    const reply = selectStoreOnePilotSafeReply({ classification: processing.classification,
      decision: processing.decision, turnMessages: [{ kind: 'text', text: 'Qual a chave Pix da loja?' }],
      officialPixKey: profile.pix_key, officialPixHolder: profile.name, fullRouting: true })
    assert.equal(processing.decision.action === 'answer_official_pix', id === 1)
    if (id === 1) assert.equal(reply?.replyInput.facts.officialPixKey, 'pix-loja-1')
    else assert.notEqual(reply?.action, 'answer_official_pix')
  }
})

test('modo completo em outras lojas preserva pausa humana, encaminhamento e consulta desativada', async () => {
  for (const id of [1, 3]) {
    const blocked = await processForStore(id, 'order_status', { human: true })
    assert.equal(blocked.processing.decision.action, 'no_reply')
    const human = await processForStore(id, 'human_agent_request')
    assert.equal(human.processing.decision.action, 'human_handoff')
    assert.equal(human.processing.decision.humanHandoffTiming.mode, 'when_store_opens')
    const order = await processForStore(id, 'order_status')
    const input = { storeId: id, fullRouting: true, classification: order.processing.classification,
      decision: order.processing.decision, messageText: 'Meu oculos ficou pronto?', awaitingIdentifier: false }
    assert.ok(planStoreOneOrderLookup({ ...input, enabled: true }))
    assert.equal(planStoreOneOrderLookup({ ...input, enabled: false }), null)
    assert.equal(shouldPersistCustomerLink(id, 'identifier_lookup', false, true), false)
    assert.equal(shouldPersistCustomerLink(id, 'phone_match', true, true), true)
  }
})

test('o mesmo instante respeita expedientes diferentes; flag antiga de sombra nao troca o motor padrao', async () => {
  const first = await processForStore(1, 'human_agent_request', { at: '2026-10-30T21:00:00.000Z' })
  const other = await processForStore(3, 'human_agent_request', { at: '2026-10-30T21:00:00.000Z' })
  assert.equal(first.processing.decision.humanHandoffTiming.mode, 'when_store_opens')
  assert.equal(other.processing.decision.humanHandoffTiming.mode, 'during_open_hours')
  const shadow = await processForStore(3, 'store_location', { mode: 'shadow', safe: true })
  assert.equal(shadow.processing.decision.action, 'answer_store_location')
  assert.equal(isStoreOneSafeRepliesPilotEnabled(3, shadow.profile.settings.whatsapp_automation), true)
})

test('processamento ao vivo nao exige adesao mesmo com configuracao antiga ausente, legada ou sombra desativada', async () => {
  for (const savedMode of [null, 'legacy', 'shadow'] as const) {
    const { processing } = await processForStore(3, 'order_status', { savedMode, safe: false })
    assert.equal(processing.decision.action, 'lookup_order_status')
  }
})

test('comandos de adesao e reversao por loja sao recusados antes de qualquer conexao', () => {
  for (const command of ['activate', 'rollback']) {
    const result = spawnSync(process.execPath, ['scripts/manage-whatsapp-full-redesign.mjs', command, '3'], {
      encoding: 'utf8', env: { ...process.env, SUPABASE_DB_URL: '' },
    })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /O redesign e o padrao/)
    assert.doesNotMatch(result.stderr, /Database access is unavailable/)
  }
})

type Row = Record<string, any>
function deferredFixture() {
  const marker = () => ({ turnId: 'turn', attempts: 0,
    queuedAt: new Date(Date.now() - 1000).toISOString(), nextAttemptAt: '2020-01-01', leaseUntil: '2020-01-01' })
  const configurations = [{ ...full, ai_redesign: undefined }, { ...full, enabled: false },
    { ...full, ai_redesign: { mode: 'legacy', safe_replies_enabled: false } },
    { ...full, ai_responder: { enabled: false } },
    { ...full, enabled: false, ai_redesign: { mode: 'shadow' } },
    { ...full, ai_responder: { enabled: false }, ai_redesign: { mode: 'redesign', safe_replies_enabled: false } }, {}]
  const tables: Record<string, Row[]> = {
    stores: configurations.map((settings, i) => ({ id: i + 1, tenant_id: `tenant-${i + 1}`, settings: { whatsapp_automation: settings } })),
    whatsapp_store_channels: configurations.map((_, i) => ({ id: i + 10, store_id: i + 1,
      tenant_id: `tenant-${i + 1}`, instance_key: `channel-${i + 1}`, is_active: true })),
    whatsapp_inbound_messages: configurations.map((_, i) => ({ id: i + 100, store_id: i + 1,
      tenant_id: `tenant-${i + 1}`, channel_id: i + 10, remote_phone: '5567991234567',
      provider_message_id: 'same-provider-id', message_text: 'Ola', status: 'received', payload: { redesignDeferred: marker() } })),
  }
  const db = { from(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let update: Row | undefined, single = false, limit = Infinity
    const query: any = {
      select() { return query }, order() { return query },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query },
      gt(key: string, value: number) { filters.push(row => row[key] > value); return query },
      lte(key: string, value: string) {
        filters.push(row => key.split(/->>?/u).reduce<any>((v, part) => v?.[part], row) <= value); return query
      },
      contains(_key: string, value: Row) {
        filters.push(row => JSON.stringify(row.payload.redesignDeferred) === JSON.stringify(value.redesignDeferred)); return query
      },
      update(value: Row) { update = value; return query },
      limit(value: number) { limit = value; return query },
      maybeSingle() { single = true; return query },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        const rows = tables[table].filter(row => filters.every(filter => filter(row))).slice(0, limit)
        const snapshot = rows.map(row => ({ ...row }))
        if (update) rows.forEach(row => Object.assign(row, update))
        return Promise.resolve({ data: single ? snapshot[0] ?? null : snapshot, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  return { db, tables }
}

test('recuperacao global e por loja isola mesmo telefone/id do provedor, exclui lojas desativadas e respeita lease concorrente', async () => {
  const { db, tables } = deferredFixture()
  const calls: any[] = []
  const resolve = async (input: any, options: any) => {
    calls.push({ input, options }); return { shouldReply: false }
  }
  const results = await Promise.all([
    resumeDeferredWhatsAppRedesignReplies(resolve, 2, undefined, db),
    resumeDeferredWhatsAppRedesignReplies(resolve, 2, undefined, db),
  ])
  assert.equal(results.reduce((n, result) => n + result.resumed, 0), 2)
  assert.deepEqual(calls.map(call => call.input.instanceKey).sort(), ['channel-1', 'channel-3'])
  assert.deepEqual(calls.map(call => call.options.deferredInboundId).sort(), [100, 102])
  assert.ok(tables.whatsapp_inbound_messages.filter(row => ![1, 3].includes(row.store_id))
    .every(row => row.payload.redesignDeferred.attempts === 0))
  const scoped = deferredFixture()
  calls.length = 0
  await resumeDeferredWhatsAppRedesignReplies(resolve, 2, 3, scoped.db)
  assert.deepEqual(calls.map(call => call.input.instanceKey), ['channel-3'])
})

test('recuperacao recusa canal que nao pertence a loja/tenant da entrada', async () => {
  const { db, tables } = deferredFixture()
  tables.whatsapp_store_channels.find(row => row.store_id === 3)!.tenant_id = 'tenant-1'
  let called = false
  const result = await resumeDeferredWhatsAppRedesignReplies(async () => {
    called = true; return { shouldReply: false }
  }, 1, 3, db)
  assert.equal(called, false)
  assert.deepEqual(result, { resumed: 0, skipped: 1 })
})

test('recuperacao de outra loja suprime entradas vencidas ou substituidas e preserva tentativa incerta', async () => {
  for (const reason of ['expired', 'superseded', 'failed'] as const) {
    const { db, tables } = deferredFixture()
    const inbound = tables.whatsapp_inbound_messages.find(row => row.store_id === 3)!
    if (reason === 'expired') inbound.payload.redesignDeferred.queuedAt = '2020-01-01'
    if (reason === 'superseded') tables.whatsapp_inbound_messages.push({
      ...inbound, id: 1000, payload: {}, status: 'processed',
    })
    let calls = 0
    const resolve = async () => { calls++; throw new Error('simulated_resolver_failure') }
    const result = await resumeDeferredWhatsAppRedesignReplies(resolve, 1, 3, db)
    assert.deepEqual(result, { resumed: 0, skipped: 1 })
    assert.equal(calls, reason === 'failed' ? 1 : 0)
    assert.equal(inbound.status, reason === 'failed' ? 'received' : 'ignored')
    if (reason === 'failed') {
      assert.ok(Date.parse(inbound.payload.redesignDeferred.leaseUntil) > Date.now())
      await resumeDeferredWhatsAppRedesignReplies(resolve, 1, 3, db)
      assert.equal(calls, 1)
    }
  }
})

test('memoria, fila pronta e recuperacao de turno nao atravessam lojas com mesmo telefone e ID do provedor', async () => {
  const phone = '5567991234567'
  const tables: Record<string, Row[]> = {
    whatsapp_conversation_memory: [1, 3, 4, 5].map(id => ({
      id, store_id: id, channel_id: id * 10, tenant_id: `tenant-${id}`, remote_phone: phone,
      mode: id === 4 ? 'legacy' : id === 5 ? 'shadow' : 'redesign', created_at: now, updated_at: now,
      summary: { ...defaultConversationSummary(now), subject: `assunto-loja-${id}` },
    })),
    whatsapp_conversation_messages: [1, 3].map(id => ({
      id: `00000000-0000-4000-8000-00000000000${id}`, conversation_id: id,
      provider_message_id: 'same-provider-id', role: 'customer', message_kind: 'text',
      message_text: `texto somente da loja ${id}`, occurred_at: now,
    })),
    whatsapp_conversation_turns: [1, 3, 4, 5].map(id => ({
      id: `turn-${id}`, conversation_id: id, status: 'ready', closes_at: now, updated_at: '2020-01-01',
    })),
  }
  const client: any = { from(table: string) {
    const filters: Array<(row: Row) => boolean> = []
    let update: Row | undefined
    const query: any = {
      select() { return query }, order() { return query }, limit() { return query },
      eq(key: string, value: unknown) { filters.push(row => row[key] === value); return query },
      in(key: string, values: unknown[]) { filters.push(row => values.includes(row[key])); return query },
      lte(key: string, value: string) { filters.push(row => row[key] <= value); return query },
      update(value: Row) { update = value; return query },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        const rows = tables[table].filter(row => filters.every(filter => filter(row)))
        if (update) rows.forEach(row => Object.assign(row, update))
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  const store = new WhatsAppRedesignConversationStore(client)
  for (const id of [1, 3]) {
    const memory = await store.loadMemory({ tenantId: `00000000-0000-4000-8000-00000000000${id}`,
      storeId: id, channelId: id * 10, remotePhone: phone, mode: 'redesign' })
    assert.equal(memory.summary.subject, `assunto-loja-${id}`)
    assert.deepEqual(memory.messages.map(message => message.text), [`texto somente da loja ${id}`])
    assert.deepEqual(await store.listReadyTurnIds(10, now, id), [`turn-${id}`])
  }
  assert.deepEqual(await store.listReadyTurnIds(10, now), ['turn-1', 'turn-3', 'turn-5'])
  tables.whatsapp_conversation_turns.forEach(row => { row.status = 'processing' })
  assert.equal(await store.recoverStaleProcessingTurns(now, 3), 1)
  assert.deepEqual(tables.whatsapp_conversation_turns.map(row => row.status), ['processing', 'ready', 'processing', 'processing'])
  assert.equal(await store.recoverStaleProcessingTurns(now), 2)
  assert.equal(tables.whatsapp_conversation_turns.find(row => row.conversation_id === 4)!.status, 'processing')
})
