import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanupWhatsAppRetention, previewWhatsAppRetention } from '../src/lib/whatsapp/retention'
import { hasProtectedRedesignHumanControl, retentionPhoneVariants } from '../src/lib/whatsapp/retention-policy'

type Row = Record<string, any>
const old = new Date(Date.now() - 100 * 86400000).toISOString()
const recent = new Date().toISOString()

function fixture(tables: Record<string, Row[]>, options: { failProtection?: boolean; beforeDelete?: () => void; beforeProtectionRead?: () => void } = {}) {
  const deletions: string[] = []
  const admin = { from(table: string) {
    let deleting = false
    let countOnly = false
    let start = 0
    let end = Infinity
    const filters: Array<(row: Row) => boolean> = []
    const query: any = {
      select(_fields: string, config?: { head: boolean }) { countOnly = config?.head === true; return query },
      delete() { deleting = true; options.beforeDelete?.(); return query },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query },
      lt(key: string, value: string) { filters.push((row) => typeof row[key] === 'string' && row[key] < value); return query },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query },
      not(key: string, _operator: string, value: string) {
        const values = JSON.parse(`[${value.slice(1, -1)}]`)
        filters.push((row) => !values.includes(row[key])); return query
      },
      or() { filters.push((row) => hasProtectedRedesignHumanControl(row.summary || {})); return query },
      order() { return query },
      range(from: number, to: number) { start = from; end = to + 1; return query },
      limit(limit: number) { end = limit; return query },
      then(resolve: (value: unknown) => void, reject: (reason: unknown) => void) {
        if (table === 'whatsapp_customer_control') options.beforeProtectionRead?.()
        if (options.failProtection && table === 'whatsapp_conversation_memory') {
          return Promise.resolve({ error: new Error('Protection unavailable') }).then(resolve, reject)
        }
        const eligible = (tables[table] || []).filter((row) => filters.every((filter) => filter(row)))
        const rows = eligible.slice(start, end)
        if (deleting) {
          deletions.push(table)
          tables[table] = (tables[table] || []).filter((row) => !rows.includes(row))
        }
        return Promise.resolve({ data: countOnly ? null : rows, count: rows.length, error: null }).then(resolve, reject)
      },
    }
    return query
  } }
  return { admin: admin as any, deletions }
}

test('phone protection includes international/local formats and ninth digit variants', () => {
  const variants = retentionPhoneVariants(['5567991234567', '595981234567'])
  for (const phone of ['5567991234567', '556791234567', '67991234567', '6791234567', '595981234567', '981234567']) {
    assert.ok(variants.includes(phone), phone)
  }
})

test('cleanup respects age, store, pending deliveries and both human control models', async () => {
  const tables = {
    whatsapp_customer_control: [{ id: 1, store_id: 1, mode: 'force_human', remote_phone: '5567991234567' }],
    whatsapp_conversation_memory: [{ id: 1, store_id: 1, remote_phone: '5567992345678', summary: { humanControl: 'human_pending' } }],
    whatsapp_ai_logs: [{ id: 1, store_id: 1, created_at: old }, { id: 2, store_id: 2, created_at: old }],
    whatsapp_conversation_states: [{ id: 1, store_id: 1, remote_phone: '5567999999999', state: 'idle', updated_at: old, expires_at: old }],
    whatsapp_inbound_messages: [
      { id: 1, store_id: 1, remote_phone: '5567999999999', status: 'processed', created_at: old },
      { id: 2, store_id: 1, remote_phone: '6791234567', status: 'processed', created_at: old },
      { id: 3, store_id: 1, remote_phone: '5567992345678', status: 'ignored', created_at: old },
      { id: 4, store_id: 1, remote_phone: '5567993456789', status: 'received', created_at: old },
      { id: 5, store_id: 1, remote_phone: '5567994567890', status: 'processed', created_at: old },
      { id: 6, store_id: 1, remote_phone: '5567999999999', status: 'processed', created_at: recent },
      { id: 7, store_id: 2, remote_phone: '5567999999999', status: 'processed', created_at: old },
    ],
    whatsapp_outbound_messages: [
      { id: 1, store_id: 1, remote_phone: '5567999999999', status: 'sent', created_at: old },
      { id: 2, store_id: 1, remote_phone: '5567994567890', status: 'failed', created_at: old },
    ],
  }
  const { admin } = fixture(tables)
  const preview = await previewWhatsAppRetention(admin, 1)
  assert.equal(preview.protectedThreads.totalUnique, 2)
  assert.equal(preview.candidates.total, 4)
  assert.deepEqual(await cleanupWhatsAppRetention(admin, 1), {
    aiLogs: 1, expiredStates: 1, inboundMessages: 1, outboundMessages: 1, total: 4,
  })
  assert.equal(tables.whatsapp_inbound_messages.length, 6)
  assert.equal(tables.whatsapp_conversation_memory.length, 1)
  assert.equal((await cleanupWhatsAppRetention(admin, 1)).total, 0)
})

