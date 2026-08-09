import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

const [inputArg = 'tmp/optisis-degrees-export.tsv', databaseUrlArg = process.env.LOCAL_SUPABASE_DB_URL, tenantId, storeIdArg, outputDirArg = 'tmp', ...flags] = process.argv.slice(2)
const execute = flags.includes('--execute')
const productionMode = flags.includes('--production')
const productionConfirmed = flags.includes('--confirm-ocular-production-import')
const databaseUrl = databaseUrlArg === '--production-db' ? process.env.SUPABASE_DB_URL : databaseUrlArg
const storeId = Number(storeIdArg)

if (!databaseUrl || !tenantId || !Number.isInteger(storeId) || storeId <= 0) {
  throw new Error('Uso: node scripts/import-ocular-optisis-historical-sales.mjs <export.tsv> <db-local-url> <tenant-id> <store-id> [pasta-saida] [--execute]')
}
const isLocalDatabase = ['127.0.0.1', 'localhost', '::1'].includes(new URL(databaseUrl).hostname)
if (!isLocalDatabase && !(productionMode && productionConfirmed && databaseUrlArg === '--production-db')) {
  throw new Error('Este importador aceita somente banco local. Producao exige --production-db --production --confirm-ocular-production-import.')
}

const sourceSystem = 'optisis-ocular'
const inputPath = resolve(inputArg)
const outputDir = resolve(outputDirArg)
const rawExport = readFileSync(inputPath)
const sourceSha256 = createHash('sha256').update(rawExport).digest('hex')
const text = (value) => String(value ?? '').trim()
const decode = (value) => Buffer.from(value, 'base64').toString('utf8')
const normalize = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const parseDate = (value) => {
  const raw = text(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw)
  return match ? `${match[3]}-${match[2]}-${match[1]}` : null
}
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

const customers = new Map()
const catalogs = { Lente: new Map(), Armacao: new Map(), Tratamento: new Map() }
const purchases = []
for (const line of rawExport.toString('utf8').trim().split(/\r?\n/)) {
  const [kind, ...encoded] = line.split('\t')
  const fields = encoded.map(decode)
  if (kind === 'C') customers.set(text(fields[0]), { id: text(fields[0]), name: text(fields[1]) })
  if (kind === 'L') catalogs.Lente.set(text(fields[0]), text(fields[1]))
  if (kind === 'A') catalogs.Armacao.set(text(fields[0]), text(fields[1]))
  if (kind === 'T') catalogs.Tratamento.set(text(fields[0]), text(fields[1]))
  if (kind === 'P') purchases.push({
    id: text(fields[0]), customerId: text(fields[1]), date: parseDate(fields[2]),
    lensId: text(fields[18]), frameId: text(fields[19]), treatmentId: text(fields[20]),
    observation: text(fields[21]), doctor: text(fields[22]),
  })
}

const sourceProduct = (type, rawId) => {
  const id = text(rawId)
  if (!id) return null
  const catalogName = catalogs[type].get(id)
  const name = text(catalogName || id)
  return { type, id, name, normalizedName: normalize(name), resolved: Boolean(catalogName || !/^\d+$/.test(id)) }
}
const productKey = (product) => `${product.type}|${product.normalizedName}`
const purchaseDescription = (purchase) => [
  sourceProduct('Lente', purchase.lensId)?.name && `Lentes: ${sourceProduct('Lente', purchase.lensId).name}`,
  sourceProduct('Armacao', purchase.frameId)?.name && `Armação: ${sourceProduct('Armacao', purchase.frameId).name}`,
  sourceProduct('Tratamento', purchase.treatmentId)?.name && `Tratamento: ${sourceProduct('Tratamento', purchase.treatmentId).name}`,
  purchase.doctor && `Oftalmo: ${purchase.doctor}`,
  purchase.observation && `Observação: ${purchase.observation}`,
].filter(Boolean).join(' | ')

const client = new Client({ connectionString: databaseUrl })
await client.connect()
const batchId = randomUUID()
const summary = {
  mode: execute ? (productionMode ? 'execute-production' : 'execute-local') : 'dry-run',
  batchId: execute ? batchId : null, sourceSha256,
  purchases: { source: purchases.length, ready: 0, existing: 0, skippedCustomerReview: 0, skippedInvalidDate: 0, inserted: 0 },
  products: { sourceReferences: 0, existingExactMatch: 0, createdLegacy: 0, mappedSourceCodes: 0, unresolvedSourceCodes: 0 },
  items: { inserted: 0, skippedUnresolvedSource: 0 },
  prescriptionsLinked: 0,
}
const reviews = []

