'use strict'

const { randomUUID, createHash } = require('crypto')
const { DatabaseSync } = require('node:sqlite')

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const EXPERIENCES = new Set(['look', 'visagismo', 'campo_visual', 'medidas', 'thickness'])
const LENS_MODES = new Set(['multifocal', 'bifocal'])

function isoNow() {
  return new Date().toISOString()
}

function parseJson(value, fallback = null) {
  if (typeof value !== 'string') return fallback
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function hasColumn(database, tableName, columnName) {
  return database.prepare(`PRAGMA table_info(${tableName})`).all()
    .some((column) => column.name === columnName)
}

function assertScope(scope) {
  if (!scope || !UUID_PATTERN.test(scope.tenantId || '')
      || !UUID_PATTERN.test(scope.deviceId || '')
      || !UUID_PATTERN.test(scope.assetId || '')
      || !Number.isSafeInteger(scope.storeId) || scope.storeId <= 0) {
    throw new Error('Contexto local da Torre invalido.')
  }
}

function serializeSession(row) {
  if (!row) return null
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    store_id: row.store_id,
    customer_id: row.customer_id,
    local_customer_id: row.local_customer_id,
    optical_evaluation_id: row.optical_evaluation_id,
    created_by_user_id: null,
    status: row.status,
    current_experience: row.current_experience,
    prescription_snapshot: parseJson(row.prescription_snapshot),
    started_at: row.started_at,
    completed_at: row.completed_at,
    discarded_at: row.discarded_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    local_sync_status: row.sync_status,
  }
}

