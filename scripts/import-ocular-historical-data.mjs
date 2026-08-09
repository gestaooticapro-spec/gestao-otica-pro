import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import JSZip from 'jszip'

const [customersPlanArg = 'tmp/ocular-customers-import-plan.json', salesPlanArg = 'tmp/ocular-historical-sales-import-plan.json', sourceDirArg = '.backupcharles/fechamento-sabado', productsArg = '.backupcharles/produtos_06-08-2026.xlsx', databaseUrlArg = process.env.LOCAL_SUPABASE_DB_URL, tenantId, storeIdArg, ...flags] = process.argv.slice(2)
const execute = flags.includes('--execute')
const productionMode = flags.includes('--production')
const productionConfirmed = flags.includes('--confirm-ocular-production-import')
const databaseUrl = databaseUrlArg === '--production-db' ? process.env.SUPABASE_DB_URL : databaseUrlArg
const storeId = Number(storeIdArg)
const sourceSystem = 'ocular-intermediate-spreadsheets'

if (!databaseUrl) throw new Error('Informe LOCAL_SUPABASE_DB_URL.')
const targetUrl = new URL(databaseUrl)
const isLocalDatabase = ['127.0.0.1', 'localhost', '::1'].includes(targetUrl.hostname)
if (!isLocalDatabase && !(productionMode && productionConfirmed && databaseUrlArg === '--production-db')) {
  throw new Error('Este importador aceita somente banco local. Produção exige --production-db --production --confirm-ocular-production-import.')
}
if (!tenantId || !Number.isInteger(storeId) || storeId <= 0) throw new Error('Uso: node scripts/import-ocular-historical-data.mjs <plano-clientes> <plano-vendas> <pasta-fontes> <produtos.xlsx> <db-local-url> <tenant-id> <store-id> [--execute]')

const customerPlan = JSON.parse(readFileSync(resolve(customersPlanArg), 'utf8'))
const salesPlan = JSON.parse(readFileSync(resolve(salesPlanArg), 'utf8'))
const sourceDir = resolve(sourceDirArg)

const windows1252Byte = { '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85, '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8a, '‹': 0x8b, 'Œ': 0x8c, 'Ž': 0x8e, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97, '˜': 0x98, '™': 0x99, 'š': 0x9a, '›': 0x9b, 'œ': 0x9c, 'ž': 0x9e, 'Ÿ': 0x9f }
const repairMojibake = (value = '') => {
  let repaired = String(value)
  for (let attempt = 0; attempt < 2 && /[ÃÂ]/.test(repaired); attempt += 1) {
    const candidate = Buffer.from([...repaired].map((character) => windows1252Byte[character] ?? character.charCodeAt(0))).toString('utf8')
    if (candidate.includes('�')) break
    repaired = candidate
  }
  return repaired
}
const text = (value) => repairMojibake(String(value ?? '')).trim()
const digits = (value) => text(value).replace(/\D/g, '')
const nameKey = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
const phoneKey = (value) => { const result = digits(value); return result.length >= 10 ? result : '' }
const date = (value) => { const raw = text(value); const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw); return match ? `${match[3]}-${match[2]}-${match[1]}` : (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null) }
const money = (value) => { const raw = text(value).replace(/^R\$\s*/i, ''); if (!raw) return 0; const parsed = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw); return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0 }
const quantity = (value) => { const raw = text(value).replace(/\./g, '').replace(',', '.'); if (!raw) return 0; const parsed = Number(raw); return Number.isFinite(parsed) ? Math.max(0, parsed) : 0 }
const columnIndex = (reference) => [...reference.replace(/\d+/g, '')].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 64, 0) - 1
const decodeXml = (value = '') => repairMojibake(value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex, decimal) => String.fromCodePoint(parseInt(hex || decimal, hex ? 16 : 10))))

