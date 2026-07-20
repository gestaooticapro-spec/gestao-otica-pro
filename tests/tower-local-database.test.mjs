import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import localDatabaseModule from '../electron/tower-local-database.cjs'

const { TowerLocalDatabase } = localDatabaseModule
const scope = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  storeId: 7,
  deviceId: '22222222-2222-4222-8222-222222222222',
}

async function withDatabase(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tower-sqlite-'))
  const database = new TowerLocalDatabase(path.join(directory, 'tower.sqlite3'))
  try {
    await run(database)
  } finally {
    database.close()
    await rm(directory, { recursive: true, force: true })
  }
}

async function withProtectedDatabase(run) {
  const directory = await mkdtemp(path.join(tmpdir(), 'tower-sqlite-protected-'))
  const database = new TowerLocalDatabase(path.join(directory, 'tower.sqlite3'), {
    protect: (payload) => ({ payload: Buffer.from(payload, 'utf8').toString('base64'), encoding: 'safe_storage_v1' }),
    unprotect: (payload, encoding) => encoding === 'safe_storage_v1'
      ? Buffer.from(payload, 'base64').toString('utf8')
      : payload,
  })
  try {
    await run(database)
  } finally {
    database.close()
    await rm(directory, { recursive: true, force: true })
  }
}

test('cria sessao local e evento de outbox na mesma operacao', async () => {
  await withDatabase((database) => {
    const session = database.createOrResumeSession(scope, { experience: 'medidas' })
    assert.equal(session.store_id, 7)
    assert.equal(session.status, 'active')
    assert.equal(session.current_experience, 'medidas')

    const events = database.getPendingEvents()
    assert.equal(events.length, 1)
    assert.equal(events[0].eventType, 'tower_session.upsert')
    assert.equal(events[0].entityId, session.id)
    assert.equal(events[0].payload.id, session.id)
  })
})

test('salva medidas offline com versao crescente e sincroniza recibos', async () => {
  await withDatabase((database) => {
    const session = database.createOrResumeSession(scope, { experience: 'medidas' })
    const measurement = {
      towerSessionId: session.id,
      lensMode: 'multifocal',
      referenceMm: 54,
      frontMeasurements: { dp: 62, dnpOD: 31, dnpOE: 31 },
      profileMeasurements: { vertexDistance: 12, pantoscopicAngle: 8 },
      attentionCodes: [],
      algorithmVersion: 'tower-measurement-v1',
    }
    const first = database.saveMeasurement(scope, measurement)
    const second = database.saveMeasurement(scope, measurement)
    assert.equal(first.version, 1)
    assert.equal(second.version, 2)

    const events = database.getPendingEvents()
    assert.equal(events.length, 3)
    database.markEventsSynced(events.map((event) => event.eventId))
    assert.deepEqual(database.getSyncStatus(), {
      pending: 0,
      synced: 3,
      lastSyncedAt: database.getSyncStatus().lastSyncedAt,
    })
    assert.ok(database.getSyncStatus().lastSyncedAt)
  })
})

test('importa por UUID uma sessao remota para a loja pareada', async () => {
  await withDatabase((database) => {
    const remoteSessionId = '33333333-3333-4333-8333-333333333333'
    const imported = database.createOrResumeSession(scope, {
      experience: 'visagismo',
      sessionId: remoteSessionId,
    })
    assert.equal(imported.id, remoteSessionId)
    assert.equal(imported.store_id, scope.storeId)
  })
})

test('conclui sessao local sem perder o evento de sincronizacao', async () => {
  await withDatabase((database) => {
    const session = database.createOrResumeSession(scope, { experience: 'campo_visual' })
    const completed = database.closeSession(scope, { sessionId: session.id, status: 'completed' })
    assert.equal(completed.status, 'completed')
    assert.ok(completed.completed_at)
    const events = database.getPendingEvents()
    assert.equal(events.length, 2)
    assert.equal(events[1].payload.status, 'completed')
  })
})

test('protege cliente provisório e aplica o ID remoto na sessao', async () => {
  await withProtectedDatabase((database) => {
    const session = database.createOrResumeSession(scope, { experience: 'campo_visual' })
    const encryptedCustomer = Buffer.from(JSON.stringify({ fullName: 'Cliente Offline', mobilePhone: '11999999999' })).toString('base64')
    const draft = database.createCustomerDraft(scope, {
      fullName: 'Cliente Offline',
      mobilePhone: '(11) 99999-9999',
    }, encryptedCustomer)
    database.linkCustomerDraftToSession(scope, {
      sessionId: session.id,
      localCustomerId: draft.localId,
    })

    const rawDraft = database.database.prepare(`
      SELECT encrypted_payload FROM tower_local_customer_drafts WHERE local_id = ?
    `).get(draft.localId)
    const rawCustomerEvent = database.database.prepare(`
      SELECT payload, payload_encoding FROM tower_outbox WHERE event_type = 'tower_customer.upsert'
    `).get()
    assert.doesNotMatch(rawDraft.encrypted_payload, /Cliente Offline/)
    assert.doesNotMatch(rawCustomerEvent.payload, /Cliente Offline/)
    assert.equal(rawCustomerEvent.payload_encoding, 'safe_storage_v1')
    assert.equal(database.getPendingEvents()[1].payload.fullName, 'Cliente Offline')

    database.applySyncResults([{ entityId: draft.localId, remoteCustomerId: 321 }])
    assert.equal(database.getCustomerDraft(scope, draft.localId).remoteCustomerId, 321)
    assert.equal(database.listActiveSessions(scope)[0].customer_id, 321)
  })
})
