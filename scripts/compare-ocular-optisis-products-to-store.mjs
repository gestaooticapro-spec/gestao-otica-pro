import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

const [inputArg = 'tmp/optisis-degrees-export.tsv', tenantId, storeIdArg, outputArg = 'tmp/ocular-optisis-product-target-match.csv', ...flags] = process.argv.slice(2)
const storeId = Number(storeIdArg)
const databaseUrl = flags.includes('--production-db') ? process.env.SUPABASE_DB_URL : process.env.LOCAL_SUPABASE_DB_URL

if (!databaseUrl || !tenantId || !Number.isInteger(storeId) || storeId <= 0) {
  throw new Error('Uso: node --env-file=.env.local scripts/compare-ocular-optisis-products-to-store.mjs <export.tsv> <tenant-id> <store-id> [saida.csv] [--production-db]')
}

const text = (value) => String(value ?? '').trim()
const decode = (value) => Buffer.from(value, 'base64').toString('utf8')
const normalize = (value) => text(value)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z0-9]+/g, ' ')
  .trim()
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const catalogs = { Lente: new Map(), Armacao: new Map(), Tratamento: new Map() }
const usage = { Lente: new Map(), Armacao: new Map(), Tratamento: new Map() }

for (const line of readFileSync(resolve(inputArg), 'utf8').trim().split(/\r?\n/)) {
  const [kind, ...encoded] = line.split('\t')
  const fields = encoded.map(decode)
  const type = kind === 'L' ? 'Lente' : kind === 'A' ? 'Armacao' : kind === 'T' ? 'Tratamento' : null
  if (type) catalogs[type].set(text(fields[0]), text(fields[1]))
  if (kind === 'P') {
    for (const [type, sourceId] of [
      ['Lente', text(fields[18])],
      ['Armacao', text(fields[19])],
      ['Tratamento', text(fields[20])],
    ]) {
      if (!sourceId) continue
      usage[type].set(sourceId, (usage[type].get(sourceId) || 0) + 1)
    }
  }
}

const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  const { rows: products } = await client.query(
    `SELECT id, nome, referencia, tipo_produto
       FROM public.products
      WHERE tenant_id=$1 AND store_id=$2`,
    [tenantId, storeId],
  )

  const targetByTypeAndName = new Map()
  for (const product of products) {
    const key = `${product.tipo_produto || ''}\u0000${normalize(product.nome)}`
    const list = targetByTypeAndName.get(key) || []
    list.push(product)
    targetByTypeAndName.set(key, list)
  }

  const rows = []
  for (const type of ['Lente', 'Armacao', 'Tratamento']) {
    const sourceIds = new Set([...catalogs[type].keys(), ...usage[type].keys()])
    for (const sourceId of sourceIds) {
      const sourceName = catalogs[type].get(sourceId) || ''
      const uses = usage[type].get(sourceId) || 0
      if (!uses) continue
      const normalizedName = normalize(sourceName)
      const candidates = targetByTypeAndName.get(`${type}\u0000${normalizedName}`) || []
      rows.push({
        type,
        sourceId,
        sourceName: sourceName || null,
        normalizedName,
        purchases: uses,
        status: !sourceName ? 'review_source_without_name' : candidates.length === 1 ? 'exact_target_match' : candidates.length > 1 ? 'review_multiple_target_matches' : 'create_legacy_product',
        targetIds: candidates.map((product) => product.id).join(', '),
        targetNames: candidates.map((product) => product.nome).join(' | '),
        targetReferences: candidates.map((product) => product.referencia || '').join(' | '),
      })
    }
  }

  rows.sort((a, b) => a.type.localeCompare(b.type) || b.purchases - a.purchases || a.sourceId.localeCompare(b.sourceId))
  const summary = Object.fromEntries(['Lente', 'Armacao', 'Tratamento'].map((type) => {
    const typeRows = rows.filter((row) => row.type === type)
    return [type, {
      usedSourceProducts: typeRows.length,
      purchaseLinks: typeRows.reduce((sum, row) => sum + row.purchases, 0),
      exactTargetMatches: typeRows.filter((row) => row.status === 'exact_target_match').length,
      exactTargetPurchaseLinks: typeRows.filter((row) => row.status === 'exact_target_match').reduce((sum, row) => sum + row.purchases, 0),
      createLegacyProducts: typeRows.filter((row) => row.status === 'create_legacy_product').length,
      review: typeRows.filter((row) => row.status.startsWith('review_')).length,
    }]
  }))

  const header = 'tipo;codigo_optisis;nome_optisis;nome_normalizado;compras_vinculadas;decisao;produto_mb_ids;produto_mb_nomes;produto_mb_referencias'
  const body = rows.map((row) => [row.type, row.sourceId, row.sourceName || '', row.normalizedName, row.purchases, row.status, row.targetIds, row.targetNames, row.targetReferences].map(csv).join(';'))
  writeFileSync(resolve(outputArg), `${header}\n${body.join('\n')}\n`, 'utf8')
  writeFileSync(resolve(outputArg).replace(/\.csv$/i, '.json'), `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify(summary, null, 2))
} finally {
  await client.end()
}
