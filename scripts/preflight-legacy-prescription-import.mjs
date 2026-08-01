import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'

const [, , planArg = 'tmp/legacy-prescription-study-import-plan.json', manifestArg = 'tmp/legacy-customer-match-report-migration-manifest.csv', databaseUrl = process.env.SUPABASE_DB_URL, storeIdArg = '5'] = process.argv
const storeId = Number(storeIdArg)
if (!databaseUrl || !Number.isInteger(storeId) || storeId <= 0) throw new Error('Uso: node scripts/preflight-legacy-prescription-import.mjs <plano> <manifesto> <db-url> <store-id>')

function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (quoted) { if (char === '"' && text[i + 1] === '"') { field += '"'; i += 1 } else if (char === '"') quoted = false; else field += char }
    else if (char === '"') quoted = true
    else if (char === ';') { row.push(field); field = '' }
    else if (char === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = '' }
    else field += char
  }
  const [headers, ...data] = rows
  return data.filter((values) => values.length === headers.length).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index]])))
}

  const plan = JSON.parse(readFileSync(resolve(planArg), 'utf8'))
const manifest = parseCsv(readFileSync(resolve(manifestArg), 'utf8'))
  const linkedIds = manifest.filter((row) => row.action === 'link_existing_customer').map((row) => Number(row.target_customer_id))
  const uniqueLinkedIds = [...new Set(linkedIds)]
const client = new pg.Client({ connectionString: databaseUrl })
await client.connect()
try {
  const { rows: tables } = await client.query("SELECT to_regclass('public.customer_external_references') AS refs, to_regclass('public.customer_prescription_history') AS history")
  const { rows: stores } = await client.query('SELECT id, tenant_id, name FROM public.stores WHERE id = $1', [storeId])
  const { rows: links } = await client.query('SELECT id FROM public.customers WHERE store_id = $1 AND id = ANY($2::bigint[])', [storeId, uniqueLinkedIds])
  const imported = tables[0]?.refs && tables[0]?.history
    ? await client.query("SELECT (SELECT count(*) FROM public.customer_external_references WHERE store_id=$1 AND source_system=$2) AS references, (SELECT count(*) FROM public.customer_prescription_history WHERE store_id=$1 AND source_system=$2) AS histories", [storeId, plan.sourceSystem])
    : { rows: [{ references: 0, histories: 0 }] }
  const blockers = []
  const validatedIds = new Set(links.map((row) => Number(row.id)))
  const missingLinkedIds = uniqueLinkedIds.filter((id) => !validatedIds.has(id))
  if (!tables[0]?.refs || !tables[0]?.history) blockers.push('Migração de histórico ainda não foi aplicada.')
  if (stores.length !== 1) blockers.push('Loja alvo não encontrada.')
  if (links.length !== uniqueLinkedIds.length) blockers.push(`Vínculos existentes divergentes: esperados ${uniqueLinkedIds.length}, encontrados ${links.length}.`)
  if (Number(imported.rows[0]?.references || 0) || Number(imported.rows[0]?.histories || 0)) blockers.push('Já existe importação deste sistema na loja; revisar antes de executar novamente.')
  const report = { generatedAt: new Date().toISOString(), readOnly: true, store: stores[0] || null, expected: { linkedSourceRecords: linkedIds.length, linkedCustomers: uniqueLinkedIds.length, newCustomers: manifest.filter((row) => row.action === 'create_customer').length, histories: plan.records.length, sourceSha256: plan.sourceSha256 }, currentImport: imported.rows[0], missingLinkedIds, blockers, ready: blockers.length === 0 }
  const reportPath = resolve('tmp/legacy-import-preflight.json')
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...report, reportPath }, null, 2))
} finally { await client.end() }
