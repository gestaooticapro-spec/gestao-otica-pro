import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'

const [inputArg = 'tmp/optisis-financial-export.tsv', databaseUrlArg = process.env.LOCAL_SUPABASE_DB_URL, tenantId, storeIdArg, outputDirArg = 'tmp', ...flags] = process.argv.slice(2)
const execute = flags.includes('--execute')
const productionMode = flags.includes('--production')
const productionConfirmed = flags.includes('--confirm-ocular-production-financial-recovery')
const batchSizeFlag = flags.find((flag) => flag.startsWith('--batch-size='))
const batchSize = Math.max(1, Math.min(500, Number(batchSizeFlag?.split('=')[1] || 200)))
const databaseUrl = databaseUrlArg === '--production-db' ? process.env.SUPABASE_DB_URL : databaseUrlArg
const storeId = Number(storeIdArg)

if (!databaseUrl || !tenantId || !Number.isInteger(storeId) || storeId <= 0) {
  throw new Error('Uso: node scripts/recover-ocular-optisis-historical-financials.mjs <financeiro.tsv> <db-local-url> <tenant-id> <store-id> [pasta-saida] [--execute]')
}
const databaseHost = new URL(databaseUrl).hostname
const isLocalDatabase = ['127.0.0.1', 'localhost', '::1'].includes(databaseHost)
if (!isLocalDatabase && !(productionMode && productionConfirmed && databaseUrlArg === '--production-db')) {
  throw new Error('Este corretor aceita somente banco local. Produção exige --production-db --production --confirm-ocular-production-financial-recovery.')
}