async function readXlsx(filePath) {
  const zip = await JSZip.loadAsync(readFileSync(filePath))
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') || ''
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map(([, item]) => decodeXml([...item.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((match) => match[1]).join('')))
  const workbook = await zip.file('xl/workbook.xml').async('string')
  const relationships = await zip.file('xl/_rels/workbook.xml.rels').async('string')
  const relId = /<sheet[^>]*r:id="([^"]+)"/.exec(workbook)?.[1]
  const target = relId && new RegExp(`<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`).exec(relationships)?.[1]
  if (!target) throw new Error(`Primeira aba não encontrada em ${filePath}.`)
  const sheet = await zip.file(target.startsWith('xl/') ? target : `xl/${target.replace(/^\.\//, '')}`).async('string')
  const rows = [...sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].map(([, body]) => {
    const row = []
    for (const [, attributes, cell] of body.matchAll(/<c\s+([^>]*)>([\s\S]*?)<\/c>/g)) {
      const reference = /\br="([A-Z]+\d+)"/.exec(attributes)?.[1]
      if (!reference) continue
      const type = /\bt="([^"]+)"/.exec(attributes)?.[1]
      const raw = /<v>([\s\S]*?)<\/v>/.exec(cell)?.[1] || /<t[^>]*>([\s\S]*?)<\/t>/.exec(cell)?.[1] || ''
      row[columnIndex(reference)] = decodeXml(type === 's' ? shared[Number(raw)] || '' : raw).trim()
    }
    return row
  })
  const headers = rows[0] || []
  return rows.slice(1).filter((row) => row.some(Boolean)).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] || ''])))
}

const files = readdirSync(sourceDir)
const recipesFile = files.find((file) => /^Receitas.*\.xlsx$/i.test(file))
if (!recipesFile) throw new Error('Planilha de receitas não encontrada.')
const [products, recipes] = await Promise.all([readXlsx(resolve(productsArg)), readXlsx(join(sourceDir, recipesFile))])
// A planilha pode trazer a mesma referência mais de uma vez. Consolidamos
// antes do INSERT: maior preço; em empate, preferimos a maior quantidade
// positiva e o registro que controla estoque. Estoque negativo vira zero.
const productByReference = new Map()
for (const product of products) {
  const reference = text(product.Referência)
  if (!reference) continue
  const candidate = { ...product, _price: money(product['Preço de Venda']), _stock: quantity(product['Estoque Atual']), _controlsStock: /^sim$/i.test(text(product['Controla Estoque'])) }
  const current = productByReference.get(reference)
  if (!current || candidate._price > current._price || (candidate._price === current._price && (candidate._stock > current._stock || (candidate._stock === current._stock && candidate._controlsStock && !current._controlsStock)))) productByReference.set(reference, candidate)
}
const consolidatedProducts = [...productByReference.values()]
const recipeSnapshot = createHash('sha256').update(readFileSync(join(sourceDir, recipesFile))).digest('hex')
const summary = {
  mode: execute ? (productionMode ? 'execute-production' : 'execute-local') : 'dry-run', batchId: null,
  customers: { sourceReady: customerPlan.records.filter((record) => record.importStatus === 'ready').length, created: 0, createdFromHistoricalRecords: 0, linked: 0, skippedReview: customerPlan.records.filter((record) => record.importStatus !== 'ready').length },
  products: { source: products.length, consolidated: consolidatedProducts.length, duplicateRowsMerged: products.length - consolidatedProducts.length, created: 0, updatedExisting: 0, skippedNoName: 0 },
  prescriptions: { source: recipes.length, inserted: 0, skippedNoCustomer: 0, skippedInvalidIdentity: 0 },
  sales: { sourceReady: salesPlan.records.filter((record) => record.importStatus === 'ready').length, inserted: 0, existing: 0, skippedNoCustomer: 0, skippedInvalidIdentity: 0, installmentsInserted: 0, skippedReview: salesPlan.records.filter((record) => record.importStatus !== 'ready').length },
  excludedOrphanReceivables: salesPlan.orphanReceivables.length,
}
const unmatchedPrescriptions = []
const unmatchedSales = []
const skippedProducts = []
const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
if (!execute) { console.log(JSON.stringify(summary, null, 2)); process.exit(0) }

const { Client } = await import('pg')
const client = new Client({ connectionString: databaseUrl })
const batchId = randomUUID()
summary.batchId = batchId
await client.connect()

