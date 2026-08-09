import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'

const [, , planArg = 'tmp/legacy-prescription-study-import-plan.json', manifestArg = 'tmp/legacy-customer-match-report-migration-manifest.csv', databaseUrl = process.env.LOCAL_SUPABASE_DB_URL, tenantId, storeIdArg, ...flags] = process.argv
const execute = flags.includes('--execute')
const productionMode = flags.includes('--production')
const batchSizeFlag = flags.find((flag) => flag.startsWith('--batch-size='))
const batchSize = Math.max(1, Math.min(1000, Number(batchSizeFlag?.split('=')[1] || 250)))
const planPath = resolve(planArg)
const manifestPath = resolve(manifestArg)
const storeId = Number(storeIdArg)

if (!databaseUrl) throw new Error('Informe LOCAL_SUPABASE_DB_URL como terceiro argumento.')
// The production connection is deliberately opt-in: callers must pass the
// sentinel below together with --production and its confirmation flags. This
// avoids exposing the connection string in a shell argument.
const resolvedDatabaseUrl = databaseUrl === '--production-db'
  ? process.env.SUPABASE_DB_URL
  : databaseUrl
if (!resolvedDatabaseUrl) throw new Error('Informe LOCAL_SUPABASE_DB_URL como terceiro argumento.')
const parsedUrl = new URL(resolvedDatabaseUrl)
const isLocalDatabase = ['127.0.0.1', 'localhost', '::1'].includes(parsedUrl.hostname)
if (!tenantId || !Number.isInteger(storeId) || storeId <= 0) {
  throw new Error('Uso: node scripts/import-legacy-prescription-history.mjs <plano> <manifesto> <db-local-url> <tenant-id> <store-id> [--execute]')
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 } else if (char === '"') quoted = false
      else field += char
    } else if (char === '"') quoted = true
    else if (char === ';') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += char
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  const [headers, ...data] = rows
  return data.filter((values) => values.length === headers.length).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])))
}

const plan = JSON.parse(readFileSync(planPath, 'utf8'))
const manifest = parseCsv(readFileSync(manifestPath, 'utf8'))
const customersByLegacyId = new Map(manifest.map((row) => [row.legacy_customer_id, row]))
// Planos recentes classificam cada receita antes da carga. Uma receita em
// revisão nunca deve entrar só porque o mesmo cliente tem outra receita apta.
const eligibleRecords = plan.records.filter((record) => record.importStatus === 'ready' && customersByLegacyId.has(record.sourceCustomerId))
const summary = {
  mode: execute ? (productionMode ? 'execute-production' : 'execute-local') : 'dry-run',
  sourceRecords: plan.records.length,
  recordsToInsert: eligibleRecords.length,
  customersToCreate: manifest.filter((row) => row.action === 'create_customer').length,
  customersToLink: manifest.filter((row) => row.action === 'link_existing_customer').length,
  batchSize,
}

if (!isLocalDatabase && !productionMode) {
  throw new Error('Banco remoto bloqueado. Use apenas --production durante a janela autorizada.')
}
if (execute && productionMode) {
  const requiredFlags = [
    `--confirm-store=${storeId}`,
    `--confirm-source-sha=${plan.sourceSha256}`,
    '--confirm-window-authorized',
  ]
  const missing = requiredFlags.filter((flag) => !flags.includes(flag))
  if (missing.length) throw new Error(`Execucao remota bloqueada. Faltam confirmacoes: ${missing.join(', ')}`)
}

if (!execute) {
  console.log(JSON.stringify(summary, null, 2))
  process.exit(0)
}

const matchMethod = {
  match_cpf: 'cpf',
  match_name_phone: 'name_phone',
  match_name_birth_date: 'name_birth_date',
  match_name_confirmed: 'name_confirmed',
}

function validTimestampOrEmpty(value) {
  if (!value || Number.isNaN(Date.parse(value))) return ''
  return value
}
let PgClient
try {
  ({ Client: PgClient } = await import('pg'))
} catch {
  throw new Error('Para executar a carga local, instale a dependencia pg: npm install --save-dev pg')
}
const client = new PgClient({ connectionString: resolvedDatabaseUrl })
const batchId = randomUUID()
await client.connect()