const decode = (value) => Buffer.from(value, 'base64').toString('utf8').trim()
const text = (value) => String(value ?? '').trim()
const money = (value) => {
  const parsed = Number(text(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}
const csv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const equalMoney = (first, second) => Math.abs(Number(first) - Number(second)) < 0.005
const sourceSystem = 'optisis-ocular'

const purchases = new Map()
for (const line of readFileSync(resolve(inputArg), 'utf8').trim().split(/\r?\n/)) {
  const fields = line.split('\t').map(decode)
  const purchase = {
    id: text(fields[0]),
    sourceCodes: { Lente: text(fields[3]), Armacao: text(fields[4]), Tratamento: text(fields[5]) },
    values: { Lente: money(fields[7]), Armacao: money(fields[8]), Tratamento: money(fields[9]) },
    total: money(fields[10]),
    entry: money(fields[11]),
    remaining: money(fields[12]),
  }
  purchase.componentsTotal = Number((purchase.values.Lente + purchase.values.Armacao + purchase.values.Tratamento).toFixed(2))
  purchases.set(purchase.id, purchase)
}

const outputDir = resolve(outputDirArg)
const batchId = randomUUID()
const summary = {
  mode: execute ? (productionMode ? 'execute-production' : 'execute-local') : 'dry-run',
  batchId: execute ? batchId : null,
  sourcePurchases: purchases.size,
  existingHistoricalSales: 0,
  eligibleBySource: 0,
  readyToRecover: 0,
  recovered: 0,
  batches: { size: batchSize, committed: 0, singleSaleSkippedAfterConflict: 0 },
  skipped: {
    sourceTotalZero: 0,
    sourceComponentsDiffer: 0,
    sourceComponentWithoutProductReference: 0,
    saleNotImported: 0,
    saleAlreadyHasFinancialValues: 0,
    unexpectedItems: 0,
    missingOrMismatchedItems: 0,
  },
}
const review = []

const client = new Client({ connectionString: databaseUrl })
await client.connect()
try {
  const targetStore = await client.query('SELECT id FROM public.stores WHERE id=$1 AND tenant_id=$2', [storeId, tenantId])
  if (targetStore.rowCount !== 1) throw new Error('Loja/tenant de destino não correspondem.')

  const salesResult = await client.query(
    `SELECT id, import_source_record_key, valor_total, valor_final, valor_restante
     FROM public.vendas
     WHERE store_id=$1 AND is_historical_import=true AND import_source_system=$2`,
    [storeId, sourceSystem],
  )
  summary.existingHistoricalSales = salesResult.rowCount || 0
  const salesBySourceKey = new Map(salesResult.rows.map((sale) => [String(sale.import_source_record_key), sale]))
  const saleIds = salesResult.rows.map((sale) => Number(sale.id))
  const itemsBySaleId = new Map()
  if (saleIds.length) {
    const itemsResult = await client.query(
      `SELECT id, venda_id, item_tipo, quantidade, valor_unitario, valor_total_item, detalhes_avulsos
       FROM public.venda_itens WHERE venda_id = ANY($1::bigint[])`,
      [saleIds],
    )
    for (const item of itemsResult.rows) {
      const items = itemsBySaleId.get(Number(item.venda_id)) || []
      items.push(item)
      itemsBySaleId.set(Number(item.venda_id), items)
    }
  }

  const plans = []
  for (const purchase of purchases.values()) {
    const sourceKey = `optisis-tabcompra:${purchase.id}`
    if (purchase.total <= 0) {
      summary.skipped.sourceTotalZero += 1
      continue
    }
    if (!equalMoney(purchase.total, purchase.componentsTotal)) {
      summary.skipped.sourceComponentsDiffer += 1
      review.push({ purchaseId: purchase.id, saleId: '', reason: 'total_origem_diferente_da_soma_dos_componentes', total: purchase.total, components: purchase.componentsTotal })
      continue
    }
    summary.eligibleBySource += 1

    if (['Lente', 'Armacao', 'Tratamento'].some((type) => purchase.values[type] > 0 && (!purchase.sourceCodes[type] || purchase.sourceCodes[type] === '0'))) {
      summary.skipped.sourceComponentWithoutProductReference += 1
      review.push({ purchaseId: purchase.id, saleId: '', reason: 'componente_com_valor_sem_referencia_de_produto_na_origem', total: purchase.total, components: purchase.componentsTotal })
      continue
    }

    const sale = salesBySourceKey.get(sourceKey)
    if (!sale) {
      summary.skipped.saleNotImported += 1
      continue
    }
    if (![sale.valor_total, sale.valor_final, sale.valor_restante].every((value) => equalMoney(value, 0))) {
      summary.skipped.saleAlreadyHasFinancialValues += 1
      review.push({ purchaseId: purchase.id, saleId: sale.id, reason: 'venda_ja_possui_valores_financeiros', total: purchase.total, components: purchase.componentsTotal })
      continue
    }

    const expected = new Map()
    for (const type of ['Lente', 'Armacao', 'Tratamento']) {
      const sourceCode = purchase.sourceCodes[type]
      if (sourceCode && sourceCode !== '0') expected.set(`${type}|${sourceCode}`, purchase.values[type])
    }
    const items = itemsBySaleId.get(Number(sale.id)) || []
    const resolvedItems = new Map()
    let invalidItems = false
    for (const item of items) {
      const details = item.detalhes_avulsos && typeof item.detalhes_avulsos === 'object' ? item.detalhes_avulsos : {}
      const sourceType = text(details.source_product_type || item.item_tipo)
      const sourceCode = text(details.source_product_id)
      const key = `${sourceType}|${sourceCode}`
      if (!expected.has(key) || resolvedItems.has(key) || !equalMoney(item.quantidade, 1)) {
        invalidItems = true
        break
      }
      resolvedItems.set(key, item)
    }
    if (invalidItems) {
      summary.skipped.unexpectedItems += 1
      review.push({ purchaseId: purchase.id, saleId: sale.id, reason: 'itens_atuais_nao_correspondem_a_origem', total: purchase.total, components: purchase.componentsTotal })
      continue
    }
    if (resolvedItems.size !== expected.size || [...expected.keys()].some((key) => !resolvedItems.has(key))) {
      summary.skipped.missingOrMismatchedItems += 1
      review.push({ purchaseId: purchase.id, saleId: sale.id, reason: 'item_da_origem_ausente_ou_nao_resolvido', total: purchase.total, components: purchase.componentsTotal })
      continue
    }
    plans.push({ sale, purchase, items: [...resolvedItems.entries()].map(([key, item]) => ({ item, amount: expected.get(key) })) })
  }
  summary.readyToRecover = plans.length

  if (execute) {
    const chunks = []
    for (let index = 0; index < plans.length; index += batchSize) chunks.push(plans.slice(index, index + batchSize))
    const recoverBatch = async (batch) => {
      const saleUpdates = batch.map((plan) => ({ sale_id: Number(plan.sale.id), total: plan.purchase.total }))
      const itemUpdates = batch.flatMap((plan) => plan.items.map(({ item, amount }) => ({ item_id: Number(item.id), sale_id: Number(plan.sale.id), amount })))
      try {
        await client.query('BEGIN')
        const lockedSales = await client.query(
          `SELECT id FROM public.vendas
           WHERE id=ANY($1::bigint[]) AND valor_total=0 AND valor_final=0 AND valor_restante=0
           FOR UPDATE`,
          [saleUpdates.map((row) => row.sale_id)],
        )
        if (lockedSales.rowCount !== saleUpdates.length) throw new Error('Uma venda histórica mudou durante a recuperação.')
        const counts = await client.query(
          `SELECT venda_id, COUNT(*)::int AS item_count FROM public.venda_itens
           WHERE venda_id=ANY($1::bigint[]) GROUP BY venda_id`,
          [saleUpdates.map((row) => row.sale_id)],
        )
        const itemCountBySale = new Map(counts.rows.map((row) => [Number(row.venda_id), Number(row.item_count)]))
        if (batch.some((plan) => itemCountBySale.get(Number(plan.sale.id)) !== plan.items.length)) {
          throw new Error('Os itens de uma venda histórica mudaram durante a recuperação.')
        }
        const updatedItems = await client.query(
          `UPDATE public.venda_itens AS target
           SET valor_unitario = staged.amount, valor_total_item = staged.amount
           FROM jsonb_to_recordset($1::jsonb) AS staged(item_id bigint, sale_id bigint, amount numeric)
           WHERE target.id=staged.item_id AND target.venda_id=staged.sale_id
             AND target.valor_unitario=0 AND target.valor_total_item=0
           RETURNING target.id`,
          [JSON.stringify(itemUpdates)],
        )
        if (updatedItems.rowCount !== itemUpdates.length) throw new Error('Um item histórico mudou durante a recuperação.')
        const updatedSales = await client.query(
          `UPDATE public.vendas AS target
           SET valor_total=staged.total, valor_final=staged.total, valor_restante=0
           FROM jsonb_to_recordset($1::jsonb) AS staged(sale_id bigint, total numeric)
           WHERE target.id=staged.sale_id AND target.store_id=$2 AND target.is_historical_import=true AND target.import_source_system=$3
             AND target.valor_total=0 AND target.valor_final=0 AND target.valor_restante=0
           RETURNING target.id`,
          [JSON.stringify(saleUpdates), storeId, sourceSystem],
        )
        if (updatedSales.rowCount !== saleUpdates.length) throw new Error('Uma venda histórica mudou durante a recuperação.')
        await client.query('COMMIT')
        summary.recovered += saleUpdates.length
        summary.batches.committed += 1
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        if (batch.length > 1) {
          const midpoint = Math.ceil(batch.length / 2)
          await recoverBatch(batch.slice(0, midpoint))
          await recoverBatch(batch.slice(midpoint))
          return
        }
        const plan = batch[0]
        summary.batches.singleSaleSkippedAfterConflict += 1
        review.push({ purchaseId: plan.purchase.id, saleId: plan.sale.id, reason: `alterada_concorrentemente_${error.code || 'validacao'}`, total: plan.purchase.total, components: plan.purchase.componentsTotal })
      }
    }
    for (const batch of chunks) await recoverBatch(batch)
  }

  mkdirSync(outputDir, { recursive: true })
  const suffix = execute ? batchId : 'dry-run'
  const reportPath = resolve(outputDir, `ocular-optisis-financial-recovery-${suffix}.json`)
  const reviewPath = resolve(outputDir, `ocular-optisis-financial-recovery-${suffix}-review.csv`)
  writeFileSync(reportPath, `${JSON.stringify({ ...summary, generatedAt: new Date().toISOString(), sample: plans.slice(0, 10).map((plan) => ({ purchaseId: plan.purchase.id, saleId: plan.sale.id, total: plan.purchase.total, items: plan.items.map(({ item, amount }) => ({ itemId: item.id, type: item.item_tipo, amount })) })) }, null, 2)}\n`, 'utf8')
  writeFileSync(reviewPath, ['compra_optisis;venda_id;motivo;valor_total_origem;soma_componentes', ...review.map((row) => [row.purchaseId, row.saleId, row.reason, row.total, row.components].map(csv).join(';'))].join('\n') + '\n', 'utf8')
  console.log(JSON.stringify({ ...summary, reportPath, reviewPath }, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