test('messages older than 15 days are removed while newer messages and 20-day AI logs remain', async () => {
  const daysAgo = (days: number) => new Date(Date.now() - days * 86400000).toISOString()
  const tables = {
    whatsapp_inbound_messages: [
      { id: 1, store_id: 1, remote_phone: '5567999999999', status: 'processed', created_at: daysAgo(16) },
      { id: 2, store_id: 1, remote_phone: '5567999999999', status: 'ignored', created_at: daysAgo(14) },
    ],
    whatsapp_outbound_messages: [
      { id: 1, store_id: 1, remote_phone: '5567999999999', status: 'sent', created_at: daysAgo(16) },
      { id: 2, store_id: 1, remote_phone: '5567999999999', status: 'cancelled', created_at: daysAgo(14) },
    ],
    whatsapp_ai_logs: [{ id: 1, store_id: 1, created_at: daysAgo(20) }],
  }
  const { admin } = fixture(tables)
  const preview = await previewWhatsAppRetention(admin, 1)
  assert.equal(preview.policy.messagesDays, 15)
  assert.equal(preview.candidates.total, 2)
  assert.deepEqual(await cleanupWhatsAppRetention(admin, 1), {
    aiLogs: 0, expiredStates: 0, inboundMessages: 1, outboundMessages: 1, total: 2,
  })
  assert.deepEqual(tables.whatsapp_inbound_messages.map((row) => row.id), [2])
  assert.deepEqual(tables.whatsapp_outbound_messages.map((row) => row.id), [2])
  assert.equal(tables.whatsapp_ai_logs.length, 1)
})

test('protection is paginated and a batch removes at most 250 records per type', async () => {
  const controls = Array.from({ length: 501 }, (_, id) => ({ id, store_id: 1, mode: 'force_human', remote_phone: `556799${String(id).padStart(7, '0')}` }))
  const tables = {
    whatsapp_customer_control: controls,
    whatsapp_inbound_messages: [{ id: 1, store_id: 1, remote_phone: controls[500].remote_phone, status: 'processed', created_at: old }],
    whatsapp_ai_logs: Array.from({ length: 300 }, (_, id) => ({ id, store_id: 1, created_at: old })),
  }
  const { admin } = fixture(tables)
  assert.equal((await previewWhatsAppRetention(admin, 1)).protectedThreads.forceHuman, 501)
  const deleted = await cleanupWhatsAppRetention(admin, 1)
  assert.equal(deleted.aiLogs, 250)
  assert.equal(deleted.inboundMessages, 0)
  assert.equal(tables.whatsapp_ai_logs.length, 50)
})

test('cleanup fails closed when it cannot read human protections', async () => {
  const { admin, deletions } = fixture({}, { failProtection: true })
  await assert.rejects(cleanupWhatsAppRetention(admin, 1), /Protection unavailable/)
  assert.deepEqual(deletions, [])
})

test('human control assumed between selection and deletion preserves the selected message', async () => {
  const tables: Record<string, Row[]> = {
    whatsapp_customer_control: [],
    whatsapp_inbound_messages: [{ id: 1, store_id: 1, remote_phone: '5567991234567', status: 'processed', created_at: old }],
  }
  let reads = 0
  const { admin } = fixture(tables, { beforeProtectionRead() {
    if (++reads === 2) tables.whatsapp_customer_control.push({ id: 1, store_id: 1, mode: 'force_human', remote_phone: '5567991234567' })
  } })
  assert.equal((await cleanupWhatsAppRetention(admin, 1)).inboundMessages, 0)
  assert.equal(tables.whatsapp_inbound_messages.length, 1)
})

test('delivery status is checked again at deletion time', async () => {
  const tables = {
    whatsapp_outbound_messages: [{ id: 1, store_id: 1, remote_phone: '5567991234567', status: 'sent', created_at: old }],
  }
  const { admin } = fixture(tables, { beforeDelete() { tables.whatsapp_outbound_messages[0].status = 'pending' } })
  assert.equal((await cleanupWhatsAppRetention(admin, 1)).outboundMessages, 0)
  assert.equal(tables.whatsapp_outbound_messages.length, 1)
})