try {
  const targetStore = await client.query('SELECT id FROM public.stores WHERE id=$1 AND tenant_id=$2', [storeId, tenantId])
  if (targetStore.rowCount !== 1) throw new Error('Loja/tenant de destino nao correspondem.')

  const [customerRefs, currentProducts, productRefs, currentSales] = await Promise.all([
    client.query('SELECT source_customer_id,customer_id FROM public.customer_external_references WHERE store_id=$1 AND source_system=$2', [storeId, sourceSystem]),
    client.query('SELECT id,nome,tipo_produto FROM public.products WHERE store_id=$1', [storeId]),
    client.query('SELECT source_product_type,source_product_id,product_id FROM public.product_external_references WHERE store_id=$1 AND source_system=$2', [storeId, sourceSystem]),
    client.query('SELECT id,import_source_record_key FROM public.vendas WHERE store_id=$1 AND is_historical_import=true AND import_source_system=$2', [storeId, sourceSystem]),
  ])
  const customerBySourceId = new Map(customerRefs.rows.map((row) => [String(row.source_customer_id), Number(row.customer_id)]))
  const productBySourceCode = new Map(productRefs.rows.map((row) => [`${row.source_product_type}|${row.source_product_id}`, Number(row.product_id)]))
  const saleBySourceKey = new Map(currentSales.rows.map((row) => [String(row.import_source_record_key), Number(row.id)]))
  const productsByExactName = new Map()
  for (const product of currentProducts.rows) {
    const key = `${product.tipo_produto}|${normalize(product.nome)}`
    const candidates = productsByExactName.get(key) || []
    candidates.push(Number(product.id)); productsByExactName.set(key, candidates)
  }

  const uniqueSources = new Map()
  for (const purchase of purchases) {
    for (const product of [sourceProduct('Lente', purchase.lensId), sourceProduct('Armacao', purchase.frameId), sourceProduct('Tratamento', purchase.treatmentId)]) {
      if (!product) continue
      const key = `${product.type}|${product.id}`
      if (!uniqueSources.has(key)) uniqueSources.set(key, product)
    }
  }
  summary.products.sourceReferences = uniqueSources.size

  const unresolvedSources = []
  const productGroups = new Map()
  for (const product of uniqueSources.values()) {
    if (!product.resolved || !product.normalizedName) {
      unresolvedSources.push(product)
      continue
    }
    const key = productKey(product)
    const group = productGroups.get(key) || { type: product.type, normalizedName: product.normalizedName, displayName: product.name, sources: [] }
    group.sources.push(product); productGroups.set(key, group)
  }
  summary.products.unresolvedSourceCodes = unresolvedSources.length

  const productPlans = []
  for (const group of productGroups.values()) {
    const candidates = productsByExactName.get(`${group.type}|${group.normalizedName}`) || []
    productPlans.push({ ...group, targetProductId: candidates.length === 1 ? candidates[0] : null, create: candidates.length !== 1, exactCandidates: candidates })
  }
  summary.products.existingExactMatch = productPlans.filter((plan) => plan.targetProductId).length
  summary.products.createdLegacy = productPlans.filter((plan) => plan.create).length

  for (const purchase of purchases) {
    const sourceKey = `optisis-tabcompra:${purchase.id}`
    if (saleBySourceKey.has(sourceKey)) { summary.purchases.existing += 1; continue }
    if (!purchase.date) { summary.purchases.skippedInvalidDate += 1; reviews.push({ kind: 'compra', purchaseId: purchase.id, reason: 'data_invalida', detail: text(purchase.date) }); continue }
    if (!customerBySourceId.has(purchase.customerId)) {
      summary.purchases.skippedCustomerReview += 1
      reviews.push({ kind: 'compra', purchaseId: purchase.id, reason: 'cliente_sem_vinculo_inequivoco', detail: customers.get(purchase.customerId)?.name || `codigo ${purchase.customerId}` })
      continue
    }
    summary.purchases.ready += 1
  }

  if (!execute) {
    mkdirSync(outputDir, { recursive: true })
    const reportPath = resolve(outputDir, 'ocular-optisis-historical-sales-dry-run.json')
    const reviewPath = resolve(outputDir, 'ocular-optisis-historical-sales-review.csv')
    writeFileSync(reportPath, `${JSON.stringify({ ...summary, productPlans: productPlans.map((plan) => ({ type: plan.type, name: plan.displayName, sourceCodes: plan.sources.map((source) => source.id), action: plan.create ? 'criar_produto_legado' : 'usar_produto_existente', targetProductId: plan.targetProductId, exactCandidates: plan.exactCandidates })), unresolvedSources, reviews }, null, 2)}\n`, 'utf8')
    writeFileSync(reviewPath, ['tipo;compra_optisis;motivo;detalhe', ...reviews.map((row) => [row.kind, row.purchaseId, row.reason, row.detail].map(csv).join(';'))].join('\n') + '\n', 'utf8')
    console.log(JSON.stringify({ ...summary, reportPath, reviewPath }, null, 2))
    process.exit(0)
  }

  await client.query('BEGIN')
  for (const plan of productPlans) {
    let productId = plan.targetProductId
    if (!productId) {
      const firstSource = plan.sources[0]
      const reference = `OPTISIS-${plan.type.toUpperCase()}-${firstSource.id}`.slice(0, 120)
      const inserted = await client.query(
        `INSERT INTO public.products (tenant_id,store_id,nome,referencia,tipo_produto,categoria,preco_custo,preco_venda,estoque_atual,estoque_minimo,gerencia_estoque,unidade_medida,detalhes)
         VALUES ($1,$2,$3,$4,$5,'Historico Optisis',0,0,0,0,false,'UN',$6::jsonb) RETURNING id`,
        [tenantId, storeId, plan.displayName, reference, plan.type, JSON.stringify({ historical_import: true, source_system: sourceSystem, source_codes: plan.sources.map((source) => source.id), source_sha256: sourceSha256 })],
      )
      productId = Number(inserted.rows[0].id)
    }
    for (const source of plan.sources) {
      await client.query(
        `INSERT INTO public.product_external_references (tenant_id,store_id,product_id,source_system,source_product_type,source_product_id,source_product_name,normalized_name,migration_batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (store_id,source_system,source_product_type,source_product_id) DO NOTHING`,
        [tenantId, storeId, productId, sourceSystem, source.type, source.id, source.name, source.normalizedName, batchId],
      )
      productBySourceCode.set(`${source.type}|${source.id}`, productId)
      summary.products.mappedSourceCodes += 1
    }
  }

  for (const purchase of purchases) {
    const sourceKey = `optisis-tabcompra:${purchase.id}`
    if (saleBySourceKey.has(sourceKey) || !purchase.date || !customerBySourceId.has(purchase.customerId)) continue
    const customerId = customerBySourceId.get(purchase.customerId)
    const note = `Histórico importado do Optisis. Compra legada nº ${purchase.id}.${purchaseDescription(purchase) ? ` ${purchaseDescription(purchase)}` : ''}`
    const timestamp = `${purchase.date}T12:00:00-03:00`
    const insertedSale = await client.query(
      `INSERT INTO public.vendas (tenant_id,store_id,customer_id,valor_total,valor_desconto,valor_final,status,created_at,valor_restante,data_fechamento,obs_geral,is_historical_import,import_source_system,import_source_record_key,import_batch_id,historical_entry_amount)
       VALUES ($1,$2,$3,0,0,0,'Fechada',$4,0,$4,$5,true,$6,$7,$8,0) RETURNING id`,
      [tenantId, storeId, customerId, timestamp, note, sourceSystem, sourceKey, batchId],
    )
    const saleId = Number(insertedSale.rows[0].id)
    for (const source of [sourceProduct('Lente', purchase.lensId), sourceProduct('Armacao', purchase.frameId), sourceProduct('Tratamento', purchase.treatmentId)]) {
      if (!source) continue
      if (!source.resolved) { summary.items.skippedUnresolvedSource += 1; continue }
      const productId = productBySourceCode.get(`${source.type}|${source.id}`)
      if (!productId) { summary.items.skippedUnresolvedSource += 1; continue }
      await client.query(
        `INSERT INTO public.venda_itens (tenant_id,store_id,venda_id,product_id,item_tipo,descricao,quantidade,valor_unitario,valor_total_item,detalhes_avulsos)
         VALUES ($1,$2,$3,$4,$5,$6,1,0,0,$7::jsonb)`,
        [tenantId, storeId, saleId, productId, source.type, source.name, JSON.stringify({ historical_import: true, source_system: sourceSystem, source_product_type: source.type, source_product_id: source.id, source_sha256: sourceSha256 })],
      )
      summary.items.inserted += 1
    }
    const linked = await client.query(
      `UPDATE public.customer_prescription_history
       SET historical_sale_id=$1
       WHERE store_id=$2 AND customer_id=$3 AND source_system=$4 AND source_record_key=$5 AND historical_sale_id IS NULL`,
      [saleId, storeId, customerId, sourceSystem, sourceKey],
    )
    summary.prescriptionsLinked += linked.rowCount || 0
    summary.purchases.inserted += 1
  }
  await client.query('COMMIT')

  mkdirSync(outputDir, { recursive: true })
  const reportPath = resolve(outputDir, `ocular-optisis-historical-sales-${batchId}.json`)
  const reviewPath = resolve(outputDir, `ocular-optisis-historical-sales-${batchId}-review.csv`)
  writeFileSync(reportPath, `${JSON.stringify({ ...summary, completedAt: new Date().toISOString(), unresolvedSources, reviews }, null, 2)}\n`, 'utf8')
  writeFileSync(reviewPath, ['tipo;compra_optisis;motivo;detalhe', ...reviews.map((row) => [row.kind, row.purchaseId, row.reason, row.detail].map(csv).join(';'))].join('\n') + '\n', 'utf8')
  console.log(JSON.stringify({ ...summary, reportPath, reviewPath }, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