const add = (map, key, id) => { if (!key) return; const current = map.get(key) || new Set(); current.add(Number(id)); map.set(key, current) }
const only = (map, key) => { const values = [...(map.get(key) || [])]; return values.length === 1 ? values[0] : null }
const customerIdentity = (customer) => ({ cpf: digits(customer.cpf), name: nameKey(customer.name || customer.full_name), phone: phoneKey(customer.phone || customer.fone_movel) })

try {
  const targetStore = await client.query('SELECT id FROM public.stores WHERE id=$1 AND tenant_id=$2', [storeId, tenantId])
  if (targetStore.rowCount !== 1) throw new Error('Loja/tenant de destino não correspondem.')
  // Um Client do pg executa uma consulta por vez. Mantemos as leituras
  // sequenciais para não depender do comportamento concorrente do driver.
  const { rows: existingCustomers } = await client.query('SELECT id, full_name, cpf, phone, fone_movel FROM public.customers WHERE store_id=$1', [storeId])
  const { rows: existingReferences } = await client.query('SELECT source_customer_id, customer_id FROM public.customer_external_references WHERE store_id=$1 AND source_system=$2', [storeId, sourceSystem])
  const { rows: existingProducts } = await client.query('SELECT id, referencia, nome FROM public.products WHERE store_id=$1', [storeId])
  const { rows: existingSales } = await client.query('SELECT import_source_record_key FROM public.vendas WHERE store_id=$1 AND is_historical_import=true AND import_source_system=$2', [storeId, sourceSystem])
  const { rows: existingPrescriptions } = await client.query(
    'SELECT source_record_key FROM public.customer_prescription_history WHERE store_id=$1 AND source_system=$2 AND source_snapshot_sha256=$3',
    [storeId, sourceSystem, recipeSnapshot],
  )
  const byCpf = new Map(), byName = new Map(), byNamePhone = new Map(), referenceMap = new Map(existingReferences.map((row) => [row.source_customer_id, Number(row.customer_id)]))
  const indexCustomer = (customer) => { const identity = customerIdentity(customer); add(byCpf, identity.cpf, customer.id); add(byName, identity.name, customer.id); add(byNamePhone, `${identity.name}|${identity.phone}`, customer.id) }
  existingCustomers.forEach(indexCustomer)
  const resolveCustomer = (identity) => only(byCpf, digits(identity.cpf)) || only(byNamePhone, `${nameKey(identity.name)}|${phoneKey(identity.phone)}`) || only(byName, nameKey(identity.name))
  const hasCustomerCandidate = (identity) => {
    const cpf = byCpf.get(digits(identity.cpf))?.size || 0
    const namePhone = byNamePhone.get(`${nameKey(identity.name)}|${phoneKey(identity.phone)}`)?.size || 0
    const name = byName.get(nameKey(identity.name))?.size || 0
    return cpf > 0 || namePhone > 0 || name > 0
  }
  const isClearlyNotCustomer = (value) => /^(?:\d+ )?(?:ARMACAO|OCULOS(?: DE SOL)?|LENTE(?:S)?|SERVICO|TRATAMENTO)$/i.test(nameKey(value))
  const createHistoricalCustomer = async (identity, sourceCustomerId, sourceCustomerName, origin) => {
    const cpf = digits(identity.cpf)
    const phone = phoneKey(identity.phone)
    const fullName = text(identity.name)
    if ((!fullName && cpf.length !== 11) || isClearlyNotCustomer(fullName)) return null
    const existingReference = referenceMap.get(sourceCustomerId)
    if (existingReference) return existingReference
    if (cpf.length === 11) {
      const existingByCpf = await client.query(
        'SELECT id, full_name, cpf, phone, fone_movel FROM public.customers WHERE store_id=$1 AND cpf=$2 LIMIT 1',
        [storeId, cpf],
      )
      if (existingByCpf.rowCount === 1) {
        const customer = existingByCpf.rows[0]
        const customerId = Number(customer.id)
        await client.query(
          `INSERT INTO public.customer_external_references (tenant_id,store_id,customer_id,source_system,source_customer_id,source_customer_name,migration_batch_id,match_method)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'cpf_confirmed') ON CONFLICT (store_id,source_system,source_customer_id) DO NOTHING`,
          [tenantId, storeId, customerId, sourceSystem, sourceCustomerId, sourceCustomerName || fullName, batchId],
        )
        referenceMap.set(sourceCustomerId, customerId)
        indexCustomer(customer)
        return customerId
      }
    }
    const inserted = await client.query(
      `INSERT INTO public.customers (tenant_id,store_id,full_name,cpf,phone,fone_movel,notes)
       VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($5,''),$6) RETURNING id`,
      [tenantId, storeId, fullName || `Cliente histórico ${cpf}`, cpf.length === 11 ? cpf : '', phone, `Cadastro criado a partir de ${origin} importado; não constava com vínculo inequívoco na planilha de clientes.`],
    )
    const customerId = Number(inserted.rows[0].id)
    await client.query(
      `INSERT INTO public.customer_external_references (tenant_id,store_id,customer_id,source_system,source_customer_id,source_customer_name,migration_batch_id,match_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'created') ON CONFLICT (store_id,source_system,source_customer_id) DO NOTHING`,
      [tenantId, storeId, customerId, sourceSystem, sourceCustomerId, sourceCustomerName || fullName, batchId],
    )
    referenceMap.set(sourceCustomerId, customerId)
    indexCustomer({ id: customerId, full_name: fullName, cpf, phone })
    summary.customers.createdFromHistoricalRecords += 1
    return customerId
  }

  const readyCustomers = customerPlan.records.filter((item) => item.importStatus === 'ready')
  const customerBatchSize = productionMode ? 100 : readyCustomers.length
  for (let start = 0; start < readyCustomers.length; start += customerBatchSize) {
    await client.query('BEGIN')
    for (const record of readyCustomers.slice(start, start + customerBatchSize)) {
    let customerId = referenceMap.get(record.sourceRecordKey) || resolveCustomer(record)
    if (customerId) summary.customers.linked += 1
    else {
      const source = record.sourcePayload
      const inserted = await client.query(
        `INSERT INTO public.customers (tenant_id, store_id, full_name, cpf, phone, fone_movel, email, birth_date, rg, rua, numero, bairro, cidade, uf, cep, pai, mae, notes, created_at)
         VALUES ($1,$2,$3,NULLIF($4,''),NULLIF($5,''),NULLIF($5,''),NULLIF($6,''),NULLIF($7,'')::date,NULLIF($8,''),NULLIF($9,''),NULLIF($10,''),NULLIF($11,''),NULLIF($12,''),NULLIF($13,''),NULLIF($14,''),NULLIF($15,''),NULLIF($16,''),NULLIF($17,''),COALESCE(NULLIF($18,'')::date, CURRENT_DATE)) RETURNING id`,
        [tenantId, storeId, record.name, record.cpf || '', record.phone || '', source.Email, date(source['Data Nascimento']) || '', source.RG, source.Rua, source.Número, source.Bairro, source.Cidade, source.Estado, source.CEP, source['Nome do Pai'], source['Nome da Mãe'], source.Observação, date(source['Data do Cadastro']) || ''],
      )
      customerId = Number(inserted.rows[0].id)
      summary.customers.created += 1
    }
    await client.query(
      `INSERT INTO public.customer_external_references (tenant_id,store_id,customer_id,source_system,source_customer_id,source_customer_name,migration_batch_id,match_method)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (store_id,source_system,source_customer_id) DO NOTHING`,
      [tenantId, storeId, customerId, sourceSystem, record.sourceRecordKey, record.name, batchId, referenceMap.has(record.sourceRecordKey) ? 'manual' : (summary.customers.created ? 'created' : 'name_confirmed')],
    )
    referenceMap.set(record.sourceRecordKey, customerId)
    indexCustomer({ id: customerId, full_name: record.name, cpf: record.cpf, phone: record.phone })
    }
    await client.query('COMMIT')
  }

  const existingProductByRef = new Map(existingProducts.map((product) => [text(product.referencia), product]).filter(([reference]) => Boolean(reference)))
  const knownPrescriptionKeys = new Set(existingPrescriptions.map((record) => record.source_record_key))
  await client.query('BEGIN')
  for (const product of consolidatedProducts) {
    const reference = text(product.Referência)
    const name = text(product['Nome do Produto'])
    if (!name) {
      summary.products.skippedNoName += 1
      skippedProducts.push({ reference, category: text(product.Categoria), brand: text(product.Marca), price: product._price, stock: product._stock, reason: 'nome_do_produto_ausente' })
      continue
    }
    const category = text(product.Categoria)
    const normalizedCategory = nameKey(category)
    const type = normalizedCategory.includes('ARMA') ? 'Armacao'
      : normalizedCategory.includes('SOLAR') || normalizedCategory.includes('OCULOS DE SOL') ? 'Solar'
        : normalizedCategory.includes('TRATAMENTO') ? 'Tratamento'
          : normalizedCategory.includes('SERVI') || normalizedCategory.includes('ASSIST') || normalizedCategory.includes('LIMPEZA') ? 'Servico'
            : normalizedCategory.includes('LENTE') || normalizedCategory.includes('MONOFOCAL') || normalizedCategory.includes('MULTIFOCAL') || normalizedCategory.includes('BIFOCAL') ? 'Lente'
              : 'Outro'
    const existingProduct = existingProductByRef.get(reference)
    if (existingProduct) {
      await client.query(
        `UPDATE public.products
         SET nome=$1, tipo_produto=$2, categoria=NULLIF($3,''), marca=NULLIF($4,''), preco_custo=$5, preco_venda=$6, estoque_atual=$7, estoque_minimo=0, gerencia_estoque=$8, ncm=NULLIF($9,''), unidade_medida=NULLIF($10,''), supplier=NULLIF($11,'')
         WHERE id=$12 AND store_id=$13`,
        [name, type, category, product.Marca, money(product['Preço de Custo']), product._price, product._stock, product._controlsStock, product.NCM, text(product.Unidade) || 'UN', product.Fornecedor, existingProduct.id, storeId],
      )
      summary.products.updatedExisting += 1
      continue
    }
    await client.query(
      `INSERT INTO public.products (store_id,tenant_id,nome,referencia,tipo_produto,categoria,marca,preco_custo,preco_venda,estoque_atual,estoque_minimo,gerencia_estoque,ncm,unidade_medida,supplier)
       VALUES ($1,$2,$3,NULLIF($4,''),$5,NULLIF($6,''),NULLIF($7,''),$8,$9,$10,0,$11,NULLIF($12,''),NULLIF($13,''),NULLIF($14,''))`,
      [storeId, tenantId, name, reference, type, category, product.Marca, money(product['Preço de Custo']), product._price, product._stock, product._controlsStock, product.NCM, text(product.Unidade) || 'UN', product.Fornecedor],
    )
    existingProductByRef.set(reference, { referencia: reference, nome: name }); summary.products.created += 1
  }
  await client.query('COMMIT')

  await client.query('BEGIN')
  for (let index = 0; index < recipes.length; index += 1) {
    const recipe = recipes[index]
    const recordKey = `intermediate-prescription:${createHash('sha256').update(JSON.stringify(recipe)).update(String(index + 2)).digest('hex')}`
    if (knownPrescriptionKeys.has(recordKey)) continue
    const identity = { name: text(recipe['Nome do Cliente']), cpf: digits(recipe['CPF do Cliente']), phone: '' }
    let customerId = resolveCustomer(identity)
    if (!customerId && !hasCustomerCandidate(identity)) {
      const sourceCustomerId = `intermediate-prescription-customer:${createHash('sha256').update(`${identity.cpf}|${nameKey(identity.name)}`).digest('hex')}`
      customerId = await createHistoricalCustomer(identity, sourceCustomerId, identity.name, 'receita')
    }
    if (!customerId) {
      summary.prescriptions.skippedNoCustomer += 1
      if (!identity.name && !identity.cpf) summary.prescriptions.skippedInvalidIdentity += 1
      unmatchedPrescriptions.push({ row: index + 2, name: identity.name, cpf: identity.cpf, examDate: date(recipe['Data do Exame']) || '', reason: !identity.name && !identity.cpf ? 'sem_identidade_de_cliente' : (hasCustomerCandidate(identity) ? 'clientes_candidatos_ambiguos' : 'descricao_nao_e_cliente') })
      continue
    }
    const description = [text(recipe['Oftalmo/Opto']) && `Profissional: ${text(recipe['Oftalmo/Opto'])}`, text(recipe.Observação)].filter(Boolean).join(' — ')
    const inserted = await client.query(
      `INSERT INTO public.customer_prescription_history (tenant_id,store_id,customer_id,source_system,source_snapshot_sha256,source_record_key,source_customer_id,migration_batch_id,prescription_date,
        receita_longe_od_esferico,receita_longe_od_cilindrico,receita_longe_od_eixo,receita_longe_oe_esferico,receita_longe_oe_cilindrico,receita_longe_oe_eixo,
        receita_perto_od_esferico,receita_perto_od_cilindrico,receita_perto_od_eixo,receita_perto_oe_esferico,receita_perto_oe_cilindrico,receita_perto_oe_eixo,receita_adicao_od,receita_adicao_oe,service_description,source_payload)
       VALUES ($1,$2,$3,$4,$5,$6,NULLIF($7,''),$8,NULLIF($9,'')::date,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$22,NULLIF($23,''),$24::jsonb)
       ON CONFLICT (store_id,source_system,source_snapshot_sha256,source_record_key) DO NOTHING`,
      [tenantId, storeId, customerId, sourceSystem, recipeSnapshot, recordKey, identity.cpf || nameKey(identity.name), batchId, date(recipe['Data do Exame']) || '', recipe['OD Longe - Esferico'], recipe['OD Longe - Cilindrico'], recipe['OD Longe - Eixo'], recipe['OE Longe - Esferico'], recipe['OE Longe - Cilindrico'], recipe['OE Longe - Eixo'], recipe['OD Perto - Esferico'], recipe['OD Perto - Cilindrico'], recipe['OD Perto - Eixo'], recipe['OE Perto - Esferico'], recipe['OE Perto - Cilindrico'], recipe['OE Perto - Eixo'], recipe.Adição, description, JSON.stringify(recipe)],
    )
    summary.prescriptions.inserted += inserted.rowCount || 0
    knownPrescriptionKeys.add(recordKey)
  }
  await client.query('COMMIT')

  const knownSales = new Set(existingSales.map((sale) => sale.import_source_record_key))
  await client.query('BEGIN')
  for (const sale of salesPlan.records.filter((item) => item.importStatus === 'ready')) {
    if (knownSales.has(sale.sourceRecordKey)) { summary.sales.existing += 1; continue }
    let customerId = resolveCustomer(sale.customer)
    if (!customerId && !hasCustomerCandidate(sale.customer)) {
      const sourceCustomerId = `intermediate-sale-customer:${createHash('sha256').update(`${digits(sale.customer.cpf)}|${nameKey(sale.customer.name)}|${phoneKey(sale.customer.phone)}`).digest('hex')}`
      customerId = await createHistoricalCustomer(sale.customer, sourceCustomerId, sale.customer.name, `venda legada nº ${sale.legacySaleNumber}`)
    }
    if (!customerId) {
      summary.sales.skippedNoCustomer += 1
      if (!sale.customer.name && !sale.customer.cpf) summary.sales.skippedInvalidIdentity += 1
      unmatchedSales.push({ saleNumber: sale.legacySaleNumber, saleDate: sale.saleDate, name: sale.customer.name, cpf: sale.customer.cpf, phone: sale.customer.phone, value: sale.originalValue, reason: !sale.customer.name && !sale.customer.cpf ? 'sem_identidade_de_cliente' : (hasCustomerCandidate(sale.customer) ? 'clientes_candidatos_ambiguos' : 'descricao_nao_e_cliente') })
      continue
    }
    const note = `Histórico importado do sistema intermediário. Venda legada nº ${sale.legacySaleNumber}; vendedor: ${sale.seller || 'não informado'}; status original: ${sale.originalStatus}; itens vendidos não foram fornecidos pela origem.`
    const timestamp = `${sale.saleDate}T12:00:00-03:00`
    const insertedSale = await client.query(
      `INSERT INTO public.vendas (tenant_id,store_id,customer_id,valor_total,valor_desconto,valor_final,status,created_at,valor_restante,data_fechamento,obs_geral,is_historical_import,import_source_system,import_source_record_key,import_batch_id,historical_entry_amount)
       VALUES ($1,$2,$3,$4,0,$4,'Fechada',$5,$6,$5,$7,true,$8,$9,$10,$11) RETURNING id`,
      [tenantId, storeId, customerId, sale.originalValue, timestamp, sale.outstandingInstallmentsAmount, note, sourceSystem, sale.sourceRecordKey, batchId, sale.historicalEntryAmount],
    )
    const saleId = Number(insertedSale.rows[0].id)
    if (sale.installments.length) {
      const financing = await client.query(
        `INSERT INTO public.financiamento_loja (tenant_id,store_id,venda_id,customer_id,valor_total_financiado,quantidade_parcelas,data_inicio,obs)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
        [tenantId, storeId, saleId, customerId, sale.outstandingInstallmentsAmount, sale.installments.length, sale.installments.map((installment) => installment.dueDate).sort()[0], `Carnê importado. ${note}`],
      )
      const financingId = Number(financing.rows[0].id)
      await client.query('UPDATE public.vendas SET financiamento_id=$1 WHERE id=$2', [financingId, saleId])
      for (const installment of sale.installments) {
        await client.query(
          `INSERT INTO public.financiamento_parcelas (tenant_id,store_id,financiamento_id,numero_parcela,data_vencimento,valor_parcela,valor_pago,data_pagamento,status,customer_id,obs)
           VALUES ($1,$2,$3,$4,$5,$6,NULL,NULL,'Pendente',$7,$8)`,
          [tenantId, storeId, financingId, installment.number, installment.dueDate, installment.amount, customerId, `Importada: ${installment.description}`],
        )
        summary.sales.installmentsInserted += 1
      }
    }
    knownSales.add(sale.sourceRecordKey)
    summary.sales.inserted += 1
  }
  await client.query('COMMIT')

  const reportPath = resolve(`tmp/ocular-import-local-${batchId}.json`)
  const unmatchedSalesPath = resolve(`tmp/ocular-import-local-${batchId}-vendas-sem-cliente.csv`)
  const unmatchedPrescriptionsPath = resolve(`tmp/ocular-import-local-${batchId}-receitas-sem-cliente.csv`)
  const skippedProductsPath = resolve(`tmp/ocular-import-local-${batchId}-produtos-nao-importados.csv`)
  writeFileSync(unmatchedSalesPath, ['numero_venda;data;cliente;cpf;telefone;valor;motivo', ...unmatchedSales.map((item) => [item.saleNumber, item.saleDate, item.name, item.cpf, item.phone, item.value, item.reason].map(csvCell).join(';'))].join('\n'), 'utf8')
  writeFileSync(unmatchedPrescriptionsPath, ['linha;cliente;cpf;data_exame;motivo', ...unmatchedPrescriptions.map((item) => [item.row, item.name, item.cpf, item.examDate, item.reason].map(csvCell).join(';'))].join('\n'), 'utf8')
  writeFileSync(skippedProductsPath, ['referencia;categoria;marca;preco_venda;estoque_normalizado;motivo', ...skippedProducts.map((item) => [item.reference, item.category, item.brand, item.price, item.stock, item.reason].map(csvCell).join(';'))].join('\n'), 'utf8')
  writeFileSync(reportPath, `${JSON.stringify({ ...summary, completedAt: new Date().toISOString(), sourceHashes: { customers: customerPlan.sourceSha256, sales: salesPlan.snapshotSha256, recipes: recipeSnapshot } }, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...summary, reportPath, unmatchedSalesPath, unmatchedPrescriptionsPath, skippedProductsPath }, null, 2))
} catch (error) {
  await client.query('ROLLBACK').catch(() => undefined)
  throw error
} finally {
  await client.end()
}