class TowerLocalDatabase {
  constructor(databasePath, payloadProtection = {}) {
    this.protectPayload = payloadProtection.protect || ((payload) => ({ payload, encoding: 'json' }))
    this.unprotectPayload = payloadProtection.unprotect || ((payload) => payload)
    this.database = new DatabaseSync(databasePath)
    this.database.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;

      CREATE TABLE IF NOT EXISTS tower_local_schema (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tower_local_sessions (
        id TEXT PRIMARY KEY CHECK(length(id) = 36),
        tenant_id TEXT NOT NULL CHECK(length(tenant_id) = 36),
        store_id INTEGER NOT NULL CHECK(store_id > 0),
        source_device_id TEXT NOT NULL CHECK(length(source_device_id) = 36),
        customer_id INTEGER,
        optical_evaluation_id INTEGER,
        status TEXT NOT NULL CHECK(status IN ('active', 'completed', 'discarded', 'expired')),
        current_experience TEXT CHECK(current_experience IS NULL OR current_experience IN ('look', 'visagismo', 'campo_visual', 'medidas', 'thickness')),
        prescription_snapshot TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        discarded_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed'))
      );

      CREATE INDEX IF NOT EXISTS idx_tower_local_sessions_active
        ON tower_local_sessions(store_id, status, started_at DESC);

      CREATE TABLE IF NOT EXISTS tower_local_customers (
        local_id TEXT PRIMARY KEY CHECK(length(local_id) = 36),
        tenant_id TEXT NOT NULL CHECK(length(tenant_id) = 36),
        store_id INTEGER NOT NULL CHECK(store_id > 0),
        remote_customer_id INTEGER,
        full_name TEXT NOT NULL,
        mobile_phone TEXT,
        payload TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed'))
      );

      CREATE TABLE IF NOT EXISTS tower_local_customer_drafts (
        local_id TEXT PRIMARY KEY CHECK(length(local_id) = 36),
        tenant_id TEXT NOT NULL CHECK(length(tenant_id) = 36),
        store_id INTEGER NOT NULL CHECK(store_id > 0),
        source_device_id TEXT NOT NULL CHECK(length(source_device_id) = 36),
        remote_customer_id INTEGER,
        encrypted_payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed'))
      );

      CREATE TABLE IF NOT EXISTS tower_local_measurement_results (
        id TEXT PRIMARY KEY CHECK(length(id) = 36),
        tenant_id TEXT NOT NULL CHECK(length(tenant_id) = 36),
        store_id INTEGER NOT NULL CHECK(store_id > 0),
        tower_session_id TEXT NOT NULL REFERENCES tower_local_sessions(id) ON DELETE CASCADE,
        version INTEGER NOT NULL CHECK(version > 0),
        lens_mode TEXT NOT NULL CHECK(lens_mode IN ('multifocal', 'bifocal')),
        reference_mm REAL NOT NULL CHECK(reference_mm > 0),
        front_measurements TEXT NOT NULL,
        profile_measurements TEXT NOT NULL,
        attention_codes TEXT NOT NULL DEFAULT '[]',
        algorithm_version TEXT NOT NULL,
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed')),
        UNIQUE(tower_session_id, version)
      );

      CREATE TABLE IF NOT EXISTS tower_outbox (
        event_id TEXT PRIMARY KEY CHECK(length(event_id) = 36),
        event_type TEXT NOT NULL,
        entity_id TEXT NOT NULL CHECK(length(entity_id) = 36),
        payload TEXT NOT NULL,
        payload_encoding TEXT NOT NULL DEFAULT 'json',
        payload_hash TEXT NOT NULL CHECK(length(payload_hash) = 64),
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'syncing', 'synced', 'failed')),
        attempt_count INTEGER NOT NULL DEFAULT 0 CHECK(attempt_count >= 0),
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        synced_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tower_outbox_pending
        ON tower_outbox(status, next_attempt_at, created_at);

      CREATE TABLE IF NOT EXISTS tower_local_hardware_validations (
        id TEXT PRIMARY KEY CHECK(length(id) = 36),
        tenant_id TEXT NOT NULL CHECK(length(tenant_id) = 36),
        store_id INTEGER NOT NULL CHECK(store_id > 0),
        source_device_id TEXT NOT NULL CHECK(length(source_device_id) = 36),
        tower_asset_id TEXT NOT NULL CHECK(length(tower_asset_id) = 36),
        hardware_fingerprint TEXT NOT NULL CHECK(length(hardware_fingerprint) = 64),
        hardware_snapshot TEXT NOT NULL,
        camera_approved_at TEXT,
        touch_approved_at TEXT,
        display_approved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK(sync_status IN ('pending', 'synced', 'failed')),
        UNIQUE(tower_asset_id, hardware_fingerprint)
      );

      CREATE INDEX IF NOT EXISTS idx_tower_local_hardware_validations_asset
        ON tower_local_hardware_validations(tower_asset_id, updated_at DESC);

      CREATE TABLE IF NOT EXISTS tower_local_configuration_snapshots (
        store_id INTEGER PRIMARY KEY CHECK(store_id > 0),
        tenant_id TEXT NOT NULL CHECK(length(tenant_id) = 36),
        source_device_id TEXT NOT NULL CHECK(length(source_device_id) = 36),
        schema_version INTEGER NOT NULL CHECK(schema_version > 0),
        revision TEXT NOT NULL CHECK(length(revision) = 64),
        payload TEXT NOT NULL,
        payload_encoding TEXT NOT NULL DEFAULT 'json',
        server_generated_at TEXT NOT NULL,
        downloaded_at TEXT NOT NULL
      );
    `)
    if (!hasColumn(this.database, 'tower_local_sessions', 'local_customer_id')) {
      this.database.exec('ALTER TABLE tower_local_sessions ADD COLUMN local_customer_id TEXT')
    }
    if (!hasColumn(this.database, 'tower_outbox', 'payload_encoding')) {
      this.database.exec("ALTER TABLE tower_outbox ADD COLUMN payload_encoding TEXT NOT NULL DEFAULT 'json'")
    }
    this.database.prepare('INSERT OR IGNORE INTO tower_local_schema(version, applied_at) VALUES (?, ?)').run(1, isoNow())
    this.database.prepare('INSERT OR IGNORE INTO tower_local_schema(version, applied_at) VALUES (?, ?)').run(2, isoNow())
    this.database.prepare('INSERT OR IGNORE INTO tower_local_schema(version, applied_at) VALUES (?, ?)').run(3, isoNow())
    this.database.prepare('INSERT OR IGNORE INTO tower_local_schema(version, applied_at) VALUES (?, ?)').run(4, isoNow())
  }

  close() {
    this.database.close()
  }

  transaction(work) {
    this.database.exec('BEGIN IMMEDIATE')
    try {
      const result = work()
      this.database.exec('COMMIT')
      return result
    } catch (error) {
      this.database.exec('ROLLBACK')
      throw error
    }
  }

  enqueue(eventType, entityId, payload, now) {
    const payloadText = JSON.stringify(payload)
    const payloadHash = createHash('sha256').update(payloadText, 'utf8').digest('hex')
    const protectedPayload = this.protectPayload(payloadText)
    if (!protectedPayload || typeof protectedPayload.payload !== 'string'
        || !['json', 'safe_storage_v1'].includes(protectedPayload.encoding)) {
      throw new Error('Protecao da fila local indisponivel.')
    }
    const eventId = randomUUID()
    this.database.prepare(`
      INSERT INTO tower_outbox(
        event_id, event_type, entity_id, payload, payload_encoding, payload_hash,
        status, attempt_count, next_attempt_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?)
    `).run(
      eventId, eventType, entityId, protectedPayload.payload,
      protectedPayload.encoding, payloadHash, now, now, now,
    )
    return eventId
  }

  createOrResumeSession(scope, input) {
    assertScope(scope)
    const experience = input?.experience
    if (!EXPERIENCES.has(experience)) throw new Error('Experiencia da Torre invalida.')
    if (input?.sessionId && !UUID_PATTERN.test(input.sessionId)) throw new Error('Sessao da Torre invalida.')

    return this.transaction(() => {
      const now = isoNow()
      const sessionId = input?.sessionId || randomUUID()
      const existing = this.database.prepare(`
        SELECT * FROM tower_local_sessions
        WHERE id = ? AND tenant_id = ? AND store_id = ?
      `).get(sessionId, scope.tenantId, scope.storeId)

      if (input?.sessionId && existing && existing.status !== 'active') {
        throw new Error('Sessao local da Torre nao esta ativa.')
      }

      if (existing) {
        this.database.prepare(`
          UPDATE tower_local_sessions
          SET current_experience = ?, updated_at = ?, sync_status = 'pending'
          WHERE id = ?
        `).run(experience, now, sessionId)
      } else {
        this.database.prepare(`
          INSERT INTO tower_local_sessions(
            id, tenant_id, store_id, source_device_id, status,
            current_experience, started_at, created_at, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 'pending')
        `).run(sessionId, scope.tenantId, scope.storeId, scope.deviceId, experience, now, now, now)
      }

      const row = this.database.prepare('SELECT * FROM tower_local_sessions WHERE id = ?').get(sessionId)
      this.enqueue('tower_session.upsert', sessionId, {
        id: sessionId,
        status: row.status,
        currentExperience: row.current_experience,
        customerId: row.customer_id,
        localCustomerId: row.local_customer_id,
        opticalEvaluationId: row.optical_evaluation_id,
        prescriptionSnapshot: parseJson(row.prescription_snapshot),
        startedAt: row.started_at,
        completedAt: row.completed_at,
        discardedAt: row.discarded_at,
        clientUpdatedAt: row.updated_at,
      }, now)
      return serializeSession(row)
    })
  }

  listActiveSessions(scope) {
    assertScope(scope)
    return this.database.prepare(`
      SELECT * FROM tower_local_sessions
      WHERE tenant_id = ? AND store_id = ? AND status = 'active'
      ORDER BY started_at DESC
    `).all(scope.tenantId, scope.storeId).map(serializeSession)
  }

  createCustomerDraft(scope, input, encryptedPayload) {
    assertScope(scope)
    const fullName = typeof input?.fullName === 'string' ? input.fullName.trim() : ''
    const mobilePhone = typeof input?.mobilePhone === 'string'
      ? input.mobilePhone.replace(/\D/g, '')
      : ''
    if (fullName.length < 3 || fullName.length > 160
        || mobilePhone.length < 8 || mobilePhone.length > 20
        || typeof encryptedPayload !== 'string' || encryptedPayload.length < 16) {
      throw new Error('Dados do cliente provisório invalidos.')
    }

    return this.transaction(() => {
      const localId = randomUUID()
      const now = isoNow()
      const payload = {
        id: localId,
        fullName,
        mobilePhone,
        createdAt: now,
      }
      this.database.prepare(`
        INSERT INTO tower_local_customer_drafts(
          local_id, tenant_id, store_id, source_device_id, encrypted_payload,
          created_at, updated_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        localId, scope.tenantId, scope.storeId, scope.deviceId,
        encryptedPayload, now, now,
      )
      this.enqueue('tower_customer.upsert', localId, payload, now)
      return {
        localId,
        remoteCustomerId: null,
        fullName,
        mobilePhone,
        syncStatus: 'pending',
      }
    })
  }

  getCustomerDraft(scope, localId) {
    assertScope(scope)
    if (!UUID_PATTERN.test(localId || '')) throw new Error('Cliente provisório invalido.')
    const row = this.database.prepare(`
      SELECT draft.local_id, draft.remote_customer_id, draft.sync_status,
        (SELECT outbox.last_error FROM tower_outbox AS outbox
         WHERE outbox.entity_id = draft.local_id
         ORDER BY outbox.created_at DESC LIMIT 1) AS last_error
      FROM tower_local_customer_drafts AS draft
      WHERE draft.local_id = ? AND draft.tenant_id = ? AND draft.store_id = ?
    `).get(localId, scope.tenantId, scope.storeId)
    if (!row) throw new Error('Cliente provisório nao encontrado.')
    return {
      localId: row.local_id,
      remoteCustomerId: row.remote_customer_id,
      syncStatus: row.sync_status,
      lastError: row.last_error,
    }
  }

  linkCustomerDraftToSession(scope, input) {
    assertScope(scope)
    if (!UUID_PATTERN.test(input?.sessionId || '')
        || !UUID_PATTERN.test(input?.localCustomerId || '')) {
      throw new Error('Vinculo local de cliente invalido.')
    }

    return this.transaction(() => {
      const session = this.database.prepare(`
        SELECT * FROM tower_local_sessions
        WHERE id = ? AND tenant_id = ? AND store_id = ? AND status = 'active'
      `).get(input.sessionId, scope.tenantId, scope.storeId)
      const customer = this.database.prepare(`
        SELECT * FROM tower_local_customer_drafts
        WHERE local_id = ? AND tenant_id = ? AND store_id = ?
      `).get(input.localCustomerId, scope.tenantId, scope.storeId)
      if (!session || !customer) throw new Error('Sessao ou cliente local nao encontrado.')

      const now = isoNow()
      this.database.prepare(`
        UPDATE tower_local_sessions
        SET local_customer_id = ?, customer_id = ?, updated_at = ?, sync_status = 'pending'
        WHERE id = ?
      `).run(customer.local_id, customer.remote_customer_id, now, session.id)
      const updated = this.database.prepare('SELECT * FROM tower_local_sessions WHERE id = ?').get(session.id)
      this.enqueue('tower_session.upsert', updated.id, {
        id: updated.id,
        status: updated.status,
        currentExperience: updated.current_experience,
        customerId: null,
        localCustomerId: updated.local_customer_id,
        opticalEvaluationId: updated.optical_evaluation_id,
        prescriptionSnapshot: parseJson(updated.prescription_snapshot),
        startedAt: updated.started_at,
        completedAt: updated.completed_at,
        discardedAt: updated.discarded_at,
        clientUpdatedAt: updated.updated_at,
      }, now)
      return serializeSession(updated)
    })
  }

  closeSession(scope, input) {
    assertScope(scope)
    if (!input || !UUID_PATTERN.test(input.sessionId || '')
        || !['completed', 'discarded'].includes(input.status)) {
      throw new Error('Encerramento da sessao invalido.')
    }

    return this.transaction(() => {
      const row = this.database.prepare(`
        SELECT * FROM tower_local_sessions
        WHERE id = ? AND tenant_id = ? AND store_id = ?
      `).get(input.sessionId, scope.tenantId, scope.storeId)
      if (!row) throw new Error('Sessao local da Torre nao encontrada.')
      if (row.status === input.status) return serializeSession(row)
      if (row.status !== 'active') throw new Error('Esta sessao nao pode mais ser alterada.')

      const now = isoNow()
      this.database.prepare(`
        UPDATE tower_local_sessions
        SET status = ?, completed_at = ?, discarded_at = ?,
            updated_at = ?, sync_status = 'pending'
        WHERE id = ?
      `).run(
        input.status,
        input.status === 'completed' ? now : null,
        input.status === 'discarded' ? now : null,
        now,
        input.sessionId,
      )
      const updated = this.database.prepare('SELECT * FROM tower_local_sessions WHERE id = ?').get(input.sessionId)
      this.enqueue('tower_session.upsert', updated.id, {
        id: updated.id,
        status: updated.status,
        currentExperience: updated.current_experience,
        customerId: updated.customer_id,
        localCustomerId: updated.local_customer_id,
        opticalEvaluationId: updated.optical_evaluation_id,
        prescriptionSnapshot: parseJson(updated.prescription_snapshot),
        startedAt: updated.started_at,
        completedAt: updated.completed_at,
        discardedAt: updated.discarded_at,
        clientUpdatedAt: updated.updated_at,
      }, now)
      return serializeSession(updated)
    })
  }

  saveMeasurement(scope, input) {
    assertScope(scope)
    if (!input || !UUID_PATTERN.test(input.towerSessionId || '')) throw new Error('Sessao da Torre invalida.')
    if (!LENS_MODES.has(input.lensMode)) throw new Error('Tipo de lente invalido.')
    if (!Number.isFinite(input.referenceMm) || input.referenceMm <= 0 || input.referenceMm > 1000) {
      throw new Error('Referencia de medidas invalida.')
    }
    if (!input.frontMeasurements || !input.profileMeasurements
        || !Array.isArray(input.attentionCodes)
        || typeof input.algorithmVersion !== 'string'
        || input.algorithmVersion.trim().length < 1
        || input.algorithmVersion.length > 80) {
      throw new Error('Resultado de medidas invalido.')
    }

    return this.transaction(() => {
      const session = this.database.prepare(`
        SELECT * FROM tower_local_sessions
        WHERE id = ? AND tenant_id = ? AND store_id = ? AND status = 'active'
      `).get(input.towerSessionId, scope.tenantId, scope.storeId)
      if (!session) throw new Error('Sessao local da Torre nao encontrada.')

      const previous = this.database.prepare(`
        SELECT COALESCE(MAX(version), 0) AS version
        FROM tower_local_measurement_results WHERE tower_session_id = ?
      `).get(session.id)
      const id = randomUUID()
      const version = Number(previous.version) + 1
      const now = isoNow()
      const payload = {
        id,
        towerSessionId: session.id,
        version,
        lensMode: input.lensMode,
        referenceMm: input.referenceMm,
        frontMeasurements: input.frontMeasurements,
        profileMeasurements: input.profileMeasurements,
        attentionCodes: input.attentionCodes,
        algorithmVersion: input.algorithmVersion.trim(),
        createdAt: now,
      }

      this.database.prepare(`
        INSERT INTO tower_local_measurement_results(
          id, tenant_id, store_id, tower_session_id, version, lens_mode,
          reference_mm, front_measurements, profile_measurements,
          attention_codes, algorithm_version, created_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `).run(
        id, scope.tenantId, scope.storeId, session.id, version, input.lensMode,
        input.referenceMm, JSON.stringify(input.frontMeasurements),
        JSON.stringify(input.profileMeasurements), JSON.stringify(input.attentionCodes),
        input.algorithmVersion.trim(), now,
      )
      this.enqueue('tower_measurement.created', id, payload, now)
      return { id, version, syncStatus: 'pending' }
    })
  }

  getHardwareValidation(scope, hardwareFingerprint) {
    assertScope(scope)
    if (!/^[0-9a-f]{64}$/i.test(hardwareFingerprint || '')) {
      throw new Error('Identidade de hardware invalida.')
    }
    const row = this.database.prepare(`
      SELECT * FROM tower_local_hardware_validations
      WHERE tenant_id = ? AND store_id = ? AND tower_asset_id = ? AND hardware_fingerprint = ?
    `).get(scope.tenantId, scope.storeId, scope.assetId, hardwareFingerprint)
    if (!row) return null
    return {
      id: row.id,
      hardwareFingerprint: row.hardware_fingerprint,
      hardwareSnapshot: parseJson(row.hardware_snapshot, {}),
      cameraApprovedAt: row.camera_approved_at,
      touchApprovedAt: row.touch_approved_at,
      displayApprovedAt: row.display_approved_at,
      updatedAt: row.updated_at,
      syncStatus: row.sync_status,
    }
  }

  saveHardwareApproval(scope, input) {
    assertScope(scope)
    const test = input?.test
    if (!['camera', 'touch', 'display'].includes(test)
        || !/^[0-9a-f]{64}$/i.test(input?.hardwareFingerprint || '')
        || !input?.hardwareSnapshot || typeof input.hardwareSnapshot !== 'object') {
      throw new Error('Aprovacao de hardware invalida.')
    }
    return this.transaction(() => {
      const now = isoNow()
      const snapshot = JSON.stringify(input.hardwareSnapshot)
      if (snapshot.length > 12000) throw new Error('Diagnostico de hardware excede o limite permitido.')
      let row = this.database.prepare(`
        SELECT * FROM tower_local_hardware_validations
        WHERE tower_asset_id = ? AND hardware_fingerprint = ?
      `).get(scope.assetId, input.hardwareFingerprint)
      if (!row) {
        const id = randomUUID()
        this.database.prepare(`
          INSERT INTO tower_local_hardware_validations(
            id, tenant_id, store_id, source_device_id, tower_asset_id, hardware_fingerprint,
            hardware_snapshot, created_at, updated_at, sync_status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).run(id, scope.tenantId, scope.storeId, scope.deviceId, scope.assetId,
          input.hardwareFingerprint, snapshot, now, now)
        row = this.database.prepare('SELECT * FROM tower_local_hardware_validations WHERE id = ?').get(id)
      }
      const approvalColumn = `${test}_approved_at`
      this.database.prepare(`
        UPDATE tower_local_hardware_validations
        SET ${approvalColumn} = ?, hardware_snapshot = ?, updated_at = ?, sync_status = 'pending'
        WHERE id = ?
      `).run(now, snapshot, now, row.id)
      row = this.database.prepare('SELECT * FROM tower_local_hardware_validations WHERE id = ?').get(row.id)
      this.enqueue('tower_hardware_validation.upsert', row.id, {
        id: row.id,
        hardwareFingerprint: row.hardware_fingerprint,
        hardwareSnapshot: parseJson(row.hardware_snapshot, {}),
        cameraApprovedAt: row.camera_approved_at,
        touchApprovedAt: row.touch_approved_at,
        displayApprovedAt: row.display_approved_at,
        updatedAt: row.updated_at,
      }, now)
      return this.getHardwareValidation(scope, row.hardware_fingerprint)
    })
  }

  saveConfigurationSnapshot(scope, snapshot) {
    assertScope(scope)
    if (!snapshot || snapshot.schemaVersion !== 1
        || snapshot.storeId !== scope.storeId
        || !/^[0-9a-f]{64}$/i.test(snapshot.revision || '')
        || typeof snapshot.generatedAt !== 'string'
        || Number.isNaN(Date.parse(snapshot.generatedAt))
        || !snapshot.remoteConfig || typeof snapshot.remoteConfig !== 'object'
        || !Array.isArray(snapshot.catalogs)
        || !snapshot.aiSuggestionConfig || typeof snapshot.aiSuggestionConfig !== 'object') {
      throw new Error('Snapshot de configuracao da Torre invalido.')
    }
    const payloadText = JSON.stringify(snapshot)
    const protectedPayload = this.protectPayload(payloadText)
    if (!protectedPayload || typeof protectedPayload.payload !== 'string'
        || !['json', 'safe_storage_v1'].includes(protectedPayload.encoding)) {
      throw new Error('Protecao da configuracao local indisponivel.')
    }
    const downloadedAt = isoNow()
    this.database.prepare(`
      INSERT INTO tower_local_configuration_snapshots(
        store_id, tenant_id, source_device_id, schema_version, revision,
        payload, payload_encoding, server_generated_at, downloaded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(store_id) DO UPDATE SET
        tenant_id = excluded.tenant_id,
        source_device_id = excluded.source_device_id,
        schema_version = excluded.schema_version,
        revision = excluded.revision,
        payload = excluded.payload,
        payload_encoding = excluded.payload_encoding,
        server_generated_at = excluded.server_generated_at,
        downloaded_at = excluded.downloaded_at
    `).run(
      scope.storeId, scope.tenantId, scope.deviceId, snapshot.schemaVersion,
      snapshot.revision, protectedPayload.payload, protectedPayload.encoding,
      snapshot.generatedAt, downloadedAt,
    )
    return { ...snapshot, downloadedAt }
  }

  getConfigurationSnapshot(scope) {
    assertScope(scope)
    const row = this.database.prepare(`
      SELECT payload, payload_encoding, downloaded_at
      FROM tower_local_configuration_snapshots
      WHERE store_id = ? AND tenant_id = ? AND source_device_id = ?
    `).get(scope.storeId, scope.tenantId, scope.deviceId)
    if (!row) return null
    const payload = parseJson(this.unprotectPayload(row.payload, row.payload_encoding))
    if (!payload || payload.storeId !== scope.storeId || payload.schemaVersion !== 1) {
      throw new Error('Snapshot local de configuracao invalido.')
    }
    return { ...payload, downloadedAt: row.downloaded_at }
  }

  getPendingEvents(limit = 20) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20))
    const now = isoNow()
    return this.database.prepare(`
      SELECT event_id, event_type, entity_id, payload, payload_encoding, payload_hash, attempt_count
      FROM tower_outbox
      WHERE status IN ('pending', 'failed') AND next_attempt_at <= ?
      ORDER BY created_at ASC LIMIT ?
    `).all(now, safeLimit).map((row) => {
      const payloadText = this.unprotectPayload(row.payload, row.payload_encoding)
      return {
        eventId: row.event_id,
        eventType: row.event_type,
        entityId: row.entity_id,
        payload: parseJson(payloadText, {}),
        payloadHash: row.payload_hash,
        attemptCount: row.attempt_count,
      }
    })
  }

  applySyncResults(results) {
    if (!Array.isArray(results) || results.length === 0) return
    this.transaction(() => {
      const now = isoNow()
      const updateCustomer = this.database.prepare(`
        UPDATE tower_local_customer_drafts
        SET remote_customer_id = ?, sync_status = 'synced', updated_at = ?
        WHERE local_id = ?
      `)
      const updateSessions = this.database.prepare(`
        UPDATE tower_local_sessions
        SET customer_id = ?
        WHERE local_customer_id = ?
      `)
      for (const result of results) {
        if (!UUID_PATTERN.test(result?.entityId || '')
            || !Number.isSafeInteger(result?.remoteCustomerId)
            || result.remoteCustomerId <= 0) continue
        updateCustomer.run(result.remoteCustomerId, now, result.entityId)
        updateSessions.run(result.remoteCustomerId, result.entityId)
      }
    })
  }

  markEventsSynced(eventIds) {
    if (!Array.isArray(eventIds) || eventIds.length === 0) return
    this.transaction(() => {
      const now = isoNow()
      const updateOutbox = this.database.prepare(`
        UPDATE tower_outbox SET status = 'synced', synced_at = ?, updated_at = ?, last_error = NULL
        WHERE event_id = ?
      `)
      const updateSession = this.database.prepare(`
        UPDATE tower_local_sessions SET sync_status = 'synced'
        WHERE id = (SELECT entity_id FROM tower_outbox WHERE event_id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM tower_outbox pending
            WHERE pending.entity_id = tower_local_sessions.id
              AND pending.event_id <> ? AND pending.status <> 'synced'
          )
      `)
      const updateMeasurement = this.database.prepare(`
        UPDATE tower_local_measurement_results SET sync_status = 'synced'
        WHERE id = (SELECT entity_id FROM tower_outbox WHERE event_id = ?)
      `)
      const updateCustomer = this.database.prepare(`
        UPDATE tower_local_customer_drafts SET sync_status = 'synced'
        WHERE local_id = (SELECT entity_id FROM tower_outbox WHERE event_id = ?)
      `)
      const updateHardware = this.database.prepare(`
        UPDATE tower_local_hardware_validations SET sync_status = 'synced'
        WHERE id = (SELECT entity_id FROM tower_outbox WHERE event_id = ?)
      `)
      for (const eventId of eventIds) {
        if (!UUID_PATTERN.test(eventId || '')) continue
        updateOutbox.run(now, now, eventId)
        updateSession.run(eventId, eventId)
        updateMeasurement.run(eventId)
        updateCustomer.run(eventId)
        updateHardware.run(eventId)
      }
    })
  }

  markEventsFailed(eventIds, message) {
    if (!Array.isArray(eventIds) || eventIds.length === 0) return
    const safeMessage = String(message || 'Falha de sincronizacao.').slice(0, 500)
    const now = new Date()
    const statement = this.database.prepare(`
      UPDATE tower_outbox
      SET status = 'failed', attempt_count = attempt_count + 1,
          next_attempt_at = ?, last_error = ?, updated_at = ?
      WHERE event_id = ? AND status <> 'synced'
    `)
    const updateCustomer = this.database.prepare(`
      UPDATE tower_local_customer_drafts SET sync_status = 'failed'
      WHERE local_id = (SELECT entity_id FROM tower_outbox WHERE event_id = ?)
    `)
    const updateHardware = this.database.prepare(`
      UPDATE tower_local_hardware_validations SET sync_status = 'failed'
      WHERE id = (SELECT entity_id FROM tower_outbox WHERE event_id = ?)
    `)
    for (const eventId of eventIds) {
      if (!UUID_PATTERN.test(eventId || '')) continue
      const current = this.database.prepare('SELECT attempt_count FROM tower_outbox WHERE event_id = ?').get(eventId)
      const delaySeconds = Math.min(300, 2 ** Math.min(8, Number(current?.attempt_count || 0) + 1))
      statement.run(new Date(now.getTime() + delaySeconds * 1000).toISOString(), safeMessage, now.toISOString(), eventId)
      updateCustomer.run(eventId)
      updateHardware.run(eventId)
    }
  }

  getSyncStatus() {
    const counts = this.database.prepare(`
      SELECT
        SUM(CASE WHEN status IN ('pending', 'failed') THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'synced' THEN 1 ELSE 0 END) AS synced,
        MAX(synced_at) AS last_synced_at
      FROM tower_outbox
    `).get()
    return {
      pending: Number(counts.pending || 0),
      synced: Number(counts.synced || 0),
      lastSyncedAt: counts.last_synced_at || null,
    }
  }
}

module.exports = { TowerLocalDatabase }
