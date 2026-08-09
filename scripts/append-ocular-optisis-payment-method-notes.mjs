import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

const [inputArg = 'tmp/optisis-financial-export.tsv', databaseUrlArg = process.env.LOCAL_SUPABASE_DB_URL, tenantId, storeIdArg, outputArg = 'tmp/ocular-optisis-payment-method-notes-report.json', ...flags] = process.argv.slice(2)
const execute = flags.includes('--execute')
const productionMode = flags.includes('--production')
const productionConfirmed = flags.includes('--confirm-ocular-production-payment-method-notes')
const databaseUrl = databaseUrlArg === '--production-db' ? process.env.SUPABASE_DB_URL : databaseUrlArg
const storeId = Number(storeIdArg)

if (!databaseUrl || !tenantId || !Number.isInteger(storeId) || storeId <= 0) throw new Error('Uso: node scripts/append-ocular-optisis-payment-method-notes.mjs <financeiro.tsv> <db-url> <tenant-id> <store-id> [saida.json] [--execute]')
const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)
if (!isLocal && !(productionMode && productionConfirmed && databaseUrlArg === '--production-db')) throw new Error('Banco remoto bloqueado. Produção exige --production-db --production --confirm-ocular-production-payment-method-notes.')

const decode = (value) => Buffer.from(value, 'base64').toString('utf8').trim()
const normalizeSpace = (value) => String(value ?? '').replace(/\s+/g, ' ').trim()
const sourceSystem = 'optisis-ocular'
const marker = 'Forma de pagamento no Optisis:'
const sourceRows = []
for (const line of readFileSync(resolve(inputArg), 'utf8').trim().split(/\r?\n/)) {
  const fields = line.split('\t').map(decode)
  const purchaseId = normalizeSpace(fields[0])
  const paymentMethod = normalizeSpace(fields[15])
  if (purchaseId && paymentMethod) sourceRows.push({ source_key: `optisis-tabcompra:${purchaseId}`, payment_method: paymentMethod })
}

const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  const store = await client.query('SELECT id FROM public.stores WHERE id=$1 AND tenant_id=$2', [storeId, tenantId])
  if (store.rowCount !== 1) throw new Error('Loja/tenant de destino não correspondem.')
  const sourceKeys = sourceRows.map((row) => row.source_key)
  const existing = await client.query(
    `SELECT import_source_record_key, obs_geral
     FROM public.vendas
     WHERE store_id=$1 AND is_historical_import=true AND import_source_system=$2
       AND import_source_record_key=ANY($3::text[])`,
    [storeId, sourceSystem, sourceKeys],
  )
  const existingByKey = new Map(existing.rows.map((row) => [String(row.import_source_record_key), String(row.obs_geral || '')]))
  const rowsToUpdate = sourceRows.filter((row) => {
    const note = existingByKey.get(row.source_key)
    return note !== undefined && !note.includes(marker)
  })
  const report = {
    mode: execute ? (productionMode ? 'execute-production' : 'execute-local') : 'dry-run',
    sourceWithPaymentMethod: sourceRows.length,
    matchingImportedSales: existing.rowCount || 0,
    alreadyAnnotated: sourceRows.filter((row) => existingByKey.get(row.source_key)?.includes(marker)).length,
    readyToAnnotate: rowsToUpdate.length,
    annotated: 0,
    examples: rowsToUpdate.slice(0, 10),
  }
  if (execute && rowsToUpdate.length) {
    await client.query('BEGIN')
    const result = await client.query(
      `UPDATE public.vendas AS target
       SET obs_geral = CONCAT_WS(' | ', NULLIF(BTRIM(target.obs_geral), ''), $1 || ' ' || staged.payment_method)
       FROM jsonb_to_recordset($2::jsonb) AS staged(source_key text, payment_method text)
       WHERE target.store_id=$3 AND target.is_historical_import=true AND target.import_source_system=$4
         AND target.import_source_record_key=staged.source_key
         AND COALESCE(target.obs_geral, '') NOT LIKE '%' || $1 || '%'
       RETURNING target.id`,
      [marker, JSON.stringify(rowsToUpdate), storeId, sourceSystem],
    )
    if (result.rowCount !== rowsToUpdate.length) throw new Error('Uma observação mudou durante a atualização; operação cancelada.')
    await client.query('COMMIT')
    report.annotated = result.rowCount || 0
  }
  writeFileSync(resolve(outputArg), `${JSON.stringify({ ...report, generatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...report, output: resolve(outputArg) }, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