try {
  const linkedIds = manifest
    .filter((row) => row.action === 'link_existing_customer')
    .map((row) => Number(row.target_customer_id))
    .filter(Number.isInteger)
  const uniqueLinkedIds = [...new Set(linkedIds)]
  const { rows: validatedLinks } = await client.query(
    'SELECT id FROM public.customers WHERE tenant_id = $1 AND store_id = $2 AND id = ANY($3::bigint[])',
    [tenantId, storeId, uniqueLinkedIds],
  )
  if (validatedLinks.length !== uniqueLinkedIds.length) {
    throw new Error(`Preflight falhou: esperados ${uniqueLinkedIds.length} vinculos existentes, validados ${validatedLinks.length}.`)
  }
  await client.query('BEGIN')
  const customerIds = new Map()
  for (const row of manifest) {
    let customerId = Number(row.target_customer_id) || null
    const imported = await client.query(
      `SELECT customer_id FROM public.customer_external_references
       WHERE store_id = $1 AND source_system = $2 AND source_customer_id = $3`,
      [storeId, plan.sourceSystem, row.legacy_customer_id],
    )
    if (imported.rowCount) customerId = imported.rows[0].customer_id
    else if (row.action === 'create_customer') {
      const created = await client.query(
        `INSERT INTO public.customers (tenant_id, store_id, full_name, cpf, phone, birth_date)
         VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, '')::date) RETURNING id`,
        [tenantId, storeId, row.legacy_name || row.legacy_display_name, row.legacy_cpf, row.legacy_phones.split(' | ')[0] || '', row.legacy_birth_date],
      )
      customerId = created.rows[0].id
    }
    if (!customerId) throw new Error(`Cliente legado ${row.legacy_customer_id} sem destino.`)
    customerIds.set(row.legacy_customer_id, customerId)
    await client.query(
      `INSERT INTO public.customer_external_references
        (tenant_id, store_id, customer_id, source_system, source_customer_id, source_customer_name, migration_batch_id, match_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (store_id, source_system, source_customer_id) DO NOTHING`,
      [tenantId, storeId, customerId, plan.sourceSystem, row.legacy_customer_id, row.legacy_name, batchId, row.action === 'create_customer' ? 'created' : (matchMethod[row.match_method] || 'manual')],
    )
  }

  await client.query('COMMIT')
  const batches = []
  let insertedHistories = 0
  for (let start = 0; start < eligibleRecords.length; start += batchSize) {
    const records = eligibleRecords.slice(start, start + batchSize)
    let insertedInBatch = 0
    await client.query('BEGIN')
    try {
      for (const record of records) {
        const result = await client.query(
      `INSERT INTO public.customer_prescription_history (
        tenant_id, store_id, customer_id, source_system, source_snapshot_sha256, source_record_key,
        source_customer_id, source_service_order_id, migration_batch_id, prescription_date, received_at,
        receita_longe_od_esferico, receita_longe_od_cilindrico, receita_longe_od_eixo,
        receita_longe_oe_esferico, receita_longe_oe_cilindrico, receita_longe_oe_eixo,
        receita_perto_od_esferico, receita_perto_od_cilindrico, receita_perto_od_eixo,
        receita_perto_oe_esferico, receita_perto_oe_cilindrico, receita_perto_oe_eixo,
        receita_adicao_od, receita_adicao_oe, medida_dnp_od, medida_dnp_oe, medida_altura_od, medida_altura_oe,
        service_description, source_payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULLIF($11,'')::timestamptz,
        $12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31::jsonb)
       ON CONFLICT (store_id, source_system, source_snapshot_sha256, source_record_key) DO NOTHING`,
      [tenantId, storeId, customerIds.get(record.sourceCustomerId), plan.sourceSystem, plan.sourceSha256, record.sourceRecordKey,
        record.sourceCustomerId, record.sourceServiceOrderId, batchId, record.prescriptionDate, validTimestampOrEmpty(record.receivedAt),
        record.receita_longe_od_esferico, record.receita_longe_od_cilindrico, record.receita_longe_od_eixo,
        record.receita_longe_oe_esferico, record.receita_longe_oe_cilindrico, record.receita_longe_oe_eixo,
        record.receita_perto_od_esferico, record.receita_perto_od_cilindrico, record.receita_perto_od_eixo,
        record.receita_perto_oe_esferico, record.receita_perto_oe_cilindrico, record.receita_perto_oe_eixo,
        record.receita_adicao_od, record.receita_adicao_oe, record.medida_dnp_od, record.medida_dnp_oe, record.medida_altura_od, record.medida_altura_oe,
        record.serviceDescription, JSON.stringify({ legacySourceRowKey: record.sourceRecordKey })],
        )
        insertedInBatch += result.rowCount || 0
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
    insertedHistories += insertedInBatch
    batches.push({ number: batches.length + 1, records: records.length, inserted: insertedInBatch })
  }
  const finalReport = { ...summary, batchId, completedAt: new Date().toISOString(), validatedExistingLinks: validatedLinks.length, insertedHistories, batches }
  const reportPath = resolve(`tmp/legacy-import-execution-${batchId}.json`)
  writeFileSync(reportPath, `${JSON.stringify(finalReport, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...finalReport, reportPath }, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
